// AI merge preservation check (core/steps/task/merge-check.ts): pure, offline. The replays are merges recorded from real
// claude:sonnet runs in the merge-topics verification; each one is a good merge and must produce no finding.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./support-replay.cjs');

const { checkMergePreservation } = load('core/steps/task/merge-check.ts');
const { mergeRepair } = load('core/steps/task/fragments.ts');
const directory = path.join(__dirname, 'fixtures', 'merge-check');
const recorded = fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort().map(name => ({ name, ...JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) }));
const check = (sources, merged, over = {}) => JSON.parse(JSON.stringify(checkMergePreservation({ sourceTexts: sources, mergedTexts: merged, ...over })));

test('replay: every recorded good merge (sibling and parent) passes with no false positive', () => {
  assert.ok(recorded.length >= 4, 'the five recorded merges that are still on disk');
  for (const merge of recorded) {
    const result = check(merge.sources, [merge.summary, merge.detail]);
    assert.deepEqual(result, { ok: true, missing: [], added: [] }, merge.name);
  }
});

test('replay: a source number dropped from a recorded merge is reported as missing', () => {
  for (const merge of recorded) {
    const sourceNumber = merge.sources.join('\n').match(/\d+(?:\.\d+)?/)?.[0];
    if (!sourceNumber) continue;
    const stripped = merge.detail.split(sourceNumber).join('');
    const result = check(merge.sources, [merge.summary.split(sourceNumber).join(''), stripped]);
    assert.equal(result.ok, false, merge.name);
    assert.ok(result.missing.includes(String(Number(sourceNumber))), `${merge.name}: ${sourceNumber} in ${JSON.stringify(result)}`);
  }
});

test('replay: a number that no source has is reported as added; the Update log line is exempt', () => {
  for (const merge of recorded) {
    const result = check(merge.sources, [merge.summary, `- 比源頭多出的 4711 項\n\n${merge.detail}`]);
    assert.deepEqual(result, { ok: false, missing: [], added: ['4711'] }, merge.name);
  }
  const log = check(['Alpha 5'], ['Alpha 5\n\n### Update log\n- 2026-10-19: merged 2 sources']);
  assert.equal(log.ok, true, 'a dated Update log line is the merge\'s own');
  const later = check(['Alpha 5'], ['Alpha 5\n\n### Update log\n- 2026-10-19: merged\n\n### Next\nBeta 99']);
  assert.deepEqual(later.added, ['99'], 'only the Update log section is skipped, not what follows it');
});

test('numbers: 2.0 equals 2, 1,000 equals 1000, identifiers and list numbering are not quantities', () => {
  assert.equal(check(['Specific heat 2.0 and 1,000 kg, model A1 and H2O'], ['specific heat 2 and 1000 kg']).ok, true);
  assert.equal(check(['1. first 7\n2. second 8'], ['- first 7\n- second 8']).ok, true, 'markdown numbering is layout');
  assert.equal(check(['### 3. Costs\n10'], ['### Costs\n10']).ok, true);
  assert.deepEqual(check(['value 4.18'], ['value 4.81']), { ok: false, missing: ['4.18'], added: ['4.81'] });
  assert.equal(check(['A'], ['Citation [^12] and [S3] and a link [[Notes/2026-01-02 note|alias]]'], { allowedTexts: [] }).ok, true, 'footnote markers, source markers and wikilink targets carry no quantity');
  assert.equal(check(['A'], ['See Notes/Plan 2026.md'], { allowedTexts: ['Agent Workspace/Notes/Plan 2026.md'] }).ok, true, 'numbers of a source path may be repeated');
});

test('links: URLs, wikilinks, image embeds and link targets must all survive; alias and heading do not matter', () => {
  const source = 'See https://example.org/a/b?x=1, [[Notes/Child|the child]], ![[diagram.png]], ![plan](images/plan.png) and [doc](docs/readme.md).';
  const whole = 'Details: https://example.org/a/b?x=1 and [[Notes/Child#Part]] with ![[diagram.png]] ![plan](images/plan.png) [doc](docs/readme.md)';
  assert.equal(check([source], [whole]).ok, true);
  const without = needle => whole.split(needle).join('');
  assert.deepEqual(check([source], [without('https://example.org/a/b?x=1')]).missing, ['https://example.org/a/b?x=1']);
  assert.deepEqual(check([source], [without('[[Notes/Child#Part]]')]).missing, ['Notes/Child']);
  assert.deepEqual(check([source], [without('![[diagram.png]]')]).missing, ['diagram.png']);
  assert.deepEqual(check([source], [without('![plan](images/plan.png)')]).missing, ['images/plan.png']);
  assert.deepEqual(check([source], [without('[doc](docs/readme.md)')]).missing, ['docs/readme.md']);
  assert.equal(check([source], [], { mergedLinkTexts: [whole] }).ok, true, 'links returned beside the Detail count');
  assert.equal(check(['![](https://img.example.org/a.png)'], ['x'], { mergedLinkTexts: ['https://img.example.org/a.png'] }).ok, true, 'a visual reference returned beside the Detail counts');
  assert.equal(check([], ['x'], { sourceLinkTexts: ['![](https://img.example.org/a.png)'] }).ok, false);
});

test('repair fragment: both languages list the findings and the topic name, with no placeholder left', () => {
  for (const language of ['en', 'zh-TW']) {
    const text = mergeRepair(language, '- 4.18', '- 4711', 'Name');
    assert.match(text, /- 4\.18/); assert.match(text, /- 4711/); assert.match(text, /"title":"Name"/); assert.doesNotMatch(text, /\{\{/);
  }
});
