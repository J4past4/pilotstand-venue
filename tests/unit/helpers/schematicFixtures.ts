import type { AssetPrimitive } from '../../../src/types/stand';
import { computePrimitivesBounds } from '../../../src/engine/customAssetMesh';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface SchematicEvalCase {
  id: string;
  name: string;
  expectedMode: 'multi-view-vertical' | 'multi-view-horizontal' | 'single-top' | 'single-front';
  requestedViewPlane: 'auto' | 'top' | 'front' | 'multi-view';
  /** Known real-world machine width in mm (used to calibrate scale) */
  machineWidthMm: number;
  defaultHeightMm: number;
  defaultDepthMm: number;
  image: RgbaImage;
  groundTruth: {
    widthMm: number;
    depthMm: number;
    heightMm: number;
    expectCylinder?: {
      minDiameterMm: number;
      maxDiameterMm: number;
      minHeightMm: number;
      maxHeightMm: number;
    };
    minParts: number;
    maxParts: number;
    primitives: Array<Pick<AssetPrimitive, 'kind' | 'w' | 'h' | 'd' | 'x' | 'y' | 'z'>>;
  };
}

/**
 * Lightweight pure-TS 2D rasterizer so schematic evaluation tests run in Node/Vitest
 * with zero native canvas dependencies.
 */
class MiniRaster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, bg: [number, number, number] = [255, 255, 255]) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const p = i * 4;
      this.data[p] = bg[0];
      this.data[p + 1] = bg[1];
      this.data[p + 2] = bg[2];
      this.data[p + 3] = 255;
    }
  }

  setPx(x: number, y: number, rgb: [number, number, number]) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return;
    const p = (iy * this.width + ix) * 4;
    this.data[p] = rgb[0];
    this.data[p + 1] = rgb[1];
    this.data[p + 2] = rgb[2];
    this.data[p + 3] = 255;
  }

  fillRect(x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width - 1, Math.ceil(x + w));
    const y1 = Math.min(this.height - 1, Math.ceil(y + h));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        this.setPx(px, py, rgb);
      }
    }
  }

  drawLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    rgb: [number, number, number],
    thickness = 1
  ) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 1.5));
    const r = Math.max(0, (thickness - 1) / 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      if (thickness <= 1) {
        this.setPx(cx, cy, rgb);
      } else {
        for (let oy = -Math.ceil(r); oy <= Math.ceil(r); oy++) {
          for (let ox = -Math.ceil(r); ox <= Math.ceil(r); ox++) {
            if (ox * ox + oy * oy <= (r + 0.35) * (r + 0.35)) {
              this.setPx(cx + ox, cy + oy, rgb);
            }
          }
        }
      }
    }
  }

  strokeRect(
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: [number, number, number],
    thickness = 2
  ) {
    this.drawLine(x, y, x + w, y, rgb, thickness);
    this.drawLine(x + w, y, x + w, y + h, rgb, thickness);
    this.drawLine(x + w, y + h, x, y + h, rgb, thickness);
    this.drawLine(x, y + h, x, y, rgb, thickness);
  }

  fillCircle(cx: number, cy: number, r: number, rgb: [number, number, number]) {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= r2) {
          this.setPx(px, py, rgb);
        }
      }
    }
  }

  strokeCircle(
    cx: number,
    cy: number,
    r: number,
    rgb: [number, number, number],
    thickness = 2
  ) {
    const steps = Math.max(72, Math.ceil(2 * Math.PI * r * 2));
    const half = Math.max(0, (thickness - 1) / 2);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (thickness <= 1) {
        this.setPx(px, py, rgb);
      } else {
        for (let oy = -Math.ceil(half); oy <= Math.ceil(half); oy++) {
          for (let ox = -Math.ceil(half); ox <= Math.ceil(half); ox++) {
            if (ox * ox + oy * oy <= (half + 0.35) * (half + 0.35)) {
              this.setPx(px + ox, py + oy, rgb);
            }
          }
        }
      }
    }
  }

  /** Draw a realistic CAD horizontal dimension callout with extension lines + text stub */
  drawHorizontalDim(
    x0: number,
    x1: number,
    yLine: number,
    yTarget: number,
    rgb: [number, number, number] = [60, 60, 60]
  ) {
    const dir = yLine > yTarget ? 1 : -1;
    // Extension lines with standard 3px drafting gap from target
    this.drawLine(x0, yTarget + dir * 3, x0, yLine + dir * 4, rgb, 1);
    this.drawLine(x1, yTarget + dir * 3, x1, yLine + dir * 4, rgb, 1);
    // Main dimension line
    this.drawLine(x0, yLine, x1, yLine, rgb, 1);
    // Small text stub in middle (mimics printed number like "2450")
    const mx = (x0 + x1) / 2;
    this.drawTextStub(mx - 10, yLine - 7, 4, rgb);
  }

  /** Draw a realistic CAD vertical dimension callout with extension lines + text stub */
  drawVerticalDim(
    xLine: number,
    xTarget: number,
    y0: number,
    y1: number,
    rgb: [number, number, number] = [60, 60, 60]
  ) {
    const dir = xLine > xTarget ? 1 : -1;
    this.drawLine(xTarget + dir * 3, y0, xLine + dir * 4, y0, rgb, 1);
    this.drawLine(xTarget + dir * 3, y1, xLine + dir * 4, y1, rgb, 1);
    this.drawLine(xLine, y0, xLine, y1, rgb, 1);
    const my = (y0 + y1) / 2;
    this.drawTextStub(xLine + (dir > 0 ? 4 : -18), my - 3, 4, rgb);
  }

  /** Mimics small printed CAD digits (e.g. "2450") */
  drawTextStub(x: number, y: number, chars: number, rgb: [number, number, number]) {
    for (let c = 0; c < chars; c++) {
      const cx = x + c * 5;
      this.strokeRect(cx, y, 3, 5, rgb, 1);
    }
  }

  toImage(): RgbaImage {
    return { width: this.width, height: this.height, data: this.data };
  }
}

const INK: [number, number, number] = [20, 24, 30];
const DIM_INK: [number, number, number] = [75, 85, 99];
const GRID: [number, number, number] = [226, 232, 240];

/**
 * 1. Pallet Stretch Wrapper — 2-View Vertical Orthographic Sheet
 * Mirrors the exact real-world machine schematic from the user's screenshot:
 * Side Elevation (top) + Top-Down Plan (bottom).
 * Overall: 2450 (W) x 1500 (D) x 2600 (H) mm.
 */
function buildPalletWrapper2View(): SchematicEvalCase {
  const r = new MiniRaster(420, 560);
  // Scale: 10 mm per px -> 2450mm = 245px, 2600mm = 260px, 1500mm = 150px
  const scale = 0.1; // px per mm
  const x0 = 65; // left edge of machine in both views

  // --- UPPER PANEL: SIDE ELEVATION ---
  const floorY = 300;
  const totalW = Math.round(2450 * scale); // 245px
  const ttW = Math.round(1500 * scale); // 150px
  const ttH = Math.round(78 * scale); // 8px
  const mastW = Math.round(290 * scale); // 29px
  const mastH = Math.round(2600 * scale); // 260px
  const carriageW = Math.round(240 * scale); // 24px
  const carriageH = Math.round(780 * scale); // 78px

  // Turntable & base plate (78mm high, 2450mm long)
  r.strokeRect(x0, floorY - ttH, totalW, ttH, INK, 2);
  r.drawLine(x0, floorY - ttH + 2, x0 + ttW, floorY - ttH + 2, INK, 2);

  // Film carriage left of mast
  const mastX = x0 + totalW - mastW;
  const carX = mastX - carriageW;
  r.strokeRect(carX, floorY - ttH - carriageH, carriageW, carriageH, INK, 2);
  // Internal roller detail inside carriage
  r.drawLine(carX + 6, floorY - ttH - carriageH + 8, carX + 6, floorY - ttH - 8, INK, 2);
  r.drawLine(carX + 14, floorY - ttH - carriageH + 8, carX + 14, floorY - ttH - 8, INK, 2);

  // Tall vertical mast (290mm wide, 2600mm tall) with internal horizontal panel ribs
  r.strokeRect(mastX, floorY - mastH, mastW, mastH, INK, 2);
  r.drawLine(mastX, floorY - Math.round(mastH * 0.35), mastX + mastW, floorY - Math.round(mastH * 0.35), INK, 1);
  r.drawLine(mastX, floorY - Math.round(mastH * 0.72), mastX + mastW, floorY - Math.round(mastH * 0.72), INK, 1);
  // Control panel box detail on mast
  r.fillRect(mastX + 7, floorY - Math.round(mastH * 0.62), 14, 10, INK);

  // Dimension lines around side elevation
  r.drawHorizontalDim(x0, x0 + totalW, floorY + 22, floorY, DIM_INK); // 2450
  r.drawVerticalDim(x0 + totalW + 24, x0 + totalW, floorY - mastH, floorY, DIM_INK); // 2600
  r.drawHorizontalDim(mastX, mastX + mastW, floorY - mastH - 16, floorY - mastH, DIM_INK); // 290
  r.drawVerticalDim(x0 - 18, x0, floorY - ttH, floorY, DIM_INK); // 78

  // --- LOWER PANEL: TOP-DOWN PLAN ---
  const planCenterY = 445;
  const ttR = Math.round((1500 * scale) / 2); // 75px
  const ttCx = x0 + ttR;
  const baseDepth = Math.round(820 * scale); // 82px

  // Base chassis connecting turntable to mast
  r.strokeRect(ttCx + Math.round(ttR * 0.45), planCenterY - baseDepth / 2, x0 + totalW - (ttCx + Math.round(ttR * 0.45)), baseDepth, INK, 2);
  // Mast footprint on right end
  r.strokeRect(mastX, planCenterY - baseDepth / 2, mastW, baseDepth, INK, 2);
  // Internal structural lines on base
  r.drawLine(carX, planCenterY - baseDepth / 2, carX, planCenterY + baseDepth / 2, INK, 1);

  // Circular turntable (outer Ø1500 + inner Ø1270 + diagonal diameter callout)
  r.fillCircle(ttCx, planCenterY, ttR - 1, [255, 255, 255]);
  r.strokeCircle(ttCx, planCenterY, ttR, INK, 2);
  r.strokeCircle(ttCx, planCenterY, Math.round((1270 * scale) / 2), DIM_INK, 1);
  // Diagonal Ø1500 arrow across turntable
  r.drawLine(ttCx - 42, planCenterY + 42, ttCx + 42, planCenterY - 42, DIM_INK, 1);
  r.drawTextStub(ttCx - 8, planCenterY - 8, 4, DIM_INK);

  // Dimension lines around plan
  r.drawVerticalDim(x0 + totalW + 24, x0 + totalW, planCenterY - baseDepth / 2, planCenterY + baseDepth / 2, DIM_INK);
  r.drawHorizontalDim(mastX, mastX + mastW, planCenterY + baseDepth / 2 + 20, planCenterY + baseDepth / 2, DIM_INK);

  return {
    id: 'pallet-wrapper-2view',
    name: 'Pallet Stretch Wrapper (2-View Side + Plan)',
    expectedMode: 'multi-view-vertical',
    requestedViewPlane: 'auto',
    machineWidthMm: 2450,
    defaultHeightMm: 1600,
    defaultDepthMm: 900,
    image: r.toImage(),
    groundTruth: {
      widthMm: 2450,
      depthMm: 1500,
      heightMm: 2600,
      expectCylinder: {
        minDiameterMm: 1280,
        maxDiameterMm: 1720,
        minHeightMm: 40,
        maxHeightMm: 220,
      },
      minParts: 2,
      maxParts: 7,
      primitives: [
        { kind: 'cylinder', w: 1500, h: 78, d: 1500, x: -475, y: 0, z: 0 },
        { kind: 'box', w: 660, h: 78, d: 820, x: 440, y: 0, z: 0 },
        { kind: 'box', w: 240, h: 780, d: 820, x: 815, y: 78, z: 0 },
        { kind: 'box', w: 290, h: 2600, d: 820, x: 1080, y: 0, z: 0 },
      ],
    },
  };
}

/**
 * 2. Sample Pallet Wrapper — Single Top-Down Plan (with grid + page border + fills)
 * Mirrors createSampleSchematicDataUrl() in customAssetMesh.ts
 */
function buildSamplePalletWrapperPlan(): SchematicEvalCase {
  const r = new MiniRaster(450, 360);
  // Background grid
  for (let y = 60; y < 360; y += 60) r.drawLine(0, y, 450, y, GRID, 1);
  for (let x = 75; x < 450; x += 75) r.drawLine(x, 0, x, 360, GRID, 1);
  // Outer page border
  r.strokeRect(10, 10, 430, 340, [30, 41, 59], 2);

  // Mast (x=60..108, y=148..213)
  r.fillRect(60, 148, 48, 65, [203, 213, 225]);
  r.strokeRect(60, 148, 48, 65, INK, 2);
  // Base frame (x=108..170, y=158..203)
  r.fillRect(108, 158, 62, 45, [226, 232, 240]);
  r.strokeRect(108, 158, 62, 45, INK, 2);
  // Turntable circle (cx=255, cy=180, r=95 -> diam=190px; total width = 290px = 2520mm -> Ø1650mm)
  r.fillCircle(255, 180, 95, [219, 234, 254]);
  r.strokeCircle(255, 180, 95, INK, 2);
  r.fillCircle(255, 180, 12, [148, 163, 184]);
  r.strokeCircle(255, 180, 12, INK, 1);
  // Control box
  r.fillRect(68, 228, 38, 28, [254, 215, 170]);
  r.strokeRect(68, 228, 38, 28, INK, 2);
  // Dimension lines
  r.drawHorizontalDim(160, 350, 65, 85, [37, 99, 235]);
  r.drawHorizontalDim(60, 350, 310, 275, [37, 99, 235]);

  return {
    id: 'pallet-wrapper-sample-plan',
    name: 'Sample Pallet Wrapper (Single Top-Down Plan)',
    expectedMode: 'single-top',
    requestedViewPlane: 'auto',
    machineWidthMm: 2520,
    defaultHeightMm: 2200,
    defaultDepthMm: 900,
    image: r.toImage(),
    groundTruth: {
      widthMm: 2520,
      depthMm: 1650,
      heightMm: 2200,
      expectCylinder: {
        minDiameterMm: 1400,
        maxDiameterMm: 1900,
        minHeightMm: 60,
        maxHeightMm: 220,
      },
      minParts: 2,
      maxParts: 6,
      primitives: [
        { kind: 'box', w: 420, h: 2200, d: 565, x: -1050, y: 0, z: 0 },
        { kind: 'box', w: 540, h: 2200, d: 390, x: -570, y: 0, z: 0 },
        { kind: 'cylinder', w: 1650, h: 120, d: 1650, x: 435, y: 0, z: 0 },
      ],
    },
  };
}

/**
 * 3. CNC Machining Center — 2-View Vertical Orthographic Sheet
 * Main enclosure (2100x2100x2200) + side operator console (700x600x1600)
 * Overall: 2800 (W) x 2100 (D) x 2200 (H) mm.
 */
function buildCncMachine2View(): SchematicEvalCase {
  const r = new MiniRaster(440, 560);
  const scale = 0.095; // px per mm -> 2800mm = 266px, 2100mm = 200px, 2200mm = 209px
  const x0 = 80;

  // --- UPPER: FRONT ELEVATION ---
  const floorY = 260;
  const encW = Math.round(2100 * scale); // 200px
  const encH = Math.round(2200 * scale); // 209px
  const conW = Math.round(700 * scale); // 66px
  const conH = Math.round(1500 * scale); // 143px

  // Main CNC enclosure with sliding door detail
  r.strokeRect(x0, floorY - encH, encW, encH, INK, 2);
  r.strokeRect(x0 + 35, floorY - encH + 40, encW - 70, encH - 70, DIM_INK, 1);
  r.drawLine(x0 + encW / 2, floorY - encH + 40, x0 + encW / 2, floorY - 30, DIM_INK, 1);
  // Operator console on right
  r.strokeRect(x0 + encW, floorY - conH, conW, conH, INK, 2);
  r.fillRect(x0 + encW + 14, floorY - conH + 18, 36, 24, [180, 195, 210]);
  r.strokeRect(x0 + encW + 14, floorY - conH + 18, 36, 24, INK, 1);

  // Dimension lines
  r.drawHorizontalDim(x0, x0 + encW + conW, floorY + 20, floorY, DIM_INK);
  r.drawVerticalDim(x0 - 22, x0, floorY - encH, floorY, DIM_INK);

  // --- LOWER: TOP-DOWN PLAN ---
  const planTop = 325;
  const encD = Math.round(2100 * scale); // 200px
  const conD = Math.round(650 * scale); // 62px
  r.strokeRect(x0, planTop, encW, encD, INK, 2);
  r.strokeRect(x0 + encW, planTop + encD - conD, conW, conD, INK, 2);
  r.drawVerticalDim(x0 + encW + conW + 22, x0 + encW + conW, planTop, planTop + encD, DIM_INK);

  return {
    id: 'cnc-machining-center-2view',
    name: 'CNC Machining Center (2-View Front + Plan)',
    expectedMode: 'multi-view-vertical',
    requestedViewPlane: 'auto',
    machineWidthMm: 2800,
    defaultHeightMm: 1600,
    defaultDepthMm: 900,
    image: r.toImage(),
    groundTruth: {
      widthMm: 2800,
      depthMm: 2100,
      heightMm: 2200,
      minParts: 2,
      maxParts: 6,
      primitives: [
        { kind: 'box', w: 2100, h: 2200, d: 2100, x: -350, y: 0, z: 0 },
        { kind: 'box', w: 700, h: 1500, d: 650, x: 1050, y: 0, z: 725 },
      ],
    },
  };
}

/**
 * 4. Belt Conveyor Line — 2-View Vertical Orthographic Sheet
 * Elevated belt bed (y=750, h=150) + 2 support legs + drive unit
 * Overall: 3600 (W) x 900 (D) x 1050 (H) mm.
 */
function buildConveyor2View(): SchematicEvalCase {
  const r = new MiniRaster(460, 400);
  const scale = 0.085; // 3600mm = 306px, 900mm = 77px, 1050mm = 89px
  const x0 = 75;

  // --- UPPER: SIDE ELEVATION ---
  const floorY = 175;
  const totalW = Math.round(3600 * scale); // 306px
  const legW = Math.round(280 * scale); // 24px
  const legH = Math.round(750 * scale); // 64px
  const bedH = Math.round(160 * scale); // 14px
  const driveW = Math.round(400 * scale); // 34px
  const driveH = Math.round(300 * scale); // 26px

  // Belt bed elevated at y=750
  r.strokeRect(x0, floorY - legH - bedH, totalW, bedH, INK, 2);
  // Left & right support legs
  r.strokeRect(x0 + 18, floorY - legH, legW, legH, INK, 2);
  r.strokeRect(x0 + totalW - 18 - legW, floorY - legH, legW, legH, INK, 2);
  // Drive motor housing on right top
  r.strokeRect(x0 + totalW - driveW, floorY - legH - driveH, driveW, driveH, INK, 2);

  r.drawHorizontalDim(x0, x0 + totalW, floorY + 20, floorY, DIM_INK);
  r.drawVerticalDim(x0 + totalW + 22, x0 + totalW, floorY - legH - driveH, floorY, DIM_INK);

  // --- LOWER: TOP-DOWN PLAN ---
  const planTop = 250;
  const bedD = Math.round(900 * scale); // 77px
  r.strokeRect(x0, planTop, totalW, bedD, INK, 2);
  // Roller cross lines
  for (let rx = x0 + 30; rx < x0 + totalW - 20; rx += 35) {
    r.drawLine(rx, planTop + 6, rx, planTop + bedD - 6, DIM_INK, 1);
  }
  r.drawVerticalDim(x0 - 20, x0, planTop, planTop + bedD, DIM_INK);

  return {
    id: 'belt-conveyor-2view',
    name: 'Belt Conveyor Line (2-View Side + Plan)',
    expectedMode: 'multi-view-vertical',
    requestedViewPlane: 'auto',
    machineWidthMm: 3600,
    defaultHeightMm: 1600,
    defaultDepthMm: 900,
    image: r.toImage(),
    groundTruth: {
      widthMm: 3600,
      depthMm: 900,
      heightMm: 1050,
      minParts: 2,
      maxParts: 7,
      primitives: [
        { kind: 'box', w: 3600, h: 160, d: 900, x: 0, y: 750, z: 0 },
        { kind: 'box', w: 280, h: 750, d: 900, x: -1450, y: 0, z: 0 },
        { kind: 'box', w: 280, h: 750, d: 900, x: 1450, y: 0, z: 0 },
        { kind: 'box', w: 400, h: 300, d: 900, x: 1600, y: 750, z: 0 },
      ],
    },
  };
}

/**
 * 5. Industrial Coffee Roaster — 2-View Vertical Orthographic Sheet
 * Cylindrical cooling tray (Ø1100, h=750) + roaster body (1100x1000x1400) + tall exhaust stack (h=2400)
 * Overall: 2200 (W) x 1100 (D) x 2400 (H) mm.
 */
function buildCoffeeRoaster2View(): SchematicEvalCase {
  const r = new MiniRaster(420, 520);
  const scale = 0.11; // 2200mm = 242px, 1100mm = 121px, 2400mm = 264px
  const x0 = 85;

  // --- UPPER: SIDE ELEVATION ---
  const floorY = 300;
  const trayW = Math.round(1100 * scale); // 121px
  const trayH = Math.round(750 * scale); // 83px
  const bodyW = Math.round(700 * scale); // 77px
  const bodyH = Math.round(1450 * scale); // 160px
  const stackW = Math.round(400 * scale); // 44px
  const stackH = Math.round(2400 * scale); // 264px

  r.strokeRect(x0, floorY - trayH, trayW, trayH, INK, 2);
  r.strokeRect(x0 + trayW, floorY - bodyH, bodyW, bodyH, INK, 2);
  r.strokeRect(x0 + trayW + bodyW, floorY - stackH, stackW, stackH, INK, 2);

  r.drawHorizontalDim(x0, x0 + trayW + bodyW + stackW, floorY + 20, floorY, DIM_INK);
  r.drawVerticalDim(x0 + trayW + bodyW + stackW + 20, x0 + trayW + bodyW + stackW, floorY - stackH, floorY, DIM_INK);

  // --- LOWER: TOP-DOWN PLAN ---
  const planCy = 425;
  const trayR = Math.round(trayW / 2); // 60px
  const bodyD = Math.round(950 * scale); // 105px
  const stackD = Math.round(420 * scale); // 46px

  r.strokeRect(x0 + trayW, planCy - bodyD / 2, bodyW, bodyD, INK, 2);
  r.strokeRect(x0 + trayW + bodyW, planCy - stackD / 2, stackW, stackD, INK, 2);
  r.fillCircle(x0 + trayR, planCy, trayR - 1, [255, 255, 255]);
  r.strokeCircle(x0 + trayR, planCy, trayR, INK, 2);

  return {
    id: 'coffee-roaster-2view',
    name: 'Industrial Coffee Roaster (2-View Side + Plan)',
    expectedMode: 'multi-view-vertical',
    requestedViewPlane: 'auto',
    machineWidthMm: 2200,
    defaultHeightMm: 1600,
    defaultDepthMm: 900,
    image: r.toImage(),
    groundTruth: {
      widthMm: 2200,
      depthMm: 1100,
      heightMm: 2400,
      expectCylinder: {
        minDiameterMm: 920,
        maxDiameterMm: 1280,
        minHeightMm: 520,
        maxHeightMm: 980,
      },
      minParts: 2,
      maxParts: 6,
      primitives: [
        { kind: 'cylinder', w: 1100, h: 750, d: 1100, x: -550, y: 0, z: 0 },
        { kind: 'box', w: 700, h: 1450, d: 950, x: 350, y: 0, z: 0 },
        { kind: 'box', w: 400, h: 2400, d: 420, x: 900, y: 0, z: 0 },
      ],
    },
  };
}

/**
 * 6. Vertical Packaging Machine (VFFS) — 2-View HORIZONTAL Sheet (Front Left + Side Right)
 * Overall: 1400 (W) x 1600 (D) x 2500 (H) mm.
 */
function buildVerticalPackagingSideBySide(): SchematicEvalCase {
  const r = new MiniRaster(520, 360);
  // Scale: 0.1 px/mm -> 1400mm = 140px, 1600mm = 160px, 2500mm = 250px
  const floorY = 300;

  // --- LEFT: FRONT ELEVATION (width = 1400mm = 140px) ---
  const fx0 = 55;
  const fw = 140;
  const baseH = 140; // 1400mm
  const topW = 90; // 900mm
  const topH = 110; // 1100mm
  r.strokeRect(fx0, floorY - baseH, fw, baseH, INK, 2);
  r.strokeRect(fx0 + (fw - topW) / 2, floorY - baseH - topH, topW, topH, INK, 2);
  r.drawHorizontalDim(fx0, fx0 + fw, floorY + 20, floorY, DIM_INK);

  // --- RIGHT: SIDE ELEVATION (depth = 1600mm = 160px) ---
  const sx0 = 285;
  const sd = 160;
  const topD = 100; // 1000mm
  r.strokeRect(sx0, floorY - baseH, sd, baseH, INK, 2);
  r.strokeRect(sx0 + (sd - topD) / 2, floorY - baseH - topH, topD, topH, INK, 2);
  r.drawHorizontalDim(sx0, sx0 + sd, floorY + 20, floorY, DIM_INK);
  r.drawVerticalDim(sx0 + sd + 20, sx0 + sd, floorY - baseH - topH, floorY, DIM_INK);

  return {
    id: 'vertical-packaging-side-by-side',
    name: 'Vertical Packaging Machine (2-View Front + Side)',
    expectedMode: 'multi-view-horizontal',
    requestedViewPlane: 'auto',
    machineWidthMm: 1400,
    defaultHeightMm: 1600,
    defaultDepthMm: 900,
    image: r.toImage(),
    groundTruth: {
      widthMm: 1400,
      depthMm: 1600,
      heightMm: 2500,
      minParts: 2,
      maxParts: 6,
      primitives: [
        { kind: 'box', w: 1400, h: 1400, d: 1600, x: 0, y: 0, z: 0 },
        { kind: 'box', w: 900, h: 1100, d: 1000, x: 0, y: 1400, z: 0 },
      ],
    },
  };
}

/**
 * 7. Exhibition Kiosk / Display — Single Front Elevation
 * Counter (1500x800x1000) + side tower (900x800x2400)
 * Overall: 2400 (W) x 800 (D) x 2400 (H) mm.
 */
function buildExhibitionKioskElevation(): SchematicEvalCase {
  const r = new MiniRaster(420, 360);
  // Scale: 0.1 px/mm -> 2400mm = 240px
  const x0 = 90;
  const floorY = 300;
  const counterW = 150;
  const counterH = 100;
  const towerW = 90;
  const towerH = 240;

  r.fillRect(x0, floorY - counterH, counterW, counterH, [241, 245, 249]);
  r.strokeRect(x0, floorY - counterH, counterW, counterH, INK, 2);
  r.fillRect(x0 + counterW, floorY - towerH, towerW, towerH, [226, 232, 240]);
  r.strokeRect(x0 + counterW, floorY - towerH, towerW, towerH, INK, 2);

  r.drawHorizontalDim(x0, x0 + counterW + towerW, floorY + 22, floorY, DIM_INK);
  r.drawVerticalDim(x0 + counterW + towerW + 22, x0 + counterW + towerW, floorY - towerH, floorY, DIM_INK);

  return {
    id: 'exhibition-kiosk-elevation',
    name: 'Exhibition Kiosk (Single Front Elevation)',
    expectedMode: 'single-front',
    requestedViewPlane: 'front',
    machineWidthMm: 2400,
    defaultHeightMm: 1600,
    defaultDepthMm: 800,
    image: r.toImage(),
    groundTruth: {
      widthMm: 2400,
      depthMm: 800,
      heightMm: 2400,
      minParts: 2,
      maxParts: 5,
      primitives: [
        { kind: 'box', w: 1500, h: 1000, d: 800, x: -450, y: 0, z: 0 },
        { kind: 'box', w: 900, h: 2400, d: 800, x: 750, y: 0, z: 0 },
      ],
    },
  };
}

/**
 * 8. Robot Workcell — Single Top-Down Plan
 * Cylindrical robot pedestal (Ø800) + conveyor table (1600x700) + control cabinet (700x600)
 * Overall: 3000 (W) x 2200 (D) mm.
 */
function buildRobotWorkcellPlan(): SchematicEvalCase {
  const r = new MiniRaster(440, 360);
  // Scale: 0.1 px/mm -> 3000mm = 300px, 2200mm = 220px
  const x0 = 70;
  const y0 = 70;

  // Conveyor table across top
  r.fillRect(x0, y0, 180, 70, [226, 232, 240]);
  r.strokeRect(x0, y0, 180, 70, INK, 2);
  // Control cabinet on right
  r.fillRect(x0 + 230, y0 + 20, 70, 80, [203, 213, 225]);
  r.strokeRect(x0 + 230, y0 + 20, 70, 80, INK, 2);
  // Robot pedestal circle bottom-center
  r.fillCircle(x0 + 130, y0 + 180, 40, [219, 234, 254]);
  r.strokeCircle(x0 + 130, y0 + 180, 40, INK, 2);

  r.drawHorizontalDim(x0, x0 + 300, y0 + 245, y0 + 220, DIM_INK);

  return {
    id: 'robot-workcell-plan',
    name: 'Robot Workcell (Single Top-Down Plan)',
    expectedMode: 'single-top',
    requestedViewPlane: 'top',
    machineWidthMm: 3000,
    defaultHeightMm: 1400,
    defaultDepthMm: 900,
    image: r.toImage(),
    groundTruth: {
      widthMm: 3000,
      depthMm: 2200,
      heightMm: 1400,
      expectCylinder: {
        minDiameterMm: 650,
        maxDiameterMm: 950,
        minHeightMm: 500,
        maxHeightMm: 1500,
      },
      minParts: 3,
      maxParts: 6,
      primitives: [
        { kind: 'box', w: 1800, h: 1400, d: 700, x: -600, y: 0, z: -750 },
        { kind: 'box', w: 700, h: 1400, d: 800, x: 1150, y: 0, z: -500 },
        { kind: 'cylinder', w: 800, h: 900, d: 800, x: -200, y: 0, z: 700 },
      ],
    },
  };
}

/**
 * 9. Low-Res Anti-Aliased Scan of Pallet Wrapper (simulates real-world compressed JPEG/PDF screenshot)
 * 210x280 px, 1px gray anti-aliased strokes, subtle off-white paper tint.
 */
function buildLowResAntiAliasedWrapper(): SchematicEvalCase {
  const r = new MiniRaster(220, 300, [250, 251, 252]);
  const scale = 0.055; // 2450mm = 135px, 2600mm = 143px, 1500mm = 83px
  const x0 = 36;
  const aaInk: [number, number, number] = [82, 86, 92]; // Lighter anti-aliased JPEG ink
  const aaDim: [number, number, number] = [125, 130, 138];

  // --- UPPER: SIDE ELEVATION ---
  const floorY = 165;
  const totalW = Math.round(2450 * scale); // 135px
  const ttH = Math.max(5, Math.round(78 * scale)); // 5px
  const mastW = Math.round(290 * scale); // 16px
  const mastH = Math.round(2600 * scale); // 143px
  const mastX = x0 + totalW - mastW;

  r.strokeRect(x0, floorY - ttH, totalW, ttH, aaInk, 1);
  r.strokeRect(mastX, floorY - mastH, mastW, mastH, aaInk, 1);
  r.drawLine(mastX, floorY - 50, mastX + mastW, floorY - 50, aaInk, 1);
  r.drawHorizontalDim(x0, x0 + totalW, floorY + 12, floorY, aaDim);
  r.drawVerticalDim(x0 + totalW + 14, x0 + totalW, floorY - mastH, floorY, aaDim);

  // --- LOWER: TOP-DOWN PLAN ---
  const planCy = 240;
  const ttR = Math.round((1500 * scale) / 2); // 41px
  const ttCx = x0 + ttR;
  const baseD = Math.round(820 * scale); // 45px

  r.strokeRect(ttCx + 18, planCy - baseD / 2, x0 + totalW - (ttCx + 18), baseD, aaInk, 1);
  r.strokeRect(mastX, planCy - baseD / 2, mastW, baseD, aaInk, 1);
  r.fillCircle(ttCx, planCy, ttR - 1, [250, 251, 252]);
  r.strokeCircle(ttCx, planCy, ttR, aaInk, 1);

  return {
    id: 'pallet-wrapper-lowres-aa',
    name: 'Pallet Wrapper (Low-Res Anti-Aliased JPEG Scan)',
    expectedMode: 'multi-view-vertical',
    requestedViewPlane: 'auto',
    machineWidthMm: 2450,
    defaultHeightMm: 1600,
    defaultDepthMm: 900,
    image: r.toImage(),
    groundTruth: {
      widthMm: 2450,
      depthMm: 1500,
      heightMm: 2600,
      expectCylinder: {
        minDiameterMm: 1250,
        maxDiameterMm: 1750,
        minHeightMm: 40,
        maxHeightMm: 260,
      },
      minParts: 2,
      maxParts: 6,
      primitives: [
        { kind: 'cylinder', w: 1500, h: 90, d: 1500, x: -475, y: 0, z: 0 },
        { kind: 'box', w: 660, h: 90, d: 820, x: 440, y: 0, z: 0 },
        { kind: 'box', w: 290, h: 2600, d: 820, x: 1080, y: 0, z: 0 },
      ],
    },
  };
}

/**
 * 10. Inverted 2-View Sheet: Top-Down Plan on TOP, Side Elevation on BOTTOM
 * Tests that automatic view classification correctly identifies Plan vs Elevation regardless of order.
 */
function buildInverted2ViewMachine(): SchematicEvalCase {
  const r = new MiniRaster(420, 520);
  // Scale: 0.1 px/mm -> 2400mm = 240px, 1400mm = 140px, 2200mm = 220px
  const x0 = 80;

  // --- TOP PANEL: TOP-DOWN PLAN (circle + rectangular housing) ---
  const planCy = 115;
  const drumR = 70; // Ø1400mm
  const boxW = 100; // 1000mm
  const boxD = 90; // 900mm
  r.strokeRect(x0 + drumR * 2, planCy - boxD / 2, boxW, boxD, INK, 2);
  r.fillCircle(x0 + drumR, planCy, drumR - 1, [255, 255, 255]);
  r.strokeCircle(x0 + drumR, planCy, drumR, INK, 2);

  // --- BOTTOM PANEL: SIDE ELEVATION (low drum h=600, tall tower h=2200) ---
  const floorY = 465;
  r.strokeRect(x0, floorY - 60, drumR * 2, 60, INK, 2);
  r.strokeRect(x0 + drumR * 2, floorY - 220, boxW, 220, INK, 2);
  r.drawHorizontalDim(x0, x0 + drumR * 2 + boxW, floorY + 20, floorY, DIM_INK);
  r.drawVerticalDim(x0 + drumR * 2 + boxW + 20, x0 + drumR * 2 + boxW, floorY - 220, floorY, DIM_INK);

  return {
    id: 'inverted-2view-plan-on-top',
    name: 'Inverted 2-View Sheet (Plan Top + Elevation Bottom)',
    expectedMode: 'multi-view-vertical',
    requestedViewPlane: 'auto',
    machineWidthMm: 2400,
    defaultHeightMm: 1600,
    defaultDepthMm: 900,
    image: r.toImage(),
    groundTruth: {
      widthMm: 2400,
      depthMm: 1400,
      heightMm: 2200,
      expectCylinder: {
        minDiameterMm: 1200,
        maxDiameterMm: 1600,
        minHeightMm: 420,
        maxHeightMm: 780,
      },
      minParts: 2,
      maxParts: 5,
      primitives: [
        { kind: 'cylinder', w: 1400, h: 600, d: 1400, x: -500, y: 0, z: 0 },
        { kind: 'box', w: 1000, h: 2200, d: 900, x: 700, y: 0, z: 0 },
      ],
    },
  };
}

export function getAllSchematicEvalCases(): SchematicEvalCase[] {
  return [
    buildPalletWrapper2View(),
    buildSamplePalletWrapperPlan(),
    buildCncMachine2View(),
    buildConveyor2View(),
    buildCoffeeRoaster2View(),
    buildVerticalPackagingSideBySide(),
    buildExhibitionKioskElevation(),
    buildRobotWorkcellPlan(),
    buildLowResAntiAliasedWrapper(),
    buildInverted2ViewMachine(),
  ];
}

/**
 * Computes 3D volumetric Intersection-over-Union (IoU) between predicted and ground-truth
 * primitives on a 32x32x32 voxel grid aligned to each set's centered bounding box.
 */
export function compute3DVoxelIoU(
  predicted: AssetPrimitive[],
  groundTruth: Array<Pick<AssetPrimitive, 'kind' | 'w' | 'h' | 'd' | 'x' | 'y' | 'z'>>
): { iou: number; precision: number; recall: number } {
  if (predicted.length === 0 || groundTruth.length === 0) {
    return { iou: 0, precision: 0, recall: 0 };
  }

  const predBounds = computePrimitivesBounds(predicted);
  const gtAsPrims = groundTruth.map((g, i) => ({
    ...g,
    id: `gt-${i}`,
    label: `gt-${i}`,
    color: '#000000',
    finish: 'matte' as const,
  }));
  const gtBounds = computePrimitivesBounds(gtAsPrims);

  // Center both sets on X and Z, floor-aligned on Y=0
  const predCx = (predBounds.minX + predBounds.maxX) / 2;
  const predCz = (predBounds.minZ + predBounds.maxZ) / 2;
  const gtCx = (gtBounds.minX + gtBounds.maxX) / 2;
  const gtCz = (gtBounds.minZ + gtBounds.maxZ) / 2;

  const spanX = Math.max(predBounds.widthMm, gtBounds.widthMm, 200);
  const spanY = Math.max(predBounds.heightMm, gtBounds.heightMm, 200);
  const spanZ = Math.max(predBounds.depthMm, gtBounds.depthMm, 200);

  const N = 28;
  const pointInPrimitives = (
    px: number,
    py: number,
    pz: number,
    list: Array<Pick<AssetPrimitive, 'kind' | 'w' | 'h' | 'd' | 'x' | 'y' | 'z'>>,
    cxOff: number,
    czOff: number
  ): boolean => {
    for (const p of list) {
      const rx = p.x - cxOff;
      const rz = p.z - czOff;
      if (py < p.y || py > p.y + p.h) continue;
      if (p.kind === 'cylinder' || p.kind === 'cone' || p.kind === 'ring') {
        const rad = p.w / 2;
        const dx = px - rx;
        const dz = pz - rz;
        if (dx * dx + dz * dz <= rad * rad) return true;
      } else {
        if (Math.abs(px - rx) <= p.w / 2 && Math.abs(pz - rz) <= p.d / 2) {
          return true;
        }
      }
    }
    return false;
  };

  let inter = 0;
  let predCount = 0;
  let gtCount = 0;

  for (let ix = 0; ix < N; ix++) {
    const px = -spanX / 2 + ((ix + 0.5) / N) * spanX;
    for (let iy = 0; iy < N; iy++) {
      const py = ((iy + 0.5) / N) * spanY;
      for (let iz = 0; iz < N; iz++) {
        const pz = -spanZ / 2 + ((iz + 0.5) / N) * spanZ;
        const inP = pointInPrimitives(px, py, pz, predicted, predCx, predCz);
        const inG = pointInPrimitives(px, py, pz, groundTruth, gtCx, gtCz);
        if (inP) predCount++;
        if (inG) gtCount++;
        if (inP && inG) inter++;
      }
    }
  }

  const union = predCount + gtCount - inter;
  return {
    iou: union > 0 ? inter / union : 0,
    precision: predCount > 0 ? inter / predCount : 0,
    recall: gtCount > 0 ? inter / gtCount : 0,
  };
}
