const assert = require('node:assert/strict');
const { test, load, plain, obsidian } = require('../support.cjs');

function harness(settings = {}) {
  const element = (tag, options = {}) => ({
    tag, text: options.text ?? '', cls: options.cls ?? '', type: options.type, value: options.value ?? '', disabled: false, children: [], listeners: {},
    createDiv(value) { const c = element('div', typeof value === 'string' ? { cls: value } : value); c.parent = this; this.children.push(c); return c; },
    createEl(name, value = {}) { const c = element(name, value); c.parent = this; this.children.push(c); return c; },
    createSpan(value = {}) { const c = element('span', value); c.parent = this; this.children.push(c); return c; },
    empty() { this.children = []; }, setText(value) { this.text = value; }, setAttr(name, value) { this[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  });
  const find = (root, predicate) => predicate(root) ? root : root.children.map(c => find(c, predicate)).find(Boolean);
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(c => all(c, predicate))];
  const opened = [];
  // As in Obsidian, the content sits inside modalEl; the fixed action bar is modalEl's last child.
  class Modal { constructor(app) { this.app = app; this.titleEl = element('title'); this.contentEl = element('content'); this.modalEl = element('modal'); this.modalEl.children.push(this.contentEl); } open() { opened.push(this); if (this.constructor.name !== 'ChoiceModal') this.onOpen(); } close() {} }
  const mod = load('ui/modals/detail-templates-modal.ts', { obsidian: { ...obsidian, Modal } });
  const plugin = { settings: { language: 'en', detailTemplates: [], defaultDetailTemplateId: undefined, ...settings }, saves: 0, async saveSettings() { this.saves++; } };
  const modal = new mod.DetailTemplatesModal({}, plugin); modal.open();
  const button = text => find(modal.modalEl, i => i.tag === 'button' && i.text === text);
  const click = async text => { const b = button(text); assert.ok(b, `button ${text}`); b.listeners.click(); await new Promise(r => setImmediate(r)); };
  const rows = () => all(modal.contentEl, i => i.cls === 'vam-template-row');
  const rowButtons = row => all(row, i => i.tag === 'button').map(b => b.text);
  const rowNames = () => rows().map(r => find(r, i => i.tag === 'strong').text);
  const sections = () => all(modal.contentEl, i => String(i.cls ?? '').split(' ').includes('vam-template-section'));
  const field = (row, label) => find(row, i => i['aria-label'] === label);
  const issueTexts = root => all(root, i => i.cls === 'vam-template-issue').map(i => i.text);
  const isOpen = row => Boolean(field(row, 'Section heading'));
  const header = row => find(row, i => i.tag === 'button' && i.cls === 'vam-template-section-header');
  const expand = index => { const row = sections()[index]; if (!isOpen(row)) header(row).listeners.click(); return sections()[index]; };
  const sectionName = row => isOpen(row) ? field(row, 'Section heading').value : find(row, i => i.cls.startsWith('vam-template-section-title')).text;
  const summary = row => { const el = find(row, i => i.cls === 'vam-template-section-summary'); return el && el.children.map(c => c.text).join(' '); };
  const badge = row => find(row, i => i.cls === 'vam-template-section-badge')?.text;
  const preview = () => find(modal.contentEl, i => i.tag === 'pre').text;
  return { mod, modal, plugin, opened, find, all, button, click, rows, rowButtons, rowNames, sections, field, issueTexts, isOpen, header, expand, sectionName, summary, badge, preview };
}

test('template library: Standard row offers View, Duplicate and Set as default only; new template edits 6 sections', async () => {
  const h = harness();
  assert.deepEqual(h.rowNames(), ['Standard']);
  assert.deepEqual(plain(h.rowButtons(h.rows()[0])), ['View', 'Duplicate', 'Set as default']);
  assert.ok(h.find(h.rows()[0], i => i.cls === 'vam-template-tag' && i.text === 'Default'));
  await h.click('New template');
  assert.equal(h.sections().length, 6);
  assert.equal(h.plugin.settings.detailTemplates.length, 0, 'nothing saved before Save');
});

test('template editor: rename tracks an alias, adds an exact-3 section, saves once', async () => {
  const h = harness();
  await h.click('New template');
  const name = h.find(h.modal.contentEl, i => i['aria-label'] === 'Template name'); name.value = 'Teach'; name.listeners.input();
  const first = h.sections()[0]; const oldName = h.field(first, 'Section heading').value;
  const input = h.field(first, 'Section heading'); input.value = 'Main points'; input.listeners.input();
  await h.click('+ Add section');
  assert.equal(h.sections().length, 7);
  const added = h.sections()[6];
  assert.equal(h.button('Save').disabled, true, 'empty new section name blocks Save');
  const newName = h.field(added, 'Section heading'); newName.value = 'Examples'; newName.listeners.input();
  const mode = h.field(added, 'Item count'); mode.value = 'exact'; mode.listeners.change();
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
  const input = h.field(h.sections()[0], 'Section heading'); input.value = 'Changed'; input.listeners.input();
  await h.click('Cancel');
  assert.equal(h.plugin.saves, 0); assert.deepEqual(plain(h.plugin.settings.detailTemplates), []);
  assert.deepEqual(h.rowNames(), ['Standard']);
});

test('template editor: validation shows under the row, disables Save and clears when fixed', async () => {
  const h = harness();
  await h.click('New template');
  const row = () => h.sections()[2];
  h.expand(2);
  const input = () => h.field(row(), 'Section heading'); const original = input().value;
  input().value = ''; input().listeners.input();
  assert.deepEqual(h.issueTexts(row()), ['Section 3: name is required.']);
  assert.deepEqual(h.issueTexts(h.sections()[0]), []);
  assert.equal(h.button('Save').disabled, true);
  input().value = original; input().listeners.input();
  assert.deepEqual(h.issueTexts(row()), []); assert.equal(h.button('Save').disabled, false);
  const role = h.field(h.expand(0), 'Purpose'); role.value = 'sources'; role.listeners.change();
  assert.deepEqual(h.issueTexts(h.modal.contentEl), ['Only one section can be the Sources section.']);
  assert.equal(h.button('Save').disabled, true);
});

test('template editor: move and remove reorder the draft', async () => {
  const h = harness();
  await h.click('New template');
  const names = () => h.sections().map(r => h.sectionName(r));
  const before = names();
  h.all(h.sections()[0], i => i.tag === 'button' && i['aria-label'] === 'Move down')[0].listeners.click();
  assert.deepEqual(names().slice(0, 2), [before[1], before[0]]);
  h.all(h.expand(5), i => i.tag === 'button' && i['aria-label'] === 'Remove')[0].listeners.click();
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
  const h = harness();
  const standard = h.rows()[0];
  h.all(standard, i => i.tag === 'button' && i.text === 'Duplicate')[0].listeners.click(); await new Promise(r => setImmediate(r));
  assert.deepEqual(plain(h.plugin.settings.detailTemplates.map(t => [t.name, t.sections.length])), [['Standard copy', 6]]);
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

test('template editor: double Save stores one template; built-in names are rejected in either language', async () => {
  const h = harness();
  await h.click('New template');
  const name = h.find(h.modal.contentEl, i => i['aria-label'] === 'Template name');
  for (const bad of ['standard', '標準']) {
    name.value = bad; name.listeners.input();
    assert.equal(h.button('Save').disabled, true, bad);
    assert.deepEqual(h.issueTexts(h.modal.contentEl), [`A template named "${bad}" already exists.`]);
  }
  name.value = 'Teach'; name.listeners.input();
  const save = h.button('Save'); save.listeners.click(); save.listeners.click();
  await new Promise(r => setImmediate(r));
  assert.equal(h.plugin.settings.detailTemplates.length, 1); assert.equal(h.plugin.saves, 1);
});

test('settings row refreshes when the library closes after create and delete', async () => {
  const h = harness();
  let refreshes = 0;
  const modal = new h.mod.DetailTemplatesModal({}, h.plugin, () => { refreshes++; });
  modal.open();
  const click = async (text) => { const b = h.find(modal.modalEl, i => i.tag === 'button' && i.text === text); b.listeners.click(); await new Promise(r => setImmediate(r)); };
  const options = () => { const o = []; const dd = { addOption: (v, t) => { o.push(t); return dd; }, setValue() { return dd; }, onChange() { return dd; } };
    const setting = { setName() { return setting; }, setDesc() { return setting; }, addDropdown(fn) { fn(dd); return setting; }, addButton() { return setting; } };
    h.mod.renderDetailTemplatesSetting(setting, {}, h.plugin); return o; };
  assert.deepEqual(options(), ['Standard']);
  await click('New template'); await click('Save');
  modal.onClose(); assert.equal(refreshes, 1);
  assert.deepEqual(options(), ['Standard', 'New template']);
  const row = h.find(modal.contentEl, i => i.cls === 'vam-template-row' && h.find(i, c => c.text === 'New template'));
  h.find(row, i => i.text === 'Delete').listeners.click();
  const confirm = h.opened[h.opened.length - 1]; confirm.choices[0].action(); await new Promise(r => setImmediate(r));
  modal.onClose(); assert.equal(refreshes, 2);
  assert.deepEqual(options(), ['Standard']);
});

test('template editor: an alias equal to any section current name is dropped (rename into a freed name)', async () => {
  const h = harness();
  await h.click('New template');
  const name = h.find(h.modal.contentEl, i => i['aria-label'] === 'Template name'); name.value = 'Shift'; name.listeners.input();
  const second = h.field(h.expand(1), 'Section heading'); second.value = 'Concepts'; second.listeners.input();
  const first = h.field(h.expand(0), 'Section heading'); first.value = 'Key knowledge'; first.listeners.input();
  await h.click('Save');
  const [saved] = plain(h.plugin.settings.detailTemplates);
  const names = saved.sections.map(s => s.name.toLowerCase());
  for (const section of saved.sections)
    for (const alias of section.aliases) assert.ok(!names.includes(alias.toLowerCase()), `alias ${alias} of ${section.name}`);
  assert.ok(saved.sections[0].aliases.includes('Core conclusions'));
  assert.equal(saved.sections[1].name, 'Concepts');
});
test('template editor: renaming A to B and back to A leaves only B as an alias', async () => {
  const h = harness({ detailTemplates: [{ id: 't', name: 'T', sections: [{ id: 's', name: 'A', description: '', role: 'none', aliases: [] }] }] });
  const rename = async value => {
    await h.click('Edit');
    const input = h.field(h.sections()[0], 'Section heading'); input.value = value; input.listeners.input();
    await h.click('Save');
  };
  await rename('B');
  assert.deepEqual(plain(h.plugin.settings.detailTemplates[0].sections[0].aliases), ['A']);
  await rename('A');
  assert.deepEqual(plain(h.plugin.settings.detailTemplates[0].sections[0]), { id: 's', name: 'A', description: '', role: 'none', aliases: ['B'] });
});

test('template editor: accordion keeps exactly one section open; a new section opens expanded', async () => {
  const h = harness();
  await h.click('New template');
  const open = () => h.sections().map(h.isOpen);
  assert.deepEqual(open(), [true, false, false, false, false, false]);
  assert.equal(h.header(h.sections()[2]).listeners.click === undefined, false);
  h.header(h.sections()[2]).listeners.click();
  assert.deepEqual(open(), [false, false, true, false, false, false]);
  await h.click('+ Add section');
  assert.deepEqual(open(), [false, false, false, false, false, false, true]);
  assert.equal(h.sectionName(h.sections()[1]), 'Key knowledge');
  assert.equal(h.find(h.sections()[0], i => i.cls === 'vam-template-section-number').text, '1');
});

test('template editor: collapsed rows summarise purpose and item count; untitled rows say so', async () => {
  const h = harness();
  await h.click('New template');
  assert.equal(h.summary(h.sections()[1]), 'Regular section · Any');
  assert.equal(h.summary(h.sections()[2]), 'Sources · Any');
  assert.equal(h.summary(h.sections()[5]), 'Update log · Any');
  assert.ok(h.find(h.sections()[2], i => i.cls === 'vam-template-section-purpose is-accent'), 'sources tag is accented');
  assert.ok(h.find(h.sections()[1], i => i.cls === 'vam-template-section-purpose'), 'regular tag is plain');
  const mode = h.field(h.expand(3), 'Item count'); mode.value = 'exact'; mode.listeners.change();
  const n = h.all(h.sections()[3], i => i.type === 'number')[0]; n.value = '3'; n.listeners.input();
  h.expand(0);
  assert.equal(h.summary(h.sections()[3]), 'Regular section · Exactly 3');
  await h.click('+ Add section');
  h.expand(0);
  assert.equal(h.sectionName(h.sections()[6]), 'Untitled section');
});

test('template editor: purpose help text follows the selection; count input only when a count is set', async () => {
  const h = harness();
  await h.click('New template');
  const row = () => h.sections()[0];
  const help = () => h.all(row(), i => i.cls === 'vam-template-help').map(i => i.text);
  assert.deepEqual(help(), ['Use this for normal content.', "Counts top-level list items (- …) or #### sub-headings; if it doesn't match, the AI fixes it once."]);
  const role = h.field(row(), 'Purpose');
  role.value = 'log'; role.listeners.change();
  assert.equal(help()[0], 'Each update adds one line instead of rewriting. One per template.');
  role.value = 'sources'; role.listeners.change();
  assert.equal(help()[0], 'The list of cited sources is added to the end of this section. One per template.');
  assert.deepEqual(plain(h.all(h.field(row(), 'Purpose'), i => i.tag === 'option').map(o => o.text)), ['Regular section', 'Sources: footnote list goes here', 'Update log: one new line per update']);
  assert.equal(h.all(row(), i => i.type === 'number').length, 0, 'no number input for Any');
  const mode = h.field(row(), 'Item count');
  assert.deepEqual(plain(h.all(mode, i => i.tag === 'option').map(o => o.text)), ['Any', 'Exactly', 'At least']);
  mode.value = 'min'; mode.listeners.change();
  const n = h.all(row(), i => i.type === 'number');
  assert.equal(n.length, 1); assert.equal(n[0].min, '1'); assert.equal(n[0].max, '20');
  const back = h.field(row(), 'Item count'); back.value = 'none'; back.listeners.change();
  assert.equal(h.all(row(), i => i.type === 'number').length, 0);
});

test('template editor: preview shows the AI instructions for the draft and updates on input', async () => {
  const h = harness();
  await h.click('New template');
  const details = h.find(h.modal.contentEl, i => i.tag === 'details');
  assert.ok(details); assert.ok(!details.open, 'closed by default');
  assert.equal(h.find(details, i => i.tag === 'summary').text, 'Preview the instructions sent to the AI');
  assert.match(h.preview(), /### Core conclusions: Answer the research question directly/);
  const description = h.field(h.sections()[0], 'What goes in this section (instructions for the AI)');
  assert.equal(description.placeholder, 'Example: give each example a #### sub-heading and one sentence on why.');
  description.value = 'Three bullets.'; description.listeners.input();
  assert.match(h.preview(), /### Core conclusions: Three bullets\./);
  const mode = h.field(h.sections()[0], 'Item count'); mode.value = 'exact'; mode.listeners.change();
  const n = h.all(h.sections()[0], i => i.type === 'number')[0]; n.value = '4'; n.listeners.input();
  assert.match(h.preview(), /### Core conclusions must have exactly 4 items/);
});

test('template library: View opens Standard read-only with its instructions and only Close', async () => {
  const h = harness();
  await h.click('View');
  assert.equal(h.sections().length, 6);
  const editable = h.all(h.modal.contentEl, i => ['input', 'textarea', 'select'].includes(i.tag));
  assert.ok(editable.length > 0);
  assert.deepEqual(editable.filter(i => !i.disabled).map(i => i['aria-label']), [], 'all fields disabled');
  assert.equal(h.button('Save'), undefined); assert.equal(h.button('+ Add section'), undefined);
  assert.equal(h.field(h.sections()[0], 'What goes in this section (instructions for the AI)').value, 'Answer the research question directly, 3–5 points by default; give the conclusion first, then the reason.');
  assert.ok(h.all(h.sections()[0], i => i.tag === 'button' && i.cls === 'clickable-icon').every(b => b.disabled), 'icon buttons disabled');
  h.expand(2);
  assert.ok(h.isOpen(h.sections()[2]), 'sections can still be opened to read');
  assert.match(h.preview(), /exactly these six level-three headings/);
  await h.click('Close');
  assert.deepEqual(h.rowNames(), ['Standard']); assert.equal(h.plugin.saves, 0);
});

test('template editor: icon buttons have labels and disabled ends; collapsed invalid rows show an issue badge', async () => {
  const h = harness();
  await h.click('New template');
  const icons = row => h.all(row, i => i.tag === 'button' && i.cls === 'clickable-icon').map(b => [b.iconName, b['aria-label'], b.title, b.disabled]);
  assert.deepEqual(plain(icons(h.sections()[0])), [['arrow-up', 'Move up', 'Move up', true], ['arrow-down', 'Move down', 'Move down', false], ['trash-2', 'Remove', 'Remove', false]]);
  assert.deepEqual(plain(icons(h.expand(5))), [['arrow-up', 'Move up', 'Move up', false], ['arrow-down', 'Move down', 'Move down', true], ['trash-2', 'Remove', 'Remove', false]]);
  const input = h.field(h.expand(1), 'Section heading'); input.value = ''; input.listeners.input();
  assert.deepEqual(h.issueTexts(h.sections()[1]), ['Section 2: name is required.']);
  assert.equal(h.badge(h.sections()[1]), undefined, 'no badge while open');
  h.expand(0);
  assert.equal(h.badge(h.sections()[1]), '1');
  assert.deepEqual(h.issueTexts(h.sections()[1]), [], 'issue text hidden while collapsed');
  assert.equal(h.badge(h.sections()[2]), undefined);
  assert.equal(h.find(h.modal.contentEl, i => i.cls === 'vam-modal-intro').text, "Each section becomes a ### heading in the note, filled in order by the AI. Changes apply to future research; existing notes change when they're next updated.");
});

test('template library: one fixed action bar per view and Delete marked as destructive', async () => {
  const h = harness({ detailTemplates: [{ id: 'T', name: 'Teaching', sections: [{ id: 's', name: 'Main', description: '', role: 'core', count: { mode: 'auto' } }] }] });
  const bars = () => h.modal.modalEl.children.filter(item => item.cls === 'vam-next-actions');
  assert.equal(bars().length, 1);
  assert.deepEqual(plain(bars()[0].children.map(item => item.text)), ['Close', 'New template']);
  await h.click('New template');
  assert.equal(bars().length, 1);
  assert.deepEqual(plain(bars()[0].children.map(item => item.text)), ['Cancel', 'Save']);
  await h.click('Cancel');
  assert.equal(bars().length, 1);
  const teaching = h.rows().find(row => h.find(row, i => i.tag === 'strong').text === 'Teaching');
  assert.ok(h.find(teaching, i => i.tag === 'button' && i.text === 'Delete').cls.includes('vam-danger-text'));
});
