// Architecture rules for the Step Runner (tests/steps-*.cjs files are discovered by `npm run test:unit`).
//  1. A model call can only be sent from a PreparedStep, and prepared.parse uses the input it was rendered from.
//  2. Natural-language string literals above a length threshold must be in an explicit allowlist, so prompt text
//     lives in step templates (Markdown) instead of TypeScript. Directories and allowlist entries come from
//     tests/literal-scan/*.json, one file per area, so parallel work never edits the same file.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const { load, root } = require('./support-replay.cjs');

const { prepareStep, StepRunner } = load('core/step-runner.ts');

function fakeStep(overrides = {}) {
  return { id: 'test.step', version: 2, render: input => `prompt:${input.name}`, parse: (raw, input) => ({ raw, input }), ...overrides };
}
function recordingProvider(reply = 'reply') {
  const calls = [];
  return { calls, complete: async call => { calls.push(call); return reply; } };
}

test('send() accepts only a PreparedStep: strings and look-alike objects are refused before the provider is called', async () => {
  const provider = recordingProvider(), runner = new StepRunner(provider), step = fakeStep();
  await assert.rejects(runner.send('arbitrary prompt', {}), /requires a step made by prepareStep/);
  await assert.rejects(runner.send({ step, input: { name: 'n' }, prompt: 'forged', parse: () => null }, {}), /requires a step made by prepareStep/);
  await assert.rejects(runner.send(undefined, {}), /requires a step made by prepareStep/);
  assert.equal(provider.calls.length, 0);
});

test('compile time: TypeScript rejects send() with a string and accepts it with a prepared step', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vam-send-type-'));
  const file = path.join(directory, 'probe.ts');
  const runnerModule = path.join(root, 'core', 'step-runner');
  fs.writeFileSync(file, [
    `import { StepRunner, prepareStep, type StepDefinition } from ${JSON.stringify(runnerModule)};`,
    'declare const step: StepDefinition<{ name: string }, string>;',
    'declare const runner: StepRunner<object>;',
    'void runner.send(prepareStep(step, { name: "n" }), {});',
    'void runner.send("a plain prompt string", {});',
    'void runner.send({ step, input: { name: "n" }, prompt: "p", parse: () => "" }, {});'
  ].join('\n'));
  const program = ts.createProgram([file], { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] });
  const lines = ts.getPreEmitDiagnostics(program).filter(item => item.file && path.resolve(item.file.fileName) === file).map(item => item.file.getLineAndCharacterOfPosition(item.start).line + 1);
  assert.deepEqual(lines, [5, 6], 'only the string call (line 5) and the forged object (line 6) are type errors; the prepared call (line 4) compiles');
});

test('prepareStep binds the input: send uses the prepared prompt and label, and parse sees the same input', async () => {
  const input = { name: 'n' }, provider = recordingProvider('raw reply'), step = fakeStep({ schema: { type: 'object' } });
  const prepared = prepareStep(step, input);
  assert.equal(prepared.prompt, 'prompt:n'); assert.equal(prepared.input, input); assert.equal(prepared.step, step);
  assert.ok(Object.isFrozen(prepared));
  const sent = await new StepRunner(provider).send(prepared, { signal: 'controls' });
  assert.deepEqual({ ...sent }, { prompt: 'prompt:n', raw: 'raw reply' });
  assert.equal(provider.calls[0].stepId, 'test.step'); assert.equal(provider.calls[0].version, 2);
  assert.equal(provider.calls[0].prompt, 'prompt:n'); assert.deepEqual({ ...provider.calls[0].schema }, { type: 'object' });
  const parsed = prepared.parse(sent.raw);
  assert.equal(parsed.raw, 'raw reply'); assert.equal(parsed.input, input, 'parse receives the identical input object');
  const events = [];
  assert.throws(() => prepareStep(fakeStep({ policy: () => { events.push('policy'); throw new Error('refused'); } }), input), /refused/);
  assert.deepEqual(events, ['policy']);
});

// ---- string literal scan ----
const WEIGHTED_MINIMUM = 40; // a CJK character counts 2, any other character 1
const CJK = /[㐀-鿿]/;
const isNaturalLanguage = text => CJK.test(text) || text.split(/\s+/).filter(Boolean).length >= 5;
const weightedLength = text => [...text].reduce((total, character) => total + (CJK.test(character) ? 2 : 1), 0);
/** Message text passed to `new XError(...)`, `XError(...)` or a `throw` is an error message, not prompt text. */
function insideErrorConstruction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isThrowStatement(current)) return true;
    if ((ts.isNewExpression(current) || ts.isCallExpression(current)) && /Error$/.test(current.expression.getText())) return true;
  }
  return false;
}
function typescriptFiles(directory, found = []) {
  if (fs.statSync(directory).isFile()) {
    if (directory.endsWith('.ts') && !directory.endsWith('.d.ts')) found.push(directory);
    return found;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) typescriptFiles(file, found);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) found.push(file);
  }
  return found;
}
/** Every natural-language literal of at least WEIGHTED_MINIMUM characters outside an Error construction. */
function longLiterals(directory) {
  const found = [];
  for (const file of typescriptFiles(directory)) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2020, true);
    const visit = node => {
      const isText = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
      if (isText && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) {
        const text = node.text.trim();
        if (weightedLength(text) >= WEIGHTED_MINIMUM && isNaturalLanguage(text) && !insideErrorConstruction(node))
          found.push({ file: path.relative(root, file).split(path.sep).join('/'), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}
/** Split literals into allowed and unlisted; an entry with `text` matches by literal prefix, without it the whole file. */
function applyAllowlist(literals, allow) {
  const used = new Set(), unlisted = [];
  for (const literal of literals) {
    const index = allow.findIndex(entry => entry.file === literal.file && (entry.text === undefined || literal.text.startsWith(entry.text)));
    if (index < 0) unlisted.push(literal); else used.add(index);
  }
  return { unlisted, unused: allow.filter((_entry, index) => !used.has(index)) };
}

// An entry in `dirs` may also name a single .ts file, for areas whose neighbours belong to other work.
const configurations = fs.readdirSync(path.join(__dirname, 'literal-scan')).filter(name => name.endsWith('.json')).sort()
  .map(name => ({ name, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'literal-scan', name), 'utf8')) }));

test('the literal scan finds long natural-language literals, skips error messages and applies the allowlist', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vam-literal-scan-'));
  const file = path.join(directory, 'sample.ts');
  fs.writeFileSync(file, [
    'export const short = "Short label";',
    'export const prompt = "Summarize the following notes and return only a JSON object with a title field";',
    'export const chinese = "請整理以下內容並以繁體中文回答，保留所有條件與限制。";',
    'export const identifier = "experiences/coffee-tables/steps/convergence/prompt.en.md.something-long-without-spaces";',
    'export function fail() { throw new Error("This is a long error message that explains what went wrong clearly"); }',
    'export const wrapped = new RangeError(`A long template error message that spans ${1} several words in a row`);'
  ].join('\n'));
  const found = longLiterals(directory);
  assert.deepEqual(found.map(item => item.line), [2, 3]);
  const relative = path.relative(root, file).split(path.sep).join('/');
  assert.deepEqual(applyAllowlist(found, [{ file: relative, text: 'Summarize the following' }, { file: relative, text: '請整理' }]), { unlisted: [], unused: [] });
  const partial = applyAllowlist(found, [{ file: relative, text: 'Summarize the following' }, { file: relative, text: 'never matches' }]);
  assert.deepEqual(partial.unlisted.map(item => item.line), [3]);
  assert.deepEqual(partial.unused.map(item => item.text), ['never matches']);
  assert.deepEqual(applyAllowlist(found, [{ file: relative }]), { unlisted: [], unused: [] }, 'an entry without text allows the whole file');
});

test('scan configuration is well formed and the scanned directories are not empty', () => {
  assert.ok(configurations.length >= 1);
  for (const configuration of configurations) {
    assert.ok(Array.isArray(configuration.dirs) && configuration.dirs.length, `${configuration.name}: dirs`);
    for (const directory of configuration.dirs) assert.ok(typescriptFiles(path.join(root, directory)).length > 0, `${configuration.name}: ${directory} has no TypeScript files`);
    for (const entry of configuration.allow) {
      assert.ok(typeof entry.file === 'string' && entry.file && typeof entry.reason === 'string' && entry.reason.trim().length >= 20, `${configuration.name}: every allowlist entry needs a file and a reason (${JSON.stringify(entry)})`);
      assert.ok(entry.text === undefined || (typeof entry.text === 'string' && entry.text), `${configuration.name}: text must be a non-empty prefix when present`);
      assert.ok(configuration.dirs.some(directory => entry.file === directory || entry.file.startsWith(`${directory}/`)), `${configuration.name}: ${entry.file} is outside the scanned directories`);
    }
  }
});

for (const configuration of configurations) {
  test(`literal scan ${configuration.name}: prompt text stays in step templates; everything else is allowlisted with a reason`, () => {
    const literals = configuration.dirs.flatMap(directory => longLiterals(path.join(root, directory)));
    const { unlisted, unused } = applyAllowlist(literals, configuration.allow);
    assert.deepEqual(unlisted.map(item => `${item.file}:${item.line} ${JSON.stringify(item.text.slice(0, 60))}`), [], `natural-language literal of ${WEIGHTED_MINIMUM}+ characters outside tests/literal-scan/${configuration.name}: move prompt text to a step template, or allowlist it with a reason`);
    assert.deepEqual(unused.map(entry => `${entry.file} ${entry.text ?? '(whole file)'}`), [], 'allowlist entries that match nothing must be removed');
  });
}

test('Coffee shared fragments: every language pair exists and each fragment is used by a step', () => {
  const directory = path.join(root, 'experiences', 'coffee-tables', 'steps', '_shared');
  const names = fs.readdirSync(directory);
  const pairs = names.filter(name => /\.(zh|en)\.md$/.test(name)).map(name => name.replace(/\.(zh|en)\.md$/, ''));
  for (const base of new Set(pairs)) for (const language of ['zh', 'zh-CN', 'en']) assert.ok(names.includes(`${base}.${language}.md`), `${base}.${language}.md is missing`);
  const fragments = fs.readFileSync(path.join(directory, 'fragments.ts'), 'utf8');
  for (const name of names.filter(item => item.endsWith('.md'))) assert.ok(fragments.includes(`./${name}`), `${name} is not imported by fragments.ts`);
});
