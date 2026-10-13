const assert = require('node:assert/strict');
const { test, integrationTest, fixture, load, plain, obsidian } = require('../support.cjs');
const rawApi = load('experiences/visual-map/outline-import.ts', { obsidian });
const api = { ...rawApi, parseOutline: input => plain(rawApi.parseOutline(input)) };
const titles = parse => parse.nodes.map(node => `${'>'.repeat(node.level)}${node.title}@${node.parent ?? '-'}`);
const keys = issues => issues.map(issue => `${issue.key}:${issue.line}`);

test('outline: standard levels, parents by position, line numbers', () => {
  const parse = api.parseOutline('# Trip\n## Food\n### Breakfast\n## Food\n### Dinner\n');
  assert.deepEqual(titles(parse), ['>Trip@-', '>>Food@0', '>>>Breakfast@1', '>>Food@0', '>>>Dinner@3']);
  assert.deepEqual(parse.nodes.map(node => node.line), [1, 2, 3, 4, 5]);
  assert.deepEqual(keys(parse.errors), []);
  assert.deepEqual(keys(parse.warnings), ['ui.outline_warning_duplicate_title:4']);
});

test('outline: preprocessing — CRLF, CR, BOM and front matter', () => {
  assert.deepEqual(titles(api.parseOutline('﻿# A\r\n## B\r## C')), ['>A@-', '>>B@0', '>>C@0']);
  const fm = api.parseOutline('---\ntitle: x\n# comment\n---\n# Real');
  assert.deepEqual(titles(fm), ['>Real@-']);
});

test('outline: lines that are not headings', () => {
  const text = [
    '# Root',
    '```js', '# in fence', '```',
    '~~~', '## tilde fence', '~~~',
    '<!--', '# in comment', '-->',
    '%%', '# in obsidian comment', '%%',
    '$$', '# in math', '$$',
    '    # indented code',
    '> ## quote', '- # list', '1. # ordered',
    'Setext', '===',
    '#tag', '#x',
    '## Child'
  ].join('\n');
  const parse = api.parseOutline(text);
  assert.deepEqual(titles(parse), ['>Root@-', '>>Child@0']);
});

test('outline: a fence closes only with the same character, enough length and no info string', () => {
  assert.deepEqual(titles(api.parseOutline('# R\n```\n# a\n~~~\n# b\n```\n## C')), ['>R@-', '>>C@0']);
  assert.deepEqual(titles(api.parseOutline('# R\n```js\n# a\n```js\n# b\n```\n## C')), ['>R@-', '>>C@0']);
  assert.deepEqual(titles(api.parseOutline('# R\n```\n## never closed')), ['>R@-']);
});

test('outline: the whole outline wrapped in a ```markdown fence is unwrapped', () => {
  assert.deepEqual(titles(api.parseOutline('```markdown\n# R\n## A\n```')), ['>R@-', '>>A@0']);
  assert.deepEqual(titles(api.parseOutline('Here is the outline:\n\n```md\n# R\n## A\n```\nHope it helps.')), ['>R@-', '>>A@0']);
});

test('outline: heading text', () => {
  assert.deepEqual(api.parseOutline('#\tTabbed').nodes[0].title, 'Tabbed');
  assert.equal(api.parseOutline('# Title ##').nodes[0].title, 'Title');
  assert.equal(api.parseOutline('# C#').nodes[0].title, 'C#');
  assert.equal(api.parseOutline('# Foo \\#').nodes[0].title, 'Foo #');
  assert.equal(api.outlineTitle('**Bold** and `code` and [[Note|Alias]] and [[Plain]] and [text](https://x.y)'), 'Bold and code and Alias and Plain and text');
  assert.equal(api.outlineTitle('snake_case_name and *em* and _em_'), 'snake_case_name and em and em');
  assert.equal(api.outlineTitle('\\*literal\\*'), '*literal*');
  assert.deepEqual(keys(api.parseOutline('# ##').errors), ['ui.outline_error_empty_title:1']);
  assert.deepEqual(keys(api.parseOutline('# R\n#').errors), ['ui.outline_error_empty_title:2']);
  assert.deepEqual(keys(api.parseOutline(`# ${'x'.repeat(201)}`).errors), ['ui.outline_error_title_too_long:1']);
  assert.deepEqual(keys(api.parseOutline(`# ${'字'.repeat(200)}`).errors), []);
});

test('outline: structure errors and warnings', () => {
  assert.deepEqual(keys(api.parseOutline('just text').errors), ['ui.outline_error_no_headings:0']);
  assert.deepEqual(keys(api.parseOutline('# A\n# B').errors), ['ui.outline_error_multiple_roots:2']);
  assert.deepEqual(keys(api.parseOutline('## A\n# B').errors), ['ui.outline_error_multiple_roots:2']);
  assert.deepEqual(titles(api.parseOutline('## A\n### B')), ['>>A@-', '>>>B@0']);
  const skipped = api.parseOutline('# A\n## B\n#### D');
  assert.deepEqual(titles(skipped), ['>A@-', '>>B@0', '>>>>D@1']);
  assert.deepEqual(keys(skipped.warnings), ['ui.outline_warning_skipped_level:3']);
  assert.deepEqual(keys(api.parseOutline('# R\n## A/B\n## A:B').warnings), ['ui.outline_warning_filename_collision:3']);
  assert.deepEqual(keys(api.parseOutline('<!-- visual-agent-map:detail:start -->\n# R').errors), ['ui.outline_error_vam_note:1']);
});

test('outline: same-name headings keep their own children', () => {
  const parse = api.parseOutline('# R\n## Food\n### A\n## Food\n### B');
  assert.deepEqual(parse.nodes.map(node => [node.title, node.parent]), [['R', null], ['Food', 0], ['A', 1], ['Food', 0], ['B', 3]]);
});

test('outline: node limit includes the root', () => {
  const lines = n => ['# R', ...Array.from({ length: n - 1 }, (_, i) => `## T${i}`)].join('\n');
  assert.deepEqual(keys(api.parseOutline(lines(100)).errors), []);
  assert.deepEqual(keys(api.parseOutline(lines(101)).errors), ['ui.outline_error_too_many_nodes:0']);
});

test('outline: every line is accounted for exactly once; text around headings is counted, not lost', () => {
  const text = 'Intro sentence\n\n# R\nSome text\n\n## A\n```\ncode\n```\n- item';
  const parse = api.parseOutline(text);
  assert.equal(parse.headingLines + parse.ignoredLines + parse.blankLines + parse.skippedLines, parse.totalLines);
  assert.equal(parse.ignoredLines, 3);
  assert.deepEqual(keys(parse.warnings), ['ui.outline_warning_ignored_lines:0']);
});

test('outline: a 5,000-line note parses quickly', () => {
  const big = ['# R', ...Array.from({ length: 4999 }, (_, i) => (i % 50 === 0 ? `## H${i}` : `text ${i}`))].join('\n');
  const started = Date.now();
  const parse = api.parseOutline(big);
  assert.ok(Date.now() - started < 200);
  assert.equal(parse.nodes.length, 101);
});

test('outline: every Markdown file in the repository parses without throwing and accounts for every line', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const root = path.join(__dirname, '..', '..'); const files = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith('.md')) files.push(full); } };
  walk(root);
  assert.ok(files.length > 20);
  for (const file of files) {
    const parse = api.parseOutline(fs.readFileSync(file, 'utf8'));
    assert.equal(parse.headingLines + parse.ignoredLines + parse.blankLines + parse.skippedLines, parse.totalLines, file);
  }
});

test('outline: only a markdown/md fence or a leading bare fence is unwrapped; other fenced blocks stay code', () => {
  const bash = api.parseOutline('```\n# just a bash comment\necho hi\n```');
  assert.equal(bash.nodes.length, 0);
  assert.deepEqual(keys(bash.errors), ['ui.outline_error_no_headings:0']);
  assert.equal(api.parseOutline('Intro\n```bash\n# comment\n```').nodes.length, 0);
  assert.equal(api.parseOutline('Intro\n```\n# comment\n```').nodes.length, 0);
  assert.deepEqual(titles(api.parseOutline('```js\ncode\n```\n```md\n# R\n## A\n```')), ['>R@-', '>>A@0']);
  assert.deepEqual(titles(api.parseOutline('\n```\n# R\n## A\n```')), ['>R@-', '>>A@0']);
  assert.deepEqual(api.parseOutline('Intro\n```md\n# R\n## A\n```').nodes.map(node => node.line), [3, 4]);
});

integrationTest('createOutlineMap: one map, notes in outline order, parents by index, Map.md saved once', async () => {
  const { repo } = fixture('en');
  const parse = api.parseOutline('# Trip\n## Food\n### A\n## Food\n### B');
  let saves = 0; const save = repo.saveMap.bind(repo); repo.saveMap = async (...args) => { saves++; return save(...args); };
  const result = await api.createOutlineMap(repo, 'gpt-6-luna', parse.nodes, 'Inbox/outline.md', new Date('2026-10-13T09:00:00+08:00'));
  assert.equal(result.created, 5); assert.equal(result.total, 5); assert.equal(result.failure, undefined); assert.equal(saves, 1);
  const map = await repo.readMap(result.mapPath);
  assert.equal(map.title, 'Trip'); assert.equal(map.nodes.length, 5);
  const notes = await Promise.all(map.nodes.map(node => repo.readNote(node.path)));
  assert.deepEqual(notes.map(note => note.title), ['Trip', 'Food', 'A', 'Food', 'B']);
  const byId = new Map(map.nodes.map((node, i) => [node.id, notes[i].title]));
  assert.deepEqual(plain(map.nodes.map(node => byId.get(node.parentId) ?? null)), [null, 'Trip', 'Food', 'Trip', 'Food']);
  assert.equal(map.nodes[2].parentId, map.nodes[1].id); assert.equal(map.nodes[4].parentId, map.nodes[3].id);
  assert.notEqual(map.nodes[1].path, map.nodes[3].path);
  assert.match(notes[0].detail, /Imported from an outline \(2026-10-13\): \[\[Inbox\/outline\.md\]\]/);
  assert.equal(notes[1].detail.includes('Imported from an outline'), false);
  assert.ok(notes.every(note => note.status === 'idea' && note.prompt === ''));
  assert.ok(map.nodes.some(node => node.x !== 80 || node.y !== 80), 'arranged');
});

integrationTest('createOutlineMap: pasted text records the import without a source link', async () => {
  const { repo } = fixture('zh-TW');
  const result = await api.createOutlineMap(repo, 'gpt-6-luna', api.parseOutline('# 主題').nodes, null, new Date('2026-10-13T09:00:00+08:00'));
  const note = await repo.readNote((await repo.readMap(result.mapPath)).nodes[0].path);
  assert.match(note.detail, /從大綱匯入（2026-10-13）。/);
});

integrationTest('createOutlineMap: stops at the first failure and keeps every created note in the map', async () => {
  const { repo, app } = fixture('en');
  const create = repo.createNote.bind(repo); let calls = 0;
  repo.createNote = async (...args) => { calls++; if (calls === 3) throw new Error('disk full'); return create(...args); };
  const result = await api.createOutlineMap(repo, 'gpt-6-luna', api.parseOutline('# R\n## A\n## B\n## C').nodes, null);
  assert.equal(result.created, 2); assert.equal(result.total, 4); assert.equal(result.failure, 'disk full');
  const map = await repo.readMap(result.mapPath);
  assert.equal(map.nodes.length, 2);
  const notesFolder = result.mapPath.replace(/Map\.md$/, 'Notes/');
  const files = app.vault.getMarkdownFiles().filter(file => file.path.startsWith(notesFolder));
  assert.equal(files.length, 2, 'no orphan notes');
  assert.deepEqual(plain(files.map(file => file.path).sort()), plain(map.nodes.map(node => node.path).sort()));
});

integrationTest('createOutlineMap: does not touch the source note or other maps', async () => {
  const { repo, app } = fixture('en');
  const source = await app.vault.create('Inbox/outline.md', '# R\n## A');
  const before = await app.vault.read(source);
  const mapsBefore = (await repo.mapFiles()).map(file => file.path);
  const result = await api.createOutlineMap(repo, 'gpt-6-luna', api.parseOutline(before).nodes, 'Inbox/outline.md');
  assert.equal(await app.vault.read(source), before);
  assert.deepEqual(plain((await repo.mapFiles()).map(file => file.path).sort()), plain([...mapsBefore, result.mapPath].sort()));
});

function modalHarness(clipboardFails = false) {
  const element = (tag, options = {}) => ({
    tag, text: options.text ?? '', cls: options.cls ?? '', type: options.type, value: options.value ?? '', checked: false, disabled: false, hidden: false, children: [], listeners: {},
    createDiv(value) { const child = element('div', { cls: typeof value === 'string' ? value : value?.cls }); this.children.push(child); return child; },
    createEl(name, value = {}) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value = {}) { const child = element('span', value); this.children.push(child); return child; },
    setText(value) { this.text = value; }, empty() { this.children = []; }, replaceChildren() { this.children = []; }, toggleClass(name, on) { this.toggled = { ...(this.toggled ?? {}), [name]: on }; }, setAttr(name, value) { this[name] = value; },
    addEventListener(name, handler) { this.listeners[name] = handler; }, addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }
  });
  const find = (root, predicate) => predicate(root) ? root : root.children.map(child => find(child, predicate)).find(Boolean);
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  class Modal { constructor(app) { this.app = app; this.titleEl = element('title'); this.contentEl = element('content'); this.closed = false; } open() { this.onOpen(); } close() { this.closed = true; } }
  class FuzzySuggestModal { constructor(app) { this.app = app; } setPlaceholder(text) { this.placeholder = text; } open() { this.opened = true; } }
  const notices = []; const copied = [];
  const mod = load('experiences/visual-map/outline-import-modal.ts', { obsidian: { ...obsidian, Modal, FuzzySuggestModal, Notice: class { constructor(m) { notices.push(m); } } } }, { navigator: { clipboard: { writeText: async text => { if (clipboardFails) throw new Error('denied'); copied.push(text); } } } });
  return { mod, find, all, notices, copied };
}

test('outline modal: preview, errors block creation, shallow option and single submit', async () => {
  const h = modalHarness(); const requests = []; let release;
  const modal = new h.mod.OutlineImportModal({ vault: { getMarkdownFiles: () => [] } }, request => { requests.push(request); return new Promise(resolve => { release = resolve; }); });
  modal.open();
  const textarea = h.find(modal.contentEl, item => item.tag === 'textarea');
  const create = h.find(modal.contentEl, item => item.tag === 'button' && item.text === 'Create mind map');
  assert.equal(create.disabled, true);
  textarea.value = '# A\n# B'; textarea.listeners.input();
  assert.equal(create.disabled, true);
  assert.ok(h.find(modal.contentEl, item => /only one top-level heading/.test(item.text)));
  textarea.value = '# Trip\n## Food\n### Breakfast'; textarea.listeners.input();
  assert.equal(create.disabled, false);
  assert.ok(h.find(modal.contentEl, item => item.text === '3 topics, 3 levels'));
  h.find(modal.contentEl, item => item.tag === 'input' && item.type === 'checkbox').checked = true;
  create.listeners.click(); create.listeners.click();
  assert.equal(requests.length, 1); assert.equal(create.disabled, true);
  assert.deepEqual(plain(requests[0].nodes.map(node => node.title)), ['Trip', 'Food', 'Breakfast']);
  assert.equal(requests[0].source, null); assert.equal(requests[0].shallowResearch, true);
  assert.equal(requests[0].researchDepth, 'fast'); assert.equal(requests[0].model, undefined);
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(modal.closed, true);
});

test('outline modal: research depth and model show only with shallow research and are sent with the request', async () => {
  const h = modalHarness(); const requests = []; let changed = null, unwatched = 0; let models = [];
  const choices = { list: () => models, watch: fn => { changed = fn; return () => { unwatched++; }; } };
  const modal = new h.mod.OutlineImportModal({ vault: { getMarkdownFiles: () => [] } }, async request => { requests.push(request); }, choices);
  modal.open();
  const options = h.find(modal.contentEl, item => /vam-outline-research-options/.test(item.cls));
  const shallow = h.find(modal.contentEl, item => item.tag === 'input' && item.type === 'checkbox');
  assert.equal(options.toggled['is-hidden'], true);
  shallow.checked = true; shallow.listeners.change(); assert.equal(options.toggled['is-hidden'], false);
  const depth = h.find(modal.contentEl, item => item.tag === 'select' && item['aria-label'] === 'Research depth');
  const model = () => h.find(modal.contentEl, item => item.tag === 'select' && item['aria-label'] === 'Model');
  assert.equal(depth.value, 'fast'); assert.deepEqual(plain(model().children.map(c => c.value)), ['']);
  models = [{ id: 'm1', label: 'Model One' }]; changed();
  assert.deepEqual(plain(model().children.map(c => c.value)), ['', 'm1']);
  depth.value = 'deep'; model().value = 'm1';
  const textarea = h.find(modal.contentEl, item => item.tag === 'textarea'); textarea.value = '# R\n## A'; textarea.listeners.input();
  h.find(modal.contentEl, item => item.tag === 'button' && item.text === 'Create mind map').listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests[0].researchDepth, 'deep'); assert.equal(requests[0].model, 'm1');
  modal.onClose(); assert.equal(unwatched, 1);
});

test('outline modal: copy format instructions and choose a vault note', async () => {
  const h = modalHarness(); const requests = [];
  const file = { path: 'Inbox/outline.md', basename: 'outline', extension: 'md' };
  const app = { vault: { getMarkdownFiles: () => [file], cachedRead: async () => '# From file\n## Child' } };
  const modal = new h.mod.OutlineImportModal(app, async request => { requests.push(request); });
  modal.open();
  h.find(modal.contentEl, item => item.tag === 'button' && item.text === 'Copy format instructions').listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(h.copied[0], /exactly one # heading/);
  await modal.loadFile(file);
  assert.equal(h.find(modal.contentEl, item => item.tag === 'textarea').value, '# From file\n## Child');
  assert.ok(h.find(modal.contentEl, item => item.text === 'Source: Inbox/outline.md'));
  h.find(modal.contentEl, item => item.tag === 'button' && item.text === 'Create mind map').listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests[0].source, 'Inbox/outline.md');
});

integrationTest('importOutline creates the map, opens it, and starts shallow research only when asked', async () => {
  const { repo, app } = fixture('en');
  const opened = [], researched = [], notices = [];
  const plugin = { repo, settings: { ...require('../support.cjs').DEFAULT_SETTINGS, language: 'en', cliModel: 'gpt-6-luna' }, running: new Set(), activeTasks: new Map(), mutate: async work => work(), confirmAiUsage: async (_model, run) => { await run(); return true; } };
  const { VisualAgentMapView } = load('main.ts', { obsidian: { ...obsidian, Notice: class { constructor(m) { notices.push(m); } } } });
  const view = new VisualAgentMapView({ app }, plugin); view.render = () => {}; view.fit = () => {};
  view.enqueue = work => work();
  view.openMapInMutation = async path => { opened.push(path); view.path = path; view.map = await repo.readMap(path); };
  view.startShallowResearch = async (parent, children, options) => { researched.push({ parent: parent.id, children: children.length, options }); };
  const nodes = api.parseOutline('# R\n## A\n### B').nodes;
  await view.importOutline({ nodes, source: null, shallowResearch: false });
  assert.equal(opened.length, 1); assert.equal(researched.length, 0);
  await view.importOutline({ nodes, source: null, shallowResearch: true });
  assert.equal(opened.length, 2); assert.equal(researched.length, 1);
  assert.equal(researched[0].children, 2);
  assert.equal(researched[0].options.researchMode, 'research'); assert.equal(researched[0].options.researchDepth, 'fast');
  const confirms = []; plugin.confirmAiUsage = async (model, run) => { confirms.push(model); await run(); return true; };
  await view.importOutline({ nodes, source: null, shallowResearch: true, researchDepth: 'normal', model: 'model-x' });
  assert.deepEqual(confirms, ['model-x']); assert.equal(researched[1].options.researchDepth, 'normal');
  const map = await repo.readMap(opened[2]);
  for (const node of map.nodes) assert.equal((await repo.readNote(node.path)).model, 'model-x');
});

integrationTest('importOutline reports a partial creation and does not start research', async () => {
  const { repo, app } = fixture('en');
  const notices = [], researched = [];
  const create = repo.createNote.bind(repo); let calls = 0;
  repo.createNote = async (...args) => { calls++; if (calls === 2) throw new Error('disk full'); return create(...args); };
  const plugin = { repo, settings: { ...require('../support.cjs').DEFAULT_SETTINGS, language: 'en', cliModel: 'gpt-6-luna' }, running: new Set(), activeTasks: new Map(), mutate: async work => work(), confirmAiUsage: async (_m, run) => { await run(); return true; } };
  const { VisualAgentMapView } = load('main.ts', { obsidian: { ...obsidian, Notice: class { constructor(m) { notices.push(m); } } } });
  const view = new VisualAgentMapView({ app }, plugin); view.render = () => {}; view.fit = () => {}; view.enqueue = work => work();
  view.openMapInMutation = async () => {}; view.startShallowResearch = async () => { researched.push(1); };
  await view.importOutline({ nodes: api.parseOutline('# R\n## A').nodes, source: null, shallowResearch: true });
  assert.deepEqual(notices, ['Created 1 of 2 topics: disk full']); assert.equal(researched.length, 0);
});

integrationTest('importOutline still saves the map when the view switched away during creation', async () => {
  const { repo, app } = fixture('en');
  const plugin = { repo, settings: { ...require('../support.cjs').DEFAULT_SETTINGS, language: 'en', cliModel: 'gpt-6-luna' }, running: new Set(), activeTasks: new Map(), mutate: async work => work(), confirmAiUsage: async () => true };
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.render = () => {}; view.fit = () => {}; view.enqueue = work => work();
  let mapPath; view.openMapInMutation = async path => { mapPath = path; view.closed = true; };
  await view.importOutline({ nodes: api.parseOutline('# R\n## A').nodes, source: null, shallowResearch: false });
  assert.equal((await repo.readMap(mapPath)).nodes.length, 2);
});

test('outline: code spans keep their text; __x__ needs word boundaries; placeholders cannot collide', () => {
  assert.equal(api.outlineTitle('`__init__` method'), '__init__ method');
  assert.equal(api.outlineTitle('`a*b*c` usage'), 'a*b*c usage');
  assert.equal(api.outlineTitle('Use `[x](y)` syntax'), 'Use [x](y) syntax');
  assert.equal(api.outlineTitle('`[[Note|Alias]]` link'), '[[Note|Alias]] link');
  assert.equal(api.outlineTitle('init__main__x'), 'init__main__x');
  assert.equal(api.outlineTitle('__bold__ word'), 'bold word');
  assert.equal(api.outlineTitle('\uE0000\uE000'), '\uE0000\uE000');
  assert.equal(api.outlineTitle('\\* \uE0000\uE000 `x`'), '* \uE0000\uE000 x');
  assert.equal(api.outlineTitle('\\`a` b'), '`a` b');
});

test('outline: a note with VAM front matter keys is refused', async () => {
  const { core } = require('../support.cjs');
  const mapText = core.serializeMap({ id: 'm1', title: 'Some map', nodes: [] }, 'en');
  assert.deepEqual(keys(api.parseOutline(mapText).errors), ['ui.outline_error_vam_note:1']);
  const note = '---\nagent-map-node: true\nnode-id: n1\n---\n# Heading\n## Child';
  assert.deepEqual(keys(api.parseOutline(note).errors), ['ui.outline_error_vam_note:1']);
  assert.deepEqual(keys(api.parseOutline('---\ntitle: x\n---\n# Heading').errors), []);
});

test('outline: a <!-- inside a code span does not open a comment or drop later headings', () => {
  const parse = api.parseOutline('# R\n## Escape `<!--` in HTML\n## Next\n## Last');
  assert.deepEqual(titles(parse), ['>R@-', '>>Escape <!-- in HTML@0', '>>Next@0', '>>Last@0']);
  assert.deepEqual(keys(parse.errors), []);
});

integrationTest('createOutlineMap: a readMap failure right after createMap marks the map as created', async () => {
  const { repo } = fixture('en');
  repo.readMap = async () => { throw new Error('unreadable'); };
  await assert.rejects(api.createOutlineMap(repo, 'gpt-6-luna', api.parseOutline('# R').nodes, null), error => error.message === 'unreadable' && error.mapCreated === true);
});

integrationTest('createOutlineMap: a Map.md save failure throws with the note paths and marks the map as created', async () => {
  const { repo } = fixture('en');
  repo.saveMap = async () => { throw new Error('locked'); };
  await assert.rejects(api.createOutlineMap(repo, 'gpt-6-luna', api.parseOutline('# R\n## A').nodes, null), error => {
    assert.match(error.message, /could not be saved: locked \(.*R\.md, .*A\.md\)/);
    assert.equal(error.mapCreated, true);
    return true;
  });
});

function importHarness(overrides = {}) {
  const { repo, app } = fixture('en');
  const notices = [], calls = { opened: 0, researched: 0 };
  const NoticeClass = class { constructor(m) { notices.push(m); } };
  const plugin = { repo, settings: { ...require('../support.cjs').DEFAULT_SETTINGS, language: 'en', cliModel: 'gpt-6-luna' }, running: new Set(), activeTasks: new Map(), mutate: async work => work(), confirmAiUsage: async (_m, run) => { await run(); return true; }, ...overrides };
  const { VisualAgentMapView } = load('main.ts', { obsidian: { ...obsidian, Notice: NoticeClass } });
  const view = new VisualAgentMapView({ app }, plugin); view.render = () => {}; view.fit = () => {}; view.enqueue = work => work();
  view.openMapInMutation = async () => { calls.opened++; };
  view.startShallowResearch = async () => { calls.researched++; };
  return { repo, view, notices, calls, plugin };
}

integrationTest('importOutline: an open failure still completes (one Notice from mutate), creates once and skips research', async () => {
  const notices = [];
  const h = importHarness({ mutate: async () => { notices.push('mutate notice'); throw new Error('cannot open'); } });
  const create = h.repo.createMap.bind(h.repo); let creates = 0; h.repo.createMap = async (...args) => { creates++; return create(...args); };
  await h.view.importOutline({ nodes: api.parseOutline('# R\n## A').nodes, source: null, shallowResearch: true });
  assert.equal(creates, 1); assert.deepEqual(notices, ['mutate notice']); assert.deepEqual(h.notices, []); assert.equal(h.calls.researched, 0);
});

integrationTest('importOutline: a shallow-research start failure only shows a Notice', async () => {
  const h = importHarness();
  h.view.startShallowResearch = async () => { throw new Error('no cli'); };
  await h.view.importOutline({ nodes: api.parseOutline('# R\n## A').nodes, source: null, shallowResearch: true });
  assert.deepEqual(h.notices, ['no cli']);
  const g = importHarness({ confirmAiUsage: async () => { throw new Error('confirm broke'); } });
  await g.view.importOutline({ nodes: api.parseOutline('# R\n## A').nodes, source: null, shallowResearch: true });
  assert.deepEqual(g.notices, ['confirm broke']);
});

integrationTest('importOutline: a Map.md save failure becomes a Notice with the paths instead of a rejection', async () => {
  const h = importHarness();
  h.repo.saveMap = async () => { throw new Error('locked'); };
  await h.view.importOutline({ nodes: api.parseOutline('# R\n## A').nodes, source: null, shallowResearch: false });
  assert.equal(h.notices.length, 1); assert.match(h.notices[0], /could not be saved: locked/);
  assert.equal(h.calls.opened, 0);
});

integrationTest('importOutline: a failure before anything is created still rejects so the window stays open', async () => {
  const h = importHarness();
  h.repo.createMap = async () => { throw new Error('no folder'); };
  await assert.rejects(h.view.importOutline({ nodes: api.parseOutline('# R').nodes, source: null, shallowResearch: false }), /no folder/);
});

test('outline modal: a clipboard failure shows a Notice', async () => {
  const h = modalHarness(true);
  const modal = new h.mod.OutlineImportModal({ vault: { getMarkdownFiles: () => [] } }, async () => {});
  modal.open();
  h.find(modal.contentEl, item => item.tag === 'button' && item.text === 'Copy format instructions').listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(h.notices, ['Could not copy the format instructions to the clipboard.']);
});
