// Offline guard for the L2 harness entry: replays the recorded initial-clarification reply through the product path
// (AiTaskService -> StepRunner -> replay runtime). It fails when the rendered prompt drifts from the recorded one
// (replay miss) or when the reply no longer passes the language, schema and field checks. No network, no provider.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('AIM L2 harness --replay runs initial-clarification offline and its checks pass', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vam-l2-replay-')), 'result.json');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'tools', 'aim-node.cjs'), '--step=initial-clarification', '--lang=zh', `--replay=${path.join(__dirname, 'fixtures', 'aim-node', 'initial-clarification.zh.replay.json')}`, `--out=${out}`], { encoding: 'utf8', stdio: 'pipe' });
    const result = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(result.layer, 'L2');
    assert.equal(result.mode, 'replay');
    assert.equal(result.ok, true);
    assert.deepEqual(result.checks.map(item => [item.check, item.pass]), [['language', true], ['schema', true], ['fields', true]]);
    assert.match(result.promptSha256, /^[0-9a-f]{64}$/);
  } finally { fs.rmSync(path.dirname(out), { recursive: true, force: true }); }
});
