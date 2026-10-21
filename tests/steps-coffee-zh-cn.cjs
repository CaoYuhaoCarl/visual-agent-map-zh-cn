const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  load, plain, coffeeTypes: types, coffeePrompts: prompts, coffeeInsights: insights,
  coffeeCustomization: customization, coffeeTopics: topics, coffee,
  obsidian, fixture, coffeeElement, coffeeFind, withCoffeeModelDiscovery, deferred, until,
} = require('./support.cjs');
const { prepareStep } = load('core/step-runner.ts');
const { CoffeeStorage } = load('experiences/coffee-tables/storage.ts', { obsidian });
const { CoffeeTablesView, parseGuests, parseSpeeches, rosterFor } = load('experiences/coffee-tables/view.ts', { obsidian });
const { convergenceStep } = load('experiences/coffee-tables/steps/convergence/step.ts');
const { navigationSummaryStep } = load('experiences/coffee-tables/steps/navigation-summary/step.ts');
const { coffeeSegments } = load('experiences/coffee-tables/segments.ts');
const { parseCoffeeOutline } = load('experiences/coffee-tables/outline.ts');
const { buildCoffeeSource } = load('experiences/coffee-tables/handoff-source.ts');
const cnTitles = ['意外联系', '值得继续想的问题', '核心分歧', '探索方向', '值得查证的假设'];
const cnNotes = (tag = 'opening') => '# 观察者整理\n\n' + cnTitles.map((title, index) => `## ${title}\n\n- 具体洞见 ${tag} ${index}，说明理由、适用条件和未解问题。 <!-- coffee-insight:v1:id=${tag}-${index} -->\n  - 脉络：保留具体情境以及嘉宾提出的不同理由。`).join('\n\n');
const cnSession = () => types.createSession('公司如何公平地分配 AI 省下的时间？', 'test-model', 'high', 'zh-CN');
const noProvider = async () => assert.fail('No provider call is allowed');

test('Coffee zh-CN sessions validate without changing stored user text', () => {
  const session = types.createSession('使用者的原始主題：保留繁體字', 'test-model', 'high', 'zh-CN');
  session.guests.customPrompt = '請保留我的風格，不要轉換。';
  const restored = types.parseSession(JSON.stringify(session));
  assert.equal(restored.language, 'zh-CN');
  assert.equal(restored.topic, session.topic);
  assert.equal(restored.guests.customPrompt, session.guests.customPrompt);
  assert.throws(() => types.parseSession(JSON.stringify({ ...session, language: 'zh-HK' })), /Invalid/);
});

test('Coffee zh-CN opening uses static Simplified Chinese instructions and topics', () => {
  const prompt = prompts.tablePrompt('原始主題與來賓姓名', 'zh-CN');
  assert.match(prompt, /简体中文/);
  assert.match(prompt, /观察者整理/);
  assert.doesNotMatch(prompt, /繁體中文|繁体中文|觀察者整理|conversational English/);
  assert.match(prompt, /原始主題與來賓姓名/);
  assert.equal(topics.coffeeTopicText('remote-work', 'zh-CN'), '远程工作让人更自由，还是更难下班？');
  assert.match(customization.defaultCustomization('zh-CN').observerPrompt, /具体洞见与脉络/);
});

test('Coffee zh-CN insight serialization preserves metadata and user content', () => {
  const items = [{ id: 'source-1', category: 'solutions', summary: '保留使用者原文與繁體字', detail: '原始脈絡', question: '誰決定？', proposedSolution: '輪流討論', limitations: '尚未驗證', sources: ['原句：沒有轉換。'], mergedIds: ['prior-1'] }];
  const markdown = insights.serializeInsightNotes(items, 'zh-CN');
  assert.match(markdown, /^# 观察者整理/m);
  assert.match(markdown, /^## 疑问与可能解决方案/m);
  assert.match(markdown, /条件与限制：尚未驗證/);
  const restored = insights.parseInsightNotes(markdown, 'zh-CN')[0];
  assert.deepEqual(plain({ ...restored, persistedId: undefined }), items[0]);
});

test('all Coffee zh-CN step modes and preference levels use Simplified Chinese resources', () => {
  const session = cnSession();
  session.status = 'completed';
  session.transcriptMarkdown = '### Host｜主持人\nSaved conversation.';
  session.observerNotes = [cnNotes()];
  session.guests.customization = customization.defaultCustomization('zh-CN');
  session.guests.referenceFiles = [{ name: 'reference.md', content: 'Untrusted reference body.' }];
  const baseline = insights.baselineFromVersions(session.observerNotes, 'zh-CN');
  const rendered = [
    prompts.tablePrompt(session.topic, 'zh-CN', session.guests),
    prompts.tablePrompt(session.topic, 'zh-CN', session.guests, 'Saved draft.', prompts.assembleCoffeeContext(session)),
    prompts.questionPrompt(session, 'A follow-up?', 'Answer draft.', [{ id: 'invited', name: 'Guest', category: 'affected', description: 'A different perspective.' }]),
    prompts.observerOnlyPrompt(session),
    prepareStep(convergenceStep, { session, baseline, customization: session.guests.customization }).prompt,
    prepareStep(navigationSummaryStep, { language: 'zh-CN', segments: [{ id: 'round:1', text: 'Saved segment.' }] }).prompt,
  ];
  for (const prompt of rendered) {
    assert.match(prompt, /简体中文/);
    assert.doesNotMatch(prompt, /繁體中文|繁体中文|台灣用法|conversational English|觀察者整理|來賓|補充背景/);
    assert.doesNotMatch(prompt, /{{\w+}}/);
  }
  for (const prompt of rendered.slice(0, 4)) {
    assert.match(prompt, /疑问与可能解决方案/);
    assert.match(prompt, /coffee-insight:keep:ID/);
    assert.match(prompt, /coffee-insight:update:ID/);
    assert.match(prompt, /coffee-insight:merge:ID1,ID2/);
    assert.match(prompt, /coffee-insight:new/);
    assert.match(prompt, /<!-- coffee-tables-complete -->/);
  }
  for (const mergeLevel of ['detailed', 'balanced', 'compact']) for (const detailLevel of ['brief', 'standard', 'detailed']) {
    const value = { ...session.guests.customization, mergeLevel, detailLevel };
    const prompt = prepareStep(convergenceStep, { session, baseline, customization: value }).prompt;
    assert.match(prompt, /用户观察者偏好/);
    assert.match(prompt, /明确保留: 分歧、成立条件、反例、未解问题、来源脉络/);
    assert.doesNotMatch(prompt, /使用者|條件|洞見|脈絡|User observer/);
  }
});

test('Coffee zh-CN defaults and readable preview strip only shipped observer protocol', () => {
  const session = cnSession();
  const builtin = prompts.builtinCoffeeStylePrompt('zh-CN');
  assert.match(builtin, /简体中文（中国大陆用法）/);
  assert.equal(prompts.builtinCoffeeStylePrompt('en'), prompts.BUILTIN_COFFEE_STYLE_PROMPT_EN);
  assert.equal(prompts.builtinCoffeeStylePrompt('zh-TW'), prompts.BUILTIN_COFFEE_STYLE_PROMPT);
  const chat = prompts.cleanChatStyle(builtin);
  assert.match(chat, /自然、口语/);
  assert.doesNotMatch(chat, /观察者整理|coffee-insight|原本五类每类整理|稳定标识码/);
  const saved = { ...customization.defaultCustomization('zh-CN'), observerPrompt: '請保留我的繁體偏好。' };
  assert.equal(customization.normalizeCustomization(saved, 'zh-CN').observerPrompt, saved.observerPrompt);
  const preview = prompts.openingPromptPreview('Topic', 'zh-CN', { ...session.guests, customization: saved });
  assert.match(preview, /請保留我的繁體偏好/);
  assert.match(preview, /观察者整理/);
  assert.doesNotMatch(preview, /coffee-insight:(?:keep|update|merge|new)/);
  assert.equal(prompts.cleanChatStyle('用户自定义：保留觀察者整理與我的原文。'), '用户自定义：保留觀察者整理與我的原文。');
});

test('Coffee zh-CN topic choices are complete and avoid the previous choice', () => {
  assert.equal(topics.COFFEE_TOPICS.length, 20);
  assert.equal(new Set(topics.COFFEE_TOPICS.map(item => item['zh-CN'])).size, 20);
  for (const topic of topics.COFFEE_TOPICS) {
    assert.equal(topics.coffeeTopicText(topic.id, 'zh-CN'), topic['zh-CN']);
    assert.equal(topics.coffeeTopicText(topic.id, 'zh-TW'), topic.zh);
    assert.equal(topics.coffeeTopicText(topic.id, 'en'), topic.en);
    assert.notEqual(topics.pickCoffeeTopic('zh-CN', topic['zh-CN'], () => 0), topic['zh-CN']);
  }
  assert.equal(topics.coffeeTopicText('not-a-topic', 'zh-CN'), undefined);
});

test('Coffee zh-CN parsers retain all solution fields, sources, aliases and outline context', () => {
  const original = '# 观察者整理\n\n## 意外连接\n- 保留引用的具体连接。 <!-- coffee-insight:v1:id=connection --> <!-- source: 原始發言 -->\n  - 嘉宾的理由：原始理由不变。\n\n## 疑问与可能解法\n- 这个回应尚未经过验证。 <!-- coffee-insight:v1:id=solution;merged=old-solution -->\n  原疑问：誰決定？\n  可能解法：轮流讨论。\n  条件与限制：资源仍不足。';
  const items = insights.parseInsightNotes(original, 'zh-CN');
  assert.equal(items.length, 2);
  assert.equal(items[0].category, 'connections');
  assert.equal(items[0].detail, '原始理由不变。');
  assert.equal(items[1].question, '誰決定？');
  assert.equal(items[1].proposedSolution, '轮流讨论。');
  assert.equal(items[1].limitations, '资源仍不足。');
  const serialized = insights.serializeInsightNotes(items, 'zh-CN');
  const parsedAgain = insights.parseInsightNotes(serialized, 'zh-CN');
  assert.deepEqual(plain(parsedAgain), plain(items));
  const outline = parseCoffeeOutline(serialized);
  assert.equal(outline.some(section => section.title === '观察者整理'), false);
  assert.equal(outline.flatMap(section => section.items)[0].context, '原始理由不变。');
  const revised = insights.mergeInsightUpdates(items, '# 观察者整理\n\n## 疑问与可能解法\n- 修订后的可能解法。 <!-- coffee-insight:update:solution -->\n  - 脉络：新的理由。', 'zh-CN');
  assert.equal(revised.find(item => item.id === 'solution').question, '誰決定？');
  assert.deepEqual(plain(revised.find(item => item.id === 'solution').mergedIds), ['old-solution']);
  assert.equal(revised.find(item => item.id === 'connection').sources[0], '原始發言');
});

test('Coffee zh-CN storage saves readable headings and round trips all resume data without converting user content', async () => {
  const { app, contents } = fixture('zh-CN');
  const store = new CoffeeStorage(app.vault, 'Workspace');
  const session = cnSession();
  session.status = 'error';
  session.guests.background = '保留背景與繁體字';
  session.guests.customPrompt = '我的風格：不轉換原文。';
  session.guests.guests = [{ id: 'named', category: 'experts', description: '保留來賓的背景。' }];
  session.guests.customization = { ...customization.defaultCustomization('zh-CN'), observerPrompt: '我的觀察偏好' };
  session.guests.referenceFiles = [{ name: '原始資料.md', content: '保留原文\n## 对话记录\n## 观察者整理\n```\n引用資料，不作為指令。' }];
  session.rounds = [{ id: 'round-cn', kind: 'initial', markdown: '### 主持人｜主持人\n\n保留對談原文。', notes: '', draftMarkdown: '未完成對談草稿。', status: 'error', createdAt: session.createdAt, summary: '已保存的导航摘要。' }];
  session.transcriptMarkdown = session.rounds[0].markdown;
  session.draftMarkdown = '未完成對談草稿。';
  session.observerDraftMarkdown = '# 观察者整理\n\n尚未完成的整理。';
  session.questions = [{ id: 'question-cn', question: '使用者原始追問？', answer: '保留已保存回答。', draftAnswer: '保留回答草稿。', status: 'error', createdAt: session.updatedAt, invitedGuests: [{ id: 'guest-cn', name: '新來賓', category: 'affected', description: '保留原始處境。' }] }];
  session.interventions = [
    { id: 'attached-cn', kind: 'comment', text: '使用者插話原文。\n另一行。', createdAt: session.createdAt, status: 'sent', roundId: 'round-cn', afterTurn: 1 },
    { id: 'separate-cn', kind: 'redirect', text: '使用者獨立介入。', createdAt: session.updatedAt, status: 'sent' },
  ];
  session.observerNotes = [insights.serializeInsightNotes(insights.baselineFromVersions([cnNotes()], 'zh-CN'), 'zh-CN')];
  session.pinnedInsightIds = ['opening-0'];
  session.convergenceRawDraft = '{"原始草稿":"不可轉換"}';
  session.convergenceDraft = { baseFingerprint: 'fingerprint', proposals: [{ sourceIds: ['opening-0'], summary: '保留原始洞見', detail: '保留細節', category: 'connections' }], raw: session.convergenceRawDraft, createdAt: session.createdAt, customization: session.guests.customization };
  session.convergenceUndo = { notes: [...session.observerNotes], expectedNotes: [...session.observerNotes] };
  await store.save(session);
  const path = store.sessionPath(session.id), markdown = contents.get(path);
  for (const heading of ['开桌设置', '对话记录', '对谈第 1 段', '追问第 1 题', '邀请嘉宾', '用户介入第 2 则', '观察者整理', '未完成草稿']) assert.match(markdown, new RegExp(`^#{1,3} ${heading}`, 'm'));
  assert.match(markdown, /你（插话）/);
  assert.doesNotMatch(markdown, /## Table settings|## Conversation|## 開桌設定|## 對話紀錄/);
  const reopenedStore = new CoffeeStorage(app.vault, 'Workspace');
  const reopened = await reopenedStore.load(session.id);
  assert.equal(reopened.language, 'zh-CN');
  assert.equal(reopened.topic, session.topic);
  assert.deepEqual(plain(reopened.guests), plain(session.guests));
  assert.deepEqual(plain(reopened.questions), plain(session.questions));
  assert.deepEqual(plain(reopened.interventions), plain(session.interventions));
  assert.deepEqual(plain(reopened.rounds), plain(session.rounds));
  for (const key of ['draftMarkdown', 'observerDraftMarkdown', 'observerNotes', 'pinnedInsightIds', 'convergenceRawDraft', 'convergenceDraft', 'convergenceUndo']) assert.deepEqual(plain(reopened[key]), plain(session[key]), key);
  reopened.rounds[0].summary = '只更新摘要，不改用户对谈。';
  await reopenedStore.save(reopened, true);
  const afterSummary = await new CoffeeStorage(app.vault, 'Workspace').load(session.id);
  assert.equal(afterSummary.rounds[0].summary, reopened.rounds[0].summary);
  assert.equal(afterSummary.transcriptMarkdown, session.transcriptMarkdown);
  assert.equal(afterSummary.guests.referenceFiles[0].content, session.guests.referenceFiles[0].content);
});

test('Coffee zh-CN engine opens, continues, invites, refreshes and fills summaries in the session language', async () => {
  const session = cnSession(), requests = [], saves = [];
  let round = 0;
  const engine = new coffee.CoffeeEngine(session, async request => {
    requests.push(request);
    assert.equal(request.session.language, 'zh-CN');
    assert.match(request.prompt, /简体中文/);
    if (request.step.startsWith('coffee.navigation-summary')) return JSON.stringify({ summaries: coffeeSegments(engine.session).filter(item => !item.summary).map(item => ({ id: item.id, summary: '保留已有讨论并补齐导航摘要。' })) });
    if (request.step.startsWith('coffee.observer-only')) return cnNotes('refresh');
    return `### 主持人｜主持人\n\n第 ${++round} 段讨论的原文。\n\n${cnNotes(`round-${round}`)}\n\n<!-- coffee-tables-complete -->`;
  }, async value => saves.push(plain(value)));
  await engine.start();
  assert.equal(engine.session.status, 'completed', engine.error);
  await engine.continueTable();
  assert.equal(engine.session.rounds.length, 2);
  await engine.ask('如何保护员工的选择？', 'followup', [{ id: 'new-person', name: '保留繁體姓名', category: 'affected', description: '保留原始背景與觀點。' }]);
  assert.equal(engine.session.questions[0].status, 'complete', engine.error);
  assert.match(requests[2].prompt, /保留繁體姓名｜受影响者：保留原始背景與觀點/);
  await engine.refreshObserverNotes();
  await engine.fillSegmentSummaries();
  assert.equal(requests.length, 5);
  assert.equal(engine.session.observerNotes.length, 1);
  assert.equal(insights.baselineFromVersions(engine.session.observerNotes, 'zh-CN').length, 20);
  assert.ok(coffeeSegments(engine.session).every(segment => segment.summary));
  assert.ok(saves.every(value => value.language === 'zh-CN'));
});

for (const rootless of [false, true]) test(`Coffee zh-CN completed ${rootless ? 'rootless' : 'bold-heading'} draft resumes from disk without another provider call`, async () => {
  const { app } = fixture('zh-CN'), store = new CoffeeStorage(app.vault, 'Workspace');
  const session = cnSession();
  const notes = rootless ? cnNotes().replace(/^# 观察者整理\n\n/, '') : cnNotes().replace(/^(#{1,2} .+)$/gm, '**$1**');
  const draft = `### 主持人｜主持人\n\n保留已经完成的对谈。\n\n### 沈默｜中立观察者\n\n简短观察。\n\n${notes}\n\n<!-- coffee-tables-complete -->`;
  session.status = 'error'; session.draftMarkdown = draft;
  session.rounds = [{ id: 'interrupted-cn', markdown: '', notes: '', draftMarkdown: draft, status: 'error', createdAt: session.createdAt }];
  await store.save(session);
  const reopenedStore = new CoffeeStorage(app.vault, 'Workspace');
  const reopened = await reopenedStore.load(session.id);
  const engine = new coffee.CoffeeEngine(reopened, noProvider, value => reopenedStore.save(value));
  await engine.start();
  assert.equal(engine.session.status, 'completed', engine.error);
  assert.equal(engine.session.draftMarkdown, undefined);
  assert.match(engine.session.transcriptMarkdown, /保留已经完成的对谈/);
  assert.doesNotMatch(engine.session.transcriptMarkdown, /## 意外联系/);
  assert.match(engine.session.observerNotes[0], /^# 观察者整理/);
  const persisted = await new CoffeeStorage(app.vault, 'Workspace').load(session.id);
  assert.equal(persisted.language, 'zh-CN');
  assert.equal(persisted.status, 'completed');
});

test('Coffee zh-CN saved convergence preview applies and undoes after reopening', async () => {
  const { app } = fixture('zh-CN'), store = new CoffeeStorage(app.vault, 'Workspace'), session = cnSession();
  session.status = 'completed'; session.observerNotes = [cnNotes()];
  await store.save(session);
  const baseline = insights.baselineFromVersions(session.observerNotes, 'zh-CN');
  const proposals = baseline.map(item => ({ sourceIds: [item.id], category: item.category, summary: `整理后的洞见 ${item.id}`, detail: item.detail }));
  const engine = new coffee.CoffeeEngine(session, async request => {
    assert.match(request.prompt, /summary 和 detail 使用简体中文/);
    return JSON.stringify({ proposals });
  }, value => store.save(value));
  await engine.previewConvergence();
  assert.ok(engine.session.convergenceDraft, engine.error);
  const reopenedStore = new CoffeeStorage(app.vault, 'Workspace'), reopened = await reopenedStore.load(session.id);
  const resumed = new coffee.CoffeeEngine(reopened, noProvider, value => reopenedStore.save(value));
  await resumed.applyConvergence([0]);
  assert.match(resumed.session.observerNotes[0], /整理后的洞见 opening-0/);
  await resumed.undoConvergence();
  assert.deepEqual(plain(resumed.session.observerNotes), plain(reopened.observerNotes));
});

test('Coffee zh-CN interrupted generation resumes the exact saved draft after a storage round trip', async () => {
  const { app } = fixture('zh-CN'), store = new CoffeeStorage(app.vault, 'Workspace');
  const draft = '### 主持人｜主持人\n\n保留先前已經收到的繁體發言。';
  const first = new coffee.CoffeeEngine(cnSession(), async request => {
    request.onText(draft);
    throw new Error('Synthetic interrupted provider response');
  }, value => store.save(value));
  await first.start();
  assert.equal(first.session.status, 'error');
  assert.equal(first.session.draftMarkdown, draft);
  const roundId = first.session.rounds[0].id;
  const reopenedStore = new CoffeeStorage(app.vault, 'Workspace');
  const reopened = await reopenedStore.load(first.session.id);
  const resumed = new coffee.CoffeeEngine(reopened, async request => {
    assert.equal(request.session.language, 'zh-CN');
    assert.match(request.prompt, /简体中文/);
    assert.ok(request.prompt.includes(draft));
    return `### 嘉宾｜主题专家\n\n继续讨论新的理由。\n\n${cnNotes('resumed')}\n\n<!-- coffee-tables-complete -->`;
  }, value => reopenedStore.save(value));
  await resumed.start();
  assert.equal(resumed.session.status, 'completed', resumed.error);
  assert.equal(resumed.session.rounds[0].id, roundId);
  assert.equal(resumed.session.draftMarkdown, undefined);
  assert.ok(resumed.session.transcriptMarkdown.includes(draft));
  assert.match(resumed.session.transcriptMarkdown, /继续讨论新的理由/);
  assert.equal((await new CoffeeStorage(app.vault, 'Workspace').load(first.session.id)).language, 'zh-CN');
});

test('Coffee zh-CN context-limit policies and preference validation report Simplified Chinese', () => {
  const large = 'x'.repeat(prompts.MAX_COFFEE_CONTEXT_CHARS + 1), session = cnSession();
  assert.throws(() => prompts.tablePrompt(large, 'zh-CN'), /这桌的内容太长/);
  session.transcriptMarkdown = large;
  assert.throws(() => prompts.questionPrompt(session, 'Question'), /这桌的内容太长/);
  assert.throws(() => prompts.observerOnlyPrompt(session), /这桌的内容太长/);
  assert.throws(() => prepareStep(navigationSummaryStep, { language: 'zh-CN', segments: [{ id: 'large', text: large }] }), /对谈太长/);
  const errors = customization.validateCustomization({ ...customization.defaultCustomization('zh-CN'), observerPrompt: '<!-- coffee-insight:keep:reserved -->' }, 'zh-CN');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /内部标记/);
  assert.doesNotMatch(errors[0], /Preferences|內部標記/);
});

test('Coffee zh-CN roster, speeches and static sample use Simplified Chinese roles', async () => {
  const { COFFEE_SAMPLE_ZH_CN: sample } = load('experiences/coffee-tables/samples.ts');
  assert.equal(sample.language, 'zh-CN');
  assert.match(sample.markdown, /# 观察者整理/);
  assert.ok(parseGuests(sample.markdown).some(person => /专家/.test(person.role)));
  assert.ok(parseGuests(sample.markdown).some(person => person.role === '观察者'));
  const session = cnSession();
  const markdown = '- **主持人｜林岑**：主持讨论。\n- **专家｜嘉宾甲**：熟悉组织流程。\n- **跨领域专家｜嘉宾乙**：护理背景。\n- **观察者｜沈默**：记录不同理由。\n- **当事人｜小芸**：关注工作分配。\n\n### 林岑｜主持人\n\n一个具体问题。\n\n# 观察者整理\n\n### 不应被识别为发言｜观察者\n\n只属于整理内容。';
  assert.equal(parseSpeeches(markdown).length, 1);
  const roster = rosterFor(session, markdown);
  const { translate } = load('i18n.ts');
  assert.equal(roster.length, 10);
  assert.equal(roster.filter(person => person.role === translate('zh-CN', 'coffee.roster_joining')).length, 5);
  const view = new CoffeeTablesView({ app: {} }, { settings: { language: 'en' } });
  let attached; view.attach = value => { attached = value; };
  await view.openSample('zh-CN');
  assert.equal(attached.id, 'sample-zh-CN');
  assert.equal(attached.language, 'zh-CN');
  assert.match(attached.observerNotes[0], /^# 观察者整理/);
  const engine = new coffee.CoffeeEngine(attached, noProvider, noProvider);
  await engine.continueTable();
  await assert.rejects(engine.setCustomization('changed', customization.defaultCustomization('zh-CN')), /只能阅读/);
});

test('Coffee zh-CN home uses translated defaults and topic controls without converting edited content', async () => {
  const plugin = withCoffeeModelDiscovery({ settings: { language: 'zh-CN', cliModel: 'model', cliReasoning: 'high' } }, ['model']);
  const view = new CoffeeTablesView({ app: {} }, plugin);
  view.contentEl = coffeeElement('root');
  view.store = { cleanupEmptyTopicFolders: async () => {}, recoverPendingCreates: async () => {}, recoverMoves: async () => {}, list: () => [] };
  await view.home();
  const topic = coffeeFind(view.contentEl, element => element.attrs['data-ct-home-field'] === 'topic');
  const style = coffeeFind(view.contentEl, element => element.attrs['data-ct-home-field'] === 'stylePrompt');
  assert.ok(topics.COFFEE_TOPICS.some(item => item['zh-CN'] === topic.value));
  assert.match(style.value, /简体中文/);
  assert.doesNotMatch(style.value, /观察者整理|coffee-insight/);
  assert.ok(coffeeFind(view.contentEl, element => element.tag === 'button' && /简体中文示例/.test(element.text)));
  topic.value = '保留我自己輸入的繁體題目。'; topic.input();
  plugin.settings.language = 'en';
  await view.home();
  assert.equal(coffeeFind(view.contentEl, element => element.attrs['data-ct-home-field'] === 'topic').value, '保留我自己輸入的繁體題目。');
});

test('Coffee room identifies a zh-CN session independently of the interface language', () => {
  const { CoffeeTablesView: RoomView } = load('experiences/coffee-tables/view.ts', { obsidian }, { requestAnimationFrame: callback => callback() });
  const session = cnSession(); session.id = 'sample-language-label'; session.status = 'completed';
  const view = new RoomView({ app: {} }, { settings: { language: 'en' }, modelLabel: value => value });
  view.engine = { session, busy: false, persistenceFailed: false, error: '' };
  view.contentEl = coffeeElement('root');
  view.contentEl.ownerDocument = { activeElement: null };
  view.contentEl.querySelector = () => null;
  view.contentEl.querySelectorAll = () => [];
  view.renderRoster = () => {}; view.updateStatus = () => {};
  view.render();
  assert.ok(coffeeFind(view.contentEl, element => /Conversation: Simplified Chinese/.test(element.text)));
  assert.equal(coffeeFind(view.contentEl, element => /Conversation: Traditional Chinese/.test(element.text)), undefined);
});

test('Coffee zh-CN handoff preserves the chosen output language across background and reopen', async () => {
  const dom = require('./support-dom.cjs'), notices = [], opened = [];
  class Modal {
    constructor() { this.titleEl = coffeeElement('title'); this.contentEl = coffeeElement('content'); }
    open() { opened.push(this); this.onOpen(); }
    close() { this.onClose(); }
  }
  const handoff = load('experiences/coffee-tables/handoff-modal.ts', { obsidian: { ...obsidian, Modal, Notice: dom.makeNotice(notices) } }, { createFragment: dom.createFragment });
  const session = cnSession(); session.status = 'completed'; session.observerNotes = [cnNotes()];
  const snapshot = { session, path: 'fixture.md', markdown: 'fixture', sidecar: null };
  const store = { handoffSnapshot: async () => snapshot, assertHandoffSnapshot: async () => {} };
  let request;
  const plugin = withCoffeeModelDiscovery({ app: {}, settings: { language: 'zh-CN' }, activeTasks: new Map(), register() {}, confirmAiUsage: async (_model, work) => { await work(); return true; }, core: { reframing: { reframe: async value => { request = value; return { question: '新的研究问题', context: '保留使用者原始脈絡', rationale: '说明下一步研究价值。' }; } } } }, ['test-model']);
  const source = buildCoffeeSource(session, 'opening-0');
  assert.match(source.sourceSnapshot, /未经验证/);
  const modal = await handoff.openCoffeeResearchHandoff(plugin, store, session, 'fixture.md', 'opening-0');
  assert.deepEqual(modal.language.children.map(option => option.value), ['en', 'zh-TW', 'zh-CN']);
  assert.equal(modal.language.value, 'zh-CN');
  await modal.generate();
  assert.equal(request.language, 'zh-CN');
  const task = handoff.coffeeHandoffTask(plugin, session.id);
  assert.equal(task.inputs.language, 'zh-CN');
  assert.equal(task.state, 'done');
  const reopened = await handoff.reopenCoffeeHandoff(plugin, task);
  assert.equal(reopened.language.value, 'zh-CN');
  assert.equal(reopened.context.value, '保留使用者原始脈絡');
  reopened.language.value = 'unsupported';
  request = undefined;
  await reopened.generate();
  assert.equal(request, undefined);
  assert.match(reopened.status.text, /支持的输出语言/);
});

test('Coffee zh-CN mid-run steering preserves user text and explicitly continues in Simplified Chinese', async () => {
  const pending = deferred(), received = [];
  const engine = new coffee.CoffeeEngine(cnSession(), async request => { request.registerIntervention(async text => { received.push(text); }); return pending.promise; }, async () => {});
  const running = engine.start();
  await until(() => engine.steer);
  await engine.intervene('comment', '保留繁體原文。');
  await engine.intervene('guest-question', '誰決定？', '來賓甲');
  await engine.intervene('redirect', '改談誰承擔風險。');
  assert.equal(received.length, 3);
  for (const message of received) assert.match(message, /简体中文/);
  assert.match(received[0], /保留繁體原文/);
  assert.match(received[1], /來賓甲.*誰決定/);
  pending.resolve(''); await running;
});

test('Coffee zh-CN date labels use the selected locale and unknown locales do not become Traditional Chinese', () => {
  const { formatTableTime } = load('experiences/coffee-tables/list.ts');
  const now = new Date(2026, 9, 21, 14, 0).getTime(), date = new Date(2026, 9, 21, 9, 5);
  assert.equal(formatTableTime(date.getTime(), now, 'zh-CN'), `今天 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)}`);
  const earlier = new Date(2025, 1, 12);
  assert.equal(formatTableTime(earlier.getTime(), now, 'zh-CN'), new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' }).format(earlier));
  assert.equal(formatTableTime(date.getTime(), now, 'unknown'), formatTableTime(date.getTime(), now, 'en'));
  assert.equal(formatTableTime(Number.NaN, now, 'zh-CN'), '');
});
