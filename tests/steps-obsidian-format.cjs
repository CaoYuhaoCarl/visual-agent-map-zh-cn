// Obsidian syntax in a model-written detail: the prompt asks for it, the parse/write path keeps it, and an unsafe
// mermaid block is turned into plain code before anything is written.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, promptsFor, makeService } = require('./support-replay.cjs');
const support = require('./support.cjs');

const { parseAiResult } = load('core/steps/task/parse.ts');
const { neutralizeUnsafeMermaid } = load('ai/mermaid-safety.ts');
const { canonicalDetail } = load('ai/result-utils.ts');
const { resolveDetailReferences } = load('ai/reference-materials.ts');

const reply = detail => JSON.stringify({ summary: 'S', detail, suggestions: [], visualReferences: [] });
const parse = detail => parseAiResult(reply(detail), 'Test', 'zh-TW').detail;

const RICH = [
  '### 核心結論',
  '',
  '> [!summary] 結論',
  '> ==間隔重複==比集中練習更能維持長期記憶。',
  '',
  '### 關鍵知識',
  '',
  '| 方法 | 短期 | 長期 |',
  '| --- | --- | --- |',
  '| 集中練習 | 高 | 低 |',
  '| 間隔重複 | 中 | 高 |',
  '',
  '```mermaid',
  'flowchart LR',
  '  A["學習 (第 1 天)"] --> B[複習]',
  '  B -->|間隔變長| C[長期記憶]',
  '```',
  '',
  '```mermaid',
  'timeline',
  '  title 記憶研究',
  '  1885 : 遺忘曲線',
  '  1970s : 間隔效應實驗',
  '```',
  '',
  '> [!warning] 常見誤解',
  '> 重讀不等於主動回想。',
  '',
  '> [!example] 圖解',
  '> ```mermaid',
  '> graph TD',
  '> A --> B',
  '> ```',
  '',
  '### 待確認事項',
  '',
  '> [!question] 間隔要多長？',
  '',
  '- [ ] 用 Anki 建 20 張卡片',
  '- [x] 讀完第一章',
  '',
  '> [!tip] 每次複習先回想再看答案。'
].join('\n');

test('allowed Obsidian syntax survives parse, canonical sections, source footnotes and the note write', async () => {
  assert.equal(parse(RICH), RICH);
  assert.equal(neutralizeUnsafeMermaid(RICH), RICH);
  const canonical = canonicalDetail(parse(RICH), 'zh-TW');
  for (const fragment of ['> [!summary] 結論', '==間隔重複==', '| 間隔重複 | 中 | 高 |', '```mermaid\nflowchart LR\n  A["學習 (第 1 天)"] --> B[複習]', '```mermaid\ntimeline', '> ```mermaid\n> graph TD', '> [!question] 間隔要多長？', '- [ ] 用 Anki 建 20 張卡片', '- [x] 讀完第一章', '> [!tip]'])
    assert.ok(canonical.includes(fragment), `canonical detail keeps ${JSON.stringify(fragment)}`);
  assert.equal(resolveDetailReferences(canonical, []), canonical);
  const { repo } = support.fixture('zh-TW');
  const node = await support.topicNote(repo);
  await repo.updateNote(node.path, { detail: canonical });
  assert.equal((await repo.readNote(node.path)).detail, canonical);
});

test('a mermaid block with click, HTML, an init directive or a URL is kept as plain code, not rendered', () => {
  const unsafe = {
    click: ['flowchart LR', '  A --> B', '  click A "https://example.com"'],
    callback: ['graph TD', '  A --> B', '  click B callback'],
    html: ['flowchart LR', '  A["<img src=x onerror=alert(1)>"] --> B'],
    br: ['flowchart LR', '  A["one<br>two"] --> B'],
    init: ['%%{init: {"securityLevel": "loose"}}%%', 'flowchart LR', '  A --> B'],
    frontMatter: ['---', 'config:', '  securityLevel: loose', '---', 'flowchart LR', '  A --> B'],
    url: ['flowchart LR', '  A["see https://evil.example/x"] --> B'],
    javascript: ['flowchart LR', '  A["javascript:alert(1)"] --> B'],
    style: ['flowchart LR', '  A --> B', '  style A fill:#f00'],
    classDef: ['flowchart LR', '  A:::hot --> B'],
    image: ['flowchart LR', '  A@{ img: "https://x/y.png" } --> B'],
    icon: ['flowchart LR', '  A["fa:fa-car"] --> B'],
    otherDiagram: ['sequenceDiagram', '  A->>B: hi', '  link A: Site @ https://x']
  };
  for (const [name, body] of Object.entries(unsafe)) {
    const detail = ['before', '', '```mermaid', ...body, '```', '', 'after'].join('\n');
    const expected = ['before', '', '```text', ...body, '```', '', 'after'].join('\n');
    assert.equal(parse(detail), expected, `${name}: block becomes plain code with its text intact`);
  }
  // Inside a callout, in a longer fence, and an unclosed fence at the end.
  assert.equal(parse('> [!example]\n> ```mermaid\n> flowchart LR\n> A --> B\n> click A "x"\n> ```'), '> [!example]\n> ```text\n> flowchart LR\n> A --> B\n> click A "x"\n> ```');
  assert.equal(parse('````mermaid\ngraph TD\nA --> B\n```\nclick A "x"\n````'), '````text\ngraph TD\nA --> B\n```\nclick A "x"\n````');
  assert.equal(parse('x\n\n```mermaid\nflowchart LR\nA["<b>x</b>"] --> B'), 'x\n\n```text\nflowchart LR\nA["<b>x</b>"] --> B');
});

test('only the unsafe mermaid block changes; safe blocks and other code stay as written', () => {
  const safe = '```mermaid\nflowchart TD\n  A --> B\n```';
  const bad = '```mermaid\nflowchart TD\n  A --> B\n  click A "https://x"\n```';
  const code = '```md\n```mermaid\nclick A "x"\n```';
  assert.equal(parse([safe, bad, safe].join('\n\n')), [safe, bad.replace('```mermaid', '```text'), safe].join('\n\n'));
  // Each mermaid opening is checked on its own, even one quoted inside another code block (never rendered there).
  assert.equal(parse(`~~~\n${code}\n~~~`), `~~~\n${code.replace('```mermaid', '```text')}\n~~~`);
  assert.equal(parse('~~~md\n```mermaid\nflowchart LR\nA --> B\n```\n~~~'), '~~~md\n```mermaid\nflowchart LR\nA --> B\n```\n~~~');
});

test('reader-facing prompts carry the Obsidian syntax rules; decompose and AIM control phases do not', async () => {
  const marker = { en: 'The detail is rendered in Obsidian.', 'zh-TW': 'detail 會在 Obsidian 中渲染' };
  const base = { title: 'T', summary: 'S', rules: '', detail: 'D', task: 'X', ancestors: '', researchMode: 'local', researchDepth: 'fast', visualMode: 'off' };
  const sent = async context => (await promptsFor(context, { language: context.outputLanguage })).at(-1).prompt;
  for (const language of ['en', 'zh-TW']) {
    const has = async context => (await sent({ ...base, ...context, outputLanguage: language })).includes(marker[language]);
    assert.equal(await has({ mode: 'task' }), true, `${language} task`);
    assert.equal(await has({ mode: 'synthesize' }), true, `${language} synthesize`);
    assert.equal(await has({ mode: undefined, detailFormat: 'adaptive' }), true, `${language} adaptive`);
    assert.equal(await has({ mode: 'task', detailTemplate: { id: 'custom', name: 'C', sections: [{ name: 'A', description: '', role: 'body' }] } }), true, `${language} custom template`);
    assert.equal(await has({ mode: 'decompose' }), false, `${language} decompose`);
    assert.equal(await has({ mode: 'task', intermediateDetail: true }), false, `${language} reference extraction`);
    const aim = async phase => has({ mode: 'task', promptProfile: 'aim', task: `<!-- aim-phase: ${phase} -->\nTask.`, ...(phase.endsWith('research') ? { researchMode: 'research', aimIsolatedResearch: true } : {}) });
    for (const phase of ['subtopic-research', 'targeted-followup-research', 'delivery-writing']) assert.equal(await aim(phase), true, `${language} AIM ${phase}`);
    for (const phase of ['research-plan', 'report-review', 'delivery-outline', 'delivery-research', 'format-repair']) assert.equal(await aim(phase), false, `${language} AIM ${phase}`);
  }
});

test('an unsafe mermaid block from a provider reply is neutralized by the AiTaskService result', async () => {
  const runtime = { runTask: async () => reply('```mermaid\nflowchart LR\nA --> B\nclick A "https://x"\n```') };
  const service = makeService(runtime, { language: 'en' });
  const result = await service.askModel({ title: 'T', summary: '', rules: '', detail: '', task: 'X', ancestors: '', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', outputLanguage: 'en' }, 'gpt-6-luna', 'low');
  assert.ok(result.detail.includes('```text\nflowchart LR'));
  assert.ok(!result.detail.includes('```mermaid'));
});

test('reviewer gaps: inline mermaid code, fences in lists, and directives after a semicolon', () => {
  const bad = ['```mermaid', 'flowchart LR', 'A --> B', 'click A "https://x"', '```'];
  // Inline ```mermaid``` is not a fence (a backtick info string cannot hold a backtick); the real block after it is checked.
  const inline = ['```mermaid``` 是流程圖語法。', '', ...bad].join('\n');
  assert.equal(parse(inline), ['```mermaid``` 是流程圖語法。', '', '```text', ...bad.slice(1)].join('\n'));
  // A fence continued in a list (indented four spaces) and a fence on the list marker's own line.
  const indented = ['- step', '', ...bad.map(line => `    ${line}`)].join('\n');
  assert.equal(parse(indented), indented.replace('```mermaid', '```text'));
  const onMarker = ['- ```mermaid', ...bad.slice(1).map(line => `  ${line}`)].join('\n');
  assert.equal(parse(onMarker), onMarker.replace('```mermaid', '```text'));
  const task = ['- [ ] ```mermaid', ...bad.slice(1).map(line => `  ${line}`)].join('\n');
  assert.equal(parse(task), task.replace('```mermaid', '```text'));
  const numbered = ['1. ```mermaid', ...bad.slice(1).map(line => `   ${line}`)].join('\n');
  assert.equal(parse(numbered), numbered.replace('```mermaid', '```text'));
  // Directives chained with ';' on one line.
  for (const directive of ['click A someFn', 'style A fill:#f00', 'classDef hot fill:#f00', 'linkStyle 0 stroke:red'])
    assert.equal(parse(`\`\`\`mermaid\nflowchart LR\nA --> B; ${directive}\n\`\`\``), `\`\`\`text\nflowchart LR\nA --> B; ${directive}\n\`\`\``, directive);
  // A safe block in a list still renders.
  const safe = '- step\n\n    ```mermaid\n    flowchart LR\n    A --> B\n    ```';
  assert.equal(parse(safe), safe);
});

test('a counted section keeps its items as a top-level list: the prompt says so and such a reply needs no repair', async () => {
  const template = { id: 'custom-count', name: 'Counted', sections: [
    { id: 'a', name: 'Core conclusions', description: '', role: 'body', count: { mode: 'exact', n: 3 }, aliases: [] },
    { id: 'b', name: 'Notes', description: '', role: 'body', aliases: [] }
  ] };
  const context = { title: 'T', summary: '', rules: '', detail: '', task: 'X', ancestors: '', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', outputLanguage: 'en', detailTemplate: template };
  const calls = [];
  const replies = [
    reply('### Core conclusions\n\n> [!summary]\n> - a\n> - b\n> - c\n\n### Notes\n\nn'),
    reply('### Core conclusions\n\n- a\n- b\n- c\n\n### Notes\n\n> [!tip] n')
  ];
  const runtime = { runTask: async prompt => { calls.push(prompt); return replies[calls.length - 1]; } };
  const result = await makeService(runtime, { language: 'en' }).askModel(context, 'gpt-6-luna', 'low');
  const rule = 'In a section with a required item count, write the items as a top-level list or #### subheadings, not inside a callout or table.';
  assert.ok(calls[0].includes(rule), 'the first request carries the count rule');
  assert.equal(calls.length, 2, 'the callout-wrapped list misses the count and gets the single repair');
  assert.ok(calls[1].includes(rule), 'the repair request carries it too');
  assert.equal(result.formatIssues.length, 0);
  assert.ok(result.detail.includes('- a\n- b\n- c'));
});

test('each mermaid opening is judged on its own: an unclosed block in a list cannot hide a later one, and quotes inside lists are seen', () => {
  const later = ['- ```mermaid', '  flowchart LR', '  A-->B', '', 'Text', '', '```mermaid', 'flowchart LR', 'A-->B', 'click A "https://x"', '```'].join('\n');
  // The later unsafe block is caught; the unclosed list block is checked with the text after it, so it is blocked too.
  assert.equal(parse(later), later.replaceAll('```mermaid', '```text'));
  const quotedInList = '- > ```mermaid\n  > flowchart LR\n  > click A x\n  > ```';
  assert.equal(parse(quotedInList), quotedInList.replace('```mermaid', '```text'));
  const calloutInTask = '- [ ] > [!example]\n  > ```mermaid\n  > graph TD\n  > A --> B; style A fill:red\n  > ```';
  assert.equal(parse(calloutInTask), calloutInTask.replace('```mermaid', '```text'));
  const safeQuotedInList = '- > ```mermaid\n  > flowchart LR\n  > A --> B\n  > ```';
  assert.equal(parse(safeQuotedInList), safeQuotedInList);
});

// Math: Obsidian renders only `$…$` and `$$…$$`; the prompt asks for them and the result is normalized either way.
const { normalizeMathDelimiters } = load('ai/markdown-blocks.ts');

test('the Obsidian format prompt asks for dollar-delimited math in both languages', async () => {
  const base = { title: 'T', summary: 'S', rules: '', detail: 'D', task: 'X', ancestors: '', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', mode: 'task' };
  for (const [language, rule] of [['en', 'inline math as `$…$` with no spaces just inside the dollars'], ['zh-TW', '行內用 `$…$`（錢字號內側不留空白）']]) {
    const prompt = (await promptsFor({ ...base, outputLanguage: language }, { language })).at(-1).prompt;
    assert.ok(prompt.includes(rule), `${language} states the math rule`);
    for (const delimiter of ['`\\(`', '`\\)`', '`\\[`', '`\\]`']) assert.ok(prompt.includes(delimiter), `${language} forbids ${delimiter}`);
  }
});

test('math normalizer converts LaTeX delimiters to dollar math', () => {
  const n = normalizeMathDelimiters;
  assert.equal(n('傅立葉數\n\\[\nFo=\\frac{\\alpha t}{L^2}\n\\]\n結束'), '傅立葉數\n$$\nFo=\\frac{\\alpha t}{L^2}\n$$\n結束');
  assert.equal(n('\\[ Fo=\\frac{\\alpha t}{L^2} \\]'), '$$Fo=\\frac{\\alpha t}{L^2}$$');
  assert.equal(n('導熱係數 \\(k\\) 越大'), '導熱係數 $k$ 越大');
  assert.equal(n('時間 \\( t\\propto L^2/\\alpha \\) 成正比'), '時間 $t\\propto L^2/\\alpha$ 成正比');
  assert.equal(n('\\(a\\) 與 \\(b\\)，且 \\[x^2\\]'), '$a$ 與 $b$，且 $$x^2$$');
  assert.equal(n('> \\[\n> E=mc^2\n> \\]'), '> $$\n> E=mc^2\n> $$');
});

test('math normalizer leaves code, escapes, unmatched and dollar math alone', () => {
  const n = normalizeMathDelimiters;
  const fenced = '```latex\n\\[\nx\n\\]\n\\(k\\)\n```';
  assert.equal(n(fenced), fenced);
  assert.equal(n('~~~\n\\(k\\)\n~~~'), '~~~\n\\(k\\)\n~~~');
  assert.equal(n('寫成 `\\(k\\)` 與 ``\\[x\\]``'), '寫成 `\\(k\\)` 與 ``\\[x\\]``');
  assert.equal(n('`code` 之後 \\(k\\)'), '`code` 之後 $k$');
  assert.equal(n('escaped \\\\[x\\\\] and \\\\(k\\\\)'), 'escaped \\\\[x\\\\] and \\\\(k\\\\)');
  assert.equal(n('a lone \\[ bracket'), 'a lone \\[ bracket');
  assert.equal(n('\\[\nno closing line\n\n之後 \\] 隔著空行'), '\\[\nno closing line\n\n之後 \\] 隔著空行');
  assert.equal(n('a lone \\( paren'), 'a lone \\( paren');
  assert.equal(n('a stray \\) and \\] alone'), 'a stray \\) and \\] alone');
  const dollars = '行內 $k$ 與\n$$\nx^2\n$$';
  assert.equal(n(dollars), dollars);
  assert.equal(n(''), '');
});

test('owner-note math pattern (synthetic) is fixed by the result path and AIM-free summaries too', async () => {
  const detail = ['### 熱擴散', '', '熱擴散係數 \\(\\alpha\\) 由 \\(k\\)、\\(\\rho\\)、\\(c_p\\) 決定。', '', '\\[', '\\alpha=\\frac{k}{\\rho c_p}', '\\]', '', '\\[', 'Fo=\\frac{\\alpha t}{L^2}', '\\]', '', '所以 \\(t\\propto L^2/\\alpha\\)。'].join('\n');
  const runtime = { runTask: async () => JSON.stringify({ summary: '擴散時間 \\(t\\propto L^2/\\alpha\\)', detail, suggestions: [], visualReferences: [] }) };
  const service = makeService(runtime, { language: 'zh-TW' });
  const result = await service.askModel({ title: 'T', summary: '', rules: '', detail: '', task: 'X', ancestors: '', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', outputLanguage: 'zh-TW' }, 'gpt-6-luna', 'low');
  assert.ok(result.detail.includes('熱擴散係數 $\\alpha$ 由 $k$、$\\rho$、$c_p$ 決定。'));
  assert.ok(result.detail.includes('$$\n\\alpha=\\frac{k}{\\rho c_p}\n$$'));
  assert.ok(result.detail.includes('$$\nFo=\\frac{\\alpha t}{L^2}\n$$'));
  assert.ok(result.detail.includes('所以 $t\\propto L^2/\\alpha$。'));
  assert.ok(!/\\[[\]()]/.test(result.detail));
  assert.equal(result.summary, '擴散時間 $t\\propto L^2/\\alpha$');
  // A decompose request is not reader-facing and is left as the model wrote it.
  const raw = await service.askModel({ title: 'T', summary: '', rules: '', detail: '', task: 'X', ancestors: '', mode: 'decompose', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', outputLanguage: 'zh-TW' }, 'gpt-6-luna', 'low').catch(() => null);
  if (raw) assert.ok(raw.detail.includes('\\[\n\\alpha'));
});

test('math normalizer keeps escaped link text; a prose regex bracket is a known LaTeX ambiguity', () => {
  const n = normalizeMathDelimiters;
  assert.equal(n('見 \\[link\\](https://example.org) 說明'), '見 \\[link\\](https://example.org) 說明');
  assert.equal(n('\\[\nx\n\\](url)'), '\\[\nx\n\\](url)');
  assert.equal(n('regex `\\[a-z\\]` 在程式碼內'), 'regex `\\[a-z\\]` 在程式碼內');
  // Documented ambiguity: outside code, `\[a-z\]` is read as display math.
  assert.equal(n('regex \\[a-z\\]'), 'regex $$a-z$$');
});

test('AIM interim detail normalizes math delimiters as well as headings', () => {
  const { AimManualFlow } = load('experiences/aim/manual-flow.ts');
  const out = AimManualFlow.prototype.interimDetail.call(null, ['# 標題\n\n速率 \\(k\\)', '', '\\[\nFo=\\frac{\\alpha t}{L^2}\n\\]']);
  assert.equal(out, '### 標題\n\n速率 $k$\n\n$$\nFo=\\frac{\\alpha t}{L^2}\n$$');
});

// Every offline mermaid type Obsidian draws is kept as a mermaid block; anything else, and any unsafe line, is not.
const nodeFs = require('node:fs');
const nodePath = require('node:path');
const { DIAGRAM_TYPES } = load('ai/mermaid-safety.ts');
const repoRoot = nodePath.join(__dirname, '..');
const typesFixture = nodeFs.readFileSync(nodePath.join(repoRoot, 'tests/fixtures/mermaid-types.md'), 'utf8');
const fixtureBlocks = [...typesFixture.matchAll(/^```mermaid\n([\s\S]*?)\n```$/gm)].map(match => match[1].split('\n'));
const fixtureHeader = lines => lines[0].trim().split(/\s/)[0];

test('mermaid types: the safe fixture keeps every block as mermaid, one block per type plus flowchart and graph', () => {
  assert.equal(neutralizeUnsafeMermaid(typesFixture), typesFixture);
  const headers = fixtureBlocks.map(fixtureHeader);
  for (const type of DIAGRAM_TYPES) assert.equal(headers.filter(header => header === type).length, 1, `${type}: exactly one fixture block`);
  for (const header of headers) assert.ok(DIAGRAM_TYPES.includes(header) || header === 'flowchart' || header === 'graph', `${header} is in DIAGRAM_TYPES`);
  assert.ok(headers.includes('flowchart') && headers.includes('graph'));
  assert.equal(headers.length, DIAGRAM_TYPES.length + 2);
});

test('mermaid types: generic unsafe lines neutralize a block of every type', () => {
  const generic = {
    init: ['%%{init: {}}%%'], br: ['A["<br>x"]'], url: ['https://x'], click: ['click A "x"'], style: ['style A fill:red'],
    classDef: ['classDef x fill:red'], shorthand: ['A:::x']
  };
  for (const lines of fixtureBlocks) {
    const [header, ...rest] = lines;
    for (const [name, extra] of Object.entries(generic)) {
      const body = [header, ...rest, ...extra];
      assert.equal(parse('```mermaid\n' + body.join('\n') + '\n```'), '```text\n' + body.join('\n') + '\n```', `${fixtureHeader(lines)} + ${name}`);
    }
    const front = ['---', 'config:', '  theme: dark', '---', header, ...rest];
    assert.equal(parse('```mermaid\n' + front.join('\n') + '\n```'), '```text\n' + front.join('\n') + '\n```', `${fixtureHeader(lines)} + front-matter`);
  }
});

test('mermaid types: type-specific unsafe syntax is neutralized', () => {
  const cases = {
    'sequence link': ['sequenceDiagram', '  link A: x @ /x'],
    'sequence links': ['sequenceDiagram', '  links A: {"x":"/x"}'],
    'sequence properties': ['sequenceDiagram', '  properties A: {"k":"v"}'],
    'sequence details': ['sequenceDiagram', '  details A: /x'],
    'class callback': ['classDiagram', '  A : x', '  callback A "fn"'],
    'class cssClass': ['classDiagram', '  A : x', '  cssClass "A" x'],
    'class interface': ['classDiagram', '  <<interface>> A'],
    'class body': ['classDiagram', '  class A {', '    x', '  }'],
    'gantt click call': ['gantt', '  dateFormat YYYY-MM-DD', '  a : a1, 2026-01-01, 1d', '  click a call fn()'],
    'gantt click href': ['gantt', '  dateFormat YYYY-MM-DD', '  a : a1, 2026-01-01, 1d', '  click a href "/x"'],
    'C4 link': ['C4Context', '  Person(a, "A", $link="/x")'],
    'C4 sprite': ['C4Context', '  Person(a, "A", $sprite="x")'],
    'C4 tags': ['C4Context', '  Person(a, "A", $tags="x")'],
    'C4 style': ['C4Context', '  Person(a, "A")', '  UpdateElementStyle(a, $bgColor="red")'],
    'C4 tag': ['C4Context', '  AddElementTag("x", $bgColor="red")'],
    'mindmap icon': ['mindmap', '  root', '    a', '    ::icon(fa fa-book)'],
    'quadrant point style': ['quadrantChart', '  x-axis "a" --> "b"', '  Point A: [0.3, 0.6] radius: 10, color: #ff0000'],
    'kanban metadata': ['kanban', '  todo', '    t1[任務]@{ ticket: 1 }']
  };
  for (const [name, body] of Object.entries(cases)) {
    assert.equal(parse('```mermaid\n' + body.join('\n') + '\n```'), '```text\n' + body.join('\n') + '\n```', name);
  }
});

test('mermaid types: unknown or near-miss headers are neutralized', () => {
  for (const header of ['hello', 'Pie', 'pie-chart', 'flowchart-elk TD', 'zenuml', 'info', 'xychart', 'sankey', 'Timeline', 'flowchart FOO']) {
    const body = [header, '  A --> B'];
    assert.equal(parse('```mermaid\n' + body.join('\n') + '\n```'), '```text\n' + body.join('\n') + '\n```', header);
  }
});

test('mermaid types: the prompt bullets name only types the sanitizer keeps', () => {
  const plain = new Set(['timeline', 'gantt', 'pie', 'mindmap']);
  for (const [lang, marker] of [['zh', '- 圖表：'], ['en', '- Diagrams:']]) {
    const text = nodeFs.readFileSync(nodePath.join(repoRoot, `core/steps/_shared/obsidian-format.${lang}.md`), 'utf8');
    const bullet = text.split('\n').find(line => line.startsWith(marker));
    assert.ok(bullet, `${lang}: diagram bullet`);
    const tokens = bullet.match(/[A-Za-z][A-Za-z0-9-]*/g).filter(token => /^[a-z]+[A-Z]|-beta$|-v2$/.test(token) || plain.has(token));
    assert.ok(tokens.length >= 8, `${lang}: bullet names several types`);
    for (const token of tokens) assert.ok(DIAGRAM_TYPES.includes(token), `${lang}: ${token} is in DIAGRAM_TYPES`);
    for (const token of ['flowchart', 'sequenceDiagram', 'xychart-beta', 'sankey-beta']) assert.ok(bullet.includes(token), `${lang}: ${token}`);
  }
});
