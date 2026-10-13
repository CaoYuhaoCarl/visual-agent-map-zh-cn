// AIM maps name their notes twice: node paths and AIM records (results, drafts, snapshots). Every path change made by
// the vault rename/delete handlers must move both, or the map stops parsing and every later vault-wide scan fails.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { integrationTest, load, obsidian, TFile, TFolder, fixture, topicNote, core, coverageSetup, coverageThreeAnswers } = require('../support.cjs');

const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
const snapshotHash = branch => createHash('sha256').update(JSON.stringify({ branch: branch.inputSnapshot, answer: branch.answerSnapshot })).digest('hex');

/** A fake vault with one finished AIM map and the plugin's real vault handlers registered on it. */
async function aimVault(notices) {
  const data = fixture('en');
  const subject = await coverageSetup('Keep me readable', { sharedRepo: data.repo });
  await coverageThreeAnswers(subject);
  const handlers = {};
  data.app.vault.on = (name, handler) => { handlers[name] = handler; return {}; };
  data.app.workspace = { getLeavesOfType: () => [] };
  const { default: Plugin } = load('main.ts', { obsidian: notices ? { ...obsidian, Notice: class { constructor(message) { notices.push(message); } } } : obsidian });
  const plugin = new Plugin();
  plugin.app = data.app; plugin.repo = data.repo; plugin.registerEvent = () => {};
  data.repo.onUnreadableMaps = failures => plugin.reportUnreadableMaps(failures);
  plugin.registerVaultEvents();
  const errors = () => Array.from(plugin.logs.getLogs()).filter(entry => entry.level === 'error').map(entry => entry.message);
  // Obsidian removes a trashed folder's files synchronously, one "delete" event per file, then the folders.
  const deleteFolder = root => {
    const inside = [...data.files.keys()].filter(path => path === root || path.startsWith(`${root}/`));
    for (const path of inside.filter(path => data.files.get(path) instanceof TFile)) {
      const file = data.files.get(path); data.files.delete(path); data.contents.delete(path); handlers.delete(file);
    }
    for (const path of inside.filter(path => data.files.get(path) instanceof TFolder).reverse()) {
      const folder = data.files.get(path); data.files.delete(path); handlers.delete(folder);
    }
  };
  return { ...data, mapPath: subject.created.mapPath, handlers, plugin, errors, deleteFolder };
}
function assertAimReferencesMatchNodes(map) {
  for (const branch of map.aim.branches) {
    for (const result of branch.results) assert.equal(map.nodes.find(node => node.id === result.nodeId).path, result.notePath);
    for (const run of map.aim.runs.filter(run => run.branchId === branch.id))
      for (const attempt of run.attempts) assert.equal(attempt.inputSnapshotHash, snapshotHash(branch), 'attempt hash follows its input snapshot');
  }
}

integrationTest('AIM map survives a note rename, and deleting another topic folder logs no AIM reference failure', async () => {
  const vault = await aimVault();
  const otherNote = await topicNote(vault.repo, 'Disposable note', 'model-a', 'disposable');
  await vault.app.vault.create('Agent Workspace/Topics/disposable/Map.md', core.serializeMap({ id: 'disposable', title: 'Disposable', version: 1, nodes: [otherNote], viewport: { x: 0, y: 0, zoom: 1 } }));
  const before = await vault.repo.readMap(vault.mapPath);
  const result = before.aim.branches.flatMap(branch => branch.results)[0];
  const renamed = result.notePath.replace(/\.md$/, ' renamed.md');
  assert.ok(before.aim.branches.some(branch => branch.inputSnapshot.upstreamResults.some(item => item.notePath === result.notePath)), 'the renamed note feeds a later snapshot');

  // An ordinary rename in the file explorer.
  await vault.app.fileManager.renameFile(vault.files.get(result.notePath), renamed);
  vault.handlers.rename(vault.files.get(renamed), result.notePath);
  await settle(50);

  // The owner's symptom: trashing an unrelated topic folder scans every map (reference rebuild, then reconciliation),
  // and each scan failed with "Operation failed: Invalid AIM branch result reference."
  vault.deleteFolder('Agent Workspace/Topics/disposable');
  await settle(700);
  assert.deepEqual(vault.errors(), []);
  const after = await vault.repo.readMap(vault.mapPath);
  assert.equal(after.aim.branches.flatMap(branch => branch.results)[0].notePath, renamed);
  assert.equal(after.aim.branches.some(branch => branch.inputSnapshot.upstreamResults.some(item => item.notePath === result.notePath)), false);
  assertAimReferencesMatchNodes(after);
  assert.deepEqual(Array.from(await vault.repo.topics(), item => item.mapPath), [vault.mapPath]);
});

integrationTest('AIM references follow a note moved outside Obsidian and found again by node-id reconciliation', async () => {
  const vault = await aimVault();
  const before = await vault.repo.readMap(vault.mapPath);
  const result = before.aim.branches.flatMap(branch => branch.results).at(-1);
  const moved = result.notePath.replace(/\/Notes\/([^/]+)$/, '/Notes/moved $1');
  // An external move reaches Obsidian as a delete of the old path; the note reappears under its node-id.
  const file = vault.files.get(result.notePath);
  await vault.app.fileManager.renameFile(file, moved);
  vault.handlers.delete(new TFile(result.notePath));
  await settle(700);
  assert.deepEqual(vault.errors(), []);
  const after = await vault.repo.readMap(vault.mapPath);
  assert.equal(after.nodes.find(node => node.id === result.nodeId).path, moved);
  assertAimReferencesMatchNodes(after);
});

integrationTest('AIM topic folder renamed in the file explorer stays readable', async () => {
  const vault = await aimVault();
  const root = vault.mapPath.replace(/\/Map\.md$/, ''), target = `${root} moved`;
  const oldPaths = [...vault.files.keys()].filter(path => path.startsWith(`${root}/`) && vault.files.get(path) instanceof TFile);
  const moved = oldPaths.map(path => [vault.files.get(path), path]);
  await vault.app.fileManager.renameFile(vault.files.get(root), target);
  for (const [file, oldPath] of moved) vault.handlers.rename(file, oldPath);
  await settle(100);
  assert.deepEqual(vault.errors(), []);
  const after = await vault.repo.readMap(`${target}/Map.md`);
  assert.ok(after.nodes.every(node => node.path.startsWith(`${target}/`)));
  assertAimReferencesMatchNodes(after);
});

integrationTest('one unreadable Map.md is skipped by vault-wide scans, left untouched, and still errors when opened', async () => {
  const notices = [];
  const vault = await aimVault(notices);
  // A second map broken like the owner's: an AIM result reference to a node that does not exist.
  const brokenPath = 'Agent Workspace/Topics/broken/Map.md';
  const good = vault.contents.get(vault.mapPath);
  const corrupted = good.replace(/"nodeId":\s*"[^"]+"/, '"nodeId": "missing-node"');
  assert.notEqual(corrupted, good);
  await vault.app.vault.create(brokenPath, corrupted);
  await assert.rejects(() => vault.repo.readMap(brokenPath), 'precondition: the file really is unreadable');
  const before = vault.contents.get(brokenPath);

  const before0 = await vault.repo.readMap(vault.mapPath);
  const result = before0.aim.branches.flatMap(branch => branch.results)[0];
  const renamed = result.notePath.replace(/\.md$/, ' renamed.md');
  await vault.app.fileManager.renameFile(vault.files.get(result.notePath), renamed);
  vault.handlers.rename(vault.files.get(renamed), result.notePath);
  await settle(100);
  const after = await vault.repo.readMap(vault.mapPath);
  assert.equal(after.aim.branches.flatMap(branch => branch.results)[0].notePath, renamed, 'the valid map was rebased');
  assertAimReferencesMatchNodes(after);
  assert.equal(notices.length, 1, 'one skip notice');
  assert.match(notices[0], /Skipped an unreadable mind map: Agent Workspace\/Topics\/broken\/Map\.md/);
  assert.equal(vault.errors().length, 0);
  assert.ok(Array.from(vault.plugin.logs.getLogs()).some(entry => entry.message.includes(brokenPath)), 'skip is logged');

  await vault.repo.rebuildDerivedData();
  await vault.repo.reconcileMissingNodePaths();
  assert.deepEqual(Array.from(await vault.repo.topics(), item => item.mapPath), [vault.mapPath]);
  assert.equal(vault.contents.get(brokenPath), before, 'the unreadable map is never written');
  await assert.rejects(() => vault.repo.readMap(brokenPath), /Invalid AIM/);
});

integrationTest('rebuildDerivedData leaves notes in an unreadable map folder byte-identical and still updates readable maps', async () => {
  const vault = await aimVault([]);
  const brokenPath = 'Agent Workspace/Topics/broken/Map.md';
  const corrupted = vault.contents.get(vault.mapPath).replace(/"nodeId":\s*"[^"]+"/, '"nodeId": "missing-node"');
  await vault.app.vault.create(brokenPath, corrupted);
  const stray = 'Agent Workspace/Topics/broken/Notes/Stray.md';
  const strayContent = '---\nagent-map-node: true\nnode-id: "stray"\nagent-map-id: "broken-map"\ntopic-id: "broken-map"\ntopic-state: active\ntitle: "Stray"\n---\n\n# Stray\n\n## Detail\n\nOld detail\n';
  await vault.app.vault.create(stray, strayContent);
  const valid = (await vault.repo.readMap(vault.mapPath)).nodes[0].path;
  const validBefore = vault.contents.get(valid);
  vault.contents.set(valid, validBefore.replace(/^agent-map-id:.*\n/m, ''));
  assert.notEqual(vault.contents.get(valid), validBefore, 'precondition: the valid note lost its map id');
  await vault.repo.rebuildDerivedData();
  assert.equal(vault.contents.get(stray), strayContent, 'unreadable map note untouched');
  assert.equal(vault.contents.get(brokenPath), corrupted);
  assert.match(vault.contents.get(valid), /^agent-map-id:/m, 'the readable map note was updated');
});

integrationTest('legacy migration plan refuses when any map is unreadable and nothing moves', async () => {
  const vault = await aimVault([]);
  const note = 'Agent Workspace/Nodes/a.md', mapPath = 'Agent Workspace/Maps/Legacy.md';
  const noteContent = '---\nagent-map-node: true\nnode-id: "a"\ntitle: "a"\n---\n\n# a\n';
  await vault.app.vault.create(note, noteContent);
  const corrupted = vault.contents.get(vault.mapPath).replace(/"nodeId":\s*"[^"]+"/, '"nodeId": "missing-node"');
  await vault.app.vault.create(mapPath, corrupted);
  const paths = [...vault.files.keys()].sort();
  await assert.rejects(() => vault.repo.legacyMigrationPlan(), /Agent Workspace\/Maps\/Legacy\.md/);
  assert.equal(vault.contents.get(note), noteContent);
  assert.equal(vault.contents.get(mapPath), corrupted);
  assert.deepEqual([...vault.files.keys()].sort(), paths);
});
