const assert = require('node:assert/strict');
const { test, load, plain, obsidian } = require('../support.cjs');
const rawApi = load('experiences/visual-map/outline-import.ts', { obsidian });
const api = { ...rawApi, parseOutline: input => plain(rawApi.parseOutline(input)) };
const titles = parse => parse.nodes.map(node => `${'>'.repeat(node.level)}${node.title}@${node.parent ?? '-'}`);
const keys = issues => issues.map(issue => `${issue.key}:${issue.line}`);

test('outline: standard levels, parents by position, line numbers', () => {
  const parse = api.parseOutline('# Trip\n## Food\n### Breakfast\n## Food\n### Dinner\n');
  assert.deepEqual(titles(parse), ['>Trip@-', '>>Food@0', '>>>Breakfast@1', '>>Food@0', '>>>Dinner@3']);
  assert.deepEqual(parse.nodes.map(node => node.line), [1, 2, 3, 4, 5]);
  assert.deepEqual(keys(parse.errors), []);
  assert.deepEqual(keys(parse.warnings), ['ui.outline_warning_duplicate_title:4']);
});

test('outline: preprocessing — CRLF, CR, BOM and front matter', () => {
  assert.deepEqual(titles(api.parseOutline('﻿# A\r\n## B\r## C')), ['>A@-', '>>B@0', '>>C@0']);
  const fm = api.parseOutline('---\ntitle: x\n# comment\n---\n# Real');
  assert.deepEqual(titles(fm), ['>Real@-']);
});

test('outline: lines that are not headings', () => {
  const text = [
    '# Root',
    '```js', '# in fence', '```',
    '~~~', '## tilde fence', '~~~',
    '<!--', '# in comment', '-->',
    '%%', '# in obsidian comment', '%%',
    '$$', '# in math', '$$',
    '    # indented code',
    '> ## quote', '- # list', '1. # ordered',
    'Setext', '===',
    '#tag', '#x',
    '## Child'
  ].join('\n');
  const parse = api.parseOutline(text);
  assert.deepEqual(titles(parse), ['>Root@-', '>>Child@0']);
});

test('outline: a fence closes only with the same character, enough length and no info string', () => {
  assert.deepEqual(titles(api.parseOutline('# R\n```\n# a\n~~~\n# b\n```\n## C')), ['>R@-', '>>C@0']);
  assert.deepEqual(titles(api.parseOutline('# R\n```js\n# a\n```js\n# b\n```\n## C')), ['>R@-', '>>C@0']);
  assert.deepEqual(titles(api.parseOutline('# R\n```\n## never closed')), ['>R@-']);
});

test('outline: the whole outline wrapped in a ```markdown fence is unwrapped', () => {
  assert.deepEqual(titles(api.parseOutline('```markdown\n# R\n## A\n```')), ['>R@-', '>>A@0']);
  assert.deepEqual(titles(api.parseOutline('Here is the outline:\n\n```md\n# R\n## A\n```\nHope it helps.')), ['>R@-', '>>A@0']);
});

test('outline: heading text', () => {
  assert.deepEqual(api.parseOutline('#\tTabbed').nodes[0].title, 'Tabbed');
  assert.equal(api.parseOutline('# Title ##').nodes[0].title, 'Title');
  assert.equal(api.parseOutline('# C#').nodes[0].title, 'C#');
  assert.equal(api.parseOutline('# Foo \\#').nodes[0].title, 'Foo #');
  assert.equal(api.outlineTitle('**Bold** and `code` and [[Note|Alias]] and [[Plain]] and [text](https://x.y)'), 'Bold and code and Alias and Plain and text');
  assert.equal(api.outlineTitle('snake_case_name and *em* and _em_'), 'snake_case_name and em and em');
  assert.equal(api.outlineTitle('\\*literal\\*'), '*literal*');
  assert.deepEqual(keys(api.parseOutline('# ##').errors), ['ui.outline_error_empty_title:1']);
  assert.deepEqual(keys(api.parseOutline('# R\n#').errors), ['ui.outline_error_empty_title:2']);
  assert.deepEqual(keys(api.parseOutline(`# ${'x'.repeat(201)}`).errors), ['ui.outline_error_title_too_long:1']);
  assert.deepEqual(keys(api.parseOutline(`# ${'字'.repeat(200)}`).errors), []);
});

test('outline: structure errors and warnings', () => {
  assert.deepEqual(keys(api.parseOutline('just text').errors), ['ui.outline_error_no_headings:0']);
  assert.deepEqual(keys(api.parseOutline('# A\n# B').errors), ['ui.outline_error_multiple_roots:2']);
  assert.deepEqual(keys(api.parseOutline('## A\n# B').errors), ['ui.outline_error_multiple_roots:2']);
  assert.deepEqual(titles(api.parseOutline('## A\n### B')), ['>>A@-', '>>>B@0']);
  const skipped = api.parseOutline('# A\n## B\n#### D');
  assert.deepEqual(titles(skipped), ['>A@-', '>>B@0', '>>>>D@1']);
  assert.deepEqual(keys(skipped.warnings), ['ui.outline_warning_skipped_level:3']);
  assert.deepEqual(keys(api.parseOutline('# R\n## A/B\n## A:B').warnings), ['ui.outline_warning_filename_collision:3']);
  assert.deepEqual(keys(api.parseOutline('<!-- visual-agent-map:detail:start -->\n# R').errors), ['ui.outline_error_vam_note:1']);
});

test('outline: same-name headings keep their own children', () => {
  const parse = api.parseOutline('# R\n## Food\n### A\n## Food\n### B');
  assert.deepEqual(parse.nodes.map(node => [node.title, node.parent]), [['R', null], ['Food', 0], ['A', 1], ['Food', 0], ['B', 3]]);
});

test('outline: node limit includes the root', () => {
  const lines = n => ['# R', ...Array.from({ length: n - 1 }, (_, i) => `## T${i}`)].join('\n');
  assert.deepEqual(keys(api.parseOutline(lines(100)).errors), []);
  assert.deepEqual(keys(api.parseOutline(lines(101)).errors), ['ui.outline_error_too_many_nodes:0']);
});

test('outline: every line is accounted for exactly once; text around headings is counted, not lost', () => {
  const text = 'Intro sentence\n\n# R\nSome text\n\n## A\n```\ncode\n```\n- item';
  const parse = api.parseOutline(text);
  assert.equal(parse.headingLines + parse.ignoredLines + parse.blankLines + parse.skippedLines, parse.totalLines);
  assert.equal(parse.ignoredLines, 3);
  assert.deepEqual(keys(parse.warnings), ['ui.outline_warning_ignored_lines:0']);
});

test('outline: a 5,000-line note parses quickly', () => {
  const big = ['# R', ...Array.from({ length: 4999 }, (_, i) => (i % 50 === 0 ? `## H${i}` : `text ${i}`))].join('\n');
  const started = Date.now();
  const parse = api.parseOutline(big);
  assert.ok(Date.now() - started < 200);
  assert.equal(parse.nodes.length, 101);
});

test('outline: every Markdown file in the repository parses without throwing and accounts for every line', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const root = path.join(__dirname, '..', '..'); const files = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith('.md')) files.push(full); } };
  walk(root);
  assert.ok(files.length > 20);
  for (const file of files) {
    const parse = api.parseOutline(fs.readFileSync(file, 'utf8'));
    assert.equal(parse.headingLines + parse.ignoredLines + parse.blankLines + parse.skippedLines, parse.totalLines, file);
  }
});

test('outline: only a markdown/md fence or a leading bare fence is unwrapped; other fenced blocks stay code', () => {
  const bash = api.parseOutline('```\n# just a bash comment\necho hi\n```');
  assert.equal(bash.nodes.length, 0);
  assert.deepEqual(keys(bash.errors), ['ui.outline_error_no_headings:0']);
  assert.equal(api.parseOutline('Intro\n```bash\n# comment\n```').nodes.length, 0);
  assert.equal(api.parseOutline('Intro\n```\n# comment\n```').nodes.length, 0);
  assert.deepEqual(titles(api.parseOutline('```js\ncode\n```\n```md\n# R\n## A\n```')), ['>R@-', '>>A@0']);
  assert.deepEqual(titles(api.parseOutline('\n```\n# R\n## A\n```')), ['>R@-', '>>A@0']);
  assert.deepEqual(api.parseOutline('Intro\n```md\n# R\n## A\n```').nodes.map(node => node.line), [3, 4]);
});
