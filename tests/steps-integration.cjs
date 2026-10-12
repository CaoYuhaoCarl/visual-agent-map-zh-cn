// S2 integration guards: every model call goes through a StepProvider, and no prompt text is left in i18n.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', 'tests', '.git', 'samples', 'scripts'].includes(entry.name)) return [];
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

// Each listed file is a provider adapter or the runtime it wraps, not a prompt owner.
const RUN_TASK_CALLERS = {
  'core/runtime-step-provider.ts': 'shared StepProvider over the Claude and Codex runtimes',
  'core/reframing-service.ts': 'runtime wrappers passed into runtimeStepProvider (stop check after the reply)',
  'main.ts': 'runCoffeeRequest, the runtime behind experiences/coffee-tables/step-provider.ts'
};

test('only StepProvider adapters call runtime.runTask', () => {
  const callers = sourceFiles(root)
    .filter(file => /\.runTask\(/.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(root, file).split(path.sep).join('/'))
    .filter(file => !file.startsWith('ai/runtime/'));
  assert.deepEqual(callers.sort(), Object.keys(RUN_TASK_CALLERS).sort());
});

test('i18n.ts holds no prompt.* keys', () => {
  assert.deepEqual(fs.readFileSync(path.join(root, 'i18n.ts'), 'utf8').match(/["']prompt\.[a-z0-9_]+["']/g) ?? [], []);
});
