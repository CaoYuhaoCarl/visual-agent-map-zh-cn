// Merge topics, Phase 1 selection gestures: the pointer-intent table for the empty canvas.
const assert = require('node:assert/strict');
const { test, load } = require('../support.cjs');

const { canvasPointerIntent } = load('experiences/visual-map/canvas-gestures.ts');
const press = (over = {}) => canvasPointerIntent({ button: 0, integrationMode: false, spaceHeld: false, altKey: false, shiftKey: false, ...over });

test('canvas pointer intent, normal mode: plain drag and Alt drag pan, Shift drag box-selects', () => {
  assert.equal(press(), 'pan');
  assert.equal(press({ altKey: true }), 'pan', 'Alt+drag still pans outside selection mode');
  assert.equal(press({ shiftKey: true }), 'marquee-enter');
  assert.equal(press({ shiftKey: true, altKey: true }), 'pan', 'Alt wins over Shift so the old Alt pan never starts a box');
  assert.equal(press({ spaceHeld: true }), 'pan');
  assert.equal(press({ spaceHeld: true, shiftKey: true }), 'pan', 'Space always pans');
});

test('canvas pointer intent, selection mode: drag adds, Option drag removes, Space and the middle button pan', () => {
  assert.equal(press({ integrationMode: true }), 'marquee-add');
  assert.equal(press({ integrationMode: true, altKey: true }), 'marquee-subtract');
  assert.equal(press({ integrationMode: true, spaceHeld: true }), 'pan');
  assert.equal(press({ integrationMode: true, spaceHeld: true, altKey: true }), 'pan');
  assert.equal(press({ integrationMode: true, shiftKey: true }), 'marquee-add');
});

test('canvas pointer intent: the middle button always pans and other buttons do nothing', () => {
  for (const integrationMode of [false, true]) {
    assert.equal(press({ button: 1, integrationMode }), 'pan');
    assert.equal(press({ button: 1, integrationMode, altKey: true, shiftKey: true }), 'pan');
    assert.equal(press({ button: 2, integrationMode }), 'ignore');
  }
});
