const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { integrationTest, root, load, core, layout, node, map, plain, tree, TFolder, obsidian, DEFAULT_SETTINGS, fixture, topicNote } = require('../support.cjs');
integrationTest('editing note fields preserves latest AI detail and unrelated frontmatter', async () => {
  const { repo, contents } = fixture(); const n = await topicNote(repo);
  contents.set(n.path, contents.get(n.path).replace('---\n', '---\ncustom: retain me\n'));
  await repo.updateNote(n.path, { detail: '## Nested heading\n\nAI result with $& and ```code```', newFindings: 'Fresh research', status: 'review' });
  await repo.updateNote(n.path, { title: '修改標題', model: 'model-b', modelSource: 'manual', reasoning: 'high', prompt: 'A task with $&' });
  const result = await repo.readNote(n.path);
  assert.equal(result.detail, '## Nested heading\n\nAI result with $& and ```code```'); assert.equal(result.prompt, 'A task with $&'); assert.equal(result.model, 'model-b'); assert.equal(result.status, 'completed');
  assert.equal(result.reasoning, 'high');
  assert.equal(result.newFindings, 'Fresh research');
  assert.match(contents.get(n.path), /## Working Findings\n\nFresh research/);
  assert.match(contents.get(n.path), /custom: retain me/);
});
integrationTest('local research mode persists without changing older notes', async () => {
  const { repo } = fixture(); const n = await topicNote(repo);
  const original = await repo.readNote(n.path);
  assert.equal(original.researchMode, 'research');
  assert.equal(original.researchDepth, 'normal');
  assert.equal(original.visualMode, 'auto');
  await repo.updateNote(n.path, { researchMode: 'local', researchDepth: 'deep', visualMode: 'off' });
  const updated = await repo.readNote(n.path);
  assert.equal(updated.researchMode, 'local');
  assert.equal(updated.researchDepth, 'deep');
  assert.equal(updated.visualMode, 'off');
});
integrationTest('current summary is editable in the Markdown body', async () => {
  const { repo, contents } = fixture(); const n = await topicNote(repo, 'Editable summary');
  assert.match(contents.get(n.path), /## Current Summary\n\n尚未形成結論/);
  await repo.updateNote(n.path, { summary: 'AI conclusion that can be edited' });
  assert.match(contents.get(n.path), /summary: AI conclusion that can be edited/);
  assert.match(contents.get(n.path), /## Current Summary\n\nAI conclusion that can be edited/);
  contents.set(n.path, contents.get(n.path).replace('## Current Summary\n\nAI conclusion that can be edited', '## Current Summary\n\nUser-edited conclusion'));
  assert.equal((await repo.readNote(n.path)).summary, 'User-edited conclusion');
});
integrationTest('English notes use English preview, pending summary, and managed reference labels', async () => {
  const { repo, app, contents } = fixture('en');
  const mapPath = await repo.createMap('Travel'), map = await repo.readMap(mapPath);
  assert.match(contents.get(mapPath), /This file stores the mind map structure/);
  assert.doesNotMatch(contents.get(mapPath), /此檔案保存心智圖結構/);
  const note = await repo.createNote('Route', 'model-a', map, mapPath, 'workspace');
  map.nodes.push(note); await repo.saveMap(mapPath, map); await repo.rebuildDerivedData();
  let markdown = contents.get(note.path);
  assert.match(markdown, /## Current Summary\n\nNo conclusion yet/);
  assert.doesNotMatch(markdown, /\[!info\]- Preview|## Preview/, 'an empty (placeholder) Preview is not written');
  assert.match(markdown, /- Topic: \[\[/);
  assert.match(markdown, /- Mind map: \[\[/);
  assert.doesNotMatch(markdown, /尚未形成結論|## 預覽|所屬主題|所屬心智圖/);
  await repo.updateNote(note.path, { sourcePaths: ['Source.md'], detail: 'English detail' });
  markdown = contents.get(note.path);
  assert.match(markdown, /- Source topic: \[\[Source\]\]/);
  assert.equal((await repo.readNote(note.path)).preview, '');
  await repo.updateNote(note.path, { summary: 'English conclusion' });
  assert.equal((await repo.readNote(note.path)).preview, 'English conclusion');
  assert.match(contents.get(note.path), /> \[!info\]- Preview\n> English conclusion/);
  const copy = await repo.duplicateNote(note.path, map, mapPath);
  assert.match(copy.path, /Route copy\.md$/);
  assert.throws(() => repo.file('Missing.md'), /File not found/);
});
integrationTest('a language switch never relabels an existing note: writes and rebuilds keep its scaffolding language; new notes use the UI language', async () => {
  const { repo, app, contents } = fixture();
  const mapPath = await repo.createMap('Travel'), map = await repo.readMap(mapPath);
  const note = await repo.createNote('Route', 'model-a', map, mapPath, 'workspace');
  map.nodes.push(note); await repo.saveMap(mapPath, map); await repo.rebuildDerivedData();
  await repo.updateNote(note.path, { detail: 'Keep detail', sourcePaths: ['Source.md'] });
  const beforeSwitch = contents.get(note.path);
  repo.settings.language = 'en';
  assert.equal(contents.get(note.path), beforeSwitch);
  await repo.updateNote(note.path, { model: 'model-b' });
  let markdown = contents.get(note.path);
  assert.doesNotMatch(markdown, /\[!info\]- (預覽|Preview)/, 'an empty (placeholder) Preview is not written');
  assert.match(markdown, /## Current Summary\n\n尚未形成結論/);
  assert.match(markdown, /- 所屬主題：\[\[/);
  assert.match(markdown, /- 來源議題：\[\[Source\]\]/);
  assert.match(markdown, /Keep detail/);
  assert.doesNotMatch(markdown, /## Preview|No conclusion yet|- Topic:|Source topic/);
  await repo.updateNote(note.path, { preview: 'My own preview' });
  await repo.rebuildDerivedData();
  markdown = contents.get(note.path);
  assert.match(markdown, /> \[!info\]- 預覽\n> My own preview/);
  assert.match(markdown, /- 所屬主題：\[\[/);
  assert.doesNotMatch(markdown, /## Preview|\[!info\]- Preview|No conclusion yet|- Topic:/);
  assert.equal((await repo.readNote(note.path)).preview, 'My own preview');
  const fresh = await repo.createNote('Fresh', 'model-a', map, mapPath, 'workspace');
  map.nodes.push(fresh); await repo.saveMap(mapPath, map); await repo.rebuildDerivedData();
  assert.doesNotMatch(contents.get(fresh.path), /預覽|尚未形成結論/, 'a new note uses the current UI language');
  assert.match(contents.get(fresh.path), /- Topic: \[\[/);
  const bare = 'Agent Workspace/Unfiled/Bare.md';
  await repo.folder('Agent Workspace/Unfiled');
  const bareContent = '---\nagent-map-node: true\nnode-id: bare\ntitle: Bare\n---\n# Bare\n';
  contents.set(bare, bareContent); await app.vault.create(bare, bareContent);
  await repo.rebuildDerivedData();
  assert.match(contents.get(bare), /## Current Summary\n\nNo conclusion yet/, 'a note with no derived labels uses the current UI language');
});
integrationTest('editing a note heading updates its card title and survives later note writes', async () => {
  const { repo, contents } = fixture(); const n = await topicNote(repo, '新的子議題');
  contents.set(n.path, contents.get(n.path).replace('# 新的子議題', '# 要如何推廣VAM'));
  assert.equal((await repo.readNote(n.path)).title, '要如何推廣VAM');
  await repo.updateNote(n.path, { summary: '新的摘要' });
  assert.equal((await repo.readNote(n.path)).title, '要如何推廣VAM');
  assert.match(contents.get(n.path), /title: 要如何推廣VAM/);
  assert.match(contents.get(n.path), /^# 要如何推廣VAM$/m);
  await repo.rebuildDerivedData();
  assert.equal((await repo.readNote(n.path)).title, '要如何推廣VAM');
});
integrationTest('visual references are stored inside the editable Detail section', async () => {
  const { repo, contents } = fixture(); const n = await topicNote(repo, 'Outfit');
  await repo.updateNote(n.path, { visualReferences: '### Navy + Beige\n\n![Navy + Beige](https://example.com/outfit.jpg)\n\n來源：https://example.com/page\n配色：navy / beige' });
  let note = await repo.readNote(n.path);
  assert.equal(note.visualReferences, '');
  assert.match(note.detail, /\*\*Navy \+ Beige\*\*/);
  assert.doesNotMatch(note.detail, /### 視覺參考/);
  assert.doesNotMatch(contents.get(n.path), /## Visual References/);
  await repo.updateNote(n.path, { visualReferences: '' });
  note = await repo.readNote(n.path);
  assert.equal(note.visualReferences, '');
  assert.doesNotMatch(contents.get(n.path), /## Visual References/);
});
integrationTest('reference rebuild keeps a note edit made after the rebuild read the note', async () => {
  const { repo, contents, app } = fixture(); const n = await topicNote(repo);
  await repo.createMap('Map A', [n]);
  const process = app.vault.process;
  let edited = false;
  app.vault.process = async (file, change) => {
    if (file.path === n.path && !edited) {
      edited = true;
      contents.set(n.path, `${contents.get(n.path)}\n\nEdited while references were rebuilding`);
    }
    return process(file, change);
  };
  await repo.rebuildDerivedData();
  assert.equal(edited, true);
  assert.match(contents.get(n.path), /Edited while references were rebuilding/);
  assert.match(contents.get(n.path), /agent-map-references:/);
});
integrationTest('node presentation repair keeps a note edit made after the check', async () => {
  const { repo, contents, app } = fixture(); const n = await topicNote(repo);
  contents.set(n.path, contents.get(n.path).replace(/^cssclasses:\n(  - .*\n)+/m, ''));
  const process = app.vault.process;
  app.vault.process = async (file, change) => {
    contents.set(file.path, `${contents.get(file.path)}\n\nLate edit`);
    return process(file, change);
  };
  await repo.ensureNodePresentation();
  assert.match(contents.get(n.path), /Late edit/);
  assert.match(contents.get(n.path), /cssclasses:/);
});
integrationTest('managed references stay outside Detail and preserve user-authored content', async () => {
  const { repo, contents, app } = fixture(); const n = await topicNote(repo);
  const mapPath = await repo.createMap('Map A', [n]);
  await repo.rebuildDerivedData();
  let text = contents.get(n.path);
  assert.match(text, /visual-agent-map:references:start/);
  assert.match(text, /## Reference Links/);
  assert.match(text, /agent-map-references:/);
  assert.doesNotMatch((await repo.readNote(n.path)).detail, /關聯議題/);
  text = text.replace('<!-- visual-agent-map:detail:end -->', '<!-- visual-agent-map:detail:end -->\n\n## User notes\n\nUser content'); contents.set(n.path, text);
  await repo.updateNote(n.path, { detail: 'New detail' }); await repo.rebuildDerivedData();
  assert.match(contents.get(n.path), /User content/); assert.equal((await repo.readNote(n.path)).detail, 'New detail');
  assert.ok(app.vault.getAbstractFileByPath(mapPath));
});
integrationTest('a note cannot belong to two maps', async () => {
  const { repo } = fixture(); const n = await topicNote(repo, 'shared');
  await repo.createMap('One', [n]); await repo.createMap('Two', [n]);
  await assert.rejects(() => repo.rebuildDerivedData(), /同時出現在兩張心智圖/);
});
integrationTest('removing a node clears ownership and generated references while keeping the note', async () => {
  const { repo, contents } = fixture(); const n = await topicNote(repo, 'kept'); const mapPath = await repo.createMap('One', [n]);
  await repo.rebuildDerivedData(); const mapDoc = await repo.readMap(mapPath); mapDoc.nodes = []; await repo.saveMap(mapPath, mapDoc); await repo.rebuildDerivedData();
  assert.equal((await repo.readNote(n.path)).mapId, ''); assert.doesNotMatch(contents.get(n.path), /visual-agent-map:references:start/); assert.doesNotMatch(contents.get(n.path), /agent-map-references:/);
});
integrationTest('maps keep independent layout and preserve Markdown prose', async () => {
  const { repo, contents } = fixture(); const firstNode = await topicNote(repo, 'first', 'gpt-5.6-terra', 'map-a'); const secondNode = await topicNote(repo, 'second', 'gpt-5.6-terra', 'map-b');
  const first = await repo.createMap('One', [firstNode]), second = await repo.createMap('Two', [secondNode]);
  contents.set(first, contents.get(first) + '\nUser annotation\n');
  const changed = await repo.readMap(first); changed.nodes[0].x = 600; changed.title = 'Renamed'; await repo.saveMap(first, changed);
  assert.equal((await repo.readMap(second)).nodes[0].x, 80); assert.match(contents.get(first), /User annotation/); assert.match(contents.get(first), /# Renamed/);
});
integrationTest('large vaults: map discovery, unrelated renames and rebuilds read only VAM files', async () => {
  const { repo, app } = fixture();
  const path = await repo.createMap('Perf', []), map = await repo.readMap(path);
  const node = await repo.createNote('Tracked', 'a', map, path, 'workspace'); map.nodes.push(node); await repo.saveMap(path, map);
  for (let index = 0; index < 5000; index++) await app.vault.create(`Personal/note-${index}.md`, `# Personal ${index}\n\nPlain text.`);
  const reads = [];
  for (const method of ['read', 'cachedRead']) { const original = app.vault[method].bind(app.vault); app.vault[method] = async file => { reads.push(file.path); return original(file); }; }
  assert.deepEqual(JSON.parse(JSON.stringify((await repo.mapFiles()).map(file => file.path))), [path]);
  await repo.replaceSourcePath('Personal/note-1.md', 'Personal/note-1 renamed.md');
  assert.equal(await repo.isMapNodePath('Personal/note-1.md'), false);
  assert.equal(await repo.isMapNodePath(node.path), true);
  await repo.rebuildDerivedData();
  assert.deepEqual(reads.filter(item => item.startsWith('Personal/')), [], 'no unrelated note was read');
  // Rename relevance is decided from the metadata cache alone.
  reads.length = 0;
  assert.equal(repo.renameAffectsVam(app.vault.getAbstractFileByPath('Personal/note-2.md'), 'Personal/old-2.md'), false);
  assert.equal(repo.renameAffectsVam(app.vault.getAbstractFileByPath(node.path), 'Elsewhere/tracked.md'), true, 'a VAM note is relevant');
  await repo.updateNote(node.path, { sourcePaths: ['Personal/old-3.md'] });
  assert.equal(repo.renameAffectsVam(app.vault.getAbstractFileByPath('Personal/note-3.md'), 'Personal/old-3.md'), true, 'a note cited by a VAM note is relevant');
  assert.deepEqual(reads, [], 'relevance checks read no file');
});
integrationTest('external rename reconciliation only follows a unique matching node-id', async () => {
  const { repo, app, contents } = fixture(); const n = await topicNote(repo, 'External rename');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', doc = { id: 'map-a', title: 'Map A', version: 1, nodes: [n], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(doc));
  const renamed = 'Agent Workspace/Topics/map-a/Notes/External rename moved.md';
  await app.fileManager.renameFile(app.vault.getAbstractFileByPath(n.path), renamed);
  assert.equal(await repo.reconcileMissingNodePaths(), 1);
  assert.equal((await repo.readMap(mapPath)).nodes[0].path, renamed);

  const second = fixture(); const other = await topicNote(second.repo, 'Ambiguous rename');
  const otherMap = 'Agent Workspace/Topics/map-a/Map.md', otherDoc = { id: 'map-a', title: 'Map A', version: 1, nodes: [other], viewport: { x: 0, y: 0, zoom: 1 } };
  await second.app.vault.create(otherMap, core.serializeMap(otherDoc));
  const firstCandidate = 'Agent Workspace/Topics/map-a/Notes/Ambiguous one.md', secondCandidate = 'Agent Workspace/Topics/map-a/Notes/Ambiguous two.md';
  await second.app.fileManager.renameFile(second.app.vault.getAbstractFileByPath(other.path), firstCandidate);
  await second.app.vault.create(secondCandidate, second.contents.get(firstCandidate));
  assert.equal(await second.repo.reconcileMissingNodePaths(), 0);
  assert.equal((await second.repo.readMap(otherMap)).nodes[0].path, other.path);
});
integrationTest('new topics contain Map, Notes, Unassigned and Archive', async () => {
  const { repo, app } = fixture(), mapPath = await repo.createMap('Topic A');
  assert.equal(mapPath, 'Agent Workspace/Mind Maps/Topic A/Map.md');
  for (const name of ['Notes', 'Unassigned', 'Archive']) assert.ok(app.vault.getAbstractFileByPath(`Agent Workspace/Mind Maps/Topic A/${name}`) instanceof TFolder);
});
integrationTest('unassigned and archived notes keep topic ownership but leave the map', async () => {
  const { repo, contents } = fixture(), mapPath = await repo.createMap('Lifecycle'), mapDoc = await repo.readMap(mapPath);
  const n = await repo.createNote('Knowledge', 'a', mapDoc, mapPath, 'workspace'); mapDoc.nodes.push(n); await repo.saveMap(mapPath, mapDoc); await repo.rebuildDerivedData();
  const unassigned = await repo.moveUnique(n.path, repo.topicFolder(mapPath, 'Unassigned')); await repo.setLifecycle(unassigned, mapDoc.id, '', 'unassigned'); mapDoc.nodes = []; await repo.saveMap(mapPath, mapDoc); await repo.rebuildDerivedData();
  let note = await repo.readNote(unassigned); assert.equal(note.topicId, mapDoc.id); assert.equal(note.mapId, ''); assert.equal(note.topicState, 'unassigned'); assert.match(contents.get(unassigned), /狀態：未歸類/);
  const archived = await repo.moveUnique(unassigned, repo.topicFolder(mapPath, 'Archive')); await repo.setLifecycle(archived, mapDoc.id, '', 'archived'); await repo.rebuildDerivedData();
  note = await repo.readNote(archived); assert.equal(note.topicState, 'archived'); assert.match(contents.get(archived), /狀態：已封存/);
});
integrationTest('a missing Map can be rebuilt from topic Notes as root nodes', async () => {
  const { repo } = fixture(), root = 'Agent Workspace/Topics/Broken', placeholder = { id: 'stable-topic', title: 'Broken', version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
  await repo.ensureTopicFolders(root); await repo.createNote('Recovered', 'a', placeholder, `${root}/Map.md`, 'workspace');
  const path = await repo.rebuildMissingMap(root), rebuilt = await repo.readMap(path); assert.equal(rebuilt.id, 'stable-topic'); assert.equal(rebuilt.nodes.length, 1); assert.equal(rebuilt.nodes[0].parentId, null);
});
integrationTest('replacing AI synthesis preserves 預覽', async () => {
  const { repo } = fixture(), n = await topicNote(repo, 'Synthesis');
  await repo.updateNote(n.path, { detail: 'Old synthesis', preview: 'Keep this manually written note' });
  await repo.updateNote(n.path, { detail: 'New synthesis', prompt: '' });
  const result = await repo.readNote(n.path); assert.equal(result.detail, 'New synthesis'); assert.equal(result.preview, 'Keep this manually written note'); assert.equal(result.prompt, '');
});
integrationTest('text undo uses field patches and preserves AI details arriving in between', async () => {
  const { repo, app } = fixture(), n = await topicNote(repo, 'Original', 'a');
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, { repo, rebuildDerivedData: async () => {} });
  view.refreshCard = () => {}; view.updateHistoryButtons = () => {}; view.render = () => {};
  await view.noteChange(n, { title: 'Edited' }); await repo.updateNote(n.path, { detail: 'New AI answer' }); await view.travel(false);
  const note = await repo.readNote(n.path); assert.equal(note.title, 'Original'); assert.equal(note.detail, 'New AI answer');
});
integrationTest('generated child filenames are migrated to their topic titles and maps stay linked', async () => {
  const { repo, app } = fixture(), mapPath = await repo.createMap('Filename migration'), mapDoc = await repo.readMap(mapPath);
  const child = await repo.createNote('新的子議題', 'a', mapDoc, mapPath, 'workspace');
  await repo.updateNote(child.path, { title: '清楚的子議題名稱' }); mapDoc.nodes.push(child); await repo.saveMap(mapPath, mapDoc);
  const count = await repo.normalizeGeneratedNoteFilenames(), updated = await repo.readMap(mapPath);
  assert.equal(count, 1); assert.match(updated.nodes[0].path, /清楚的子議題名稱\.md$/); assert.ok(app.vault.getAbstractFileByPath(updated.nodes[0].path));
});
integrationTest('map topic sources retain every selected summary and working finding', async () => {
  const { repo, app } = fixture(), first = await topicNote(repo, 'Recipe A', 'a'), second = await topicNote(repo, 'Recipe B', 'a');
  await repo.updateNote(first.path, { summary: 'Use more onion', newFindings: '### 暫存結論\n\nOnion adds sweetness.' });
  await repo.updateNote(second.path, { summary: 'Toast the buns' });
  const { VisualAgentMapView } = load('main.ts', { obsidian }); const view = new VisualAgentMapView({ app }, { repo });
  const group = await view.topicReferenceGroup([first, second]);
  assert.deepEqual(group.documents.map(document => document.path), [first.path, second.path]);
  assert.match(group.documents[0].content, /Use more onion/);
  assert.match(group.documents[0].content, /Onion adds sweetness/);
  assert.match(group.documents[1].content, /Toast the buns/);
});
integrationTest('legacy integrated source links resolve from short Obsidian links', async () => {
  const { repo, app } = fixture(), source = await topicNote(repo, 'Recipe A', 'a'), root = await topicNote(repo, 'Integrated Burger', 'a');
  await repo.updateNote(root.path, { detail: '### 整合來源（保存內容）\n\n- [[Recipe A]]' });
  const { VisualAgentMapView } = load('main.ts', { obsidian }); const view = new VisualAgentMapView({ app }, { repo });
  assert.deepEqual(plain(view.referenceSourcePaths(await repo.readNote(root.path), root.path)), [source.path]);
});
integrationTest('creating an integrated topic runs AI with full sources and keeps clickable source paths', async () => {
  const { repo, app } = fixture(), first = await topicNote(repo, 'Recipe A', 'model-a'), second = await topicNote(repo, 'Recipe B', 'model-a');
  await repo.updateNote(first.path, { summary: 'Saved onion note', newFindings: 'Caramelize slowly.' });
  await repo.updateNote(second.path, { summary: 'Saved bun note' });
  first.x = 80; first.y = 80; second.x = 420; second.y = 220;
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [first, second], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {}, askModel: async context => {
    assert.equal(context.mode, 'synthesize'); const allSources = context.referenceGroups.flatMap(group => group.documents).map(document => document.content).join('\n'); assert.match(allSources, /Saved onion note/); assert.match(allSources, /Caramelize slowly/); assert.match(allSources, /Saved bun note/);
    return { summary: 'Integrated answer', detail: 'Integrated detail', suggestions: [] };
  } };
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {};
  await view.createIntegratedNode('Personal Burger', [first, second], 'Find the best approach', 'Use tables');
  const savedMap = await repo.readMap(mapPath); assert.equal(savedMap.nodes.length, 3);
  const integrated = await repo.readNote(savedMap.nodes[2].path);
  assert.match(integrated.detail, /### Core conclusions/);
  assert.deepEqual(integrated.sourcePaths, [first.path, second.path]);
  assert.equal(integrated.rules, '');
  assert.equal(integrated.status, 'completed');
});
integrationTest('failed multi-select integration creates no empty root or note', async () => {
  const { repo, app } = fixture(), first = await topicNote(repo, 'Recipe A', 'model-a'), second = await topicNote(repo, 'Recipe B', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [first, second], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, askModel: async () => { throw new Error('provider unavailable'); } };
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {};
  await assert.rejects(() => view.createIntegratedNode('Should not exist', [first, second], 'Combine', ''), /provider unavailable/);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 2);
  assert.equal(app.vault.getAbstractFileByPath('Agent Workspace/Topics/map-a/Notes/Should not exist.md'), undefined);
});
integrationTest('saved integration is not offered for retry when derived-data refresh fails', async () => {
  const { repo, app } = fixture(), first = await topicNote(repo, 'Source A'), second = await topicNote(repo, 'Source B');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [first, second], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => { throw new Error('refresh unavailable'); }, askModel: async () => ({ summary: 'Combined', detail: 'Combined knowledge', suggestions: [] }) };
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.focusNode = () => {};
  await view.createIntegratedNode('Combined', [first, second], 'Compare', '');
  assert.equal((await repo.readMap(mapPath)).nodes.length, 3);
  assert.equal(view.integrationTask, null);
});
integrationTest('topic notes hide properties without removing existing css classes', async () => {
  const { repo, contents } = fixture(); const n = await topicNote(repo, 'Styled', 'a');
  let content = contents.get(n.path); assert.match(content, /visual-agent-map-node/);
  content = content.replace('cssclasses:\n  - visual-agent-map-node', 'cssclasses:\n  - user-class'); contents.set(n.path, content);
  await repo.ensureNodePresentation(); content = contents.get(n.path); assert.match(content, /user-class/); assert.match(content, /visual-agent-map-node/);
});
integrationTest('deleted map restore refuses an occupied path without changing its contents', async () => {
  const { repo, app } = fixture(), path = await repo.createMap('Restoration conflict', []);
  const existing = await app.vault.read(repo.file(path));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, { repo });
  view.deletedMap = { path, content: 'previous map contents', map: await repo.readMap(path), deleted: true };
  await assert.rejects(() => view.restoreDeletedMap());
  assert.equal(await app.vault.read(repo.file(path)), existing);
  assert.equal(view.deletedMap.deleted, true);
});
integrationTest('map structural undo restores deleted branch; redo removes it again', async () => {
  const { repo, app } = fixture(); const file = await repo.createMap('Undo', tree());
  const { VisualAgentMapView } = load('main.ts', { obsidian }); const view = new VisualAgentMapView({ app }, { repo, rebuildDerivedData: async () => {} });
  view.path = file; view.map = await repo.readMap(file); view.render = () => {}; view.hydrate = async () => {};
  await view.mapChange(m => { m.nodes = core.removeNodes(m.nodes, 'a', true); }); assert.equal((await repo.readMap(file)).nodes.length, 1);
  await view.travel(false); assert.equal((await repo.readMap(file)).nodes.length, 4);
  await view.travel(true); assert.equal((await repo.readMap(file)).nodes.length, 1);
});
integrationTest('layout-only map changes and AI note results do not rebuild derived data', async () => {
  const { repo, app } = fixture(), file = await repo.createMap('Layout', tree()); let rebuilds = 0;
  const { VisualAgentMapView } = load('main.ts', { obsidian }); const view = new VisualAgentMapView({ app }, { repo, rebuildDerivedData: async () => { rebuilds++; } });
  view.path = file; view.map = await repo.readMap(file); view.render = () => {}; view.hydrate = async () => {};
  await view.mapChange(map => { map.nodes[0].x = 120; map.viewport.zoom = 1.2; }); assert.equal(rebuilds, 0);
  await view.mapChange(map => { map.nodes[0].parentId = 'd'; }); assert.equal(rebuilds, 1);
});
integrationTest('full auto layout can be undone without changing parent links', async () => {
  const { repo, app } = fixture(), file = await repo.createMap('Arrange', tree());
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, { repo, rebuildDerivedData: async () => assert.fail('layout should not rebuild ownership') });
  view.path = file; view.map = await repo.readMap(file); view.render = () => {}; view.hydrate = async () => {};
  const before = plain(view.map.nodes);
  await view.mapChange(map => { map.nodes = layout.arrangeMap(map.nodes); }, false);
  const after = (await repo.readMap(file)).nodes;
  assert.notDeepEqual(plain(after), before);
  assert.deepEqual(Array.from(after, item => item.parentId), Array.from(before, item => item.parentId));
  await view.travel(false);
  assert.deepEqual(plain((await repo.readMap(file)).nodes), before);
});
integrationTest('legacy User Notes move to preview without losing either section or duplicating on save', async () => {
  const { repo, contents } = fixture(), n = await topicNote(repo, 'Legacy preview');
  await repo.updateNote(n.path, { preview: 'New preview' });
  contents.set(n.path, contents.get(n.path).replace('## Detail', '## User Notes\n\nLegacy text\n\n## Detail'));
  assert.equal((await repo.readNote(n.path)).preview, 'New preview\n\nLegacy text');
  await repo.updateNote(n.path, { summary: 'AI summary' });
  await repo.updateNote(n.path, { detail: 'AI detail' });
  assert.equal((await repo.readNote(n.path)).preview, 'New preview\n\nLegacy text');
  assert.doesNotMatch(contents.get(n.path), /## User Notes/);
  await repo.updateNote(n.path, { preview: '' });
  assert.equal((await repo.readNote(n.path)).preview, '');
});
integrationTest('first AI answer seeds summary and image in preview, later answers preserve it including an explicit clear', async () => {
  const { repo } = fixture(), n = await topicNote(repo, 'Preview default');
  assert.equal((await repo.readNote(n.path)).preview, '', 'a new note has no Preview until the first answer');
  await repo.updateNote(n.path, { summary: '簡短結論', detail: '文字\n\n![相關圖片](https://example.com/image.jpg)' });
  assert.equal((await repo.readNote(n.path)).preview, '簡短結論\n\n![相關圖片](https://example.com/image.jpg)');
  await repo.updateNote(n.path, { summary: '第二次結論', detail: '新正文' });
  assert.match((await repo.readNote(n.path)).preview, /簡短結論/);
  await repo.updateNote(n.path, { preview: '' });
  await repo.updateNote(n.path, { summary: '第三次結論' });
  assert.equal((await repo.readNote(n.path)).preview, '');
});
integrationTest('AI answer cannot replace preview edited while task was running', async () => {
  const { repo } = fixture(), n = await topicNote(repo, 'Manual preview');
  await repo.updateNote(n.path, { preview: '使用者的文字' });
  await repo.updateNote(n.path, { summary: 'AI 結論', detail: '![圖](https://example.com/image.jpg)' });
  assert.equal((await repo.readNote(n.path)).preview, '使用者的文字');
});
integrationTest('AI history refuses to undo over a later edit and retains the undo entry', async () => {
  const { repo, app } = fixture(), node = await topicNote(repo, 'Conflict guard');
  const before = await repo.readNote(node.path);
  await repo.updateNote(node.path, { summary: 'AI answer', detail: 'AI detail', status: 'completed' });
  const after = await repo.readNote(node.path);
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, { repo }); view.map = map([node]); view.render = () => {}; view.hydrate = async () => {};
  view.recordNoteWrite(node.path, before, after, ['summary', 'detail', 'status'], 'Research');
  await repo.updateNote(node.path, { detail: 'Manual follow-up' });
  await assert.rejects(() => view.travel(false));
  assert.equal((await repo.readNote(node.path)).detail, 'Manual follow-up');
  assert.equal(view.history.canUndo, true);
  await repo.updateNote(node.path, { detail: 'AI detail' });
  await view.travel(false);
  assert.equal((await repo.readNote(node.path)).summary, before.summary);
  assert.equal(view.history.canRedo, true);
});
integrationTest('images follow related text and inline images are not duplicated', async () => {
  const { repo } = fixture(), n = await topicNote(repo, 'Inline images');
  const reference = '**配色建議**\n![配色](https://example.com/color.jpg)\n來源：https://example.com/source';
  await repo.updateNote(n.path, { summary: '結論', detail: '### 核心結論\n\n摘要\n\n### 關鍵知識\n\n配色建議：採用低彩度。\n\n另一項建議。\n\n### 證據與來源\n\n來源', visualReferences: reference });
  let detail = (await repo.readNote(n.path)).detail;
  assert.ok(detail.indexOf('![配色]') > detail.indexOf('配色建議：'));
  assert.ok(detail.indexOf('![配色]') < detail.indexOf('另一項建議'));
  assert.doesNotMatch(detail, /### 視覺參考/);
  await repo.updateNote(n.path, { visualReferences: reference });
  detail = (await repo.readNote(n.path)).detail;
  assert.equal((detail.match(/color.jpg/g) || []).length, 1);
  assert.match((await repo.readNote(n.path)).preview, /color.jpg/);
});
integrationTest('references in synthesized notes remain clickable after rebuilding, updates and source renames', async () => {
  const { repo, contents } = fixture(); const path = await repo.createMap('References', []), mapDoc = await repo.readMap(path);
  const first = await repo.createNote('Source A', 'a', mapDoc, path, 'workspace'), second = await repo.createNote('Source B', 'a', mapDoc, path, 'workspace');
  const integrated = await repo.createNote('Integrated', 'a', mapDoc, path, 'workspace'); mapDoc.nodes.push(first, second, integrated); await repo.saveMap(path, mapDoc);
  await repo.updateNote(integrated.path, {sourcePaths: [first.path, second.path], detail: 'Knowledge'});
  await repo.rebuildDerivedData(); await repo.updateNote(integrated.path, {summary: 'Updated'}); await repo.rebuildDerivedData();
  const text = contents.get(integrated.path);
  assert.match(text, /## Reference Links/);
  assert.ok(text.includes('[[' + first.path.replace(/\.md$/, '') + ']]'));
  assert.ok(text.includes('[[' + second.path.replace(/\.md$/, '') + ']]'));
  assert.equal((text.match(/## Reference Links/g) || []).length, 1);
  assert.equal((await repo.readNote(integrated.path)).detail, 'Knowledge');
  const renamed = await repo.renameNote(first.path, 'Source renamed'); await repo.rebuildDerivedData();
  assert.ok(contents.get(integrated.path).includes('[[' + renamed.replace(/\.md$/, '') + ']]'));
  assert.deepEqual((await repo.readNote(integrated.path)).sourcePaths, [renamed, second.path]);
  const moved = await repo.moveUnique(renamed, repo.topicFolder(path, 'Unassigned'));
  await repo.rebuildDerivedData();
  assert.ok(contents.get(integrated.path).includes('[[' + moved.replace(/\.md$/, '') + ']]'));
});
integrationTest('dragging synthesized roots persists coordinates and removal preserves notes with undo', async () => {
  const {repo,app} = fixture(), path = await repo.createMap('Root operations', []), mapDoc = await repo.readMap(path);
  const first = await repo.createNote('First','a',mapDoc,path,'workspace'), second=await repo.createNote('Second','a',mapDoc,path,'workspace'); mapDoc.nodes.push(first,second);await repo.saveMap(path,mapDoc);
  let pending=Promise.resolve();
  const plugin={repo,settings:{...DEFAULT_SETTINGS},rebuildDerivedData:()=>repo.rebuildDerivedData(),askModel:async()=>({summary:'Merged',detail:'Knowledge',visualReferences:[],suggestions:[]}),mutate(work){pending=pending.then(work);return pending}};
  const {VisualAgentMapView}=load('main.ts',{obsidian},{requestAnimationFrame:run=>{run();return 1},cancelAnimationFrame(){}}); const view=new VisualAgentMapView({app},plugin);view.path=path;view.map=mapDoc;view.integrationMode=true;view.render=()=>{};view.focusNode=()=>{};view.drawEdges=()=>{};view.updateHistoryButtons=()=>{};
  await view.createIntegratedNode('Combined',[first,second],'Combine','');
  const root=view.map.nodes.find(n=>n.id!==first.id&&n.id!==second.id); assert.equal(root.parentId,null);assert.equal(view.integrationMode,false);
  const origin={x:root.x,y:root.y}; const events=new Map(),card={style:{},setPointerCapture(){},addEventListener(name,fn){events.set(name,fn)},removeEventListener(name){events.delete(name)}};
  view.enableDrag(card,root);events.get('pointerdown')({target:{closest(){return null}},button:0,clientX:10,clientY:10,pointerId:1});assert.equal(view.dragging,true);
  events.get('pointermove')({clientX:80,clientY:50});events.get('pointerup')({type:'pointerup'});await pending;
  const saved=(await repo.readMap(path)).nodes.find(n=>n.id===root.id); assert.equal(saved.x,origin.x+70);assert.equal(saved.y,origin.y+40);assert.equal(view.dragging,false);
  await view.removeToUnassigned(saved,false);assert.ok(!(await repo.readMap(path)).nodes.some(n=>n.id===root.id));assert.equal((await repo.collectionFiles(path,'Unassigned')).length,1);
  await view.travel(false);assert.ok((await repo.readMap(path)).nodes.some(n=>n.id===root.id));assert.ok(app.vault.getAbstractFileByPath(root.path));
});
integrationTest('switching the interface language preserves exact existing Markdown bytes', async () => {
  const { app, contents, repo } = fixture('zh-TW');
  const note = await topicNote(repo, '保留原文');
  const before = contents.get(note.path);
  const { default: Plugin } = load('main.ts', { obsidian });
  const plugin = new Plugin(); plugin.settings = repo.settings;
  plugin.repo = repo; plugin.saveData = async () => {}; plugin.views = () => [];
  plugin.refreshLocalizedEntrypoints = () => {}; plugin.settingTab = { update() {}, refreshAfterLanguageChange() {} };
  await plugin.changeLanguage('en');
  await plugin.changeLanguage('zh-TW');
  assert.equal(contents.get(note.path), before);
  assert.equal(await app.vault.read(app.vault.getAbstractFileByPath(note.path)), before);
});
integrationTest('Markdown reader accepts only Markdown and reads the full file without changing it', async () => {
  const api = load('ai/reference-materials.ts', { obsidian });
  const body = 'Full source sentinel\n'.repeat(30_000);
  const file = { extension: 'md', path: 'Maps/Source.md' };
  const result = await api.readMarkdownFile({ vault: { read: async selected => { assert.equal(selected, file); return body; } } }, file);
  assert.equal(result.path, file.path); assert.equal(result.content, body); assert.equal(result.external, undefined);
  await assert.rejects(api.readMarkdownFile({ vault: { read: async () => { throw new Error('should not read'); } } }, { extension: 'pdf', path: 'Source.pdf' }), /Only Markdown/);
});
integrationTest('legacy reference metadata is preserved but no longer copied when duplicating a map', async () => {
  const { repo } = fixture(); const note = await topicNote(repo, 'Reference owner', 'model');
  await repo.updateNote(note.path, { referencePaths: ['Evidence.pdf', 'Other.md'], detail: 'Keep all detail' });
  const preserved = await repo.readNote(note.path);
  assert.deepEqual(preserved.referencePaths, ['Evidence.pdf', 'Other.md']); assert.equal(preserved.detail, 'Keep all detail');
  const source = fs.readFileSync(path.join(root, 'main.ts'), 'utf8');
  assert.doesNotMatch(source, /referencePaths:\s*note\.referencePaths/);
});
integrationTest('persisted JSON validates all exchange fields and optional suggestion parent without rewriting input', async () => {
  const { AiExchangeLog } = load('ai-exchange-log.ts');
  const { PendingSuggestions } = load('pending-suggestions.ts');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vam-json-boundary-'));
  try {
    const file = path.join(directory, 'exchanges.json');
    const valid = { id: '1', startedAt: 'now', topic: 'Topic', mode: 'task', model: 'test', effort: 'low', request: 'prompt', response: 'answer', status: 'completed', error: '' };
    const invalid = Object.keys(valid).map(key => ({ ...valid, [key]: 12 }));
    const text = JSON.stringify([valid, ...invalid, { ...valid, status: 'unknown' }]); fs.writeFileSync(file, text);
    const errors = []; const log = new AiExchangeLog(file, error => errors.push(error)); await log.load();
    assert.equal(log.getEntries().length, 0); assert.equal(errors.length, 1);
    log.begin({ ...valid, id: 'new' }); await log.flush(); assert.equal(fs.readFileSync(file, 'utf8'), text);
    const proposals = path.join(directory, 'suggestions.json');
    fs.writeFileSync(proposals, JSON.stringify([['topic.md', [{ title: 'A', task: 'B', contribution: 'C' }, { title: 'A', task: 'B', contribution: 'C', parentTitle: 12 }]]]));
    const pending = new PendingSuggestions(proposals, error => errors.push(error)); await pending.load();
    assert.equal(pending.size, 0); const original = fs.readFileSync(proposals, 'utf8');
    pending.set('new.md', [{ title: 'New', task: '', contribution: '' }]); await assert.rejects(pending.flush());
    assert.equal(fs.readFileSync(proposals, 'utf8'), original);
    for (const Store of [AiExchangeLog, PendingSuggestions]) {
      const failures = []; const broken = new Store(file, error => failures.push(error));
      fs.writeFileSync(file, '{broken'); await broken.load(); assert.equal(failures.length, 1);
      fs.rmSync(file); const missing = new Store(file, error => failures.push(error)); await missing.load(); assert.equal(failures.length, 1);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

integrationTest('repository: titles differing only in case get distinct file names, existing files are untouched', async () => {
  const { repo, app } = fixture('en');
  const mapPath = await repo.createMap('Case map', []);
  const map = await repo.readMap(mapPath);
  const first = await repo.createNote('Apple', 'gpt-6-luna', map, mapPath, 'workspace');
  const second = await repo.createNote('apple', 'gpt-6-luna', map, mapPath, 'workspace');
  assert.notEqual(first.path.toLowerCase(), second.path.toLowerCase());
  assert.match(second.path, / 2\.md$/);
  assert.ok(app.vault.getAbstractFileByPath(first.path));
  assert.equal(first.path.endsWith('/Apple.md'), true);
});

integrationTest('topic remembers its content template and format issues in frontmatter', async () => {
  const { repo, app } = fixture('en');
  const map = { id: 'm', title: 'M', version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
  const mapPath = 'Agent Workspace/Topics/M/Map.md';
  await repo.ensureTopicFolders('Agent Workspace/Topics/M'); await app.vault.create(mapPath, core.serializeMap(map));
  const node = await repo.createNote('T', 'model-a', map, mapPath, 'workspace');
  assert.equal((await repo.readNote(node.path)).detailTemplateId, undefined);
  assert.deepEqual(plain((await repo.readNote(node.path)).detailFormatIssues), []);
  await repo.updateNote(node.path, { detailTemplateId: 't1', detailFormatIssues: ['Examples: need 3, got 2'] });
  let note = await repo.readNote(node.path);
  assert.equal(note.detailTemplateId, 't1'); assert.deepEqual(plain(note.detailFormatIssues), ['Examples: need 3, got 2']);
  const raw = await app.vault.read(app.vault.getAbstractFileByPath(node.path));
  assert.match(raw, /detail-template: "?t1"?/);
  await repo.updateNote(node.path, { detailTemplateId: '', detailFormatIssues: [] });
  note = await repo.readNote(node.path);
  assert.equal(note.detailTemplateId, undefined); assert.deepEqual(plain(note.detailFormatIssues), []);
  assert.doesNotMatch(await app.vault.read(app.vault.getAbstractFileByPath(node.path)), /detail-format-issues|detail-template/);
});
integrationTest('topic remembers its tone override in frontmatter `tone`; clearing removes it', async () => {
  const { repo, app } = fixture('en');
  const map = { id: 'm', title: 'M', version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
  const mapPath = 'Agent Workspace/Topics/M/Map.md';
  await repo.ensureTopicFolders('Agent Workspace/Topics/M'); await app.vault.create(mapPath, core.serializeMap(map));
  const node = await repo.createNote('T', 'model-a', map, mapPath, 'workspace');
  assert.equal((await repo.readNote(node.path)).toneId, undefined);
  await repo.updateNote(node.path, { toneId: 'magazine' });
  assert.equal((await repo.readNote(node.path)).toneId, 'magazine');
  assert.match(await app.vault.read(app.vault.getAbstractFileByPath(node.path)), /tone: "?magazine"?/);
  await repo.updateNote(node.path, { toneId: '' });
  assert.equal((await repo.readNote(node.path)).toneId, undefined);
  assert.doesNotMatch(await app.vault.read(app.vault.getAbstractFileByPath(node.path)), /^tone:/m);
});
integrationTest('visual reference without a related paragraph goes before the sources section (zh and en)', async () => {
  const { canonicalDetail } = load('ai/result-utils.ts');
  const reference = '**Pic**\n\n![Pic](https://x/y.png)\n\nSource: https://x';
  {
    const { repo } = fixture('en'); const n = await topicNote(repo, 'English picture');
    await repo.updateNote(n.path, { detail: canonicalDetail('### Key knowledge\n\nK', 'en'), visualReferences: reference });
    const detail = (await repo.readNote(n.path)).detail;
    assert.ok(detail.indexOf('**Pic**') > detail.indexOf('\nK\n'), 'after the knowledge text');
    assert.ok(detail.indexOf('**Pic**') < detail.indexOf('### Evidence and sources'), 'before the sources section');
  }
  {
    const { repo } = fixture(); const n = await topicNote(repo, '中文圖片');
    await repo.updateNote(n.path, { detail: canonicalDetail('### 關鍵知識\n\nK', 'zh-TW'), visualReferences: reference });
    const detail = (await repo.readNote(n.path)).detail;
    assert.ok(detail.indexOf('**Pic**') > detail.indexOf('\nK\n'));
    assert.ok(detail.indexOf('**Pic**') < detail.indexOf('### 證據與來源'));
  }
  {
    const { repo } = fixture('en'); const n = await topicNote(repo, 'No sources picture');
    const template = { id: 't1', name: 'T', sections: [{ id: 'a', name: 'A', description: '', role: 'none', aliases: [] }, { id: 'b', name: 'B', description: '', role: 'log', aliases: [] }] };
    await repo.updateNote(n.path, { detail: canonicalDetail('### A\n\nK', 'en', template), visualReferences: reference }, { detailTemplate: template });
    const detail = (await repo.readNote(n.path)).detail;
    assert.ok(detail.indexOf('**Pic**') > detail.indexOf('### B'), 'at the end');
    assert.match(detail, /Source: https:\/\/x$/);
  }
});
integrationTest('visual reference placement: a sources alias equal to another section name is not the sources heading', async () => {
  const { canonicalDetail } = load('ai/result-utils.ts');
  const reference = '**Pic**\n\n![Pic](https://x/y.png)\n\nSource: https://x';
  const { repo } = fixture('en'); const n = await topicNote(repo, 'Alias picture');
  const template = { id: 't1', name: 'T', sections: [
    { id: 'a', name: 'A', description: '', role: 'none', aliases: [] },
    { id: 'n', name: 'Notes', description: '', role: 'none', aliases: [] },
    { id: 'r', name: 'Refs', description: '', role: 'sources', aliases: ['Notes'] }] };
  await repo.updateNote(n.path, { detail: canonicalDetail('### A\n\nK\n\n### Notes\n\nN\n\n### Refs\n\nE', 'en', template), visualReferences: reference }, { detailTemplate: template });
  const detail = (await repo.readNote(n.path)).detail;
  assert.ok(detail.indexOf('**Pic**') > detail.indexOf('\nN\n'), 'after the Notes section text');
  assert.ok(detail.indexOf('**Pic**') < detail.indexOf('### Refs'), 'before the sources section');
});
integrationTest('legacy Visual References section moves into Detail before the Standard sources heading on rebuild (zh and en)', async () => {
  const { canonicalDetail } = load('ai/result-utils.ts');
  const legacy = '\n\n## Visual References\n\n**Pic**\n\n![Pic](https://x/y.png)\n\nSource: https://x\n';
  for (const [language, knowledge, sources] of [['zh-TW', '關鍵知識', '證據與來源'], ['en', 'Key knowledge', 'Evidence and sources']]) {
    const { repo, contents } = fixture(language); const n = await topicNote(repo, `Legacy ${language}`);
    await repo.updateNote(n.path, { detail: canonicalDetail(`### ${knowledge}\n\nK`, language) });
    contents.set(n.path, `${contents.get(n.path).trimEnd()}${legacy}`);
    await repo.rebuildDerivedData();
    const raw = contents.get(n.path);
    assert.doesNotMatch(raw, /## Visual References/, language);
    const detail = (await repo.readNote(n.path)).detail;
    const image = detail.indexOf('![Pic](https://x/y.png)');
    assert.ok(image > detail.indexOf(`### ${knowledge}\n\nK`), `${language}: after the key knowledge text\n${detail}`);
    assert.ok(image < detail.indexOf(`### ${sources}`), `${language}: before the sources heading\n${detail}`);
    assert.match(detail, new RegExp(`### ${knowledge}\\n\\nK\\n\\n\\*\\*Pic\\*\\*\\n\\n!\\[Pic\\]\\(https://x/y\\.png\\)\\n\\nSource: https://x\\n\\n### ${sources}`), language);
  }
});

// Merge topics: structure merge with a real repository fixture.
const mergeHarness = async ({ details = ['Alpha detail', '', 'Gamma detail'], parentModel = 'a', parentSource = 'workspace', shim = obsidian, origin } = {}) => {
  const {repo,app,contents} = fixture(), path = await repo.createMap('Merge ops', []), mapDoc = await repo.readMap(path);
  const names = ['Alpha', 'Beta', 'Gamma'], kids = {};
  const parent = await repo.createNote('Parent',parentModel,mapDoc,path,parentSource); mapDoc.nodes.push(parent);
  const sources = [];
  for (const [index, name] of names.entries()) {
    const n = await repo.createNote(name,'a',mapDoc,path,'workspace',{detail: details[index]}); n.parentId = parent.id; n.x = 400; n.y = 300 - index * 100; mapDoc.nodes.push(n); sources.push(n);
    if (origin && index === 0) await repo.updateNote(n.path, { thinkingOrigin: origin });
  }
  const kid = await repo.createNote('Alpha child','a',mapDoc,path,'workspace'); kid.parentId = sources[0].id; mapDoc.nodes.push(kid);
  await repo.saveMap(path, mapDoc);
  let pending=Promise.resolve();
  const plugin={repo,settings:{...DEFAULT_SETTINGS},rebuildDerivedData:()=>repo.rebuildDerivedData(),mutate(work){pending=pending.then(work);return pending},running:new Set(),quickExpandPending:new Set(),activeTasks:new Map(),expansionBatches:new Map()};
  const {VisualAgentMapView}=load('main.ts',{obsidian:shim},{requestAnimationFrame:run=>{run();return 1},cancelAnimationFrame(){}}); const view=new VisualAgentMapView({app},plugin);
  view.path=path;view.map=mapDoc;view.render=()=>{};view.focusNode=()=>{};view.drawEdges=()=>{};view.updateHistoryButtons=()=>{};
  await view.hydrate();
  const fm = file => { const text = contents.get(file) ?? ''; const get = key => text.match(new RegExp('^' + key + ': (.*)$', 'm'))?.[1]?.trim(); return { state: get('topic-state'), mapId: get('agent-map-id'), status: get('status') }; };
  const shape = async () => { const m = await repo.readMap(path); return { nodes: m.nodes.map(n => [n.id, n.path, n.parentId]), files: Object.fromEntries(m.nodes.map(n => [n.path, fm(n.path)])), unassigned: (await repo.collectionFiles(path,'Unassigned')).map(f => f.path).sort() }; };
  const merge = async title => { view.multiSelected = new Set(sources.map(n => n.id)); const sel = view.mergeCheck(); assert.equal(sel.ok, true); await view.mergeSelected(title, { path, mapId: mapDoc.id, sources: sel.sources.map(n => ({ id: n.id, path: n.path })) }); };
  return {repo,app,contents,path,mapDoc,parent,sources,kid,view,plugin,fm,shape,merge};
};
integrationTest('merging sibling topics builds the new note, moves sources to Unassigned and re-parents their children', async () => {
  const h = await mergeHarness(); const before = await h.shape(); const historyBefore = h.view.history.canUndo;
  const sourceIds = h.sources.map(n => n.id), sourcePaths = h.sources.map(n => n.path);
  await h.merge('Merged'); 
  const m = await h.repo.readMap(h.path); const merged = m.nodes.find(n => !sourceIds.includes(n.id) && n.id !== h.parent.id && n.id !== h.kid.id);
  assert.ok(merged); assert.equal(merged.parentId, h.parent.id); assert.ok(merged.path.includes('/Notes/'));
  // Reading order is Gamma (y=100), Beta (200), Alpha (300): the new card sits where Gamma was.
  assert.deepEqual([merged.x, merged.y], [400, 100]); assert.equal(m.nodes.findIndex(n => n.id === merged.id), 1);
  assert.equal(m.nodes.some(n => sourceIds.includes(n.id)), false);
  assert.equal(m.nodes.find(n => n.id === h.kid.id).parentId, merged.id);
  const note = await h.repo.readNote(merged.path);
  assert.equal(note.detail.trim(), '### Gamma\n\nGamma detail\n\n### Alpha\n\nAlpha detail'); assert.equal(h.fm(merged.path).status, 'completed');
  const unassigned = (await h.repo.collectionFiles(h.path,'Unassigned')).map(f => f.path);
  assert.equal(unassigned.length, 3);
  for (const file of unassigned) { assert.equal(h.fm(file).state, 'unassigned'); }
  assert.equal(note.sourcePaths.length, 3); assert.deepEqual([...note.sourcePaths].sort(), unassigned.slice().sort());
  assert.equal(sourcePaths.some(p => h.app.vault.getAbstractFileByPath(p)), false);
  assert.equal(h.view.selected, merged.id); assert.equal(h.view.integrationMode, false);
  assert.equal(h.view.history.undoEntry.label, 'Merge topics');
  assert.notEqual(historyBefore, undefined); assert.ok(before.nodes.length === 5);
});
integrationTest('merging empty topics gives an idea note with an empty Detail', async () => {
  const h = await mergeHarness({ details: ['', '', ''] });
  await h.merge('Blank merge');
  const merged = (await h.repo.readMap(h.path)).nodes.find(n => n.path.includes('Blank merge'));
  assert.equal(h.fm(merged.path).status, 'idea'); assert.equal((await h.repo.readNote(merged.path)).detail.trim(), '');
});
integrationTest('one undo restores the sources exactly; redo and a second undo repeat it', async () => {
  const h = await mergeHarness(); const original = await h.shape();
  await h.merge('Merged'); const merged = await h.shape();
  assert.notDeepEqual(merged.nodes, original.nodes);
  await h.view.travel(false); const undone = await h.shape();
  assert.deepEqual(undone.nodes, original.nodes, 'ids, original full paths and parents are back');
  for (const source of h.sources) assert.deepEqual(h.fm(source.path), { ...h.fm(source.path), state: 'active', mapId: h.mapDoc.id });
  assert.equal(undone.unassigned.length, 1, 'only the merged note waits in Unassigned');
  assert.equal(h.fm(undone.unassigned[0]).state, 'unassigned');
  assert.equal((await h.repo.readMap(h.path)).nodes.find(n => n.id === h.kid.id).parentId, h.sources[0].id);
  await h.view.travel(true); assert.deepEqual(await h.shape(), merged);
  await h.view.travel(false); assert.deepEqual(await h.shape(), undone);
  await h.view.travel(true); assert.deepEqual(await h.shape(), merged);
  assert.equal(h.view.history.canUndo, true); h.view.history.undo(); assert.equal(h.view.history.canUndo, false, 'the merge was exactly one history entry');
});
integrationTest('a failure while moving a source rolls the files, lifecycle and map back and parks the new note', async () => {
  const h = await mergeHarness(); const original = await h.shape(); const originalMap = JSON.stringify((await h.repo.readMap(h.path)).nodes);
  const move = h.repo.moveUnique.bind(h.repo); let calls = 0;
  h.repo.moveUnique = async (...args) => { calls++; if (calls === 2) throw new Error('disk full'); return move(...args); };
  await assert.rejects(() => h.merge('Merged'), /disk full/);
  h.repo.moveUnique = move;
  const after = await h.shape();
  assert.deepEqual(JSON.stringify((await h.repo.readMap(h.path)).nodes), originalMap);
  for (const source of h.sources) { assert.ok(h.app.vault.getAbstractFileByPath(source.path)); assert.equal(h.fm(source.path).state, 'active'); assert.equal(h.fm(source.path).mapId, h.mapDoc.id); }
  assert.equal(after.unassigned.length, 1, 'the new note is parked, not deleted');
  assert.equal(h.fm(after.unassigned[0]).state, 'unassigned');
  assert.equal(h.view.history.canUndo, false, 'no history entry after a failed merge');
  assert.deepEqual(after.nodes, original.nodes);
});
integrationTest('a failed saveMap during a merge also restores everything', async () => {
  const h = await mergeHarness(); const original = await h.shape();
  const save = h.repo.saveMap.bind(h.repo); let calls = 0;
  h.repo.saveMap = async (...args) => { calls++; if (calls === 1) throw new Error('map locked'); return save(...args); };
  await assert.rejects(() => h.merge('Merged'), /map locked/);
  h.repo.saveMap = save;
  const after = await h.shape(); assert.deepEqual(after.nodes, original.nodes);
  for (const source of h.sources) assert.equal(h.fm(source.path).state, 'active');
  assert.equal(after.unassigned.length, 1); assert.equal(h.view.history.canUndo, false);
});
integrationTest('merge is refused while a selected topic has an AI task running, and writes nothing', async () => {
  const h = await mergeHarness(); const original = await h.shape();
  h.plugin.running.add(h.sources[1].path);
  h.view.multiSelected = new Set(h.sources.map(n => n.id));
  assert.deepEqual(plain(h.view.mergeCheck()), { ok: false, reason: 'ui.merge_busy' });
  await h.view.mergeSelected('Merged', { path: h.path, mapId: h.mapDoc.id, sources: h.sources.map(n => ({ id: n.id, path: n.path })) });
  assert.deepEqual(await h.shape(), original); assert.equal(h.view.history.canUndo, false);
});
// Merge topics, AI merge: a stubbed model, a real repository, the real view code.
const aiMergeHarness = async (options = {}) => {
  const dom = require('../support-dom.cjs'), notices = [];
  const shim = { ...obsidian, Notice: dom.makeNotice(notices), Modal: dom.makeModal() };
  const h = await mergeHarness({ shim, ...options });
  h.repo.settings.cliModel = 'claude:sonnet'; h.plugin.settings.cliModel = 'claude:sonnet';
  let queue = Promise.resolve(); h.plugin.mutate = work => { const result = queue.then(work); queue = result.catch(() => {}); return result; };
  h.notices = notices; h.asks = []; h.usage = []; h.started = 0; h.failures = [];
  h.answer = async () => ({ summary: 'Merged one-liner', detail: '### Facts\n\nAlpha detail and Gamma detail', visualReferences: [], formatIssues: [], suggestions: [] });
  h.plugin.askModel = async (context, model, reasoning, signal) => { h.asks.push({ context, model, reasoning }); return h.answer(signal, context); };
  h.plugin.confirmAiUsage = async (model, run) => { h.usage.push(model); if (h.decline) return false; await run(); return true; };
  h.plugin.recordFailure = (label, error) => { h.failures.push(label); return `${label}: ${error.message}`; };
  h.files = () => [...h.contents.entries()].sort(([a], [b]) => a.localeCompare(b));
  h.snapshot = () => ({ id: h.mapDoc.id, parentId: h.parent.id, path: h.path, mapId: h.mapDoc.id, sources: h.sources.map(n => ({ id: n.id, path: n.path })) });
  h.begin = async (title = 'AI merged', signal = new AbortController().signal) => {
    h.view.multiSelected = new Set(h.sources.map(n => n.id));
    const check = h.view.mergeCheck(); assert.equal(check.ok, true);
    const snapshot = { path: h.path, mapId: h.mapDoc.id, parentId: check.parentId, sources: check.sources.map(n => ({ id: n.id, path: n.path })) };
    const began = await h.view.startMergeDraft(title, snapshot, () => { h.started++; }, signal);
    return { began, task: h.view.mergeTasks.get(h.path), snapshot };
  };
  h.untilSettled = async task => { await task.run; };
  h.confirm = (task, summary = task.draft.summary, detail = task.draft.detail, name) => h.view.confirmMergeDraft(task, summary, detail, name);
  return h;
};
const abortable = signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
integrationTest('AI merge: usage notice first, a background task, a draft with one Notice, and nothing written until it is confirmed', async () => {
  const h = await aiMergeHarness(); const original = await h.shape(); const files = h.files();
  const { began, task: live } = await h.begin();
  assert.equal(began, true);
  assert.equal(h.usage.length, 1); assert.equal(h.started, 1);
  assert.equal(live.state, 'running', 'running (with Stop) before the model answers');
  await h.untilSettled(live);
  assert.equal(live.state, 'draft'); assert.equal(live.draft.summary, 'Merged one-liner');
  assert.deepEqual(h.notices.filter(m => /merge draft/.test(m)), ['The merge draft for “AI merged” is ready']);
  assert.deepEqual(h.files(), files, 'the draft writes no file'); assert.deepEqual(await h.shape(), original); assert.equal(h.view.history.canUndo, false);
  // Sources keep their lock while the draft waits, so the same cards cannot be merged twice.
  h.view.multiSelected = new Set(h.sources.map(n => n.id));
  assert.deepEqual(plain(h.view.mergeCheck()), { ok: false, reason: 'ui.merge_busy' });
});
integrationTest('AI merge: the model sees the sources but no Thinking Origin, with the merge task and local synthesize settings', async () => {
  const h = await aiMergeHarness({ origin: 'SECRET-ORIGIN-TEXT' });
  const { task } = await h.begin(); await h.untilSettled(task);
  const { context } = h.asks[0]; assert.equal(h.asks.length, 1);
  const text = JSON.stringify(context.referenceGroups);
  assert.match(text, /Alpha detail/); assert.match(text, /Gamma detail/); assert.doesNotMatch(text, /SECRET-ORIGIN-TEXT/);
  assert.equal(context.referenceGroups.length, 1); assert.equal(context.mode, 'merge'); assert.equal(context.researchMode, 'local'); assert.equal(context.visualMode, 'off'); assert.equal(context.referenceDelivery, 'direct');
  assert.equal(context.task, load('experiences/visual-map/steps/fragments.ts').mergeGoalTask(h.plugin.settings.language));
  // Integration still sends the Origin (the option defaults on).
  const group = await h.view.topicReferenceGroup(h.sources, 'strong');
  assert.match(JSON.stringify(group.documents), /SECRET-ORIGIN-TEXT/);
  assert.deepEqual(await h.view.topicReferenceGroup(h.sources, 'strong', { origin: true }), group);
});
integrationTest('AI merge: confirming writes the draft through the structure merge in one history step (undo, redo, undo)', async () => {
  const h = await aiMergeHarness(); const original = await h.shape();
  const { task } = await h.begin('Merged by AI'); await h.untilSettled(task);
  await h.confirm(task, 'Edited summary', '### Facts\n\nEdited by the user');
  const m = await h.repo.readMap(h.path); const sourceIds = h.sources.map(n => n.id);
  const merged = m.nodes.find(n => n.path.includes('Merged by AI')); assert.ok(merged);
  assert.equal(m.nodes.some(n => sourceIds.includes(n.id)), false); assert.equal(merged.parentId, h.parent.id);
  assert.equal(m.nodes.find(n => n.id === h.kid.id).parentId, merged.id);
  const note = await h.repo.readNote(merged.path);
  assert.equal(note.summary, 'Edited summary'); assert.match(note.detail, /Edited by the user/); assert.equal(h.fm(merged.path).status, 'completed');
  assert.equal(note.modelSource, 'inherited'); assert.equal(note.model, 'claude:sonnet');
  const unassigned = (await h.repo.collectionFiles(h.path, 'Unassigned')).map(f => f.path);
  assert.equal(unassigned.length, 3); assert.deepEqual([...note.sourcePaths].sort(), unassigned.slice().sort());
  for (const file of unassigned) assert.equal(h.fm(file).state, 'unassigned');
  assert.equal(h.view.mergeTasks.size, 0, 'the task ends with the write'); assert.equal(h.view.history.undoEntry.label, 'Merge topics');
  const done = await h.shape();
  await h.view.travel(false); assert.deepEqual((await h.shape()).nodes, original.nodes);
  await h.view.travel(true); assert.deepEqual(await h.shape(), done);
  await h.view.travel(false); assert.deepEqual((await h.shape()).nodes, original.nodes);
  h.view.history.undo(); assert.equal(h.view.history.canUndo, false, 'exactly one history entry');
});
integrationTest('AI merge: the AI names the topic in the same single request; the review name is what the note and card get', async () => {
  const h = await aiMergeHarness();
  h.answer = async () => ({ summary: 'S', detail: '### Facts\n\nAlpha detail', visualReferences: [], formatIssues: [], suggestions: [{ title: 'AI chosen name', task: '', contribution: '', parentTitle: '' }] });
  const { task } = await h.begin('Fallback title'); await h.untilSettled(task);
  assert.equal(h.asks.length, 1, 'no extra AI call for the name'); assert.notEqual(h.asks[0].context.title, 'Fallback title');
  assert.equal(task.state, 'draft'); assert.equal(task.title, 'AI chosen name');
  assert.deepEqual(h.notices.filter(m => /merge draft/.test(m)), ['The merge draft for “AI chosen name” is ready']);
  await h.confirm(task, 'S', '### Facts\n\nAlpha detail', '  Renamed by user  ');
  const m = await h.repo.readMap(h.path); const merged = m.nodes.find(n => n.path.includes('Renamed by user')); assert.ok(merged);
  assert.equal(m.nodes.some(n => n.path.includes('AI chosen name')), false);
  assert.equal((await h.repo.readNote(merged.path)).title, 'Renamed by user');
  assert.match(h.contents.get(merged.path), /^# Renamed by user$/m);
});
integrationTest('AI merge: confirming without editing keeps the AI name; a blank edit falls back to it', async () => {
  for (const name of [undefined, '   ']) {
    const h = await aiMergeHarness();
    h.answer = async () => ({ summary: 'S', detail: 'D', visualReferences: [], formatIssues: [], suggestions: [{ title: 'AI chosen name', task: '', contribution: '', parentTitle: '' }] });
    const { task } = await h.begin('Fallback title'); await h.untilSettled(task);
    await h.confirm(task, 'S', 'D', name);
    assert.ok((await h.repo.readMap(h.path)).nodes.some(n => n.path.includes('AI chosen name')));
  }
});
integrationTest('AI merge: a missing, blank or over-long AI name falls back to the first source title', async () => {
  for (const suggestions of [[], [{ title: '  ', task: '', contribution: '', parentTitle: '' }], [{ title: 'x'.repeat(200), task: '', contribution: '', parentTitle: '' }]]) {
    const h = await aiMergeHarness();
    h.answer = async () => ({ summary: 'S', detail: 'D', visualReferences: [], formatIssues: [], suggestions });
    const { task } = await h.begin('Fallback title'); await h.untilSettled(task);
    assert.equal(task.state, 'draft'); assert.equal(task.title, 'Fallback title');
    await h.confirm(task);
    assert.ok((await h.repo.readMap(h.path)).nodes.some(n => n.path.includes('Fallback title')));
  }
});
integrationTest('AI merge model: the nearest manual parent model is used for the usage notice, the request and the new note; a workspace parent follows the workspace model', async () => {
  const manual = await aiMergeHarness({ parentModel: 'claude:haiku', parentSource: 'manual' });
  const { task } = await manual.begin('M'); await manual.untilSettled(task);
  assert.deepEqual([manual.usage, manual.asks.map(a => a.model), task.model], [['claude:haiku'], ['claude:haiku'], 'claude:haiku']);
  await manual.confirm(task);
  const merged = (await manual.repo.readMap(manual.path)).nodes.find(n => n.path.endsWith('M.md'));
  const note = await manual.repo.readNote(merged.path); assert.equal(note.model, 'claude:haiku'); assert.equal(note.modelSource, 'inherited');
  const workspace = await aiMergeHarness();
  const run = await workspace.begin('W'); await workspace.untilSettled(run.task);
  assert.deepEqual([workspace.usage, workspace.asks.map(a => a.model)], [['claude:sonnet'], ['claude:sonnet']]);
});
integrationTest('structure merge also takes the parent-resolved model (manual parent inherits, workspace parent stays workspace)', async () => {
  const h = await mergeHarness({ parentModel: 'claude:haiku', parentSource: 'manual' });
  await h.merge('Plain');
  const merged = (await h.repo.readMap(h.path)).nodes.find(n => n.path.includes('Plain'));
  const note = await h.repo.readNote(merged.path); assert.equal(note.model, 'claude:haiku'); assert.equal(note.modelSource, 'inherited');
  const w = await mergeHarness(); w.repo.settings.cliModel = 'claude:opus';
  await w.merge('Plain');
  const wm = await w.repo.readNote((await w.repo.readMap(w.path)).nodes.find(n => n.path.includes('Plain')).path);
  assert.equal(wm.model, 'claude:opus'); assert.equal(wm.modelSource, 'inherited');
});
integrationTest('AI merge: declining the usage notice, or closing before it is answered, starts nothing', async () => {
  const h = await aiMergeHarness(); const files = h.files(); h.decline = true;
  const out = await h.begin();
  assert.equal(out.began, false); assert.equal(h.started, 0); assert.equal(h.asks.length, 0); assert.equal(h.view.mergeTasks.size, 0); assert.deepEqual(h.files(), files);
  h.decline = false; const gone = new AbortController(); gone.abort();
  const closed = await h.begin('x', gone.signal);
  assert.equal(closed.began, false); assert.equal(h.asks.length, 0); assert.equal(h.view.mergeTasks.size, 0);
});
integrationTest('AI merge: Stop before or after the request, an AI failure and closing the view leave every file and the map untouched', async () => {
  for (const scenario of ['stop', 'fail', 'close']) {
    const h = await aiMergeHarness(); const original = await h.shape(); const files = h.files();
    h.answer = signal => scenario === 'fail' ? Promise.reject(new Error('provider down')) : abortable(signal);
    const { task } = await h.begin();
    assert.equal(task.state, 'running');
    if (scenario === 'stop') h.view.stopMergeTask(task);
    if (scenario === 'close') { h.view.closed = true; for (const t of h.view.mergeTasks.values()) t.controller.abort(); }
    await h.untilSettled(task);
    assert.deepEqual(h.files(), files, scenario); assert.deepEqual(await h.shape(), original, scenario); assert.equal(h.view.history.canUndo, false, scenario);
    if (scenario === 'stop') assert.equal(h.view.mergeTasks.size, 0);
    if (scenario === 'fail') { assert.equal(task.state, 'failed'); assert.deepEqual(h.failures, ['AI merge failed']); assert.ok(h.notices.some(m => /AI merge failed: provider down/.test(m))); }
    else assert.equal(h.notices.some(m => /merge draft|AI merge failed/.test(m)), false, `${scenario}: no Notice`);
  }
});
integrationTest('AI merge: a result that arrives after Stop is dropped (no task, no Notice, no write)', async () => {
  const h = await aiMergeHarness(); const files = h.files(); let release;
  h.answer = () => new Promise(resolve => { release = () => resolve({ summary: 'late', detail: 'late', visualReferences: [], formatIssues: [], suggestions: [] }); });
  const { task } = await h.begin(); await new Promise(r => setImmediate(r));
  h.view.stopMergeTask(task); release(); await h.untilSettled(task);
  assert.equal(h.view.mergeTasks.size, 0); assert.equal(task.state, 'running'); assert.equal(h.notices.length, 0); assert.deepEqual(h.files(), files);
});
integrationTest('AI merge: a source that changes while the model runs fails the task with the stale message and writes nothing', async () => {
  const h = await aiMergeHarness(); const files = h.files();
  h.answer = async () => { await h.repo.updateNote(h.sources[0].path, { detail: 'Changed meanwhile' }); return { summary: 's', detail: 'd', visualReferences: [], formatIssues: [], suggestions: [] }; };
  const { task } = await h.begin(); await h.untilSettled(task);
  assert.equal(task.state, 'failed'); assert.equal(task.message, 'A source topic changed or left the map, so the merge draft was not saved');
  assert.equal(h.notices.some(m => /merge draft for/.test(m)), false);
  assert.equal(h.view.history.canUndo, false); assert.equal((await h.repo.readMap(h.path)).nodes.length, 5);
  assert.notDeepEqual(h.files(), files, 'only the test edit changed a file');
});
integrationTest('AI merge: confirming a stale draft (source edited, source removed, other map) is refused, marks the task failed and writes nothing', async () => {
  const cases = {
    edited: async h => { await h.repo.updateNote(h.sources[0].path, { detail: 'Edited after the draft' }); },
    removed: async h => { h.view.map.nodes = h.view.map.nodes.filter(n => n.id !== h.sources[1].id); },
    otherMap: async h => { h.view.map = { ...h.view.map, id: 'another-map' }; }
  };
  for (const [name, change] of Object.entries(cases)) {
    const h = await aiMergeHarness();
    const { task } = await h.begin(); await h.untilSettled(task); assert.equal(task.state, 'draft');
    await change(h);
    const files = h.files(); const nodes = JSON.stringify(h.view.map.nodes); const created = (await h.repo.readMap(h.path)).nodes.length;
    await assert.rejects(() => h.confirm(task), /A source topic changed or left the map/, name);
    assert.equal(task.state, 'failed', name); assert.equal(task.message, 'A source topic changed or left the map, so the merge draft was not saved', name);
    assert.deepEqual(h.files(), files, `${name}: no file created or moved`); assert.equal(JSON.stringify(h.view.map.nodes), nodes, name);
    assert.equal((await h.repo.readMap(h.path)).nodes.length, created, name); assert.equal(h.view.history.canUndo, false, name);
    await assert.rejects(() => h.confirm(task), /A source topic changed/, 'a failed task cannot be confirmed later');
  }
});
integrationTest('AI merge: a second Merge press reports a running merge or reopens the draft, and a failed one is cleared', async () => {
  const h = await aiMergeHarness(); let release;
  h.answer = () => new Promise(resolve => { release = () => resolve({ summary: 's', detail: 'd', visualReferences: [], formatIssues: [], suggestions: [] }); });
  const reviews = []; h.view.reviewMergeDraft = task => reviews.push(task);
  const { task } = await h.begin(); await new Promise(r => setImmediate(r));
  h.view.multiSelected = new Set(h.sources.map(n => n.id));
  h.view.openMerge(); assert.deepEqual(h.notices.slice(-1), ['AI running…']); assert.equal(reviews.length, 0);
  release(); await h.untilSettled(task);
  h.view.openMerge(); assert.deepEqual(reviews, [task], 'a finished draft opens for review');
  task.state = 'failed'; h.view.app = {}; h.view.multiSelected = new Set(h.sources.map(n => n.id));
  h.view.openMerge(); assert.equal(h.view.mergeTasks.size, 0, 'a failed task is cleared before a new dialog');
});
integrationTest('AI merge: reviewing from another map only asks to open the map, and Stop on the bar forgets the draft', async () => {
  const h = await aiMergeHarness(); const { task } = await h.begin(); await h.untilSettled(task);
  const keep = h.view.path; h.view.path = 'Agent Workspace/Topics/other/Map.md';
  h.view.reviewMergeDraft(task);
  assert.deepEqual(h.notices.slice(-1), [`Open the map “${task.mapTitle}” first to review the merge draft`]);
  h.view.path = keep; h.view.stopMergeTask(task); assert.equal(h.view.mergeTasks.size, 0);
});
integrationTest('AI merge: a failure while moving a source rolls everything back and the draft stays confirmable', async () => {
  const h = await aiMergeHarness(); const original = await h.shape(); const nodes = JSON.stringify((await h.repo.readMap(h.path)).nodes);
  const { task } = await h.begin(); await h.untilSettled(task);
  const move = h.repo.moveUnique.bind(h.repo); let calls = 0;
  h.repo.moveUnique = async (...args) => { calls++; if (calls === 2) throw new Error('disk full'); return move(...args); };
  await assert.rejects(() => h.confirm(task), /disk full/);
  h.repo.moveUnique = move;
  const after = await h.shape();
  assert.equal(JSON.stringify((await h.repo.readMap(h.path)).nodes), nodes); assert.deepEqual(after.nodes, original.nodes);
  for (const source of h.sources) { assert.ok(h.app.vault.getAbstractFileByPath(source.path)); assert.equal(h.fm(source.path).state, 'active'); }
  assert.equal(after.unassigned.length, 1, 'the new note is parked, not deleted'); assert.equal(h.view.history.canUndo, false);
  assert.equal(task.state, 'draft', 'the user can try again'); assert.equal(h.view.mergeTasks.get(h.path), task);
  await h.confirm(task); assert.equal(h.view.mergeTasks.size, 0);
  assert.equal((await h.repo.readMap(h.path)).nodes.some(n => h.sources.some(s => s.id === n.id)), false);
});
async function modelTree(sources, stored = 'gpt-5.6-luna') {
  const { repo, app, contents } = fixture(); repo.settings.cliModel = 'claude:sonnet';
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
  await repo.ensureTopicFolders('Agent Workspace/Topics/map-a'); await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const nodes = [];
  for (const [index, [source, model]] of sources.entries()) {
    const created = await repo.createNote(`T${index}`, model ?? stored, mapDoc, mapPath, source);
    created.parentId = index ? nodes[index - 1].id : null; mapDoc.nodes.push(created); nodes.push(created);
  }
  await repo.saveMap(mapPath, mapDoc);
  return { repo, contents, nodes, mapDoc, mapPath };
}
integrationTest('a workspace topic runs on the current workspace model; the stored snapshot is never rewritten', async () => {
  const { repo, contents, nodes } = await modelTree([['workspace']]);
  const before = contents.get(nodes[0].path);
  const note = await repo.readNote(nodes[0].path);
  assert.equal(note.model, 'claude:sonnet'); assert.equal(note.modelSource, 'workspace');
  assert.match(before, /model: gpt-5\.6-luna/);
  assert.equal(contents.get(nodes[0].path), before);
  repo.settings.cliModel = 'claude:opus';
  assert.equal((await repo.readNote(nodes[0].path)).model, 'claude:opus');
});
integrationTest('an inherited topic uses the nearest manual ancestor model, otherwise the current workspace model', async () => {
  const withManual = await modelTree([['workspace'], ['manual', 'claude:haiku'], ['inherited'], ['inherited']]);
  assert.equal((await withManual.repo.readNote(withManual.nodes[3].path)).model, 'claude:haiku');
  assert.equal((await withManual.repo.readNote(withManual.nodes[2].path)).model, 'claude:haiku');
  assert.equal((await withManual.repo.readNote(withManual.nodes[1].path)).model, 'claude:haiku');
  assert.equal((await withManual.repo.readNote(withManual.nodes[0].path)).model, 'claude:sonnet');
  const none = await modelTree([['workspace'], ['inherited'], ['inherited']]);
  assert.equal((await none.repo.readNote(none.nodes[2].path)).model, 'claude:sonnet');
  const nested = await modelTree([['manual', 'claude:opus'], ['inherited'], ['manual', 'claude:haiku'], ['inherited']]);
  assert.equal((await nested.repo.readNote(nested.nodes[3].path)).model, 'claude:haiku');
  assert.equal((await nested.repo.readNote(nested.nodes[1].path)).model, 'claude:opus');
});
integrationTest('a manual topic keeps its stored model', async () => {
  const { repo, nodes } = await modelTree([['manual', 'gpt-5.6-luna']]);
  const note = await repo.readNote(nodes[0].path);
  assert.equal(note.model, 'gpt-5.6-luna'); assert.equal(note.modelSource, 'manual');
});
integrationTest('model resolution survives a parent cycle and a missing parent', async () => {
  const cycle = await modelTree([['inherited'], ['inherited']]);
  cycle.mapDoc.nodes[0].parentId = cycle.mapDoc.nodes[1].id;
  assert.equal((await cycle.repo.readNote(cycle.nodes[1].path, cycle.mapDoc)).model, 'claude:sonnet');
  const orphan = await modelTree([['inherited'], ['inherited']]);
  orphan.mapDoc.nodes[1].parentId = 'missing';
  assert.equal((await orphan.repo.readNote(orphan.nodes[1].path, orphan.mapDoc)).model, 'claude:sonnet');
});
