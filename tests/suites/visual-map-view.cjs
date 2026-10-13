const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, integrationTest, root, load, node, map, plain, obsidian, DEFAULT_SETTINGS, until } = require('../support.cjs');
integrationTest('node plus adds a child without opening a duplicate right-click menu', () => {
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const events = new Map(), buttons = [];
  const element = tag => ({ tag, children: [], dataset: {}, style: {},
    createDiv(options) { const child = element('div'); child.cls = options?.cls ?? options; this.children.push(child); return child; },
    createEl(name, options) { const child = element(name); child.text = options?.text; this.children.push(child); if (name === 'button') buttons.push(child); return child; },
    createSpan(options) { const child = element('span'); child.text = options?.text; this.children.push(child); return child; },
    setAttr(name, value) { this[name] = value; }, addClass(name) { this.cls = name; }, setPointerCapture() {},
    addEventListener(name, handler) { events.set(`${tag}:${name}`, handler); if (tag === 'button') this.click = handler; }, removeEventListener() {}
  });
  const topic = node('parent');
  let detailsShown = false;
  const view = new VisualAgentMapView({ app: {} }, { pendingSuggestions: new Map([['parent.md', [{ title: 'Idea', task: 'Investigate', contribution: '' }]]]), expansionBatches: new Map(), detailsShown: () => detailsShown });
  view.stageEl = element('stage'); view.map = map([topic]);
  view.notes = new Map([[topic.id, { title: 'Parent', summary: '', status: 'completed' }]]);
  view.render = () => {};
  let added = 0, opened = [], details = [], next = [], renders = 0;
  view.addNode = () => { added++; }; view.enqueue = work => work(); view.openNodePanel = (topic, mode) => opened.push([topic.id, mode]);
  view.openDetails = topic => details.push(topic.id); view.openNextStep = topic => next.push(topic.id); view.render = () => { renders++; };
  view.renderNode(topic);
  const plus = buttons.find(button => button.text === '+');
  assert.equal(plus['aria-label'], 'Add subtopic manually');
  plus.click({ stopPropagation() {} });
  assert.equal(added, 1);
  const badge = buttons.find(button => button.text === 'View 1 expansion suggestions');
  badge.click({ stopPropagation() {} });
  buttons.find(button => button['aria-label'] === 'How would you like to explore next?').click({ stopPropagation() {} });
  buttons.find(button => button['aria-label'] === 'Structure and links').click({ stopPropagation() {} });
  assert.deepEqual(opened, [[topic.id, 'proposals'], [topic.id, 'structure']]); assert.deepEqual(next, [topic.id]);
  assert.equal(view.selected, null);
  events.get('div:click')({ target: { closest: () => null }, metaKey: false, ctrlKey: false });
  assert.equal(view.selected, topic.id); assert.equal(renders, 1); assert.deepEqual(details, [], 'a click selects without opening the sidebar note');
  view.selected = null; renders = 0; details.length = 0;
  events.get('div:keydown')({ key: 'Enter', target: view.stageEl.children[0] });
  assert.equal(view.selected, topic.id); assert.equal(renders, 1); assert.deepEqual(details, [topic.id]);
  view.selected = null; renders = 0; details.length = 0;
  view.mapChange = async () => {}; view.drawEdges = () => {};
  events.get('div:pointerdown')({ target: { closest: () => null }, button: 0, pointerId: 2, clientX: 10, clientY: 10 });
  events.get('div:pointermove')({ clientX: 14, clientY: 10 });
  events.get('div:pointerup')({ type: 'pointerup' });
  events.get('div:click')({ target: { closest: () => null }, metaKey: false, ctrlKey: false });
  assert.equal(view.selected, null, 'a >3px pointer movement is treated as a drag and its follow-on click is suppressed');
  assert.equal(renders, 0);
  events.get('div:pointerdown')({ target: { closest: () => null }, button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  events.get('div:pointerup')({ type: 'pointerup', clientX: 0, clientY: 0 });
  assert.deepEqual(details, [], 'a pointer tap selects without opening the sidebar note');
  assert.equal(opened.filter(([, mode]) => mode === 'edit').length, 0);
  view.suppressClickUntil = 0; events.get('div:click')({ target: { closest: () => null }, metaKey: false, ctrlKey: false });
  assert.deepEqual(details, []);
  detailsShown = true;
  events.get('div:click')({ target: { closest: () => null }, metaKey: false, ctrlKey: false });
  assert.deepEqual(details, [topic.id], 'an open details sidebar follows the clicked node');
  details.length = 0;
  events.get('div:pointerdown')({ target: { closest: () => null }, button: 0, pointerId: 3, clientX: 0, clientY: 0 });
  events.get('div:pointerup')({ type: 'pointerup', clientX: 0, clientY: 0 });
  assert.deepEqual(details, [topic.id], 'a tap also updates an open details sidebar');
  details.length = 0; detailsShown = false;
  events.get('div:keydown')({ key: 'Enter', target: view.stageEl.children[0] });
  assert.deepEqual(details, [topic.id], 'Enter remains the keyboard path to the sidebar note');
  assert.equal(events.has('div:contextmenu'), false);
});
integrationTest('AIM cards hide generic map actions while ordinary map cards retain them', () => {
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const makeElement = (tag, buttons) => ({ tag, children: [], dataset: {}, style: {},
    createDiv(options) { const child = makeElement('div', buttons); child.cls = options?.cls ?? options; this.children.push(child); return child; },
    createEl(name, options) { const child = makeElement(name, buttons); child.text = options?.text; this.children.push(child); if (name === 'button') buttons.push(child); return child; },
    createSpan(options) { const child = makeElement('span', buttons); child.text = options?.text; this.children.push(child); return child; },
    setAttr(name, value) { this[name] = value; }, addClass(name) { this.cls = name; }, setPointerCapture() {},
    addEventListener() {}, removeEventListener() {}
  });
  const topic = node('topic');
  const render = doc => {
    const buttons = [], view = new VisualAgentMapView({ app: {} }, { pendingSuggestions: new Map([['topic.md', [{ title: 'Idea', task: 'Research', contribution: '' }]]]), expansionBatches: new Map() });
    view.stageEl = makeElement('stage', buttons); view.map = doc; view.notes = new Map([[topic.id, { title: 'Topic', summary: '', status: 'completed' }]]);
    view.renderNode(topic); return buttons;
  };
  const ordinaryButtons = render(map([topic]));
  assert.ok(ordinaryButtons.some(button => button['aria-label'] === 'How would you like to explore next?'));
  assert.ok(ordinaryButtons.some(button => button['aria-label'] === 'Structure and links'));
  assert.ok(ordinaryButtons.some(button => button['aria-label'] === 'New topic name'));
  assert.ok(ordinaryButtons.some(button => button['aria-label'] === 'Add subtopic manually'));
  const aim = map([topic]); aim.aim = { version: 1, branches: [], runs: [], pendingCommits: [] };
  const aimButtons = render(aim);
  for (const label of ['How would you like to explore next?', 'Structure and links', 'New topic name', 'Add subtopic manually']) {
    assert.equal(aimButtons.some(button => button['aria-label'] === label), false, `${label} is hidden in AIM`);
  }
  const resultNode = node('saved-synthesis', topic.id); resultNode.aimKind = 'synthesis';
  const resultMap = map([topic, resultNode]);
  resultMap.aim = { version: 1, branches: [{ id: 'saved-branch', questionNodeId: topic.id, parentBranchId: null, answerSnapshot: { selections: [], freeText: '' }, inputSnapshot: { topic: 'Fixture', conditions: {}, upstreamResults: [] }, createdAt: '2026-10-09T00:00:00.000Z', results: [{ nodeId: resultNode.id, notePath: resultNode.path, version: 1, kind: 'synthesis' }] }], runs: [], pendingCommits: [] };
  const resultButtons = [], resultView = new VisualAgentMapView({ app: {} }, { pendingSuggestions: new Map(), expansionBatches: new Map() });
  resultView.stageEl = makeElement('stage', resultButtons); resultView.map = resultMap; resultView.notes = new Map([[resultNode.id, { title: 'Saved synthesis', summary: 'A saved result.', status: 'completed' }]]);
  resultView.renderNode(resultNode);
  const newQuestion = resultButtons.find(button => button['aria-label'] === 'Generate another question from this research, keeping existing branches');
  assert.ok(newQuestion, 'a saved synthesis exposes the new-question action'); assert.equal(newQuestion.disabled, false);
  resultView.aimBusy = true;
  const busyButtons = [], busyView = new VisualAgentMapView({ app: {} }, { pendingSuggestions: new Map(), expansionBatches: new Map() });
  busyView.stageEl = makeElement('stage', busyButtons); busyView.map = resultMap; busyView.notes = resultView.notes; busyView.aimBusy = true;
  busyView.renderNode(resultNode);
  assert.equal(busyButtons.find(button => button['aria-label'] === 'Generate another question from this research, keeping existing branches').disabled, true, 'the action is disabled while another AIM operation is active');
  const ordinaryResult = node('ordinary-synthesis'); ordinaryResult.aimKind = 'synthesis';
  const ordinaryButtonsForResult = [], ordinaryResultView = new VisualAgentMapView({ app: {} }, { pendingSuggestions: new Map(), expansionBatches: new Map() });
  ordinaryResultView.stageEl = makeElement('stage', ordinaryButtonsForResult); ordinaryResultView.map = map([ordinaryResult]); ordinaryResultView.notes = new Map([[ordinaryResult.id, { title: 'Ordinary note', summary: '', status: 'completed' }]]);
  ordinaryResultView.renderNode(ordinaryResult);
  assert.equal(ordinaryButtonsForResult.some(button => button['aria-label'] === 'Generate another question from this research, keeping existing branches'), false, 'ordinary maps do not expose the AIM action');
  assert.match(fs.readFileSync(path.join(root, 'experiences/visual-map/view.ts'), 'utf8'), /if \(!aimMode\) this\.button\(tools, t\("ui\.organize"\)/);
  assert.match(fs.readFileSync(path.join(root, 'experiences/visual-map/view.ts'), 'utf8'), /if \(!aimMode\) \{\s*const integrate = this\.button\(\s*tools/);
});
integrationTest('AIM question cards show branch progress instead of note lifecycle status', () => {
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const element = tag => ({ tag, children: [], dataset: {}, style: {},
    createDiv(options) { const child = element('div'); child.cls = options?.cls ?? options; this.children.push(child); return child; },
    createEl(name, options) { const child = element(name); child.text = options?.text; this.children.push(child); return child; },
    createSpan(options) { const child = element('span'); child.text = options?.text; this.children.push(child); return child; },
    setAttr(name, value) { this[name] = value; }, addClass(name) { this.cls = name; },
    addEventListener() {}, removeEventListener() {}, setPointerCapture() {}
  });
  const question = node('question'); question.aimKind = 'question';
  const branch = { id: 'branch', questionNodeId: question.id, parentBranchId: null, answerSnapshot: { selections: [], freeText: '已回答' }, inputSnapshot: { topic: '測試', conditions: {}, upstreamResults: [] }, createdAt: '2026-10-09T00:00:00.000Z', results: [{ kind: 'conclusion', runId: 'run', attemptId: 'attempt' }] };
  const doc = map([question]); doc.aim = { version: 1, branches: [branch], runs: [{ id: 'run', branchId: branch.id, currentAttemptId: 'attempt', attempts: [{ id: 'attempt', inputSnapshotHash: 'hash', status: 'completed' }] }], pendingCommits: [] };
  const plugin = { repo: {}, settings: { ...DEFAULT_SETTINGS }, expansionBatches: new Map(), running: new Map(), quickExpandPending: new Set(), pendingSuggestions: new Map() };
  const view = new VisualAgentMapView({ app: {} }, plugin); view.stageEl = element('stage'); view.map = doc; view.notes = new Map([[question.id, { title: 'Question', summary: 'Question', status: 'idea' }]]);
  view.renderNode(question);
  assert.equal(view.stageEl.children[0].children[0].children[0].text, 'Research complete');
  doc.aim.runs[0].attempts[0].status = 'running'; view.stageEl = element('stage'); view.renderNode(question);
  assert.equal(view.stageEl.children[0].children[0].children[0].text, 'Researching');
});
integrationTest('AIM outline keeps only note titles and hierarchy', () => {
  const { OutlineView } = load('ui/outline-view.ts', { obsidian });
  const element = (tag, options = {}) => ({ tag, text: options.text, cls: options.cls ?? '', children: [], style: {},
    get childElementCount() { return this.children.length; },
    createDiv(value) { const child = element('div', { cls: typeof value === 'string' ? value : value?.cls }); this.children.push(child); return child; },
    createEl(name, value = {}) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value = {}) { const child = element('span', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    addClass(value) { this.cls = value; }, setAttr(name, value) { this[name] = value; }, addEventListener() {}, remove() { this.removed = true; },
    empty() { this.children = []; }, querySelector(selector) { const cls = selector.slice(1); const visit = item => item.cls.split(' ').includes(cls) ? item : item.children.map(visit).find(Boolean); return visit(this); }
  });
  const root = node('root'), child = node('child', root.id); root.aimKind = 'topic'; child.aimKind = 'research';
  const doc = map([root, child]); doc.aim = { version: 1, branches: [{ id: 'branch', questionNodeId: root.id, parentBranchId: null, answerSnapshot: { selections: [], freeText: '私有答案資料' }, inputSnapshot: { topic: 'map', conditions: {}, upstreamResults: [] }, createdAt: '2026-10-09T00:00:00.000Z', results: [{ resultId: 'result', runId: 'run', attemptId: 'attempt', nodeId: child.id, notePath: child.path, version: 1 }] }], runs: [], pendingCommits: [] };
  const view = new OutlineView({ app: {} }, async () => {}); view.contentEl = element('content');
  view.setMap(doc, new Map([[root.id, 'AIM topic'], [child.id, 'Research subtopic']]));
  const tree = view.contentEl.querySelector('.vam-outline-tree');
  const flatten = item => [item, ...item.children.flatMap(flatten)]; const rendered = flatten(tree);
  assert.ok(rendered.some(item => item.text === 'AIM topic'));
  assert.ok(rendered.some(item => item.text === 'Research subtopic'));
  assert.ok(!rendered.some(item => item.cls.includes('vam-outline-kind') || item.cls.includes('vam-outline-branch-meta')));
  assert.ok(!rendered.some(item => item.text === '私有答案資料'));
  assert.deepEqual(rendered.filter(item => item.cls === 'vam-outline-row').map(item => item.style.paddingLeft), ['8px', '24px']);
});
integrationTest('Next Step reviews first expansion proposals in place and keeps existing proposal review', async () => {
  let closed = 0, expandCalls = 0, synthCalls = 0, created, saved, quickOptions, expandOptions, researchOptions, synthOptions; const notices = [];
  const element = (tag, options = {}) => ({
    tag, type: options.type, text: options.text, get textContent() { return this.text; }, value: options.value ?? options.text ?? '', cls: options.cls ?? '', children: [], get options() { return this.children.filter(child => child.tag === 'option' || child.value !== undefined); }, style: {}, dataset: {}, disabled: false,
    classList: { toggle(name, enabled) { this[name] = enabled; } },
    createDiv(value) { const child = element('div', { cls: typeof value === 'string' ? value : value?.cls }); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = name; }, setText(value) { this.text = value; }, setAttr(name, value) { this[name] = value; }, add(option) { this.children.push(option); }, replaceChildren(...children) { this.children = children; },
    addEventListener(name, handler) { if (name === 'click') this.click = handler; if (name === 'change') this.change = handler; if (name === 'input') this.input = handler; if (name === 'keydown') this.keydown = handler; },
    querySelector(selector) { const name = selector.slice(1); return find(this, item => item.cls.split(' ').includes(name)); },
    querySelectorAll(selector) { return all(this, item => selector === 'button[data-topic-run]' && item.tag === 'button' && item.dataset.topicRun !== undefined); },
    empty() { this.children = []; }, remove() { this.removed = true; }, focus() { this.focused = true; }
  });
  const find = (root, predicate) => predicate(root) ? root : root.children.map(child => find(child, predicate)).find(Boolean);
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const button = (root, label) => find(root, item => item.tag === 'button' && item.text === label);
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  class Modal { constructor() { this.modalEl = element('modal'); this.titleEl = element('title'); this.contentEl = element('content'); } close() { closed++; this.onClose?.(); } }
  const { NextStepModal } = load('main.ts', { obsidian: { ...obsidian, Modal, setIcon: () => {}, Notice: class { constructor(message) { notices.push(message); } } } });
  const checkedModels = [];
  const modelState = provider => ({ provider, status: 'ready', models: provider === 'codex' ? ['gpt-test'] : [] });
  const plugin = { settings: { codexUsageNoticeSeen: true, claudeUsageNoticeSeen: true, models: 'gpt-test', cliReasoning: 'low', language: 'en' }, aiReadyForModel: async model => { checkedModels.push(model); return true; }, confirmAiUsage: async (model, run) => { checkedModels.push(model); await run(); return true; }, saveSettings: async () => {}, activeTasks: new Map(), availableModels: () => ['gpt-test'], modelLabel: model => model, modelDiscoveryState: modelState, subscribeModelDiscovery: () => () => {}, refreshModelDiscovery: async provider => modelState(provider), sources: { currentTopicId: 'current', currentLabel: 'Current topic included', synthesisLabel: 'Current topic and child topics included', synthesisTopics: ['Child A', 'Child B'], topics: async () => [], readTopic: async () => [] } };
  const modelSettings = { model: 'gpt-test', modelSource: 'workspace', reasoning: 'low', save: async () => {}, sources: plugin.sources };
  const modal = new NextStepModal({}, 'Parent', 'normal', 1, 1, plugin,
    async (options, _focus, _done, _failed, accepted) => { researchOptions = options; accepted(); },
    async (options, _direction, found, _failed, _createdMap, accepted) => { expandOptions = options; expandCalls++; if (options.multiLayer) { quickOptions = options; accepted(); } else found([{ title: 'Transport', task: 'Compare', contribution: '', parentTitle: '' }], async items => { created = items; }); },
    async (options, direction) => { synthCalls++; synthOptions = options; assert.equal(direction, null); }, modelSettings);
  modal.onOpen();
  assert.ok(find(modal.contentEl, item => /3 minutes.*avoid prolonged resource use/.test(item.text ?? '')));
  assert.ok(modal.modalEl.cls.includes('vam-next-modal'));
  const requirementsDisclosure = find(modal.contentEl, item => item.cls.includes('vam-next-requirements'));
  assert.equal(requirementsDisclosure.open, false);
  const cards = find(modal.contentEl, item => item.cls === 'vam-next-cards');
  assert.deepEqual(cards.children.map(item => item['aria-checked']), ['true', 'false', 'false']);
  const [research, expand, synthesize] = all(modal.contentEl, item => item.cls.includes('vam-next-research'));
  // The step's primary action lives in the action bar below the content; the cards follow the topic line.
  const actions = find(modal.modalEl, item => item.cls.includes('vam-next-actions'));
  const researchAction = button(actions, 'Confirm research task');
  assert.equal(modal.contentEl.children.indexOf(cards), 1);
  const activeCard = () => cards.children.findIndex(item => item['aria-checked'] === 'true');
  assert.equal(activeCard(), 0);
  // The steps form one radio group: the chosen step holds focus and the only tab stop; arrows move the choice.
  assert.equal(cards.role, 'radiogroup');
  assert.deepEqual(cards.children.map(item => [item.role, item.tabIndex]), [['radio', 0], ['radio', -1], ['radio', -1]]);
  assert.equal(cards.children[0].focused, true);
  cards.children[0].keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(activeCard(), 1); assert.equal(cards.children[1].focused, true);
  cards.children[1].keydown({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(activeCard(), 0);
  assert.equal(researchAction.dataset.topicRun, 'Confirm research task');
  assert.equal(researchAction.disabled, false);
  assert.equal(button(research, 'Confirm research task'), undefined);
  assert.equal(find(modal.contentEl, item => /Summary = card conclusion/.test(item.text ?? '')), undefined);
  assert.equal(find(modal.contentEl, item => /Run with .*sources:.*result:/.test(item.text ?? '')), undefined);
  assert.equal(find(modal.contentEl, item => /Full results go to Markdown/.test(item.text ?? '')), undefined);
  assert.ok(find(research, item => item.cls.includes('vam-next-status')));
  const depthSet = find(research, item => item.tag === 'fieldset');
  assert.equal(depthSet.children[0].tag, 'legend');
  assert.equal(find(research, item => item.cls.includes('vam-next-depth-help')).open, false);
  const sourceDisclosures = all(modal.contentEl, item => item.cls.includes('vam-next-source-details'));
  assert.equal(sourceDisclosures.length, 1, 'one data-source picker serves every step');
  const [sources] = sourceDisclosures;
  assert.equal(sources.open, false);
  assert.ok(sources.children[0].children[0].children[1].text.includes('0 Markdown files'));
  const outputLanguage = find(modal.contentEl, item => item['aria-label'] === 'Answer language for this task');
  assert.equal(outputLanguage.value, 'en');
  outputLanguage.value = 'zh-TW';
  assert.equal(plugin.settings.language, 'en'); assert.equal(activeCard(), 0);
  const requirements = find(modal.contentEl, item => item.tag === 'textarea');
  assert.equal(requirements.value, '');
  assert.equal(all(modal.contentEl, item => item.tag === 'textarea').length, 1);
  assert.equal(button(modal.contentEl, 'Save instructions'), undefined);
  requirements.value = 'Only this run';
  const sourceChecks = all(sources, item => item.tag === 'input' && item.type === 'checkbox');
  assert.equal(sourceChecks.length, 2); assert.ok(sourceChecks[0].checked); assert.ok(sourceChecks[1].checked);
  assert.ok(find(sources, item => item.text === 'Search for image references'));
  assert.ok(find(research, item => /Standard: provide the main evidence, limits, and open questions/.test(item.text ?? '')), JSON.stringify(all(research, item => item.text).map(item => item.text)));
  assert.equal(all(expand, item => item.tag === 'input' && item.type === 'checkbox').length, 1, 'expand keeps only its shallow-research option');
  assert.equal(all(sources, item => item.tag === 'input' && item.type === 'file').length, 2);
  assert.ok(find(sources, item => item.text === 'Allow web search'));
  assert.ok(find(synthesize, item => /web search is off by default/.test(item.text ?? '')));
  assert.equal(find(synthesize, item => item.text === 'Does not copy full subtopic notes'), undefined);
  cards.children[1].click();
  assert.equal(activeCard(), 1); assert.equal(researchAction.hidden, true);
  assert.equal(research.style.display, 'none'); assert.equal(expand.style.display, '');
  sourceChecks[0].checked = false; sourceChecks[0].change();
  assert.equal(sourceChecks[1].disabled, true); assert.equal(sourceChecks[1].checked, false);
  sourceChecks[0].checked = true; sourceChecks[0].change();
  button(modal.modalEl, 'Review AI subtopic suggestions').click(); await tick();
  assert.equal(expandCalls, 1); assert.equal(closed, 0);
  const proposalCheck = find(expand.querySelector('.vam-next-result'), item => item.tag === 'input' && item.type === 'checkbox');
  proposalCheck.checked = false; button(expand, 'Create subtopics (1)').click(); await tick();
  assert.equal(created, undefined); assert.equal(expand.querySelector('.vam-next-status').text, 'Select at least one subtopic.');
  proposalCheck.checked = true;
  button(expand, 'Create subtopics (1)').click(); await tick();
  assert.equal(created[0].title, 'Transport'); assert.equal(expandOptions.outputLanguage, 'zh-TW'); assert.equal(closed, 0);
  let firstCreated, firstAttempts = 0;
  const firstFlow = new NextStepModal({}, 'Parent', 'normal', 0, 0, plugin, async () => {}, async (_options, _direction, found, failed) => {
    firstAttempts++;
    if (firstAttempts === 1) { failed('No useful proposals'); return; }
    found([{ title: 'First idea', task: 'Explore it', contribution: '', parentTitle: '' }], async items => { firstCreated = items; });
  }, async () => {});
  firstFlow.onOpen(); find(firstFlow.contentEl, item => item.cls === 'vam-next-cards').children[1].click();
  const firstPanel = all(firstFlow.contentEl, item => item.cls.includes('vam-next-research'))[1];
  const firstRequirements = find(firstFlow.contentEl, item => item.tag === 'textarea'); firstRequirements.value = 'Keep this while retrying';
  button(firstFlow.modalEl, 'Get expansion directions').click(); await tick();
  assert.equal(firstPanel.querySelector('.vam-next-status').text, 'No useful proposals');
  assert.equal(firstRequirements.value, 'Keep this while retrying'); assert.equal(closed, 0);
  button(firstFlow.modalEl, 'Get expansion directions').click(); await tick();
  assert.ok(find(firstPanel.querySelector('.vam-next-result'), item => item.text === 'AI subtopic proposals'));
  const firstCheckbox = find(firstPanel.querySelector('.vam-next-result'), item => item.tag === 'input' && item.type === 'checkbox');
  firstCheckbox.checked = false;
  button(firstPanel, 'Create subtopics (1)').click(); await tick();
  assert.equal(firstCreated, undefined); assert.equal(firstPanel.querySelector('.vam-next-status').text, 'Select at least one subtopic.');
  firstCheckbox.checked = true;
  const firstName = find(firstPanel.querySelector('.vam-next-result'), item => item.tag === 'input' && item.type === 'text'); firstName.value = 'Edited idea';
  button(firstPanel, 'Create subtopics (1)').click(); await tick();
  assert.equal(firstCreated[0].title, 'Edited idea'); assert.equal(closed, 0);
  const contentChoice = find(synthesize, item => item.tag === 'select' && item['aria-label'] === 'Topic synthesis content');
  assert.equal(contentChoice.value, 'full');
  assert.ok(find(synthesize, item => item.tag === 'li' && item.text === 'Child A'));
  assert.ok(find(synthesize, item => item.tag === 'li' && item.text === 'Child B'));
  contentChoice.value = 'summary'; contentChoice.change();
  assert.ok(find(synthesize, item => /Important conditions in the body may be omitted/.test(item.text ?? '')));
  cards.children[2].click(); assert.equal(activeCard(), 2); assert.equal(researchAction.hidden, true);
  // Starting synthesis closes its window at once, so it runs on its own modal and this one stays open for research.
  const synthModal = new NextStepModal({}, 'Parent', 'normal', 1, 1, plugin, async () => {}, async () => {}, modal.synthesize, modelSettings);
  synthModal.onOpen(); find(synthModal.contentEl, item => item.cls === 'vam-next-cards').children[2].click();
  find(synthModal.contentEl, item => item['aria-label'] === 'Answer language for this task').value = 'zh-TW';
  const synthPanel = all(synthModal.contentEl, item => item.cls.includes('vam-next-research'))[2];
  const synthContentChoice = find(synthPanel, item => item.tag === 'select' && item['aria-label'] === 'Topic synthesis content');
  synthContentChoice.value = 'summary'; synthContentChoice.change();
  const closedBeforeSynthStart = closed;
  button(synthModal.modalEl, 'Get synthesis suggestions first').click(); await tick();
  assert.equal(synthContentChoice.disabled, true);
  assert.equal(synthOptions.synthesisContent, 'summary');
  assert.equal(synthCalls, 1); assert.equal(closed, closedBeforeSynthStart + 1); assert.equal(synthModal.closed, true);
  assert.equal(synthOptions.researchMode, 'local');
  // Untouched network options follow each step's default; a choice the user makes is kept across steps.
  const defaultsModal = new NextStepModal({}, 'Parent', 'normal', 1, 1, plugin, async () => {}, async () => {}, async () => {}, modelSettings);
  defaultsModal.onOpen();
  const defaultCards = find(defaultsModal.contentEl, item => item.cls === 'vam-next-cards');
  const webOf = () => all(find(defaultsModal.contentEl, item => item.cls.includes('vam-next-source-details')), item => item.tag === 'input' && item.type === 'checkbox')[0];
  defaultCards.children[2].click(); assert.equal(webOf().checked, false);
  defaultCards.children[0].click(); assert.equal(webOf().checked, true);
  webOf().checked = false; webOf().change();
  defaultCards.children[1].click(); assert.equal(webOf().checked, false);
  assert.equal(synthOptions.outputLanguage, 'zh-TW');
  assert.equal(button(synthPanel, 'Choose this direction'), undefined);
  closed = closedBeforeSynthStart;
  cards.children[0].click(); assert.equal(activeCard(), 0); assert.equal(researchAction.hidden, false);
  button(modal.modalEl, 'Confirm research task').click(); await tick();
  assert.equal(researchOptions.requirements, 'Only this run'); assert.equal(researchOptions.researchMode, 'research'); assert.equal(researchOptions.referenceGroups.length, 0);
  assert.equal(researchOptions.outputLanguage, 'zh-TW');
  assert.equal(closed, 1); assert.equal(research.querySelector('.vam-next-result'), undefined);
  // The suggested step follows the topic's research state.
  const suggested = (childrenCount, topicStatus, childrenCompleted) => {
    const suggestModal = new NextStepModal({}, 'Parent', 'normal', childrenCount, 0, plugin, async () => {}, async () => {}, async () => {}, { ...modelSettings, topicStatus, childrenCompleted });
    suggestModal.onOpen();
    return find(suggestModal.contentEl, item => item.cls === 'vam-next-cards').children.findIndex(item => item['aria-checked'] === 'true');
  };
  assert.equal(suggested(0, 'idea', 0), 0, 'a topic to research suggests researching it');
  assert.equal(suggested(0, 'completed', 0), 1, 'a researched topic without subtopics suggests expanding');
  assert.equal(suggested(2, 'completed', 2), 2, 'a researched topic whose subtopics are all researched suggests synthesis');
  assert.equal(suggested(2, 'completed', 1), 0, 'unfinished subtopics keep research as the suggestion');
  const quickModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, modal.expand, async () => {});
  quickModal.onOpen(); find(quickModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click(); button(quickModal.contentEl, 'Quickly explore a map').click();
  find(quickModal.contentEl, item => item['aria-label'] === 'Answer language for this task').value = 'zh-TW';
  assert.equal(button(quickModal.modalEl, 'Review AI subtopic suggestions'), undefined);
  const quickNumbers = all(quickModal.contentEl, item => item.tag === 'input' && item.type === 'number');
  const [levelInput, , childrenInput] = quickNumbers;
  assert.equal(childrenInput.disabled, false);
  levelInput.value = '1'; levelInput.input();
  assert.equal(childrenInput.disabled, true);
  assert.equal(find(quickModal.contentEl, item => item.text === 'Not used when expanding only one level.').hidden, false);
  levelInput.value = '2'; levelInput.input();
  assert.equal(childrenInput.disabled, false);
  button(quickModal.modalEl, 'Create starter map now').click(); await tick();
  assert.equal(quickOptions.multiLayer, true); assert.equal(quickOptions.shallowResearch, false); assert.equal(quickOptions.layers, 2); assert.equal(quickOptions.firstLayerCount, 3); assert.equal(quickOptions.childrenPerParent, 2); assert.equal(closed, 2);
  assert.equal(quickOptions.researchMode, 'local'); assert.equal(quickOptions.referenceGroups.length, 0); assert.equal(quickOptions.outputLanguage, 'zh-TW');
  const partial = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async (_options, _direction, _found, failed) => failed('部分子議題已建立，請重新開啟視窗。', false), async () => {});
  partial.onOpen(); find(partial.contentEl, item => item.cls === 'vam-next-cards').children[1].click(); button(partial.contentEl, 'Quickly explore a map').click();
  const closedBeforePartial = closed;
  button(partial.modalEl, 'Create starter map now').click(); await tick();
  assert.equal(closed, closedBeforePartial); assert.equal(button(partial.modalEl, 'Create starter map now').disabled, true); assert.match(all(partial.contentEl, item => item.cls.includes('vam-next-research'))[1].querySelector('.vam-next-status').text, /部分子議題已建立/);
  const startedNotices = () => notices.filter(message => message === 'Started “Parent” in the background; progress shows on its card.').length;
  const startedBefore = startedNotices();
  let continueBackground; let acceptedSignal;
  const background = new Promise(resolve => { continueBackground = resolve; });
  const acceptedModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async (options, _direction, _found, _failed, _created, accepted) => { acceptedSignal = options.signal; accepted(); await background; }, async () => {});
  acceptedModal.onOpen(); find(acceptedModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click(); button(acceptedModal.contentEl, 'Quickly explore a map').click(); button(acceptedModal.modalEl, 'Create starter map now').click();
  await until(() => acceptedModal.closed);
  assert.equal(acceptedSignal.aborted, false); assert.equal(acceptedModal.taskSignal, undefined);
  assert.equal(startedNotices(), startedBefore + 1);
  continueBackground(); await tick();
  // Synthesis runs in the background: accepting the dispatch closes the modal without aborting the AI.
  let directionSignal, directionCalls = [];
  const directionsModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async () => {}, async (options, direction, _failed, accepted) => { directionSignal = options.signal; directionCalls.push(direction); accepted(); await background2; }, modelSettings);
  let continueBackground2; const background2 = new Promise(resolve => { continueBackground2 = resolve; });
  const closedBeforeSynth = closed;
  directionsModal.onOpen(); find(directionsModal.contentEl, item => item.cls === 'vam-next-cards').children[2].click();
  button(directionsModal.modalEl, 'Get synthesis suggestions first').click();
  await until(() => directionsModal.closed);
  assert.equal(closed, closedBeforeSynth + 1); assert.deepEqual(directionCalls, [null]);
  assert.equal(directionSignal.aborted, false); assert.equal(directionsModal.taskSignal, undefined);
  assert.equal(startedNotices(), startedBefore + 2);
  continueBackground2(); await tick();
  // Reopening from the node badge shows the pending directions; the draft step is also accepted and closes the modal.
  let discarded = 0, draftSignal; const draftCalls = [];
  const pendingModal2 = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async () => {}, async (options, direction, _failed, accepted) => { draftSignal = options.signal; draftCalls.push(direction); accepted(); },
    { ...modelSettings, synthesisPending: { directions: [{ title: 'Shared constraints', task: 'Find tradeoffs', contribution: 'Across children' }, { title: 'Open questions', task: 'List gaps', contribution: '' }], discard: () => { discarded++; } } });
  pendingModal2.onOpen();
  const pendingPanel = all(pendingModal2.contentEl, item => item.cls.includes('vam-next-research'))[2];
  assert.equal(button(pendingModal2.modalEl, 'Get synthesis suggestions first'), undefined);
  assert.equal(pendingPanel.style.display, '');
  const directionBox = find(pendingPanel, item => item.tag === 'textarea' && item['aria-label'] === 'Synthesis direction');
  assert.equal(directionBox.value ?? directionBox.text, 'Find tradeoffs');
  button(pendingPanel, 'Choose this direction').click();
  directionBox.value = 'Edited direction';
  button(pendingModal2.modalEl, 'Get synthesis draft').click(); await until(() => pendingModal2.closed);
  assert.deepEqual(draftCalls, ['Edited direction']); assert.equal(draftSignal.aborted, false); assert.equal(discarded, 0);
  const discardModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async () => {}, async () => {}, { ...modelSettings, synthesisPending: { directions: [{ title: 'A', task: 'B', contribution: '' }], discard: () => { discarded++; } } });
  discardModal.onOpen(); button(discardModal.contentEl, 'Discard').click();
  assert.equal(discarded, 1); assert.equal(discardModal.closed, true);
  closed = closedBeforeSynth; // keep later absolute close counts independent of the background-synthesis modals above
  let emptyOptions;
  const empty = new NextStepModal({}, 'No children', 'normal', 0, 0, plugin, async () => {}, async () => {}, async options => { synthCalls++; emptyOptions = options; });
  empty.onOpen(); find(empty.contentEl, item => item.cls === 'vam-next-cards').children[2].click();
  const emptyPanel = all(empty.contentEl, item => item.cls.includes('vam-next-research'))[2];
  assert.match(emptyPanel.children[0].text, /no direct subtopics/i);
  button(empty.modalEl, 'Get synthesis suggestions first').click(); await tick();
  assert.equal(synthCalls, 1); assert.equal(emptyOptions, undefined);
  const failing = new NextStepModal({}, 'Parent', 'normal', 1, 1, plugin, async () => {}, async (_options, _direction, _found, failed) => failed('Provider failed'), async () => {});
  failing.onOpen(); find(failing.contentEl, item => item.cls === 'vam-next-cards').children[1].click();
  button(failing.modalEl, 'Review AI subtopic suggestions').click(); await tick();
  assert.equal(all(failing.contentEl, item => item.cls.includes('vam-next-research'))[1].querySelector('.vam-next-status').text, 'Provider failed'); assert.equal(closed, 3);
  const startedBeforeFailures = startedNotices();
  const failedResearch = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async (_options, _focus, _done, failed) => failed('Cannot start'), async () => {}, async () => {});
  failedResearch.onOpen(); button(failedResearch.modalEl, 'Confirm research task').click(); await tick();
  assert.equal(closed, 3); assert.equal(all(failedResearch.contentEl, item => item.cls.includes('vam-next-research'))[0].querySelector('.vam-next-status').text, 'Cannot start');
  const unacceptedResearch = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async () => {}, async () => {});
  unacceptedResearch.onOpen(); button(unacceptedResearch.modalEl, 'Confirm research task').click(); await tick();
  const unacceptedPanel = all(unacceptedResearch.contentEl, item => item.cls.includes('vam-next-research'))[0];
  assert.equal(closed, 3); assert.equal(button(unacceptedResearch.modalEl, 'Confirm research task').disabled, false);
  assert.match(unacceptedPanel.querySelector('.vam-next-status').text, /cancelled/i);
  // Launch failures and unaccepted launches never claim the task started.
  assert.equal(startedNotices(), startedBeforeFailures);
  let acknowledged = 0, began = 0;
  let firstUseConfirmed = false;
  const firstUsePlugin = { settings: { codexUsageNoticeSeen: false }, aiReadyForModel: async () => true, confirmAiUsage: async (_model, run) => { if (!firstUseConfirmed) { firstUseConfirmed = true; return false; } acknowledged++; await run(); return true; }, saveSettings: async () => { acknowledged++; } };
  const firstUse = new NextStepModal({}, 'Parent', 'normal', 1, 0, firstUsePlugin, async (_options, _focus, _done, _failed, accepted) => { began++; accepted(); }, async () => {}, async () => {});
  firstUse.onOpen(); button(firstUse.modalEl, 'Confirm research task').click(); await tick();
  assert.equal(began, 0); assert.equal(button(firstUse.contentEl, 'Understand and run'), undefined); assert.equal(closed, 3);
  button(firstUse.modalEl, 'Confirm research task').click(); await tick();
  assert.equal(began, 1); assert.equal(acknowledged, 1); assert.equal(closed, 4);
  let pendingCalls = 0;
  let pendingConfirmed = false;
  const pendingPlugin = { settings: { codexUsageNoticeSeen: false }, aiReadyForModel: async () => true, confirmAiUsage: async (_model, run) => { if (!pendingConfirmed) { pendingConfirmed = true; return false; } await run(); return true; }, saveSettings: async () => {} };
  const pendingModal = new NextStepModal({}, 'Parent', 'normal', 1, 1, pendingPlugin, async () => {}, async (_options, _direction, found) => { pendingCalls++; found([{ title: 'Existing', task: 'Research', contribution: '', parentTitle: '' }], async () => {}); }, async () => {});
  pendingModal.onOpen(); find(pendingModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click();
  button(pendingModal.modalEl, 'Review AI subtopic suggestions').click(); await tick();
  assert.equal(pendingCalls, 1); assert.equal(button(pendingModal.contentEl, 'Understand and run'), undefined);
  button(pendingModal.contentEl, 'Create subtopics (1)').click(); await tick();
  assert.ok(button(pendingModal.modalEl, 'Get expansion directions'));
  button(pendingModal.modalEl, 'Get expansion directions').click(); await tick();
  assert.equal(pendingCalls, 1); assert.equal(button(pendingModal.contentEl, 'Understand and run'), undefined);
  let finishQuick, completedQuick = false, delayedOptions;
  const delayed = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async (options, _direction, _failed, _failure, accepted) => {
    delayedOptions = options;
    accepted();
    await new Promise(resolve => { finishQuick = resolve; });
    completedQuick = true;
  }, async () => {});
  delayed.onOpen(); find(delayed.contentEl, item => item.cls === 'vam-next-cards').children[1].click(); button(delayed.contentEl, 'Quickly explore a map').click();
  const numbers = all(delayed.contentEl, item => item.tag === 'input' && item.type === 'number');
  numbers[0].value = '3'; numbers[1].value = '2'; numbers[2].value = '2'; numbers[0].input();
  const shallow = find(all(delayed.contentEl, item => item.cls.includes('vam-next-research'))[1], item => item.tag === 'input' && item.type === 'checkbox' && item.checked === false);
  shallow.checked = true;
  button(delayed.modalEl, 'Create starter map now').click(); await tick();
  assert.equal(closed, 5); assert.equal(completedQuick, false);
  assert.equal(delayedOptions.layers, 3); assert.equal(delayedOptions.firstLayerCount, 2); assert.equal(delayedOptions.childrenPerParent, 2); assert.equal(delayedOptions.shallowResearch, true);
  finishQuick(); await tick(); assert.equal(completedQuick, true); assert.equal(closed, 5);
  const invalid = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async () => assert.fail('over-limit task started'), async () => {});
  invalid.onOpen(); find(invalid.contentEl, item => item.cls === 'vam-next-cards').children[1].click(); button(invalid.contentEl, 'Quickly explore a map').click();
  const invalidNumbers = all(invalid.contentEl, item => item.tag === 'input' && item.type === 'number'); invalidNumbers[0].value = '3'; invalidNumbers[1].value = '3'; invalidNumbers[2].value = '2'; invalidNumbers[0].input();
  assert.match(find(invalid.contentEl, item => item.tag === 'p' && item.text?.includes('exceeding the limit of 15')).text, /21 subtopics/);
  assert.equal(button(invalid.modalEl, 'Create starter map now').disabled, true);
  invalidNumbers[0].value = '2'; invalidNumbers[0].input();
  assert.equal(button(invalid.modalEl, 'Create starter map now').disabled, false);
  assert.ok(all(invalid.contentEl, item => item.tag === 'p').some(item => /3/.test(item.text ?? '') && /6/.test(item.text ?? '') && /9/.test(item.text ?? '')));
  assert.equal(closed, 5);
  let finishGuided, guidedFinished = false;
  const guidedModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async (_options, _direction, found) => {
    await new Promise(resolve => { finishGuided = resolve; });
    found([{ title: 'Later', task: 'Explore', contribution: '' }], async () => {});
    guidedFinished = true;
  }, async () => {});
  guidedModal.onOpen(); find(guidedModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click();
  button(guidedModal.modalEl, 'Get expansion directions').click(); await tick();
  assert.equal(closed, 5); assert.equal(guidedFinished, false);
  finishGuided(); await tick();
  assert.equal(guidedFinished, true); assert.ok(button(guidedModal.contentEl, 'Create subtopics (1)'));
  button(guidedModal.contentEl, 'Create subtopics (1)').click(); await tick();
  assert.equal(closed, 5);
  const settingsWrites = []; let researchAfterSave = false;
  const settingsModal = new NextStepModal({}, 'Parent', 'normal', 0, 0,
    { settings: { codexUsageNoticeSeen: true, models: 'model-a,model-b' }, availableModels: () => ['model-a', 'model-b'], modelLabel: model => model, modelDiscoveryState: provider => ({ provider, status: 'ready', models: ['model-a', 'model-b'] }), subscribeModelDiscovery: () => () => {}, refreshModelDiscovery: async provider => ({ provider, status: 'ready', models: ['model-a', 'model-b'] }), aiReadyForModel: async model => { checkedModels.push(model); return true; }, confirmAiUsage: async (model, run) => { checkedModels.push(model); await run(); return true; }, saveSettings: async () => {} },
    async (_options, _focus, _done, _failed, accepted) => { researchAfterSave = settingsWrites.length === 2; accepted(); }, async () => {}, async () => {},
    { model: 'model-a', modelSource: 'workspace', reasoning: 'low', save: async patch => { settingsWrites.push(patch); } });
  settingsModal.onOpen();
  assert.equal(settingsModal.contentEl.children.find(item => item.cls.includes('vam-next-model')).children[0].text, 'Model and advanced settings');
  const modelSelect = find(settingsModal.contentEl, item => item['aria-label'] === 'Model');
  const reasoningSelect = find(settingsModal.contentEl, item => item['aria-label'] === 'Reasoning level');
  modelSelect.value = 'model-b'; modelSelect.change(); reasoningSelect.value = 'high'; reasoningSelect.change();
  assert.equal(researchAfterSave, false);
  button(settingsModal.modalEl, 'Confirm research task').click(); await tick();
  assert.deepEqual(plain(settingsWrites), [{ model: 'model-b', modelSource: 'manual' }, { reasoning: 'high' }]);
  assert.equal(checkedModels.at(-1), 'model-b');
  assert.equal(researchAfterSave, true);
  const closedBeforeCancel = closed;
  const cancelModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async options => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); }, { once: true })), async () => {});
  cancelModal.onOpen(); find(cancelModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click();
  button(cancelModal.contentEl, 'Quickly explore a map').click(); button(cancelModal.modalEl, 'Create starter map now').click(); await tick();
  const taskCancel = find(cancelModal.contentEl, item => item.cls === 'vam-task-cancel');
  assert.equal(taskCancel.hidden, false); taskCancel.onclick(); await tick();
  assert.match(find(all(cancelModal.contentEl, item => item.cls.includes('vam-next-research'))[1], item => item.cls.includes('vam-next-status')).text, /cancelled/i);
  assert.equal(closed, closedBeforeCancel);
});
test('external map conflict UI retains file, screen, and manual merge choices', () => {
  const source = fs.readFileSync(path.join(root, 'experiences/visual-map/modals.ts'), 'utf8');
  for (const modal of ['class MapConflictModal']) {
    const start = source.indexOf(modal), next = source.indexOf('\nexport class ', start + modal.length);
    const body = source.slice(start, next < 0 ? source.length : next);
    assert.match(body, /ui\.use_file_contents/); assert.match(body, /ui\.keep_editor_contents/); assert.match(body, /ui\.save_merged_contents/);
  }
});
test('VAM notes hide properties in reading and live preview without removing frontmatter', () => {
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(styles, /\.markdown-preview-view\.visual-agent-map-node \.metadata-container/);
  assert.match(styles, /body \.workspace-leaf-content\.vam-topic-markdown \.markdown-source-view\.mod-cm6 \.metadata-container \{ display: none; \}/);
  assert.doesNotMatch(styles, /\.markdown-preview-view\.vam-topic-markdown \.metadata-container/);
  assert.doesNotMatch(styles, /!important/);
});
test('preview cards display only editable preview content', () => {
  const source = fs.readFileSync(path.join(root, 'experiences/visual-map/view.ts'), 'utf8');
  const card = source.slice(source.indexOf('preview.createEl("strong", { text: note.title })'), source.indexOf('const host = workspace.getBoundingClientRect()'));
  assert.match(card, /note.preview/);
  assert.doesNotMatch(card, /note.summary|User Notes|目前結論/);
});
test('preview renderer receives Markdown in original order with no extra Preview label', () => {
  const created = []; let rendered;
  const rect = {left:0,top:0,right:100,width:800,height:600};
  const element = () => ({style:{setProperty(){}},addEventListener(){},createEl(tag, options){created.push([tag,options.text]);return element()},createDiv(){return element()},getBoundingClientRect(){return rect},remove(){}});
  const workspace = element(); const contentEl = {querySelector(){return workspace}};
  const {VisualAgentMapView} = load('main.ts', {obsidian:{...obsidian,MarkdownRenderer:{render(app, markdown, el, path){rendered={markdown,path};return Promise.resolve()}}}});
  const view = new VisualAgentMapView({app:{}},{settings:{...DEFAULT_SETTINGS}}); view.contentEl=contentEl;view.map=map([node('a')]);
  const markdown='Text first\n\n![Image](https://example.com/a.png)\n\nText after\n\n|A|B|\n|---|---|\n|1|2|';
  view.showHoverCard({...element(),dataset:{nodeId:'a'}},{title:'Topic',preview:markdown});
  assert.equal(rendered.markdown,markdown);assert.equal(rendered.path,'a.md');assert.deepEqual(created,[['strong','Topic']]);
});
test('multi research modal: defaults, options and immediate close on start', () => {
  const element = (tag, options = {}) => ({
    tag, text: options.text ?? '', cls: options.cls ?? '', type: options.type, value: options.value ?? '', checked: false, disabled: false, children: [], listeners: {},
    createDiv(value) { const c = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(c); return c; },
    createEl(name, value = {}) { const c = element(name, value); this.children.push(c); return c; },
    createSpan(value = {}) { const c = element('span', value); this.children.push(c); return c; },
    setText(value) { this.text = value; }, replaceChildren() { this.children = []; }, setAttr(name, value) { this[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; }, addClass(n) { this.cls = `${this.cls} ${n}`.trim(); }, focus() {}
  });
  const find = (root, predicate) => predicate(root) ? root : root.children.map(c => find(c, predicate)).find(Boolean);
  // As in Obsidian, the content sits inside modalEl; the action bar is modalEl's last child.
  class Modal { constructor(app) { this.app = app; this.titleEl = element('title'); this.contentEl = element('content'); this.modalEl = element('modal'); this.modalEl.children.push(this.contentEl); this.closed = 0; } open() { this.onOpen(); } close() { this.closed++; } }
  const mod = load('experiences/visual-map/multi-research-modal.ts', { obsidian: { ...obsidian, Modal } });
  const requests = []; const templates = [{ id: 'standard', name: 'Standard' }, { id: 'A', name: 'Alpha template' }];
  let models = [], changed = null, unwatched = 0;
  const live = { list: () => models, watch: fn => { changed = fn; return () => { unwatched++; }; } };
  const modal = new mod.MultiResearchModal({}, ['Alpha', 'Beta'], live, templates, request => requests.push(request)); modal.open();
  assert.ok(find(modal.contentEl, i => i.text === 'Alpha')); assert.ok(find(modal.contentEl, i => i.text === 'Beta'));
  const web = find(modal.contentEl, i => i.tag === 'input' && i.type === 'checkbox'); assert.equal(web.checked, true);
  const depth = find(modal.contentEl, i => i.tag === 'select' && i['aria-label'] === 'Research depth'); assert.equal(depth.value, 'fast');
  const model = () => find(modal.contentEl, i => i.tag === 'select' && i['aria-label'] === 'Model'); assert.equal(model().value, '');
  assert.deepEqual(plain(model().children.map(c => c.value)), ['']);
  models = [{ id: 'm1', label: 'Model One' }, { id: 'm2', label: 'Model Two' }]; changed();
  assert.deepEqual(plain(model().children.map(c => [c.value, c.text])), [['', "Each topic's current model"], ['m1', 'Model One'], ['m2', 'Model Two']]);
  assert.deepEqual(plain(depth.children.map(c => c.value)), ['fast', 'normal', 'deep']);
  const templateSelect = find(modal.contentEl, i => i.tag === 'select' && i['aria-label'] === 'Content template');
  assert.deepEqual(plain(templateSelect.children.map(c => [c.value, c.text])), [['', "Each topic's current template"], ['standard', 'Standard'], ['A', 'Alpha template']]);
  const start = find(modal.modalEl, i => i.tag === 'button' && i.text === 'Start research (2)');
  start.listeners.click(); start.listeners.click();
  assert.equal(modal.closed, 1); assert.equal(requests.length, 1); modal.onClose(); assert.equal(unwatched, 1);
  assert.deepEqual(plain(requests[0]), { researchMode: 'research', researchDepth: 'fast', requirements: '' });
  const second = []; const m2 = new mod.MultiResearchModal({}, ['A'], { list: () => [{ id: 'm1', label: 'Model One' }], watch: () => () => {} }, templates, r => second.push(r)); m2.open();
  find(m2.contentEl, i => i.tag === 'input' && i.type === 'checkbox').checked = false;
  const sel = find(m2.contentEl, i => i.tag === 'select' && i['aria-label'] === 'Research depth'); sel.value = 'deep';
  find(m2.contentEl, i => i.tag === 'select' && i['aria-label'] === 'Model').value = 'm1';
  find(m2.contentEl, i => i.tag === 'select' && i['aria-label'] === 'Content template').value = 'A';
  find(m2.contentEl, i => i.tag === 'textarea').value = '  only 2025  ';
  find(m2.modalEl, i => i.tag === 'button' && i.text === 'Start research (1)').listeners.click();
  assert.deepEqual(plain(second[0]), { researchMode: 'local', researchDepth: 'deep', requirements: 'only 2025', model: 'm1', detailTemplateId: 'A' });
});
test('card shows a Format not met badge with the issues as tooltip', () => {
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const element = tag => ({ tag, children: [], dataset: {}, style: {},
    createDiv(options) { const child = element('div'); child.cls = options?.cls ?? options; this.children.push(child); return child; },
    createEl(name, options) { const child = element(name); child.text = options?.text; this.children.push(child); return child; },
    createSpan(options) { const child = element('span'); child.text = options?.text; child.cls = options?.cls; this.children.push(child); return child; },
    setAttr(name, value) { this[name] = value; }, addClass(name) { this.cls = name; },
    addEventListener() {}, removeEventListener() {}, setPointerCapture() {}
  });
  const find = (item, predicate) => predicate(item) ? item : item.children.map(child => find(child, predicate)).find(Boolean);
  const topic = node('topic');
  const plugin = { repo: {}, settings: { ...DEFAULT_SETTINGS }, expansionBatches: new Map(), running: new Set(), quickExpandPending: new Set(), pendingSuggestions: new Map() };
  const render = issues => {
    const view = new VisualAgentMapView({ app: {} }, plugin); view.stageEl = element('stage'); view.map = map([topic]);
    view.notes = new Map([[topic.id, { title: 'Topic', summary: '', status: 'completed', detailFormatIssues: issues }]]);
    view.renderNode(topic);
    return find(view.stageEl, item => item.tag === 'span' && item.text === 'Format not met');
  };
  const badge = render(['Examples: needs exactly 3, has 1']);
  assert.ok(badge, 'badge shown');
  assert.equal(badge.cls, 'vam-status vam-status-error');
  assert.equal(badge.title, 'Examples: needs exactly 3, has 1');
  assert.equal(render([]), undefined);
});

integrationTest('Next Step modal: the content template choice goes into research, expansion and synthesis options only when picked', async () => {
  const element = (tag, options = {}) => ({
    tag, type: options.type, text: options.text, value: options.value ?? options.text ?? '', cls: options.cls ?? '', children: [], style: {}, dataset: {}, disabled: false,
    classList: { toggle() {} },
    createDiv(value) { const child = element('div', { cls: typeof value === 'string' ? value : value?.cls }); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = name; }, setText(value) { this.text = value; }, setAttr(name, value) { this[name] = value; }, add(option) { this.children.push(option); }, replaceChildren(...children) { this.children = children; },
    addEventListener(name, handler) { if (name === 'click') this.click = handler; if (name === 'change') this.change = handler; if (name === 'input') this.input = handler; },
    querySelector(selector) { const name = selector.slice(1); return find(this, item => item.cls.split(' ').includes(name)); },
    querySelectorAll() { return []; }, empty() { this.children = []; }, remove() {}, focus() {}
  });
  const find = (root, predicate) => predicate(root) ? root : root.children.map(child => find(child, predicate)).find(Boolean);
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const button = (root, label) => find(root, item => item.tag === 'button' && item.text === label);
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  class Modal { constructor() { this.modalEl = element('modal'); this.titleEl = element('title'); this.contentEl = element('content'); } close() { this.onClose?.(); } }
  const { NextStepModal } = load('main.ts', { obsidian: { ...obsidian, Modal, setIcon: () => {}, Notice: class {} } });
  const modelState = provider => ({ provider, status: 'ready', models: [] });
  const plugin = { settings: { codexUsageNoticeSeen: true, claudeUsageNoticeSeen: true, models: 'gpt-test', cliReasoning: 'low', language: 'en' }, aiReadyForModel: async () => true, confirmAiUsage: async (_m, run) => { await run(); return true; }, saveSettings: async () => {}, activeTasks: new Map(), availableModels: () => ['gpt-test'], modelLabel: model => model, modelDiscoveryState: modelState, subscribeModelDiscovery: () => () => {}, refreshModelDiscovery: async provider => modelState(provider), sources: { currentTopicId: 'current', currentLabel: 'Current', synthesisLabel: 'Current and children', synthesisTopics: ['Child'], topics: async () => [], readTopic: async () => [] } };
  const templates = [{ id: 'standard', name: 'Standard' }, { id: 'A', name: 'Alpha template' }];
  const settings = { model: 'gpt-test', modelSource: 'workspace', reasoning: 'low', save: async () => {}, sources: plugin.sources, templates, currentTemplate: 'Standard' };
  const seen = {};
  const open = (name, withSettings) => {
    const modal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin,
      async options => { seen.research = options; },
      async options => { seen.expand = options; },
      async options => { seen.synth = options; }, withSettings);
    modal.onOpen();
    return modal;
  };
  const templateSelect = modal => find(modal.contentEl, item => item.tag === 'select' && item['aria-label'] === 'Content template');
  const cardsOf = modal => find(modal.contentEl, item => item.cls === 'vam-next-cards');
  const modal = open('picked', settings);
  const select = templateSelect(modal);
  assert.deepEqual(plain(select.children.map(c => [c.value, c.text])), [['', 'Keep current (Standard)'], ['standard', 'Standard'], ['A', 'Alpha template']]);
  button(modal.modalEl, 'Confirm research task').click(); await tick();
  assert.equal('detailTemplateId' in seen.research, false, 'keep-current sends no choice');
  select.value = 'A';
  button(modal.modalEl, 'Confirm research task').click(); await tick();
  assert.equal(seen.research.detailTemplateId, 'A');
  cardsOf(modal).children[1].click();
  button(modal.contentEl, 'Quickly explore a map').click();
  button(modal.modalEl, 'Create starter map now').click(); await tick();
  assert.equal(seen.expand.detailTemplateId, 'A');
  const synthModal = open('synth', settings);
  templateSelect(synthModal).value = 'A';
  cardsOf(synthModal).children[2].click();
  const synthPanel = all(synthModal.contentEl, item => item.cls.includes('vam-next-research'))[2];
  button(synthModal.modalEl, 'Get synthesis suggestions first').click(); await tick();
  assert.equal(seen.synth.detailTemplateId, 'A');
  const bare = open('bare', undefined);
  assert.deepEqual(plain(templateSelect(bare).children.map(c => c.value)), ['']);
});
test('templateField: keep option first, returns the chosen template id or undefined for keep', () => {
  const element = (tag, options = {}) => ({ tag, text: options.text, value: options.value ?? '', children: [],
    createEl(name, value = {}) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value = {}) { const child = element('span', value); this.children.push(child); return child; },
    setAttr(name, value) { this[name] = value; } });
  const { templateField } = load('experiences/visual-map/research-fields.ts', { obsidian });
  const parent = element('div');
  const read = templateField(parent, [{ id: 'standard', name: 'Standard' }, { id: 'A', name: 'Alpha' }], 'Keep it');
  const select = parent.children[0].children.find(child => child.tag === 'select');
  assert.equal(select['aria-label'], 'Content template');
  assert.deepEqual(plain(select.children.map(c => [c.value, c.text])), [['', 'Keep it'], ['standard', 'Standard'], ['A', 'Alpha']]);
  assert.equal(read(), undefined);
  select.value = 'A'; assert.equal(read(), 'A');
  select.value = ''; assert.equal(read(), undefined);
});
integrationTest('draft review renders the draft, edits on demand and keeps the dialog open when saving fails', async () => {
  const element = (tag, options = {}) => ({
    tag, text: options.text, value: options.text ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], hidden: false,
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, removeClass(name) { this.cls = this.cls.split(' ').filter(item => item !== name).join(' '); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { if (name === 'click') this.click = handler; }, empty() { this.children = []; this.rendered = undefined; }, focus() { this.focused = true; }
  });
  const find = (root, predicate) => predicate(root) ? root : root.children.map(child => find(child, predicate)).find(Boolean);
  class Modal { constructor() { this.modalEl = element('modal'); this.titleEl = element('title'); this.contentEl = element('content'); } close() { this.closed = true; this.onClose?.(); } }
  class Component { load() { this.loaded = true; } unload() { this.loaded = false; } addChild(child) { return child; } removeChild() {} }
  const MarkdownRenderer = { render: async (_app, markdown, el) => { el.rendered = markdown; } };
  const { DraftReviewModal } = load('main.ts', { obsidian: { ...obsidian, Modal, Component, MarkdownRenderer, setIcon: () => {} } });
  const saved = []; let failNext = true;
  const modal = new DraftReviewModal({}, 'New summary', '## Result\n\n- **one**', { intro: 'Confirming replaces the summary and details of “Parent”.', currentSummary: 'Old summary', confirmLabel: 'Confirm update to parent topic' }, async (summary, detail) => {
    if (failNext) { failNext = false; throw new Error('The topic changed'); }
    saved.push([summary, detail]);
  });
  modal.onOpen();
  assert.ok(find(modal.contentEl, item => item.text === 'Confirming replaces the summary and details of “Parent”.'));
  assert.ok(find(modal.contentEl, item => item.text === 'Old summary'));
  const previews = [];
  (function collect(item) { if (item.cls.includes('vam-draft-preview')) previews.push(item); item.children.forEach(collect); })(modal.contentEl);
  assert.deepEqual(previews.map(item => item.rendered), ['New summary', '## Result\n\n- **one**']);
  const inputs = [];
  (function collect(item) { if (item.tag === 'textarea') inputs.push(item); item.children.forEach(collect); })(modal.contentEl);
  assert.deepEqual(inputs.map(item => item.hidden), [true, true]);
  const toggle = find(modal.contentEl, item => item.cls.includes('vam-draft-toggle'));
  assert.equal(toggle.text, 'Edit');
  toggle.click();
  assert.equal(toggle.text, 'Preview'); assert.equal(toggle.attr['aria-pressed'], 'true');
  assert.deepEqual(inputs.map(item => item.hidden), [false, false]); assert.equal(inputs[0].focused, true);
  inputs[1].value = '## Edited';
  toggle.click();
  assert.equal(previews[1].rendered, '## Edited');
  // Actions sit in a fixed bar below the scrolling content, not inside it.
  const actions = find(modal.modalEl, item => item.cls === 'vam-next-actions');
  assert.ok(modal.modalEl.cls.includes('vam-review-modal')); assert.equal(find(modal.contentEl, item => item.cls === 'vam-next-actions'), undefined);
  const actionButtons = actions.children.filter(item => item.tag === 'button');
  assert.deepEqual(actionButtons.map(item => item.text), ['Cancel', 'Confirm update to parent topic']);
  const confirm = actionButtons[1];
  assert.ok(confirm.cls.includes('mod-cta'));
  confirm.click(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.notEqual(modal.closed, true); assert.equal(confirm.disabled, false);
  assert.ok(find(actions, item => item.cls.includes('vam-next-status') && /The topic changed/.test(item.text ?? '')));
  confirm.click(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(saved, [['New summary', '## Edited']]); assert.equal(modal.closed, true);
});
integrationTest('draft review asks once more before discarding the AI draft', async () => {
  const element = (tag, options = {}) => ({
    tag, text: options.text, value: options.text ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], hidden: false,
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, removeClass(name) { this.cls = this.cls.split(' ').filter(item => item !== name).join(' '); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { if (name === 'click') this.click = handler; }, empty() { this.children = []; }, focus() {}
  });
  const find = (root, predicate) => predicate(root) ? root : root.children.map(child => find(child, predicate)).find(Boolean);
  class Modal { constructor() { this.modalEl = element('modal'); this.titleEl = element('title'); this.contentEl = element('content'); } close() { this.closed = true; this.onClose?.(); } }
  class Component { load() {} unload() {} addChild(child) { return child; } removeChild() {} }
  const { DraftReviewModal } = load('main.ts', { obsidian: { ...obsidian, Modal, Component, MarkdownRenderer: { render: async () => {} }, setIcon: () => {} } });
  let discarded = 0;
  const modal = new DraftReviewModal({}, 'S', 'D', { intro: 'Intro', confirmLabel: 'Confirm update to parent topic' }, () => {}, () => { discarded++; });
  modal.onOpen();
  const actions = find(modal.modalEl, item => item.cls === 'vam-next-actions');
  assert.deepEqual(actions.children.filter(item => item.tag === 'button').map(item => item.text), ['Discard', 'Cancel', 'Confirm update to parent topic']);
  const discard = actions.children.find(item => item.tag === 'button');
  assert.ok(discard.cls.includes('vam-discard')); assert.ok(!discard.cls.includes('mod-warning'));
  discard.click();
  assert.equal(discarded, 0); assert.notEqual(modal.closed, true);
  assert.equal(discard.text, 'Discard draft?'); assert.ok(discard.cls.includes('mod-warning'));
  assert.match(find(actions, item => item.cls.includes('vam-next-status')).text, /cannot be recovered/);
  discard.click();
  assert.equal(discarded, 1); assert.equal(modal.closed, true);
});
integrationTest('proposal list groups children, links parent and child checks and keeps errors in the dialog', () => {
  const element = (tag, options = {}) => ({
    tag, type: options.type, text: options.text, value: options.value ?? options.text ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], hidden: false, disabled: false, checked: false,
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { this[name] = handler; }, empty() { this.children = []; }, focus() {}
  });
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const find = (root, predicate) => all(root, predicate)[0];
  class Modal { constructor() { this.modalEl = element('modal'); this.titleEl = element('title'); this.contentEl = element('content'); } close() { this.closed = true; } }
  const { ChildProposalModal } = load('main.ts', { obsidian: { ...obsidian, Modal, setIcon: () => {} } });
  let submitted;
  const modal = new ChildProposalModal({}, [
    { title: 'Heat', task: 'T1', contribution: '', parentTitle: '' },
    { title: 'Dry it', task: 'T3', contribution: '', parentTitle: 'Water' },
    { title: 'Water', task: 'T2', contribution: '', parentTitle: '' }
  ], items => { submitted = items; });
  modal.onOpen();
  const rows = all(modal.contentEl, item => item.cls.split(' ').includes('vam-proposal'));
  const names = rows.map(row => find(row, item => item.tag === 'input' && item.type === 'text').value);
  assert.deepEqual(names, ['Heat', 'Water', 'Dry it']);
  assert.deepEqual(rows.map(row => row.cls.includes('is-child')), [false, false, true]);
  // Details stay folded until asked for.
  const body = find(rows[0], item => item.cls === 'vam-proposal-body'); const more = find(rows[0], item => item.cls === 'vam-proposal-more');
  assert.equal(body.hidden, true); more.click(); assert.equal(body.hidden, false); assert.equal(more.attr['aria-expanded'], 'true');
  const checks = rows.map(row => find(row, item => item.type === 'checkbox'));
  const create = find(modal.modalEl, item => item.tag === 'button' && item.cls.includes('mod-cta'));
  const count = find(modal.contentEl, item => item.cls === 'vam-proposal-count');
  assert.equal(create.text, 'Create subtopics (3)'); assert.equal(count.text, '3 of 3 selected');
  checks[1].checked = false; checks[1].change();
  assert.equal(checks[2].checked, false, 'unchecking a parent unchecks its children');
  assert.equal(create.text, 'Create subtopics (1)');
  checks[2].checked = true; checks[2].change();
  assert.equal(checks[1].checked, true, 'checking a child checks its parent');
  const toggleAll = find(modal.contentEl, item => item.cls === 'vam-proposal-all');
  assert.equal(toggleAll.text, 'Select none'); toggleAll.click();
  assert.deepEqual(checks.map(check => check.checked), [false, false, false]); assert.equal(create.disabled, true); assert.equal(toggleAll.text, 'Select all');
  toggleAll.click();
  const waterName = find(rows[1], item => item.type === 'text'); waterName.value = 'Heat';
  create.click();
  assert.equal(modal.closed, undefined); assert.equal(submitted, undefined);
  assert.match(find(modal.modalEl, item => item.cls.includes('vam-next-status')).text, /must be unique/);
  waterName.value = 'Moisture';
  create.click();
  assert.equal(modal.closed, true);
  assert.equal(JSON.stringify(submitted.map(item => [item.title, item.parentTitle])), JSON.stringify([['Heat', ''], ['Moisture', ''], ['Dry it', 'Moisture']]));
});
integrationTest('merge dialog names the topic after its sources and explains a blocked next step', () => {
  const element = (tag, options = {}) => ({
    tag, type: options.type, text: options.text, value: options.value ?? options.text ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], disabled: false,
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { this[name] = handler; }, focus() {}, select() {}
  });
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const find = (root, predicate) => all(root, predicate)[0];
  class Modal { constructor() { this.modalEl = element('modal'); this.titleEl = element('title'); this.contentEl = element('content'); } close() { this.closed = true; } }
  const { IntegrationModal } = load('main.ts', { obsidian: { ...obsidian, Modal, setIcon: () => {} } });
  let submitted;
  const modal = new IntegrationModal({}, ['Heat', 'Water'], (title, goal) => { submitted = [title, goal]; });
  modal.onOpen();
  const name = find(modal.contentEl, item => item.tag === 'input' && item.attr['aria-label'] === 'New topic name');
  assert.equal(name.value, 'Synthesis: Heat, Water');
  const many = new IntegrationModal({}, ['Heat', 'Water', 'Salt'], () => {}); many.onOpen();
  assert.equal(find(many.contentEl, item => item.tag === 'input' && item.attr['aria-label'] === 'New topic name').value, 'Synthesis: Heat and others (3 topics)');
  const next = find(modal.modalEl, item => item.tag === 'button' && item.cls.includes('mod-cta'));
  const status = find(modal.modalEl, item => item.cls.includes('vam-next-status'));
  assert.equal(next.text, 'Next (1 of 2): set AI sources'); assert.equal(next.disabled, false); assert.equal(status.text, '');
  name.value = '  '; name.input();
  assert.equal(next.disabled, true); assert.match(status.text, /topic name and a synthesis goal/);
  name.value = 'Cooking water'; name.input();
  assert.equal(next.disabled, false); assert.equal(status.text, '');
  next.click();
  assert.equal(modal.closed, true); assert.equal(submitted[0], 'Cooking water');
});
integrationTest('review dialogs: duplicate parents list each proposal once, discard waits for a running save, and a failed render shows plain text', async () => {
  const element = (tag, options = {}) => ({
    tag, type: options.type, text: options.text, value: options.value ?? options.text ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], hidden: false, disabled: false, checked: false,
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, removeClass(name) { this.cls = this.cls.split(' ').filter(item => item !== name).join(' '); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { this[name] = handler; }, empty() { this.children = []; this.text = undefined; }, focus() {}
  });
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const find = (root, predicate) => all(root, predicate)[0];
  class Modal { constructor() { this.modalEl = element('modal'); this.titleEl = element('title'); this.contentEl = element('content'); } close() { this.closed = true; this.onClose?.(); } }
  class Component { load() {} unload() {} addChild(child) { return child; } removeChild() {} }
  const MarkdownRenderer = { render: async () => { throw new Error('render failed'); } };
  const { ChildProposalModal, DraftReviewModal } = load('main.ts', { obsidian: { ...obsidian, Modal, Component, MarkdownRenderer, setIcon: () => {} } });
  const proposals = new ChildProposalModal({}, [
    { title: 'Heat', task: '', contribution: '', parentTitle: '' },
    { title: 'Heat', task: '', contribution: '', parentTitle: '' },
    { title: 'Pan', task: '', contribution: '', parentTitle: 'Heat' }
  ], () => {});
  proposals.onOpen();
  assert.equal(all(proposals.contentEl, item => item.cls.split(' ').includes('vam-proposal')).length, 3);
  let finishSave, discarded = 0;
  const draft = new DraftReviewModal({}, 'S', '## D', { intro: 'Intro', confirmLabel: 'Confirm' }, () => new Promise(resolve => { finishSave = resolve; }), () => { discarded++; });
  draft.onOpen(); await new Promise(resolve => setTimeout(resolve, 0));
  const previews = all(draft.contentEl, item => item.cls.includes('vam-draft-preview'));
  assert.deepEqual(previews.map(item => item.text), ['S', '## D']);
  const buttons = all(draft.modalEl, item => item.tag === 'button' && item.cls !== 'vam-draft-toggle');
  const [discard, cancel, confirm] = buttons;
  confirm.click();
  assert.equal(cancel.disabled, true);
  discard.click(); discard.click();
  assert.equal(discarded, 0, 'discard does nothing while the save runs');
  finishSave(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(draft.closed, true);
});
integrationTest('structure panel: a parent change waits for Apply, says what will change, and keeps Remove apart', () => {
  const element = (tag, options = {}) => ({
    tag, text: options.text, value: options.value ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], disabled: false,
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { this[name] = handler; }
  });
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const find = (root, predicate) => all(root, predicate)[0];
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const nodes = [{ id: 'a', path: 'A.md', parentId: null }, { id: 'b', path: 'B.md', parentId: null }, { id: 'c', path: 'C.md', parentId: 'a' }];
  const changes = []; let closed = 0, removed = 0;
  const view = {
    builtIn: false, map: { nodes }, notes: new Map([['a', { title: 'Heat' }], ['b', { title: 'Water' }], ['c', { title: 'Pan', sourcePaths: [] }]]),
    app: { vault: { getAbstractFileByPath: () => null } }, referenceSourcePaths: () => [],
    button(parent, text, click) { const b = parent.createEl('button', { text }); b.click = click; return b; },
    confirmRemoveNode() { removed++; }, enqueue(work) { work(); }, mapChange(change) { const copy = { nodes: nodes.map(n => ({ ...n })) }; change(copy); changes.push(copy.nodes.find(n => n.id === 'c').parentId); }
  };
  const content = element('content'), host = element('modal');
  VisualAgentMapView.prototype.renderInspector.call(view, content, nodes[2], 'structure', () => { closed++; }, host);
  assert.ok(find(content, item => item.text === 'Topic: Pan'));
  assert.equal(find(content, item => item.tag === 'button' && item.text === 'Remove parent link'), undefined);
  const actions = find(host, item => item.cls === 'vam-next-actions');
  const buttons = actions.children.filter(item => item.tag === 'button');
  assert.deepEqual(buttons.map(item => item.text), ['Remove from map', 'Close', 'Apply']);
  assert.ok(buttons[0].cls.includes('vam-discard'));
  const apply = buttons[2], status = find(actions, item => item.cls.includes('vam-next-status'));
  assert.equal(apply.disabled, true);
  const select = find(content, item => item.tag === 'select');
  select.value = 'b'; select.change();
  assert.equal(apply.disabled, false); assert.equal(status.text, 'Will move under “Water”.'); assert.equal(changes.length, 0);
  select.value = ''; select.change();
  assert.equal(status.text, 'Will become a root topic.');
  apply.click();
  assert.equal(closed, 1); assert.deepEqual(changes, [null]);
  buttons[0].click();
  assert.equal(removed, 1);
});
integrationTest('expansion suggestions panel uses the shared list, treats the topic as first-level parent and asks before discarding', async () => {
  const element = (tag, options = {}) => ({
    tag, type: options.type, text: options.text, value: options.value ?? options.text ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], hidden: false, disabled: false, checked: false,
    get textContent() { return this.text; },
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, removeClass(name) { this.cls = this.cls.split(' ').filter(item => item !== name).join(' '); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { this[name] = handler; }
  });
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const find = (root, predicate) => all(root, predicate)[0];
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const node = { id: 'p', path: 'P.md', parentId: null };
  const suggestions = [{ title: 'Heat', task: '', contribution: '', parentTitle: 'Parent' }, { title: 'Pan', task: '', contribution: '', parentTitle: 'Heat' }];
  const pendingSuggestions = new Map([['P.md', suggestions]]);
  let created, closed = 0, rendered = 0;
  const view = {
    map: { nodes: [node] }, render() { rendered++; },
    plugin: { pendingSuggestions, pendingResearchOptions: new Map(), expansionCoordinator: { isRunning: () => false }, mutate: async work => work() },
    assertSuggestionOrigin: async () => {}, createChildBatch: async (_parent, items) => { created = items; return []; }, startShallowResearch: async () => {}
  };
  const panel = element('panel'), host = element('modal');
  VisualAgentMapView.prototype.renderPendingProposals.call(view, panel, node, { title: 'Parent' }, () => { closed++; }, host);
  const rows = all(panel, item => item.cls.split(' ').includes('vam-proposal'));
  assert.deepEqual(rows.map(row => row.cls.includes('is-child')), [false, true]);
  const actions = find(host, item => item.cls === 'vam-next-actions');
  const [discard, close, create] = actions.children.filter(item => item.tag === 'button');
  assert.equal(create.text, 'Create subtopics (2)'); assert.ok(discard.cls.includes('vam-discard')); assert.equal(close.text, 'Close');
  discard.click();
  assert.equal(pendingSuggestions.has('P.md'), true); assert.equal(discard.text, 'Discard draft?');
  create.click(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(JSON.stringify(created.map(item => [item.title, item.parentTitle])), JSON.stringify([['Heat', ''], ['Pan', 'Heat']]));
  assert.equal(closed, 1);
  pendingSuggestions.set('P.md', suggestions);
  const again = element('panel'), host2 = element('modal');
  VisualAgentMapView.prototype.renderPendingProposals.call(view, again, node, { title: 'Parent' }, () => { closed++; }, host2);
  const discard2 = find(host2, item => item.tag === 'button' && item.cls.includes('vam-discard'));
  discard2.click(); discard2.click(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(pendingSuggestions.has('P.md'), false); assert.equal(closed, 2);
});
integrationTest('name dialog ignores Enter while composing, explains an empty name, and keeps buttons in the action bar', () => {
  const element = (tag, options = {}) => ({
    tag, type: options.type, text: options.text, value: options.value ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], disabled: false,
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { this[name] = handler; }, focus() {}, select() {}
  });
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const find = (root, predicate) => all(root, predicate)[0];
  class Modal { constructor() { this.titleEl = element('title'); this.contentEl = element('content'); this.modalEl = element('modal'); this.modalEl.children.push(this.contentEl); } close() { this.closed = true; } }
  const { NameModal } = load('ui/modals/name-modal.ts', { obsidian: { ...obsidian, Modal } });
  const saved = [];
  const modal = new NameModal({}, 'New topic name', 'Heat', value => saved.push(value));
  modal.onOpen();
  const input = find(modal.contentEl, item => item.tag === 'input');
  const save = find(modal.modalEl, item => item.tag === 'button' && item.text === 'Save');
  const status = find(modal.modalEl, item => item.cls.includes('vam-next-status'));
  input.value = '溫度'; input.keydown({ key: 'Enter', isComposing: true });
  assert.deepEqual(saved, []); assert.notEqual(modal.closed, true);
  input.value = '   '; input.input();
  assert.equal(save.disabled, true); assert.match(status.text, /Enter a name/);
  input.value = '溫度'; input.input();
  assert.equal(save.disabled, false); assert.equal(status.text, '');
  input.keydown({ key: 'Enter', isComposing: false });
  assert.deepEqual(saved, ['溫度']); assert.equal(modal.closed, true);
});
integrationTest('choice dialog marks destructive choices and starts on Cancel; map conflict explains each choice and keeps merge errors inline', () => {
  const element = (tag, options = {}) => ({
    tag, text: options.text, value: options.value ?? options.text ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], hidden: false, open: false,
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { this[name] = handler; }, focus() { this.focused = true; }
  });
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const find = (root, predicate) => all(root, predicate)[0];
  class Modal { constructor() { this.titleEl = element('title'); this.contentEl = element('content'); this.modalEl = element('modal'); this.modalEl.children.push(this.contentEl); } close() { this.closed = true; this.onClose?.(); } }
  const buttons = [];
  class Setting { constructor() {} setName() { return this; } setDesc() { return this; } addButton(fn) { const b = { setButtonText(v) { this.text = v; return this; }, onClick(h) { this.click = h; return this; }, setDestructive() { this.destructive = true; return this; } }; fn(b); buttons.push(b); return this; } }
  const { ChoiceModal } = load('ui/modals/choice-modal.ts', { obsidian: { ...obsidian, Modal, Setting } });
  let ran = 0;
  const choice = new ChoiceModal({}, 'Remove from map', 'Notes move to Unassigned.', [{ label: 'Remove entire branch', warning: true, action: () => { ran++; } }, { label: 'Keep', action: () => {} }]);
  choice.onOpen();
  assert.deepEqual(buttons.map(b => [b.text, !!b.destructive]), [['Remove entire branch', true], ['Keep', false]]);
  // Every destructive caller in the map view passes warning: true, including deleting the map.
  const viewSource = fs.readFileSync(path.join(root, 'experiences/visual-map/view.ts'), 'utf8');
  assert.match(viewSource, /buttonLabel: t\("ui\.move_to_trash"\),\s*warning: true/);
  const cancel = find(choice.modalEl, item => item.cls === 'vam-next-actions').children[0];
  assert.equal(cancel.text, 'Cancel'); assert.equal(cancel.focused, true);
  buttons[0].click(); assert.equal(ran, 1); assert.equal(choice.closed, true);
  const { MapConflictModal } = load('experiences/visual-map/modals.ts', { obsidian: { ...obsidian, Modal, Setting } });
  const disk = { version: 1, id: 'm', title: 'Disk', nodes: [] }, local = { version: 1, id: 'm', title: 'Local', nodes: [] };
  const resolved = [];
  const conflict = new MapConflictModal({}, local, disk, map => resolved.push(map.title));
  conflict.onOpen();
  const options = all(conflict.contentEl, item => item.cls === 'vam-conflict-option');
  assert.equal(options.length, 2);
  assert.ok(find(options[0], item => /on disk/.test(item.text ?? ''))); assert.ok(find(options[1], item => /overwrites/.test(item.text ?? '')));
  const actions = find(conflict.modalEl, item => item.cls === 'vam-next-actions');
  const status = find(actions, item => item.cls.includes('vam-next-status'));
  assert.match(status.text, /Closing this window uses the file/);
  const merged = find(actions, item => item.tag === 'button');
  assert.equal(merged.hidden, true);
  const details = find(conflict.contentEl, item => item.cls === 'vam-conflict-merge'); details.open = true; details.toggle();
  assert.equal(merged.hidden, false);
  find(details, item => item.tag === 'textarea').value = '{ not json';
  merged.click();
  assert.notEqual(conflict.closed, true); assert.match(status.text, /Invalid merged contents|merged/i);
  find(options[1], item => item.tag === 'button').click();
  assert.deepEqual(resolved, ['Local']);
});
integrationTest('proposal list links checks and parents at any depth', () => {
  const element = (tag, options = {}) => ({
    tag, type: options.type, text: options.text, value: options.value ?? options.text ?? '', cls: options.cls ?? '', attr: options.attr ?? {}, children: [], hidden: false, disabled: false, checked: false,
    createDiv(value) { const child = element('div', typeof value === 'string' ? { cls: value } : value); this.children.push(child); return child; },
    createEl(name, value) { const child = element(name, value); this.children.push(child); return child; },
    createSpan(value) { const child = element('span', value); this.children.push(child); return child; },
    addClass(name) { this.cls = `${this.cls} ${name}`.trim(); }, setText(value) { this.text = value; }, setAttr(name, value) { this.attr[name] = value; },
    addEventListener(name, handler) { this[name] = handler; }
  });
  const all = (root, predicate) => [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => all(child, predicate))];
  const { renderProposalList } = load('experiences/visual-map/modals.ts', { obsidian });
  const parent = element('panel');
  const list = renderProposalList(parent, [
    { title: 'Heat', task: '', contribution: '', parentTitle: '' },
    { title: 'Pan', task: '', contribution: '', parentTitle: 'Heat' },
    { title: 'Iron pan', task: '', contribution: '', parentTitle: 'Pan' }
  ], () => {});
  const checks = all(parent, item => item.type === 'checkbox');
  checks[0].checked = false; checks[0].change();
  assert.deepEqual(checks.map(c => c.checked), [false, false, false]);
  checks[2].checked = true; checks[2].change();
  assert.deepEqual(checks.map(c => c.checked), [true, true, true]);
  const picked = list.selected();
  assert.equal(JSON.stringify(picked.map(item => [item.title, item.parentTitle])), JSON.stringify([['Heat', ''], ['Pan', 'Heat'], ['Iron pan', 'Pan']]));
});

