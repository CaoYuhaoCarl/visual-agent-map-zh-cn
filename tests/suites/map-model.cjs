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
    { ...node('question'), mindSearchKind: 'question', mindSearchConvergesFromNodeIds: ['research'] },
    { ...node('research', 'question'), mindSearchKind: 'research' },
    { ...node('synthesis', 'question'), mindSearchKind: 'synthesis', mindSearchConvergesFromNodeIds: ['research'] }
  ]);
  assert.equal(core.clearQuestionConvergenceEdges(fixture), true);
  assert.equal(fixture.nodes[0].mindSearchConvergesFromNodeIds, undefined, 'legacy question refs are removed');
  assert.deepEqual(plain(fixture.nodes[2].mindSearchConvergesFromNodeIds), ['research'], 'the synthesis node keeps its dashed link to research');
  assert.equal(core.clearQuestionConvergenceEdges(fixture), false, 'cleanup is idempotent');
  assert.deepEqual(plain(core.parentIdsForNode(fixture.nodes[0])), [], 'renderer never draws a dashed convergence edge into a question');
  assert.deepEqual(plain(core.parentIdsForNode(fixture.nodes[2])), ['question', 'research'], 'synthesis keeps its direct and dashed source edges');
});
test('repairs legacy MindSearch continuation convergence from preceding saved research only', () => {
  const fixture = map([
    { ...node('q1'), mindSearchKind: 'question', mindSearchConvergesFromNodeIds: ['legacy-wrong-source'] },
    { ...node('r1', 'q1'), mindSearchKind: 'research' },
    { ...node('r2', 'q1'), mindSearchKind: 'research' },
    { ...node('r-default-kind', 'q1'), mindSearchKind: 'research' },
    { ...node('synthesis', 'q1'), mindSearchKind: 'synthesis' },
    { ...node('r-future', 'q1'), mindSearchKind: 'research' },
    { ...node('conclusion', 'q1'), mindSearchKind: 'conclusion', mindSearchConvergesFromNodeIds: ['existing-source'] },
    { ...node('conclusion-missing', 'q1'), mindSearchKind: 'conclusion' },
    { ...node('q-legacy'), mindSearchKind: 'question' },
    { ...node('legacy-synthesis', 'q-legacy'), mindSearchKind: 'synthesis' }
  ]);
  fixture.mindSearch = { version: 1, branches: [
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
  assert.equal(core.repairMindSearchResultConvergence(fixture), true);
  assert.equal(fixture.nodes.find(item => item.id === 'synthesis').parentId, 'r2');
  assert.deepEqual(plain(fixture.nodes.find(item => item.id === 'synthesis').mindSearchConvergesFromNodeIds), ['r1', 'r2'], 'later reports are excluded from this saved synthesis');
  assert.deepEqual(plain(fixture.nodes.find(item => item.id === 'conclusion').mindSearchConvergesFromNodeIds), ['existing-source'], 'existing convergence edges are not rewritten');
  assert.equal(fixture.nodes.find(item => item.id === 'conclusion').parentId, 'q1');
  assert.equal(fixture.nodes.find(item => item.id === 'conclusion-missing').parentId, 'r-future');
  assert.deepEqual(plain(fixture.nodes.find(item => item.id === 'conclusion-missing').mindSearchConvergesFromNodeIds), ['r1', 'r2', 'r-future']);
  assert.deepEqual(plain(fixture.nodes.find(item => item.id === 'q1').mindSearchConvergesFromNodeIds), ['legacy-wrong-source'], 'question nodes are not modified');
  assert.equal(fixture.nodes.find(item => item.id === 'legacy-synthesis').parentId, 'q-legacy', 'legacy branch without saved research remains unchanged');
  assert.equal(core.repairMindSearchResultConvergence(fixture), false, 'repair is idempotent');
});
test('MindSearch rejects a relocated result node when its branch reference still points to the source Vault', () => {
  const malformed = {
    version: 1, id: 'mindsearch-fixture-map', title: 'Planner ask-user follow-up UI fixture',
    nodes: [
      { id: '8e541501-7636-41a3-8bd8-41650937236d', path: 'Agent Workspace/Topics/Planner ask-user follow-up UI fixture/Notes/如何用鑄鐵鍋在家煎出自己喜歡的牛排熟度？.md', parentId: null, x: 80, y: 80, collapsed: false, mindSearchKind: 'topic' },
      { id: '5d756d6e-d119-43ac-b611-54353b574aa4', path: 'Agent Workspace/Topics/Planner ask-user follow-up UI fixture/Notes/問題 · 你希望牛排煎到哪種熟度？.md', parentId: '8e541501-7636-41a3-8bd8-41650937236d', x: 440, y: 80, collapsed: false, mindSearchKind: 'question', mindSearchQuestion: { requestId: '282bceaa-8fb9-47e3-abc7-dd2ce293e705', parentBranchId: null, options: [{ id: 'rare', label: '三分熟（中心偏紅）' }, { id: 'medium', label: '五分熟' }], allowMultiple: true, allowFreeText: true } },
      { id: 'e0a25570-f0f1-47d2-a4e5-3c645cde6036', path: 'Agent Workspace/Topics/Planner ask-user follow-up UI fixture/Notes/你希望牛排煎到哪種熟度？・回答研究.md', parentId: '5d756d6e-d119-43ac-b611-54353b574aa4', x: 800, y: 80, collapsed: false, mindSearchKind: 'research' }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    mindSearch: {
      version: 1, branches: [{ id: '5719e17c-fced-46e5-947c-410dd73fbed9', submissionId: '7eb4a718-f3e7-462e-bda4-439daac43030', questionNodeId: '5d756d6e-d119-43ac-b611-54353b574aa4', parentBranchId: null, answerSnapshot: { selections: ['rare'], freeText: 'Synthetic UI fixture.' }, inputSnapshot: { topic: '如何用鑄鐵鍋在家煎出自己喜歡的牛排熟度？', conditions: { '你希望牛排煎到哪種熟度？': 'Synthetic answer.' }, upstreamResults: [] }, createdAt: '2026-10-05T05:37:21.519Z', results: [{ resultId: 'result-f042d30c-c76a-4bd1-8912-990a14ef1f2f-attempt-1', runId: 'f042d30c-c76a-4bd1-8912-990a14ef1f2f', attemptId: 'attempt-1', nodeId: 'e0a25570-f0f1-47d2-a4e5-3c645cde6036', notePath: 'Agent Workspace/Topics/如何用鑄鐵鍋在家煎出自己喜歡的牛排熟度？/Notes/你希望牛排煎到哪種熟度？・回答研究.md', version: 1 }] }],
      runs: [{ id: 'f042d30c-c76a-4bd1-8912-990a14ef1f2f', branchId: '5719e17c-fced-46e5-947c-410dd73fbed9', currentAttemptId: 'attempt-1', attempts: [{ id: 'attempt-1', inputSnapshotHash: 'e1d8c45129677f8003c8233e371fba8722032a0e367b8e02f9ab09423c57a44f', status: 'completed' }] }],
      pendingCommits: []
    }
  };
  assert.throws(() => core.parseMap(core.serializeMap(malformed)), /Invalid MindSearch branch result reference/);
  const repaired = plain(malformed); repaired.mindSearch.branches[0].results[0].notePath = repaired.nodes.find(item => item.id === 'e0a25570-f0f1-47d2-a4e5-3c645cde6036').path;
  assert.equal(core.parseMap(core.serializeMap(repaired)).mindSearch.branches[0].results[0].notePath, repaired.nodes[2].path);
});
test('MindSearch accepts legacy persisted Planner answer option objects without rewriting them', () => {
  const legacy = {
    version: 1, id: 'legacy-mindsearch-map', title: 'Legacy MindSearch fixture',
    nodes: [
      { id: 'topic', path: 'topic.md', parentId: null, x: 0, y: 0, collapsed: false, mindSearchKind: 'topic' },
      { id: 'question', path: 'question.md', parentId: 'topic', x: 360, y: 0, collapsed: false, mindSearchKind: 'question' },
      { id: 'result', path: 'result.md', parentId: 'question', x: 720, y: 0, collapsed: false, mindSearchKind: 'research' }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    mindSearch: {
      version: 1,
      branches: [{ id: 'branch', questionNodeId: 'question', parentBranchId: null, answerSnapshot: { selections: ['x'], freeText: '' }, inputSnapshot: { topic: 'Legacy fixture', conditions: {}, upstreamResults: [] }, createdAt: 'now', results: [{ resultId: 'result-1', runId: 'run', attemptId: 'attempt-1', nodeId: 'result', notePath: 'result.md', version: 1 }] }],
      runs: [{ id: 'run', branchId: 'branch', currentAttemptId: 'attempt-1', attempts: [{ id: 'attempt-1', inputSnapshotHash: 'hash', status: 'completed', plannerReviews: [{ decision: 'ask_user', rationale: 'A user condition is missing.', researchTurn: 1, question: 'Which option?', answerAxis: { id: 'axis', label: 'Preference' }, answerOptions: [{ axisId: 'axis', value: 'Option A' }, { axisId: 'axis', value: 'Option B' }] }] }] }],
      pendingCommits: []
    }
  };
  assert.deepEqual(plain(core.parseMap(core.serializeMap(legacy)).mindSearch), plain(legacy.mindSearch));
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
test('malformed maps fail before data can be overwritten', () => {
  for (const nodes of [[node('a'), node('a')], [node('a', 'b'), node('b', 'a')], [node('a', 'missing')]]) {
    assert.throws(() => core.parseMap(core.serializeMap(map(nodes))));
  }
  assert.throws(() => core.parseMap('No map data'));
});
test('MindSearch pending commits must match their run, current saving attempt, branch, and owned result node', () => {
  const valid = map([node('question'), node('result', 'question')]);
  valid.mindSearch = {
    version: 1,
    branches: [
      { id: 'branch-a', questionNodeId: 'question', parentBranchId: null, answerSnapshot: { selections: [], freeText: '' }, inputSnapshot: { topic: 'topic', conditions: {}, upstreamResults: [] }, createdAt: 'now', results: [] },
      { id: 'branch-b', questionNodeId: 'question', parentBranchId: null, answerSnapshot: { selections: [], freeText: '' }, inputSnapshot: { topic: 'topic', conditions: {}, upstreamResults: [] }, createdAt: 'now', results: [] }
    ],
    runs: [{ id: 'run-a', branchId: 'branch-a', currentAttemptId: 'attempt-a', attempts: [{ id: 'attempt-a', inputSnapshotHash: 'hash', status: 'saving' }] }],
    resultDrafts: [{ id: 'draft-a', branchId: 'branch-a', runId: 'run-a', attemptId: 'attempt-a', nodeId: 'result', notePath: 'result.md', title: 'result', status: 'ready', inputSnapshotHash: 'hash' }],
    pendingCommits: [{ resultId: 'result-a', branchId: 'branch-a', runId: 'run-a', attemptId: 'attempt-a', resultDraftId: 'draft-a', nodeId: 'result', notePath: 'result.md', title: 'result', summary: 'summary', detail: 'detail', version: 1 }]
  };
  assert.deepEqual(plain(core.parseMap(core.serializeMap(valid)).mindSearch), plain(valid.mindSearch));
  const crossBranch = structuredClone(valid); crossBranch.mindSearch.pendingCommits[0].branchId = 'branch-b';
  assert.throws(() => core.parseMap(core.serializeMap(crossBranch)), /Invalid MindSearch pending commit/);
  const staleAttempt = structuredClone(valid); staleAttempt.mindSearch.pendingCommits[0].attemptId = 'attempt-old';
  assert.throws(() => core.parseMap(core.serializeMap(staleAttempt)), /Invalid MindSearch pending commit/);
});
test('undo and redo preserve ordering; new edit invalidates redo', () => {
  const h = new core.History(); h.push('move'); h.push('delete'); assert.equal(h.undo(), 'delete'); assert.equal(h.undo(), 'move'); assert.equal(h.redo(), 'move'); h.push('edit'); assert.equal(h.canRedo, false); assert.equal(h.undo(), 'edit');
});
