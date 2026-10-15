const test = require('node:test');
const assert = require('node:assert/strict');
const tool = require('./tools/relevance-offline.cjs');

const MAP = [
  '---', 'visual-agent-map: true', '---', '', '# T', '', '```agent-map',
  JSON.stringify({ version: 1, title: 'T', nodes: [
    { id: 'a', path: 'n/a.md', parentId: null, x: 1 },
    { id: 'b', path: 'n/b.md', parentId: 'a' },
    { id: 'c', path: 'n/c.md', parentId: 'b' },
    { id: 'd', path: 'n/d.md', parentId: 'a' }
  ] }, null, 2),
  '```', ''
].join('\n');

test('parseMap reads nodes from the agent-map block', () => {
  const map = tool.parseMap(MAP);
  assert.equal(map.title, 'T');
  assert.deepEqual(map.nodes.map(n => [n.id, n.parentId]), [['a', null], ['b', 'a'], ['c', 'b'], ['d', 'a']]);
  assert.throws(() => tool.parseMap('no block'));
});

test('parseFrontmatter reads title summary status', () => {
  const fm = tool.parseFrontmatter('---\ntitle: Hello: world\nsummary: "quoted"\nstatus: idea\nlist:\n  - x\n---\nbody');
  assert.equal(fm.title, 'Hello: world');
  assert.equal(fm.summary, 'quoted');
  assert.equal(fm.status, 'idea');
  assert.deepEqual(tool.parseFrontmatter('no frontmatter'), {});
});

test('buildNodes orders parent before child with depth and clips summaries', () => {
  const nodes = tool.parseMap(MAP).nodes;
  const tree = tool.buildNodes(nodes, id => ({ title: id.toUpperCase(), summary: 'x'.repeat(300), status: 's' }));
  assert.deepEqual(tree.map(n => [n.id, n.depth, n.parentId]), [['a', 0, null], ['b', 1, 'a'], ['c', 2, 'b'], ['d', 1, 'a']]);
  assert.equal([...tree[0].summary].length, 240);
});

const TREE = [
  { id: 'a', title: 'A', depth: 0, parentId: null },
  { id: 'b', title: 'B', depth: 1, parentId: 'a' },
  { id: 'c', title: 'C | pipe', depth: 2, parentId: 'b' },
  { id: 'd', title: 'D', depth: 1, parentId: 'a' }
];
const reply = items => ({ goal: 'g', items });
const item = (id, tier) => ({ id, title: id, depth: 1, tier, reason: 'because' });

test('validateReply accepts exact id set and rejects missing, extra, duplicate, bad tier', () => {
  assert.doesNotThrow(() => tool.validateReply(reply([item('b', 'core'), item('c', 'side'), item('d', 'support')]), TREE));
  assert.throws(() => tool.validateReply(reply([item('b', 'core'), item('c', 'side')]), TREE), /1 missing/);
  assert.throws(() => tool.validateReply(reply([item('b', 'core'), item('c', 'side'), item('d', 'side'), item('x', 'side')]), TREE), /1 extra/);
  assert.throws(() => tool.validateReply(reply([item('a', 'core'), item('b', 'core'), item('c', 'side'), item('d', 'side')]), TREE), /extra/);
  assert.throws(() => tool.validateReply(reply([item('b', 'core'), item('b', 'core'), item('c', 'side')]), TREE), /duplicate/);
  assert.throws(() => tool.validateReply(reply([item('b', 'huge'), item('c', 'side'), item('d', 'side')]), TREE), /bad tier/);
  assert.throws(() => tool.validateReply({ items: [] }, TREE), /goal/);
});

test('extractJson strips a code fence', () => {
  assert.deepEqual(tool.extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(tool.extractJson('{"a":2}'), { a: 2 });
});

test('agreement, kappa and confusion', () => {
  const same = [['core', 'core'], ['side', 'side'], ['support', 'support']];
  assert.equal(tool.agreement(same), 1);
  assert.equal(tool.cohenKappa(same), 1);
  const all = [['core', 'core'], ['core', 'core']];
  assert.equal(tool.cohenKappa(all), 1);
  // classic 2x2-like example: po = 0.7, pe = 0.5 -> kappa 0.4
  const pairs = [];
  for (let i = 0; i < 20; i += 1) pairs.push(['core', 'core']);
  for (let i = 0; i < 15; i += 1) pairs.push(['side', 'side']);
  for (let i = 0; i < 10; i += 1) pairs.push(['core', 'side']);
  for (let i = 0; i < 5; i += 1) pairs.push(['side', 'core']);
  assert.ok(Math.abs(tool.agreement(pairs) - 0.7) < 1e-9);
  assert.ok(Math.abs(tool.cohenKappa(pairs) - 0.4) < 1e-9);
  assert.deepEqual(tool.confusion(pairs), [[20, 0, 10], [0, 0, 0], [5, 0, 15]]);
  const disjoint = [['core', 'side'], ['side', 'core']];
  assert.ok(tool.cohenKappa(disjoint) < 0);
});

test('stability compares two runs by id', () => {
  const a = [item('b', 'core'), item('c', 'side'), item('d', 'support')];
  const b = [item('b', 'core'), item('c', 'support'), item('d', 'support')];
  const s = tool.stability(a, b);
  assert.equal(s.n, 3);
  assert.ok(Math.abs(s.agreement - 2 / 3) < 1e-9);
});

test('parseTier accepts english, chinese and numbers', () => {
  assert.equal(tool.parseTier(' Core '), 'core');
  assert.equal(tool.parseTier('必學'), 'core');
  assert.equal(tool.parseTier('需要時學'), 'support');
  assert.equal(tool.parseTier('3'), 'side');
  assert.equal(tool.parseTier('maybe'), null);
});

test('labels.md round-trips, honours depth limit and pipes, and compare reads owner edits', () => {
  const items = [item('b', 'core'), item('c', 'side'), item('d', 'support')];
  const md = tool.renderLabels({ title: 'T', goal: 'my goal', items, tree: TREE, labelDepth: 2 });
  assert.match(md, /　C \\\| pipe/);
  let parsed = tool.parseLabels(md);
  assert.equal(parsed.goal, 'my goal');
  assert.deepEqual(parsed.rows.map(r => [r.id, r.ai, r.owner]), [['b', 'core', null], ['c', 'side', null], ['d', 'support', null]]);
  assert.equal(parsed.rows[1].title, 'C | pipe');

  const shallow = tool.parseLabels(tool.renderLabels({ title: 'T', goal: 'g', items, tree: TREE, labelDepth: 1 }));
  assert.deepEqual(shallow.rows.map(r => r.id), ['b', 'd']);

  const filled = md
    .replace('| b | B | core | because | |', '| b | B | core | because | core |')
    .replace(/(\| c \| .*\| side \| because \|) \|/, '$1 必學 |')
    .replace('目標（可改寫，改了就以你的為準）: my goal', '目標（可改寫，改了就以你的為準）: new goal');
  parsed = tool.parseLabels(filled);
  assert.equal(parsed.goal, 'new goal');
  const result = tool.compareLabels(parsed);
  assert.equal(result.labeled, 2);
  assert.equal(result.changed.length, 1);
  assert.equal(result.promotedSide, 1);
  assert.equal(result.agreement, 0.5);
  assert.equal(result.signal, 'ok');
  assert.match(tool.renderCompare({ title: 'T', goal: 'new goal', result }), /Cohen's kappa/);
});

test('compare flags rubber-stamp and useless', () => {
  const row = (ai, owner) => ({ id: 'x', title: 't', ai, reason: 'r', owner, ownerRaw: owner || '' });
  const same = Array.from({ length: 20 }, () => row('core', 'core'));
  assert.equal(tool.compareLabels({ goal: '', rows: same }).signal, 'rubber-stamp');
  const diff = Array.from({ length: 20 }, () => row('core', 'side'));
  assert.equal(tool.compareLabels({ goal: '', rows: diff }).signal, 'useless');
  assert.equal(tool.compareLabels({ goal: '', rows: [row('core', null)] }).signal, 'no-labels');
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function makeVault() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'relevance-apply-'));
  const mapDir = path.join(vault, 'Maps', 'M');
  fs.mkdirSync(path.join(mapDir, 'Notes'), { recursive: true });
  const nodes = [
    { id: 'a', path: 'Maps/M/Notes/a.md', parentId: null, x: 0, y: 0 },
    { id: 'b', path: 'Maps/M/Notes/b.md', parentId: 'a', x: 0, y: 0 }
  ];
  fs.writeFileSync(path.join(mapDir, 'Map.md'), `---\nvisual-agent-map: true\n---\n\n# M\n\n\`\`\`agent-map\n${JSON.stringify({ version: 1, id: 'm', title: 'M', nodes })}\n\`\`\`\n`);
  fs.writeFileSync(path.join(vault, nodes[0].path), '---\ntitle: A\n---\nroot body\n');
  fs.writeFileSync(path.join(vault, nodes[1].path), '---\ntitle: "B: x"\nrelevance-tier: core\nrelevance-reason: old\nsummary: keep me\nlist:\n  - one\n---\n# B\n\nbody\n');
  return { vault, mapDir };
}
const record = { goal: 'Learn: "basics"', items: [{ id: 'b', tier: 'side', reason: 'Skip: not on the path | really' }] };

test('setFrontmatterKeys replaces only the given keys and keeps everything else', () => {
  const out = tool.setFrontmatterKeys('---\ntitle: T\nrelevance-reason: old\nrelevance-tier: core\nlist:\n  - x\n---\nbody\n', { 'relevance-tier': 'side', 'relevance-reason': 'r' });
  assert.equal(out, '---\ntitle: T\nlist:\n  - x\nrelevance-tier: "side"\nrelevance-reason: "r"\n---\nbody\n');
  assert.equal(tool.setFrontmatterKeys('body\n', { a: 'b' }), '---\na: "b"\n---\nbody\n');
  assert.equal(tool.setFrontmatterKeys(tool.setFrontmatterKeys('---\nt: 1\n---\nx', { a: 'b' }), { a: 'b' }), '---\nt: 1\na: "b"\n---\nx');
});

test('applyRun writes tier, reason and goal, touches only those keys, and reads back through parseFrontmatter', () => {
  const { vault, mapDir } = makeVault();
  assert.equal(tool.applyRun({ vault, mapDir, record }), 2);
  const note = fs.readFileSync(path.join(vault, 'Maps/M/Notes/b.md'), 'utf8');
  const fm = tool.parseFrontmatter(note);
  assert.equal(fm['relevance-tier'], 'side');
  assert.equal(JSON.parse(note.match(/^relevance-reason: (.*)$/m)[1]), 'Skip: not on the path | really');
  assert.equal(fm.summary, 'keep me');
  assert.equal(fm.title, 'B: x');
  assert.match(note, /list:\n {2}- one\n/);
  assert.match(note, /\n---\n# B\n\nbody\n$/);
  assert.equal(fs.readFileSync(path.join(vault, 'Maps/M/Notes/a.md'), 'utf8'), '---\ntitle: A\n---\nroot body\n', 'root is not graded');
  const mapText = fs.readFileSync(path.join(mapDir, 'Map.md'), 'utf8');
  assert.equal(JSON.parse(mapText.match(/^relevance-goal: (.*)$/m)[1]), 'Learn: "basics"');
  assert.match(mapText, /visual-agent-map: true/);
  assert.equal(tool.parseMap(mapText).nodes.length, 2);
});

test('applyRun is idempotent and rejects ids that are not in the map', () => {
  const { vault, mapDir } = makeVault();
  tool.applyRun({ vault, mapDir, record });
  const once = fs.readFileSync(path.join(vault, 'Maps/M/Notes/b.md'), 'utf8');
  tool.applyRun({ vault, mapDir, record });
  assert.equal(fs.readFileSync(path.join(vault, 'Maps/M/Notes/b.md'), 'utf8'), once);
  assert.throws(() => tool.applyRun({ vault, mapDir, record: { goal: 'g', items: [{ id: 'zz', tier: 'core', reason: 'r' }] } }), /not in Map.md/);
});

test('apply refuses the live test vault and anything under it', () => {
  assert.throws(() => tool.assertWritable('/private/tmp/vam-e2e-current'), /refusing/);
  assert.throws(() => tool.assertWritable('/private/tmp/vam-e2e-current/Agent Workspace/Mind Maps/x'), /refusing/);
  assert.doesNotThrow(() => tool.assertWritable('/private/tmp/vam-e2e-relevance'));
  assert.doesNotThrow(() => tool.assertWritable('/private/tmp/vam-e2e-current-other'));
  const { mapDir } = makeVault();
  assert.throws(() => tool.applyRun({ vault: '/private/tmp/vam-e2e-current', mapDir, record }), /refusing/);
});
