import { createPrimitiveId } from '../engine/customAssetMesh';
import type { AssetPrimitive, AssetPrimitiveFinish, AssetPrimitiveKind } from '../types/stand';

export type SchematicViewPlane = 'top' | 'front';

export interface LocalSchematicAnalyzeOptions {
  image: HTMLImageElement;
  mmPerPx: number;
  viewPlane: SchematicViewPlane;
  defaultHeightMm: number;
  defaultDepthMm: number;
}

export interface SchematicAnalyzeResult {
  primitives: AssetPrimitive[];
  assetName?: string;
  summary: string;
  source: 'ai' | 'local-cv';
}

const PALETTE_COLORS = ['#475569', '#E2E8F0', '#CBD5E1', '#D95D39', '#334155', '#1B365D'];

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

/**
 * Fast, zero-dependency in-browser Computer Vision detector for 2D schematics.
 * Finds enclosed shapes and filled regions, distinguishes circles (turntables/cylinders)
 * from rectangles (masts/enclosures), and converts them into calibrated 3D primitives.
 */
export function analyzeSchematicLocally(
  opts: LocalSchematicAnalyzeOptions
): SchematicAnalyzeResult {
  const { image, mmPerPx, viewPlane, defaultHeightMm, defaultDepthMm } = opts;
  const natW = image.naturalWidth || image.width || 800;
  const natH = image.naturalHeight || image.height || 600;

  const maxSide = 360;
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

  const imgData = ctx.getImageData(0, 0, w, h).data;

  // Estimate dominant background color from border pixels
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let borderSamples = 0;
  for (let x = 0; x < w; x += 4) {
    const iTop = x * 4;
    const iBot = ((h - 1) * w + x) * 4;
    bgR += imgData[iTop] + imgData[iBot];
    bgG += imgData[iTop + 1] + imgData[iBot + 1];
    bgB += imgData[iTop + 2] + imgData[iBot + 2];
    borderSamples += 2;
  }
  bgR /= Math.max(1, borderSamples);
  bgG /= Math.max(1, borderSamples);
  bgB /= Math.max(1, borderSamples);
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

  // Classify each pixel:
  // 1) strong ink/stroke (far from background luminance)
  // 2) filled/shaded region (noticeable color/luminance difference from background, excluding faint grid lines)
  const totalPx = w * h;
  const strokeMask = new Uint8Array(totalPx);
  const fillMask = new Uint8Array(totalPx);

  for (let i = 0; i < totalPx; i++) {
    const p = i * 4;
    const r = imgData[p];
    const g = imgData[p + 1];
    const b = imgData[p + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const lumDiff = Math.abs(lum - bgLum);
    const colorDist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

    if (lumDiff > 65 || colorDist > 130) {
      strokeMask[i] = 1;
    }
    if (lumDiff > 22 || colorDist > 42) {
      fillMask[i] = 1;
    }
  }

  // Flood-fill exterior background on strokeMask to discover enclosed CAD linework shapes
  const exterior = new Uint8Array(totalPx);
  const queue = new Int32Array(totalPx);
  let qHead = 0;
  let qTail = 0;

  const enqueueIfBg = (idx: number) => {
    if (!exterior[idx] && !strokeMask[idx]) {
      exterior[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    enqueueIfBg(x);
    enqueueIfBg((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    enqueueIfBg(y * w);
    enqueueIfBg(y * w + (w - 1));
  }

  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (cx > 0) enqueueIfBg(cur - 1);
    if (cx < w - 1) enqueueIfBg(cur + 1);
    if (cy > 0) enqueueIfBg(cur - w);
    if (cy < h - 1) enqueueIfBg(cur + w);
  }

  // Candidate foreground = enclosed cavities (not exterior and not stroke) OR shaded fills
  // We extract enclosed interiors first; if an image has solid filled shapes without dark outlines,
  // we also combine filled pixels that aren't part of thin gridlines.
  const regionMask = new Uint8Array(totalPx);
  for (let i = 0; i < totalPx; i++) {
    if (!exterior[i] && !strokeMask[i]) {
      regionMask[i] = 1;
    }
  }

  // Extract connected components from regionMask
  const extractComponents = (mask: Uint8Array): DetectedRegion[] => {
    const visited = new Uint8Array(totalPx);
    const regions: DetectedRegion[] = [];
    const compQueue = new Int32Array(totalPx);

    for (let i = 0; i < totalPx; i++) {
      if (!mask[i] || visited[i]) continue;
      let head = 0;
      let tail = 0;
      visited[i] = 1;
      compQueue[tail++] = i;

      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;
      let area = 0;

      while (head < tail) {
        const cur = compQueue[head++];
        const x = cur % w;
        const y = (cur - x) / w;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        if (x > 0 && mask[cur - 1] && !visited[cur - 1]) {
          visited[cur - 1] = 1;
          compQueue[tail++] = cur - 1;
        }
        if (x < w - 1 && mask[cur + 1] && !visited[cur + 1]) {
          visited[cur + 1] = 1;
          compQueue[tail++] = cur + 1;
        }
        if (y > 0 && mask[cur - w] && !visited[cur - w]) {
          visited[cur - w] = 1;
          compQueue[tail++] = cur - w;
        }
        if (y < h - 1 && mask[cur + w] && !visited[cur + w]) {
          visited[cur + w] = 1;
          compQueue[tail++] = cur + w;
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const boxArea = bw * bh;
      const fillRatio = area / Math.max(1, boxArea);

      // Filter noise, text glyphs, and full-page drawing borders
      const isTooSmall = bw < 10 || bh < 10 || area < Math.max(110, totalPx * 0.0018);
      const isPageBorder = bw > w * 0.82 && bh > h * 0.82;
      const isThinLine = fillRatio < 0.28 || bw / bh > 12 || bh / bw > 12;

      if (!isTooSmall && !isPageBorder && !isThinLine) {
        const aspect = Math.min(bw, bh) / Math.max(bw, bh);
        const isCircle = aspect >= 0.78 && fillRatio >= 0.62 && fillRatio <= 0.86;
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
          isCircle,
        });
      }
    }

    return regions;
  };

  let regions = extractComponents(regionMask);

  // Fallback: if the drawing didn't have closed dark borders (e.g. soft silhouette/render),
  // run on the general fillMask instead.
  if (regions.length === 0) {
    regions = extractComponents(fillMask);
  }

  // Sort largest first and remove nested tiny sub-shapes completely contained inside a larger shape
  regions.sort((a, b) => b.area - a.area);
  const filtered: DetectedRegion[] = [];
  for (const r of regions) {
    const insideLarger = filtered.some(
      (parent) =>
        r.minX >= parent.minX - 2 &&
        r.maxX <= parent.maxX + 2 &&
        r.minY >= parent.minY - 2 &&
        r.maxY <= parent.maxY + 2 &&
        r.area < parent.area * 0.5
    );
    if (!insideLarger) {
      filtered.push(r);
    }
    if (filtered.length >= 12) break;
  }

  if (filtered.length === 0) {
    return {
      primitives: [],
      summary:
        'No distinct closed shapes were auto-detected. Use the Trace Rectangle, Circle, or Polygon tools directly on the schematic.',
      source: 'local-cv',
    };
  }

  // Compute overall centroid in scaled-canvas pixels
  let allMinX = Infinity;
  let allMaxX = -Infinity;
  let allMinY = Infinity;
  let allMaxY = -Infinity;
  for (const r of filtered) {
    allMinX = Math.min(allMinX, r.minX);
    allMaxX = Math.max(allMaxX, r.maxX);
    allMinY = Math.min(allMinY, r.minY);
    allMaxY = Math.max(allMaxY, r.maxY);
  }
  const overallCx = (allMinX + allMaxX) / 2;
  const overallCy = (allMinY + allMaxY) / 2;

  // Convert scaled-canvas pixels back to original image pixels, then to mm
  const mmPerScaledPx = mmPerPx / scale;

  const primitives: AssetPrimitive[] = filtered.map((r, idx) => {
    const widthMm = Math.max(60, Math.round(r.w * mmPerScaledPx));
    const heightOrDepthMm = Math.max(60, Math.round(r.h * mmPerScaledPx));
    const offsetXMm = Math.round((r.cx - overallCx) * mmPerScaledPx);

    if (viewPlane === 'top') {
      const offsetZMm = Math.round((r.cy - overallCy) * mmPerScaledPx);
      const kind: AssetPrimitiveKind = r.isCircle ? 'cylinder' : 'box';
      const diamMm = r.isCircle ? Math.round((widthMm + heightOrDepthMm) / 2) : widthMm;
      // Heuristic: wide circular footprints are usually low turntables/bases; smaller boxes are masts/cabinets
      const guessedH = r.isCircle
        ? diamMm >= 900
          ? 120
          : Math.min(defaultHeightMm, 900)
        : defaultHeightMm;
      const finish: AssetPrimitiveFinish = r.isCircle ? 'dark-steel' : idx % 2 === 0 ? 'metal' : 'matte';

      return {
        id: createPrimitiveId(),
        label: r.isCircle
          ? `Detected Turntable / Cylinder ${idx + 1} (Ø${diamMm}mm)`
          : `Detected Block ${idx + 1} (${widthMm}×${heightOrDepthMm}mm)`,
        kind,
        w: diamMm,
        h: guessedH,
        d: r.isCircle ? diamMm : heightOrDepthMm,
        x: offsetXMm,
        y: 0,
        z: offsetZMm,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: PALETTE_COLORS[idx % PALETTE_COLORS.length],
        finish,
      };
    } else {
      // Front elevation: canvas Y maps upward from floor (allMaxY = floor y=0)
      const elevYMm = Math.max(0, Math.round((allMaxY - r.maxY) * mmPerScaledPx));
      const kind: AssetPrimitiveKind = r.isCircle ? 'cylinder' : 'box';
      return {
        id: createPrimitiveId(),
        label: r.isCircle
          ? `Detected Cylinder ${idx + 1}`
          : `Detected Elevation Part ${idx + 1}`,
        kind,
        w: widthMm,
        h: heightOrDepthMm,
        d: r.isCircle ? widthMm : defaultDepthMm,
        x: offsetXMm,
        y: elevYMm,
        z: 0,
        rotX: r.isCircle ? 90 : 0,
        rotY: 0,
        rotZ: 0,
        color: PALETTE_COLORS[idx % PALETTE_COLORS.length],
        finish: idx === 0 ? 'metal' : 'dark-steel',
      };
    }
  });

  const circleCount = primitives.filter((p) => p.kind === 'cylinder').length;
  const boxCount = primitives.length - circleCount;
  return {
    primitives,
    summary: `Auto-detected ${primitives.length} shapes (${circleCount} cylinder${circleCount === 1 ? '' : 's'}, ${boxCount} box${boxCount === 1 ? '' : 'es'}) from the 2D schematic. Adjust heights or refine in Shape Builder.`,
    source: 'local-cv',
  };
}

/**
 * Downscales an image into a clean PNG/JPEG data URL under 1024px for fast AI vision upload.
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
 * Falls back cleanly to local computer-vision detection if no AI backend is configured.
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
        overallWidthMm: opts.overallWidthMm,
        defaultHeightMm: opts.defaultHeightMm,
        notes: opts.notes || '',
      }),
    });

    if (!resp.ok) {
      // Graceful fallback when running locally without Vercel functions or without API keys
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

    return {
      primitives: normalized,
      assetName: data.assetName,
      summary:
        data.summary ||
        `AI generated ${normalized.length} 3D parts from your schematic. You can tweak any dimension in Shape Builder.`,
      source: 'ai',
    };
  } catch {
    const local = analyzeSchematicLocally(opts);
    return {
      ...local,
      summary: `${local.summary} (Instant local detector used.)`,
    };
  }
}
