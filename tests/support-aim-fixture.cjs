// Deterministic in-memory AIM fixture shared by the W0 prompt snapshots and the fingerprint pinned-value tests.
// It mirrors the fixture in tests/aim-research-pipeline.cjs (kept separate so that file stays untouched) and adds `depth`
// extra answered ancestors so a branch can reach the answered-question floor without random identifiers.
const vm = require('node:vm');
const { buildSync } = require('./build.cjs');

function loadModule(file) {
  const module = { exports: {} };
  vm.runInNewContext(buildSync({ entryPoints: [file], external: ['obsidian'] }).outputFiles[0].text, { module, exports: module.exports, require, console, AbortController, setTimeout, clearTimeout });
  return module.exports;
}
const { researchContentHash } = loadModule('experiences/aim/research-plan.ts');
const { AimManualFlow } = loadModule('experiences/aim/manual-flow.ts');
const { AimRunStore } = loadModule('experiences/aim/research-run-store.ts');
const { parseMap, serializeMap } = loadModule('map-model.ts');

const plain = value => JSON.parse(JSON.stringify(value));
const answer = (summary, detail = summary) => ({ summary, detail, suggestions: [], visualReferences: [] });
const target = (id, dependsOn = []) => ({ id, title: `Target ${id}`, task: `Find evidence for ${id}`, expectedValue: `Resolve ${id}`, action: 'research', dependsOn });
const phaseOf = context => context.task.match(/aim-phase: ([a-z-]+)/)?.[1];
const reuseTarget = source => ({ ...target('reuse'), title: 'Applicable method', action: 'reuse', source, rationale: 'The method is already established', validity: { conditionKeys: ['weight'], reason: 'Weight remains the same and source is current' } });
const usableAudit = answer('Applicable', '<!-- aim-reuse {"usable":true,"rationale":"The full evidence supports this method","conditionKeys":["weight"],"validity":"Dated method remains applicable to this weight"} -->');

function fixture({ plan = [target('a')], ancestor = true, depth = 0, conditions = { weight: '1kg' }, sourceDetail = 'Research status: search completed\nFull method, limits and dated source https://example.org/method' } = {}) {
  let sequence = 0;
  const node = (id, kind, parentId = null) => ({ id, path: `${id}.md`, parentId, aimKind: kind, x: 0, y: 0, collapsed: false });
  const branch = (id, questionNodeId, parentBranchId, supplied) => ({ id, questionNodeId, parentBranchId, answerSnapshot: { selections: [], freeText: 'Known' }, inputSnapshot: { topic: 'Prepare a meal', conditions: supplied, upstreamResults: [] }, createdAt: '2026-10-09T00:00:00.000Z', results: [] });
  const map = { version: 1, id: 'research-fixture', title: 'Prepare a meal', nodes: [node('topic', 'topic'), node('question', 'question', 'topic')], viewport: { x: 0, y: 0, zoom: 1 }, aim: { version: 1, branches: [], runs: [], pendingCommits: [] } };
  let state = map;
  const notes = new Map([['topic.md', answer('Prepare a meal', 'Find a feasible method with a dated source')], ['question.md', answer('Preferred method?', 'Use the supplied condition')]]);
  for (const [path, value] of notes) notes.set(path, { ...value, title: path, status: 'completed' });
  const current = branch('current', 'question', ancestor ? 'ancestor' : null, conditions);
  if (plan !== undefined) current.researchPlan = plain(plan);
  state.aim.branches.push(current);
  let source;
  if (ancestor) {
    const prior = branch('ancestor', 'prior-question', depth ? 'ancestor-1' : null, { weight: '1kg' });
    state.nodes.push(node('prior-question', 'question', 'topic'), node('source', 'research', 'prior-question'));
    notes.set('prior-question.md', { title: 'Prior question', ...answer('Weight?', 'Prior user condition'), status: 'completed' });
    notes.set('source.md', { title: 'Original method', ...answer('A fully supported method', sourceDetail), status: 'completed' });
    const ref = { resultId: 'original-result', runId: 'original-run', attemptId: 'attempt-1', nodeId: 'source', notePath: 'source.md', version: 1, kind: 'research' };
    prior.results.push(ref); state.aim.branches.push(prior);
    state.aim.runs.push({ id: 'original-run', branchId: prior.id, currentAttemptId: 'attempt-1', attempts: [{ id: 'attempt-1', inputSnapshotHash: 'prior', status: 'completed' }] });
    source = { branchId: prior.id, resultId: ref.resultId, notePath: ref.notePath, version: ref.version, contentHash: researchContentHash(notes.get(ref.notePath)) };
    for (let level = depth; level >= 1; level--) {
      const id = `ancestor-${level}`;
      state.nodes.push(node(`${id}-question`, 'question', 'topic'));
      notes.set(`${id}-question.md`, { title: `Earlier question ${level}`, ...answer(`Earlier question ${level}?`, `Earlier user condition ${level}`), status: 'completed' });
      state.aim.branches.push(branch(id, `${id}-question`, level > 1 ? `ancestor-${level - 1}` : null, { weight: '1kg' }));
    }
  }
  const repository = {
    settings: { language: 'en' }, readMap: async () => plain(state), saveMap: async (_path, value) => { state = parseMap(serializeMap(value)); },
    readNote: async path => { if (!notes.has(path)) throw new Error(`Missing ${path}`); return plain(notes.get(path)); },
    updateNote: async (path, patch) => { if (!notes.has(path)) throw new Error(`Missing ${path}`); notes.set(path, { ...notes.get(path), ...plain(patch) }); },
    createNoteAt: async (title, _model, _doc, _path, _origin, notePath, _id, patch) => { notes.set(notePath, { title, summary: '', detail: '', status: 'idea', ...plain(patch) }); },
    topicFolder: () => 'Notes', topicRoot: () => '.', ensureTopicFolders: async () => {}, unique: (folder, title) => `${folder}/${++sequence}-${title}.md`, hasNote: path => notes.has(path)
  };
  const store = new AimRunStore(repository, () => `fixture-${++sequence}`, () => '2026-10-09T00:00:00.000Z');
  return { repository, store, notes, source, current, getMap: () => plain(state), setPlan: async value => { const next = plain(state); if (value === undefined) delete next.aim.branches[0].researchPlan; else next.aim.branches[0].researchPlan = value; await repository.saveMap('Map.md', next); } };
}
module.exports = { fixture, target, reuseTarget, usableAudit, answer, phaseOf, plain, AimManualFlow, AimRunStore };
