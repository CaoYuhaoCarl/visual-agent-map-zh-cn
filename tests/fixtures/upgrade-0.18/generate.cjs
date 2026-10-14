// Regenerates tests/fixtures/upgrade-0.18/vault from the 0.18.0 product code (commit 3b92deb). Not part of the suite:
// the fixture is frozen so a 0.19 change can never hide behind a fixture produced by the same 0.19 code.
//   git worktree add --detach <dir> 3b92deb && ln -s "$PWD/node_modules" <dir>/node_modules
//   node tests/fixtures/upgrade-0.18/generate.cjs <dir>
const fs = require('node:fs');
const path = require('node:path');
const worktree = path.resolve(process.argv[2] ?? '');
if (!fs.existsSync(path.join(worktree, 'manifest.json')) || JSON.parse(fs.readFileSync(path.join(worktree, 'manifest.json'), 'utf8')).version !== '0.18.0') throw new Error('Pass a checkout of 3b92deb (version 0.18.0).');
const { load, core, fixture, obsidian, TFile } = require(path.join(worktree, 'tests/support.cjs'));
// Real YAML with Obsidian's options (the 0.18 test double used a one-line-per-key stub).
const YAML = require(path.join(worktree, 'node_modules/yaml'));
obsidian.parseYaml = text => YAML.parse(text, null, {});
obsidian.stringifyYaml = obj => YAML.stringify(obj, null, { nullStr: '', lineWidth: 0, aliasDuplicateObjects: false });
const out = path.join(__dirname, 'vault');

(async () => {
  // Most of the vault was written under a zh-TW UI; Beta budget under en, so both label languages exist side by side.
  const { Repository, DEFAULT_SETTINGS } = load('repository.ts', { obsidian }); // loaded after the YAML override above
  const base = fixture('zh-TW');
  const { app, files, contents } = base;
  const repo = new Repository(app, { ...DEFAULT_SETTINGS, language: 'zh-TW' });
  const { createAimMap } = load('experiences/aim/create-map.ts');
  const topics = repo.settings.topicsFolder;
  await repo.ensureWorkspace();
  // Mind map with a parent/child pair, a note cited by another note, and notes parked in Unassigned and Archive.
  const alphaPath = await repo.createMap('Alpha trip');
  let alpha = await repo.readMap(alphaPath);
  const root = await repo.createNote('Plan the trip', 'gpt-5.6-luna', alpha, alphaPath, 'workspace');
  const child = await repo.createNote('Book trains', 'gpt-5.6-luna', alpha, alphaPath, 'inherited');
  child.parentId = root.id; alpha.nodes.push(root, child); await repo.saveMap(alphaPath, alpha);
  await repo.updateNote(root.path, { summary: 'Trip overview', detail: 'See [[Book trains]] for transport.' });
  await repo.updateNote(child.path, { summary: 'Trains', sourcePaths: [root.path], referencePaths: [root.path] });
  const spare = await repo.createNote('Spare idea', 'gpt-5.6-luna', alpha, alphaPath, 'workspace');
  await repo.updateNote(spare.path, { summary: 'Parked' });
  const parked = `${topics}/Alpha trip/Unassigned/Spare idea.md`;
  await repo.moveExact(spare.path, parked); await repo.setLifecycle(parked, alpha.id, '', 'unassigned');
  const old = await repo.createNote('Old idea', 'gpt-5.6-luna', alpha, alphaPath, 'workspace');
  const archived = `${topics}/Alpha trip/Archive/Old idea.md`;
  await repo.moveExact(old.path, archived); await repo.setLifecycle(archived, alpha.id, '', 'archived');
  // Beta budget is generated separately under an en UI (below) so both label languages exist side by side.
  // An AIM map under Topics as 0.18 stored it.
  const aimPath = (await createAimMap(repo, 'gpt-6-luna', { requestId: 'fixture-aim', topic: 'Steak doneness', context: 'Cast iron pan.' })).mapPath;
  const aim = await repo.readMap(aimPath);
  const question = await repo.createNote('Which doneness?', 'gpt-6-luna', aim, aimPath, 'workspace');
  aim.nodes.push(question); await repo.saveMap(aimPath, aim);
  // Pre-0.4 structure: a map in Maps/ with its notes in Nodes/, outside Topics.
  await repo.folder(repo.settings.mapsFolder); await repo.folder(repo.settings.notesFolder);
  const nodeText = id => `---\nagent-map-node: true\nnode-id: "${id}"\ntitle: "Legacy ${id}"\n---\n\n# Legacy ${id}\n\n## Detail\n\nOld detail ${id}\n`;
  const legacyNodes = ['a', 'b'].map((id, index) => ({ id, parentId: index ? 'a' : null, path: `${repo.settings.notesFolder}/Legacy ${id}.md`, x: index * 300, y: 0, collapsed: false }));
  for (const node of legacyNodes) await app.vault.create(node.path, nodeText(node.id));
  const oldMap = { id: 'pre04', title: 'Pre-0.4 map', version: 1, nodes: legacyNodes, viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(`${repo.settings.mapsFolder}/Pre-0.4 map.md`, core.serializeMap(oldMap));
  // Inbox notes as the 0.18 legacy migration left them: topic-state inbox, no topic-id.
  await repo.folder(repo.settings.inboxFolder);
  await app.vault.create(`${repo.settings.inboxFolder}/Loose note.md`, '---\nagent-map-node: true\nnode-id: "loose-1"\ntitle: "Loose note"\ntopic-state: inbox\n---\n\n# Loose note\n\n## Detail\n\nWaiting in the Inbox.\n');
  await app.vault.create(`${repo.settings.inboxFolder}/Second loose.md`, '---\nagent-map-node: true\nnode-id: "loose-2"\ntitle: "Second loose"\ntopic-state: inbox\n---\n\n# Second loose\n');
  // An unrelated note VAM must never touch.
  await repo.folder('Journal'); await app.vault.create('Journal/Daily.md', '# Daily\n\nNot a VAM note.\n');
  await repo.rebuildDerivedData(); // NOTE: per-note label language is a 0.18 side effect of this rebuild (UI language); see the 0.19 test.
  // the 0.18 fixed point: what a 0.18 vault looks like after its own rebuild
  const en = fixture('en');
  const enRepo = new Repository(en.app, { ...DEFAULT_SETTINGS, language: 'en' });
  await enRepo.ensureWorkspace();
  const betaPath = await enRepo.createMap('Beta budget');
  const beta = await enRepo.readMap(betaPath);
  const bRoot = await enRepo.createNote('Budget', 'gpt-5.6-luna', beta, betaPath, 'workspace');
  beta.nodes.push(bRoot); await enRepo.saveMap(betaPath, beta);
  await enRepo.rebuildDerivedData();
  for (const [file, item] of en.files) if (item instanceof TFile && file.startsWith(`${topics}/Beta budget/`)) { files.set(file, item); contents.set(file, en.contents.get(file)); }
  fs.rmSync(out, { recursive: true, force: true });
  for (const [file, item] of files) {
    if (!(item instanceof TFile)) continue;
    const target = path.join(out, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents.get(file));
  }
  console.log(`wrote ${[...files.values()].filter(item => item instanceof TFile).length} files to ${out}`);
})().catch(error => { console.error(error); process.exit(1); });
