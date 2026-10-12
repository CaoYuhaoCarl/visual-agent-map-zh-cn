const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, load, plain, obsidian } = require('../support.cjs');
test('reference batches include every selected Markdown source, deduplicate overlaps, split long files, and keep citations', () => {
  const api = load('ai/reference-materials.ts', { obsidian });
  const groups = [
    { id: 'map-a', name: 'Map A', location: 'Maps/A/Map.md', documents: [{ key: 'same', path: 'Maps/A/one.md', content: 'A'.repeat(35_000) }, { key: 'external', path: '/Volumes/Refs/source.md', external: true, content: 'external evidence' }] },
    { id: 'folder', name: 'Folder', location: '/Volumes/Refs', documents: [{ key: 'same', path: 'Maps/A/one.md', content: 'duplicate' }, ...Array.from({ length: 100 }, (_, index) => ({ key: `note-${index}`, path: `Folder/note-${index}.md`, content: `unique-sentinel-${index}` }))] }
  ];
  const batches = api.referenceBatches(groups, 10_000, 12_000);
  const joined = batches.join('\n');
  assert.ok(batches.length > 1); assert.match(joined, /\[S1\] Vault Markdown; cite as an Obsidian wikilink: Maps\/A\/one\.md/);
  assert.match(joined, /\[S2\] external Markdown; cite the exact path as plain text: \/Volumes\/Refs\/source\.md/);
  assert.match(joined, /unique-sentinel-0/); assert.match(joined, /unique-sentinel-99/);
  assert.equal(joined.match(/duplicate/g), null);
  assert.match(joined, /part 1\/4/); assert.match(joined, /part 4\/4/);
  assert.match(api.referenceCatalog(groups), /\[S2\] External file \(plain path\): \/Volumes\/Refs\/source\.md/);
  assert.equal(api.resolveReferenceLinks('See [[source.md]]', groups), 'See 外部來源：/Volumes/Refs/source.md');
  assert.equal(api.resolveReferenceLinks('Vault [S1], external [S2]', groups), 'Vault [[Maps/A/one.md]], external 外部來源：/Volumes/Refs/source.md');
  const namesake = [{ id: 'mixed', documents: [{ path: 'Vault/source.md', content: 'vault' }, { path: '/Volumes/Refs/source.md', external: true, content: 'external' }] }];
  assert.equal(api.resolveReferenceLinks('Vault [S1], external [S2]', namesake), 'Vault [[Vault/source.md]], external 外部來源：/Volumes/Refs/source.md');
  assert.equal(api.resolveReferenceLinks('Ambiguous [[source.md]]', namesake), 'Ambiguous 來源待確認：source.md');
  assert.equal(api.resolveReferenceLinks('Exact [[Vault/source.md]]', namesake), 'Exact [[Vault/source.md]]');
  assert.equal(api.resolveReferenceLinks('Unknown [S3]', namesake), 'Unknown 來源待確認：[S3]');
  assert.equal(api.resolveReferenceLinks('See [[same.md]]', [{ id: 'a', documents: [{ path: '/a/same.md', external: true, content: '' }, { path: '/b/same.md', external: true, content: '' }] }]), 'See 來源待確認：same.md');
});
test('reference picker keeps source groups compact, collapsible and task-local', async () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'styles.css'), 'utf8');
  assert.match(css, /\.vam-reference-picker \.vam-reference-feedback \.is-hidden\s*\{\s*display:\s*none;\s*\}/);
  const element = (tag, options = {}) => ({ tag, cls: options.cls ?? '', text: options.text ?? '', children: [], dataset: {}, listeners: {},
    createDiv(value) { const child = element('div', { cls: typeof value === 'string' ? value : value?.cls }); this.children.push(child); return child; },
    createEl(name, value = {}) { const child = element(name, value); Object.assign(child, value); Object.assign(child, value.attr ?? {}); this.children.push(child); return child; },
    createSpan(value = {}) { const child = element('span', value); this.children.push(child); return child; },
    addEventListener(name, handler) { this.listeners[name] = handler; }, setText(value) { this.text = value; }, setAttr(name, value) { this[name] = value; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, removeClass(name) { this.cls = this.cls.split(' ').filter(item => item !== name).join(' '); }, empty() { this.children = []; }
  });
  const find = (root, predicate) => predicate(root) ? root : root.children.map(child => find(child, predicate)).find(Boolean);
  class Modal { constructor() { this.titleEl = element('h2'); this.contentEl = element('div'); } open() {} close() {} }
  const { ReferencePicker } = load('ui/reference-picker.ts', { obsidian: { ...obsidian, Modal, setIcon: (parent, name) => { const icon = element('svg'); icon.iconName = name; parent.children.push(icon); } } });
  const root = element('root');
  const picker = new ReferencePicker({ vault: { adapter: {} } }, root, async () => [], async () => [], 'current', 'Current topic and parent are included');
  const offline = new ReferencePicker({ vault: { adapter: {} } }, element('root'), async () => [], async () => [], 'current', 'Current topic and parent are included', false, true);
  assert.deepEqual(plain(offline.selection()), { webSearch: false, imageSearch: false });
  const area = root.children[0];
  assert.ok(find(area, child => child.cls.includes('vam-reference-cancel')).cls.includes('is-hidden'));
  assert.ok(find(area, child => child.cls.includes('vam-reference-error-acknowledge')).cls.includes('is-hidden'));
  assert.deepEqual(area.children.filter(child => child.cls.includes('vam-reference-section')).map(child => child.cls), [
    'vam-reference-section vam-reference-network-section', 'vam-reference-section vam-reference-local-section'
  ]);
  const web = find(area, child => child.tag === 'input' && child.type === 'checkbox');
  const image = find(area, child => child.tag === 'input' && child !== web && child.type === 'checkbox');
  assert.ok(find(area, child => child.tag === 'strong' && !!child.text));
  const actionRow = find(area, child => child.cls === 'vam-reference-actions');
  assert.equal(actionRow.children.filter(child => child.tag === 'button').length, 3);
  assert.deepEqual(actionRow.children.filter(child => child.tag === 'button').map(button => button.children[0].children[0].iconName), ['brain-circuit', 'folder-open', 'file-text']);
  web.checked = false; web.listeners.change(); assert.equal(image.disabled, true); assert.equal(image.checked, false);
  picker.groups = [{ id: 'map', name: 'Travel map', location: 'Maps/Travel/Map.md', documents: [{ path: 'Maps/Travel/Notes/Train.md', content: 'rail' }] }];
  picker.refresh();
  const details = find(area, child => child.tag === 'details');
  assert.equal(details.open, undefined);
  assert.equal(find(details, child => child.tag === 'ul'), undefined);
  const groupRow = find(area, child => child.cls === 'vam-reference-group-row');
  const remove = find(area, child => child.cls === 'vam-reference-remove');
  assert.equal(groupRow.children.includes(remove), true);
  assert.equal(find(find(details, child => child.tag === 'summary'), child => child.tag === 'button'), undefined);
  details.open = true; details.listeners.toggle();
  assert.equal(find(details, child => child.tag === 'li').text, 'Maps/Travel/Notes/Train.md');
  remove.listeners.click({ preventDefault() {} });
  assert.equal((await picker.ready()).groups.length, 0);
  assert.ok(find(area, child => child.cls.includes('vam-reference-cancel')).cls.includes('is-hidden'));
  const input = (path, content) => ({name: path.split('/').at(-1), webkitRelativePath: path, text: async () => content});
  const archived = input('Vault/Topic/Archive/old.md', '---\nagent-map-node: true\ntopic-state: archived\n---\nOld');
  const ordinary = input('Vault/Archive/ordinary.md', 'Ordinary archive');
  const active = input('Archive/Topics/Archive/Notes/active.md', '---\nagent-map-node: true\ntopic-state: active\n---\nCurrent');
  picker.addFolder([archived, ordinary, active]);
  let chosen = await picker.ready();
  assert.deepEqual(plain(chosen.groups.flatMap(group => group.documents).map(doc => doc.path)), [ordinary.webkitRelativePath, active.webkitRelativePath]);
  assert.ok(find(area, child => child.text.includes('Excluded 1')));
  picker.addFiles([archived]); chosen = await picker.ready();
  assert.equal(chosen.groups.flatMap(group => group.documents).length, 3);
  assert.ok(chosen.groups.flatMap(group => group.documents).some(doc => doc.content.endsWith('Old')));
});
