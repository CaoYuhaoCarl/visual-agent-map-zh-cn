const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, obsidian, plain, DEFAULT_SETTINGS, coverageSetup, coverageThreeAnswers, aimMapFixture, aimPhase, plannerReview } = require('./support.cjs');

test('Simplified Chinese: AIM distinguishes scripts and keeps ambiguous Chinese compatible', () => {
  const { detectAimContentLanguage, chooseAimContentLanguage, resolveAimContentLanguage } = load('experiences/aim/content-language.ts');
  assert.equal(detectAimContentLanguage('东京五天自由行怎么排'), 'zh-CN');
  assert.equal(detectAimContentLanguage('東京五天自由行怎麼排'), 'zh-TW');
  assert.equal(detectAimContentLanguage('Python 的异步编程怎么学'), 'zh-CN');
  assert.equal(detectAimContentLanguage('怎么做'), 'zh-CN');
  assert.equal(chooseAimContentLanguage('en', '收支分析'), 'zh-TW', 'shared characters are not evidence of Simplified Chinese');
  assert.equal(chooseAimContentLanguage('zh-CN', '人工智能研究'), 'zh-CN');
  assert.equal(chooseAimContentLanguage('en', '人工智能研究'), 'zh-TW', 'ambiguous Chinese retains the existing English-interface fallback');
  assert.equal(chooseAimContentLanguage('zh-CN', 'Plan a trip'), 'en');
  assert.equal(chooseAimContentLanguage('zh-CN', '東京の旅行', 'Some English context'), 'zh-CN');
  assert.equal(chooseAimContentLanguage('en', '2026', '请规划预算'), 'zh-CN');
  assert.equal(resolveAimContentLanguage({ title: 'Plan a trip', aim: { contentLanguage: 'zh-CN' } }, 'en'), 'zh-CN');
  assert.equal(resolveAimContentLanguage({ title: '东京旅游', aim: { contentLanguage: 'zh-TW' } }, 'zh-CN'), 'zh-TW', 'stored language must never be re-detected');
});

test('Simplified Chinese: language change persists, refreshes entrypoints, and never rewrites notes', async () => {
  const { default: Plugin } = load('main.ts', { obsidian });
  const plugin = new Plugin();
  plugin.settings = { ...DEFAULT_SETTINGS, language: 'en' };
  const calls = [];
  plugin.saveData = async value => calls.push(['save', value.language]);
  plugin.views = () => [{ refreshFromPlugin: async () => calls.push(['map', plugin.settings.language]) }];
  plugin.coffeeViews = () => [{ refreshForLanguageChange: async () => calls.push(['coffee', plugin.settings.language]) }];
  plugin.refreshLocalizedEntrypoints = () => calls.push(['commands', plugin.settings.language]);
  plugin.recordFailure = () => assert.fail('language switch should not fail');
  plugin.repo = { syncManagedDetailHeadings: async () => assert.fail('switching languages must not rewrite notes') };
  assert.equal(await plugin.changeLanguage('zh-CN'), true);
  assert.equal(plugin.settings.language, 'zh-CN');
  assert.deepEqual(calls, [['save', 'zh-CN'], ['commands', 'zh-CN'], ['map', 'zh-CN'], ['coffee', 'zh-CN']]);
});

test('Simplified Chinese: AIM map and note language round trip independently of the interface', async () => {
  const { repo } = fixture('en');
  const { createAimMap } = load('experiences/aim/create-map.ts');
  const input = { requestId: 'zh-cn-round-trip', topic: '如何规划东京旅行？', context: '预算有限，保留原始用户输入。' };
  const created = await createAimMap(repo, 'test-model', input);
  let map = await repo.readMap(created.mapPath);
  assert.equal(map.aim.contentLanguage, 'zh-CN');
  const note = await repo.readNote(created.root.path);
  assert.ok(note.detail.includes(input.context));
  assert.match(note.detail, /用户提供的背景/);
  repo.settings.language = 'zh-TW';
  await repo.saveMap(created.mapPath, map);
  await repo.updateNote(created.root.path, {});
  await repo.rebuildDerivedData();
  map = await repo.readMap(created.mapPath);
  assert.equal(map.aim.contentLanguage, 'zh-CN');
  const stored = await repo.app.vault.read(repo.file(created.root.path));
  assert.match(stored, /content-language: zh-CN/);
  assert.ok(stored.includes(input.context));
  assert.deepEqual(plain(map.aim.branches), []);
});

test('Simplified Chinese: Preview callouts and reference labels survive repeated writes and language changes', async () => {
  const { repo, app } = fixture('zh-CN');
  const path = await repo.createMap('简体地图');
  const map = await repo.readMap(path);
  const node = await repo.createNote('原始标题', 'test-model', map, path, 'workspace');
  map.nodes.push(node);
  await repo.saveMap(path, map);
  await repo.updateNote(node.path, { summary: '简体摘要', preview: '用户的预览内容', detail: '用户正文，繁體引文保持原样。' });
  await repo.rebuildDerivedData();
  const raw = await app.vault.read(repo.file(node.path));
  assert.match(raw, /> \[!info\]- 预览/);
  assert.match(raw, /所属主题/);
  assert.doesNotMatch(raw, /所屬|母議題|子議題|預覽/);
  repo.settings.language = 'en';
  await repo.updateNote(node.path, {});
  await repo.rebuildDerivedData();
  const again = await app.vault.read(repo.file(node.path));
  const withoutTimestamp = value => value.replace(/^updated: .*$/m, 'updated: <timestamp>');
  assert.equal(withoutTimestamp(again), withoutTimestamp(raw), 'writes under another UI must preserve existing content and labels');
  const note = await repo.readNote(node.path);
  assert.equal(note.preview, '用户的预览内容');
  assert.equal(note.detail, '用户正文，繁體引文保持原样。');
});

test('Simplified Chinese: managed detail aliases and source footnotes recognize all three languages', () => {
  const { standardTemplate, sectionLookup } = load('ai/detail-templates.ts');
  const { sourceFootnoteDefinition, canonicalDetail } = load('ai/result-utils.ts');
  const { translate } = load('i18n.ts');
  const template = standardTemplate('en');
  assert.equal(sectionLookup(template).get(translate('zh-CN', 'detail.core_conclusions')), 0);
  assert.ok(sourceFootnoteDefinition(`[^external-1]: ${translate('zh-CN', 'note.external_source_0', 'https://example.org')}`));
  const detail = canonicalDetail('### 核心结论\n\n保留内容。', 'zh-CN');
  assert.match(detail, /### 核心结论\n\n保留内容。/);
  assert.doesNotMatch(detail, /### 核心結論/);
});

test('Simplified Chinese: AIM repair hints recognize translated failures', () => {
  const { aimRepairHint } = load('experiences/aim/failure-hint.ts');
  const { translate, SUPPORTED_LANGUAGES } = load('i18n.ts');
  assert.equal(aimRepairHint('超过 5 分钟'), 'ui.aim_repair_timeout_hint');
  assert.equal(aimRepairHint('请登录后重试'), 'ui.aim_repair_auth_hint');
  assert.equal(aimRepairHint('分类无效'), 'ui.aim_repair_format_hint');
  assert.equal(aimRepairHint('AI 服务没有实际执行网络搜索'), 'ui.aim_repair_search_hint');
  for (const { id } of SUPPORTED_LANGUAGES) {
    assert.equal(aimRepairHint(translate(id, 'ui.context_ai_search_not_performed')), 'ui.aim_repair_search_hint', id);
    assert.equal(aimRepairHint(translate(id, 'ui.ai_task_exceeded_0_minutes', 3)), 'ui.aim_repair_timeout_hint', id);
  }
});

test('Simplified Chinese: Planner recovers explicitly labeled questions and choices without inventing replacements', async () => {
  const { extractPlannerQuestionCandidate, parseAimPlannerReviewWithRecovery } = load('experiences/aim/planner-review.ts');
  const question = '每天可以投入多少时间？';
  for (const label of ['问题：', '**问题：**'])
    assert.equal(extractPlannerQuestionCandidate({ summary: '还可以改进吗？', detail: `还有更好的办法吗？\n${label}${question}` }), question);
  for (const heading of ['选项', '可选答案']) {
    const original = {
      summary: '确认时间后继续。',
      detail: `<!-- aim-review ${JSON.stringify({ decision: 'ask_user', rationale: '时间会改变学习计划。', question })} -->\n已有资料已保留。\n\n${heading}：\n- 十分钟\n- 三十分钟`,
      suggestions: [], visualReferences: []
    };
    const parsed = await parseAimPlannerReviewWithRecovery(original, { question: '原始目标', answerSnapshot: '{}', reportSummary: '已有摘要', reportDetail: '已有证据', outputLanguage: 'zh-CN' }, async () => assert.fail('explicit choices must not trigger another AI call'));
    assert.equal(parsed.question, question);
    assert.deepEqual(Array.from(parsed.answerOptions), ['十分钟', '三十分钟']);
    assert.equal(parsed.summary, original.summary);
  }
});

test('Simplified Chinese: an actual localized no-search error retains successful reports for Planner review', async () => {
  const { repo, mapPath, question, store } = await aimMapFixture();
  repo.settings.language = 'zh-CN';
  const map = await repo.readMap(mapPath);
  map.title = '简体搜索恢复测试';
  const node = map.nodes.find(node => node.id === question.id);
  node.aimKind = 'question';
  node.aimQuestion = { requestId: 'zh-cn-search-question', parentBranchId: null, options: [{ id: 'a', label: '方案甲' }, { id: 'b', label: '方案乙' }], allowMultiple: false, allowFreeText: true };
  await repo.saveMap(mapPath, map);
  const { translate } = load('i18n.ts');
  const { AimManualFlow } = load('experiences/aim/manual-flow.ts');
  let reviewed = '';
  const flow = new AimManualFlow(repo, store, async context => {
    assert.equal(context.outputLanguage, 'zh-CN');
    if (aimPhase(context, 'research-plan')) return { summary: '两个研究方向', detail: '<!-- aim-plan {"subtopics":[{"id":"route","title":"路线","task":"Research route","expectedValue":"Compare routes"},{"id":"access","title":"通行条件","task":"Research accessibility","expectedValue":"Verify access"}]} -->', suggestions: [], visualReferences: [] };
    if (context.researchMode === 'research' && context.task.includes('Research accessibility')) throw new Error(translate('zh-CN', 'ui.context_ai_search_not_performed'));
    if (context.researchMode === 'research') return { summary: '路线证据', detail: 'Research status: search completed\nRETAINED_ROUTE_REPORT https://example.org/route', suggestions: [], visualReferences: [] };
    if (aimPhase(context, 'report-review')) {
      reviewed = [context.task, context.ancestors, context.detail].join('\n');
      return plannerReview('ask_user', { rationale: '仍需了解偏好。', question: '优先减少步行还是换乘？' }, '保留路线证据。', '依据已有报告继续。', ['减少步行', '减少换乘']);
    }
    throw new Error('Unexpected fixture phase');
  });
  assert.equal((await flow.answerAndResearch(mapPath, question.id, { requestId: 'zh-cn-search-answer', selections: ['a'], freeText: '' }, 'test-model', 'low')).status, 'waiting-user');
  assert.match(reviewed, /RETAINED_ROUTE_REPORT/);
  const branch = (await repo.readMap(mapPath)).aim.branches[0];
  assert.deepEqual(plain(branch.results.filter(result => result.kind === 'research').map(result => result.subtopicId)), ['route']);
});

test('Simplified Chinese: every AIM phase keeps its content language through a complete deterministic flow', async () => {
  const subject = await coverageSetup('如何安排一周的学习计划？', { sharedRepo: fixture('en').repo });
  const { AimManualFlow } = load('experiences/aim/manual-flow.ts');
  const { AimRunStore } = load('experiences/aim/research-run-store.ts');
  const phases = new Set();
  subject.flow = new AimManualFlow(subject.repo, new AimRunStore(subject.repo), async context => {
    assert.equal(context.outputLanguage, 'zh-CN');
    phases.add(context.task.match(/aim-phase:\s*([a-z-]+)/)?.[1]);
    subject.repo.settings.language = 'zh-TW';
    return subject.model.ask(context);
  });
  assert.equal((await coverageThreeAnswers(subject)).status, 'completed');
  for (const phase of ['initial-question', 'research-plan', 'subtopic-research', 'report-review', 'delivery-outline', 'delivery-research', 'delivery-writing', 'delivery-acceptance'])
    assert.ok(phases.has(phase), `missing phase ${phase}`);
  const map = await subject.repo.readMap(subject.created.mapPath);
  assert.equal(map.aim.contentLanguage, 'zh-CN');
  await subject.repo.rebuildDerivedData();
  for (const node of map.nodes) {
    const raw = await subject.repo.app.vault.read(subject.repo.file(node.path));
    assert.match(raw, /content-language: zh-CN/);
  }
});
