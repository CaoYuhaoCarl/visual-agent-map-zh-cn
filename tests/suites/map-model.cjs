const assert = require('node:assert/strict');
const { test, core, layout, node, map, plain, tree } = require('../support.cjs');
test('rejects self links, descendant links, missing parent; allows detaching and reparenting', () => {
  assert.equal(core.canParent(tree(), 'a', 'a'), false);
  assert.equal(core.canParent(tree(), 'a', 'c'), false);
  assert.equal(core.canParent(tree(), 'b', 'missing'), false);
  assert.equal(core.canParent(tree(), 'b', 'd'), true);
  assert.equal(core.canParent(tree(), 'b', null), true);
});
test('collapse hides every descendant, not unrelated roots; nested collapse persists', () => {
  const nodes = tree(); nodes[0].collapsed = true; nodes[1].collapsed = true;
  assert.deepEqual(Array.from(core.visibleNodes(nodes), n => n.id), ['a', 'd']);
  nodes[0].collapsed = false;
  assert.deepEqual(Array.from(core.visibleNodes(nodes), n => n.id), ['a', 'b', 'd']);
});
test('single removal promotes immediate children but preserves deeper links', () => {
  const result = core.removeNodes(tree(), 'a', false);
  assert.deepEqual(Array.from(result, n => [n.id, n.parentId]), [['b', null], ['c', 'b'], ['d', null]]);
});
test('branch removal removes descendants and leaves other trees intact', () => {
  assert.deepEqual(Array.from(core.removeNodes(tree(), 'a', true), n => n.id), ['d']);
});
test('map round trip retains structure, viewport and collapse', () => {
  const source = map(tree()); source.nodes[1].collapsed = true; source.viewport = { x: -720, y: 83, zoom: .65 };
  assert.deepEqual(plain(core.parseMap(core.serializeMap(source))), source);
});
test('clears stale question convergence links while preserving synthesis convergence', () => {
  const fixture = map([
    { ...node('question'), aimKind: 'question', aimConvergesFromNodeIds: ['research'] },
    { ...node('research', 'question'), aimKind: 'research' },
    { ...node('synthesis', 'question'), aimKind: 'synthesis', aimConvergesFromNodeIds: ['research'] }
  ]);
  assert.equal(core.clearQuestionConvergenceEdges(fixture), true);
  assert.equal(fixture.nodes[0].aimConvergesFromNodeIds, undefined, 'legacy question refs are removed');
  assert.deepEqual(plain(fixture.nodes[2].aimConvergesFromNodeIds), ['research'], 'the synthesis node keeps its dashed link to research');
  assert.equal(core.clearQuestionConvergenceEdges(fixture), false, 'cleanup is idempotent');
  assert.deepEqual(plain(core.parentIdsForNode(fixture.nodes[0])), [], 'renderer never draws a dashed convergence edge into a question');
  assert.deepEqual(plain(core.parentIdsForNode(fixture.nodes[2])), ['question', 'research'], 'synthesis keeps its direct and dashed source edges');
});
test('repairs legacy AIM continuation convergence from preceding saved research only', () => {
  const fixture = map([
    { ...node('q1'), aimKind: 'question', aimConvergesFromNodeIds: ['legacy-wrong-source'] },
    { ...node('r1', 'q1'), aimKind: 'research' },
    { ...node('r2', 'q1'), aimKind: 'research' },
    { ...node('r-default-kind', 'q1'), aimKind: 'research' },
    { ...node('synthesis', 'q1'), aimKind: 'synthesis' },
    { ...node('r-future', 'q1'), aimKind: 'research' },
    { ...node('conclusion', 'q1'), aimKind: 'conclusion', aimConvergesFromNodeIds: ['existing-source'] },
    { ...node('conclusion-missing', 'q1'), aimKind: 'conclusion' },
    { ...node('q-legacy'), aimKind: 'question' },
    { ...node('legacy-synthesis', 'q-legacy'), aimKind: 'synthesis' }
  ]);
  fixture.aim = { version: 1, branches: [
    { id: 'branch-with-reports', questionNodeId: 'q1', parentBranchId: null, answerSnapshot: { selections: [], freeText: 'synthetic' }, inputSnapshot: { topic: 'test', conditions: {}, upstreamResults: [] }, createdAt: '2026-10-09T00:00:00.000Z', results: [
      { resultId: 'r1', runId: 'run', attemptId: 'a1', nodeId: 'r1', notePath: 'r1.md', version: 1, kind: 'research', subtopicId: 'subtopic-1' },
      { resultId: 'r2', runId: 'run', attemptId: 'a1', nodeId: 'r2', notePath: 'r2.md', version: 2, kind: 'research', subtopicId: 'subtopic-2' },
      { resultId: 'legacy-default', runId: 'legacy-run', attemptId: 'a1', nodeId: 'r-default-kind', notePath: 'r-default-kind.md', version: 3, kind: 'research' },
      { resultId: 's', runId: 'run', attemptId: 'a1', nodeId: 'synthesis', notePath: 's.md', version: 4, kind: 'synthesis' },
      { resultId: 'future', runId: 'run', attemptId: 'a2', nodeId: 'r-future', notePath: 'future.md', version: 5, kind: 'research', subtopicId: 'subtopic-3' },
      { resultId: 'c', runId: 'run', attemptId: 'a2', nodeId: 'conclusion', notePath: 'c.md', version: 6, kind: 'conclusion' },
      { resultId: 'cm', runId: 'run', attemptId: 'a2', nodeId: 'conclusion-missing', notePath: 'cm.md', version: 7, kind: 'conclusion' }
    ] },
    { id: 'legacy-branch', questionNodeId: 'q-legacy', parentBranchId: null, answerSnapshot: { selections: [], freeText: 'synthetic' }, inputSnapshot: { topic: 'legacy', conditions: {}, upstreamResults: [] }, createdAt: '2026-10-09T00:00:00.000Z', results: [
      { resultId: 'legacy-synthesis', runId: 'legacy-run', attemptId: 'a1', nodeId: 'legacy-synthesis', notePath: 'legacy.md', version: 1, kind: 'synthesis' }
    ] }
  ], runs: [], pendingCommits: [] };
  assert.equal(core.repairAimResultConvergence(fixture), true);
  assert.equal(fixture.nodes.find(item => item.id === 'synthesis').parentId, 'r2');
  assert.deepEqual(plain(fixture.nodes.find(item => item.id === 'synthesis').aimConvergesFromNodeIds), ['r1', 'r2'], 'later reports are excluded from this saved synthesis');
  assert.deepEqual(plain(fixture.nodes.find(item => item.id === 'conclusion').aimConvergesFromNodeIds), ['existing-source'], 'existing convergence edges are not rewritten');
  assert.equal(fixture.nodes.find(item => item.id === 'conclusion').parentId, 'q1');
  assert.equal(fixture.nodes.find(item => item.id === 'conclusion-missing').parentId, 'r-future');
  assert.deepEqual(plain(fixture.nodes.find(item => item.id === 'conclusion-missing').aimConvergesFromNodeIds), ['r1', 'r2', 'r-future']);
  assert.deepEqual(plain(fixture.nodes.find(item => item.id === 'q1').aimConvergesFromNodeIds), ['legacy-wrong-source'], 'question nodes are not modified');
  assert.equal(fixture.nodes.find(item => item.id === 'legacy-synthesis').parentId, 'q-legacy', 'legacy branch without saved research remains unchanged');
  assert.equal(core.repairAimResultConvergence(fixture), false, 'repair is idempotent');
});
test('AIM rejects a relocated result node when its branch reference still points to the source Vault', () => {
  const malformed = {
    version: 1, id: 'aim-fixture-map', title: 'Planner ask-user follow-up UI fixture',
    nodes: [
      { id: '8e541501-7636-41a3-8bd8-41650937236d', path: 'Agent Workspace/Topics/Planner ask-user follow-up UI fixture/Notes/如何用鑄鐵鍋在家煎出自己喜歡的牛排熟度？.md', parentId: null, x: 80, y: 80, collapsed: false, aimKind: 'topic' },
      { id: '5d756d6e-d119-43ac-b611-54353b574aa4', path: 'Agent Workspace/Topics/Planner ask-user follow-up UI fixture/Notes/問題 · 你希望牛排煎到哪種熟度？.md', parentId: '8e541501-7636-41a3-8bd8-41650937236d', x: 440, y: 80, collapsed: false, aimKind: 'question', aimQuestion: { requestId: '282bceaa-8fb9-47e3-abc7-dd2ce293e705', parentBranchId: null, options: [{ id: 'rare', label: '三分熟（中心偏紅）' }, { id: 'medium', label: '五分熟' }], allowMultiple: true, allowFreeText: true } },
      { id: 'e0a25570-f0f1-47d2-a4e5-3c645cde6036', path: 'Agent Workspace/Topics/Planner ask-user follow-up UI fixture/Notes/你希望牛排煎到哪種熟度？・回答研究.md', parentId: '5d756d6e-d119-43ac-b611-54353b574aa4', x: 800, y: 80, collapsed: false, aimKind: 'research' }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    aim: {
      version: 1, branches: [{ id: '5719e17c-fced-46e5-947c-410dd73fbed9', submissionId: '7eb4a718-f3e7-462e-bda4-439daac43030', questionNodeId: '5d756d6e-d119-43ac-b611-54353b574aa4', parentBranchId: null, answerSnapshot: { selections: ['rare'], freeText: 'Synthetic UI fixture.' }, inputSnapshot: { topic: '如何用鑄鐵鍋在家煎出自己喜歡的牛排熟度？', conditions: { '你希望牛排煎到哪種熟度？': 'Synthetic answer.' }, upstreamResults: [] }, createdAt: '2026-10-05T05:37:21.519Z', results: [{ resultId: 'result-f042d30c-c76a-4bd1-8912-990a14ef1f2f-attempt-1', runId: 'f042d30c-c76a-4bd1-8912-990a14ef1f2f', attemptId: 'attempt-1', nodeId: 'e0a25570-f0f1-47d2-a4e5-3c645cde6036', notePath: 'Agent Workspace/Topics/如何用鑄鐵鍋在家煎出自己喜歡的牛排熟度？/Notes/你希望牛排煎到哪種熟度？・回答研究.md', version: 1 }] }],
      runs: [{ id: 'f042d30c-c76a-4bd1-8912-990a14ef1f2f', branchId: '5719e17c-fced-46e5-947c-410dd73fbed9', currentAttemptId: 'attempt-1', attempts: [{ id: 'attempt-1', inputSnapshotHash: 'e1d8c45129677f8003c8233e371fba8722032a0e367b8e02f9ab09423c57a44f', status: 'completed' }] }],
      pendingCommits: []
    }
  };
  assert.throws(() => core.parseMap(core.serializeMap(malformed)), /Invalid AIM branch result reference/);
  const repaired = plain(malformed); repaired.aim.branches[0].results[0].notePath = repaired.nodes.find(item => item.id === 'e0a25570-f0f1-47d2-a4e5-3c645cde6036').path;
  assert.equal(core.parseMap(core.serializeMap(repaired)).aim.branches[0].results[0].notePath, repaired.nodes[2].path);
});
test('AIM accepts legacy persisted Planner answer option objects without rewriting them', () => {
  const legacy = {
    version: 1, id: 'legacy-aim-map', title: 'Legacy AIM fixture',
    nodes: [
      { id: 'topic', path: 'topic.md', parentId: null, x: 0, y: 0, collapsed: false, aimKind: 'topic' },
      { id: 'question', path: 'question.md', parentId: 'topic', x: 360, y: 0, collapsed: false, aimKind: 'question' },
      { id: 'result', path: 'result.md', parentId: 'question', x: 720, y: 0, collapsed: false, aimKind: 'research' }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    aim: {
      version: 1,
      branches: [{ id: 'branch', questionNodeId: 'question', parentBranchId: null, answerSnapshot: { selections: ['x'], freeText: '' }, inputSnapshot: { topic: 'Legacy fixture', conditions: {}, upstreamResults: [] }, createdAt: 'now', results: [{ resultId: 'result-1', runId: 'run', attemptId: 'attempt-1', nodeId: 'result', notePath: 'result.md', version: 1 }] }],
      runs: [{ id: 'run', branchId: 'branch', currentAttemptId: 'attempt-1', attempts: [{ id: 'attempt-1', inputSnapshotHash: 'hash', status: 'completed', plannerReviews: [{ decision: 'ask_user', rationale: 'A user condition is missing.', researchTurn: 1, question: 'Which option?', answerAxis: { id: 'axis', label: 'Preference' }, answerOptions: [{ axisId: 'axis', value: 'Option A' }, { axisId: 'axis', value: 'Option B' }] }] }] }],
      pendingCommits: []
    }
  };
  assert.deepEqual(plain(core.parseMap(core.serializeMap(legacy)).aim), plain(legacy.aim));
});
test('new branch layout keeps older coordinates while full layout arranges all levels', () => {
  const nodes = [
    { ...node('root'), x: 80, y: 80 },
    { ...node('older', 'root'), x: 440, y: 80 },
    { ...node('new-a', 'root'), x: 440, y: 80 },
    { ...node('new-b', 'root'), x: 440, y: 80 },
    { ...node('grandchild', 'new-a'), x: 440, y: 80 }
  ];
  const branch = layout.arrangeNewBranch(nodes, 'root', new Set(['new-a', 'new-b', 'grandchild']));
  assert.deepEqual(plain(branch.slice(0, 2)), plain(nodes.slice(0, 2)));
  for (const fresh of branch.slice(2)) for (const fixed of branch.slice(0, 2)) assert.ok(Math.abs(fresh.x - fixed.x) >= 300 || Math.abs(fresh.y - fixed.y) >= 190);
  assert.equal(branch[4].x, branch[2].x + 360);
  const full = layout.arrangeMap(nodes);
  assert.equal(full[4].x, full[2].x + 360);
  assert.notDeepEqual(plain(full), plain(nodes));
  const crowded = [{ ...node('root'), x: 0, y: 0 }, ...Array.from({ length: 5 }, (_, index) => ({ ...node(`old-${index}`, 'root'), x: 360, y: index * 440 })), { ...node('fresh', 'root'), x: 0, y: 0 }];
  const clear = layout.arrangeNewBranch(crowded, 'root', new Set(['fresh']));
  for (const old of clear.slice(1, 6)) assert.ok(Math.abs(clear[6].x - old.x) >= 300 || Math.abs(clear[6].y - old.y) >= 190);
});
test('new tree layout keeps every existing node and places the new tree below them without overlap', () => {
  const existing = [
    { ...node('root'), x: 200, y: 80 },
    { ...node('child-a', 'root'), x: 560, y: -100 },
    { ...node('child-b', 'root'), x: 560, y: 520 },
    { ...node('other-root'), x: 120, y: 900 }
  ];
  const fresh = [{ ...node('new-root'), x: 80, y: 80 }, { ...node('new-a', 'new-root'), x: 80, y: 80 }, { ...node('new-b', 'new-root'), x: 80, y: 80 }, { ...node('new-a1', 'new-a'), x: 80, y: 80 }];
  const result = layout.arrangeNewTree([...existing, ...fresh], 'new-root', new Set(fresh.map(item => item.id)));
  assert.deepEqual(plain(result.slice(0, 4)), plain(existing), 'existing nodes never move');
  const placed = result.slice(4);
  for (const item of placed) for (const fixed of existing) assert.ok(Math.abs(item.x - fixed.x) >= 300 || Math.abs(item.y - fixed.y) >= 190, `${item.id} overlaps ${fixed.id}`);
  for (const item of placed) assert.ok(item.y >= 900 + 220, `${item.id} below the lowest node`);
  assert.equal(placed[0].x, 120, 'leftmost root column');
  assert.equal(placed[1].x, 120 + 360); assert.equal(placed[3].x, 120 + 720);
  assert.deepEqual(plain(layout.arrangeNewTree(existing, 'missing', new Set())), plain(existing));
});
test('malformed maps fail before data can be overwritten', () => {
  for (const nodes of [[node('a'), node('a')], [node('a', 'b'), node('b', 'a')], [node('a', 'missing')]]) {
    assert.throws(() => core.parseMap(core.serializeMap(map(nodes))));
  }
  assert.throws(() => core.parseMap('No map data'));
});
test('AIM pending commits must match their run, current saving attempt, branch, and owned result node', () => {
  const valid = map([node('question'), node('result', 'question')]);
  valid.aim = {
    version: 1,
    branches: [
      { id: 'branch-a', questionNodeId: 'question', parentBranchId: null, answerSnapshot: { selections: [], freeText: '' }, inputSnapshot: { topic: 'topic', conditions: {}, upstreamResults: [] }, createdAt: 'now', results: [] },
      { id: 'branch-b', questionNodeId: 'question', parentBranchId: null, answerSnapshot: { selections: [], freeText: '' }, inputSnapshot: { topic: 'topic', conditions: {}, upstreamResults: [] }, createdAt: 'now', results: [] }
    ],
    runs: [{ id: 'run-a', branchId: 'branch-a', currentAttemptId: 'attempt-a', attempts: [{ id: 'attempt-a', inputSnapshotHash: 'hash', status: 'saving' }] }],
    resultDrafts: [{ id: 'draft-a', branchId: 'branch-a', runId: 'run-a', attemptId: 'attempt-a', nodeId: 'result', notePath: 'result.md', title: 'result', status: 'ready', inputSnapshotHash: 'hash' }],
    pendingCommits: [{ resultId: 'result-a', branchId: 'branch-a', runId: 'run-a', attemptId: 'attempt-a', resultDraftId: 'draft-a', nodeId: 'result', notePath: 'result.md', title: 'result', summary: 'summary', detail: 'detail', version: 1 }]
  };
  assert.deepEqual(plain(core.parseMap(core.serializeMap(valid)).aim), plain(valid.aim));
  const crossBranch = structuredClone(valid); crossBranch.aim.pendingCommits[0].branchId = 'branch-b';
  assert.throws(() => core.parseMap(core.serializeMap(crossBranch)), /Invalid AIM pending commit/);
  const staleAttempt = structuredClone(valid); staleAttempt.aim.pendingCommits[0].attemptId = 'attempt-old';
  assert.throws(() => core.parseMap(core.serializeMap(staleAttempt)), /Invalid AIM pending commit/);
});
test('undo and redo preserve ordering; new edit invalidates redo', () => {
  const h = new core.History(); h.push('move'); h.push('delete'); assert.equal(h.undo(), 'delete'); assert.equal(h.undo(), 'move'); assert.equal(h.redo(), 'move'); h.push('edit'); assert.equal(h.canRedo, false); assert.equal(h.undo(), 'edit');
});
test('maps saved under the pre-AIM name are upgraded to AIM keys, markers and sentinels on read', () => {
  const { LEGACY_KEY_PREFIX, LEGACY_MARKER_PREFIX, LEGACY_VALUES } = require('../support.cjs').load('experiences/aim/legacy-names.ts');
  const legacyKey = key => key.startsWith('aim') ? LEGACY_KEY_PREFIX + key.slice(3) : key;
  const toLegacy = value => Array.isArray(value) ? value.map(toLegacy)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [legacyKey(key), toLegacy(item)]))
    : typeof value === 'string' ? LEGACY_VALUES.reduce((text, [legacy, current]) => text.split(current).join(legacy), value.replace('<!-- aim-', `<!-- ${LEGACY_MARKER_PREFIX}`))
    : value;
  const current = map([
    { ...node('topic'), aimKind: 'topic' },
    { ...node('question', 'topic'), aimKind: 'question', aimDismissedQuestionRequestIds: ['request'] }
  ]);
  current.aim = { version: 1, branches: [], runs: [], pendingCommits: [], note: '<!-- aim-review {} --> __aim_unknown__' };
  const legacy = toLegacy(current);
  assert.ok(!('aim' in legacy) && legacy.nodes[1][`${LEGACY_KEY_PREFIX}Kind`] === 'question');
  const parsed = plain(core.parseMap(core.serializeMap(legacy)));
  assert.deepEqual(parsed.nodes.map(item => item.aimKind), ['topic', 'question']);
  assert.deepEqual(parsed.nodes[1].aimDismissedQuestionRequestIds, ['request']);
  assert.equal(parsed.aim.note, '<!-- aim-review {} --> __aim_unknown__');
  assert.ok(!JSON.stringify(parsed).includes(LEGACY_KEY_PREFIX) && !JSON.stringify(parsed).includes(LEGACY_MARKER_PREFIX));
});

test('AIM map validation accepts a missing or supported content language and rejects any other value', () => {
  const base = { version: 1, id: 'content-language-map', title: 'Content language fixture', nodes: [], viewport: { x: 0, y: 0, zoom: 1 }, aim: { version: 1, branches: [], runs: [], pendingCommits: [] } };
  assert.equal(core.parseMap(core.serializeMap(base)).aim.contentLanguage, undefined);
  for (const value of ['en', 'zh-TW']) assert.equal(core.parseMap(core.serializeMap({ ...base, aim: { ...base.aim, contentLanguage: value } })).aim.contentLanguage, value);
  for (const value of ['fr', '', 'zh', 5, null]) assert.throws(() => core.parseMap(core.serializeMap({ ...base, aim: { ...base.aim, contentLanguage: value } })), /Invalid AIM content language/);
});

test('map default content template survives parse and serialize; non-strings are dropped', () => {
  const map = { version: 1, id: 'm', title: 'M', nodes: [], viewport: { x: 0, y: 0, zoom: 1 }, detailTemplateId: 't1' };
  assert.equal(core.parseMap(core.serializeMap(map)).detailTemplateId, 't1');
  assert.equal(core.parseMap(core.serializeMap({ ...map, detailTemplateId: 5 })).detailTemplateId, undefined);
});

test('full layout treats a collapsed topic as a leaf and leaves its hidden branch where it was', () => {
  const nodes = [
    { ...node('root'), x: 0, y: 0 },
    { ...node('big', 'root'), x: 0, y: 0, collapsed: true },
    ...Array.from({ length: 6 }, (_, index) => ({ ...node(`hidden-${index}`, 'big'), x: 999, y: index })),
    { ...node('next', 'root'), x: 0, y: 0 }
  ];
  const at = (list, id) => list.find(item => item.id === id);
  const folded = layout.arrangeMap(nodes);
  assert.equal(at(folded, 'next').y - at(folded, 'big').y, 220, 'the sibling sits one row below, not below six hidden rows');
  for (let index = 0; index < 6; index++) assert.deepEqual([at(folded, `hidden-${index}`).x, at(folded, `hidden-${index}`).y], [999, index]);
  const open = layout.arrangeMap(folded.map(item => ({ ...item, collapsed: false })));
  assert.equal(at(open, 'next').y - at(open, 'hidden-5').y, 220, 'expanded, the branch takes its rows again');
});
