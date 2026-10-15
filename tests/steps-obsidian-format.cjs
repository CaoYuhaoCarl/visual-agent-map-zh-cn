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
