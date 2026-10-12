const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, root, load } = require('../support.cjs');
test('Coffee Tables room switches conversation and insights by pane width', () => {
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const responsive = styles.slice(styles.indexOf('@container (max-width: 899px)'));
  assert.match(responsive, /\.ct-room-columns\s*\{\s*flex-direction:\s*column/);
  assert.match(responsive, /\.ct-pane-tabs\s*\{[^}]*display:\s*flex/);
  assert.match(responsive, /\.ct-room-columns\[data-pane="chat"\].*\.ct-insight-panel/);
  assert.doesNotMatch(styles.match(/@media\s*\(max-width:\s*900px\)\s*\{([^}]*(?:\}[^}]*)?)\}/s)?.[1] ?? '', /\.ct-room-columns/);
});
test('product ribbon pins both entrances below other actions and cleans up on unload', () => {
  let observer;
  class Observer {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
    moved(node) { if (this.connected) this.callback([{ addedNodes: [node] }]); }
  }
  const parent = {
    children: [],
    classList: { add() {}, remove() {} },
    get lastElementChild() { return this.children.at(-1); },
    appendChild(icon) { this.insertBefore(icon, null); },
    insertBefore(icon, next) {
      this.children = this.children.filter(child => child !== icon);
      const index = next ? this.children.indexOf(next) : this.children.length;
      this.children.splice(index, 0, icon); icon.parentElement = this;
    }
  };
  const make = name => ({
    name, parentElement: parent,
    classList: { values: new Set(), add(...names) { names.forEach(n => this.values.add(n)); }, remove(...names) { names.forEach(n => this.values.delete(n)); } },
    get nextSibling() { return parent.children[parent.children.indexOf(this) + 1] || null; },
    get nextElementSibling() { return this.nextSibling; }
  });
  const before = make('before'), coffee = make('coffee'), other = make('other'), map = make('map');
  parent.children = [before, coffee, other, map];
  const { groupRibbonIcons } = load('ui/ribbon-group.ts', {}, { MutationObserver: Observer });
  const stop = groupRibbonIcons(map, coffee);
  assert.deepEqual(parent.children.map(x => x.name), ['before', 'other', 'map', 'coffee']);
  assert.ok(map.classList.values.has('vam-ribbon-group-start'));
  assert.ok(coffee.classList.values.has('vam-ribbon-group-end'));
  parent.insertBefore(coffee, before); observer.moved(coffee);
  assert.deepEqual(parent.children.map(x => x.name), ['before', 'other', 'map', 'coffee']);
  parent.insertBefore(map, null); observer.moved(map);
  assert.deepEqual(parent.children.map(x => x.name), ['before', 'other', 'map', 'coffee']);
  parent.children = parent.children.filter(x => x !== coffee); coffee.parentElement = null;
  observer.moved(other);
  assert.ok(map.classList.values.has('vam-ribbon-group-start'));
  assert.ok(map.classList.values.has('vam-ribbon-group-end'));
  parent.insertBefore(coffee, before); observer.moved(coffee);
  assert.equal(map.nextElementSibling, coffee);
  stop();
  assert.equal(observer.connected, false);
  assert.equal(map.classList.values.size, 0);
  assert.equal(coffee.classList.values.size, 0);
});
