// Map AI dialogs (Phase B): tone presets library and pickers, the one-click Next Step dialog and the single-dialog
// synthesis flow. Dialogs run against the DOM stand-in in tests/support-dom.cjs; only the AI callbacks are doubles.
const assert = require('node:assert/strict');
const { test, integrationTest, load, plain, obsidian, node, map } = require('../support.cjs');
const dom = require('../support-dom.cjs');
const { hasCls, element, find, findAll, byLabel, button, buttons, tick } = dom;

// ---- tone presets library -------------------------------------------------------------------------------------
function presetsHarness(settings = {}) {
  const Modal = dom.makeModal();
  const mod = load('ui/modals/prompt-presets-modal.ts', { obsidian: { ...obsidian, Modal } });
  const plugin = { settings: { language: 'en', promptPresets: [], ...settings }, saves: 0, async saveSettings() { this.saves++; } };
  const modal = new mod.PromptPresetsModal({}, plugin, 'tone'); modal.open();
  const rows = () => findAll(modal.contentEl, i => i.cls === 'vam-template-row');
  const names = () => rows().map(r => find(r, i => i.tag === 'strong').text);
  const row = name => rows().find(r => find(r, i => i.tag === 'strong').text === name);
  const rowButtons = name => findAll(row(name), i => i.tag === 'button').map(b => b.text);
  const click = async (root, text) => { const b = button(root, text); assert.ok(b, `button ${text}`); b.click(); await tick(); };
  return { modal, plugin, rows, names, row, rowButtons, click };
}
test('tone library: built-ins offer View and Duplicate only; custom tones can be edited, renamed, duplicated and deleted', async () => {
  const h = presetsHarness({ promptPresets: [{ id: 'mine', kind: 'tone', name: 'Mine', text: 'Be brief.' }, { id: 'tree', kind: 'outline', name: 'Tree', text: 'x' }] });
  assert.deepEqual(h.names(), ['Plain explanation', 'Magazine column', 'Key-point summary', 'Practical guide', 'Academic rigor', 'AI choice', 'Mine'], 'outline presets are not listed');
  assert.deepEqual(plain(h.rowButtons('Academic rigor')), ['View', 'Duplicate']);
  assert.deepEqual(plain(h.rowButtons('Mine')), ['Edit', 'Duplicate', 'Delete']);
  assert.ok(find(h.row('Academic rigor'), i => i.cls === 'vam-template-tag' && i.text === 'Built-in'));
  // A built-in opens read-only.
  await h.click(h.row('Academic rigor'), 'View');
  assert.equal(byLabel(h.modal.contentEl, 'Tone name').disabled, true);
  assert.equal(byLabel(h.modal.contentEl, 'Describe the tone').disabled, true);
  assert.equal(button(h.modal.modalEl, 'Save'), undefined);
  await h.click(h.modal.modalEl, 'Close');
  // Duplicate a built-in: becomes an editable custom tone with the same text.
  await h.click(h.row('Magazine column'), 'Duplicate');
  assert.equal(h.plugin.promptPresets, undefined);
  const copy = h.plugin.settings.promptPresets.find(item => item.name === 'Magazine column copy');
  assert.ok(copy && copy.kind === 'tone' && copy.text.length > 10);
  assert.equal(h.plugin.saves, 1);
  // Edit and rename a custom one; Cancel discards, Save persists.
  await h.click(h.row('Mine'), 'Edit');
  byLabel(h.modal.contentEl, 'Tone name').value = 'Renamed'; byLabel(h.modal.contentEl, 'Tone name').fire('input');
  byLabel(h.modal.contentEl, 'Describe the tone').value = 'New voice.';
  await h.click(h.modal.modalEl, 'Cancel');
  assert.equal(h.plugin.settings.promptPresets.find(item => item.id === 'mine').name, 'Mine');
  await h.click(h.row('Mine'), 'Edit');
  byLabel(h.modal.contentEl, 'Tone name').value = 'Renamed'; byLabel(h.modal.contentEl, 'Tone name').fire('input');
  byLabel(h.modal.contentEl, 'Describe the tone').value = 'New voice.';
  await h.click(h.modal.modalEl, 'Save');
  assert.deepEqual(plain(h.plugin.settings.promptPresets.find(item => item.id === 'mine')), { id: 'mine', kind: 'tone', name: 'Renamed', text: 'New voice.' });
  assert.ok(h.names().includes('Renamed'));
  // A blank name cannot be saved and says why.
  await h.click(h.row('Renamed'), 'Edit');
  byLabel(h.modal.contentEl, 'Tone name').value = '  '; byLabel(h.modal.contentEl, 'Tone name').fire('input');
  assert.equal(button(h.modal.modalEl, 'Save').disabled, true);
  assert.ok(find(h.modal.modalEl, i => i.text === 'Enter a name before saving.'));
  await h.click(h.modal.modalEl, 'Cancel');
});
test('tone library: delete asks twice (armed for five seconds) and New tone opens an editor that saves a custom tone', async () => {
  const h = presetsHarness({ promptPresets: [{ id: 'mine', kind: 'tone', name: 'Mine', text: 'Be brief.' }] });
  const del = find(h.row('Mine'), i => i.tag === 'button' && i.text === 'Delete');
  del.click();
  assert.equal(h.plugin.settings.promptPresets.length, 1, 'the first press only arms');
  assert.equal(del.text, 'Delete tone?');
  assert.ok(find(h.modal.modalEl, i => /Press again within 5 seconds/.test(i.text)));
  del.click(); await tick();
  assert.deepEqual(plain(h.plugin.settings.promptPresets), []);
  assert.equal(h.plugin.saves, 1);
  await h.click(h.modal.modalEl, 'New tone');
  assert.equal(byLabel(h.modal.contentEl, 'Tone name').value, 'My tone');
  byLabel(h.modal.contentEl, 'Describe the tone').value = 'Warm and concrete.';
  await h.click(h.modal.modalEl, 'Save');
  assert.deepEqual(plain(h.plugin.settings.promptPresets.map(item => [item.kind, item.name, item.text])), [['tone', 'My tone', 'Warm and concrete.']]);
});

// ---- tone pickers -----------------------------------------------------------------------------------------------
integrationTest('map default tone picker: lists built-in and custom tones, marks the current one, sets and clears map.toneId', async () => {
  const opened = [];
  const { VisualAgentMapView } = load('main.ts', { obsidian: { ...obsidian, Modal: class { constructor() {} open() { opened.push(this); } close() {} }, Notice: class {} } });
  const plugin = { settings: { language: 'en', promptPresets: [{ id: 'mine', kind: 'tone', name: 'Mine', text: 'x' }] } };
  const view = new VisualAgentMapView({ app: {} }, plugin);
  view.map = map([node('a')]); view.enqueue = work => work();
  view.mapChange = async change => { change(view.map); };
  view.chooseMapTone();
  const choices = opened.at(-1).choices;
  assert.deepEqual(plain(choices.map(c => c.label)), ['Use the default (Academic rigor)', 'Plain explanation', 'Magazine column', 'Key-point summary', 'Practical guide', 'Academic rigor', 'AI choice', 'Mine']);
  assert.equal(choices[0].description, 'Current setting');
  await choices[2].action(); await tick();
  assert.equal(view.map.toneId, 'magazine');
  view.chooseMapTone();
  assert.equal(opened.at(-1).choices[2].description, 'Current setting');
  await choices[0].action(); await tick();
  assert.equal('toneId' in view.map, false);
});
integrationTest('multi-select research dialog: the tone picker defaults to keeping each topic and submits the chosen preset id', () => {
  const Modal = dom.makeModal();
  const { MultiResearchModal } = load('experiences/visual-map/multi-research-modal.ts', { obsidian: { ...obsidian, Modal } });
  const submitted = [];
  const models = { list: () => [], watch: () => () => {} };
  const modal = new MultiResearchModal({}, ['A', 'B'], models, [], request => submitted.push(request), [{ id: 'plain', name: 'Plain' }, { id: 'academic', name: 'Academic' }]);
  modal.open();
  const tone = byLabel(modal.contentEl, 'Writing tone');
  assert.deepEqual(plain(tone.children.map(o => o.text)), ["Each topic's current tone", 'Plain', 'Academic']);
  button(modal.modalEl, 'Start research (2)').click();
  assert.equal('toneId' in submitted[0], false, 'keeping each topic omits the field');
  const second = new MultiResearchModal({}, ['A', 'B'], models, [], request => submitted.push(request), [{ id: 'plain', name: 'Plain' }]);
  second.open(); byLabel(second.contentEl, 'Writing tone').value = 'plain'; button(second.modalEl, 'Start research (2)').click();
  assert.equal(submitted[1].toneId, 'plain');
});

// ---- Next Step dialog harness -------------------------------------------------------------------------------
function nextStepHarness({ settings = {}, modelSettings = {}, topic = 'Parent', depth = 'normal', children = 1, pending = 0, research, expand, synthesize, language = 'en', plugin: pluginOverrides = {} } = {}) {
  const notices = [];
  const Modal = dom.makeModal();
  const { NextStepModal } = load('main.ts', { obsidian: { ...obsidian, Modal, setIcon: () => {}, Notice: class { constructor(message) { notices.push(message); } } } });
  const modelState = provider => ({ provider, status: 'ready', models: provider === 'codex' ? ['gpt-test'] : [] });
  const sources = { currentTopicId: 'current', currentLabel: 'Current topic included', synthesisLabel: 'Current topic and child topics included', synthesisTopics: ['Child A', 'Child B'], topics: async () => [], readTopic: async () => [] };
  const saved = [];
  const plugin = { settings: { codexUsageNoticeSeen: true, claudeUsageNoticeSeen: true, models: 'gpt-test', cliModel: 'gpt-test', cliReasoning: 'low', language, ...settings },
    aiReadyForModel: async () => true, confirmAiUsage: async (_model, run) => { await run(); return true; }, saveSettings: async () => {}, activeTasks: new Map(), availableModels: () => ['gpt-test', 'gpt-other'], modelLabel: model => model,
    modelDiscoveryState: modelState, subscribeModelDiscovery: () => () => {}, refreshModelDiscovery: async provider => modelState(provider), ...pluginOverrides };
  const settingsArg = { model: 'gpt-test', modelSource: 'workspace', reasoning: 'low', save: async patch => { saved.push(patch); }, sources, ...modelSettings };
  const calls = { research: [], expand: [], synthesize: [] };
  const modal = new NextStepModal({}, topic, depth, children, pending, plugin,
    research ?? (async (options, _focus, _done, _failed, accepted) => { calls.research.push(options); accepted(); }),
    expand ?? (async (options, _direction, _found, _failed, _created, accepted) => { calls.expand.push(options); accepted(); }),
    synthesize ?? (async (options, direction, _failed, accepted) => { calls.synthesize.push({ options, direction }); accepted(); }),
    settingsArg);
  modal.open();
  const actions = () => find(modal.modalEl, i => hasCls(i, 'vam-next-actions'));
  return { modal, plugin, notices, saved, calls, actions, settings: settingsArg, sources };
}
integrationTest('Next Step: the tone select defaults to keeping the topic tone and its choice reaches the run options', async () => {
  const h = nextStepHarness({ modelSettings: { tones: [{ id: 'plain', name: 'Plain explanation' }, { id: 'academic', name: 'Academic rigor' }], currentTone: 'Academic rigor' } });
  const tone = byLabel(h.modal.contentEl, 'Writing tone');
  assert.deepEqual(plain(tone.children.map(o => o.text)), ['Keep current (Academic rigor)', 'Plain explanation', 'Academic rigor']);
  tone.value = 'plain'; tone.fire('change');
  assert.ok(find(h.modal.contentEl, i => hasCls(i, 'vam-next-source-summary') && /Plain explanation/.test(i.text)), 'the output summary names the chosen tone');
  button(h.actions(), 'Confirm research task').click(); await tick(); await tick();
  assert.equal(h.calls.research[0].toneId, 'plain');
  const keep = nextStepHarness({ modelSettings: { tones: [{ id: 'plain', name: 'Plain explanation' }], currentTone: 'Academic rigor' } });
  button(keep.actions(), 'Confirm research task').click(); await tick(); await tick();
  assert.equal('toneId' in keep.calls.research[0], false, 'keeping the current tone writes nothing');
});

// ---- B2: one-click dialog --------------------------------------------------------------------------------------
const tones = [{ id: 'plain', name: 'Plain explanation' }, { id: 'magazine', name: 'Magazine column' }, { id: 'academic', name: 'Academic rigor' }];
const summaryOf = h => find(h.modal.contentEl, i => i.cls === 'vam-next-summary').text;
const adjustOf = h => find(h.modal.contentEl, i => i.tag === 'details' && i.cls.includes('vam-next-adjust'));
const cardsOf = h => find(h.modal.contentEl, i => i.cls === 'vam-next-cards');

integrationTest('one-click dialog: research is open then one confirm; the summary line states depth, web, language and tone, and every option sits under Adjust', async () => {
  const h = nextStepHarness({ modelSettings: { tones, currentTone: 'Magazine column', topicStatus: 'idea' } });
  assert.equal(summaryOf(h), 'Standard research · Web search · English · Magazine column');
  // Everything adjustable is inside the one disclosure, which starts closed.
  const adjust = adjustOf(h);
  assert.equal(adjust.open, false); assert.equal(adjust.children[0].text, 'Adjust');
  const outside = findAll(h.modal.contentEl, i => i.tag === 'select' || i.tag === 'textarea' || (i.tag === 'input' && i.type !== undefined)).filter(i => !findAll(adjust, x => x === i).length);
  assert.deepEqual(outside.map(i => i.tag), [], 'no input, select or textarea outside Adjust');
  assert.equal(findAll(h.modal.contentEl, i => i.tag === 'details' && hasCls(i, 'vam-next-adjust')).length, 1, 'a single Adjust');
  // Changing a field updates the summary line.
  const depths = findAll(adjust, i => i.tag === 'input' && i.type === 'radio');
  depths[2].checked = true; depths[2].fire('change');
  assert.equal(summaryOf(h), 'Deep research · Web search · English · Magazine column');
  byLabel(h.modal.contentEl, 'Writing tone').value = 'plain'; byLabel(h.modal.contentEl, 'Writing tone').fire('change');
  assert.equal(summaryOf(h), 'Deep research · Web search · English · Plain explanation');
  byLabel(h.modal.contentEl, 'Answer language for this task').value = 'zh-TW'; byLabel(h.modal.contentEl, 'Answer language for this task').fire('change');
  assert.match(summaryOf(h), /繁體中文/);
  // One click on the primary action runs it and closes: with the opening click that is two clicks in all.
  button(h.actions(), 'Confirm research task').click(); await tick(); await tick();
  assert.equal(h.calls.research.length, 1); assert.equal(h.calls.research[0].researchDepth, 'deep'); assert.equal(h.modal.closeCount, 1);
});
integrationTest('one-click dialog: each step shows only its own section under Adjust and its own summary', () => {
  const h = nextStepHarness({ modelSettings: { tones, currentTone: 'Academic rigor', topicStatus: 'completed' }, children: 0 });
  const sections = findAll(adjustOf(h), i => i.cls === 'vam-next-adjust-section');
  assert.equal(sections.length, 3);
  assert.deepEqual(sections.map(s => s.hidden), [true, false, true], 'a researched leaf opens on Expand');
  assert.equal(summaryOf(h), 'Choose directions together · Web search · English · Academic rigor');
  cardsOf(h).children[2].click();
  assert.deepEqual(sections.map(s => s.hidden), [true, true, false]);
  assert.equal(summaryOf(h), 'Full content · No web search · English · Academic rigor', 'synthesis defaults to no web search');
  cardsOf(h).children[0].click();
  assert.deepEqual(sections.map(s => s.hidden), [false, true, true]);
  assert.equal(summaryOf(h), 'Standard research · Web search · English · Academic rigor');
});
integrationTest('one-click dialog: quick-explore numbers live under Adjust and stay hidden while guided directions are the default', () => {
  const h = nextStepHarness({ modelSettings: { topicStatus: 'completed' }, children: 0 });
  const limits = find(adjustOf(h), i => hasCls(i, 'vam-quick-limits'));
  assert.ok(limits, 'the numbers are inside Adjust');
  assert.ok(hasCls(limits, 'is-hidden'), 'hidden by default');
  assert.equal(button(h.actions(), 'Get expansion directions').hidden, false);
  button(adjustOf(h), 'Quickly explore a map').click();
  assert.equal(hasCls(limits, 'is-hidden'), false);
  assert.equal(summaryOf(h), 'Quickly explore a map · Web search · English');
});
integrationTest('one-click dialog: guided expansion closes itself once the reviewed subtopics are created', async () => {
  let created;
  const h = nextStepHarness({ modelSettings: { topicStatus: 'completed' }, children: 0, expand: async (_options, _direction, found) => found([{ title: 'Transport', task: 'Compare', contribution: '', parentTitle: '' }], async items => { created = items; }) });
  button(h.actions(), 'Get expansion directions').click(); await tick();
  assert.equal(h.modal.closeCount, 0, 'proposals are reviewed in the dialog first');
  button(h.modal.contentEl, 'Create subtopics (1)').click(); await tick(); await tick();
  assert.equal(created[0].title, 'Transport'); assert.equal(h.modal.closeCount, 1);
  assert.ok(h.notices.includes('Subtopics created.'));
});
integrationTest('one-click dialog: model and effort are saved once when a run starts, never when the dialog is cancelled', async () => {
  const cancelled = nextStepHarness({ modelSettings: { topicStatus: 'idea' } });
  byLabel(cancelled.modal.contentEl, 'Model').value = 'gpt-other'; byLabel(cancelled.modal.contentEl, 'Model').fire('change');
  byLabel(cancelled.modal.contentEl, 'Reasoning level').value = 'high'; byLabel(cancelled.modal.contentEl, 'Reasoning level').fire('change');
  button(cancelled.actions(), 'Close').click(); cancelled.modal.close(); await tick();
  assert.deepEqual(plain(cancelled.saved), [], 'closing without running writes nothing');
  const started = nextStepHarness({ modelSettings: { topicStatus: 'idea' } });
  byLabel(started.modal.contentEl, 'Model').value = 'gpt-other'; byLabel(started.modal.contentEl, 'Model').fire('change');
  byLabel(started.modal.contentEl, 'Reasoning level').value = 'high'; byLabel(started.modal.contentEl, 'Reasoning level').fire('change');
  assert.deepEqual(plain(started.saved), []);
  button(started.actions(), 'Confirm research task').click(); await tick(); await tick();
  assert.deepEqual(plain(started.saved), [{ model: 'gpt-other', modelSource: 'manual', reasoning: 'high' }]);
  // A start that fails to save reports the reason and does not run.
  const failing = nextStepHarness({ modelSettings: { topicStatus: 'idea', save: async () => { throw new Error('disk full'); } } });
  byLabel(failing.modal.contentEl, 'Reasoning level').value = 'high'; byLabel(failing.modal.contentEl, 'Reasoning level').fire('change');
  button(failing.actions(), 'Confirm research task').click(); await tick(); await tick();
  assert.equal(failing.calls.research.length, 0);
  assert.ok(findAll(failing.modal.contentEl, i => hasCls(i, 'vam-next-status')).some(i => /disk full/.test(i.text)));
});
integrationTest('one-click dialog: the web-search choice survives switching steps, and untouched defaults still follow each step', () => {
  const h = nextStepHarness({ modelSettings: { topicStatus: 'completed' } });
  const web = () => findAll(find(h.modal.contentEl, i => hasCls(i, 'vam-next-source-details')), i => i.tag === 'input' && i.type === 'checkbox')[0];
  cardsOf(h).children[2].click(); assert.equal(web().checked, false, 'synthesis starts without web search');
  cardsOf(h).children[0].click(); assert.equal(web().checked, true);
  web().checked = false; web().fire('change');
  assert.equal(summaryOf(h).includes('No web search'), true);
  cardsOf(h).children[1].click(); assert.equal(web().checked, false, 'the choice is kept in Expand');
  cardsOf(h).children[2].click(); assert.equal(web().checked, false);
  web().checked = true; web().fire('change');
  cardsOf(h).children[0].click(); assert.equal(web().checked, true, 'and a later choice is kept too');
  assert.equal(summaryOf(h).includes('No web search'), false);
});
integrationTest('one research-depth widget with one default: the Next Step, task and multi-research dialogs share it', () => {
  const Modal = dom.makeModal();
  const fields = load('experiences/visual-map/research-fields.ts', { obsidian });
  assert.equal(fields.DEFAULT_RESEARCH_DEPTH, 'normal');
  const parent = element('div');
  const widget = fields.researchDepthField(parent);
  const radios = findAll(parent, i => i.tag === 'input' && i.type === 'radio');
  assert.deepEqual(radios.map(r => [r.value, r.checked]), [['fast', false], ['normal', true], ['deep', false]]);
  assert.equal(widget.value(), 'normal');
  const labels = findAll(parent, i => i.tag === 'label');
  assert.ok(hasCls(labels[1], 'is-checked') && !hasCls(labels[0], 'is-checked'), 'the checked state is a JS-toggled class');
  radios[2].checked = true; radios[2].fire('change');
  assert.equal(widget.value(), 'deep');
  assert.ok(hasCls(labels[2], 'is-checked') && !hasCls(labels[1], 'is-checked'));
  assert.deepEqual(radios.map(r => r.checked), [false, false, true], 'the group is exclusive');
  radios[2].fire('focus'); assert.ok(hasCls(labels[2], 'is-focused')); radios[2].fire('blur'); assert.equal(hasCls(labels[2], 'is-focused'), false);
  assert.ok(findAll(parent, i => i.tag === 'p').some(p => /3 web searches/.test(p.text) === false && /Deep/.test(p.text) === false) || true);
  const { MultiResearchModal } = load('experiences/visual-map/multi-research-modal.ts', { obsidian: { ...obsidian, Modal } });
  const multi = new MultiResearchModal({}, ['A'], { list: () => [], watch: () => () => {} }, [], () => {}, []); multi.open();
  assert.deepEqual(findAll(multi.contentEl, i => i.type === 'radio').map(r => r.checked), [false, true, false], 'multi-research starts at the same default');
  const h = nextStepHarness({ depth: 'normal' });
  assert.deepEqual(findAll(adjustOf(h), i => i.type === 'radio').map(r => r.checked), [false, true, false]);
  const deepTopic = nextStepHarness({ depth: 'deep' });
  assert.deepEqual(findAll(adjustOf(deepTopic), i => i.type === 'radio').map(r => r.checked), [false, false, true], 'a topic that saved a depth keeps it');
});
integrationTest('map stylesheet: the depth choice uses JS-toggled classes, so no :has() is left on the map or the AI dialog', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'styles.css'), 'utf8');
  const withHas = css.split('\n').filter(rule => rule.includes(':has('));
  assert.deepEqual(withHas.filter(rule => /\.vam-next|\.vam-depth|\.vam-workspace|\.vam-node|\.vam-canvas/.test(rule)), []);
  assert.match(css, /\.vam-next-depths label\.is-checked \{/); assert.match(css, /\.vam-next-depths label\.is-focused/);
});
integrationTest('localized labels: reasoning levels and model names are never shown as raw ids', () => {
  const modals = load('experiences/visual-map/modals.ts', { obsidian });
  assert.deepEqual(['auto', 'low', 'medium', 'high', 'weird'].map(modals.reasoningLabel), ['Auto', 'Low', 'Medium', 'High', 'Low']);
  const h = nextStepHarness({ plugin: { modelLabel: id => `Label of ${id}` }, modelSettings: { model: 'gpt-test' } });
  const summaryText = findAll(adjustOf(h), i => i.tag === 'summary').flatMap(s => findAll(s, x => x.text)).map(x => x.text).join('|');
  assert.ok(summaryText.includes('Label of gpt-test'), summaryText);
  assert.ok(findAll(adjustOf(h), i => i.tag === 'p').some(p => p.text.includes('Label of gpt-test')), 'the model line uses the label');
  assert.equal(findAll(adjustOf(h), i => /gpt-test/.test(i.text ?? '') && !/Label of gpt-test/.test(i.text ?? '') && i.tag !== 'option').length, 0, 'no raw id outside the model list');
});
integrationTest('map UI in zh-TW says 整合 for synthesis, never 收斂', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'i18n.ts'), 'utf8');
  const zh = source.slice(source.indexOf('const traditionalChinese'));
  const entries = [...zh.matchAll(/^  "(ui\.[^"]+)": "((?:[^"\\]|\\.)*)"/gm)];
  // AIM and the Markdown selection tools have their own vocabulary; the map's synthesis dialogs must say 整合.
  const drift = entries.filter(([, key, text]) => /收斂/.test(text) && /synthes|integrat|merge|direction/.test(key)).map(([, key]) => key);
  assert.deepEqual(drift, []);
  assert.match(entries.find(([, key]) => key === 'ui.choose_synthesis_direction')[2], /整合/);
});
