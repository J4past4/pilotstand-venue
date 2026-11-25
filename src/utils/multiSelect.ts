import type { StandConfig, StandItem } from '../types/stand';

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface ScreenBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GroupBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  cz: number;
  width: number;
  depth: number;
  height: number;
}

/**
 * Toggle a single item ID in or out of the current selection list.
 */
export function toggleSelection(currentIds: string[], targetId: string): string[] {
  if (currentIds.includes(targetId)) {
    return currentIds.filter((id) => id !== targetId);
  }
  return [...currentIds, targetId];
}

/**
 * Merge marquee-matched item IDs into the selection.
 * When `additive` is true (Ctrl+drag), newly enclosed items are unioned with the existing selection.
 */
export function mergeSelection(
  currentIds: string[],
  matchedIds: string[],
  additive: boolean
): string[] {
  if (!additive) {
    return Array.from(new Set(matchedIds));
  }
  if (matchedIds.length === 0) {
    return currentIds;
  }
  const seen = new Set(currentIds);
  const next = [...currentIds];
  for (const id of matchedIds) {
    if (!seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  return next;
}

/**
 * Normalize two pointer coordinates into a positive-width/height marquee rectangle.
 */
export function computeMarqueeRect(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): MarqueeRect {
  const left = Math.min(startX, currentX);
  const right = Math.max(startX, currentX);
  const top = Math.min(startY, currentY);
  const bottom = Math.max(startY, currentY);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Axis-aligned 2D intersection test between a projected item bounding box and the marquee rectangle.
 */
export function isScreenBoxIntersectingRect(box: ScreenBox2D, rect: MarqueeRect): boolean {
  return (
    box.maxX >= rect.left &&
    box.minX <= rect.right &&
    box.maxY >= rect.top &&
    box.minY <= rect.bottom
  );
}

/**
 * Compute world-space rotated footprint half-extents for a StandItem.
 */
export function getItemWorldHalfExtents(item: StandItem): { halfW: number; halfD: number } {
  const rad = (item.rotationY * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    halfW: (item.dims.w * cos + item.dims.d * sin) / 2,
    halfD: (item.dims.w * sin + item.dims.d * cos) / 2,
  };
}

/**
 * Compute world-space bounding box and centroid for a set of items.
 */
export function computeGroupBounds(items: StandItem[]): GroupBounds | null {
  if (items.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    const { halfW, halfD } = getItemWorldHalfExtents(item);
    minX = Math.min(minX, item.x - halfW);
    maxX = Math.max(maxX, item.x + halfW);
    minZ = Math.min(minZ, item.z - halfD);
    maxZ = Math.max(maxZ, item.z + halfD);
    minY = Math.min(minY, item.y);
    maxY = Math.max(maxY, item.y + item.dims.h);
  }

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    cz: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
    height: maxY - minY,
  };
}

/**
 * Compute new (x, z) positions for a group of items translated by (deltaX, deltaZ) from their drag start.
 * Preserves relative spacing between items and clamps the entire group within the outer viewport bounds.
 */
export function computeMultiDragPositions(
  startPositions: Array<{ id: string; x: number; z: number }>,
  deltaX: number,
  deltaZ: number,
  config: Pick<StandConfig, 'width' | 'depth' | 'snapToGrid' | 'gridStep'>
): Array<{ id: string; x: number; z: number }> {
  if (startPositions.length === 0) return [];

  let dx = deltaX;
  let dz = deltaZ;
  if (config.snapToGrid) {
    const step = config.gridStep || 0.1;
    dx = Math.round(dx / step) * step;
    dz = Math.round(dz / step) * step;
  }

  // Clamp group delta so every item stays within ±0.9 * stand dimensions while preserving relative offsets
  const maxX = config.width * 0.9;
  const maxZ = config.depth * 0.9;
  let minAllowedDx = -Infinity;
  let maxAllowedDx = Infinity;
  let minAllowedDz = -Infinity;
  let maxAllowedDz = Infinity;

  for (const pos of startPositions) {
    minAllowedDx = Math.max(minAllowedDx, -maxX - pos.x);
    maxAllowedDx = Math.min(maxAllowedDx, maxX - pos.x);
    minAllowedDz = Math.max(minAllowedDz, -maxZ - pos.z);
    maxAllowedDz = Math.min(maxAllowedDz, maxZ - pos.z);
  }

  if (minAllowedDx <= maxAllowedDx) {
    dx = Math.max(minAllowedDx, Math.min(maxAllowedDx, dx));
  }
  if (minAllowedDz <= maxAllowedDz) {
    dz = Math.max(minAllowedDz, Math.min(maxAllowedDz, dz));
  }

  return startPositions.map((pos) => ({
    id: pos.id,
    x: Number((pos.x + dx).toFixed(3)),
    z: Number((pos.z + dz).toFixed(3)),
  }));
}

/**
 * Rotate a group of unlocked items by `deltaDeg` around their shared centroid (or in place if 1 item).
 */
export function computeGroupRotationUpdates(
  items: StandItem[],
  selectedIds: string[],
  deltaDeg: number
): Array<{ id: string; x: number; z: number; rotationY: number }> {
  const targets = items.filter((i) => selectedIds.includes(i.id) && !i.locked);
  if (targets.length === 0) return [];

  if (targets.length === 1) {
    const cur = targets[0];
    return [
      {
        id: cur.id,
        x: cur.x,
        z: cur.z,
        rotationY: (cur.rotationY + deltaDeg + 360) % 360,
      },
    ];
  }

  const bounds = computeGroupBounds(targets);
  if (!bounds) return [];
  const rad = (deltaDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Three.js +rotationY rotates counter-clockwise looking down +Y:
  // x' = x * cos(rad) + z * sin(rad)
  // z' = -x * sin(rad) + z * cos(rad)
  return targets.map((item) => {
    const rx = item.x - bounds.cx;
    const rz = item.z - bounds.cz;
    const nx = bounds.cx + rx * cos + rz * sin;
    const nz = bounds.cz - rx * sin + rz * cos;
    return {
      id: item.id,
      x: Number(nx.toFixed(3)),
      z: Number(nz.toFixed(3)),
      rotationY: (item.rotationY + deltaDeg + 360) % 360,
    };
  });
}

export type AlignMode = 'left' | 'center-x' | 'right' | 'back' | 'center-z' | 'front';

/**
 * Align unlocked selected items along a common edge or centerline.
 */
export function computeAlignmentUpdates(
  items: StandItem[],
  selectedIds: string[],
  mode: AlignMode
): Array<{ id: string; x: number; z: number }> {
  const targets = items.filter((i) => selectedIds.includes(i.id) && !i.locked);
  if (targets.length < 2) return [];
  const bounds = computeGroupBounds(targets);
  if (!bounds) return [];

  return targets.map((item) => {
    const { halfW, halfD } = getItemWorldHalfExtents(item);
    let nx = item.x;
    let nz = item.z;
    if (mode === 'left') nx = bounds.minX + halfW;
    else if (mode === 'center-x') nx = bounds.cx;
    else if (mode === 'right') nx = bounds.maxX - halfW;
    else if (mode === 'back') nz = bounds.minZ + halfD;
    else if (mode === 'center-z') nz = bounds.cz;
    else if (mode === 'front') nz = bounds.maxZ - halfD;
    return {
      id: item.id,
      x: Number(nx.toFixed(3)),
      z: Number(nz.toFixed(3)),
    };
  });
}
