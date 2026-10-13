import type { MapNode } from "./map-model";

const COLUMN = 360;
const ROW = 220;
const WIDTH = 300;
const HEIGHT = 190;

function positions(
  nodes: MapNode[],
  roots: MapNode[],
  left: number,
  top: number
): Map<string, { x: number; y: number }> {
  const children = new Map<string, MapNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }
  const result = new Map<string, { x: number; y: number }>();
  let row = 0;
  const visit = (node: MapNode, depth: number): number => {
    const descendants = children.get(node.id) ?? [];
    const childYs = descendants.map(child => visit(child, depth + 1));
    const y = childYs.length ? (childYs[0] + childYs[childYs.length - 1]) / 2 : top + row++ * ROW;
    result.set(node.id, { x: left + depth * COLUMN, y });
    return y;
  };
  for (const root of roots) visit(root, 0);
  return result;
}

export function arrangeMap(nodes: MapNode[]): MapNode[] {
  const roots = nodes.filter(node => !node.parentId);
  const placed = positions(nodes, roots, 80, 80);
  return nodes.map(node => ({ ...node, ...placed.get(node.id) }));
}

export function arrangeNewBranch(nodes: MapNode[], parentId: string, newIds: Set<string>): MapNode[] {
  const parent = nodes.find(node => node.id === parentId);
  if (!parent || !newIds.size) return nodes;
  const fresh = nodes.filter(node => newIds.has(node.id));
  const roots = fresh.filter(node => node.parentId === parentId);
  const placed = positions(fresh, roots, parent.x + COLUMN, 0);
  const rootYs = roots.map(root => placed.get(root.id)!.y);
  const center = rootYs.length ? (Math.min(...rootYs) + Math.max(...rootYs)) / 2 : 0;
  let offset = parent.y - center;
  const fixed = nodes.filter(node => !newIds.has(node.id));
  for (;;) {
    let next = offset;
    for (const point of placed.values())
      for (const node of fixed) {
        if (Math.abs(point.x - node.x) < WIDTH && Math.abs(point.y + offset - node.y) < HEIGHT)
          next = Math.max(next, node.y + HEIGHT - point.y);
      }
    if (next === offset) break;
    offset = next;
  }
  return nodes.map(node => {
    const point = placed.get(node.id);
    return point ? { ...node, x: point.x, y: Math.round(point.y + offset) } : node;
  });
}

/** Lays out a new top-level tree below every existing node, in the leftmost root column; existing nodes never move. */
export function arrangeNewTree(nodes: MapNode[], rootId: string, newIds: Set<string>): MapNode[] {
  const root = nodes.find(node => node.id === rootId);
  if (!root || !newIds.has(rootId)) return nodes;
  const fixed = nodes.filter(node => !newIds.has(node.id));
  const fixedRoots = fixed.filter(node => !node.parentId);
  const left = Math.min(...(fixedRoots.length ? fixedRoots : fixed).map(node => node.x), fixed.length ? Infinity : 80);
  const top = fixed.length ? Math.max(...fixed.map(node => node.y)) + ROW : 80;
  const placed = positions(
    nodes.filter(node => newIds.has(node.id)),
    [root],
    left,
    top
  );
  return nodes.map(node => {
    const point = placed.get(node.id);
    return point ? { ...node, x: point.x, y: Math.round(point.y) } : node;
  });
}
