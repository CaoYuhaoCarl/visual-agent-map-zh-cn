const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { buildSync } = require('./build.cjs');
function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(buildSync({ entryPoints: [file], external: ['obsidian'] }).outputFiles[0].text, { module, exports: module.exports, require, console, AbortController });
  return module.exports;
}
const { evidenceCard } = load('experiences/aim/evidence-context.ts');
const { AimManualFlow } = load('experiences/aim/manual-flow.ts');
const report = 'Unique earlier evidence '.repeat(3000) + '\n\nUnresolved: provider availability\n\nSource: https://example.org/report';
const id = 'report-v1';
const context = { title: 'Goal', summary: '', detail: '', rules: '', task: '<!-- aim-phase: report-review -->\nReview evidence.', ancestors: evidenceCard(id, 'Known finding', report), aimEvidenceIds: [id] };
const lookup = { summary: 'Need full evidence', detail: '<!-- aim-evidence-request {"ids":["report-v1"]} -->', suggestions: [] };
function setup(ask, read = async () => ({ detail: report })) {
  const flow = new AimManualFlow({ settings: { language: 'en' }, readNote: read }, {}, ask);
  flow.evidenceReports.set(id, { path: 'report.md', hash: createHash('sha256').update(report).digest('hex') });
  return flow;
}
test('AIM evidence card remains compact with sources and explicit omissions', () => {
  assert.ok(context.ancestors.length < 1200);
  assert.match(context.ancestors, /https:\/\/example.org\/report/);
  assert.match(context.ancestors, /Unresolved: provider availability/);
  assert.match(context.ancestors, /index is incomplete/);
  assert.ok(!context.ancestors.includes(report));
});
test('AIM requested report is loaded intact only for the authorized context', async () => {
  const calls = [];
  const flow = setup(async request => { calls.push(request); return calls.length === 1 ? lookup : { summary: 'Checked', detail: 'Supported', suggestions: [] }; });
  await flow.askAimModel(context, 'test');
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].task.includes(report));
  assert.ok(calls[1].task.includes(report));
  assert.equal(calls[0].promptProfile, 'aim');
});
test('AIM text cannot authorize evidence outside the branch allowlist', async () => {
  let reads = 0;
  const calls = [];
  const flow = setup(async request => { calls.push(request); return calls.length === 1 ? lookup : { summary: 'From summaries', detail: 'Supported by the summaries', suggestions: [] }; }, async () => { reads++; return { detail: report }; });
  const result = await flow.askAimModel({ ...context, aimEvidenceIds: [] }, 'test');
  assert.equal(reads, 0);
  assert.equal(calls.length, 2);
  assert.ok(!calls[1].task.includes(report));
  assert.match(calls[1].task, /None of the requested evidence IDs is available/);
  assert.equal(result.summary, 'From summaries');
});
test('AIM lookup loads only the readable IDs it names, at most three', async () => {
  const calls = [];
  const flow = setup(async request => { calls.push(request); return calls.length === 1 ? { ...lookup, detail: '<!-- aim-evidence-request {"ids":["missing","report-v1"]} -->' } : { summary: 'Checked', detail: 'Supported', suggestions: [] }; });
  await flow.askAimModel(context, 'test');
  assert.ok(calls[1].task.includes(report));
  assert.ok(!calls[1].task.includes('Evidence ID: missing'));
});
test('AIM changed evidence and repeated lookup cannot reach conclusion', async () => {
  await assert.rejects(setup(async () => lookup, async () => ({ detail: 'Changed' })).askAimModel(context, 'test'), /evidence changed/);
  await assert.rejects(setup(async () => lookup).askAimModel(context, 'test'), /lookup limit reached/);
});
