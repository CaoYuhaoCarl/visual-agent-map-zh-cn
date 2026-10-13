const assert = require('node:assert/strict');
const { test, load, plain, obsidian } = require('../support.cjs');

function harness(settings = {}) {
  const element = (tag, options = {}) => ({
    tag, text: options.text ?? '', cls: options.cls ?? '', type: options.type, value: options.value ?? '', disabled: false, children: [], listeners: {},
    createDiv(value) { const c = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(c); return c; },
    createEl(name, value = {}) { const c = element(name, value); this.children.push(c); return c; },
    createSpan(value = {}) { const c = element('span', value); this.children.push(c); return c; },
    empty() { this.children = []; }, setText(value) { this.text = value; }, setAttr(name, value) { this[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; }
  });
  const find = (root, predicate) => predicate(root) ? root : root.children.map(c => find(c, predicate)).find(Boolean);
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(c => all(c, predicate))];
  const opened = [];
  class Modal { constructor(app) { this.app = app; this.titleEl = element('title'); this.contentEl = element('content'); } open() { opened.push(this); if (this.constructor.name !== 'ChoiceModal') this.onOpen(); } close() {} }
  const mod = load('ui/modals/detail-templates-modal.ts', { obsidian: { ...obsidian, Modal } });
  const plugin = { settings: { language: 'en', detailTemplates: [], defaultDetailTemplateId: undefined, ...settings }, saves: 0, async saveSettings() { this.saves++; } };
  const modal = new mod.DetailTemplatesModal({}, plugin); modal.open();
  const button = text => find(modal.contentEl, i => i.tag === 'button' && i.text === text);
  const click = async text => { const b = button(text); assert.ok(b, `button ${text}`); b.listeners.click(); await new Promise(r => setImmediate(r)); };
  const rows = () => all(modal.contentEl, i => i.cls === 'vam-template-row');
  const rowButtons = row => all(row, i => i.tag === 'button').map(b => b.text);
  const rowNames = () => rows().map(r => find(r, i => i.tag === 'strong').text);
  const sections = () => all(modal.contentEl, i => i.cls === 'vam-template-section');
  const field = (row, label) => find(row, i => i['aria-label'] === label);
  const issueTexts = root => all(root, i => i.cls === 'vam-template-issue').map(i => i.text);
  return { mod, modal, plugin, opened, find, all, button, click, rows, rowButtons, rowNames, sections, field, issueTexts };
}

test('template library: Standard row offers Duplicate and Set as default only; new template edits 6 sections', async () => {
  const h = harness();
  assert.deepEqual(h.rowNames(), ['Standard']);
  assert.deepEqual(plain(h.rowButtons(h.rows()[0])), ['Duplicate', 'Set as default']);
  assert.ok(h.find(h.rows()[0], i => i.cls === 'vam-template-tag' && i.text === 'Default'));
  await h.click('New template');
  assert.equal(h.sections().length, 6);
  assert.equal(h.plugin.settings.detailTemplates.length, 0, 'nothing saved before Save');
});

test('template editor: rename tracks an alias, adds an exact-3 section, saves once', async () => {
  const h = harness();
  await h.click('New template');
  const name = h.find(h.modal.contentEl, i => i['aria-label'] === 'Template name'); name.value = 'Teach'; name.listeners.input();
  const first = h.sections()[0]; const oldName = h.field(first, 'Section name').value;
  const input = h.field(first, 'Section name'); input.value = 'Main points'; input.listeners.input();
  await h.click('Add section');
  assert.equal(h.sections().length, 7);
  const added = h.sections()[6];
  assert.equal(h.button('Save').disabled, true, 'empty new section name blocks Save');
  const newName = h.field(added, 'Section name'); newName.value = 'Examples'; newName.listeners.input();
  const mode = h.field(added, 'Required count'); mode.value = 'exact'; mode.listeners.change();
  const count = h.all(h.sections()[6], i => i.type === 'number')[0]; assert.ok(count); count.value = '3'; count.listeners.input();
  assert.equal(h.button('Save').disabled, false);
  await h.click('Save');
  const saved = plain(h.plugin.settings.detailTemplates);
  assert.equal(h.plugin.saves, 1);
  assert.equal(saved.length, 1); assert.equal(saved[0].name, 'Teach'); assert.equal(saved[0].sections.length, 7);
  assert.ok(saved[0].sections[0].aliases.includes(oldName));
  assert.equal(saved[0].sections[0].name, 'Main points');
  assert.deepEqual(saved[0].sections[6], { id: saved[0].sections[6].id, name: 'Examples', description: '', role: 'none', count: { mode: 'exact', n: 3 }, aliases: [] });
  assert.deepEqual(h.rowNames(), ['Standard', 'Teach'], 'returns to the list');
});

test('template editor: Cancel discards the draft', async () => {
  const h = harness();
  await h.click('New template');
  const input = h.field(h.sections()[0], 'Section name'); input.value = 'Changed'; input.listeners.input();
  await h.click('Cancel');
  assert.equal(h.plugin.saves, 0); assert.deepEqual(plain(h.plugin.settings.detailTemplates), []);
  assert.deepEqual(h.rowNames(), ['Standard']);
});

test('template editor: validation shows under the row, disables Save and clears when fixed', async () => {
  const h = harness();
  await h.click('New template');
  const row = () => h.sections()[2];
  const input = () => h.field(row(), 'Section name'); const original = input().value;
  input().value = ''; input().listeners.input();
  assert.deepEqual(h.issueTexts(row()), ['Section 3: name is required.']);
  assert.deepEqual(h.issueTexts(h.sections()[0]), []);
  assert.equal(h.button('Save').disabled, true);
  input().value = original; input().listeners.input();
  assert.deepEqual(h.issueTexts(row()), []); assert.equal(h.button('Save').disabled, false);
  const role = h.field(h.sections()[0], 'Function'); role.value = 'sources'; role.listeners.change();
  assert.deepEqual(h.issueTexts(h.modal.contentEl), ['Only one section can be the Sources section.']);
  assert.equal(h.button('Save').disabled, true);
});

test('template editor: move and remove reorder the draft', async () => {
  const h = harness();
  await h.click('New template');
  const names = () => h.sections().map(r => h.field(r, 'Section name').value);
  const before = names();
  h.all(h.sections()[0], i => i.tag === 'button' && i.text === 'Move down')[0].listeners.click();
  assert.deepEqual(names().slice(0, 2), [before[1], before[0]]);
  h.all(h.sections()[5], i => i.tag === 'button' && i.text === 'Remove')[0].listeners.click();
  assert.equal(h.sections().length, 5);
});

test('template library: edit saves in place, duplicates get unique names, deleting the default clears it', async () => {
  const h = harness();
  await h.click('New template');
  const name = h.find(h.modal.contentEl, i => i['aria-label'] === 'Template name'); name.value = 'Teach'; name.listeners.input(); await h.click('Save');
  const id = h.plugin.settings.detailTemplates[0].id;
  const teachRow = () => h.rows().find(r => h.find(r, i => i.tag === 'strong').text === 'Teach');
  assert.deepEqual(plain(h.rowButtons(teachRow())), ['Edit', 'Duplicate', 'Delete', 'Set as default']);
  const press = async (row, text) => { h.all(row, i => i.tag === 'button' && i.text === text)[0].listeners.click(); await new Promise(r => setImmediate(r)); };
  await press(teachRow(), 'Duplicate');
  await press(teachRow(), 'Duplicate');
  assert.deepEqual(plain(h.plugin.settings.detailTemplates.map(t => t.name)), ['Teach', 'Teach copy', 'Teach copy 2']);
  await press(teachRow(), 'Set as default');
  assert.equal(h.plugin.settings.defaultDetailTemplateId, id);
  assert.ok(h.find(teachRow(), i => i.cls === 'vam-template-tag'));
  // Edit keeps the same id and updates in place
  await press(teachRow(), 'Edit');
  const edit = h.find(h.modal.contentEl, i => i['aria-label'] === 'Template name'); edit.value = 'Teaching'; edit.listeners.input(); await h.click('Save');
  assert.equal(h.plugin.settings.detailTemplates[0].id, id); assert.equal(h.plugin.settings.detailTemplates[0].name, 'Teaching');
  // delete goes through a confirmation ChoiceModal
  const row = h.rows().find(r => h.find(r, i => i.tag === 'strong').text === 'Teaching');
  const before = h.opened.length; await press(row, 'Delete');
  const confirm = h.opened[before]; assert.ok(confirm, 'confirmation opened');
  assert.equal(confirm.description, 'Delete the template "Teaching"? Topics using it will fall back to the next default.');
  assert.equal(h.plugin.settings.detailTemplates.length, 3, 'not deleted before confirming');
  confirm.choices[0].action(); await new Promise(r => setImmediate(r));
  assert.deepEqual(plain(h.plugin.settings.detailTemplates.map(t => t.name)), ['Teach copy', 'Teach copy 2']);
  assert.equal(h.plugin.settings.defaultDetailTemplateId, undefined);
  assert.deepEqual(h.rowNames(), ['Standard', 'Teach copy', 'Teach copy 2']);
});

test('template library: Standard Duplicate and Set as default (undefined) work', async () => {
  const h = harness({ language: 'zh-TW' });
  const standard = h.rows()[0];
  h.all(standard, i => i.tag === 'button' && i.text === 'Duplicate')[0].listeners.click(); await new Promise(r => setImmediate(r));
  assert.deepEqual(plain(h.plugin.settings.detailTemplates.map(t => [t.name, t.sections.length])), [['標準 copy', 6]]);
});

test('settings row: dropdown lists Standard and templates; Standard stores undefined; button opens the library', () => {
  const { renderDetailTemplatesSetting } = load('ui/modals/detail-templates-modal.ts', { obsidian: { ...obsidian, Modal: class { open() { this.opened = true; } } } });
  const plugin = { settings: { language: 'en', detailTemplates: [{ id: 'a', name: 'Teach', sections: [] }], defaultDetailTemplateId: 'a' }, saves: 0, async saveSettings() { this.saves++; } };
  const dd = { options: [], addOption(v, t) { this.options.push([v, t]); return this; }, setValue(v) { this.value = v; return this; }, onChange(fn) { this.change = fn; return this; } };
  const btn = { setButtonText(t) { this.text = t; return this; }, onClick(fn) { this.click = fn; return this; } };
  const setting = { setName(n) { this.name = n; return this; }, setDesc(d) { this.desc = d; return this; }, addDropdown(fn) { fn(dd); return this; }, addButton(fn) { fn(btn); return this; } };
  renderDetailTemplatesSetting(setting, {}, plugin);
  assert.equal(setting.name, 'Content templates');
  assert.deepEqual(plain(dd.options), [['standard', 'Standard'], ['a', 'Teach']]); assert.equal(dd.value, 'a'); assert.equal(btn.text, 'Manage templates');
  dd.change('standard'); assert.equal(plugin.settings.defaultDetailTemplateId, undefined); assert.equal(plugin.saves, 1);
  dd.change('a'); assert.equal(plugin.settings.defaultDetailTemplateId, 'a');
  assert.doesNotThrow(() => btn.click());
});
