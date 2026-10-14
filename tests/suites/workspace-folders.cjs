const assert = require('node:assert/strict');
const { integrationTest, load, core, map, obsidian, fixture, DEFAULT_SETTINGS } = require('../support.cjs');
const repository = load('repository.ts', { obsidian });
const { createAimMap } = load('experiences/aim/create-map.ts');
const newAim = async (repo, topic) => (await createAimMap(repo, 'gpt-6-luna', { requestId: `req-${topic}`, topic, context: '' })).mapPath;

integrationTest('new mind maps are created in Mind Maps and new AIM maps in AIM; Topics is untouched', async () => {
  const { repo, app } = fixture('en');
  const mind = await repo.createMap('Plain topic');
  const aimPath = await newAim(repo, 'Research topic');
  assert.equal(mind, 'Agent Workspace/Mind Maps/Plain topic/Map.md');
  assert.equal(aimPath, 'Agent Workspace/AIM/Research topic/Map.md');
  assert.ok(!app.vault.getAbstractFileByPath('Agent Workspace/Topics'));
  assert.deepEqual(Array.from((await repo.mapFiles()).map(file => file.path)).sort(), [aimPath, mind]);
});

integrationTest('configured folder names route new maps; an existing name gets a numeric suffix', async () => {
  const { app } = fixture('en');
  const repo = new repository.Repository(app, { ...DEFAULT_SETTINGS, language: 'en', mindMapsFolder: 'Agent Workspace/導圖', aimFolder: 'Agent Workspace/研究' });
  assert.equal(await repo.createMap('A'), 'Agent Workspace/導圖/A/Map.md');
  assert.equal(await repo.createMap('A'), 'Agent Workspace/導圖/A 2/Map.md');
  assert.equal(await newAim(repo, 'B'), 'Agent Workspace/研究/B/Map.md');
});

integrationTest('map folders derive from a custom workspace, and saved values are kept for upgraded users', () => {
  assert.deepEqual({ ...repository.resolveMapFolders({ workspaceFolder: 'Research/VAM' }) }, { mindMapsFolder: 'Research/VAM/Mind Maps', aimFolder: 'Research/VAM/AIM' });
  assert.deepEqual({ ...repository.resolveMapFolders(null) }, { mindMapsFolder: 'Agent Workspace/Mind Maps', aimFolder: 'Agent Workspace/AIM' });
  assert.deepEqual({ ...repository.resolveMapFolders({ workspaceFolder: 'W', mindMapsFolder: 'Elsewhere/Maps', aimFolder: 'Elsewhere/Aim' }) }, { mindMapsFolder: 'Elsewhere/Maps', aimFolder: 'Elsewhere/Aim' });
});

integrationTest('managed map paths cover Mind Maps, AIM and a custom legacy topicsFolder; others are not managed', () => {
  const settings = { ...DEFAULT_SETTINGS, topicsFolder: 'Custom/Legacy Topics' };
  for (const path of ['Agent Workspace/Mind Maps/T/Map.md', 'Agent Workspace/AIM/T/Map.md', 'Custom/Legacy Topics/T/Map.md']) assert.equal(repository.isManagedMapPath(settings, path), true, path);
  for (const path of ['Agent Workspace/Topics/T/Map.md', 'Elsewhere/Map.md', 'Agent Workspace/Maps/pre-0.4.md']) assert.equal(repository.isManagedMapPath(settings, path), false, path);
});

integrationTest('a legacy Topics map can still be renamed and stays in Topics; new-container maps stay in theirs', async () => {
  const { repo, app } = fixture('en');
  const legacyRoot = 'Agent Workspace/Topics/Old';
  await repo.ensureTopicFolders(legacyRoot);
  await app.vault.create(`${legacyRoot}/Map.md`, core.serializeMap({ ...map([]), id: 'old', title: 'Old' }));
  const renamed = await repo.renameTopic(`${legacyRoot}/Map.md`, 'Older');
  assert.equal(renamed, 'Agent Workspace/Topics/Older/Map.md');
  assert.equal((await repo.readMap(renamed)).title, 'Older');
  const mind = await repo.createMap('Fresh');
  assert.equal(await repo.renameTopic(mind, 'Fresher'), 'Agent Workspace/Mind Maps/Fresher/Map.md');
  const aimMap = await newAim(repo, 'Q');
  assert.equal(await repo.renameTopic(aimMap, 'Q2'), 'Agent Workspace/AIM/Q2/Map.md');
});

integrationTest('maps in all three containers are discovered and a broken topic folder is found in each', async () => {
  const { repo, app } = fixture('en');
  await repo.createMap('M');
  await repo.folder('Agent Workspace/Topics/Legacy');
  await repo.folder('Agent Workspace/AIM/Broken AIM');
  assert.deepEqual(Array.from((await repo.brokenTopics()).map(item => item.root)).sort(), ['Agent Workspace/AIM/Broken AIM', 'Agent Workspace/Topics/Legacy']);
  assert.deepEqual(Array.from(await repo.workspaceCandidates()), ['Agent Workspace']);
});
