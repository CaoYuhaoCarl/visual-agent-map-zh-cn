// P6: the floating toolbar must not cover the canvas origin, and keyboard navigation must not write the viewport.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const support = require('./support.cjs');
const { obsidian } = support;
const { load } = require('./support-replay.cjs');

const inset = load('experiences/visual-map/viewport-inset.ts');

test('inset is the measured toolbar bottom below the canvas top plus 8px, and 0 when not laid out', () => {
  assert.equal(inset.insetFromRects(100, { top: 112, bottom: 150 }), 58);
  assert.equal(inset.insetFromRects(100, { top: 112, bottom: 190.2 }), 99, 'a wrapped toolbar is taller; fractions round up');
  assert.equal(inset.insetFromRects(100, { top: 0, bottom: 0 }), 0);
  assert.equal(inset.insetFromRects(100, undefined), 0);
});

test('initial viewport: only the untouched default is lifted; a user viewport stays', () => {
  assert.deepEqual({ ...inset.initialViewport({ x: 40, y: 40, zoom: 1 }, 58) }, { x: 40, y: 58, zoom: 1 });
  assert.deepEqual({ ...inset.initialViewport({ x: 40, y: 40, zoom: 1 }, 30) }, { x: 40, y: 40, zoom: 1 });
  const moved = { x: 40, y: 12, zoom: 1 };
  assert.equal(inset.initialViewport(moved, 99), moved);
});

test('a card at the origin sits below the toolbar after the initial viewport, focus and show all', () => {
  const tools = 58;
  for (const [width, height, toolsInset] of [[1280, 800, tools], [380, 700, 99]]) {
    const size = { width, height };
    const initial = inset.initialViewport({ x: 40, y: 40, zoom: 1 }, toolsInset);
    assert.ok(initial.y >= toolsInset, `initial ${width}`);
    const focus = inset.focusViewport({ x: 0, y: 0, zoom: 1 }, { x: 140, y: 80 }, size, toolsInset);
    assert.ok(focus.y + 80 - 80 >= 0 && focus.y + 80 > toolsInset, 'card centre is below the toolbar');
    const fit = inset.fitViewport({ minX: 0, minY: 0, maxX: 280, maxY: 180 }, size, toolsInset);
    assert.ok(fit.y >= toolsInset, `fit top ${fit.y} >= ${toolsInset} at ${width}`);
    assert.ok(fit.y + 180 * fit.zoom <= height, 'fit bottom stays in the canvas');
    const tall = inset.fitViewport({ minX: 0, minY: 0, maxX: 800, maxY: 1500 }, size, toolsInset);
    assert.ok(tall.y >= toolsInset && tall.y + 1500 * tall.zoom <= height + 1e-6);
  }
});

function makeView() {
  const { VisualAgentMapView } = load('experiences/visual-map/view.ts', { obsidian: { ...obsidian, Component: class {}, MarkdownRenderChild: class {} } }, { window: { setTimeout, clearTimeout }, CSS: { escape: s => s } });
  const writes = [];
  const view = Object.create(VisualAgentMapView.prototype);
  const nodes = [
    { id: 'a', path: 'a.md', parentId: null, x: 0, y: 0 },
    { id: 'b', path: 'b.md', parentId: 'a', x: 400, y: 2000 }
  ];
  Object.assign(view, {
    map: { nodes, viewport: { x: 40, y: 40, zoom: 1 } },
    builtIn: false, integrationMode: false, multiSelected: new Set(), selected: 'a', cardEls: new Map(),
    plugin: { repo: { updateMap: async (...args) => { writes.push(args); } }, mutate: async fn => { await fn(); } },
    viewportEl: { clientWidth: 1000, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600 }) },
    stageEl: { style: {}, querySelector: () => null },
    contentEl: { querySelector: () => ({ getBoundingClientRect: () => ({ top: 12, bottom: 50 }) }) },
    path: 'Map.md', viewportTimer: null, viewportQueued: false, history: {}
  });
  view.cardEls.set('b', { getBoundingClientRect: () => ({ left: 400, right: 680, top: 2000, bottom: 2180 }), focus() {} });
  view.relevanceSortOn = () => false;
  view.canvasNodes = () => nodes;
  view.transform = () => {};
  view.selectMapNode = node => { view.selected = node.id; };
  return { view, writes, nodes };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 400));

test('arrow-key navigation moves the camera in memory and writes nothing to Map.md', async () => {
  const { view, writes, nodes } = makeView();
  const before = view.map.viewport.y;
  view.moveKeyboardFocus(nodes[1]); // off screen: the camera follows
  assert.notEqual(view.map.viewport.y, before, 'camera followed the card');
  assert.equal(view.viewportTimer, null, 'no save was scheduled');
  await flush();
  assert.equal(writes.length, 0, 'zero Map.md writes');
});

test('mouse-driven focus and Show all still persist the viewport', async () => {
  const { view, writes, nodes } = makeView();
  view.focusNode(nodes[1]);
  await flush();
  assert.equal(writes.length, 1, 'focusNode persists');
  const second = makeView();
  second.nodes[1].y = 300;
  second.view.fit();
  await flush();
  assert.equal(second.writes.length, 1, 'Show all persists');
  assert.ok(second.view.map.viewport.y >= 58, 'Show all leaves the toolbar inset');
});
