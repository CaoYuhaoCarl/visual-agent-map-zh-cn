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
  const view = new VisualAgentMapView({ app: {} }, { pendingSuggestions: new Map([['parent.md', [{ title: 'Idea', task: 'Investigate', contribution: '' }]]]), expansionBatches: new Map() });
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
  assert.equal(view.selected, topic.id); assert.equal(renders, 1); assert.deepEqual(details, [topic.id]);
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
  assert.deepEqual(details, [topic.id]);
  assert.equal(opened.filter(([, mode]) => mode === 'edit').length, 0);
  view.suppressClickUntil = 0; events.get('div:click')({ target: { closest: () => null }, metaKey: false, ctrlKey: false });
  assert.deepEqual(details, [topic.id, topic.id]);
  events.get('div:keydown')({ key: 'Enter', target: view.stageEl.children[0] });
  assert.deepEqual(details, [topic.id, topic.id, topic.id]);
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
    addEventListener(name, handler) { if (name === 'click') this.click = handler; if (name === 'change') this.change = handler; if (name === 'input') this.input = handler; },
    querySelector(selector) { const name = selector.slice(1); return find(this, item => item.cls.split(' ').includes(name)); },
    querySelectorAll(selector) { return all(this, item => selector === 'button[data-topic-run]' && item.tag === 'button' && item.dataset.topicRun !== undefined); },
    empty() { this.children = []; }, remove() { this.removed = true; }
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
  assert.deepEqual(cards.children.map(item => item['aria-pressed']), ['true', 'false', 'false']);
  const [research, expand, synthesize] = all(modal.contentEl, item => item.cls.includes('vam-next-research'));
  const panelHeader = find(modal.contentEl, item => item.cls.includes('vam-next-panel-header'));
  const panelTitle = find(panelHeader, item => item.tag === 'h3');
  const researchAction = button(panelHeader, 'Confirm research task');
  assert.equal(modal.contentEl.children.indexOf(cards), modal.contentEl.children.indexOf(panelHeader) + 1);
  assert.equal(panelTitle.text, 'Research this topic');
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
  assert.equal(sourceDisclosures.length, 3);
  assert.ok(sourceDisclosures.every(item => item.open === false));
  assert.ok(sourceDisclosures.every(item => item.children[0].children[0].children[1].text.includes('0 Markdown files')));
  const outputLanguage = find(modal.contentEl, item => item['aria-label'] === 'Answer language for this task');
  assert.equal(outputLanguage.value, 'en');
  outputLanguage.value = 'zh-TW';
  assert.equal(plugin.settings.language, 'en'); assert.equal(panelTitle.text, 'Research this topic');
  const requirements = find(modal.contentEl, item => item.tag === 'textarea');
  assert.equal(requirements.value, '');
  assert.equal(all(modal.contentEl, item => item.tag === 'textarea').length, 1);
  assert.equal(button(modal.contentEl, 'Save instructions'), undefined);
  requirements.value = 'Only this run';
  const researchChecks = all(research, item => item.tag === 'input' && item.type === 'checkbox');
  assert.equal(researchChecks.length, 2); assert.ok(researchChecks[0].checked); assert.ok(researchChecks[1].checked);
  assert.ok(find(research, item => item.text === 'Search for image references'));
  assert.ok(find(research, item => /Standard: provide the main evidence, limits, and open questions/.test(item.text ?? '')), JSON.stringify(all(research, item => item.text).map(item => item.text)));
  const expandChecks = all(expand, item => item.tag === 'input' && item.type === 'checkbox');
  assert.equal(expandChecks.length, 3); assert.ok(expandChecks[0].checked); assert.ok(expandChecks[1].checked);
  assert.ok(find(expand, item => item.text === 'Search for image references'));
  assert.equal(all(research, item => item.tag === 'input' && item.type === 'file').length, 2);
  assert.equal(all(expand, item => item.tag === 'input' && item.type === 'file').length, 2);
  assert.equal(all(synthesize, item => item.tag === 'input' && item.type === 'file').length, 2);
  assert.ok(find(research, item => item.text === 'Allow web search'));
  assert.ok(find(expand, item => item.text === 'Allow web search'));
  assert.ok(find(synthesize, item => item.text === 'Allow web search'));
  assert.equal(find(synthesize, item => item.text === 'Does not copy full subtopic notes'), undefined);
  cards.children[1].click();
  assert.equal(panelTitle.text, 'Expand this topic'); assert.equal(researchAction.hidden, true);
  assert.equal(research.style.display, 'none'); assert.equal(expand.style.display, '');
  expandChecks[0].checked = false; expandChecks[0].change();
  assert.equal(expandChecks[1].disabled, true); assert.equal(expandChecks[1].checked, false);
  button(expand, 'Review AI subtopic suggestions').click(); await tick();
  assert.equal(expandCalls, 1); assert.equal(closed, 0);
  const proposalCheck = find(expand.querySelector('.vam-next-result'), item => item.tag === 'input' && item.type === 'checkbox');
  proposalCheck.checked = false; button(expand, 'Create subtopics').click(); await tick();
  assert.equal(created, undefined); assert.equal(expand.querySelector('.vam-next-status').text, 'Select at least one subtopic.');
  proposalCheck.checked = true;
  button(expand, 'Create subtopics').click(); await tick();
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
  button(firstPanel, 'Get expansion directions').click(); await tick();
  assert.equal(firstPanel.querySelector('.vam-next-status').text, 'No useful proposals');
  assert.equal(firstRequirements.value, 'Keep this while retrying'); assert.equal(closed, 0);
  button(firstPanel, 'Get expansion directions').click(); await tick();
  assert.ok(find(firstPanel.querySelector('.vam-next-result'), item => item.text === 'AI subtopic proposals'));
  const firstCheckbox = find(firstPanel.querySelector('.vam-next-result'), item => item.tag === 'input' && item.type === 'checkbox');
  firstCheckbox.checked = false;
  button(firstPanel, 'Create subtopics').click(); await tick();
  assert.equal(firstCreated, undefined); assert.equal(firstPanel.querySelector('.vam-next-status').text, 'Select at least one subtopic.');
  firstCheckbox.checked = true;
  const firstName = find(firstPanel.querySelector('.vam-next-result'), item => item.tag === 'input' && item.type === 'text'); firstName.value = 'Edited idea';
  button(firstPanel, 'Create subtopics').click(); await tick();
  assert.equal(firstCreated[0].title, 'Edited idea'); assert.equal(closed, 0);
  const contentChoice = find(synthesize, item => item.tag === 'select' && item['aria-label'] === 'Topic synthesis content');
  assert.equal(contentChoice.value, 'full');
  assert.ok(find(synthesize, item => item.tag === 'li' && item.text === 'Child A'));
  assert.ok(find(synthesize, item => item.tag === 'li' && item.text === 'Child B'));
  contentChoice.value = 'summary'; contentChoice.change();
  assert.ok(find(synthesize, item => /Important conditions in the body may be omitted/.test(item.text ?? '')));
  cards.children[2].click(); assert.equal(panelTitle.text, 'Synthesize subtopic findings'); assert.equal(researchAction.hidden, true);
  // Starting synthesis closes its window at once, so it runs on its own modal and this one stays open for research.
  const synthModal = new NextStepModal({}, 'Parent', 'normal', 1, 1, plugin, async () => {}, async () => {}, modal.synthesize, modelSettings);
  synthModal.onOpen(); find(synthModal.contentEl, item => item.cls === 'vam-next-cards').children[2].click();
  find(synthModal.contentEl, item => item['aria-label'] === 'Answer language for this task').value = 'zh-TW';
  const synthPanel = all(synthModal.contentEl, item => item.cls.includes('vam-next-research'))[2];
  const synthContentChoice = find(synthPanel, item => item.tag === 'select' && item['aria-label'] === 'Topic synthesis content');
  synthContentChoice.value = 'summary'; synthContentChoice.change();
  const closedBeforeSynthStart = closed;
  button(synthPanel, 'Get synthesis suggestions first').click(); await tick();
  assert.equal(synthContentChoice.disabled, true);
  assert.equal(synthOptions.synthesisContent, 'summary');
  assert.equal(synthCalls, 1); assert.equal(closed, closedBeforeSynthStart + 1); assert.equal(synthModal.closed, true);
  assert.equal(synthOptions.researchMode, 'local');
  assert.equal(synthOptions.outputLanguage, 'zh-TW');
  assert.equal(button(synthPanel, 'Choose this direction'), undefined);
  closed = closedBeforeSynthStart;
  cards.children[0].click(); assert.equal(panelTitle.text, 'Research this topic'); assert.equal(researchAction.hidden, false);
  button(modal.contentEl, 'Confirm research task').click(); await tick();
  assert.equal(researchOptions.requirements, 'Only this run'); assert.equal(researchOptions.researchMode, 'research'); assert.equal(researchOptions.referenceGroups.length, 0);
  assert.equal(researchOptions.outputLanguage, 'zh-TW');
  assert.equal(closed, 1); assert.equal(research.querySelector('.vam-next-result'), undefined);
  const quickModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, modal.expand, async () => {});
  quickModal.onOpen(); find(quickModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click(); button(quickModal.contentEl, 'Quickly explore a map').click();
  find(quickModal.contentEl, item => item['aria-label'] === 'Answer language for this task').value = 'zh-TW';
  assert.equal(button(quickModal.contentEl, 'Review AI subtopic suggestions'), undefined);
  const quickNumbers = all(quickModal.contentEl, item => item.tag === 'input' && item.type === 'number');
  const [levelInput, , childrenInput] = quickNumbers;
  assert.equal(childrenInput.disabled, false);
  levelInput.value = '1'; levelInput.input();
  assert.equal(childrenInput.disabled, true);
  assert.equal(find(quickModal.contentEl, item => item.text === 'Not used when expanding only one level.').hidden, false);
  levelInput.value = '2'; levelInput.input();
  assert.equal(childrenInput.disabled, false);
  button(quickModal.contentEl, 'Create starter map now').click(); await tick();
  assert.equal(quickOptions.multiLayer, true); assert.equal(quickOptions.shallowResearch, false); assert.equal(quickOptions.layers, 2); assert.equal(quickOptions.firstLayerCount, 3); assert.equal(quickOptions.childrenPerParent, 2); assert.equal(closed, 2);
  assert.equal(quickOptions.researchMode, 'local'); assert.equal(quickOptions.referenceGroups.length, 0); assert.equal(quickOptions.outputLanguage, 'zh-TW');
  const partial = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async (_options, _direction, _found, failed) => failed('部分子議題已建立，請重新開啟視窗。', false), async () => {});
  partial.onOpen(); find(partial.contentEl, item => item.cls === 'vam-next-cards').children[1].click(); button(partial.contentEl, 'Quickly explore a map').click();
  const closedBeforePartial = closed;
  button(partial.contentEl, 'Create starter map now').click(); await tick();
  assert.equal(closed, closedBeforePartial); assert.equal(button(partial.contentEl, 'Create starter map now').disabled, true); assert.match(all(partial.contentEl, item => item.cls.includes('vam-next-research'))[1].querySelector('.vam-next-status').text, /部分子議題已建立/);
  let continueBackground; let acceptedSignal;
  const background = new Promise(resolve => { continueBackground = resolve; });
  const acceptedModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async (options, _direction, _found, _failed, _created, accepted) => { acceptedSignal = options.signal; accepted(); await background; }, async () => {});
  acceptedModal.onOpen(); find(acceptedModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click(); button(acceptedModal.contentEl, 'Quickly explore a map').click(); button(acceptedModal.contentEl, 'Create starter map now').click();
  await until(() => acceptedModal.closed);
  assert.equal(acceptedSignal.aborted, false); assert.equal(acceptedModal.taskSignal, undefined);
  continueBackground(); await tick();
  // Synthesis runs in the background: accepting the dispatch closes the modal without aborting the AI.
  let directionSignal, directionCalls = [];
  const directionsModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async () => {}, async (options, direction, _failed, accepted) => { directionSignal = options.signal; directionCalls.push(direction); accepted(); await background2; }, modelSettings);
  let continueBackground2; const background2 = new Promise(resolve => { continueBackground2 = resolve; });
  const closedBeforeSynth = closed;
  directionsModal.onOpen(); find(directionsModal.contentEl, item => item.cls === 'vam-next-cards').children[2].click();
  button(directionsModal.contentEl, 'Get synthesis suggestions first').click();
  await until(() => directionsModal.closed);
  assert.equal(closed, closedBeforeSynth + 1); assert.deepEqual(directionCalls, [null]);
  assert.equal(directionSignal.aborted, false); assert.equal(directionsModal.taskSignal, undefined);
  continueBackground2(); await tick();
  // Reopening from the node badge shows the pending directions; the draft step is also accepted and closes the modal.
  let discarded = 0, draftSignal; const draftCalls = [];
  const pendingModal2 = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async () => {}, async (options, direction, _failed, accepted) => { draftSignal = options.signal; draftCalls.push(direction); accepted(); },
    { ...modelSettings, synthesisPending: { directions: [{ title: 'Shared constraints', task: 'Find tradeoffs', contribution: 'Across children' }, { title: 'Open questions', task: 'List gaps', contribution: '' }], discard: () => { discarded++; } } });
  pendingModal2.onOpen();
  const pendingPanel = all(pendingModal2.contentEl, item => item.cls.includes('vam-next-research'))[2];
  assert.equal(button(pendingModal2.contentEl, 'Get synthesis suggestions first'), undefined);
  assert.equal(pendingPanel.style.display, '');
  const directionBox = find(pendingPanel, item => item.tag === 'textarea' && item['aria-label'] === 'Synthesis direction');
  assert.equal(directionBox.value ?? directionBox.text, 'Find tradeoffs');
  button(pendingPanel, 'Choose this direction').click();
  directionBox.value = 'Edited direction';
  button(pendingPanel, 'Get synthesis draft').click(); await until(() => pendingModal2.closed);
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
  button(emptyPanel, 'Get synthesis suggestions first').click(); await tick();
  assert.equal(synthCalls, 1); assert.equal(emptyOptions, undefined);
  const failing = new NextStepModal({}, 'Parent', 'normal', 1, 1, plugin, async () => {}, async (_options, _direction, _found, failed) => failed('Provider failed'), async () => {});
  failing.onOpen(); find(failing.contentEl, item => item.cls === 'vam-next-cards').children[1].click();
  button(failing.contentEl, 'Review AI subtopic suggestions').click(); await tick();
  assert.equal(all(failing.contentEl, item => item.cls.includes('vam-next-research'))[1].querySelector('.vam-next-status').text, 'Provider failed'); assert.equal(closed, 3);
  const failedResearch = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async (_options, _focus, _done, failed) => failed('Cannot start'), async () => {}, async () => {});
  failedResearch.onOpen(); button(failedResearch.contentEl, 'Confirm research task').click(); await tick();
  assert.equal(closed, 3); assert.equal(all(failedResearch.contentEl, item => item.cls.includes('vam-next-research'))[0].querySelector('.vam-next-status').text, 'Cannot start');
  const unacceptedResearch = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async () => {}, async () => {});
  unacceptedResearch.onOpen(); button(unacceptedResearch.contentEl, 'Confirm research task').click(); await tick();
  const unacceptedPanel = all(unacceptedResearch.contentEl, item => item.cls.includes('vam-next-research'))[0];
  assert.equal(closed, 3); assert.equal(button(unacceptedResearch.contentEl, 'Confirm research task').disabled, false);
  assert.match(unacceptedPanel.querySelector('.vam-next-status').text, /cancelled/i);
  let acknowledged = 0, began = 0;
  let firstUseConfirmed = false;
  const firstUsePlugin = { settings: { codexUsageNoticeSeen: false }, aiReadyForModel: async () => true, confirmAiUsage: async (_model, run) => { if (!firstUseConfirmed) { firstUseConfirmed = true; return false; } acknowledged++; await run(); return true; }, saveSettings: async () => { acknowledged++; } };
  const firstUse = new NextStepModal({}, 'Parent', 'normal', 1, 0, firstUsePlugin, async (_options, _focus, _done, _failed, accepted) => { began++; accepted(); }, async () => {}, async () => {});
  firstUse.onOpen(); button(firstUse.contentEl, 'Confirm research task').click(); await tick();
  assert.equal(began, 0); assert.equal(button(firstUse.contentEl, 'Understand and run'), undefined); assert.equal(closed, 3);
  button(firstUse.contentEl, 'Confirm research task').click(); await tick();
  assert.equal(began, 1); assert.equal(acknowledged, 1); assert.equal(closed, 4);
  let pendingCalls = 0;
  let pendingConfirmed = false;
  const pendingPlugin = { settings: { codexUsageNoticeSeen: false }, aiReadyForModel: async () => true, confirmAiUsage: async (_model, run) => { if (!pendingConfirmed) { pendingConfirmed = true; return false; } await run(); return true; }, saveSettings: async () => {} };
  const pendingModal = new NextStepModal({}, 'Parent', 'normal', 1, 1, pendingPlugin, async () => {}, async (_options, _direction, found) => { pendingCalls++; found([{ title: 'Existing', task: 'Research', contribution: '', parentTitle: '' }], async () => {}); }, async () => {});
  pendingModal.onOpen(); find(pendingModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click();
  button(pendingModal.contentEl, 'Review AI subtopic suggestions').click(); await tick();
  assert.equal(pendingCalls, 1); assert.equal(button(pendingModal.contentEl, 'Understand and run'), undefined);
  button(pendingModal.contentEl, 'Create subtopics').click(); await tick();
  assert.ok(button(pendingModal.contentEl, 'Get expansion directions'));
  button(pendingModal.contentEl, 'Get expansion directions').click(); await tick();
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
  button(delayed.contentEl, 'Create starter map now').click(); await tick();
  assert.equal(closed, 5); assert.equal(completedQuick, false);
  assert.equal(delayedOptions.layers, 3); assert.equal(delayedOptions.firstLayerCount, 2); assert.equal(delayedOptions.childrenPerParent, 2); assert.equal(delayedOptions.shallowResearch, true);
  finishQuick(); await tick(); assert.equal(completedQuick, true); assert.equal(closed, 5);
  const invalid = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async () => assert.fail('over-limit task started'), async () => {});
  invalid.onOpen(); find(invalid.contentEl, item => item.cls === 'vam-next-cards').children[1].click(); button(invalid.contentEl, 'Quickly explore a map').click();
  const invalidNumbers = all(invalid.contentEl, item => item.tag === 'input' && item.type === 'number'); invalidNumbers[0].value = '3'; invalidNumbers[1].value = '3'; invalidNumbers[2].value = '2'; invalidNumbers[0].input();
  assert.match(find(invalid.contentEl, item => item.tag === 'p' && item.text?.includes('exceeding the limit of 15')).text, /21 subtopics/);
  assert.equal(button(invalid.contentEl, 'Create starter map now').disabled, true);
  invalidNumbers[0].value = '2'; invalidNumbers[0].input();
  assert.equal(button(invalid.contentEl, 'Create starter map now').disabled, false);
  assert.ok(all(invalid.contentEl, item => item.tag === 'p').some(item => /3/.test(item.text ?? '') && /6/.test(item.text ?? '') && /9/.test(item.text ?? '')));
  assert.equal(closed, 5);
  let finishGuided, guidedFinished = false;
  const guidedModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async (_options, _direction, found) => {
    await new Promise(resolve => { finishGuided = resolve; });
    found([{ title: 'Later', task: 'Explore', contribution: '' }], async () => {});
    guidedFinished = true;
  }, async () => {});
  guidedModal.onOpen(); find(guidedModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click();
  button(guidedModal.contentEl, 'Get expansion directions').click(); await tick();
  assert.equal(closed, 5); assert.equal(guidedFinished, false);
  finishGuided(); await tick();
  assert.equal(guidedFinished, true); assert.ok(button(guidedModal.contentEl, 'Create subtopics'));
  button(guidedModal.contentEl, 'Create subtopics').click(); await tick();
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
  button(settingsModal.contentEl, 'Confirm research task').click(); await tick();
  assert.deepEqual(plain(settingsWrites), [{ model: 'model-b', modelSource: 'manual' }, { reasoning: 'high' }]);
  assert.equal(checkedModels.at(-1), 'model-b');
  assert.equal(researchAfterSave, true);
  const closedBeforeCancel = closed;
  const cancelModal = new NextStepModal({}, 'Parent', 'normal', 1, 0, plugin, async () => {}, async options => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); }, { once: true })), async () => {});
  cancelModal.onOpen(); find(cancelModal.contentEl, item => item.cls === 'vam-next-cards').children[1].click();
  button(cancelModal.contentEl, 'Quickly explore a map').click(); button(cancelModal.contentEl, 'Create starter map now').click(); await tick();
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
