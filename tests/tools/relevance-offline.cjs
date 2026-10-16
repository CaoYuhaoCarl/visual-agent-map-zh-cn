#!/usr/bin/env node
// Development tool, not product code: offline test of AI relevance tiers (core / support / side) on real maps.
// Not bundled into main.js, no UI. See agents-spec/intents/relevance/INTENT.md (First step).
//
//   node tests/tools/relevance-offline.cjs run --map=<map dir> --vault=<vault root> --out=<runs dir> --slug=<slug>
//        [--runs=2] [--label-depth=2|all] [--model=sonnet] [--goal=<text>]
//        [--prompt=v1|v2] [--level=beginner|intermediate|familiar] [--context=<text>] [--hierarchy=count|reject]
//        v2 (default) sends level/context and rejects a reply that ranks a card above its parent (--hierarchy=reject,
//        default); v1 is the old prompt (no level/context) and only counts such violations.
//   node tests/tools/relevance-offline.cjs compare --out=<runs dir> --slug=<slug>
//   node tests/tools/relevance-offline.cjs compare --out=<runs dir> --review     (reads owner-review.md back)
//   node tests/tools/relevance-offline.cjs ab --out=<runs dir> --slugs=<a,b,...>  (writes ab.md; owner-review.md and
//        owner-review-key.json when herbs/grammar/cooking v1+v2 arms are present)
//   node tests/tools/relevance-offline.cjs apply --vault=<vault root> --map=<map dir> --out=<runs dir> --slug=<slug>
//        writes relevance-tier / relevance-reason into node notes and relevance-goal (+ relevance-level /
//        relevance-context when the run has them) into Map.md (those keys only).
//        Refuses the owner's live test vault (/private/tmp/vam-e2e-current) and anything under it.
//
// The vault is only read. Everything written (it contains note titles and summaries) goes to --out, which must
// not be inside this repository.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const TIERS = ['core', 'support', 'side'];
const TIER_ALIASES = {
  core: 'core', support: 'support', side: 'side',
  '必學': 'core', '需要時學': 'support', '可跳過': 'side',
  '1': 'core', '2': 'support', '3': 'side'
};
const SUMMARY_LIMIT = 240;
const TITLE_LIMIT = 200;
const STAMP_BELOW = 0.1;
const USELESS_ABOVE = 0.6;
const TOOL_DIR = path.join(__dirname, 'relevance-offline');
const LEVELS = ['beginner', 'intermediate', 'familiar'];
const CONTEXT_LIMIT = 200;
const PROMPT_FILES = { v1: 'prompt-v1.md', v2: 'prompt.md' };

// ---- parsing -------------------------------------------------------------------------------------------------

function parseMap(text) {
  const match = /```agent-map\s*\n([\s\S]*?)\n```/.exec(text);
  if (!match) throw new Error('Map.md has no agent-map block');
  const data = JSON.parse(match[1]);
  if (!data || !Array.isArray(data.nodes)) throw new Error('agent-map block has no nodes');
  return { title: String(data.title ?? ''), nodes: data.nodes.map(n => ({ id: n.id, path: n.path, parentId: n.parentId ?? null })) };
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const result = {};
  if (!match) return result;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    result[kv[1]] = value;
  }
  return result;
}

function clip(value, limit) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  const chars = [...text];
  return chars.length > limit ? `${chars.slice(0, limit - 1).join('')}…` : text;
}

// Equivalent of buildStructureReviewNodes (core/steps/structure-review/step.ts), without a scope root.
function buildNodes(nodes, describe) {
  const children = new Map();
  const ids = new Set(nodes.map(n => n.id));
  for (const node of nodes) {
    const key = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    children.set(key, [...(children.get(key) ?? []), node.id]);
  }
  const result = [];
  const seen = new Set();
  const visit = (id, parentId, depth) => {
    if (seen.has(id)) return;
    seen.add(id);
    const info = describe(id);
    result.push({
      id,
      title: clip(info?.title ?? '', TITLE_LIMIT),
      summary: clip(info?.summary ?? '', SUMMARY_LIMIT),
      status: info?.status ?? '',
      parentId,
      depth
    });
    for (const child of children.get(id) ?? []) visit(child, id, depth + 1);
  };
  for (const id of children.get(null) ?? []) visit(id, null, 0);
  return result;
}

function loadMap(mapDir, vaultRoot) {
  const map = parseMap(fs.readFileSync(path.join(mapDir, 'Map.md'), 'utf8'));
  const byId = new Map(map.nodes.map(n => [n.id, n]));
  const describe = id => {
    const node = byId.get(id);
    const file = path.join(vaultRoot, node.path);
    let fm = {};
    try {
      fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    } catch {
      /* missing note: fall back to the file name */
    }
    return { title: fm.title || path.basename(node.path, '.md'), summary: fm.summary || '', status: fm.status || '' };
  };
  return { title: map.title || path.basename(mapDir), tree: buildNodes(map.nodes, describe) };
}

// ---- validation of the model reply ---------------------------------------------------------------------------

function extractJson(text) {
  let body = String(text).trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(body);
  if (fence) body = fence[1].trim();
  return JSON.parse(body);
}

function gradedNodes(tree) {
  return tree.filter(n => n.depth > 0);
}

function fail(failureClass, message) {
  const error = new Error(message);
  error.failureClass = failureClass;
  return error;
}

// Strict: missing ids, extra ids, duplicates, bad tier or empty reason all throw. Nothing is coerced.
function validateReply(value, tree) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('not-object', 'reply is not an object');
  if (typeof value.goal !== 'string' || !value.goal.trim()) throw fail('goal', 'missing goal');
  if (!Array.isArray(value.items)) throw fail('items', 'items is not an array');
  const expected = new Set(gradedNodes(tree).map(n => n.id));
  const seen = new Set();
  const extra = [];
  for (const item of value.items) {
    if (!item || typeof item !== 'object') throw fail('item', 'item is not an object');
    if (typeof item.id !== 'string') throw fail('item', 'item without id');
    if (!expected.has(item.id)) extra.push(item.id);
    if (seen.has(item.id)) throw fail('duplicate', `duplicate id ${item.id}`);
    seen.add(item.id);
    if (!TIERS.includes(item.tier)) throw fail('bad-tier', `bad tier for ${item.id}: ${String(item.tier)}`);
    if (typeof item.reason !== 'string' || !item.reason.trim()) throw fail('empty-reason', `empty reason for ${item.id}`);
  }
  const missing = [...expected].filter(id => !seen.has(id));
  if (missing.length || extra.length)
    throw fail('id-mismatch', `id mismatch: ${missing.length} missing, ${extra.length} extra`);
  return value;
}

// A card must not rank above its parent (core > support > side). Only pairs whose parent is also graded count;
// top-level cards are context, not graded. Returns the violating children, parent before child order of the tree.
const TIER_RANK = { core: 0, support: 1, side: 2 };
function hierarchyViolations(items, tree) {
  const tierById = new Map(items.map(i => [i.id, i.tier]));
  const byId = new Map(tree.map(n => [n.id, n]));
  const result = [];
  for (const node of gradedNodes(tree)) {
    const parentTier = tierById.get(node.parentId);
    const childTier = tierById.get(node.id);
    if (!parentTier || !childTier) continue;
    if (TIER_RANK[childTier] < TIER_RANK[parentTier])
      result.push({
        child: node.id,
        childTitle: node.title,
        childTier,
        parent: node.parentId,
        parentTitle: byId.get(node.parentId)?.title ?? '',
        parentTier
      });
  }
  return result;
}

// Sibling groups among graded cards (cards sharing a graded-tree parent), size >= 2.
function siblingGroups(items, tree) {
  const tierById = new Map(items.map(i => [i.id, i.tier]));
  const byId = new Map(tree.map(n => [n.id, n]));
  const groups = new Map();
  for (const node of gradedNodes(tree)) {
    if (!tierById.has(node.id)) continue;
    groups.set(node.parentId, [...(groups.get(node.parentId) ?? []), node.id]);
  }
  const list = [];
  for (const [parentId, ids] of groups) {
    if (ids.length < 2) continue;
    const tiers = ids.map(id => tierById.get(id));
    list.push({
      parent: parentId,
      parentTitle: byId.get(parentId)?.title ?? '',
      size: ids.length,
      core: tiers.filter(t => t === 'core').length,
      allCore: tiers.every(t => t === 'core')
    });
  }
  return list;
}

function siblingMetrics(groups) {
  const share = groups.length ? groups.reduce((s, g) => s + g.core / g.size, 0) / groups.length : 0;
  const allCore3 = groups.filter(g => g.size >= 3 && g.allCore);
  return { groups: groups.length, meanCoreShare: share, allCoreGroups3: allCore3.length, allCoreTitles: allCore3.map(g => g.parentTitle) };
}

// Rough prompt size: ASCII ~4 chars per token, everything else ~1 token per character (conservative for CJK).
function estimateTokens(text) {
  let ascii = 0;
  let other = 0;
  for (const ch of String(text)) {
    if (ch.charCodeAt(0) < 128) ascii += 1;
    else other += 1;
  }
  return Math.ceil(ascii / 4 + other);
}

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

// ---- metrics -------------------------------------------------------------------------------------------------

function confusion(pairs) {
  const matrix = TIERS.map(() => TIERS.map(() => 0));
  for (const [a, b] of pairs) matrix[TIERS.indexOf(a)][TIERS.indexOf(b)] += 1;
  return matrix;
}

function agreement(pairs) {
  if (!pairs.length) return 0;
  return pairs.filter(([a, b]) => a === b).length / pairs.length;
}

function cohenKappa(pairs) {
  const n = pairs.length;
  if (!n) return 0;
  const po = agreement(pairs);
  const matrix = confusion(pairs);
  let pe = 0;
  for (let i = 0; i < TIERS.length; i += 1) {
    const rowSum = matrix[i].reduce((s, v) => s + v, 0);
    const colSum = matrix.reduce((s, row) => s + row[i], 0);
    pe += (rowSum / n) * (colSum / n);
  }
  if (pe >= 1) return po === 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

function tierDistribution(tiers) {
  const dist = { core: 0, support: 0, side: 0 };
  for (const tier of tiers) dist[tier] += 1;
  return dist;
}

function stability(itemsA, itemsB) {
  const b = new Map(itemsB.map(i => [i.id, i.tier]));
  const pairs = itemsA.filter(i => b.has(i.id)).map(i => [i.tier, b.get(i.id)]);
  return { n: pairs.length, agreement: agreement(pairs), kappa: cohenKappa(pairs), confusion: confusion(pairs) };
}

function parseTier(cell) {
  const key = String(cell).trim().toLowerCase();
  return TIER_ALIASES[key] ?? TIER_ALIASES[String(cell).trim()] ?? null;
}

// ---- labels.md -----------------------------------------------------------------------------------------------

const escapeCell = value => String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function splitRow(line) {
  const cells = [];
  let current = '';
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (line[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else current += line[i];
  }
  cells.push(current.trim());
  if (cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function renderLabels({ title, goal, items, tree, labelDepth }) {
  const byId = new Map(tree.map(n => [n.id, n]));
  const aiById = new Map(items.map(i => [i.id, i]));
  const rows = [];
  for (const node of tree) {
    if (node.depth === 0 || node.depth > labelDepth) continue;
    const ai = aiById.get(node.id);
    const indent = '　'.repeat(node.depth - 1);
    rows.push(`| ${node.id} | ${indent}${escapeCell(byId.get(node.id).title)} | ${ai.tier} | ${escapeCell(ai.reason)} | |`);
  }
  return [
    `# Relevance labels: ${title}`,
    '',
    `目標（可改寫，改了就以你的為準）: ${goal}`,
    '',
    '填表方式：在最後一欄「你的分級」寫 core（必學）、support（需要時學）或 side（可跳過），也可寫中文或 1/2/3。',
    '留空表示不標。第一欄的 id 請勿修改。「AI 分級」是第 1 次實跑的結果。',
    '',
    '| id | 節點（縮排表樹狀） | AI 分級 | AI 理由 | 你的分級 |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    ''
  ].join('\n');
}

function parseLabels(text) {
  const goalMatch = /^目標（[^）]*）:\s*(.*)$/m.exec(text);
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    if (cells.length < 5 || cells[0] === 'id' || /^-+$/.test(cells[0])) continue;
    const owner = cells[4].trim();
    rows.push({
      id: cells[0],
      title: cells[1].replace(/^　+/, ''),
      ai: cells[2],
      reason: cells[3],
      owner: owner ? parseTier(owner) : null,
      ownerRaw: owner
    });
  }
  return { goal: goalMatch ? goalMatch[1].trim() : '', rows };
}

function compareLabels(parsed) {
  const invalid = parsed.rows.filter(r => r.ownerRaw && !r.owner);
  const labeled = parsed.rows.filter(r => r.owner && TIERS.includes(r.ai));
  const pairs = labeled.map(r => [r.ai, r.owner]);
  const changed = labeled.filter(r => r.ai !== r.owner);
  const changeRatio = labeled.length ? changed.length / labeled.length : 0;
  let signal = 'ok';
  if (!labeled.length) signal = 'no-labels';
  else if (changeRatio < STAMP_BELOW) signal = 'rubber-stamp';
  else if (changeRatio > USELESS_ABOVE) signal = 'useless';
  const promotedSide = labeled.filter(r => r.ai === 'side' && r.owner === 'core').length;
  return {
    total: parsed.rows.length,
    labeled: labeled.length,
    invalid,
    agreement: agreement(pairs),
    kappa: cohenKappa(pairs),
    confusion: confusion(pairs),
    changed,
    changeRatio,
    signal,
    promotedSide
  };
}

function renderMatrix(matrix, rowName, colName) {
  const lines = [`| ${rowName} \\ ${colName} | ${TIERS.join(' | ')} |`, `| --- | ${TIERS.map(() => '---').join(' | ')} |`];
  TIERS.forEach((tier, i) => lines.push(`| ${tier} | ${matrix[i].join(' | ')} |`));
  return lines.join('\n');
}

const pct = v => `${(v * 100).toFixed(1)}%`;
const SIGNAL_TEXT = {
  ok: '改動比例落在 10%–60%：沒有踩到 intent 的失敗訊號。',
  'rubber-stamp': `改動比例低於 ${STAMP_BELOW * 100}%：接近蓋章，intent 的失敗訊號。`,
  useless: `改動比例高於 ${USELESS_ABOVE * 100}%：分級幾乎全改，接近無用，intent 的失敗訊號。`,
  'no-labels': '沒有任何有效標註。'
};

function renderCompare({ title, goal, result }) {
  return [
    `# Relevance compare: ${title}`,
    '',
    `目標: ${goal}`,
    '',
    `- 已標註: ${result.labeled} / ${result.total}`,
    `- 一致率（AI vs 你）: ${pct(result.agreement)}`,
    `- Cohen's kappa: ${result.kappa.toFixed(3)}`,
    `- 你改動的比例: ${pct(result.changeRatio)}（${result.changed.length} 項）`,
    `- 旁支被你升為核心: ${result.promotedSide} 項`,
    `- 訊號: ${SIGNAL_TEXT[result.signal]}`,
    result.invalid.length ? `- 無法辨識的標註: ${result.invalid.map(r => r.id).join(', ')}` : '',
    '',
    '## Confusion（列 = AI，欄 = 你）',
    '',
    renderMatrix(result.confusion, 'AI', '你'),
    '',
    '## 你改動的項目',
    '',
    '| 節點 | AI | 你 | AI 理由 |',
    '| --- | --- | --- | --- |',
    ...result.changed.map(r => `| ${escapeCell(r.title)} | ${r.ai} | ${r.owner} | ${escapeCell(r.reason)} |`),
    ''
  ]
    .filter(line => line !== '')
    .join('\n');
}

// ---- AI call -------------------------------------------------------------------------------------------------

function callClaude(prompt, model) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'relevance-offline-'));
  const proc = spawnSync(
    'claude',
    ['-p', '--model', model, '--output-format', 'json', '--tools', '', '--no-session-persistence'],
    { input: prompt, cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 }
  );
  fs.rmSync(cwd, { recursive: true, force: true });
  if (proc.status !== 0) throw new Error(`claude exited ${proc.status}: ${(proc.stderr || proc.stdout || '').slice(0, 300)}`);
  const envelope = JSON.parse(proc.stdout);
  if (envelope.is_error) throw new Error(`claude error: ${String(envelope.result).slice(0, 300)}`);
  return { text: String(envelope.result ?? ''), usage: envelope.usage ?? null, cost: envelope.total_cost_usd ?? null };
}

function fill(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (all, key) => (key in values ? values[key] : all));
}

function draftGoal(title, model) {
  const prompt = fill(fs.readFileSync(path.join(TOOL_DIR, 'goal.md'), 'utf8'), { TITLE: title });
  const reply = callClaude(prompt, model);
  const goal = extractJson(reply.text).goal;
  if (typeof goal !== 'string' || !goal.trim()) throw new Error('goal draft is empty');
  return goal.trim();
}

function normalizeLevel(level) {
  if (level === undefined || level === null || level === '' || level === true) return null;
  if (!LEVELS.includes(level)) throw new Error(`--level must be one of ${LEVELS.join(', ')}`);
  return level;
}

function normalizeContext(context) {
  if (context === undefined || context === null || context === '' || context === true) return null;
  return [...String(context).replace(/\s+/g, ' ').trim()].slice(0, CONTEXT_LIMIT).join('') || null;
}

function promptPath(version) {
  const file = PROMPT_FILES[version];
  if (!file) throw new Error('--prompt must be v1 or v2');
  return path.join(TOOL_DIR, file);
}

function promptVersionLabel(version) {
  return `${version}:${sha256(fs.readFileSync(promptPath(version), 'utf8')).slice(0, 12)}`;
}

function nodesForPrompt(tree) {
  return tree.map(({ id, title, summary, status, parentId, depth }) => ({ id, title, summary, status, parentId, depth }));
}

// v1 puts the raw goal in the prompt and knows no level or context; v2 sends all three as JSON strings (or null).
function buildPrompt({ version, goal, level, context, tree }) {
  const template = fs.readFileSync(promptPath(version), 'utf8');
  const nodes = JSON.stringify(nodesForPrompt(tree));
  if (version === 'v1') return fill(template, { GOAL: goal, NODES: nodes });
  return fill(template, {
    GOAL: JSON.stringify(goal),
    LEVEL: level ? JSON.stringify(level) : 'null',
    CONTEXT: context ? JSON.stringify(context) : 'null',
    NODES: nodes
  });
}

function classifyFailure(error) {
  return error.failureClass || (error instanceof SyntaxError ? 'json' : 'call');
}

// Builds the one repair prompt: the original prompt, the first reply and every violating pair.
function buildRepairPrompt({ prompt, value, violations }) {
  const template = fs.readFileSync(path.join(TOOL_DIR, 'repair.md'), 'utf8');
  const pairs = violations.map(v => ({ childId: v.child, childTier: v.childTier, parentId: v.parent, parentTier: v.parentTier }));
  return fill(template, { PROMPT: prompt, PREVIOUS: JSON.stringify(value), VIOLATIONS: JSON.stringify(pairs) });
}

function parseReply(text, tree) {
  try {
    return validateReply(extractJson(text), tree);
  } catch (error) {
    error.failureClass = classifyFailure(error);
    throw error;
  }
}

const sumOrNull = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a + b : (a ?? b ?? null));

// One attempt. Throws an error carrying failureClass (and violations for a hierarchy rejection). Under
// --hierarchy=reject a reply that is complete and valid except for parent-child violations gets ONE repair round
// (as in the plugin): the repair reply goes through the same strict checks, and if it still violates, or breaks
// anything else, the attempt fails. Any other failure of the first reply fails at once. `repair` records it.
// `call` is injectable for tests.
function classify({ version, goal, level, context, tree, model, hierarchy, call = callClaude }) {
  const prompt = buildPrompt({ version, goal, level, context, tree });
  const reply = call(prompt, model);
  const value = parseReply(reply.text, tree);
  const violations = hierarchyViolations(value.items, tree);
  if (hierarchy !== 'reject' || !violations.length) return { value, usage: reply.usage, cost: reply.cost, violations, repair: null };
  const repair = { attempted: true, firstViolations: violations.length, ok: false, failureClass: null, violations: null };
  let repaired;
  let second;
  try {
    second = call(buildRepairPrompt({ prompt, value, violations }), model);
    repaired = parseReply(second.text, tree);
  } catch (error) {
    repair.failureClass = classifyFailure(error);
    error.repair = repair;
    error.failureClass = 'hierarchy';
    error.violations = violations;
    throw error;
  }
  const after = hierarchyViolations(repaired.items, tree);
  if (after.length) {
    repair.failureClass = 'hierarchy';
    repair.violations = after.length;
    const error = fail('hierarchy', `${after.length} cards still rank above their parent after repair (first: ${after[0].child})`);
    error.violations = violations;
    error.repair = repair;
    throw error;
  }
  repair.ok = true;
  return {
    value: repaired,
    usage: reply.usage && second.usage ? { first: reply.usage, repair: second.usage } : (reply.usage ?? second.usage),
    cost: sumOrNull(reply.cost, second.cost),
    violations: after,
    repair,
    firstViolationList: violations
  };
}

// ---- commands ------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    options[key] = rest.length ? rest.join('=') : true;
  }
  return options;
}

function assertOutsideRepo(out) {
  const repo = path.resolve(__dirname, '..', '..');
  const resolved = path.resolve(out);
  if (resolved === repo || resolved.startsWith(repo + path.sep))
    throw new Error('--out must not be inside the product repository (outputs contain private note text)');
}

function runCommand(options) {
  const { map, vault, out, slug } = options;
  if (!map || !vault || !out || !slug) throw new Error('run needs --map --vault --out --slug');
  assertOutsideRepo(out);
  const model = options.model || 'sonnet';
  const runs = Number(options.runs || 2);
  const version = options.prompt || 'v2';
  promptPath(version);
  const hierarchy = options.hierarchy || 'reject';
  if (!['count', 'reject'].includes(hierarchy)) throw new Error('--hierarchy must be count or reject');
  // v1 never sees level or context.
  const level = version === 'v1' ? null : normalizeLevel(options.level);
  const context = version === 'v1' ? null : normalizeContext(options.context);
  const labelDepth = !options['label-depth'] || options['label-depth'] === 'all' ? Infinity : Number(options['label-depth']);
  const { title, tree } = loadMap(map, vault);
  const dir = path.join(out, slug);
  fs.mkdirSync(dir, { recursive: true });

  const inputHash = sha256(JSON.stringify(nodesForPrompt(tree)));
  const promptVersion = promptVersionLabel(version);
  const goal = options.goal || draftGoal(title, model);
  const promptTokens = estimateTokens(buildPrompt({ version, goal, level, context, tree }));
  const results = [];
  const failures = [];
  const failedRuns = [];
  const allAttempts = [];
  for (let i = 1; i <= runs; i += 1) {
    let outcome = null;
    const attempts = [];
    for (let attempt = 1; attempt <= 2 && !outcome; attempt += 1) {
      try {
        outcome = classify({ version, goal, level, context, tree, model, hierarchy });
        attempts.push({
          attempt, ok: true, failureClass: null,
          violations: outcome.firstViolationList ?? outcome.violations, repair: outcome.repair
        });
      } catch (error) {
        const failureClass = classifyFailure(error);
        attempts.push({ attempt, ok: false, failureClass, violations: error.violations ?? null, repair: error.repair ?? null, error: error.message });
        failures.push({ run: i, attempt, failureClass, error: error.message });
      }
    }
    allAttempts.push(...attempts);
    const firstAttempt = attempts[0];
    if (!outcome) {
      failedRuns.push(i);
      fs.writeFileSync(path.join(dir, `run-${i}.failed.json`), JSON.stringify({ goal, attempts }, null, 2));
      continue;
    }
    const groups = siblingGroups(outcome.value.items, tree);
    const record = {
      map: title, model, goal, level, context, promptVersion, hierarchy, inputHash, nodes: tree.length,
      graded: gradedNodes(tree).length, promptTokensEstimate: promptTokens, ...outcome.value, attempts,
      firstAttempt: { ok: firstAttempt.ok, failureClass: firstAttempt.failureClass, violations: firstAttempt.violations },
      parentChildViolations: outcome.violations, siblingGroups: groups, usage: outcome.usage, costUsd: outcome.cost
    };
    fs.writeFileSync(path.join(dir, `run-${i}.json`), JSON.stringify(record, null, 2));
    results.push(record);
  }

  const summary = {
    map: title, slug, goal, level, context, promptVersion, hierarchy, inputHash, nodes: tree.length,
    graded: gradedNodes(tree).length, promptTokensEstimate: promptTokens, runsRequested: runs, runsAccepted: results.length,
    failedRuns, failures
  };
  // Repair rounds (one per attempt at most, only under --hierarchy=reject), counted over every attempt of every run.
  const repairs = allAttempts.map(a => a.repair).filter(Boolean);
  summary.repairs = {
    attempted: repairs.length,
    succeeded: repairs.filter(r => r.ok).length,
    failed: repairs.filter(r => !r.ok).length,
    firstViolations: repairs.map(r => r.firstViolations)
  };
  if (results.length) {
    summary.distribution = results.map(r => tierDistribution(r.items.map(i => i.tier)));
    summary.siblingGroups = results.map(r => siblingMetrics(r.siblingGroups));
    summary.parentChildViolations = results.map(r => r.parentChildViolations.length);
    summary.firstAttemptViolations = results.map(r => (r.firstAttempt.violations ? r.firstAttempt.violations.length : null));
    fs.writeFileSync(path.join(dir, 'labels.md'), renderLabels({ title, goal, items: results[0].items, tree, labelDepth }));
  }
  if (results.length >= 2) summary.stability = stability(results[0].items, results[1].items);
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length && results.length < runs) process.exitCode = 3;
}

function compareCommand(options) {
  const { out, slug } = options;
  if (!out || !slug) throw new Error('compare needs --out --slug');
  const dir = path.join(out, slug);
  const parsed = parseLabels(fs.readFileSync(path.join(dir, 'labels.md'), 'utf8'));
  const title = (/^# Relevance labels:\s*(.*)$/m.exec(fs.readFileSync(path.join(dir, 'labels.md'), 'utf8')) || [])[1] || slug;
  const result = compareLabels(parsed);
  fs.writeFileSync(path.join(dir, 'compare.md'), renderCompare({ title, goal: parsed.goal, result }));
  process.stdout.write(`${slug}: labeled ${result.labeled}/${result.total}, agreement ${pct(result.agreement)}, kappa ${result.kappa.toFixed(3)}, changed ${pct(result.changeRatio)} (${result.signal})\n`);
}

// ---- apply ---------------------------------------------------------------------------------------------------

const PROTECTED_VAULT = '/private/tmp/vam-e2e-current';

function assertWritable(target) {
  const forms = new Set([path.resolve(target)]);
  try {
    forms.add(fs.realpathSync(target));
  } catch {
    /* not existing yet: the resolved form is enough */
  }
  for (const form of forms)
    if (form === PROTECTED_VAULT || form.startsWith(PROTECTED_VAULT + path.sep))
      throw new Error(`refusing to write ${PROTECTED_VAULT}`);
}

// Sets exactly the given top-level keys in a note's frontmatter and leaves every other line untouched. Values are
// written as JSON strings, which are valid YAML double-quoted scalars.
function setFrontmatterKeys(text, values) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = Object.entries(values).map(([key, value]) => `${key}: ${JSON.stringify(String(value))}`);
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/.exec(text);
  if (!match) return `---${eol}${lines.join(eol)}${eol}---${eol}${text}`;
  const keep = [];
  let skipping = false;
  for (const line of match[1].split(/\r?\n/)) {
    const key = /^([A-Za-z][\w-]*):/.exec(line)?.[1];
    if (key) skipping = key in values;
    else if (skipping && !/^\s+/.test(line) && line !== '') skipping = false;
    if (!skipping) keep.push(line);
  }
  const body = [...keep, ...lines].join(eol);
  return `---${eol}${body}${eol}---${text.slice(match[0].length)}`;
}

function applyRun({ vault, mapDir, record }) {
  assertWritable(vault);
  assertWritable(mapDir);
  const mapFile = path.join(mapDir, 'Map.md');
  const map = parseMap(fs.readFileSync(mapFile, 'utf8'));
  const pathById = new Map(map.nodes.map(n => [n.id, n.path]));
  const writes = [];
  for (const item of record.items) {
    const rel = pathById.get(item.id);
    if (!rel) throw new Error(`run item ${item.id} is not in Map.md`);
    if (!TIERS.includes(item.tier) || typeof item.reason !== 'string' || !item.reason.trim())
      throw new Error(`run item ${item.id} has no valid tier or reason`);
    const file = path.join(vault, rel);
    assertWritable(file);
    writes.push([file, { 'relevance-tier': item.tier, 'relevance-reason': clip(item.reason, 400) }]);
  }
  if (typeof record.goal !== 'string' || !record.goal.trim()) throw new Error('run has no goal');
  const mapValues = { 'relevance-goal': clip(record.goal, 400) };
  if (LEVELS.includes(record.level)) mapValues['relevance-level'] = record.level;
  const context = normalizeContext(record.context);
  if (context) mapValues['relevance-context'] = context;
  writes.push([mapFile, mapValues]);
  for (const [file, values] of writes) fs.writeFileSync(file, setFrontmatterKeys(fs.readFileSync(file, 'utf8'), values));
  return writes.length;
}

function applyCommand(options) {
  const { vault, map, out, slug } = options;
  if (!vault || !map || !out || !slug) throw new Error('apply needs --vault --map --out --slug');
  const record = JSON.parse(fs.readFileSync(path.join(out, slug, 'run-1.json'), 'utf8'));
  const count = applyRun({ vault, mapDir: map, record });
  process.stdout.write(`${slug}: wrote relevance to ${count} files (${count - 1} notes + Map.md)\n`);
}

// ---- A/B report ----------------------------------------------------------------------------------------------

const ARM_ORDER = ['v1', 'v2', 'v2-nolevel'];

function armOf(slug) {
  const match = /^(.*)-(v1|v2-nolevel|v2)$/.exec(slug);
  return match ? { map: match[1], arm: match[2] } : { map: slug, arm: '' };
}

function loadArm(out, slug) {
  const dir = path.join(out, slug);
  const summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  const runs = [];
  for (let i = 1; i <= (summary.runsRequested || 2); i += 1) {
    const file = path.join(dir, `run-${i}.json`);
    if (fs.existsSync(file)) runs.push(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  const failed = [];
  for (let i = 1; i <= (summary.runsRequested || 2); i += 1) {
    const file = path.join(dir, `run-${i}.failed.json`);
    if (fs.existsSync(file)) failed.push(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return { slug, summary, runs, failed };
}

const mean = values => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

// Per arm numbers used by both the report and the gates.
function armStats(arm) {
  const { runs, summary } = arm;
  const graded = summary.graded || 0;
  const perRun = runs.map(r => {
    const dist = tierDistribution(r.items.map(i => i.tier));
    const sib = siblingMetrics(r.siblingGroups || []);
    return {
      dist,
      share: graded ? { core: dist.core / graded, support: dist.support / graded, side: dist.side / graded } : { core: 0, support: 0, side: 0 },
      sibling: sib,
      violations: (r.parentChildViolations || []).length,
      firstAttempt: r.firstAttempt || null
    };
  });
  const stab = runs.length >= 2 ? stability(runs[0].items, runs[1].items) : null;
  return {
    slug: arm.slug,
    graded,
    accepted: runs.length,
    requested: summary.runsRequested || 2,
    perRun,
    stability: stab,
    meanCoreShare: mean(perRun.map(p => p.share.core)),
    meanSideShare: mean(perRun.map(p => p.share.side)),
    meanSiblingShare: mean(perRun.map(p => p.sibling.meanCoreShare)),
    meanAllCore3: mean(perRun.map(p => p.sibling.allCoreGroups3)),
    firstAttemptViolations: perRun.map(p => (p.firstAttempt && p.firstAttempt.violations ? p.firstAttempt.violations.length : null)),
    failureClasses: (summary.failures || []).map(f => f.failureClass),
    promptTokens: summary.promptTokensEstimate,
    usage: arm.runs.map(r => r.usage),
    inputHash: summary.inputHash,
    promptVersion: summary.promptVersion
  };
}

function gate(id, pass, detail) {
  return { id, pass, detail };
}

// Gates P1-P5 of the Phase 4 plan, v2 against v1. `stats` is {map: {v1, v2, 'v2-nolevel'}} of armStats.
function evaluateGates(stats) {
  const maps = Object.keys(stats);
  const gates = [];
  const need = (map, arm) => stats[map] && stats[map][arm];

  const v2Arms = maps.map(m => need(m, 'v2')).filter(Boolean);
  const v2Runs = v2Arms.reduce((s, a) => s + a.accepted, 0);
  const v2Requested = v2Arms.reduce((s, a) => s + a.requested, 0);
  const firstViolations = v2Arms.flatMap(a => a.firstAttemptViolations);
  const p1 = v2Arms.length > 0 && v2Runs === v2Requested && firstViolations.every(v => v === 0);
  gates.push(gate('P1', p1, `v2 accepted ${v2Runs}/${v2Requested}; first-attempt violations per run: ${v2Arms.map(a => `${a.slug}=[${a.firstAttemptViolations.join(',')}]`).join(' ')}`));

  const p2parts = maps.filter(m => need(m, 'v1') && need(m, 'v2')).map(m => {
    const v1 = stats[m].v1.stability;
    const v2 = stats[m].v2.stability;
    const tolerance = stats[m].v1.graded <= 20 ? 0.067 : 0.05;
    const ok = !!v1 && !!v2 && v2.agreement >= v1.agreement - tolerance && v2.kappa >= 0.6;
    return { m, ok, text: `${m}: v1 agr ${v1 ? pct(v1.agreement) : 'n/a'} / v2 agr ${v2 ? pct(v2.agreement) : 'n/a'} (tol ${tolerance}), v2 kappa ${v2 ? v2.kappa.toFixed(3) : 'n/a'}` };
  });
  gates.push(gate('P2', p2parts.length > 0 && p2parts.every(p => p.ok), p2parts.map(p => `${p.ok ? 'ok' : 'FAIL'} ${p.text}`).join('; ')));

  const parts3 = [];
  let p3 = true;
  if (need('grammar', 'v1') && need('grammar', 'v2')) {
    const drop = stats.grammar.v1.meanCoreShare - stats.grammar.v2.meanCoreShare;
    const ok = drop >= 0.1 - 1e-9;
    p3 = p3 && ok;
    parts3.push(`${ok ? 'ok' : 'FAIL'} grammar core share v1 ${pct(stats.grammar.v1.meanCoreShare)} -> v2 ${pct(stats.grammar.v2.meanCoreShare)} (drop ${(drop * 100).toFixed(1)} pts)`);
  } else p3 = false;
  for (const m of ['grammar', 'cooking']) {
    if (need(m, 'v1') && need(m, 'v2')) {
      const a = stats[m].v1.meanAllCore3;
      const b = stats[m].v2.meanAllCore3;
      const ok = (a === 0 && b === 0) || b < a;
      p3 = p3 && ok;
      parts3.push(`${ok ? 'ok' : 'FAIL'} ${m} all-core groups>=3 v1 ${a.toFixed(1)} -> v2 ${b.toFixed(1)}`);
    } else p3 = false;
  }
  gates.push(gate('P3', p3, parts3.join('; ')));

  const parts4 = [];
  let p4 = true;
  if (need('herbs', 'v2')) {
    const sides = stats.herbs.v2.perRun.map(p => p.dist.side);
    const ok = sides.length > 0 && sides.every(n => n >= 1);
    p4 = p4 && ok;
    parts4.push(`${ok ? 'ok' : 'FAIL'} herbs v2 side count per run [${sides.join(',')}]`);
  } else p4 = false;
  for (const m of ['grammar', 'cooking']) {
    if (need(m, 'v2')) {
      const shares = stats[m].v2.perRun.map(p => p.share.side);
      const ok = shares.length > 0 && shares.every(v => v >= 0.05);
      p4 = p4 && ok;
      parts4.push(`${ok ? 'ok' : 'FAIL'} ${m} v2 side share per run [${shares.map(pct).join(',')}]`);
    } else p4 = false;
  }
  gates.push(gate('P4', p4, parts4.join('; ')));

  // P5: exact once, non-empty reason, same language and one sentence are checked by hand against owner-review; the
  // mechanical part (strict validation already guarantees exact-once and non-empty) plus the cooking token bound.
  const cook = need('cooking', 'v2');
  const tokenOk = !!cook && cook.promptTokens < 32000;
  const accepted = v2Arms.every(a => a.accepted === a.requested);
  gates.push(gate('P5', tokenOk && accepted, `strict validation passed for every accepted v2 run (${accepted ? 'yes' : 'no'}); cooking v2 prompt tokens ~${cook ? cook.promptTokens : 'n/a'} (< 32000)`));
  return gates;
}

function renderArm(st) {
  const lines = [];
  lines.push(`#### ${st.slug}`);
  lines.push('');
  lines.push(`- 接受 ${st.accepted}/${st.requested} 次；graded ${st.graded}；prompt ${st.promptVersion}；inputHash ${String(st.inputHash).slice(0, 12)}；估計 prompt token ${st.promptTokens}`);
  const tokens = st.usage.filter(Boolean).map(u => `in ${u.input_tokens ?? '?'}+cache ${(u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)} / out ${u.output_tokens ?? '?'}`);
  if (tokens.length) lines.push(`- 實際 usage（每次）: ${tokens.join(' | ')}`);
  lines.push(`- 首次嘗試失敗類別: ${st.failureClasses.length ? st.failureClasses.join(', ') : '無'}；首次嘗試上下層違規（每次）: ${st.firstAttemptViolations.map(v => (v === null ? 'n/a' : v)).join(', ') || 'n/a'}`);
  lines.push('');
  lines.push('| run | core | support | side | 同層組(>=2) | 同層 core 平均占比 | 全 core 組(>=3) | 上下層違規(接受的) |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  st.perRun.forEach((p, i) => {
    const d = p.dist;
    lines.push(`| ${i + 1} | ${d.core} (${pct(p.share.core)}) | ${d.support} (${pct(p.share.support)}) | ${d.side} (${pct(p.share.side)}) | ${p.sibling.groups} | ${pct(p.sibling.meanCoreShare)} | ${p.sibling.allCoreGroups3} | ${p.violations} |`);
  });
  if (st.stability) lines.push(`\n兩次 agreement ${pct(st.stability.agreement)}，kappa ${st.stability.kappa.toFixed(3)}（n=${st.stability.n}）`);
  st.perRun.forEach((p, i) => {
    if (p.sibling.allCoreTitles.length) lines.push(`\nrun ${i + 1} 全 core 組（父卡）: ${p.sibling.allCoreTitles.join('；')}`);
  });
  lines.push('');
  return lines.join('\n');
}

function renderAb(stats, gates) {
  const lines = ['# Relevance Phase 4 A/B', '', '## Gates（v2 對 v1）', '', '| gate | 結果 | 數據 |', '| --- | --- | --- |'];
  for (const g of gates) lines.push(`| ${g.id} | ${g.pass ? 'PASS' : 'FAIL'} | ${escapeCell(g.detail)} |`);
  lines.push('', `整體: ${gates.every(g => g.pass) ? 'ALL PASS' : 'FAIL（停下，不改 prompt）'}`, '');
  lines.push('P5 另有人工部分：理由為地圖語言、單句；見 owner-review 與抽樣。', '');
  for (const map of Object.keys(stats)) {
    lines.push(`## ${map}`, '');
    for (const arm of ARM_ORDER) if (stats[map][arm]) lines.push(renderArm(stats[map][arm]));
  }
  return lines.join('\n');
}

function abCommand(options) {
  const { out, slugs } = options;
  if (!out || !slugs) throw new Error('ab needs --out --slugs');
  const stats = {};
  for (const slug of String(slugs).split(',').map(x => x.trim()).filter(Boolean)) {
    const { map, arm } = armOf(slug);
    if (!arm) throw new Error(`slug ${slug} must end with -v1, -v2 or -v2-nolevel`);
    (stats[map] ||= {})[arm] = armStats(loadArm(out, slug));
  }
  const gates = evaluateGates(stats);
  fs.writeFileSync(path.join(out, 'ab.md'), renderAb(stats, gates));
  for (const g of gates) process.stdout.write(`${g.id} ${g.pass ? 'PASS' : 'FAIL'}: ${g.detail}\n`);
  const reviewMaps = ['herbs', 'grammar', 'cooking'].filter(m => stats[m] && stats[m].v1 && stats[m].v2);
  if (reviewMaps.length === 3) writeOwnerReview(out);
}

// ---- owner review (blind) ------------------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text) {
  return parseInt(sha256(text).slice(0, 8), 16);
}

function shuffle(list, rand) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Picks `count` ids, preferring cards whose v1 and v2 run-1 tiers differ; tops up with a seeded random choice.
function pickReviewCards(v1Items, v2Items, count, seed) {
  const v2 = new Map(v2Items.map(i => [i.id, i]));
  const rand = mulberry32(seed);
  const both = v1Items.filter(i => v2.has(i.id));
  const differing = shuffle(both.filter(i => i.tier !== v2.get(i.id).tier), rand);
  const same = shuffle(both.filter(i => i.tier === v2.get(i.id).tier), rand);
  return [...differing, ...same].slice(0, count).map(i => i.id);
}

const MAP_LABELS = { herbs: '養香草（placeholder 目標）', grammar: '英文文法（placeholder 目標）', cooking: '料理的科學（owner 目標）' };

function writeOwnerReview(out) {
  const lines = ['# Owner review（Phase 4 A/B）', '', '約 10–15 分鐘。每一欄填一次，留空表示略過。不會顯示哪個是舊／新標準。', ''];
  const key = { version: 1, A: { slugs: ['herbs-v1', 'herbs-v2'] }, B: {} };
  const herbs = loadArm(out, 'herbs-v2');
  const herbsItems = herbs.runs[0].items;
  // Titles/depth come from the run record (copied from the tree), parent order is preserved.
  lines.push('## A. 養香草（盲標）', '');
  lines.push(`目標: ${herbs.summary.goal}`, `程度: ${herbs.summary.level || '未指定'}`, `補充: ${herbs.summary.context || '無'}`, '');
  lines.push('在最後一欄寫 core（必學）、support（需要時學）或 side（可跳過），也可寫中文或 1/2/3。第一欄 id 請勿修改。', '');
  lines.push('| id | 卡片（縮排表樹狀） | 你的分級 |', '| --- | --- | --- |');
  for (const item of herbsItems) lines.push(`| ${item.id} | ${'　'.repeat(Math.max(0, (item.depth || 1) - 1))}${escapeCell(item.title)} | |`);
  lines.push('');

  lines.push('## B. 兩種分級二選一', '', '每張卡有甲、乙兩個分級與理由；在最後一欄寫 甲、乙、都可、都不對。', '');
  for (const slugBase of ['grammar', 'cooking']) {
    const v1 = loadArm(out, `${slugBase}-v1`);
    const v2 = loadArm(out, `${slugBase}-v2`);
    const v1Items = v1.runs[0].items;
    const v2Items = v2.runs[0].items;
    const rand = mulberry32(seedOf(`${slugBase}:assign`));
    const ids = pickReviewCards(v1Items, v2Items, 8, seedOf(`${slugBase}:pick`));
    const v1By = new Map(v1Items.map(i => [i.id, i]));
    const v2By = new Map(v2Items.map(i => [i.id, i]));
    key.B[slugBase] = [];
    lines.push(`### ${MAP_LABELS[slugBase]}`, '', `目標: ${v2.summary.goal}`, `程度: ${v2.summary.level || '未指定'}`, `補充: ${v2.summary.context || '無'}`, '');
    lines.push('| id | 卡片 | 甲 | 乙 | 你的選擇 |', '| --- | --- | --- | --- | --- |');
    for (const id of ids) {
      const aIsV1 = rand() < 0.5;
      const a = aIsV1 ? v1By.get(id) : v2By.get(id);
      const b = aIsV1 ? v2By.get(id) : v1By.get(id);
      key.B[slugBase].push({ id, a: aIsV1 ? 'v1' : 'v2' });
      lines.push(`| ${id} | ${escapeCell(v2By.get(id).title)} | ${a.tier}：${escapeCell(a.reason)} | ${b.tier}：${escapeCell(b.reason)} | |`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(out, 'owner-review.md'), lines.join('\n'));
  fs.writeFileSync(path.join(out, 'owner-review-key.json'), JSON.stringify(key, null, 2));
}

function sectionRows(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return [];
  const rest = text.slice(start + heading.length);
  const end = rest.search(/^#{2,3} /m);
  const body = end < 0 ? rest : rest.slice(0, end);
  const rows = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    if (!cells.length || cells[0] === 'id' || /^-+$/.test(cells[0])) continue;
    rows.push(cells);
  }
  return rows;
}

const CHOICES = { '甲': 'a', '乙': 'b', '都可': 'both', '都不對': 'neither' };

function compareReview(text, key, armTiers) {
  const result = { A: null, B: {} };
  const rowsA = sectionRows(text, '## A. 養香草（盲標）');
  const ownerById = new Map(rowsA.filter(c => c.length >= 3 && c[2]).map(c => [c[0], parseTier(c[2])]));
  const arms = {};
  for (const slug of key.A.slugs) {
    const aiById = armTiers[slug];
    const pairs = [...ownerById.entries()].filter(([id, tier]) => tier && aiById.has(id)).map(([id, tier]) => [aiById.get(id), tier]);
    arms[slug] = { labeled: pairs.length, agreement: agreement(pairs), kappa: cohenKappa(pairs) };
  }
  result.A = { rows: rowsA.length, labeled: ownerById.size, arms };
  const sections = { grammar: '### 英文文法（placeholder 目標）', cooking: '### 料理的科學（owner 目標）' };
  for (const [map, heading] of Object.entries(sections)) {
    const rows = sectionRows(text, heading);
    const assign = new Map((key.B[map] || []).map(e => [e.id, e.a]));
    const tally = { v1: 0, v2: 0, both: 0, neither: 0, blank: 0, invalid: 0 };
    for (const cells of rows) {
      if (cells.length < 5 || !assign.has(cells[0])) continue;
      const choice = cells[4].trim();
      if (!choice) tally.blank += 1;
      else if (!(choice in CHOICES)) tally.invalid += 1;
      else {
        const kind = CHOICES[choice];
        if (kind === 'a') tally[assign.get(cells[0])] += 1;
        else if (kind === 'b') tally[assign.get(cells[0]) === 'v1' ? 'v2' : 'v1'] += 1;
        else tally[kind] += 1;
      }
    }
    result.B[map] = tally;
  }
  return result;
}

function renderReviewCompare(result) {
  const lines = ['# Owner review compare', '', '## A. herbs 盲標（AI vs owner，run-1）', ''];
  lines.push(`已標註 ${result.A.labeled} / ${result.A.rows}`, '', '| arm | 已比對 | 準確度（一致率） | kappa |', '| --- | --- | --- | --- |');
  for (const [slug, a] of Object.entries(result.A.arms)) lines.push(`| ${slug} | ${a.labeled} | ${pct(a.agreement)} | ${a.kappa.toFixed(3)} |`);
  lines.push('', '## B. 偏好（v1 vs v2）', '', '| 地圖 | v1 | v2 | 都可 | 都不對 | 空白 | 無法辨識 |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const [map, t] of Object.entries(result.B)) lines.push(`| ${map} | ${t.v1} | ${t.v2} | ${t.both} | ${t.neither} | ${t.blank} | ${t.invalid} |`);
  return lines.join('\n') + '\n';
}

function compareReviewCommand(options) {
  const { out } = options;
  const text = fs.readFileSync(path.join(out, 'owner-review.md'), 'utf8');
  const key = JSON.parse(fs.readFileSync(path.join(out, 'owner-review-key.json'), 'utf8'));
  const armTiers = {};
  for (const slug of key.A.slugs) armTiers[slug] = new Map(loadArm(out, slug).runs[0].items.map(i => [i.id, i.tier]));
  const result = compareReview(text, key, armTiers);
  fs.writeFileSync(path.join(out, 'owner-review-compare.md'), renderReviewCompare(result));
  process.stdout.write(renderReviewCompare(result));
}

function main(argv) {
  const [command, ...rest] = argv;
  const options = parseArgs(rest);
  if (command === 'run') return runCommand(options);
  if (command === 'compare') return options.review ? compareReviewCommand(options) : compareCommand(options);
  if (command === 'ab') return abCommand(options);
  if (command === 'apply') return applyCommand(options);
  throw new Error('usage: relevance-offline.cjs run|compare|ab|apply --out=<dir> --slug=<slug> [...]');
}

module.exports = {
  TIERS, parseMap, parseFrontmatter, buildNodes, validateReply, extractJson, gradedNodes, confusion, agreement,
  cohenKappa, stability, tierDistribution, parseTier, renderLabels, parseLabels, compareLabels, renderCompare,
  setFrontmatterKeys, applyRun, assertWritable, hierarchyViolations, siblingGroups, siblingMetrics, estimateTokens,
  buildPrompt, normalizeLevel, normalizeContext, armOf, armStats, evaluateGates, renderAb, pickReviewCards, mulberry32,
  compareReview, writeOwnerReview, loadArm, sha256, classifyFailure, fill, classify, buildRepairPrompt
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
