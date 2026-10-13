const assert = require('node:assert/strict');
const { test, load, plain } = require('../support.cjs');
const api = load('ai/detail-templates.ts');

test('standard template: six sections, language names, roles, other-language aliases', () => {
  const zh = api.standardTemplate('zh-TW'), en = api.standardTemplate('en');
  assert.deepEqual(plain(zh.sections.map(s => s.name)), ['核心結論', '關鍵知識', '證據與來源', '取捨與限制', '待確認事項', '更新紀錄']);
  assert.deepEqual(plain(en.sections.map(s => s.name)), ['Core conclusions', 'Key knowledge', 'Evidence and sources', 'Tradeoffs and limitations', 'Open questions', 'Update log']);
  assert.deepEqual(plain(zh.sections.map(s => s.role)), ['none', 'none', 'sources', 'none', 'none', 'log']);
  assert.deepEqual(plain(zh.sections[2].aliases), ['Evidence and sources']);
  assert.equal(zh.id, 'standard');
});
test('copyTemplate keeps both-language names as aliases so old notes still match', () => {
  const copy = api.copyTemplate(api.standardTemplate('zh-TW'), '教學', 't1');
  assert.equal(copy.id, 't1'); assert.equal(copy.name, '教學');
  assert.deepEqual(plain(api.sectionKeys(copy.sections[0])), ['核心結論', 'core conclusions']);
  copy.sections[0].name = 'X'; assert.equal(api.standardTemplate('zh-TW').sections[0].name, '核心結論');
});
test('validateTemplate reports every limit', () => {
  const ok = api.copyTemplate(api.standardTemplate('en'), 'Teach', 't1');
  assert.deepEqual(plain(api.validateTemplate(ok, [])), []);
  const keys = t => plain(api.validateTemplate(t, [ok])).map(i => i.key);
  const bad = JSON.parse(JSON.stringify(ok)); bad.id = 't2'; bad.name = 'teach';
  assert.ok(keys(bad).includes('ui.detail_template_error_name_taken'));
  const empty = { ...ok, id: 't3', name: 'E', sections: [] }; assert.ok(keys(empty).includes('ui.detail_template_error_section_count'));
  const many = { ...ok, id: 't4', name: 'M', sections: Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, description: '', role: 'none', aliases: [] })) };
  assert.ok(keys(many).includes('ui.detail_template_error_section_count'));
  const s = n => ({ id: n, name: n, description: '', role: 'none', aliases: [] });
  const cases = [
    [{ ...s('a'), name: '' }, 'ui.detail_template_error_section_name_required'],
    [{ ...s('a'), name: 'A#B' }, 'ui.detail_template_error_section_name_invalid'],
    [{ ...s('a'), name: 'A\nB' }, 'ui.detail_template_error_section_name_invalid'],
    [{ ...s('a'), name: 'x'.repeat(41) }, 'ui.detail_template_error_section_name_long'],
    [{ ...s('a'), description: 'x'.repeat(301) }, 'ui.detail_template_error_description_long'],
    [{ ...s('a'), count: { mode: 'exact', n: 0 } }, 'ui.detail_template_error_count_range'],
    [{ ...s('a'), count: { mode: 'min', n: 21 } }, 'ui.detail_template_error_count_range']
  ];
  for (const [section, key] of cases) assert.ok(keys({ id: 'x', name: 'X', sections: [section] }).includes(key), key);
  assert.ok(keys({ id: 'x', name: 'X', sections: [s('A'), s('a')] }).includes('ui.detail_template_error_section_name_taken'));
  assert.ok(keys({ id: 'x', name: 'X', sections: [{ ...s('A'), role: 'sources' }, { ...s('B'), role: 'sources' }] }).includes('ui.detail_template_error_role_taken'));
  assert.ok(keys({ id: 'x', name: '', sections: [s('A')] }).includes('ui.detail_template_error_name_required'));
});
test('normalizeTemplates drops malformed, invalid and standard-id entries', () => {
  const ok = api.copyTemplate(api.standardTemplate('en'), 'Teach', 't1');
  assert.deepEqual(plain(api.normalizeTemplates([ok, null, { id: 'standard', name: 'S', sections: ok.sections }, { id: 'x', name: 'Bad', sections: [] }, 'nope']).map(t => t.id)), ['t1']);
  assert.deepEqual(plain(api.normalizeTemplates(undefined)), []);
});
test('resolveTemplate: first defined id wins, missing ids are reported, Standard is the fallback', () => {
  const teach = api.copyTemplate(api.standardTemplate('en'), 'Teach', 't1');
  assert.equal(api.resolveTemplate([teach], [undefined, 't1', 'standard'], 'en').template.id, 't1');
  const r = api.resolveTemplate([teach], ['gone', undefined, 't1'], 'en');
  assert.equal(r.template.id, 't1'); assert.deepEqual(plain(r.missing), ['gone']);
  assert.equal(api.resolveTemplate([], [undefined], 'zh-TW').template.sections[0].name, '核心結論');
  assert.equal(api.resolveTemplate([teach], ['standard', 't1'], 'en').template.id, 'standard');
});
test('countItems: #### headings win, else top-level list items; fenced code never counts', () => {
  assert.equal(api.countItems('- a\n- b\n  - nested\n1. c\n2) d\n* e\n+ f'), 6);
  assert.equal(api.countItems('#### One\n- x\n- y\n#### Two\n- z'), 2);
  assert.equal(api.countItems('```\n- a\n- b\n```\n- c'), 1);
  assert.equal(api.countItems('Plain paragraph.\n\nAnother.'), 0);
  assert.equal(api.countItems('~~~md\n#### x\n~~~\n#### y'), 1);
});
test('checkCounts reads sections by template name or alias', () => {
  const t = api.copyTemplate(api.standardTemplate('en'), 'Teach', 't1');
  t.sections.splice(2, 0, { id: 'ex', name: 'Examples', description: '', role: 'none', count: { mode: 'exact', n: 3 }, aliases: [] });
  t.sections[0].count = { mode: 'min', n: 2 };
  const detail = '### Core conclusions\n\n- a\n- b\n\n### Examples\n\n- one\n- two';
  assert.deepEqual(plain(api.checkCounts(detail, t)), [{ section: 'Examples', mode: 'exact', n: 3, actual: 2 }]);
  assert.deepEqual(plain(api.checkCounts('### 核心結論\n\n- a\n\n### Examples\n\n- 1\n- 2\n- 3', t)), [{ section: 'Core conclusions', mode: 'min', n: 2, actual: 1 }]);
});
const STANDARD_DESCRIPTIONS = {
  'zh-TW': ['直接回答研究問題，預設 3–5 點，先講結論再講理由。', '理解結論需要的概念、數據、機制與背景。', '支持結論的事實與數據，並標出處；來源清單會自動放在這段最後。', '各選項的優缺點、適用條件、風險，以及這次研究的限制。', '還沒查證或資料不足、值得下一步研究的問題。', '只新增一行，寫這次更新了什麼。'],
  en: ['Answer the research question directly, 3–5 points by default; give the conclusion first, then the reason.', 'The concepts, data, mechanisms and background needed to understand the conclusions.', 'The facts and data that support the conclusions, with their sources; the source list is added to the end of this section automatically.', 'Pros and cons of the options, when each applies, the risks, and the limits of this research.', 'Questions not yet verified or lacking data that are worth researching next.', 'Add only one line saying what this update changed.']
};
test('standard template: each section carries its AI instruction; copies keep them', () => {
  for (const language of ['zh-TW', 'en']) {
    const standard = api.standardTemplate(language);
    assert.deepEqual(plain(standard.sections.map(s => s.description)), STANDARD_DESCRIPTIONS[language], language);
    const copy = api.copyTemplate(standard, 'Copy', 'c1');
    assert.deepEqual(plain(copy.sections.map(s => s.description)), STANDARD_DESCRIPTIONS[language], `${language} copy`);
    assert.deepEqual(plain(api.validateTemplate(copy, [])), [], `${language} copy is valid`);
  }
});
test('detailStructurePrompt: Standard is the existing sentence plus six description lines; custom lists headings, log rule, descriptions and counts', () => {
  const standard = api.detailStructurePrompt(api.standardTemplate('zh-TW'), 'zh-TW', h => `STD(${h})`);
  const zhNames = ['核心結論', '關鍵知識', '證據與來源', '取捨與限制', '待確認事項', '更新紀錄'];
  assert.equal(standard, ['STD(### 核心結論, ### 關鍵知識, ### 證據與來源, ### 取捨與限制, ### 待確認事項, ### 更新紀錄)',
    ...zhNames.map((name, i) => `### ${name}：${STANDARD_DESCRIPTIONS['zh-TW'][i]}`)].join('\n'));
  const enNames = ['Core conclusions', 'Key knowledge', 'Evidence and sources', 'Tradeoffs and limitations', 'Open questions', 'Update log'];
  assert.equal(api.detailStructurePrompt(api.standardTemplate('en'), 'en', h => `STD(${h})`), [`STD(${enNames.map(n => `### ${n}`).join(', ')})`,
    ...enNames.map((name, i) => `### ${name}: ${STANDARD_DESCRIPTIONS.en[i]}`)].join('\n'));
  const t = { id: 't', name: 'T', sections: [
    { id: 'a', name: '重點', description: '三句內', role: 'none', aliases: [] },
    { id: 'b', name: '範例', description: '', role: 'none', count: { mode: 'exact', n: 3 }, aliases: [] },
    { id: 'c', name: '紀錄', description: '', role: 'log', aliases: [] }] };
  const zh = api.detailStructurePrompt(t, 'zh-TW', () => 'unused');
  assert.match(zh, /3 個三級標題：### 重點, ### 範例, ### 紀錄。/);
  assert.match(zh, /### 重點：三句內/);
  assert.match(zh, /### 範例 必須剛好有 3 個項目/);
  assert.match(zh, /### 紀錄 只新增一行本次變更摘要/);
  const en = api.detailStructurePrompt({ ...t, sections: [{ ...t.sections[1], count: { mode: 'min', n: 2 } }] }, 'en', () => 'unused');
  assert.match(en, /### 範例 must have at least 2 items/);
  assert.doesNotMatch(en, /only one line/);
});

test('normalizeTemplates keeps the first of duplicate ids', () => {
  const first = api.copyTemplate(api.standardTemplate('en'), 'First', 't1'), second = api.copyTemplate(api.standardTemplate('en'), 'Second', 't1');
  const result = api.normalizeTemplates([first, second]);
  assert.deepEqual(plain(result.map(item => item.name)), ['First']);
});

const utils = load('ai/result-utils.ts');
const refs = load('ai/reference-materials.ts', { obsidian: require('../support.cjs').obsidian });
const teach = () => {
  const t = api.copyTemplate(api.standardTemplate('zh-TW'), '教學', 't1');
  t.sections[1] = { ...t.sections[1], name: '概念', aliases: ['關鍵知識', 'Key knowledge'] };
  t.sections.splice(2, 0, { id: 'ex', name: '範例', description: '', role: 'none', count: { mode: 'exact', n: 3 }, aliases: [] });
  t.sections = t.sections.filter(s => s.id !== 'tradeoffs');
  return t;
};
test('canonicalDetail without a template is unchanged (Standard)', () => {
  const input = '### 核心結論\n\nA\n\n### 更新紀錄\n\n- x';
  assert.equal(utils.canonicalDetail(input, 'zh-TW'), utils.canonicalDetail(input, 'zh-TW', api.standardTemplate('zh-TW')));
});
test('canonicalDetail follows a custom template: order, aliases, empty fill, removed sections kept as text', () => {
  const out = utils.canonicalDetail('### 關鍵知識\n\nK\n\n### 取捨與限制\n\nT\n\n### 核心結論\n\nC', 'zh-TW', teach());
  assert.deepEqual(out.split('\n').filter(l => l.startsWith('### ')), ['### 核心結論', '### 概念', '### 取捨與限制', '### 範例', '### 證據與來源', '### 待確認事項', '### 更新紀錄']); // '### 取捨與限制' is kept text, not a section
  assert.match(out, /### 概念\n\nK\n\n### 取捨與限制\n\nT/); // unknown heading stays as text inside the section where it appeared
  assert.match(out, /### 範例\n\n本次無新增內容。/);
});
test('canonicalDetail keeps a user ### sub-heading inside its section', () => {
  const out = utils.canonicalDetail('### 核心結論\n\nA\n\n### 我的小節\n\nB\n\n### 更新紀錄\n\n- x', 'zh-TW');
  assert.match(out, /### 核心結論\n\nA\n\n### 我的小節\n\nB\n\n### 關鍵知識/);
});
test('footnote definitions go to the sources section, or to the end when the template has none', () => {
  const noSources = { id: 'n', name: 'N', sections: [{ id: 'a', name: 'A', description: '', role: 'none', aliases: [] }, { id: 'b', name: 'B', description: '', role: 'log', aliases: [] }] };
  const out = utils.canonicalDetail('### A\n\nfact[^1]\n\n[^1]: [[Notes/X|X]]\n\n### B\n\n- log', 'en', noSources);
  assert.match(out, /### B\n\n- log\n\n\[\^1\]: \[\[Notes\/X\|X\]\]$/);
  const t = teach();
  const placed = refs.resolveDetailReferences('### 核心結論\n\nfact [S1]\n\n### 證據與來源\n\nE', [{ id: 'g', name: 'g', location: '', documents: [{ path: 'Notes/X.md', content: 'x' }] }], '', t);
  assert.match(placed, /### 證據與來源\n\nE\n\n\[\^1\]: \[\[Notes\/X\.md\|X\]\]/);
});
test('Standard canonicalDetail is idempotent and unchanged on repo Markdown corpus', () => {
  const fs = require('node:fs'), path = require('node:path'), { root } = require('../support.cjs');
  const files = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith('.md')) files.push(full); } };
  for (const dir of ['samples', 'tests/fixtures']) if (fs.existsSync(path.join(root, dir))) walk(path.join(root, dir));
  assert.ok(files.length > 0, 'corpus is not empty');
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const language of ['zh-TW', 'en']) {
      const once = utils.canonicalDetail(text, language);
      assert.equal(utils.canonicalDetail(once, language), once, `idempotent: ${file} (${language})`);
      assert.equal(utils.canonicalDetail(text, language, api.standardTemplate(language)), once, `Standard default: ${file} (${language})`);
    }
  }
});

// A section's current name always wins over another section's alias.
const renamedExamples = () => ({ id: 't', name: 'T', sections: [
  { id: 'core', name: 'Core', description: '', role: 'none', aliases: [] },
  { id: 'new', name: 'Examples', description: '', role: 'none', count: { mode: 'exact', n: 2 }, aliases: [] },
  { id: 'old', name: 'Samples', description: '', role: 'none', count: { mode: 'exact', n: 3 }, aliases: ['Examples'] }] });
test('a section name beats another section alias: canonicalDetail and checkCounts', () => {
  const detail = '### Core\n\nC\n\n### Examples\n\n- a\n- b\n\n### Samples\n\n- 1\n- 2\n- 3';
  const out = utils.canonicalDetail(detail, 'en', renamedExamples());
  assert.match(out, /### Examples\n\n- a\n- b\n\n### Samples\n\n- 1\n- 2\n- 3$/);
  assert.deepEqual(plain(api.checkCounts(detail, renamedExamples())), []);
});
test('swapping two section names keeps each heading in its own section', () => {
  const swapped = { id: 't', name: 'T', sections: [
    { id: 'x', name: 'B', description: '', role: 'none', aliases: ['A'] },
    { id: 'y', name: 'A', description: '', role: 'none', aliases: ['B'] }] };
  const out = utils.canonicalDetail('### A\n\nfor A\n\n### B\n\nfor B', 'en', swapped);
  assert.equal(out, '### B\n\nfor B\n\n### A\n\nfor A');
});
test('normalizeTemplates drops aliases equal to any section current name', () => {
  const [result] = api.normalizeTemplates([{ id: 't', name: 'T', sections: [
    { id: 'x', name: 'B', description: '', role: 'none', aliases: ['A', 'Old'] },
    { id: 'y', name: 'A', description: '', role: 'none', aliases: ['b', 'Older'] }] }]);
  assert.deepEqual(plain(result.sections.map(s => s.aliases)), [['Old'], ['Older']]);
});
test('resolveDetailReferences: sources alias equal to another section name does not move footnotes there', () => {
  const t = { id: 't', name: 'T', sections: [
    { id: 'a', name: 'A', description: '', role: 'none', aliases: [] },
    { id: 'n', name: 'Notes', description: '', role: 'none', aliases: [] },
    { id: 'r', name: 'Refs', description: '', role: 'sources', aliases: ['Notes'] }] };
  const placed = refs.resolveDetailReferences('### A\n\nfact [S1]\n\n### Notes\n\nN\n\n### Refs\n\nE', [{ id: 'g', name: 'g', location: '', documents: [{ path: 'Notes/X.md', content: 'x' }] }], '', t);
  assert.match(placed, /### Notes\n\nN\n\n### Refs\n\nE\n\n\[\^1\]: \[\[Notes\/X\.md\|X\]\]/);
});
