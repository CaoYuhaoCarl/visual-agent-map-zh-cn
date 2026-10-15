#!/usr/bin/env node
// Development tool, not product code: offline test of AI relevance tiers (core / support / side) on real maps.
// Not bundled into main.js, no UI. See agents-spec/intents/relevance/INTENT.md (First step).
//
//   node tests/tools/relevance-offline.cjs run --map=<map dir> --vault=<vault root> --out=<runs dir> --slug=<slug>
//        [--runs=2] [--label-depth=2|all] [--model=sonnet]
//   node tests/tools/relevance-offline.cjs compare --out=<runs dir> --slug=<slug>
//   node tests/tools/relevance-offline.cjs apply --vault=<vault root> --map=<map dir> --out=<runs dir> --slug=<slug>
//        writes relevance-tier / relevance-reason into node notes and relevance-goal into Map.md (those keys only).
//        Refuses the owner's live test vault (/private/tmp/vam-e2e-current) and anything under it.
//
// The vault is only read. Everything written (it contains note titles and summaries) goes to --out, which must
// not be inside this repository.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

// Strict: missing ids, extra ids, duplicates, bad tier or empty reason all throw. Nothing is coerced.
function validateReply(value, tree) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('reply is not an object');
  if (typeof value.goal !== 'string' || !value.goal.trim()) throw new Error('missing goal');
  if (!Array.isArray(value.items)) throw new Error('items is not an array');
  const expected = new Set(gradedNodes(tree).map(n => n.id));
  const seen = new Set();
  const extra = [];
  for (const item of value.items) {
    if (!item || typeof item !== 'object') throw new Error('item is not an object');
    if (typeof item.id !== 'string') throw new Error('item without id');
    if (!expected.has(item.id)) extra.push(item.id);
    if (seen.has(item.id)) throw new Error(`duplicate id ${item.id}`);
    seen.add(item.id);
    if (!TIERS.includes(item.tier)) throw new Error(`bad tier for ${item.id}: ${String(item.tier)}`);
    if (typeof item.reason !== 'string' || !item.reason.trim()) throw new Error(`empty reason for ${item.id}`);
  }
  const missing = [...expected].filter(id => !seen.has(id));
  if (missing.length || extra.length)
    throw new Error(`id mismatch: ${missing.length} missing, ${extra.length} extra`);
  return value;
}

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
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{{${key}}}`).join(value), template);
}

function draftGoal(title, model) {
  const prompt = fill(fs.readFileSync(path.join(TOOL_DIR, 'goal.md'), 'utf8'), { TITLE: title });
  const reply = callClaude(prompt, model);
  const goal = extractJson(reply.text).goal;
  if (typeof goal !== 'string' || !goal.trim()) throw new Error('goal draft is empty');
  return goal.trim();
}

function classify(goal, tree, model) {
  const nodes = tree.map(({ id, title, summary, status, parentId, depth }) => ({ id, title, summary, status, parentId, depth }));
  const prompt = fill(fs.readFileSync(path.join(TOOL_DIR, 'prompt.md'), 'utf8'), {
    GOAL: goal,
    NODES: JSON.stringify(nodes)
  });
  const reply = callClaude(prompt, model);
  const value = validateReply(extractJson(reply.text), tree);
  return { value, usage: reply.usage, cost: reply.cost };
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
  const labelDepth = !options['label-depth'] || options['label-depth'] === 'all' ? Infinity : Number(options['label-depth']);
  const { title, tree } = loadMap(map, vault);
  const dir = path.join(out, slug);
  fs.mkdirSync(dir, { recursive: true });

  const goal = options.goal || draftGoal(title, model);
  const results = [];
  const failures = [];
  for (let i = 1; i <= runs; i += 1) {
    let outcome = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2 && !outcome; attempt += 1) {
      try {
        outcome = classify(goal, tree, model);
      } catch (error) {
        lastError = `attempt ${attempt}: ${error.message}`;
        failures.push({ run: i, error: lastError });
      }
    }
    if (!outcome) {
      fs.writeFileSync(path.join(dir, `run-${i}.failed.json`), JSON.stringify({ goal, error: lastError }, null, 2));
      continue;
    }
    const record = { map: title, model, goal, nodes: tree.length, graded: gradedNodes(tree).length, ...outcome.value, usage: outcome.usage, costUsd: outcome.cost };
    fs.writeFileSync(path.join(dir, `run-${i}.json`), JSON.stringify(record, null, 2));
    results.push(record);
  }

  const summary = { map: title, slug, goal, nodes: tree.length, graded: gradedNodes(tree).length, failures };
  if (results.length) {
    summary.distribution = results.map(r => tierDistribution(r.items.map(i => i.tier)));
    fs.writeFileSync(
      path.join(dir, 'labels.md'),
      renderLabels({ title, goal, items: results[0].items, tree, labelDepth })
    );
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
  writes.push([mapFile, { 'relevance-goal': clip(record.goal, 400) }]);
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

function main(argv) {
  const [command, ...rest] = argv;
  const options = parseArgs(rest);
  if (command === 'run') return runCommand(options);
  if (command === 'compare') return compareCommand(options);
  if (command === 'apply') return applyCommand(options);
  throw new Error('usage: relevance-offline.cjs run|compare|apply --out=<dir> --slug=<slug> [...]');
}

module.exports = {
  TIERS, parseMap, parseFrontmatter, buildNodes, validateReply, extractJson, gradedNodes, confusion, agreement,
  cohenKappa, stability, tierDistribution, parseTier, renderLabels, parseLabels, compareLabels, renderCompare,
  setFrontmatterKeys, applyRun, assertWritable
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
