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
test('detailStructurePrompt: Standard uses the existing text verbatim; custom lists headings, log rule, descriptions and counts', () => {
  const standard = api.detailStructurePrompt(api.standardTemplate('zh-TW'), 'zh-TW', h => `STD(${h})`);
  assert.equal(standard, 'STD(### 核心結論, ### 關鍵知識, ### 證據與來源, ### 取捨與限制, ### 待確認事項, ### 更新紀錄)');
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
