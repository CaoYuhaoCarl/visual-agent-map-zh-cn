import { parentIdsForNode, type MapNode } from "./map-model";

const COLUMN = 360;
const ROW = 220;
const WIDTH = 300;
const HEIGHT = 190;

function positions(
  nodes: MapNode[],
  roots: MapNode[],
  left: number,
  top: number,
  folded = false
): Map<string, { x: number; y: number }> {
  const ids = new Map(nodes.map(node => [node.id, node]));
  const children = new Map<string, MapNode[]>();
  const joins = new Map<string, MapNode[]>();
  const add = (map: Map<string, MapNode[]>, key: string, node: MapNode) =>
    map.set(key, [...(map.get(key) ?? []), node]);
  for (const node of nodes) {
    if (!node.parentId) continue;
    // A conclusion converging on sibling sources joins after all of them instead of hanging under one.
    const sources =
      node.aimKind !== "question" && node.aimConvergesFromNodeIds?.length
        ? parentIdsForNode(node).map(id => ids.get(id))
        : [];
    const anchor = sources[0]?.parentId;
    if (anchor && ids.has(anchor) && sources.every(source => source && source.parentId === anchor))
      add(joins, anchor, node);
    else add(children, node.parentId, node);
  }
  const result = new Map<string, { x: number; y: number }>();
  const kidsOf = (node: MapNode) => (folded && node.collapsed ? [] : (children.get(node.id) ?? []));
  const joinsOf = (node: MapNode) =>
    folded && node.collapsed
      ? []
      : (joins.get(node.id) ?? []).filter(join => !(folded && ids.get(join.parentId!)?.collapsed));
  const sum = (list: number[]) => list.reduce((total, value) => total + value, 0);
  const heights = new Map<string, number>();
  const spans = new Map<string, number>();
  const measure = (node: MapNode): void => {
    const kids = kidsOf(node);
    const extra = joinsOf(node);
    for (const child of [...kids, ...extra]) measure(child);
    heights.set(
      node.id,
      Math.max(1, sum(kids.map(kid => heights.get(kid.id)!)), sum(extra.map(join => heights.get(join.id)!)))
    );
    spans.set(node.id, 1 + Math.max(0, ...kids.map(kid => spans.get(kid.id)!)));
  };
  const place = (node: MapNode, depth: number, topRow: number): number => {
    const kids = kidsOf(node);
    const extra = joinsOf(node);
    const height = heights.get(node.id)!;
    const stack = (list: MapNode[], column: number) => {
      let next = topRow + (height - sum(list.map(item => heights.get(item.id)!))) / 2;
      return list.map(item => {
        const y = place(item, column, next);
        next += heights.get(item.id)!;
        return y;
      });
    };
    const kidYs = stack(kids, depth + 1);
    const joinYs = stack(extra, depth + spans.get(node.id)!);
    const ys = kidYs.length ? kidYs : joinYs;
    const row = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : topRow;
    result.set(node.id, { x: left + depth * COLUMN, y: top + row * ROW });
    return row;
  };
  let row = 0;
  for (const root of roots) {
    measure(root);
    place(root, 0, row);
    row += heights.get(root.id)!;
  }
  return result;
}

/** Lays out what is on screen: a collapsed topic is a leaf, and its hidden branch keeps its coordinates until it is shown again. */
export function arrangeMap(nodes: MapNode[]): MapNode[] {
  const roots = nodes.filter(node => !node.parentId);
  const placed = positions(nodes, roots, 80, 80, true);
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
