import type { FloorMaterial, StandConfig, StandItem, ViewMode } from '../types/stand';

export const TOUR_DURATION_SEC = 76; // 1:16 calm, friendly, mouse-guided walkthrough
export const WALKTHROUGH_DISMISSED_KEY = 'zuki_walkthrough_dismissed_v1';

export interface WalkthroughChapter {
  id: string;
  number: string;
  title: string;
  shortDesc: string;
  startSec: number;
  endSec: number;
  caption: string;
}

export const WALKTHROUGH_CHAPTERS: WalkthroughChapter[] = [
  {
    id: 'space-setup',
    number: '01',
    title: 'Set your booth size & floor',
    shortDesc: 'Open Space, pick 6×4m & Warm Oak',
    startSec: 0,
    endSec: 11.0,
    caption:
      'Start in the Space tab — pick your floor footprint (like 6×4m) and choose a finish such as Warm Oak.',
  },
  {
    id: 'add-structures',
    number: '02',
    title: 'Add walls & reception desk',
    shortDesc: 'Click LED Wall, Lightbox & Desk',
    startSec: 11.0,
    endSec: 24.0,
    caption:
      'Open Equipment and click any structure to place it — here we add an LED Video Wall, a backlit Lightbox, and a Reception Desk.',
  },
  {
    id: 'add-hospitality',
    number: '03',
    title: 'Build lounge & demo zones',
    shortDesc: 'Add sofa, table & kiosk with live quote',
    startSec: 24.0,
    endSec: 36.0,
    caption:
      'Add visitor zones the same way — a Lounge Sofa, Coffee Table, and Demo Kiosk. Watch your live estimate update in the top bar.',
  },
  {
    id: 'drag-rotate',
    number: '04',
    title: 'Move, snap & rotate with R',
    shortDesc: 'Drag on the 0.1m grid & tap R to turn',
    startSec: 36.0,
    endSec: 49.0,
    caption:
      'Click any item on the floor to open its Inspector. Drag along the 0.1m snap guides, or press R to rotate it cleanly toward the aisle.',
  },
  {
    id: 'apply-branding',
    number: '05',
    title: 'Apply brand colours & graphics',
    shortDesc: 'Pick a palette & paint backlit surfaces',
    startSec: 49.0,
    endSec: 60.0,
    caption:
      'Switch to the Brand tab to select your colours and apply your logo and graphics across every backlit wall and counter in one click.',
  },
  {
    id: 'check-views',
    number: '06',
    title: 'Check 2D plan & visitor view',
    shortDesc: 'Verify clearances, then walk eye-level',
    startSec: 60.0,
    endSec: 69.0,
    caption:
      'Use the top bar to switch to Plan view for aisle clearance checks, then Visitor view to inspect your stand at real 1:1 eye level.',
  },
  {
    id: 'export-brief',
    number: '07',
    title: 'Export your production brief',
    shortDesc: 'Download PNG render, specs & BOM',
    startSec: 69.0,
    endSec: 76.0,
    caption:
      'Ready to share with your team or fabricator? Click Export brief to download your studio PNG, print artwork specs, and itemised quote.',
  },
];

export interface WalkthroughItemSpec {
  id: string;
  catalogId: string;
  label: string;
  priceHire: number;
  appearAt: number;
  paintAt: number | null;
  item: StandItem;
}

function makeArt(bgColor: string, emissive = false) {
  return {
    assetId: null,
    fit: 'cover' as const,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    bgColor,
    emissive,
  };
}

export const WALKTHROUGH_ITEMS: WalkthroughItemSpec[] = [
  {
    id: 'wt-led-wall',
    catalogId: 'led-video-wall',
    label: 'LED Video Wall',
    priceHire: 1450,
    appearAt: 14.4,
    paintAt: 54.0,
    item: {
      id: 'wt-led-wall',
      catalogId: 'led-video-wall',
      name: 'Seamless LED Video Wall',
      x: 0.25,
      y: 0,
      z: -1.42,
      rotationY: 0,
      dims: { w: 3.0, h: 2.15, d: 0.45 },
      backlit: true,
      artwork: { screen: makeArt('#0F172A', true) },
    },
  },
  {
    id: 'wt-seg-lightbox',
    catalogId: 'seg-lightbox',
    label: 'SEG Backlit Lightbox',
    priceHire: 520,
    appearAt: 18.0,
    paintAt: 54.9,
    item: {
      id: 'wt-seg-lightbox',
      catalogId: 'seg-lightbox',
      name: 'SEG Backlit Lightbox Wall',
      x: -2.48,
      y: 0,
      z: -0.35,
      rotationY: 90,
      dims: { w: 2.3, h: 2.35, d: 0.16 },
      backlit: true,
      artwork: { front: makeArt('#E2E8F0', true) },
    },
  },
  {
    id: 'wt-reception-desk',
    catalogId: 'reception-desk',
    label: 'Reception Desk',
    priceHire: 290,
    appearAt: 21.6,
    paintAt: 55.8,
    item: {
      id: 'wt-reception-desk',
      catalogId: 'reception-desk',
      name: 'Branded Reception Counter',
      x: -0.55,
      y: 0,
      z: 0.7,
      rotationY: 0,
      dims: { w: 1.75, h: 1.04, d: 0.62 },
      artwork: { front: makeArt('#E2E8F0', false) },
    },
  },
  {
    id: 'wt-lounge-sofa',
    catalogId: 'lounge-sofa',
    label: 'Lounge Sofa',
    priceHire: 220,
    appearAt: 27.0,
    paintAt: null,
    item: {
      id: 'wt-lounge-sofa',
      catalogId: 'lounge-sofa',
      name: '2-Seater Lounge Sofa',
      x: 1.92,
      y: 0,
      z: -0.15,
      rotationY: -90,
      dims: { w: 1.58, h: 0.78, d: 0.82 },
      artwork: {},
    },
  },
  {
    id: 'wt-coffee-table',
    catalogId: 'coffee-table',
    label: 'Coffee Table',
    priceHire: 65,
    appearAt: 30.4,
    paintAt: null,
    item: {
      id: 'wt-coffee-table',
      catalogId: 'coffee-table',
      name: 'Minimalist Coffee Table',
      x: 0.9,
      y: 0,
      z: -0.15,
      rotationY: 90,
      dims: { w: 0.95, h: 0.42, d: 0.55 },
      artwork: {},
    },
  },
  {
    id: 'wt-demo-kiosk',
    catalogId: 'demo-kiosk',
    label: 'Demo Kiosk',
    priceHire: 185,
    appearAt: 33.6,
    paintAt: 56.6,
    item: {
      id: 'wt-demo-kiosk',
      catalogId: 'demo-kiosk',
      name: 'Interactive Demo Kiosk',
      x: 1.85,
      y: 0,
      z: 1.22,
      rotationY: -90,
      dims: { w: 0.72, h: 1.12, d: 0.54 },
      artwork: { front: makeArt('#E2E8F0', false) },
    },
  },
];

export function buildPaintedWalkthroughItem(item: StandItem, primaryHex: string): StandItem {
  const clone: StandItem = {
    ...item,
    artwork: { ...item.artwork },
  };
  if (item.catalogId === 'led-video-wall') {
    clone.artwork.screen = {
      assetId: 'preset-product-screen',
      fit: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      bgColor: '#0F172A',
      emissive: true,
    };
  } else if (item.catalogId === 'seg-lightbox') {
    clone.artwork.front = {
      assetId: 'preset-hero-mural',
      fit: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      bgColor: primaryHex,
      emissive: true,
    };
  } else if (item.catalogId === 'reception-desk' || item.catalogId === 'demo-kiosk') {
    clone.artwork.front = {
      assetId: 'preset-company-logo',
      fit: 'contain',
      scale: 0.84,
      offsetX: 0,
      offsetY: 0,
      bgColor: primaryHex,
      emissive: false,
    };
  }
  return clone;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(x: number): number {
  const t = clamp(x, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(x: number): number {
  const t = clamp(x, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutBack(x: number): number {
  const t = clamp(x, 0, 1);
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * Mouse choreography keyframes in percentage coordinates of the miniature Zuki Workspace window.
 * Each waypoint can bind to a live DOM/3D `target` anchor so the cursor tip always lands
 * dead-center on the exact control regardless of viewport size, falling back to (x, y).
 */
interface CursorWaypoint {
  t: number;
  x: number;
  y: number;
  target?: string;
  arc?: number; // subtle perpendicular curve offset in % for organic hand motion
}

export type AnchorMap = Record<string, { x: number; y: number }>;

const CURSOR_WAYPOINTS: CursorWaypoint[] = [
  // Ch 01: Space setup
  { t: 0.0, x: 58, y: 54 },
  { t: 1.0, x: 58, y: 54 },
  { t: 2.0, x: 20.5, y: 15.2, target: 'tab-space', arc: -4 },
  { t: 2.6, x: 20.5, y: 15.2, target: 'tab-space' },
  { t: 3.9, x: 13.5, y: 35.5, target: 'size-6x4', arc: 2.5 },
  { t: 4.9, x: 13.5, y: 35.5, target: 'size-6x4' },
  { t: 7.2, x: 13.5, y: 59.0, target: 'floor-oak', arc: 2 },
  { t: 8.4, x: 13.5, y: 59.0, target: 'floor-oak' },
  { t: 9.8, x: 50, y: 52, arc: -3 },
  { t: 11.0, x: 50, y: 52 },

  // Ch 02: Equipment -> LED Wall, Lightbox, Reception Desk
  { t: 12.0, x: 12.0, y: 15.2, target: 'tab-catalog', arc: -4 },
  { t: 12.6, x: 12.0, y: 15.2, target: 'tab-catalog' },
  { t: 13.8, x: 18.0, y: 26.5, target: 'item-led-video-wall', arc: 2 },
  { t: 14.9, x: 18.0, y: 26.5, target: 'item-led-video-wall' },
  { t: 17.3, x: 18.0, y: 38.0, target: 'item-seg-lightbox', arc: 1.5 },
  { t: 18.5, x: 18.0, y: 38.0, target: 'item-seg-lightbox' },
  { t: 20.9, x: 18.0, y: 49.5, target: 'item-reception-desk', arc: 1.5 },
  { t: 22.1, x: 18.0, y: 49.5, target: 'item-reception-desk' },
  { t: 23.6, x: 40.0, y: 54.0, arc: 2 },

  // Ch 03: Lounge Sofa, Coffee Table, Demo Kiosk
  { t: 26.2, x: 18.0, y: 61.0, target: 'item-lounge-sofa', arc: -2 },
  { t: 27.5, x: 18.0, y: 61.0, target: 'item-lounge-sofa' },
  { t: 29.7, x: 18.0, y: 72.5, target: 'item-coffee-table', arc: 1.5 },
  { t: 30.9, x: 18.0, y: 72.5, target: 'item-coffee-table' },
  { t: 32.9, x: 18.0, y: 84.0, target: 'item-demo-kiosk', arc: 1.5 },
  { t: 34.1, x: 18.0, y: 84.0, target: 'item-demo-kiosk' },
  { t: 35.6, x: 54.0, y: 58.0, arc: 3 },

  // Ch 04: Drag Reception Desk + Rotate Demo Kiosk (bound to live 3D-projected anchors!)
  { t: 37.8, x: 52.0, y: 61.5, target: 'canvas-desk', arc: 1.5 },
  { t: 43.4, x: 51.0, y: 67.5, target: 'canvas-desk' },
  { t: 44.8, x: 66.0, y: 65.0, target: 'canvas-kiosk', arc: -2.5 },
  { t: 48.2, x: 66.0, y: 65.0, target: 'canvas-kiosk' },

  // Ch 05: Brand tab -> Navy & Coral -> Apply Brand Artwork
  { t: 50.2, x: 3.1, y: 27.5, target: 'rail-brand', arc: -5 },
  { t: 50.8, x: 3.1, y: 27.5, target: 'rail-brand' },
  { t: 51.9, x: 18.0, y: 34.5, target: 'palette-navy', arc: 2 },
  { t: 52.5, x: 18.0, y: 34.5, target: 'palette-navy' },
  { t: 53.5, x: 18.0, y: 53.5, target: 'btn-apply-brand', arc: 1.5 },
  { t: 54.4, x: 18.0, y: 53.5, target: 'btn-apply-brand' },
  { t: 56.5, x: 56.0, y: 54.0, arc: -4 },
  { t: 59.5, x: 56.0, y: 54.0 },

  // Ch 06: Top Bar -> Plan -> Visitor
  { t: 60.8, x: 50.0, y: 5.4, target: 'view-2d', arc: -3 },
  { t: 61.6, x: 50.0, y: 5.4, target: 'view-2d' },
  { t: 64.5, x: 57.0, y: 5.4, target: 'view-visitor', arc: -1 },
  { t: 65.4, x: 57.0, y: 5.4, target: 'view-visitor' },
  { t: 68.5, x: 57.0, y: 18.0, arc: 1 },

  // Ch 07: Back to 3D -> Export brief
  { t: 69.6, x: 43.8, y: 5.4, target: 'view-3d', arc: -2 },
  { t: 70.3, x: 43.8, y: 5.4, target: 'view-3d' },
  { t: 71.7, x: 90.8, y: 5.4, target: 'btn-export', arc: -3 },
  { t: 72.6, x: 90.8, y: 5.4, target: 'btn-export' },
  { t: 74.0, x: 64.0, y: 58.0, arc: 3 },
  { t: 76.0, x: 64.0, y: 58.0 },
];

export interface ClickEvent {
  id: string;
  at: number;
  duration: number;
  target: string;
  sound: 'click' | 'drop' | 'chime';
}

export const CLICK_EVENTS: ClickEvent[] = [
  { id: 'clk-space', at: 2.25, duration: 0.25, target: 'tab-space', sound: 'click' },
  { id: 'clk-6x4', at: 4.35, duration: 0.25, target: 'size-6x4', sound: 'drop' },
  { id: 'clk-oak', at: 7.75, duration: 0.25, target: 'floor-oak', sound: 'click' },
  { id: 'clk-equip', at: 12.25, duration: 0.25, target: 'tab-catalog', sound: 'click' },
  { id: 'clk-led', at: 14.25, duration: 0.25, target: 'item-led-video-wall', sound: 'drop' },
  { id: 'clk-seg', at: 17.85, duration: 0.25, target: 'item-seg-lightbox', sound: 'drop' },
  { id: 'clk-desk', at: 21.45, duration: 0.25, target: 'item-reception-desk', sound: 'drop' },
  { id: 'clk-sofa', at: 26.85, duration: 0.25, target: 'item-lounge-sofa', sound: 'drop' },
  { id: 'clk-table', at: 30.25, duration: 0.25, target: 'item-coffee-table', sound: 'drop' },
  { id: 'clk-kiosk', at: 33.45, duration: 0.25, target: 'item-demo-kiosk', sound: 'drop' },
  { id: 'clk-sel-desk', at: 38.25, duration: 0.25, target: 'canvas-desk', sound: 'click' },
  { id: 'clk-sel-kiosk', at: 45.2, duration: 0.25, target: 'canvas-kiosk', sound: 'click' },
  { id: 'clk-r-key', at: 46.25, duration: 0.35, target: 'key-r', sound: 'click' },
  { id: 'clk-brand-rail', at: 50.45, duration: 0.25, target: 'rail-brand', sound: 'click' },
  { id: 'clk-palette', at: 52.15, duration: 0.25, target: 'palette-navy', sound: 'click' },
  { id: 'clk-apply-brand', at: 53.85, duration: 0.28, target: 'btn-apply-brand', sound: 'chime' },
  { id: 'clk-plan', at: 61.15, duration: 0.25, target: 'view-2d', sound: 'click' },
  { id: 'clk-visitor', at: 64.9, duration: 0.25, target: 'view-visitor', sound: 'click' },
  { id: 'clk-3d', at: 69.9, duration: 0.25, target: 'view-3d', sound: 'click' },
  { id: 'clk-export', at: 72.1, duration: 0.28, target: 'btn-export', sound: 'chime' },
];

export interface CursorState {
  x: number;
  y: number;
  clicking: boolean;
  dragging: boolean;
  hoveredTarget: string | null;
  pressedTarget: string | null;
  rippleProgress: number | null; // 0..1 when a click ripple is expanding
}

function resolveWaypointPos(wp: CursorWaypoint, anchors?: AnchorMap): { x: number; y: number } {
  if (wp.target && anchors && anchors[wp.target]) {
    return anchors[wp.target];
  }
  return { x: wp.x, y: wp.y };
}

export function evaluateCursor(t: number, anchors?: AnchorMap): CursorState {
  const first = resolveWaypointPos(CURSOR_WAYPOINTS[0], anchors);
  let x = first.x;
  let y = first.y;

  for (let i = 0; i < CURSOR_WAYPOINTS.length - 1; i++) {
    const a = CURSOR_WAYPOINTS[i];
    const b = CURSOR_WAYPOINTS[i + 1];
    if (t >= a.t && t <= b.t) {
      const pa = resolveWaypointPos(a, anchors);
      const pb = resolveWaypointPos(b, anchors);
      const span = Math.max(0.0001, b.t - a.t);
      const u = easeInOutCubic((t - a.t) / span);
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.hypot(dx, dy);
      const arc = b.arc ?? 0;
      if (dist > 0.5 && Math.abs(arc) > 0.01) {
        const nx = -dy / dist;
        const ny = dx / dist;
        const mx = (pa.x + pb.x) * 0.5 + nx * arc;
        const my = (pa.y + pb.y) * 0.5 + ny * arc;
        const inv = 1 - u;
        x = inv * inv * pa.x + 2 * inv * u * mx + u * u * pb.x;
        y = inv * inv * pa.y + 2 * inv * u * my + u * u * pb.y;
      } else {
        x = lerp(pa.x, pb.x, u);
        y = lerp(pa.y, pb.y, u);
      }
      break;
    }
    if (t > b.t) {
      const pb = resolveWaypointPos(b, anchors);
      x = pb.x;
      y = pb.y;
    }
  }

  const dragging = t >= 39.8 && t <= 42.85;
  let clicking = dragging;
  let pressedTarget: string | null = null;
  let hoveredTarget: string | null = null;
  let rippleProgress: number | null = null;

  for (const ev of CLICK_EVENTS) {
    if (ev.target === 'key-r') continue;
    // Generous, unmistakable pulse highlight window before & after click
    if (t >= ev.at - 0.7 && t <= ev.at + ev.duration + 0.55) {
      hoveredTarget = ev.target;
    }
    if (t >= ev.at && t <= ev.at + ev.duration) {
      clicking = true;
      pressedTarget = ev.target;
    }
    if (t >= ev.at && t <= ev.at + 0.55) {
      rippleProgress = (t - ev.at) / 0.55;
    }
  }

  return { x, y, clicking, dragging, hoveredTarget, pressedTarget, rippleProgress };
}

/**
 * Screen Studio-style smooth auto-zoom windows:
 * Zooms gently into the UI panel or control during clicks so labels are crisp and legible,
 * then smoothly zooms back out to 1.0 so the viewer sees the full 3D stand respond.
 */
interface ZoomBeat {
  start: number;
  inEnd: number;
  holdEnd: number;
  outEnd: number;
  scale: number;
  originX: number;
  originY: number;
}

const ZOOM_BEATS: ZoomBeat[] = [
  // Ch 01: Space tab -> 6×4m -> Warm Oak
  { start: 1.6, inEnd: 2.3, holdEnd: 8.2, outEnd: 9.2, scale: 1.32, originX: 16, originY: 38 },
  // Ch 02: Equipment tab + first two clicks, brief pull-out, then desk click
  { start: 11.6, inEnd: 12.4, holdEnd: 14.8, outEnd: 15.6, scale: 1.3, originX: 17, originY: 25 },
  { start: 17.0, inEnd: 17.7, holdEnd: 18.6, outEnd: 19.4, scale: 1.26, originX: 17, originY: 40 },
  { start: 20.6, inEnd: 21.3, holdEnd: 22.2, outEnd: 23.0, scale: 1.26, originX: 17, originY: 50 },
  // Ch 03: Lounge & Kiosk cards
  { start: 26.0, inEnd: 26.7, holdEnd: 27.6, outEnd: 28.4, scale: 1.26, originX: 17, originY: 64 },
  { start: 32.5, inEnd: 33.2, holdEnd: 34.2, outEnd: 35.0, scale: 1.26, originX: 17, originY: 82 },
  // Ch 04: 3D drag + Right Inspector focus
  { start: 38.0, inEnd: 39.0, holdEnd: 47.6, outEnd: 48.8, scale: 1.22, originX: 66, originY: 56 },
  // Ch 05: Brand rail -> Apply Brand Artwork
  { start: 49.8, inEnd: 50.6, holdEnd: 54.4, outEnd: 55.4, scale: 1.32, originX: 14, originY: 40 },
  // Ch 06: Top Bar View Switcher (Plan, then Visitor)
  { start: 60.4, inEnd: 61.0, holdEnd: 61.9, outEnd: 62.6, scale: 1.34, originX: 52, originY: 6 },
  { start: 64.2, inEnd: 64.8, holdEnd: 65.6, outEnd: 66.3, scale: 1.34, originX: 56, originY: 6 },
  // Ch 07: Top-right Export Brief CTA
  { start: 71.1, inEnd: 71.8, holdEnd: 72.7, outEnd: 73.4, scale: 1.34, originX: 90, originY: 6 },
];

export interface StageZoomState {
  scale: number;
  originX: number;
  originY: number;
}

export function evaluateStageZoom(t: number): StageZoomState {
  for (const beat of ZOOM_BEATS) {
    if (t >= beat.start && t <= beat.outEnd) {
      let amount = 0;
      if (t < beat.inEnd) {
        amount = easeInOutCubic((t - beat.start) / Math.max(0.01, beat.inEnd - beat.start));
      } else if (t <= beat.holdEnd) {
        amount = 1;
      } else {
        amount = 1 - easeInOutCubic((t - beat.holdEnd) / Math.max(0.01, beat.outEnd - beat.holdEnd));
      }
      return {
        scale: lerp(1, beat.scale, amount),
        originX: beat.originX,
        originY: beat.originY,
      };
    }
  }
  return { scale: 1, originX: 50, originY: 50 };
}

export interface WorkspaceSnapshot {
  railTab: 'build' | 'branding' | 'assets';
  buildTab: 'catalog' | 'space' | 'presets';
  boothSize: '4x3' | '6x4';
  floorMaterial: FloorMaterial;
  paletteSelected: boolean;
  brandApplied: boolean;
  viewMode: ViewMode;
  selectedItemId: string | null;
  deskZOffset: number; // 0.0 -> +0.4m snapped in 0.1m increments
  kioskRotDeg: number; // -90° -> 0°
  rKeyPressed: boolean;
  exportModalOpen: boolean;
  placedCount: number;
  liveEstimate: number;
  recentEstimateBump: boolean;
}

export function evaluateWorkspaceState(t: number): WorkspaceSnapshot {
  const railTab: 'build' | 'branding' | 'assets' =
    t >= 50.55 && t < 60.0 ? 'branding' : 'build';

  const buildTab: 'catalog' | 'space' | 'presets' =
    t >= 2.35 && t < 12.35 ? 'space' : 'catalog';

  const boothSize: '4x3' | '6x4' = t >= 4.45 ? '6x4' : '4x3';
  const floorMaterial: FloorMaterial = t >= 7.85 ? 'oak-timber' : 'charcoal-carpet';

  const paletteSelected = t >= 52.25;
  const brandApplied = t >= 53.95;

  let viewMode: ViewMode = '3d';
  if (t >= 61.25 && t < 65.0) {
    viewMode = '2d';
  } else if (t >= 65.0 && t < 70.0) {
    viewMode = 'eye-level';
  }

  let selectedItemId: string | null = null;
  if (t >= 38.35 && t < 44.6) {
    selectedItemId = 'wt-reception-desk';
  } else if (t >= 45.25 && t < 49.4) {
    selectedItemId = 'wt-demo-kiosk';
  }

  let deskZOffset = 0;
  if (t >= 40.0) {
    const raw = easeInOutCubic(clamp((t - 40.0) / 2.6, 0, 1)) * 0.4;
    deskZOffset = Math.round(raw * 10) / 10; // Crisp 0.1m grid snap
  }

  let kioskRotDeg = -90;
  if (t >= 46.3) {
    const rotP = easeOutBack(clamp((t - 46.3) / 0.8, 0, 1));
    kioskRotDeg = Math.round(lerp(-90, 0, clamp(rotP, 0, 1)));
  }

  const rKeyPressed = t >= 46.2 && t <= 47.4;
  const exportModalOpen = t >= 72.25;

  let placedCount = 0;
  let liveEstimate = boothSize === '6x4' ? 1150 : 750;
  let recentEstimateBump = false;
  for (const spec of WALKTHROUGH_ITEMS) {
    if (t >= spec.appearAt) {
      placedCount += 1;
      liveEstimate += spec.priceHire;
      if (t - spec.appearAt < 0.9) {
        recentEstimateBump = true;
      }
    }
  }

  return {
    railTab,
    buildTab,
    boothSize,
    floorMaterial,
    paletteSelected,
    brandApplied,
    viewMode,
    selectedItemId,
    deskZOffset,
    kioskRotDeg,
    rKeyPressed,
    exportModalOpen,
    placedCount,
    liveEstimate,
    recentEstimateBump,
  };
}

/**
 * Calm, steady, designer-friendly 3D viewport camera.
 * Stays anchored at a comfortable 3/4 isometric studio angle while the user builds,
 * gently frames items during drag/rotate, cranes overhead for 2D Plan, and drops to 1:1 eye level for Visitor view.
 */
export function evaluateWalkthroughCamera(t: number): {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
} {
  // Base comfortable 3/4 studio camera
  const isoPos: [number, number, number] = [4.9, 4.35, 6.2];
  const isoTarget: [number, number, number] = [-0.1, 0.85, -0.1];

  // Subtle breathing drift while building (Ch 01–03) so it feels alive without ever distracting
  if (t < 36.0) {
    const gentleAz = Math.sin(t * 0.14) * 0.35;
    const scalePull = easeInOutCubic(clamp((t - 4.45) / 1.2, 0, 1));
    return {
      pos: [
        lerp(4.1, isoPos[0], scalePull) + gentleAz,
        lerp(3.6, isoPos[1], scalePull),
        lerp(5.1, isoPos[2], scalePull),
      ],
      target: [isoTarget[0], isoTarget[1], isoTarget[2]],
      fov: 38,
    };
  }

  // Ch 04 (36–49s): Slight steady lean-in toward front floor for Reception Desk drag & Kiosk rotate
  if (t < 49.0) {
    const enter = easeInOutCubic(clamp((t - 36.0) / 1.4, 0, 1));
    const exit = easeInOutCubic(clamp((t - 47.6) / 1.4, 0, 1));
    const focus = enter * (1 - exit);
    return {
      pos: [
        lerp(isoPos[0], 3.8, focus),
        lerp(isoPos[1], 3.7, focus),
        lerp(isoPos[2], 5.6, focus),
      ],
      target: [lerp(isoTarget[0], 0.35, focus), lerp(isoTarget[1], 0.65, focus), lerp(isoTarget[2], 0.65, focus)],
      fov: lerp(38, 36, focus),
    };
  }

  // Ch 05 (49–60s): Front-angled hero view so backlit LED Wall, Lightbox & Desk artwork shine
  if (t < 60.0) {
    const u = easeInOutCubic(clamp((t - 49.0) / 1.6, 0, 1));
    const slowPan = easeInOutCubic(clamp((t - 53.5) / 6.0, 0, 1));
    return {
      pos: [
        lerp(isoPos[0], lerp(2.2, -1.6, slowPan), u),
        lerp(isoPos[1], 2.75, u),
        lerp(isoPos[2], 6.45, u),
      ],
      target: [0, 1.05, -0.35],
      fov: 36,
    };
  }

  // Ch 06a (60–65s): Crisp 2D Plan overhead camera when "Plan" is clicked at 61.25s
  if (t < 65.0) {
    const crane = easeInOutCubic(clamp((t - 61.25) / 1.0, 0, 1));
    return {
      pos: [lerp(-1.6, 0, crane), lerp(2.75, 10.2, crane), lerp(6.45, 0.15, crane)],
      target: [0, lerp(1.05, 0, crane), lerp(-0.35, 0, crane)],
      fov: lerp(36, 32, crane),
    };
  }

  // Ch 06b (65–70s): 1:1 Visitor Eye-Level view when "Visitor" is clicked at 65.0s
  if (t < 70.0) {
    const drop = easeInOutCubic(clamp((t - 65.0) / 1.05, 0, 1));
    const walk = easeInOutCubic(clamp((t - 66.0) / 3.8, 0, 1));
    return {
      pos: [
        lerp(0, lerp(-0.4, 0.55, walk), drop),
        lerp(10.2, 1.66, drop),
        lerp(0.15, lerp(4.3, 3.25, walk), drop),
      ],
      target: [0, lerp(0, 1.25, drop), lerp(0, -0.45, drop)],
      fov: lerp(32, 42, drop),
    };
  }

  // Ch 07 (70–76s): Return cleanly to crisp 3D hero view when "3D" is clicked at 70.0s
  const back = easeInOutCubic(clamp((t - 70.0) / 1.1, 0, 1));
  return {
    pos: [lerp(0.55, 4.7, back), lerp(1.66, 3.8, back), lerp(3.25, 5.9, back)],
    target: [0, lerp(1.25, 0.95, back), lerp(-0.45, -0.15, back)],
    fov: lerp(42, 37, back),
  };
}

/**
 * Lightweight, zero-asset Web Audio tactile UI feedback (gentle click, soft pop, warm chime).
 * Safely no-ops if audio is muted or blocked by browser autoplay rules.
 */
let sharedAudioCtx: AudioContext | null = null;

export function playWalkthroughSound(kind: 'click' | 'drop' | 'chime'): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;

    if (kind === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.04);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (kind === 'drop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(560, now + 0.075);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
    } else if (kind === 'chime') {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const start = now + idx * 0.055;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.045, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    }
  } catch {
    // Ignore Web Audio errors when restricted
  }
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function buildWalkthroughStandConfig(
  brandConfig: StandConfig,
  width: number,
  depth: number,
  floorMaterial: FloorMaterial
): StandConfig {
  return {
    width,
    depth,
    heightLimit: 4.0,
    openSides: 3,
    showShellWalls: true,
    shellWallHeight: 2.5,
    floorMaterial,
    floorColor: floorMaterial === 'oak-timber' ? '#B8956A' : '#2E333B',
    wallColor: '#F4F3EF',
    trimColor: '#C5C9CE',
    brandName: brandConfig.brandName || 'PILOTSTAND',
    brandTagline: brandConfig.brandTagline || 'Modular Exhibition Architecture',
    primaryColor: brandConfig.primaryColor || '#1B365D',
    accentColor: brandConfig.accentColor || '#D95D39',
    lightingPreset: 'expo-hall',
    showScaleFigures: true,
    showDimensions: false,
    showGrid: true,
    snapToGrid: true,
    gridStep: 0.1,
    unit: 'm',
    shellArtwork: {},
  };
}
