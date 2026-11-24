import type { ShellWallSide, StandConfig, StandItem } from '../types/stand';

/**
 * Catalog items that act as solid wall / enclosure obstacles on the stand floor.
 * Overhead/open structures like `front-arch` and `truss-rig` are intentionally excluded
 * so furniture can be positioned beneath them.
 */
export const SOLID_WALL_CATALOG_IDS = new Set<string>([
  'popup-wall-straight',
  'popup-wall-curved',
  'seg-lightbox',
  'modular-wall',
  'storage-cabin',
  'led-video-wall',
]);

/** Tolerance (m) below which grazing contact is not treated as penetration. */
const COLLISION_EPS = 0.004;

/** Small clearance (m) applied when snapping an item back out of a wall. */
const SNAP_CLEARANCE = 0.01;

interface Obb2D {
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  hw: number;
  hd: number;
}

export interface WallCollisionResult {
  collides: boolean;
  collidedShellSides: ShellWallSide[];
  collidedWallItemIds: string[];
}

export interface AllowedPositionResult {
  x: number;
  z: number;
  adjusted: boolean;
}

export function isSolidWallItem(item: StandItem): boolean {
  return item.visible !== false && SOLID_WALL_CATALOG_IDS.has(item.catalogId);
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}

function getAabbHalfExtents(item: StandItem): { halfW: number; halfD: number } {
  const rad = (item.rotationY * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    halfW: (item.dims.w * cos + item.dims.d * sin) / 2,
    halfD: (item.dims.w * sin + item.dims.d * cos) / 2,
  };
}

function buildObb2D(item: StandItem, cx: number, cz: number): Obb2D {
  const rad = (item.rotationY * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    cx,
    cz,
    ux: cos,
    uz: -sin,
    vx: sin,
    vz: cos,
    hw: item.dims.w / 2,
    hd: item.dims.d / 2,
  };
}

function verticallyOverlaps(a: StandItem, b: StandItem): boolean {
  const aMinY = a.y;
  const aMaxY = a.y + a.dims.h;
  const bMinY = b.y;
  const bMaxY = b.y + b.dims.h;
  return aMinY < bMaxY - 0.01 && aMaxY > bMinY + 0.01;
}

/**
 * 2D Separating Axis Theorem (SAT) between two oriented bounding boxes on the XZ plane.
 * Returns the Minimum Translation Vector (dx, dz) to push `a` out of `b`, or `null` if separated.
 */
function computeObbMtv(a: Obb2D, b: Obb2D): { dx: number; dz: number; overlap: number } | null {
  const axes: Array<[number, number]> = [
    [a.ux, a.uz],
    [a.vx, a.vz],
    [b.ux, b.uz],
    [b.vx, b.vz],
  ];

  const relX = a.cx - b.cx;
  const relZ = a.cz - b.cz;

  let minOverlap = Infinity;
  let bestAxisX = 0;
  let bestAxisZ = 0;
  let bestSign = 1;

  for (const [ax, az] of axes) {
    const ra =
      a.hw * Math.abs(a.ux * ax + a.uz * az) + a.hd * Math.abs(a.vx * ax + a.vz * az);
    const rb =
      b.hw * Math.abs(b.ux * ax + b.uz * az) + b.hd * Math.abs(b.vx * ax + b.vz * az);
    const dist = relX * ax + relZ * az;
    const overlap = ra + rb - Math.abs(dist);

    if (overlap <= COLLISION_EPS) {
      return null;
    }

    if (overlap < minOverlap) {
      minOverlap = overlap;
      bestAxisX = ax;
      bestAxisZ = az;
      bestSign = dist >= 0 ? 1 : -1;
    }
  }

  const push = minOverlap + SNAP_CLEARANCE;
  return {
    dx: bestAxisX * bestSign * push,
    dz: bestAxisZ * bestSign * push,
    overlap: minOverlap,
  };
}

/**
 * Computes the allowed X/Z half-space bounds imposed by active perimeter shell walls.
 */
function getShellWallBounds(
  item: StandItem,
  config: StandConfig,
  clearance: number
): { minX: number; maxX: number; minZ: number } {
  if (!config.showShellWalls || config.openSides >= 4) {
    return { minX: -Infinity, maxX: Infinity, minZ: -Infinity };
  }

  const { halfW: itemHalfW, halfD: itemHalfD } = getAabbHalfExtents(item);
  const boothHalfW = config.width / 2;
  const boothHalfD = config.depth / 2;

  // Back wall (-Z) is present for openSides 1, 2, 3
  const minZ = -boothHalfD + itemHalfD + clearance;
  // Left wall (-X) is present for Inline (1) & Corner (2)
  const minX = config.openSides <= 2 ? -boothHalfW + itemHalfW + clearance : -Infinity;
  // Right wall (+X) is present for Inline (1)
  const maxX = config.openSides === 1 ? boothHalfW - itemHalfW - clearance : Infinity;

  return { minX, maxX, minZ };
}

function clampToShellWalls(
  x: number,
  z: number,
  item: StandItem,
  config: StandConfig
): { x: number; z: number } {
  const { minX, maxX, minZ } = getShellWallBounds(item, config, SNAP_CLEARANCE);
  let cx = x;
  let cz = z;

  if (minX > maxX) {
    // Item is wider than the booth between left & right walls: center on X
    cx = 0;
  } else {
    if (cx < minX) cx = minX;
    if (cx > maxX) cx = maxX;
  }

  if (cz < minZ) cz = minZ;
  return { x: cx, z: cz };
}

function getRelevantWallItems(item: StandItem, allItems: StandItem[]): StandItem[] {
  return allItems.filter(
    (other) =>
      other.id !== item.id &&
      isSolidWallItem(other) &&
      verticallyOverlaps(item, other)
  );
}

/**
 * Checks whether placing `item` at `(candidateX, candidateZ)` penetrates or crosses
 * any perimeter shell wall or solid interior wall item.
 */
export function checkWallCollision(
  item: StandItem,
  candidateX: number,
  candidateZ: number,
  config: StandConfig,
  allItems: StandItem[]
): WallCollisionResult {
  const collidedShellSides: ShellWallSide[] = [];
  const collidedWallItemIds: string[] = [];

  if (config.showShellWalls && config.openSides < 4) {
    const { minX, maxX, minZ } = getShellWallBounds(item, config, 0);
    if (candidateZ < minZ - COLLISION_EPS) {
      collidedShellSides.push('back');
    }
    if (config.openSides <= 2 && candidateX < minX - COLLISION_EPS) {
      collidedShellSides.push('left');
    }
    if (config.openSides === 1 && candidateX > maxX + COLLISION_EPS) {
      collidedShellSides.push('right');
    }
  }

  const movingObb = buildObb2D(item, candidateX, candidateZ);
  const wallItems = getRelevantWallItems(item, allItems);
  for (const wall of wallItems) {
    const wallObb = buildObb2D(wall, wall.x, wall.z);
    if (computeObbMtv(movingObb, wallObb) !== null) {
      collidedWallItemIds.push(wall.id);
    }
  }

  return {
    collides: collidedShellSides.length > 0 || collidedWallItemIds.length > 0,
    collidedShellSides,
    collidedWallItemIds,
  };
}

/**
 * Finds the nearest allowed `(x, z)` position to `(targetX, targetZ)` that does not
 * penetrate or cross any perimeter shell wall or solid interior wall item.
 */
export function findNearestAllowedPosition(
  item: StandItem,
  targetX: number,
  targetZ: number,
  config: StandConfig,
  allItems: StandItem[],
  fallbackPos?: { x: number; z: number }
): AllowedPositionResult {
  if (!checkWallCollision(item, targetX, targetZ, config, allItems).collides) {
    return { x: round3(targetX), z: round3(targetZ), adjusted: false };
  }

  const wallItems = getRelevantWallItems(item, allItems);
  const shellClamped = clampToShellWalls(targetX, targetZ, item, config);

  if (!checkWallCollision(item, shellClamped.x, shellClamped.z, config, allItems).collides) {
    return { x: round3(shellClamped.x), z: round3(shellClamped.z), adjusted: true };
  }

  const candidates: Array<{ x: number; z: number }> = [];

  // 1. Iterative MTV projection out of overlapping interior walls + shell wall clamping
  let iterX = shellClamped.x;
  let iterZ = shellClamped.z;
  for (let step = 0; step < 12; step++) {
    const movingObb = buildObb2D(item, iterX, iterZ);
    let maxMtv: { dx: number; dz: number; overlap: number } | null = null;

    for (const wall of wallItems) {
      const mtv = computeObbMtv(movingObb, buildObb2D(wall, wall.x, wall.z));
      if (mtv && (!maxMtv || mtv.overlap > maxMtv.overlap)) {
        maxMtv = mtv;
      }
    }

    if (!maxMtv) break;
    const next = clampToShellWalls(iterX + maxMtv.dx, iterZ + maxMtv.dz, item, config);
    iterX = next.x;
    iterZ = next.z;
  }

  if (!checkWallCollision(item, iterX, iterZ, config, allItems).collides) {
    candidates.push({ x: iterX, z: iterZ });
  }

  // 2. Direct face-escape candidates around each colliding interior wall
  const startObb = buildObb2D(item, shellClamped.x, shellClamped.z);
  for (const wall of wallItems) {
    const wallObb = buildObb2D(wall, wall.x, wall.z);
    if (!computeObbMtv(startObb, wallObb)) continue;

    const axes: Array<[number, number]> = [
      [wallObb.ux, wallObb.uz],
      [wallObb.vx, wallObb.vz],
      [startObb.ux, startObb.uz],
      [startObb.vx, startObb.vz],
    ];

    const relX = shellClamped.x - wallObb.cx;
    const relZ = shellClamped.z - wallObb.cz;

    for (const [ax, az] of axes) {
      const ra =
        startObb.hw * Math.abs(startObb.ux * ax + startObb.uz * az) +
        startObb.hd * Math.abs(startObb.vx * ax + startObb.vz * az);
      const rb =
        wallObb.hw * Math.abs(wallObb.ux * ax + wallObb.uz * az) +
        wallObb.hd * Math.abs(wallObb.vx * ax + wallObb.vz * az);
      const dist = relX * ax + relZ * az;

      for (const sign of [-1, 1] as const) {
        const needed = sign * (ra + rb + SNAP_CLEARANCE) - dist;
        const cand = clampToShellWalls(
          shellClamped.x + ax * needed,
          shellClamped.z + az * needed,
          item,
          config
        );
        if (!checkWallCollision(item, cand.x, cand.z, config, allItems).collides) {
          candidates.push(cand);
        }
      }
    }
  }

  if (candidates.length > 0) {
    let best = candidates[0];
    let bestDistSq = (best.x - targetX) ** 2 + (best.z - targetZ) ** 2;
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const dSq = (c.x - targetX) ** 2 + (c.z - targetZ) ** 2;
      if (dSq < bestDistSq) {
        best = c;
        bestDistSq = dSq;
      }
    }
    return { x: round3(best.x), z: round3(best.z), adjusted: true };
  }

  // 3. Radial ring fallback search for tight multi-wall corners
  const maxRadius = Math.max(config.width, config.depth, 4);
  const angleSteps = 24;
  for (let r = 0.05; r <= maxRadius; r += 0.06) {
    let bestRing: { x: number; z: number } | null = null;
    let bestRingDistSq = Infinity;
    for (let i = 0; i < angleSteps; i++) {
      const angle = (i / angleSteps) * Math.PI * 2;
      const cand = clampToShellWalls(
        shellClamped.x + Math.cos(angle) * r,
        shellClamped.z + Math.sin(angle) * r,
        item,
        config
      );
      if (!checkWallCollision(item, cand.x, cand.z, config, allItems).collides) {
        const dSq = (cand.x - targetX) ** 2 + (cand.z - targetZ) ** 2;
        if (dSq < bestRingDistSq) {
          bestRing = cand;
          bestRingDistSq = dSq;
        }
      }
    }
    if (bestRing) {
      return { x: round3(bestRing.x), z: round3(bestRing.z), adjusted: true };
    }
  }

  if (fallbackPos) {
    return { x: round3(fallbackPos.x), z: round3(fallbackPos.z), adjusted: true };
  }
  return { x: round3(shellClamped.x), z: round3(shellClamped.z), adjusted: true };
}
