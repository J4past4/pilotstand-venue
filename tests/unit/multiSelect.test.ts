import { describe, expect, it } from 'vitest';
import type { StandItem } from '../../src/types/stand';
import {
  computeAlignmentUpdates,
  computeGroupBounds,
  computeGroupRotationUpdates,
  computeMarqueeRect,
  computeMultiDragPositions,
  isScreenBoxIntersectingRect,
  mergeSelection,
  toggleSelection,
} from '../../src/utils/multiSelect';

function makeItem(
  id: string,
  x: number,
  z: number,
  w = 1,
  h = 1,
  d = 1,
  extra: Partial<StandItem> = {}
): StandItem {
  return {
    id,
    catalogId: 'counter',
    name: `Item ${id}`,
    x,
    y: 0,
    z,
    rotationY: 0,
    dims: { w, h, d },
    artwork: {},
    ...extra,
  };
}

describe('multiSelect utilities', () => {
  it('toggles items in and out of selection', () => {
    expect(toggleSelection([], 'a')).toEqual(['a']);
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleSelection(['b'], 'b')).toEqual([]);
  });

  it('merges marquee selections additively without duplicates', () => {
    expect(mergeSelection(['a'], ['b', 'c'], true)).toEqual(['a', 'b', 'c']);
    expect(mergeSelection(['a', 'b'], ['b', 'c'], true)).toEqual(['a', 'b', 'c']);
    expect(mergeSelection(['a', 'b'], [], true)).toEqual(['a', 'b']);
    expect(mergeSelection(['a', 'b'], ['c', 'c'], false)).toEqual(['c']);
  });

  it('normalizes marquee rectangles regardless of drag direction', () => {
    expect(computeMarqueeRect(200, 300, 50, 100)).toEqual({
      left: 50,
      top: 100,
      right: 200,
      bottom: 300,
      width: 150,
      height: 200,
    });
  });

  it('detects 2D screen bounding box intersections with marquee rect', () => {
    const rect = computeMarqueeRect(100, 100, 200, 200);
    // Fully inside
    expect(isScreenBoxIntersectingRect({ minX: 120, minY: 120, maxX: 150, maxY: 150 }, rect)).toBe(true);
    // Crossing left edge
    expect(isScreenBoxIntersectingRect({ minX: 50, minY: 120, maxX: 110, maxY: 180 }, rect)).toBe(true);
    // Completely outside to the right
    expect(isScreenBoxIntersectingRect({ minX: 205, minY: 120, maxX: 260, maxY: 180 }, rect)).toBe(false);
    // Completely above
    expect(isScreenBoxIntersectingRect({ minX: 120, minY: 20, maxX: 180, maxY: 99 }, rect)).toBe(false);
  });

  it('computes group bounds including rotated footprints', () => {
    const a = makeItem('a', -1, 0, 2, 2, 1, { rotationY: 90 }); // rotated: world w=1, d=2
    const b = makeItem('b', 2, 1, 1, 3, 1);
    const bounds = computeGroupBounds([a, b]);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBeCloseTo(-1.5, 5);
    expect(bounds!.maxX).toBeCloseTo(2.5, 5);
    expect(bounds!.minZ).toBeCloseTo(-1, 5);
    expect(bounds!.maxZ).toBeCloseTo(1.5, 5);
    expect(bounds!.maxY).toBeCloseTo(3, 5);
    expect(bounds!.cx).toBeCloseTo(0.5, 5);
    expect(bounds!.cz).toBeCloseTo(0.25, 5);
  });

  it('preserves relative spacing and clamps group drag within outer bounds', () => {
    const start = [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 2, z: 0 },
    ];
    // Stand width=6 => outer clamp ±5.4. Trying to move +5m would push b to 7, so group clamps to +3.4
    const next = computeMultiDragPositions(start, 5, 0.24, {
      width: 6,
      depth: 4,
      snapToGrid: true,
      gridStep: 0.25,
    });
    expect(next[0].x).toBeCloseTo(3.4, 3);
    expect(next[1].x).toBeCloseTo(5.4, 3);
    // Relative X spacing remains exactly 2.0m
    expect(next[1].x - next[0].x).toBeCloseTo(2, 3);
    // Z snapped to 0.25
    expect(next[0].z).toBeCloseTo(0.25, 3);
    expect(next[1].z).toBeCloseTo(0.25, 3);
  });

  it('rotates multiple unlocked items around their shared centroid', () => {
    const items = [
      makeItem('a', -1, 0, 1, 1, 1),
      makeItem('b', 1, 0, 1, 1, 1),
      makeItem('locked', 0, 2, 1, 1, 1, { locked: true }),
    ];
    const updates = computeGroupRotationUpdates(items, ['a', 'b', 'locked'], 90);
    expect(updates).toHaveLength(2);
    const ua = updates.find((u) => u.id === 'a')!;
    const ub = updates.find((u) => u.id === 'b')!;
    // Centroid is (0, 0); +90deg around Y maps (-1, 0) -> (0, 1) and (1, 0) -> (0, -1)
    expect(ua.x).toBeCloseTo(0, 3);
    expect(ua.z).toBeCloseTo(1, 3);
    expect(ua.rotationY).toBe(90);
    expect(ub.x).toBeCloseTo(0, 3);
    expect(ub.z).toBeCloseTo(-1, 3);
    expect(ub.rotationY).toBe(90);
  });

  it('aligns unlocked selected items along edges and centers', () => {
    const items = [
      makeItem('a', -2, -1, 1, 1, 1), // left edge -2.5, right -1.5
      makeItem('b', 1, 1, 2, 1, 1), // left edge 0, right 2
    ];
    const leftAligned = computeAlignmentUpdates(items, ['a', 'b'], 'left');
    expect(leftAligned.find((u) => u.id === 'a')!.x).toBeCloseTo(-2, 3);
    expect(leftAligned.find((u) => u.id === 'b')!.x).toBeCloseTo(-1.5, 3); // minX(-2.5) + halfW(1)

    const centerZ = computeAlignmentUpdates(items, ['a', 'b'], 'center-z');
    expect(centerZ.find((u) => u.id === 'a')!.z).toBeCloseTo(0, 3);
    expect(centerZ.find((u) => u.id === 'b')!.z).toBeCloseTo(0, 3);
  });
});
