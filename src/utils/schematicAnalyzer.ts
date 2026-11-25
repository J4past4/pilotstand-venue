import { createPrimitiveId } from '../engine/customAssetMesh';
import type { AssetPrimitive, AssetPrimitiveFinish, AssetPrimitiveKind } from '../types/stand';

export type SchematicViewPlane = 'auto' | 'multi-view' | 'top' | 'front';

export interface RgbaBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DetectedViewRect {
  /** Normalized 0..1 coordinates relative to original image */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SchematicLayoutInfo {
  mode: 'multi-view-vertical' | 'multi-view-horizontal' | 'single-top' | 'single-front';
  planRect?: DetectedViewRect;
  elevationRect?: DetectedViewRect;
  sideRect?: DetectedViewRect;
  /** Width of detected machine body in working pixels (excluding margins & dim lines) */
  machineSpanPx: number;
  /** Effective millimetres per original image pixel */
  mmPerOriginalPx: number;
}

export interface LocalSchematicAnalyzeOptions {
  image: HTMLImageElement;
  mmPerPx: number;
  viewPlane: SchematicViewPlane;
  defaultHeightMm: number;
  defaultDepthMm: number;
  /** Optional known overall machine width in mm (used to calibrate machine span cleanly) */
  machineWidthMm?: number;
}

export interface ImageDataAnalyzeOptions {
  mmPerPx: number;
  viewPlane: SchematicViewPlane;
  defaultHeightMm: number;
  defaultDepthMm: number;
  /** Optional known overall machine width in mm (used to calibrate machine span cleanly) */
  machineWidthMm?: number;
  /** Original image width before downsampling (defaults to buffer width) */
  originalWidth?: number;
}

export interface SchematicAnalyzeResult {
  primitives: AssetPrimitive[];
  assetName?: string;
  summary: string;
  source: 'ai' | 'local-cv';
  layout?: SchematicLayoutInfo;
}

const PALETTE_COLORS = ['#334155', '#64748B', '#475569', '#D95D39', '#1B365D', '#CBD5E1'];

interface BoxRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface DetectedCircle {
  cx: number;
  cy: number;
  r: number;
  score: number;
}

interface DetectedRegion {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  fillRatio: number;
  isCircle: boolean;
}

interface ElevationZone {
  u0: number;
  u1: number;
  /** Height from bottom of zone to top of zone, in pixels */
  heightPx: number;
  /** Elevation of bottom of zone above floor, in pixels */
  baseElevPx: number;
}

interface HorizontalBand {
  y0: number;
  y1: number;
  minX: number;
  maxX: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Downsamples an RGBA buffer if larger than maxSide using box/nearest sampling.
 */
function downsampleRgba(src: RgbaBuffer, maxSide = 600): { buf: RgbaBuffer; scale: number } {
  const longest = Math.max(src.width, src.height);
  if (longest <= maxSide) {
    return { buf: src, scale: 1 };
  }
  const scale = maxSide / longest;
  const w = Math.max(32, Math.round(src.width * scale));
  const h = Math.max(32, Math.round(src.height * scale));
  const dst = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y / scale);
    const sy1 = Math.max(sy0, Math.min(src.height - 1, Math.ceil((y + 1) / scale) - 1));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x / scale);
      const sx1 = Math.max(sx0, Math.min(src.width - 1, Math.ceil((x + 1) / scale) - 1));
      let bestLum = 999;
      let bestR = 255;
      let bestG = 255;
      let bestB = 255;
      for (let sy = sy0; sy <= sy1; sy++) {
        for (let sx = sx0; sx <= sx1; sx++) {
          const sp = (sy * src.width + sx) * 4;
          const r = src.data[sp];
          const g = src.data[sp + 1];
          const b = src.data[sp + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum < bestLum) {
            bestLum = lum;
            bestR = r;
            bestG = g;
            bestB = b;
          }
        }
      }
      const dp = (y * w + x) * 4;
      dst[dp] = bestR;
      dst[dp + 1] = bestG;
      dst[dp + 2] = bestB;
      dst[dp + 3] = 255;
    }
  }

  return { buf: { width: w, height: h, data: dst }, scale };
}

/**
 * Extracts strong ink, fill mask, luminance map, and removes outer page borders & faint grids.
 */
function extractInkMaps(buf: RgbaBuffer): {
  strongInk: Uint8Array;
  fillMask: Uint8Array;
  lumMap: Float32Array;
  bgLum: number;
} {
  const { width: w, height: h, data } = buf;
  const totalPx = w * h;

  // Estimate dominant background color from outer border pixels
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let borderSamples = 0;
  for (let x = 0; x < w; x += 2) {
    const iTop = x * 4;
    const iBot = ((h - 1) * w + x) * 4;
    bgR += data[iTop] + data[iBot];
    bgG += data[iTop + 1] + data[iBot + 1];
    bgB += data[iTop + 2] + data[iBot + 2];
    borderSamples += 2;
  }
  for (let y = 0; y < h; y += 2) {
    const iLeft = y * w * 4;
    const iRight = (y * w + (w - 1)) * 4;
    bgR += data[iLeft] + data[iRight];
    bgG += data[iLeft + 1] + data[iRight + 1];
    bgB += data[iLeft + 2] + data[iRight + 2];
    borderSamples += 2;
  }
  bgR /= Math.max(1, borderSamples);
  bgG /= Math.max(1, borderSamples);
  bgB /= Math.max(1, borderSamples);
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

  const strongInk = new Uint8Array(totalPx);
  const fillMask = new Uint8Array(totalPx);
  const lumMap = new Float32Array(totalPx);

  for (let i = 0; i < totalPx; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    lumMap[i] = lum;
    const lumDiff = Math.abs(lum - bgLum);
    const colorDist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

    // Exclude pastel shaded fills and light gray/blue background gridlines from strongInk
    if (lumDiff > 55 || colorDist > 135) {
      strongInk[i] = 1;
    }
    if (lumDiff > 18 || colorDist > 38) {
      fillMask[i] = 1;
    }
  }

  // Seal 1-pixel anti-aliased pinholes in thin JPEG/scanned contours without bridging white drafting gaps
  const sealed = new Uint8Array(strongInk);
  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = rowOff + x;
      if (strongInk[idx]) continue;
      if (Math.abs(lumMap[idx] - bgLum) < 20) continue;
      const horiz = strongInk[idx - 1] && strongInk[idx + 1];
      const vert = strongInk[idx - w] && strongInk[idx + w];
      const diag1 = strongInk[idx - w - 1] && strongInk[idx + w + 1];
      const diag2 = strongInk[idx - w + 1] && strongInk[idx + w - 1];
      if (horiz || vert || diag1 || diag2) {
        sealed[idx] = 1;
      }
    }
  }
  strongInk.set(sealed);

  // Suppress outer drawing border frame lines (near image perimeter spanning >72% of image)
  const marginX = Math.max(4, Math.floor(w * 0.1));
  const marginY = Math.max(4, Math.floor(h * 0.1));

  for (let y = 0; y < h; y++) {
    if (y >= marginY && y < h - marginY) continue;
    let count = 0;
    for (let x = 0; x < w; x++) {
      if (strongInk[y * w + x]) count++;
    }
    if (count > w * 0.72) {
      for (let x = 0; x < w; x++) {
        strongInk[y * w + x] = 0;
        fillMask[y * w + x] = 0;
      }
    }
  }

  for (let x = 0; x < w; x++) {
    if (x >= marginX && x < w - marginX) continue;
    let count = 0;
    for (let y = 0; y < h; y++) {
      if (strongInk[y * w + x]) count++;
    }
    if (count > h * 0.72) {
      for (let y = 0; y < h; y++) {
        strongInk[y * w + x] = 0;
        fillMask[y * w + x] = 0;
      }
    }
  }

  // Also suppress faint full-span grid lines from fillMask
  for (let y = 0; y < h; y++) {
    let fCount = 0;
    let sCount = 0;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (fillMask[idx]) fCount++;
      if (strongInk[idx]) sCount++;
    }
    if (fCount > w * 0.85 && sCount < w * 0.15) {
      for (let x = 0; x < w; x++) {
        if (!strongInk[y * w + x]) fillMask[y * w + x] = 0;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let fCount = 0;
    let sCount = 0;
    for (let y = 0; y < h; y++) {
      const idx = y * w + x;
      if (fillMask[idx]) fCount++;
      if (strongInk[idx]) sCount++;
    }
    if (fCount > h * 0.85 && sCount < h * 0.15) {
      for (let y = 0; y < h; y++) {
        if (!strongInk[y * w + x]) fillMask[y * w + x] = 0;
      }
    }
  }

  return { strongInk, fillMask, lumMap, bgLum };
}

/**
 * Flood-fills exterior background on a binary barrier mask and returns the enclosed-interior mask.
 */
function findEnclosedInteriors(barrier: Uint8Array, w: number, h: number): Uint8Array {
  const totalPx = w * h;
  const exterior = new Uint8Array(totalPx);
  const queue = new Int32Array(totalPx);
  let head = 0;
  let tail = 0;

  const enqueue = (idx: number) => {
    if (!exterior[idx] && !barrier[idx]) {
      exterior[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    enqueue(x);
    enqueue((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    enqueue(y * w);
    enqueue(y * w + (w - 1));
  }

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (cx > 0) enqueue(cur - 1);
    if (cx < w - 1) enqueue(cur + 1);
    if (cy > 0) enqueue(cur - w);
    if (cy < h - 1) enqueue(cur + w);
  }

  const enclosed = new Uint8Array(totalPx);
  for (let i = 0; i < totalPx; i++) {
    if (!exterior[i] && !barrier[i]) {
      enclosed[i] = 1;
    }
  }
  return enclosed;
}

/**
 * Builds a clean structural body mask that preserves all closed machine contours and solid fills
 * while stripping open dimension lines, extension lines, arrowheads, and tiny printed numbers.
 */
function buildStructuralBodyMask(
  strongInk: Uint8Array,
  fillMask: Uint8Array,
  w: number,
  h: number
): Uint8Array {
  const totalPx = w * h;
  const enclosed = findEnclosedInteriors(strongInk, w, h);

  // Filter connected components of enclosed interiors: discard tiny text-glyph holes (e.g. '0', '8')
  const visited = new Uint8Array(totalPx);
  const queue = new Int32Array(totalPx);
  const cleanEnclosed = new Uint8Array(totalPx);
  const minCavityArea = Math.max(40, Math.round(totalPx * 0.00025));

  for (let i = 0; i < totalPx; i++) {
    if (!enclosed[i] || visited[i]) continue;
    let head = 0;
    let tail = 0;
    visited[i] = 1;
    queue[tail++] = i;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;

    while (head < tail) {
      const cur = queue[head++];
      const x = cur % w;
      const y = (cur - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && enclosed[cur - 1] && !visited[cur - 1]) {
        visited[cur - 1] = 1;
        queue[tail++] = cur - 1;
      }
      if (x < w - 1 && enclosed[cur + 1] && !visited[cur + 1]) {
        visited[cur + 1] = 1;
        queue[tail++] = cur + 1;
      }
      if (y > 0 && enclosed[cur - w] && !visited[cur - w]) {
        visited[cur - w] = 1;
        queue[tail++] = cur - w;
      }
      if (y < h - 1 && enclosed[cur + w] && !visited[cur + w]) {
        visited[cur + w] = 1;
        queue[tail++] = cur + w;
      }
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const isPageBorder = bw > w * 0.88 && bh > h * 0.88;
    // Keep any real structural cavity (including thin bases like 245x6px turntable plates!)
    const isTinyGlyphHole = tail < minCavityArea && bw < 16 && bh < 16;
    if (!isPageBorder && !isTinyGlyphHole && tail >= 30 && Math.max(bw, bh) >= 10) {
      for (let k = 0; k < tail; k++) {
        cleanEnclosed[queue[k]] = 1;
      }
    }
  }

  // Dilate cleanEnclosed by 1px so structural boundary strokes are included without inflating dimensions
  const body = new Uint8Array(totalPx);
  let bodyCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!cleanEnclosed[y * w + x]) continue;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy;
        if (ny < 0 || ny >= h) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          if (nx < 0 || nx >= w) continue;
          const nIdx = ny * w + nx;
          if (!body[nIdx]) {
            body[nIdx] = 1;
            bodyCount++;
          }
        }
      }
    }
  }

  // Fallback for soft/un-stroked filled silhouettes: add large solid fill regions that survive 2px erosion
  if (bodyCount < totalPx * 0.015) {
    const eroded = new Uint8Array(totalPx);
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        let allOn = true;
        for (let oy = -1; oy <= 1 && allOn; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!fillMask[(y + oy) * w + (x + ox)]) {
              allOn = false;
              break;
            }
          }
        }
        if (allOn) eroded[y * w + x] = 1;
      }
    }
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!eroded[y * w + x]) continue;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            body[(y + oy) * w + (x + ox)] = 1;
          }
        }
      }
    }
  }

  return body;
}

/**
 * Computes tight bounding box of non-zero pixels in `mask` restricted to `roi`.
 */
function getMaskBounds(mask: Uint8Array, w: number, h: number, roi?: BoxRect): BoxRect | null {
  const x0 = roi ? Math.max(0, roi.minX) : 0;
  const x1 = roi ? Math.min(w - 1, roi.maxX) : w - 1;
  const y0 = roi ? Math.max(0, roi.minY) : 0;
  const y1 = roi ? Math.min(h - 1, roi.maxY) : h - 1;
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  for (let y = y0; y <= y1; y++) {
    const rowOff = y * w;
    for (let x = x0; x <= x1; x++) {
      if (mask[rowOff + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, maxX, minY, maxY };
}

/**
 * Gradient-guided Circle Hough Transform + perimeter & corner verification.
 * Detects circles (turntables, drums, tanks, pedestals) even when crossed by text or arrows
 * or partially overlapped by an adjacent base frame.
 */
function detectCirclesInRoi(
  strongInk: Uint8Array,
  bodyMask: Uint8Array,
  lumMap: Float32Array,
  w: number,
  h: number,
  roi: BoxRect
): DetectedCircle[] {
  const rw = roi.maxX - roi.minX + 1;
  const rh = roi.maxY - roi.minY + 1;
  const minSide = Math.min(rw, rh);
  if (minSide < 24) return [];

  // Work at a fast sub-resolution <= 160px for Hough voting
  const maxWork = 150;
  const scale = Math.min(1, maxWork / Math.max(rw, rh));
  const gw = Math.max(24, Math.round(rw * scale));
  const gh = Math.max(24, Math.round(rh * scale));

  // Collect boundary edge points with clean inward normals from bodyMask (and strongInk fallback)
  const edges: Array<{ x: number; y: number; nx: number; ny: number }> = [];
  for (let gy = 1; gy < gh - 1; gy++) {
    const sy = Math.min(h - 2, Math.max(1, roi.minY + Math.round(gy / scale)));
    for (let gx = 1; gx < gw - 1; gx++) {
      const sx = Math.min(w - 2, Math.max(1, roi.minX + Math.round(gx / scale)));
      const idx = sy * w + sx;

      // Check 3x3 Sobel on bodyMask (gives clean, noise-free inward normal on closed shapes!)
      const bGx =
        -bodyMask[idx - w - 1] +
        bodyMask[idx - w + 1] -
        2 * bodyMask[idx - 1] +
        2 * bodyMask[idx + 1] -
        bodyMask[idx + w - 1] +
        bodyMask[idx + w + 1];
      const bGy =
        -bodyMask[idx - w - 1] -
        2 * bodyMask[idx - w] -
        bodyMask[idx - w + 1] +
        bodyMask[idx + w - 1] +
        2 * bodyMask[idx + w] +
        bodyMask[idx + w + 1];
      const bMag = Math.hypot(bGx, bGy);
      if (bMag >= 1.5) {
        edges.push({ x: gx, y: gy, nx: bGx / bMag, ny: bGy / bMag });
        continue;
      }

      // Also check luminance gradient if a strongInk stroke crosses this cell
      const hasInk =
        strongInk[idx] ||
        (sx + 1 < w && strongInk[idx + 1]) ||
        (sy + 1 < h && strongInk[idx + w]);
      if (!hasInk) continue;
      const gxVal =
        -lumMap[idx - w - 1] +
        lumMap[idx - w + 1] -
        2 * lumMap[idx - 1] +
        2 * lumMap[idx + 1] -
        lumMap[idx + w - 1] +
        lumMap[idx + w + 1];
      const gyVal =
        -lumMap[idx - w - 1] -
        2 * lumMap[idx - w] -
        lumMap[idx - w + 1] +
        lumMap[idx + w - 1] +
        2 * lumMap[idx + w] +
        lumMap[idx + w + 1];
      const mag = Math.hypot(gxVal, gyVal);
      if (mag > 40) {
        edges.push({ x: gx, y: gy, nx: gxVal / mag, ny: gyVal / mag });
      }
    }
  }

  if (edges.length < 20) return [];

  const minR = Math.max(8, Math.floor(Math.min(gw, gh) * 0.14));
  const maxR = Math.ceil(Math.min(gw, gh) * 0.52);
  if (maxR <= minR) return [];

  const rStep = 1;
  const numR = Math.floor((maxR - minR) / rStep) + 1;
  const gridCell = 2;
  const cw = Math.ceil(gw / gridCell);
  const ch = Math.ceil(gh / gridCell);
  const acc = new Float32Array(numR * cw * ch);

  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    for (let ri = 0; ri < numR; ri++) {
      const r = minR + ri * rStep;
      const baseOff = ri * cw * ch;
      // Vote in both +normal and -normal directions
      for (const dir of [-1, 1]) {
        const cx = Math.round((e.x + dir * e.nx * r) / gridCell);
        const cy = Math.round((e.y + dir * e.ny * r) / gridCell);
        if (cx >= 0 && cx < cw && cy >= 0 && cy < ch) {
          acc[baseOff + cy * cw + cx] += 1 / r;
        }
      }
    }
  }

  // Pick top peaks PER radius (larger radii first) so big turntables are never crowded out by small circles
  const candidates: Array<{ cx: number; cy: number; r: number; votes: number }> = [];
  for (let ri = numR - 1; ri >= 0; ri--) {
    const r = minR + ri * rStep;
    const baseOff = ri * cw * ch;
    let best1 = { cx: 0, cy: 0, v: 0 };
    let best2 = { cx: 0, cy: 0, v: 0 };
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const v = acc[baseOff + cy * cw + cx];
        if (v > best1.v) {
          best2 = best1;
          best1 = { cx, cy, v };
        } else if (v > best2.v) {
          best2 = { cx, cy, v };
        }
      }
    }
    if (best1.v >= 0.25) {
      candidates.push({
        cx: roi.minX + (best1.cx * gridCell + 0.5) / scale,
        cy: roi.minY + (best1.cy * gridCell + 0.5) / scale,
        r: r / scale,
        votes: best1.v,
      });
    }
    if (best2.v >= 0.25) {
      candidates.push({
        cx: roi.minX + (best2.cx * gridCell + 0.5) / scale,
        cy: roi.minY + (best2.cy * gridCell + 0.5) / scale,
        r: r / scale,
        votes: best2.v,
      });
    }
  }

  // Helper to score a circle directly on full working-res strongInk + bodyMask
  const verifyCircle = (cx: number, cy: number, r: number): { ok: boolean; score: number } => {
    if (r < 12) return { ok: false, score: 0 };
    if (cx - r < roi.minX - 8 || cx + r > roi.maxX + 8 || cy - r < roi.minY - 8 || cy + r > roi.maxY + 8) {
      return { ok: false, score: 0 };
    }

    // 1) Perimeter ink coverage (48 evenly spaced angles)
    const samples = 48;
    let hits = 0;
    const tol = Math.max(2, Math.round(r * 0.05));
    for (let s = 0; s < samples; s++) {
      const a = (s / samples) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * r);
      const py = Math.round(cy + Math.sin(a) * r);
      let found = false;
      for (let oy = -tol; oy <= tol && !found; oy++) {
        const ny = py + oy;
        if (ny < 0 || ny >= h) continue;
        for (let ox = -tol; ox <= tol; ox++) {
          const nx = px + ox;
          if (nx < 0 || nx >= w) continue;
          if (strongInk[ny * w + nx]) {
            found = true;
            break;
          }
        }
      }
      if (found) hits++;
    }
    const perimRatio = hits / samples;
    if (perimRatio < 0.6) return { ok: false, score: 0 };

    // 2) Interior fill ratio on bodyMask
    let inTotal = 0;
    let inBody = 0;
    const step = Math.max(2, Math.round(r / 10));
    for (let dy = -r * 0.85; dy <= r * 0.85; dy += step) {
      for (let dx = -r * 0.85; dx <= r * 0.85; dx += step) {
        if (dx * dx + dy * dy > (r * 0.85) * (r * 0.85)) continue;
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (px >= 0 && px < w && py >= 0 && py < h) {
          inTotal++;
          if (bodyMask[py * w + px]) inBody++;
        }
      }
    }
    const interiorRatio = inTotal > 0 ? inBody / inTotal : 0;
    if (interiorRatio < 0.65) return { ok: false, score: 0 };

    // 3) Corner rejection: a true circle has empty corners outside its radius (unlike a square/rect)
    const cornerOffsets: Array<[number, number]> = [
      [-0.92, -0.92],
      [0.92, -0.92],
      [-0.92, 0.92],
      [0.92, 0.92],
    ];
    let emptyCorners = 0;
    for (const [ox, oy] of cornerOffsets) {
      const px = Math.round(cx + ox * r);
      const py = Math.round(cy + oy * r);
      if (px < 0 || px >= w || py < 0 || py >= h || !bodyMask[py * w + px]) {
        emptyCorners++;
      }
    }
    if (emptyCorners < 2) return { ok: false, score: 0 };

    return { ok: true, score: perimRatio * 0.6 + interiorRatio * 0.4 };
  };

  const verified: DetectedCircle[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    // Skip if already near a larger verified circle
    const insideLarger = verified.some(
      (v) => Math.hypot(v.cx - c.cx, v.cy - c.cy) < v.r * 0.55 && v.r >= c.r * 0.92
    );
    if (insideLarger) continue;

    // Fine-tune cx, cy, r locally
    let bestCx = c.cx;
    let bestCy = c.cy;
    let bestR = c.r;
    let bestCheck = verifyCircle(bestCx, bestCy, bestR);
    if (!bestCheck.ok) continue;

    for (const dr of [-3, -1, 0, 1, 3]) {
      for (const dcx of [-2, 0, 2]) {
        for (const dcy of [-2, 0, 2]) {
          const check = verifyCircle(c.cx + dcx, c.cy + dcy, c.r + dr);
          if (check.ok && check.score > bestCheck.score) {
            bestCheck = check;
            bestCx = c.cx + dcx;
            bestCy = c.cy + dcy;
            bestR = c.r + dr;
          }
        }
      }
    }

    // Concentric outer-ring expansion: if a larger concentric structural circle exists (e.g. Ø1500 outside Ø1270), promote to it
    const maxExpandR = Math.min(rw, rh) * 0.52;
    for (let testR = bestR + 4; testR <= maxExpandR; testR += 2) {
      const outerCheck = verifyCircle(bestCx, bestCy, testR);
      if (outerCheck.ok) {
        bestR = testR;
        bestCheck = outerCheck;
      }
    }

    verified.push({ cx: bestCx, cy: bestCy, r: bestR, score: bestCheck.score });
  }

  // Deduplicate concentric circles: keep the OUTER structural circle (e.g. Ø1500 over inner Ø1270)
  verified.sort((a, b) => b.r - a.r);
  const finalCircles: DetectedCircle[] = [];
  for (const c of verified) {
    const insideExisting = finalCircles.some(
      (outer) => Math.hypot(outer.cx - c.cx, outer.cy - c.cy) < outer.r * 0.6
    );
    if (!insideExisting) {
      finalCircles.push(c);
    }
    if (finalCircles.length >= 4) break;
  }

  return finalCircles;
}

/**
 * Scores how much a panel looks like an Elevation view vs a Top-Down Plan view.
 */
function scorePanelAsElevation(
  bodyMask: Uint8Array,
  strongInk: Uint8Array,
  lumMap: Float32Array,
  w: number,
  h: number,
  roi: BoxRect
): { elevScore: number; circles: DetectedCircle[] } {
  const circles = detectCirclesInRoi(strongInk, bodyMask, lumMap, w, h, roi);
  const bounds = getMaskBounds(bodyMask, w, h, roi);
  if (!bounds) return { elevScore: 0, circles };

  const bw = Math.max(1, bounds.maxX - bounds.minX + 1);
  const bh = Math.max(1, bounds.maxY - bounds.minY + 1);

  // Measure horizontal span in bottom 15% vs top 15% (standing machines are wider at floor!)
  const bandH = Math.max(2, Math.round(bh * 0.15));
  let botMinX = w;
  let botMaxX = -1;
  let topMinX = w;
  let topMaxX = -1;
  for (let y = bounds.maxY - bandH + 1; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (bodyMask[y * w + x]) {
        if (x < botMinX) botMinX = x;
        if (x > botMaxX) botMaxX = x;
      }
    }
  }
  for (let y = bounds.minY; y < bounds.minY + bandH; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (bodyMask[y * w + x]) {
        if (x < topMinX) topMinX = x;
        if (x > topMaxX) topMaxX = x;
      }
    }
  }
  const botSpan = botMaxX >= botMinX ? (botMaxX - botMinX + 1) / bw : 0;
  const topSpan = topMaxX >= topMinX ? (topMaxX - topMinX + 1) / bw : 0;

  // Measure vertical symmetry (plans tend to be front-to-back symmetric; elevations are bottom-heavy)
  let symInter = 0;
  let symUnion = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    const mirrorY = bounds.maxY - (y - bounds.minY);
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const a = bodyMask[y * w + x];
      const b = bodyMask[mirrorY * w + x];
      if (a && b) symInter++;
      if (a || b) symUnion++;
    }
  }
  const vSym = symUnion > 0 ? symInter / symUnion : 0;

  let score = 0;
  if (circles.length > 0) score -= 2.5; // Prominent circles strongly indicate Top-Down Plan
  score += (botSpan - topSpan) * 2.0; // Bottom-heavy strongly indicates Elevation
  score += (1 - vSym) * 1.2; // Vertical asymmetry indicates Elevation
  return { elevScore: score, circles };
}

interface ViewSplitResult {
  mode: 'multi-view-vertical' | 'multi-view-horizontal' | 'single-top' | 'single-front';
  planRoi?: BoxRect;
  elevRoi?: BoxRect;
  sideRoi?: BoxRect;
}

/**
 * Automatically detects whether the schematic is a 2-view orthographic sheet
 * (vertical Elevation + Plan, or horizontal Front + Side) or a single view.
 */
function detectViewLayout(
  bodyMask: Uint8Array,
  strongInk: Uint8Array,
  lumMap: Float32Array,
  w: number,
  h: number,
  requestedViewPlane: SchematicViewPlane
): ViewSplitResult {
  const fullBounds = getMaskBounds(bodyMask, w, h);
  if (!fullBounds) {
    return {
      mode: requestedViewPlane === 'front' ? 'single-front' : 'single-top',
      planRoi: { minX: 0, maxX: w - 1, minY: 0, maxY: h - 1 },
      elevRoi: { minX: 0, maxX: w - 1, minY: 0, maxY: h - 1 },
    };
  }

  if (requestedViewPlane === 'top') {
    return { mode: 'single-top', planRoi: fullBounds };
  }
  if (requestedViewPlane === 'front') {
    return { mode: 'single-front', elevRoi: fullBounds };
  }

  const contentW = fullBounds.maxX - fullBounds.minX + 1;
  const contentH = fullBounds.maxY - fullBounds.minY + 1;

  // 1) Check for VERTICAL split (Elevation stacked above Plan, or vice versa)
  const rowCounts = new Int32Array(h);
  let totalMass = 0;
  for (let y = fullBounds.minY; y <= fullBounds.maxY; y++) {
    let c = 0;
    const off = y * w;
    for (let x = fullBounds.minX; x <= fullBounds.maxX; x++) {
      if (bodyMask[off + x]) c++;
    }
    rowCounts[y] = c;
    totalMass += c;
  }

  const ySearchStart = fullBounds.minY + Math.floor(contentH * 0.2);
  const ySearchEnd = fullBounds.minY + Math.floor(contentH * 0.8);
  const minGapH = Math.max(6, Math.round(contentH * 0.03));

  let bestVGap: { start: number; end: number; score: number } | null = null;
  let y = ySearchStart;
  while (y <= ySearchEnd) {
    if (rowCounts[y] <= Math.max(1, Math.floor(contentW * 0.01))) {
      const start = y;
      while (y <= ySearchEnd && rowCounts[y] <= Math.max(1, Math.floor(contentW * 0.01))) {
        y++;
      }
      const end = y - 1;
      const gapH = end - start + 1;
      if (gapH >= minGapH) {
        let topMass = 0;
        let botMass = 0;
        for (let ry = fullBounds.minY; ry < start; ry++) topMass += rowCounts[ry];
        for (let ry = end + 1; ry <= fullBounds.maxY; ry++) botMass += rowCounts[ry];
        if (topMass >= totalMass * 0.14 && botMass >= totalMass * 0.14) {
          // Verify horizontal X overlap (orthographic views share the X axis!)
          const topBounds = getMaskBounds(bodyMask, w, h, {
            minX: fullBounds.minX,
            maxX: fullBounds.maxX,
            minY: fullBounds.minY,
            maxY: start - 1,
          });
          const botBounds = getMaskBounds(bodyMask, w, h, {
            minX: fullBounds.minX,
            maxX: fullBounds.maxX,
            minY: end + 1,
            maxY: fullBounds.maxY,
          });
          if (topBounds && botBounds) {
            const overlapX = Math.max(
              0,
              Math.min(topBounds.maxX, botBounds.maxX) - Math.max(topBounds.minX, botBounds.minX) + 1
            );
            const minSpanX = Math.max(
              1,
              Math.min(topBounds.maxX - topBounds.minX + 1, botBounds.maxX - botBounds.minX + 1)
            );
            const xOverlapRatio = overlapX / minSpanX;
            if (xOverlapRatio >= 0.65) {
              const score = gapH * xOverlapRatio;
              if (!bestVGap || score > bestVGap.score) {
                bestVGap = { start, end, score };
              }
            }
          }
        }
      }
    } else {
      y++;
    }
  }

  if (bestVGap) {
    const topRoi = getMaskBounds(bodyMask, w, h, {
      minX: fullBounds.minX,
      maxX: fullBounds.maxX,
      minY: fullBounds.minY,
      maxY: bestVGap.start - 1,
    })!;
    const botRoi = getMaskBounds(bodyMask, w, h, {
      minX: fullBounds.minX,
      maxX: fullBounds.maxX,
      minY: bestVGap.end + 1,
      maxY: fullBounds.maxY,
    })!;

    const topEval = scorePanelAsElevation(bodyMask, strongInk, lumMap, w, h, topRoi);
    const botEval = scorePanelAsElevation(bodyMask, strongInk, lumMap, w, h, botRoi);

    // Standard convention: top = elevation, bottom = plan unless bottom clearly scores higher as elevation
    if (botEval.elevScore > topEval.elevScore + 0.35) {
      return {
        mode: 'multi-view-vertical',
        elevRoi: botRoi,
        planRoi: topRoi,
      };
    }
    return {
      mode: 'multi-view-vertical',
      elevRoi: topRoi,
      planRoi: botRoi,
    };
  }

  // 2) Check for HORIZONTAL split (Front Elevation Left + Side Elevation Right)
  const colCounts = new Int32Array(w);
  for (let x = fullBounds.minX; x <= fullBounds.maxX; x++) {
    let c = 0;
    for (let ry = fullBounds.minY; ry <= fullBounds.maxY; ry++) {
      if (bodyMask[ry * w + x]) c++;
    }
    colCounts[x] = c;
  }

  const xSearchStart = fullBounds.minX + Math.floor(contentW * 0.22);
  const xSearchEnd = fullBounds.minX + Math.floor(contentW * 0.78);
  const minGapW = Math.max(10, Math.round(contentW * 0.06));

  let bestHGap: { start: number; end: number; score: number } | null = null;
  let x = xSearchStart;
  while (x <= xSearchEnd) {
    if (colCounts[x] <= Math.max(1, Math.floor(contentH * 0.01))) {
      const start = x;
      while (x <= xSearchEnd && colCounts[x] <= Math.max(1, Math.floor(contentH * 0.01))) {
        x++;
      }
      const end = x - 1;
      const gapW = end - start + 1;
      if (gapW >= minGapW) {
        let leftMass = 0;
        let rightMass = 0;
        for (let rx = fullBounds.minX; rx < start; rx++) leftMass += colCounts[rx];
        for (let rx = end + 1; rx <= fullBounds.maxX; rx++) rightMass += colCounts[rx];
        if (leftMass >= totalMass * 0.2 && rightMass >= totalMass * 0.2) {
          const leftBounds = getMaskBounds(bodyMask, w, h, {
            minX: fullBounds.minX,
            maxX: start - 1,
            minY: fullBounds.minY,
            maxY: fullBounds.maxY,
          });
          const rightBounds = getMaskBounds(bodyMask, w, h, {
            minX: end + 1,
            maxX: fullBounds.maxX,
            minY: fullBounds.minY,
            maxY: fullBounds.maxY,
          });
          if (leftBounds && rightBounds) {
            const leftH = leftBounds.maxY - leftBounds.minY + 1;
            const rightH = rightBounds.maxY - rightBounds.minY + 1;
            const overlapY = Math.max(
              0,
              Math.min(leftBounds.maxY, rightBounds.maxY) - Math.max(leftBounds.minY, rightBounds.minY) + 1
            );
            const yOverlapRatio = overlapY / Math.max(1, Math.max(leftH, rightH));
            // Front + Side elevations share nearly identical height & floor alignment!
            const floorAligned = Math.abs(leftBounds.maxY - rightBounds.maxY) <= Math.max(8, contentH * 0.06);
            if (yOverlapRatio >= 0.82 && floorAligned) {
              const score = gapW * yOverlapRatio;
              if (!bestHGap || score > bestHGap.score) {
                bestHGap = { start, end, score };
              }
            }
          }
        }
      }
    } else {
      x++;
    }
  }

  if (bestHGap) {
    const leftRoi = getMaskBounds(bodyMask, w, h, {
      minX: fullBounds.minX,
      maxX: bestHGap.start - 1,
      minY: fullBounds.minY,
      maxY: fullBounds.maxY,
    })!;
    const rightRoi = getMaskBounds(bodyMask, w, h, {
      minX: bestHGap.end + 1,
      maxX: fullBounds.maxX,
      minY: fullBounds.minY,
      maxY: fullBounds.maxY,
    })!;
    return {
      mode: 'multi-view-horizontal',
      elevRoi: leftRoi,
      sideRoi: rightRoi,
    };
  }

  // 3) Single view — default to Top-Down Plan (most common single-view CAD layout)
  return {
    mode: 'single-top',
    planRoi: fullBounds,
  };
}

/**
 * Extracts piecewise-constant elevation height zones along normalized X (u in [0..1])
 * from an Elevation ROI. Handles both floor-resting parts and elevated beams/beds.
 */
function extractElevationZones(bodyMask: Uint8Array, w: number, elevRoi: BoxRect): ElevationZone[] {
  const ew = Math.max(1, elevRoi.maxX - elevRoi.minX + 1);
  const eh = Math.max(1, elevRoi.maxY - elevRoi.minY + 1);
  const floorY = elevRoi.maxY;

  const numBins = Math.min(80, Math.max(24, ew));
  const rawTopH = new Float32Array(numBins);
  const rawBaseElev = new Float32Array(numBins);

  for (let b = 0; b < numBins; b++) {
    const x0 = elevRoi.minX + Math.floor((b / numBins) * ew);
    const x1 = Math.max(x0, elevRoi.minX + Math.floor(((b + 1) / numBins) * ew) - 1);
    const colTops: number[] = [];
    const colBots: number[] = [];
    for (let x = x0; x <= x1; x++) {
      let minY = -1;
      let maxY = -1;
      for (let y = elevRoi.minY; y <= elevRoi.maxY; y++) {
        if (bodyMask[y * w + x]) {
          if (minY < 0) minY = y;
          maxY = y;
        }
      }
      if (minY >= 0) {
        colTops.push(floorY - minY + 1);
        colBots.push(floorY - maxY);
      }
    }
    rawTopH[b] = colTops.length > 0 ? median(colTops) : 0;
    rawBaseElev[b] = colBots.length > 0 ? median(colBots) : 0;
  }

  // 3-bin median smoothing
  const topH = new Float32Array(numBins);
  const baseElev = new Float32Array(numBins);
  for (let b = 0; b < numBins; b++) {
    const tWin: number[] = [];
    const bWin: number[] = [];
    for (let d = -1; d <= 1; d++) {
      const idx = clamp(b + d, 0, numBins - 1);
      tWin.push(rawTopH[idx]);
      bWin.push(rawBaseElev[idx]);
    }
    topH[b] = median(tWin);
    baseElev[b] = median(bWin);
  }

  // Segment into zones where topH and baseElev are approximately constant
  const tolH = Math.max(8, eh * 0.085);
  const rawZones: Array<{ b0: number; b1: number; topSamples: number[]; baseSamples: number[] }> = [];

  for (let b = 0; b < numBins; b++) {
    if (topH[b] <= 1) continue;
    const prev = rawZones[rawZones.length - 1];
    if (
      prev &&
      b === prev.b1 + 1 &&
      Math.abs(topH[b] - median(prev.topSamples)) <= tolH &&
      Math.abs(baseElev[b] - median(prev.baseSamples)) <= tolH
    ) {
      prev.b1 = b;
      prev.topSamples.push(topH[b]);
      prev.baseSamples.push(baseElev[b]);
    } else {
      rawZones.push({ b0: b, b1: b, topSamples: [topH[b]], baseSamples: [baseElev[b]] });
    }
  }

  // Merge tiny transition slivers (< 3.5% width) into the nearest neighbor
  const minBins = Math.max(2, Math.round(numBins * 0.035));
  const merged: typeof rawZones = [];
  for (const z of rawZones) {
    const len = z.b1 - z.b0 + 1;
    if (len < minBins && merged.length > 0) {
      const last = merged[merged.length - 1];
      last.b1 = z.b1;
    } else {
      merged.push(z);
    }
  }

  return merged.map((z) => {
    const medTop = median(z.topSamples);
    const medBase = median(z.baseSamples);
    // Snap small base elevation (< 6% of total height) cleanly to floor (0)
    const snappedBase = medBase < Math.max(5, eh * 0.06) ? 0 : medBase;
    return {
      u0: z.b0 / numBins,
      u1: (z.b1 + 1) / numBins,
      heightPx: Math.max(4, medTop - snappedBase),
      baseElevPx: snappedBase,
    };
  });
}

/**
 * Extracts vertical height bands from an Elevation ROI (used for Front + Side horizontal fusion).
 */
function extractHorizontalBands(bodyMask: Uint8Array, w: number, roi: BoxRect): HorizontalBand[] {
  const rh = Math.max(1, roi.maxY - roi.minY + 1);
  const rw = Math.max(1, roi.maxX - roi.minX + 1);
  const rowMinX = new Int32Array(rh).fill(-1);
  const rowMaxX = new Int32Array(rh).fill(-1);

  for (let ry = 0; ry < rh; ry++) {
    const y = roi.minY + ry;
    const off = y * w;
    for (let x = roi.minX; x <= roi.maxX; x++) {
      if (bodyMask[off + x]) {
        if (rowMinX[ry] < 0) rowMinX[ry] = x;
        rowMaxX[ry] = x;
      }
    }
  }

  const tolX = Math.max(6, rw * 0.08);
  const bands: Array<{ y0: number; y1: number; minXs: number[]; maxXs: number[] }> = [];
  for (let ry = 0; ry < rh; ry++) {
    if (rowMinX[ry] < 0) continue;
    const prev = bands[bands.length - 1];
    if (
      prev &&
      ry === prev.y1 + 1 &&
      Math.abs(rowMinX[ry] - median(prev.minXs)) <= tolX &&
      Math.abs(rowMaxX[ry] - median(prev.maxXs)) <= tolX
    ) {
      prev.y1 = ry;
      prev.minXs.push(rowMinX[ry]);
      prev.maxXs.push(rowMaxX[ry]);
    } else {
      bands.push({ y0: ry, y1: ry, minXs: [rowMinX[ry]], maxXs: [rowMaxX[ry]] });
    }
  }

  const minBandH = Math.max(6, Math.round(rh * 0.06));
  return bands
    .filter((b) => b.y1 - b.y0 + 1 >= minBandH)
    .map((b) => ({
      y0: roi.minY + b.y0,
      y1: roi.minY + b.y1,
      minX: Math.round(median(b.minXs)),
      maxX: Math.round(median(b.maxXs)),
    }));
}

/**
 * Extracts connected rectangular regions from a binary mask inside ROI.
 */
function extractRectRegions(mask: Uint8Array, w: number, h: number, roi: BoxRect): DetectedRegion[] {
  const totalPx = w * h;
  const visited = new Uint8Array(totalPx);
  const queue = new Int32Array(totalPx);
  const regions: DetectedRegion[] = [];
  const roiArea = (roi.maxX - roi.minX + 1) * (roi.maxY - roi.minY + 1);

  for (let y = roi.minY; y <= roi.maxY; y++) {
    for (let x = roi.minX; x <= roi.maxX; x++) {
      const i = y * w + x;
      if (!mask[i] || visited[i]) continue;
      let head = 0;
      let tail = 0;
      visited[i] = 1;
      queue[tail++] = i;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % w;
        const cy = (cur - cx) / w;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (cx > roi.minX && mask[cur - 1] && !visited[cur - 1]) {
          visited[cur - 1] = 1;
          queue[tail++] = cur - 1;
        }
        if (cx < roi.maxX && mask[cur + 1] && !visited[cur + 1]) {
          visited[cur + 1] = 1;
          queue[tail++] = cur + 1;
        }
        if (cy > roi.minY && mask[cur - w] && !visited[cur - w]) {
          visited[cur - w] = 1;
          queue[tail++] = cur - w;
        }
        if (cy < roi.maxY && mask[cur + w] && !visited[cur + w]) {
          visited[cur + w] = 1;
          queue[tail++] = cur + w;
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const area = tail;
      const fillRatio = area / Math.max(1, bw * bh);

      if (bw >= 8 && bh >= 8 && area >= Math.max(60, roiArea * 0.004) && fillRatio >= 0.25) {
        regions.push({
          minX,
          maxX,
          minY,
          maxY,
          area,
          w: bw,
          h: bh,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
          fillRatio,
          isCircle: false,
        });
      }
    }
  }

  regions.sort((a, b) => b.area - a.area);
  return regions;
}

/**
 * Pure pixel-buffer schematic analyzer (zero DOM dependencies — runs identically in browser and Node/Vitest).
 */
export function analyzeSchematicImageData(
  rawBuf: RgbaBuffer,
  opts: ImageDataAnalyzeOptions
): SchematicAnalyzeResult {
  const { buf, scale } = downsampleRgba(rawBuf, 600);
  const { width: w, height: h } = buf;
  const origW = opts.originalWidth || rawBuf.width;

  const { strongInk, fillMask, lumMap } = extractInkMaps(buf);
  const bodyMask = buildStructuralBodyMask(strongInk, fillMask, w, h);

  const split = detectViewLayout(bodyMask, strongInk, lumMap, w, h, opts.viewPlane);

  const toNormRect = (r?: BoxRect): DetectedViewRect | undefined =>
    r
      ? {
          x: r.minX / w,
          y: r.minY / h,
          w: (r.maxX - r.minX + 1) / w,
          h: (r.maxY - r.minY + 1) / h,
        }
      : undefined;

  // ==================== MODE A: MULTI-VIEW VERTICAL (ELEVATION + TOP-DOWN PLAN) ====================
  if (split.mode === 'multi-view-vertical' && split.planRoi && split.elevRoi) {
    const planRoi = split.planRoi;
    const elevRoi = split.elevRoi;

    const planSpanX = Math.max(1, planRoi.maxX - planRoi.minX + 1);
    const elevSpanX = Math.max(1, elevRoi.maxX - elevRoi.minX + 1);
    const machineSpanPx = Math.max(planSpanX, elevSpanX);
    const mmPerWorkPx = opts.machineWidthMm
      ? opts.machineWidthMm / machineSpanPx
      : opts.mmPerPx / scale;

    const planCx = (planRoi.minX + planRoi.maxX) / 2;
    const planCy = (planRoi.minY + planRoi.maxY) / 2;

    // 1) Detect circles in Plan view
    const circles = detectCirclesInRoi(strongInk, bodyMask, lumMap, w, h, planRoi);

    // 2) Extract Elevation height zones along normalized X
    const elevZones = extractElevationZones(bodyMask, w, elevRoi);

    const sampleElevForRange = (u0: number, u1: number): { hMm: number; yMm: number } => {
      const matching = elevZones.filter((z) => Math.min(z.u1, u1) - Math.max(z.u0, u0) > 0.02);
      if (matching.length === 0) {
        return { hMm: opts.defaultHeightMm, yMm: 0 };
      }
      // Weight by overlap length — use the dominant zone covering this X range
      matching.sort((a, b) => {
        const oa = Math.min(a.u1, u1) - Math.max(a.u0, u0);
        const ob = Math.min(b.u1, u1) - Math.max(b.u0, u0);
        return ob - oa;
      });
      const dom = matching[0];
      return {
        hMm: Math.max(40, Math.round(dom.heightPx * mmPerWorkPx)),
        yMm: Math.max(0, Math.round(dom.baseElevPx * mmPerWorkPx)),
      };
    };

    const primitives: AssetPrimitive[] = [];

    // 3) Emit Cylinder primitives from detected Plan circles fused with Elevation height
    const nonCirclePlanMask = new Uint8Array(bodyMask);
    for (const c of circles) {
      const u0 = clamp((c.cx - c.r - planRoi.minX) / planSpanX, 0, 1);
      const u1 = clamp((c.cx + c.r - planRoi.minX) / planSpanX, 0, 1);
      const { hMm, yMm } = sampleElevForRange(u0, u1);
      const diamMm = Math.max(80, Math.round(c.r * 2 * mmPerWorkPx));
      const xMm = Math.round((c.cx - planCx) * mmPerWorkPx);
      const zMm = Math.round((c.cy - planCy) * mmPerWorkPx);

      primitives.push({
        id: createPrimitiveId(),
        label:
          hMm <= 240 && diamMm >= 800
            ? `Turntable Base (Ø${diamMm}mm)`
            : `Cylindrical Unit (Ø${diamMm}mm)`,
        kind: 'cylinder',
        w: diamMm,
        h: hMm,
        d: diamMm,
        x: xMm,
        y: yMm,
        z: zMm,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: '#334155',
        finish: 'dark-steel',
      });

      // Subtract circle interior + rim margin from nonCirclePlanMask so base/mast don't duplicate the circle
      const rSub = Math.max(c.r + 5, c.r * 1.06);
      const r2 = rSub * rSub;
      const xMin = Math.max(planRoi.minX, Math.floor(c.cx - rSub));
      const xMax = Math.min(planRoi.maxX, Math.ceil(c.cx + rSub));
      const yMin = Math.max(planRoi.minY, Math.floor(c.cy - rSub));
      const yMax = Math.min(planRoi.maxY, Math.ceil(c.cy + rSub));
      for (let py = yMin; py <= yMax; py++) {
        for (let px = xMin; px <= xMax; px++) {
          const dx = px - c.cx;
          const dy = py - c.cy;
          if (dx * dx + dy * dy <= r2) {
            nonCirclePlanMask[py * w + px] = 0;
          }
        }
      }
    }

    // 4) Slice remaining non-circle Plan body by Elevation Zones so every height step gets exact 3D box
    let partIdx = 1;
    for (const zone of elevZones) {
      const sliceMinX = planRoi.minX + Math.floor(zone.u0 * planSpanX);
      const sliceMaxX = Math.min(planRoi.maxX, planRoi.minX + Math.ceil(zone.u1 * planSpanX) - 1);
      if (sliceMaxX - sliceMinX < 4) continue;

      const sliceRoi: BoxRect = {
        minX: sliceMinX,
        maxX: sliceMaxX,
        minY: planRoi.minY,
        maxY: planRoi.maxY,
      };
      const sliceBounds = getMaskBounds(nonCirclePlanMask, w, h, sliceRoi);
      if (!sliceBounds) continue;

      // Count active pixels in this slice to avoid tiny residual slivers near circles
      let activePx = 0;
      for (let py = sliceBounds.minY; py <= sliceBounds.maxY; py++) {
        const off = py * w;
        for (let px = sliceBounds.minX; px <= sliceBounds.maxX; px++) {
          if (nonCirclePlanMask[off + px]) activePx++;
        }
      }
      const sw = sliceBounds.maxX - sliceBounds.minX + 1;
      const sd = sliceBounds.maxY - sliceBounds.minY + 1;
      if (activePx < 36 || sw < 4 || sd < 6) continue;

      const wMm = Math.max(60, Math.round(sw * mmPerWorkPx));
      const dMm = Math.max(60, Math.round(sd * mmPerWorkPx));
      const hMm = Math.max(40, Math.round(zone.heightPx * mmPerWorkPx));
      const yMm = Math.max(0, Math.round(zone.baseElevPx * mmPerWorkPx));
      const xMm = Math.round(((sliceBounds.minX + sliceBounds.maxX) / 2 - planCx) * mmPerWorkPx);
      const zMm = Math.round(((sliceBounds.minY + sliceBounds.maxY) / 2 - planCy) * mmPerWorkPx);

      const isTall = hMm >= 1600;
      const isElevated = yMm >= 250;
      const label = isTall
        ? `Mast / Tower ${partIdx} (${wMm}×${dMm}mm)`
        : isElevated
          ? `Elevated Deck ${partIdx} (${wMm}×${dMm}mm)`
          : `Chassis / Housing ${partIdx} (${wMm}×${dMm}mm)`;

      primitives.push({
        id: createPrimitiveId(),
        label,
        kind: 'box',
        w: wMm,
        h: hMm,
        d: dMm,
        x: xMm,
        y: yMm,
        z: zMm,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: PALETTE_COLORS[partIdx % PALETTE_COLORS.length],
        finish: isTall ? 'metal' : 'matte',
      });
      partIdx++;
    }

    const mmPerOriginalPx = (mmPerWorkPx * w) / Math.max(1, origW);
    return {
      primitives,
      summary: `Auto-detected 2-View Orthographic schematic (Elevation + Top-Down Plan) and fused ${primitives.length} calibrated 3D parts.`,
      source: 'local-cv',
      layout: {
        mode: 'multi-view-vertical',
        planRect: toNormRect(planRoi),
        elevationRect: toNormRect(elevRoi),
        machineSpanPx,
        mmPerOriginalPx,
      },
    };
  }

  // ==================== MODE B: MULTI-VIEW HORIZONTAL (FRONT + SIDE ELEVATION) ====================
  if (split.mode === 'multi-view-horizontal' && split.elevRoi && split.sideRoi) {
    const frontRoi = split.elevRoi;
    const sideRoi = split.sideRoi;

    const frontSpanX = Math.max(1, frontRoi.maxX - frontRoi.minX + 1);
    const mmPerWorkPx = opts.machineWidthMm
      ? opts.machineWidthMm / frontSpanX
      : opts.mmPerPx / scale;

    const frontCx = (frontRoi.minX + frontRoi.maxX) / 2;
    const sideCz = (sideRoi.minX + sideRoi.maxX) / 2;
    const floorY = Math.max(frontRoi.maxY, sideRoi.maxY);

    const frontBands = extractHorizontalBands(bodyMask, w, frontRoi);
    const sideBands = extractHorizontalBands(bodyMask, w, sideRoi);

    const primitives: AssetPrimitive[] = frontBands.map((fb, idx) => {
      // Find overlapping Side Elevation band for true Z depth
      const overlapSide = sideBands
        .map((sb) => ({
          sb,
          overlap: Math.min(fb.y1, sb.y1) - Math.max(fb.y0, sb.y0),
        }))
        .sort((a, b) => b.overlap - a.overlap)[0];

      const wMm = Math.max(60, Math.round((fb.maxX - fb.minX + 1) * mmPerWorkPx));
      const hMm = Math.max(60, Math.round((fb.y1 - fb.y0 + 1) * mmPerWorkPx));
      const yMm = Math.max(0, Math.round((floorY - fb.y1) * mmPerWorkPx));
      const xMm = Math.round(((fb.minX + fb.maxX) / 2 - frontCx) * mmPerWorkPx);

      let dMm = opts.defaultDepthMm;
      let zMm = 0;
      if (overlapSide && overlapSide.overlap > 0) {
        dMm = Math.max(60, Math.round((overlapSide.sb.maxX - overlapSide.sb.minX + 1) * mmPerWorkPx));
        zMm = Math.round(((overlapSide.sb.minX + overlapSide.sb.maxX) / 2 - sideCz) * mmPerWorkPx);
      }

      return {
        id: createPrimitiveId(),
        label: idx === 0 ? `Upper Module (${wMm}×${dMm}mm)` : `Base Module ${idx + 1} (${wMm}×${dMm}mm)`,
        kind: 'box',
        w: wMm,
        h: hMm,
        d: dMm,
        x: xMm,
        y: yMm,
        z: zMm,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: PALETTE_COLORS[idx % PALETTE_COLORS.length],
        finish: idx % 2 === 0 ? 'metal' : 'dark-steel',
      };
    });

    const mmPerOriginalPx = (mmPerWorkPx * w) / Math.max(1, origW);
    return {
      primitives,
      summary: `Auto-detected 2-View Orthographic schematic (Front + Side Elevation) and fused ${primitives.length} calibrated 3D modules.`,
      source: 'local-cv',
      layout: {
        mode: 'multi-view-horizontal',
        elevationRect: toNormRect(frontRoi),
        sideRect: toNormRect(sideRoi),
        machineSpanPx: frontSpanX,
        mmPerOriginalPx,
      },
    };
  }

  // ==================== MODE C: SINGLE FRONT ELEVATION ====================
  if (split.mode === 'single-front' && split.elevRoi) {
    const elevRoi = split.elevRoi;
    const elevSpanX = Math.max(1, elevRoi.maxX - elevRoi.minX + 1);
    const mmPerWorkPx = opts.machineWidthMm
      ? opts.machineWidthMm / elevSpanX
      : opts.mmPerPx / scale;
    const elevZones = extractElevationZones(bodyMask, w, elevRoi);

    const primitives: AssetPrimitive[] = elevZones.map((zone, idx) => {
      const wMm = Math.max(60, Math.round((zone.u1 - zone.u0) * elevSpanX * mmPerWorkPx));
      const hMm = Math.max(60, Math.round(zone.heightPx * mmPerWorkPx));
      const yMm = Math.max(0, Math.round(zone.baseElevPx * mmPerWorkPx));
      const xMm = Math.round(((zone.u0 + zone.u1) / 2 - 0.5) * elevSpanX * mmPerWorkPx);
      return {
        id: createPrimitiveId(),
        label: `Elevation Section ${idx + 1} (${wMm}×${hMm}mm)`,
        kind: 'box',
        w: wMm,
        h: hMm,
        d: opts.defaultDepthMm,
        x: xMm,
        y: yMm,
        z: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: PALETTE_COLORS[idx % PALETTE_COLORS.length],
        finish: idx === 0 ? 'metal' : 'dark-steel',
      };
    });

    const mmPerOriginalPx = (mmPerWorkPx * w) / Math.max(1, origW);
    return {
      primitives,
      summary: `Auto-detected ${primitives.length} elevation section${primitives.length === 1 ? '' : 's'} from the front elevation schematic.`,
      source: 'local-cv',
      layout: {
        mode: 'single-front',
        elevationRect: toNormRect(elevRoi),
        machineSpanPx: elevSpanX,
        mmPerOriginalPx,
      },
    };
  }

  // ==================== MODE D: SINGLE TOP-DOWN PLAN ====================
  const planRoi = split.planRoi || { minX: 0, maxX: w - 1, minY: 0, maxY: h - 1 };
  const planSpanX = Math.max(1, planRoi.maxX - planRoi.minX + 1);
  const mmPerWorkPx = opts.machineWidthMm
    ? opts.machineWidthMm / planSpanX
    : opts.mmPerPx / scale;
  const planCx = (planRoi.minX + planRoi.maxX) / 2;
  const planCy = (planRoi.minY + planRoi.maxY) / 2;

  const circles = detectCirclesInRoi(strongInk, bodyMask, lumMap, w, h, planRoi);
  const nonCircleMask = new Uint8Array(bodyMask);
  const primitives: AssetPrimitive[] = [];

  for (const c of circles) {
    const diamMm = Math.max(80, Math.round(c.r * 2 * mmPerWorkPx));
    const xMm = Math.round((c.cx - planCx) * mmPerWorkPx);
    const zMm = Math.round((c.cy - planCy) * mmPerWorkPx);
    const guessedH = diamMm >= 1000 ? 120 : Math.min(opts.defaultHeightMm, 900);

    primitives.push({
      id: createPrimitiveId(),
      label:
        diamMm >= 1000
          ? `Detected Turntable (Ø${diamMm}mm)`
          : `Detected Cylinder (Ø${diamMm}mm)`,
      kind: 'cylinder',
      w: diamMm,
      h: guessedH,
      d: diamMm,
      x: xMm,
      y: 0,
      z: zMm,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      color: '#334155',
      finish: 'dark-steel',
    });

    const rSub = Math.max(c.r + 5, c.r * 1.06);
    const r2 = rSub * rSub;
    const xMin = Math.max(planRoi.minX, Math.floor(c.cx - rSub));
    const xMax = Math.min(planRoi.maxX, Math.ceil(c.cx + rSub));
    const yMin = Math.max(planRoi.minY, Math.floor(c.cy - rSub));
    const yMax = Math.min(planRoi.maxY, Math.ceil(c.cy + rSub));
    for (let py = yMin; py <= yMax; py++) {
      for (let px = xMin; px <= xMax; px++) {
        const dx = px - c.cx;
        const dy = py - c.cy;
        if (dx * dx + dy * dy <= r2) {
          nonCircleMask[py * w + px] = 0;
        }
      }
    }
  }

  const rectRegions = extractRectRegions(nonCircleMask, w, h, planRoi).slice(0, 8);
  rectRegions.forEach((r, idx) => {
    const wMm = Math.max(60, Math.round(r.w * mmPerWorkPx));
    const dMm = Math.max(60, Math.round(r.h * mmPerWorkPx));
    const xMm = Math.round((r.cx - planCx) * mmPerWorkPx);
    const zMm = Math.round((r.cy - planCy) * mmPerWorkPx);
    primitives.push({
      id: createPrimitiveId(),
      label: `Detected Block ${idx + 1} (${wMm}×${dMm}mm)`,
      kind: 'box',
      w: wMm,
      h: opts.defaultHeightMm,
      d: dMm,
      x: xMm,
      y: 0,
      z: zMm,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      color: PALETTE_COLORS[(idx + 1) % PALETTE_COLORS.length],
      finish: idx % 2 === 0 ? 'metal' : 'matte',
    });
  });

  if (primitives.length === 0) {
    return {
      primitives: [],
      summary:
        'No distinct closed shapes were auto-detected. Use the Trace Box, Circle, or Polygon tools directly on the schematic.',
      source: 'local-cv',
    };
  }

  const circleCount = primitives.filter((p) => p.kind === 'cylinder').length;
  const boxCount = primitives.length - circleCount;
  const mmPerOriginalPx = (mmPerWorkPx * w) / Math.max(1, origW);

  return {
    primitives,
    summary: `Auto-detected ${primitives.length} shapes (${circleCount} cylinder${circleCount === 1 ? '' : 's'}, ${boxCount} box${boxCount === 1 ? '' : 'es'}) from the 2D plan schematic.`,
    source: 'local-cv',
    layout: {
      mode: 'single-top',
      planRect: toNormRect(planRoi),
      machineSpanPx: planSpanX,
      mmPerOriginalPx,
    },
  };
}

/**
 * Fast, zero-dependency in-browser Computer Vision detector for 2D schematics.
 * Supports single-view plans, front elevations, and automatic 2-view orthographic fusion
 * (Elevation + Top-Down Plan, or Front + Side Elevation).
 */
export function analyzeSchematicLocally(
  opts: LocalSchematicAnalyzeOptions
): SchematicAnalyzeResult {
  const { image, mmPerPx, viewPlane, defaultHeightMm, defaultDepthMm, machineWidthMm } = opts;
  const natW = image.naturalWidth || image.width || 800;
  const natH = image.naturalHeight || image.height || 600;

  const maxSide = 600;
  const scale = Math.min(1, maxSide / Math.max(natW, natH));
  const w = Math.max(32, Math.round(natW * scale));
  const h = Math.max(32, Math.round(natH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      primitives: [],
      summary: 'Could not initialize 2D canvas for schematic analysis.',
      source: 'local-cv',
    };
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  return analyzeSchematicImageData(
    { width: w, height: h, data: imgData.data },
    {
      mmPerPx: mmPerPx / scale,
      viewPlane,
      defaultHeightMm,
      defaultDepthMm,
      machineWidthMm,
      originalWidth: natW,
    }
  );
}

/**
 * Downscales an image into a clean JPEG data URL under 1024px for fast AI vision upload.
 */
function compressImageForAI(image: HTMLImageElement): string {
  const natW = image.naturalWidth || image.width || 800;
  const natH = image.naturalHeight || image.height || 600;
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(natW, natH));
  const w = Math.max(64, Math.round(natW * scale));
  const h = Math.max(64, Math.round(natH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Attempts AI vision schematic-to-3D generation via /api/schematic-to-3d.
 * Falls back cleanly to local computer-vision detection (with automatic multi-view fusion)
 * if no AI backend is configured.
 */
export async function analyzeSchematicWithAI(
  opts: LocalSchematicAnalyzeOptions & { notes?: string; overallWidthMm?: number }
): Promise<SchematicAnalyzeResult> {
  try {
    const dataUrl = compressImageForAI(opts.image);
    if (!dataUrl) {
      return analyzeSchematicLocally(opts);
    }

    const resp = await fetch('/api/schematic-to-3d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl: dataUrl,
        viewPlane: opts.viewPlane,
        overallWidthMm: opts.machineWidthMm ?? opts.overallWidthMm,
        defaultHeightMm: opts.defaultHeightMm,
        notes: opts.notes || '',
      }),
    });

    if (!resp.ok) {
      const local = analyzeSchematicLocally(opts);
      return {
        ...local,
        summary: `${local.summary} (Instant local detector used.)`,
      };
    }

    const data = (await resp.json()) as {
      assetName?: string;
      summary?: string;
      primitives?: Array<Partial<AssetPrimitive>>;
    };

    if (!Array.isArray(data.primitives) || data.primitives.length === 0) {
      return analyzeSchematicLocally(opts);
    }

    const validKinds: AssetPrimitiveKind[] = ['box', 'cylinder', 'cone', 'sphere', 'wedge', 'ring'];
    const validFinishes: AssetPrimitiveFinish[] = ['matte', 'metal', 'dark-steel', 'glass', 'accent'];

    const normalized: AssetPrimitive[] = data.primitives.slice(0, 20).map((p, idx) => {
      const kind: AssetPrimitiveKind = validKinds.includes(p.kind as AssetPrimitiveKind)
        ? (p.kind as AssetPrimitiveKind)
        : 'box';
      const finish: AssetPrimitiveFinish = validFinishes.includes(p.finish as AssetPrimitiveFinish)
        ? (p.finish as AssetPrimitiveFinish)
        : 'metal';
      const w = Math.max(30, Math.min(12000, Math.round(Number(p.w) || 500)));
      const h = Math.max(30, Math.min(8000, Math.round(Number(p.h) || opts.defaultHeightMm)));
      const d =
        kind === 'cylinder' || kind === 'cone' || kind === 'ring'
          ? w
          : Math.max(30, Math.min(12000, Math.round(Number(p.d) || 500)));
      return {
        id: createPrimitiveId(),
        label: typeof p.label === 'string' && p.label.trim() ? p.label.trim() : `Part ${idx + 1}`,
        kind,
        w,
        h,
        d,
        x: Math.round(Number(p.x) || 0),
        y: Math.max(0, Math.round(Number(p.y) || 0)),
        z: Math.round(Number(p.z) || 0),
        rotX: Math.round(Number(p.rotX) || 0),
        rotY: Math.round(Number(p.rotY) || 0),
        rotZ: Math.round(Number(p.rotZ) || 0),
        color:
          typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color)
            ? p.color
            : PALETTE_COLORS[idx % PALETTE_COLORS.length],
        finish,
      };
    });

    // Also run fast local layout detection so the 2D SVG overlay aligns accurately on multi-view sheets
    const localLayout = analyzeSchematicLocally(opts).layout;

    return {
      primitives: normalized,
      assetName: data.assetName,
      summary:
        data.summary ||
        `AI generated ${normalized.length} 3D parts from your schematic. You can tweak any dimension in Shape Builder.`,
      source: 'ai',
      layout: localLayout,
    };
  } catch {
    const local = analyzeSchematicLocally(opts);
    return {
      ...local,
      summary: `${local.summary} (Instant local detector used.)`,
    };
  }
}
