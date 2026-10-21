// Plugin lifecycle regressions: Coffee Tables follows a workspace reconnect; unload cancels pending external reconciliation.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./support.cjs');

const { default: Plugin } = S.load('main.ts', { obsidian: S.obsidian });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function newPlugin() {
  const plugin = new Plugin();
  plugin.app = { vault: {}, fileManager: {} };
  plugin.logs = { appendLog() {} };
  return plugin;
}

test('reconnecting to another workspace rebuilds Coffee Tables storage and manager and re-points open views', async () => {
  const plugin = newPlugin();
  plugin.settings.workspaceFolder = 'Old Workspace';
  plugin.buildCoffee();
  const oldManager = plugin.coffeeManager;
  assert.equal(plugin.coffeeStorage.folder, 'Old Workspace/Coffee Tables');
  let stopped = 0;
  oldManager.stop = async () => { stopped++; };
  const rebound = [];
  plugin.coffeeViews = () => [{ rebindStorage: () => rebound.push(plugin.coffeeStorage.folder) }];
  plugin.settings.workspaceFolder = 'New Workspace';
  await plugin.rebuildCoffee();
  assert.equal(stopped, 1, 'the old manager was stopped (in-flight work awaited) before replacement');
  assert.notEqual(plugin.coffeeManager, oldManager);
  assert.equal(plugin.coffeeStorage.folder, 'New Workspace/Coffee Tables');
  assert.deepEqual(rebound, ['New Workspace/Coffee Tables'], 'open views re-read the new storage');
});

test('a manager still flushing after a reconnect saves through its own storage, not the new folder', async () => {
  const plugin = newPlugin();
  plugin.settings.workspaceFolder = 'Old Workspace';
  plugin.buildCoffee();
  const oldStorage = plugin.coffeeStorage;
  const saved = [];
  oldStorage.save = async () => { saved.push('old'); };
  const oldManager = plugin.coffeeManager;
  plugin.settings.workspaceFolder = 'New Workspace';
  plugin.coffeeViews = () => [];
  await plugin.rebuildCoffee();
  plugin.coffeeStorage.save = async () => { saved.push('new'); };
  await oldManager.saveSession({ id: 's' });
  assert.deepEqual(saved, ['old']);
});

test('unload clears the pending external reconciliation so no repo work runs after dispose', async () => {
  const plugin = newPlugin();
  let disposed = false, mutated = 0;
  plugin.repo = { dispose() { disposed = true; } };
  plugin.mutate = async () => { mutated++; };
  plugin.scheduleExternalReconciliation('Maps/A/deleted.md');
  assert.equal(plugin.externalReconcilePaths.size, 1);
  plugin.onunload();
  assert.ok(disposed);
  assert.equal(plugin.externalReconcileTimer, null);
  assert.equal(plugin.externalReconcilePaths.size, 0);
  await delay(700);
  assert.equal(mutated, 0, 'the 500 ms reconcile timer never fired after unload');
});
