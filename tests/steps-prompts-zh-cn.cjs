// Simplified Chinese prompt routing, static resources, and verbatim user content.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, promptsFor, root } = require('./support-replay.cjs');

const read = file => fs.readFileSync(path.join(root, file), 'utf8').trimEnd();
const noTraditionalDirective = prompt => assert.doesNotMatch(prompt, /Traditional Chinese|繁體中文|繁体中文|Write in English|請用英文/);
const userText = '使用者原文：臺灣軟體與資料庫，檔案路徑 /參考/報告.md，{{do not replace}}。';
const context = { title: userText, summary: userText, rules: '', detail: userText, ancestors: userText, task: userText, sourceContext: userText, workingFindings: userText, researchMode: 'research', researchDepth: 'normal', visualMode: 'auto', detailFormat: 'adaptive' };

test('shared fragments select each language explicitly, including zh-CN', () => {
  const shared = load('core/steps/_shared/fragments.ts');
  assert.equal(shared.inLanguage(shared.LABEL_TOPIC, 'zh-CN'), '目前议题');
  assert.equal(shared.inLanguage(shared.LABEL_TOPIC, 'zh-TW'), '目前議題');
  assert.equal(shared.inLanguage(shared.LABEL_TOPIC, 'en'), 'Current topic');
  assert.equal(shared.inLanguage(shared.LABEL_TOPIC, 'invalid'), 'Current topic');
  const tone = shared.toneBlock(userText, 'zh-CN');
  assert.match(tone, /^语气规则/);
  assert.ok(tone.endsWith(userText));
});

test('ordinary task modes use Simplified Chinese guidance without converting source content', async () => {
  const { generalTaskPrompt } = load('core/steps/task/render.ts');
  for (const mode of [undefined, 'task', 'decompose', 'synthesize', 'merge']) {
    const prompt = generalTaskPrompt({ ...context, mode }, 'zh-CN');
    assert.match(prompt, /^新产生的内容默认使用简体中文/);
    assert.match(prompt, /目前议题/);
    assert.ok(prompt.includes(userText));
    noTraditionalDirective(prompt);
    assert.doesNotMatch(prompt, /目前議題|網路|請|視覺/);
  }
  for (const language of ['en', 'zh-TW', 'zh-CN']) {
    const sent = await promptsFor({ ...context, mode: 'task', outputLanguage: 'zh-CN' }, { language });
    assert.ok(sent.length);
    assert.match(sent[0].prompt, /^新产生的内容默认使用简体中文/);
    assert.ok(sent[0].prompt.includes(userText));
  }
});

test('research depth and visual guidance do not fall back to Traditional Chinese or English', () => {
  const { researchGuidance } = load('ai/task-policy.ts');
  const { visualGuidance } = load('ai/visual-guidance.ts');
  for (const researchDepth of ['fast', 'normal', 'deep']) for (const researchMode of ['local', 'research']) {
    const text = researchGuidance({ ...context, researchDepth, researchMode }, 'zh-CN');
    assert.match(text, /研究|概览/);
    assert.doesNotMatch(text, /網路|證據|調查|Quick|Normal|Deep|Search when/);
  }
  for (const mode of ['task', 'decompose', 'synthesize', 'merge']) for (const visualMode of ['on', 'auto', 'off']) {
    const text = visualGuidance({ ...context, mode, visualMode }, 'zh-CN').join('\n');
    assert.match(text, /图片|视觉/);
    assert.doesNotMatch(text, /圖片|搜尋|請|參考/);
  }
});

test('reference extraction reaches the provider with Simplified Chinese instructions and unchanged source text', async () => {
  for (const language of ['en', 'zh-TW', 'zh-CN']) {
    const sent = await promptsFor({
      ...context,
      mode: 'task',
      outputLanguage: 'zh-CN',
      sourceContext: undefined,
      referenceGroups: [{ id: 'reference-one', name: 'Reference group', location: '/fixtures', documents: [{ path: '/fixtures/source.md', content: userText }] }]
    }, { language });
    assert.ok(sent.length >= 2);
    assert.ok(sent[0].prompt.includes(read('core/steps/reference/extract.zh-CN.md')), language);
    assert.ok(sent[0].prompt.includes(userText));
    for (const call of sent) {
      assert.match(call.prompt, /^新产生的内容默认使用简体中文/);
      noTraditionalDirective(call.prompt);
    }
  }
});

test('every AIM shell phase uses its Simplified Chinese static rule and no conflicting language directive', () => {
  const { buildAimPrompt } = load('core/steps/aim/shell.ts');
  const phases = fs.readdirSync(path.join(root, 'core/steps/aim/phase')).filter(file => file.endsWith('.en.md')).map(file => file.replace('.en.md', ''));
  assert.equal(phases.length, 14);
  for (const phase of [undefined, 'evidence-reuse-audit', ...phases]) for (const structured of [false, true]) for (const researchMode of ['local', 'research']) {
    const task = phase ? `<!-- aim-phase: ${phase} -->\n${userText}` : userText;
    const prompt = buildAimPrompt({ ...context, researchMode, task, ...(structured ? { aimContract: { kind: 'plan' } } : {}), ...(phase === 'research-gap-audit' ? { responseContract: 'aim-gap-audit' } : {}) }, 'zh-CN');
    assert.match(prompt, /^输出语言：简体中文/);
    assert.ok(prompt.includes(userText));
    noTraditionalDirective(prompt);
    if (phases.includes(phase)) assert.ok(prompt.includes(read(`core/steps/aim/phase/${phase}.zh-CN.md`)), phase);
    assert.doesNotMatch(prompt, /目前議題|網路|請|視覺/);
  }
});

test('detail structure, count rules, and repair prompts use Simplified Chinese but preserve placeholders as data', () => {
  const fragments = load('core/steps/task/fragments.ts');
  const cases = [
    fragments.detailStructure('zh-CN', userText),
    fragments.customDetailStructure('zh-CN', { count: '2', headings: userText, rules: userText }),
    fragments.textbookDetailStructure('zh-CN', { headings: userText, log: userText }),
    fragments.customDetailRule('log', 'zh-CN', { heading: userText }),
    fragments.customDetailRule('description', 'zh-CN', { heading: userText, description: userText }),
    ...['exact', 'min'].map(kind => fragments.customDetailRule(kind, 'zh-CN', { heading: userText, n: '3' })),
    fragments.repairCounts('zh-CN', userText),
    fragments.mergeRepair('zh-CN', userText, userText, userText)
  ];
  for (const prompt of cases) {
    assert.ok(prompt.includes(userText));
    assert.doesNotMatch(prompt, /必須|標題|請|原樣|個項目/);
    noTraditionalDirective(prompt);
  }
});

test('outline, reframe, relevance, recalibration and structure-review prompts use the content language', () => {
  const { outlineGenerateStep, applyTopicToPreset } = load('core/steps/outline-generate/step.ts', { obsidian: {} });
  assert.equal(applyTopicToPreset('研究 {填入研究主题}', userText, 'zh-CN'), `研究 ${JSON.stringify(userText)}`);
  assert.match(applyTopicToPreset('研究', userText, 'zh-CN'), /研究主题：/);
  const nodes = [{ id: 'n1', title: userText, summary: userText, parentId: null, depth: 0, status: 'completed' }, { id: 'n2', title: userText, summary: userText, parentId: 'n1', depth: 1, status: 'idea' }];
  const base = { language: 'en', contentLanguage: 'zh-CN', nodes, goal: userText, rootQuestion: userText, model: 'm', reasoning: 'low' };
  const prompts = [outlineGenerateStep.render({ ...base, topic: userText, presetText: '研究 {填入研究主题}', limits: { levels: 2, maxTopics: 5 } })];
  assert.match(prompts[0], /Write in Simplified Chinese/);
  assert.match(prompts[0], /展开 2 层子标题/);
  const { reframeStep } = load('core/steps/reframe/step.ts', { obsidian: {} });
  prompts.push(reframeStep.render({ ...base, language: 'zh-CN', question: userText, context: userText, source: userText }));
  const { relevanceGradeStep, relevanceGradeRepairStep, relevanceGradeMissingRepairStep } = load('core/steps/relevance-grade/step.ts', { obsidian: {} });
  const repair = { ...base, previousReply: { items: [{ id: 'n2', tier: 'support', reason: userText }] }, violations: [], missing: ['n2'] };
  for (const step of [relevanceGradeStep, relevanceGradeRepairStep, relevanceGradeMissingRepairStep]) {
    const prompt = step.render(repair);
    assert.match(prompt, /请用简体中文写理由/);
    prompts.push(prompt);
  }
  const { relevanceRecalibrateStep, relevanceRecalibrateRepairStep } = load('core/steps/relevance-recalibrate/step.ts', { obsidian: {} });
  for (const step of [relevanceRecalibrateStep, relevanceRecalibrateRepairStep]) {
    const prompt = step.render({ ...repair, previous: [] });
    assert.match(prompt, /请用简体中文写理由/);
    prompts.push(prompt);
  }
  const { structureReviewStep } = load('core/steps/structure-review/step.ts', { obsidian: {} });
  prompts.push(structureReviewStep.render(base));
  for (const prompt of prompts) {
    assert.ok(prompt.includes(userText));
    noTraditionalDirective(prompt);
    assert.match(prompt, /Simplified Chinese|简体中文/);
  }
});

test('chart, references, visual map tasks and runtime steer use static Simplified Chinese resources', () => {
  const { chartStep } = load('core/steps/chart/step.ts');
  const chart = chartStep.render({ language: 'zh-CN', existingCount: 0, existingTypes: [], remaining: 3, title: userText, detail: userText });
  assert.match(chart, /你是 Obsidian 知识页的配图编辑/);
  assert.match(chart, /0 张图（无）/);
  assert.ok(chart.includes(userText));
  const { referenceTask } = load('core/steps/reference/step.ts');
  assert.match(referenceTask('extract', 'zh-CN'), /来源段落提取|来源段落撷取/);
  assert.match(referenceTask('reduce', 'zh-CN'), /证据摘要/);
  const visual = load('experiences/visual-map/steps/fragments.ts');
  const expansion = visual.expansionTask('zh-CN', userText);
  assert.match(expansion, /现有直属子议题/);
  assert.ok(expansion.includes(userText));
  assert.ok(visual.expansionTask('zh-CN', userText, userText).startsWith(userText));
  assert.match(visual.researchTopicTask('zh-CN', userText), /补足信息|补足资讯/);
  for (const name of ['synthesisDirectionsTask', 'synthesisGoalTask', 'mergeGoalTask', 'noSummaryYet', 'labelCurrentSummary', 'labelVisualReferences', 'labelFullKnowledge', 'labelOldFindings']) {
    const prompt = visual[name]('zh-CN');
    assert.doesNotMatch(prompt, /議題|筆記|圖片|發現|尚無/);
    noTraditionalDirective(prompt);
  }
  const { searchBudgetExhaustedMessage } = load('ai/runtime/messages/index.ts');
  assert.match(searchBudgetExhaustedMessage('zh-CN'), /^网络搜索预算已用完/);
  noTraditionalDirective(chart);
});

test('localized preset names, text, copies and topic placeholders are Simplified Chinese; custom text stays unchanged', () => {
  const presets = load('ai/prompt-presets.ts');
  const builtins = presets.builtinPresets('zh-CN');
  assert.equal(builtins.length, 7);
  assert.equal(builtins.find(item => item.id === 'plain').name, '白话说明');
  assert.equal(builtins.find(item => item.id === 'knowledge-tree').name, '知识树生成器');
  assert.equal(presets.OUTLINE_TOPIC_PLACEHOLDER['zh-CN'], '{填入研究主题}');
  for (const preset of builtins) {
    assert.match(preset.text, /写作语气|知识树/);
    assert.doesNotMatch(preset.text, /寫作|語氣|使用者設定|研究主題/);
    noTraditionalDirective(preset.text);
  }
  assert.match(presets.duplicatePreset([], 'plain', 'zh-CN').created.name, /^白话说明 副本$/);
  const custom = [{ id: 'custom-tone-1', kind: 'tone', name: userText, text: userText }];
  assert.equal(presets.resolveToneText(custom, ['custom-tone-1'], 'zh-CN'), userText);
  assert.equal(presets.listPresets(custom, 'tone', 'zh-CN').at(-1).text, userText);
});

test('Markdown presets and image translation name Simplified Chinese explicitly without rewriting target text', () => {
  const presets = load('experiences/markdown-context/steps/presets/step.ts');
  assert.equal(presets.condensePresetStep.render({ language: 'zh-CN' }), '收敛选取文字，保留核心意思与重要条件。');
  assert.match(presets.searchImagesPresetStep.render({ language: 'zh-CN' }), /^搜索与选取文字/);
  assert.equal(presets.translatePresetStep.render({ language: 'zh-CN', target: userText }), `将选取文字翻译成${userText}，并尽可能保留名称与格式。`);
  const { SUPPORTED_LANGUAGES } = load('i18n.ts');
  const target = SUPPORTED_LANGUAGES.find(item => item.id === 'zh-CN')?.name;
  assert.equal(target, 'Simplified Chinese');
  const { imageTranslateStep } = load('experiences/markdown-context/steps/image-translate/step.ts');
  const prompt = imageTranslateStep.render({ target });
  assert.match(prompt, /visible text translated into Simplified Chinese/);
  noTraditionalDirective(prompt);
});

test('all existing localized prompt resources have static zh-CN counterparts with unchanged template slots', () => {
  for (const directory of ['core/steps', 'experiences/visual-map/steps', 'experiences/markdown-context/steps', 'ai/prompt-presets', 'ai/runtime/messages']) {
    for (const file of fs.readdirSync(path.join(root, directory), { recursive: true }).filter(file => file.endsWith('.zh.md'))) {
      const original = read(`${directory}/${file}`);
      const translated = read(`${directory}/${file.replace('.zh.md', '.zh-CN.md')}`);
      assert.ok(translated.trim());
      noTraditionalDirective(translated);
      assert.deepEqual([...translated.matchAll(/\{\{\w+\}\}/g)].map(match => match[0]).sort(), [...original.matchAll(/\{\{\w+\}\}/g)].map(match => match[0]).sort(), file);
    }
  }
});
