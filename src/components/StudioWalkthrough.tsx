import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Compass,
  Download,
  Eye,
  Grid,
  Layers,
  Move,
  Paintbrush,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Sparkles,
  Subtitles,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type { StandConfig, StandItem } from '../types/stand';
import { STAND_TEMPLATES, instantiateTemplate } from '../data/templates';
import { BUILTIN_BRAND_ASSETS } from '../data/palettes';
import { CATALOG_MAP } from '../data/catalog';
import { buildBoothShell, buildScaleFigures, buildStandItemMesh } from '../engine/meshFactory';

export const TOUR_DURATION_SEC = 48; // 0:48 high-retention, zero-dead-air Zuki Studio product film
export const WALKTHROUGH_DISMISSED_KEY = 'zuki_walkthrough_dismissed_v1';

interface WalkthroughChapter {
  id: string;
  number: string;
  title: string;
  headline: string;
  shortDesc: string;
  startSec: number;
  endSec: number;
  caption: string;
}

const CHAPTERS: WalkthroughChapter[] = [
  {
    id: 'instant-hook',
    number: '01',
    title: 'Blank Floor to Flagship',
    headline: 'From Blank Floor to Flagship',
    shortDesc: '48 m² grid locks, core tower & LED wall land',
    startSec: 0,
    endSec: 4.5,
    caption:
      '8m × 6m island grid locks in instantly — central brand tower and 3.8m LED video wall drop live.',
  },
  {
    id: 'rapid-architecture',
    number: '02',
    title: 'Modular Architecture',
    headline: 'Snap-Together Flagship Build',
    shortDesc: 'SEG lightboxes, brand arch, totems & 360° halo',
    startSec: 4.5,
    endSec: 12.0,
    caption:
      'Twin SEG backlit wings, 5.4m brand arch, illuminated totems, and 4.2m 360° halo assemble in seconds.',
  },
  {
    id: 'hospitality-3d',
    number: '03',
    title: 'Zones & Custom 3D',
    headline: 'Hospitality & Custom .GLB Drop',
    shortDesc: 'Lounges, meeting suite, kiosks & 3D product import',
    startSec: 12.0,
    endSec: 19.0,
    caption:
      'Reception, VIP lounge, meeting suite, and your own .GLB / .STL / .OBJ product drop straight onto the plinth.',
  },
  {
    id: 'precision-control',
    number: '04',
    title: 'Drag, Snap & Rotate',
    headline: '0.1m Grid Precision Control',
    shortDesc: 'Live floor drag, snap guides & R-key rotation',
    startSec: 19.0,
    endSec: 25.0,
    caption:
      'Slide counters along live 0.1m alignment guides, tap R to rotate kiosks 90°, and dial exact inspector specs.',
  },
  {
    id: 'brand-wave',
    number: '05',
    title: '1-Click Brand Wave',
    headline: '1-Click Full-Pavilion Branding',
    shortDesc: 'Backlit artwork sweeps every surface live',
    startSec: 25.0,
    endSec: 32.0,
    caption:
      'Apply your logo and campaign artwork across LED walls, SEG lightboxes, arch fascia, desk, and 360° halo in one click.',
  },
  {
    id: 'views-blueprint-eye',
    number: '06',
    title: '2D Plan & Visitor View',
    headline: 'Blueprint to 1:1 Eye-Level',
    shortDesc: 'Verify 48 m² compliance, then walk the aisle',
    startSec: 32.0,
    endSec: 38.0,
    caption:
      'Snap to Orthographic 2D Floor Plan to verify aisle clearances, then plunge to 1:1 Visitor Eye-Level.',
  },
  {
    id: 'ai-keynote-lighting',
    number: '07',
    title: 'Zuki AI & Lighting',
    headline: 'AI Prompt · Keynote Spotlight',
    shortDesc: 'Live lighting shift from Expo Hall to Keynote',
    startSec: 38.0,
    endSec: 44.0,
    caption:
      'Ask Zuki AI Designer to transform atmosphere — shifting live from Expo Hall daylight to Keynote Spotlight.',
  },
  {
    id: 'grand-finale',
    number: '08',
    title: 'Hero Reveal & Export',
    headline: 'Client-Ready in One Click',
    shortDesc: '1600px PNG, print brief & instant BOM',
    startSec: 44.0,
    endSec: 48.0,
    caption:
      'Export 1600px studio PNGs, print-ready production briefs, and instant BOMs — your Zuki Studio workspace is ready.',
  },
];

const CHAPTER_CUT_TIMES = [4.5, 12.0, 19.0, 25.0, 32.0, 38.0, 44.0];
const SPEED_OPTIONS = [1, 1.25, 1.5] as const;
const AI_PROMPT_TEXT = 'Switch to Keynote Spotlight & warm hospitality glow';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(x: number): number {
  const t = clamp(x, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuint(x: number): number {
  const t = clamp(x, 0, 1);
  return 1 - Math.pow(1 - t, 5);
}

function easeInOutCubic(x: number): number {
  const t = clamp(x, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBack(x: number): number {
  const t = clamp(x, 0, 1);
  const c1 = 1.65;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function rectExitRadius(halfW: number, halfD: number, azRad: number): number {
  const sinA = Math.abs(Math.sin(azRad));
  const cosA = Math.abs(Math.cos(azRad));
  const rx = sinA > 1e-4 ? halfW / sinA : 1e6;
  const rz = cosA > 1e-4 ? halfD / cosA : 1e6;
  return Math.min(rx, rz);
}

interface StageItemEntry {
  item: StandItem;
  appearAt: number;
  appearDuration: number;
  isOverhead: boolean;
  paintAt: number | null;
  hirePrice: number;
  unpaintedGroup: THREE.Group;
  paintedGroup: THREE.Group | null;
}

interface ItemTiming {
  appearAt: number;
  appearDuration: number;
  isOverhead: boolean;
  paintAt: number | null;
}

/**
 * High-energy staccato timeline (0–48s, zero dead air):
 * - First architectural tower + 3.8m LED wall slam in by 2.2s–2.9s!
 * - Architectural build cascades every 0.6–0.8s (4.7s–9.4s).
 * - Hospitality & furniture cascade rapidly (12.2s–16.0s), custom .GLB at 16.4s.
 * - 1-click brand wave sweeps every hero surface (25.6s–30.8s).
 */
function getItemSchedule(item: StandItem, index: number): ItemTiming {
  switch (item.catalogId) {
    case 'storage-cabin':
      return { appearAt: 2.2, appearDuration: 0.65, isOverhead: false, paintAt: 28.9 };
    case 'led-video-wall':
      return { appearAt: 2.9, appearDuration: 0.7, isOverhead: false, paintAt: 25.6 };
    case 'truss-rig':
      return { appearAt: 4.7, appearDuration: 0.75, isOverhead: true, paintAt: null };
    case 'seg-lightbox':
      return {
        appearAt: item.x < 0 ? 5.5 : 6.2,
        appearDuration: 0.65,
        isOverhead: false,
        paintAt: item.x < 0 ? 26.8 : 27.4,
      };
    case 'front-arch':
      return { appearAt: 7.0, appearDuration: 0.75, isOverhead: false, paintAt: 28.3 };
    case 'brand-totem':
      return {
        appearAt: item.x < 0 ? 7.9 : 8.5,
        appearDuration: 0.6,
        isOverhead: false,
        paintAt: item.x < 0 ? 30.4 : 30.7,
      };
    case 'hanging-ring':
      return { appearAt: 9.4, appearDuration: 1.05, isOverhead: true, paintAt: 30.1 };
    case 'reception-desk':
      return { appearAt: 12.2, appearDuration: 0.6, isOverhead: false, paintAt: 29.2 };
    case 'display-plinth':
      return {
        appearAt: item.x < 0 ? 12.7 : 13.1,
        appearDuration: 0.55,
        isOverhead: false,
        paintAt: item.x < 0 ? 29.5 : 29.7,
      };
    case 'lounge-sofa':
      return { appearAt: 13.5, appearDuration: 0.55, isOverhead: false, paintAt: null };
    case 'coffee-table':
      return { appearAt: 13.9, appearDuration: 0.5, isOverhead: false, paintAt: null };
    case 'meeting-table':
      return { appearAt: 14.3, appearDuration: 0.55, isOverhead: false, paintAt: null };
    case 'meeting-chair':
      return {
        appearAt: 14.6 + (index % 4) * 0.16,
        appearDuration: 0.45,
        isOverhead: false,
        paintAt: null,
      };
    case 'demo-kiosk':
      return {
        appearAt: item.x < 0 ? 15.3 : 15.65,
        appearDuration: 0.55,
        isOverhead: false,
        paintAt: 29.8,
      };
    default:
      return {
        appearAt: 15.0 + (index % 5) * 0.22,
        appearDuration: 0.5,
        isOverhead: false,
        paintAt: item.catalogId === 'tv-stand' ? 27.9 : null,
      };
  }
}

/**
 * Assign rich built-in brand artwork for the 1-Click Brand Wave in Chapter 05.
 */
function buildPaintedItemClone(item: StandItem, primaryHex: string): StandItem {
  const clone: StandItem = {
    ...item,
    artwork: { ...item.artwork },
  };
  if (item.catalogId === 'led-video-wall' || item.catalogId === 'tv-stand') {
    clone.artwork.screen = {
      assetId: 'preset-product-screen',
      fit: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      bgColor: '#0F172A',
      emissive: true,
    };
  } else if (item.catalogId === 'seg-lightbox' || item.catalogId === 'brand-totem') {
    clone.artwork.front = {
      assetId: 'preset-hero-mural',
      fit: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      bgColor: primaryHex,
      emissive: true,
    };
  } else if (item.catalogId === 'front-arch') {
    clone.artwork.fascia = {
      assetId: 'preset-company-logo',
      fit: 'contain',
      scale: 0.85,
      offsetX: 0,
      offsetY: 0,
      bgColor: primaryHex,
      emissive: false,
    };
    clone.artwork['pillar-left'] = {
      assetId: 'preset-architectural-pattern',
      fit: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      bgColor: primaryHex,
      emissive: false,
    };
    clone.artwork['pillar-right'] = {
      assetId: 'preset-architectural-pattern',
      fit: 'cover',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      bgColor: primaryHex,
      emissive: false,
    };
  } else if (item.catalogId === 'hanging-ring') {
    clone.artwork.ring = {
      assetId: 'preset-company-logo',
      fit: 'contain',
      scale: 0.8,
      offsetX: 0,
      offsetY: 0,
      bgColor: primaryHex,
      emissive: true,
    };
  } else if (
    item.catalogId === 'reception-desk' ||
    item.catalogId === 'display-plinth' ||
    item.catalogId === 'demo-kiosk' ||
    item.catalogId === 'storage-cabin'
  ) {
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

/**
 * Cinema-grade, 100% collision-free camera choreography for t in [0, 48].
 * Mixes punchy whip-settles, low architectural hero sweeps, tight product push-ins,
 * crisp orthographic 2D crane-up, 1:1 visitor eye-level dolly, and a grand hero finale orbit.
 */
function evaluateWalkthroughCamera(t: number): {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
} {
  const halfW = 4.0;
  const halfD = 3.0;

  const perimeterPos = (azDeg: number, margin: number, y: number): [number, number, number] => {
    const rad = (azDeg * Math.PI) / 180;
    const r = rectExitRadius(halfW, halfD, rad) + margin;
    return [Math.sin(rad) * r, y, Math.cos(rad) * r];
  };

  // CH 01 (0.0 – 4.5s): Punchy crane-drop establisher → locks onto core tower & LED wall slam
  if (t < 4.5) {
    const settle = easeOutQuint(t / 1.8);
    const drift = easeInOutCubic(clamp((t - 1.4) / 3.1, 0, 1));
    const az = lerp(52, 22, settle) - drift * 12;
    const margin = lerp(6.0, 4.3, settle);
    const y = lerp(5.6, 3.2, settle) - drift * 0.4;
    return {
      pos: perimeterPos(az, margin, y),
      target: [0, lerp(0.2, 1.25, drift), lerp(0, -0.7, drift)],
      fov: lerp(46, 40, settle),
    };
  }

  // CH 02 (4.5 – 12.0s): Dynamic architectural whip-sweep (low hero front-left → elevated 3/4 for 360° halo)
  if (t < 12.0) {
    const cutWhip = easeOutQuint(clamp((t - 4.5) / 1.1, 0, 1));
    const sweep = easeInOutCubic(clamp((t - 5.2) / 6.8, 0, 1));
    const az = lerp(-34, -22, cutWhip) + sweep * 68; // -34° -> +46°
    const margin = lerp(4.2, 4.9, sweep);
    const y = lerp(2.15, 4.55, sweep);
    return {
      pos: perimeterPos(az, margin, y),
      target: [0, lerp(1.25, 1.85, sweep), -0.15],
      fov: lerp(39, 43, sweep),
    };
  }

  // CH 03 (12.0 – 19.0s): Hospitality cascade → punch-in spotlight on West Plinth .GLB drop
  if (t < 19.0) {
    if (t < 16.0) {
      const u = easeInOutCubic((t - 12.0) / 4.0);
      return {
        pos: perimeterPos(lerp(46, -24, u), lerp(4.9, 4.1, u), lerp(4.4, 3.15, u)),
        target: [lerp(0, -0.4, u), lerp(1.25, 0.95, u), lerp(0.1, 0.5, u)],
        fov: lerp(43, 39, u),
      };
    }
    const punch = easeOutQuint(clamp((t - 16.0) / 1.15, 0, 1));
    const orbit = clamp((t - 16.4) / 2.6, 0, 1);
    return {
      pos: perimeterPos(lerp(-24, -42, punch) - orbit * 12, lerp(4.1, 2.75, punch), lerp(3.15, 2.05, punch)),
      target: [lerp(-0.4, -1.85, punch), lerp(0.95, 1.25, punch), lerp(0.5, 1.05, punch)],
      fov: lerp(39, 32, punch),
    };
  }

  // CH 04 (19.0 – 25.0s): Precision Control — Reception Counter snap drag (19–22s) → whip to East Kiosk rotate (22–25s)
  if (t < 22.0) {
    const enter = easeOutQuint(clamp((t - 19.0) / 0.85, 0, 1));
    const track = easeInOutCubic(clamp((t - 19.4) / 2.4, 0, 1));
    return {
      pos: perimeterPos(lerp(-14, 12, track), lerp(3.8, 3.45, enter), lerp(3.2, 2.95, enter)),
      target: [0, 0.85, lerp(1.25, 1.5, Math.sin(track * Math.PI))],
      fov: 37,
    };
  }
  if (t < 25.0) {
    const whip = easeOutQuint(clamp((t - 22.0) / 0.8, 0, 1));
    const drift = clamp((t - 22.6) / 2.4, 0, 1);
    return {
      pos: perimeterPos(lerp(18, 48, whip) + drift * 8, lerp(3.45, 2.85, whip), lerp(2.95, 2.35, whip)),
      target: [lerp(0, 2.7, whip), lerp(0.85, 0.95, whip), lerp(1.3, 1.35, whip)],
      fov: lerp(37, 34, whip),
    };
  }

  // CH 05 (25.0 – 32.0s): 1-Click Brand Wave — dramatic telephoto hero front sweep
  if (t < 32.0) {
    const u = easeInOutCubic((t - 25.0) / 7.0);
    const pullBack = easeInOutCubic(clamp((t - 29.6) / 2.4, 0, 1));
    return {
      pos: perimeterPos(lerp(-18, 22, u), lerp(3.9, 4.65, pullBack), lerp(2.15, 3.05, pullBack)),
      target: [0, lerp(1.55, 1.9, pullBack), -0.35],
      fov: lerp(33, 38, pullBack),
    };
  }

  // CH 06 (32.0 – 38.0s): Snappy Crane-Up to 2D Orthographic Plan (32–35s) → Dramatic Plunge to 1:1 Eye-Level (35–38s)
  if (t < 35.0) {
    const crane = easeOutQuint(clamp((t - 32.0) / 1.05, 0, 1));
    const startPos = perimeterPos(22, 4.65, 3.05);
    const topPos: [number, number, number] = [0, 13.4, 0.25];
    return {
      pos: [
        lerp(startPos[0], topPos[0], crane),
        lerp(startPos[1], topPos[1], crane),
        lerp(startPos[2], topPos[2], crane),
      ],
      target: [0, lerp(1.9, 0, crane), 0],
      fov: lerp(38, 32, crane),
    };
  }
  if (t < 38.0) {
    const plunge = easeOutQuint(clamp((t - 35.0) / 1.05, 0, 1));
    const walkIn = easeInOutCubic(clamp((t - 35.6) / 2.4, 0, 1));
    const eyeStart = perimeterPos(-6, 3.8, 1.68);
    const eyeEnd = perimeterPos(4, 2.35, 1.66);
    const targetEye: [number, number, number] = [
      lerp(eyeStart[0], eyeEnd[0], walkIn),
      lerp(eyeStart[1], eyeEnd[1], walkIn),
      lerp(eyeStart[2], eyeEnd[2], walkIn),
    ];
    return {
      pos: [
        lerp(0, targetEye[0], plunge),
        lerp(13.4, targetEye[1], plunge),
        lerp(0.25, targetEye[2], plunge),
      ],
      target: [0, lerp(0, 1.48, plunge), lerp(0, -0.35, plunge)],
      fov: lerp(32, 42, plunge),
    };
  }

  // CH 07 (38.0 – 44.0s): Zuki AI Prompt & Keynote Spotlight Drama
  if (t < 44.0) {
    const u = easeInOutCubic((t - 38.0) / 6.0);
    return {
      pos: perimeterPos(lerp(12, -32, u), lerp(3.6, 4.5, u), lerp(2.1, 3.15, u)),
      target: [0, lerp(1.45, 1.55, u), -0.15],
      fov: lerp(41, 37, u),
    };
  }

  // CH 08 (44.0 – 48.0s): Grand Hero Finale 360° Architectural Pull-Out Orbit
  const u = easeOutCubic(clamp((t - 44.0) / 4.0, 0, 1));
  return {
    pos: perimeterPos(lerp(-32, 48, u), lerp(4.5, 5.4, u), lerp(3.15, 4.55, u)),
    target: [0, lerp(1.55, 1.35, u), 0],
    fov: lerp(37, 42, u),
  };
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    }
  });
}

/**
 * Self-contained Three.js PBR 3D stage rendered inside the 16:9 walkthrough modal.
 * 100% deterministic from `elapsedSec` so scrubbing, speed, and chapter jumps are frame-accurate.
 */
const WalkthroughStage3D: React.FC<{
  elapsedSec: number;
  brandConfig: StandConfig;
}> = ({ elapsedSec, brandConfig }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef(elapsedSec);
  useEffect(() => {
    elapsedRef.current = elapsedSec;
  }, [elapsedSec]);

  const sceneDataRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    entries: StageItemEntry[];
    customGlbMesh: THREE.Group;
    glbPulseRing: THREE.Mesh;
    aislePulseLines: THREE.LineLoop;
    selectionRing: THREE.Mesh;
    guideLineX: THREE.Line;
    guideLineZ: THREE.Line;
    scaleFigures: THREE.Group;
    hemi: THREE.HemisphereLight;
    keyLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
    warmSpot: THREE.SpotLight;
    rimSpot: THREE.SpotLight;
    paintFlashLight: THREE.PointLight;
    hallFloorMat: THREE.MeshStandardMaterial;
  } | null>(null);

  const demoConfig = useMemo<StandConfig>(() => {
    const base = instantiateTemplate(STAND_TEMPLATES[0]).config;
    return {
      ...base,
      brandName: brandConfig.brandName || 'ZUKI STUDIO',
      brandTagline: brandConfig.brandTagline || 'Modular Exhibition Architecture',
      primaryColor: brandConfig.primaryColor || '#1B365D',
      accentColor: brandConfig.accentColor || '#D95D39',
      showGrid: true,
      showDimensions: false,
      showScaleFigures: true,
    };
  }, [
    brandConfig.brandName,
    brandConfig.brandTagline,
    brandConfig.primaryColor,
    brandConfig.accentColor,
  ]);

  // Mount Three.js scene once while modal is open
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 860;
    const height = container.clientHeight || 484;

    const expoBg = new THREE.Color('#E6E9EF');
    const keynoteBg = new THREE.Color('#0E1525');
    const expoFloorCol = new THREE.Color('#DDE1E8');
    const keynoteFloorCol = new THREE.Color('#182032');
    const expoKeyCol = new THREE.Color('#FFFBF5');
    const keynoteKeyCol = new THREE.Color('#FFE4C2');

    const scene = new THREE.Scene();
    scene.background = expoBg.clone();
    scene.fog = new THREE.Fog(expoBg.clone(), 20, 52);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.6;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);

    // Studio & Keynote Lighting Rig
    const hemi = new THREE.HemisphereLight('#FFFFFF', '#CBD5E1', 0.86);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#FFFBF5', 1.48);
    keyLight.position.set(8, 12, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 32;
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 8;
    keyLight.shadow.camera.bottom = -8;
    keyLight.shadow.bias = -0.0006;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#DCE7F7', 0.5);
    fillLight.position.set(-7, 7, -6);
    scene.add(fillLight);

    // Dramatic Keynote Spotlight + Rim Spotlight (ignites in Ch 07 at t = 40.8s)
    const warmSpot = new THREE.SpotLight('#FFCB8E', 0, 26, Math.PI / 3.4, 0.6, 1.1);
    warmSpot.position.set(0, 7.8, 4.8);
    warmSpot.target.position.set(0, 1.2, 0);
    scene.add(warmSpot, warmSpot.target);

    const rimSpot = new THREE.SpotLight('#60A5FA', 0, 26, Math.PI / 3.2, 0.7, 1.1);
    rimSpot.position.set(-5.5, 6.8, -5.5);
    rimSpot.target.position.set(0, 1.4, 0);
    scene.add(rimSpot, rimSpot.target);

    // Subtle bloom flash light that pulses on 1-click brand paint hits in Ch 05
    const paintFlashLight = new THREE.PointLight('#FFFFFF', 0, 14, 1.4);
    paintFlashLight.position.set(0, 2.2, 1.5);
    scene.add(paintFlashLight);

    // Hall Floor
    const hallFloorMat = new THREE.MeshStandardMaterial({
      color: expoFloorCol.clone(),
      roughness: 0.9,
      metalness: 0.04,
    });
    const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), hallFloorMat);
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.y = -0.048;
    hallFloor.receiveShadow = true;
    scene.add(hallFloor);

    // Booth Floor & Grid
    const assetsMap = new Map(BUILTIN_BRAND_ASSETS.map((a) => [a.id, a]));
    const ctx = {
      config: demoConfig,
      assetsMap,
      onTextureReady: () => {
        renderer.render(scene, camera);
      },
    };
    const shell = buildBoothShell(ctx);
    scene.add(shell);

    // Glowing Aisle Bounds Perimeter Pulse (0.8s – 3.5s)
    const perimeterPts = [
      new THREE.Vector3(-4.05, 0.03, -3.05),
      new THREE.Vector3(4.05, 0.03, -3.05),
      new THREE.Vector3(4.05, 0.03, 3.05),
      new THREE.Vector3(-4.05, 0.03, 3.05),
    ];
    const aislePulseLines = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(perimeterPts),
      new THREE.LineBasicMaterial({
        color: demoConfig.accentColor || '#D95D39',
        transparent: true,
        opacity: 0,
      })
    );
    scene.add(aislePulseLines);

    // Build all Flagship Pavilion items (unpainted + painted variants)
    const templateInstance = instantiateTemplate(STAND_TEMPLATES[0]);
    const entries: StageItemEntry[] = [];

    templateInstance.items.forEach((rawItem, idx) => {
      const sched = getItemSchedule(rawItem, idx);
      const unpaintedGroup = buildStandItemMesh(rawItem, ctx);
      unpaintedGroup.position.set(rawItem.x, rawItem.y, rawItem.z);
      unpaintedGroup.rotation.y = (rawItem.rotationY * Math.PI) / 180;
      unpaintedGroup.visible = false;
      scene.add(unpaintedGroup);

      let paintedGroup: THREE.Group | null = null;
      if (sched.paintAt !== null) {
        const paintedItem = buildPaintedItemClone(rawItem, demoConfig.primaryColor);
        paintedGroup = buildStandItemMesh(paintedItem, ctx);
        paintedGroup.position.set(rawItem.x, rawItem.y, rawItem.z);
        paintedGroup.rotation.y = (rawItem.rotationY * Math.PI) / 180;
        paintedGroup.visible = false;
        scene.add(paintedGroup);
      }

      entries.push({
        item: rawItem,
        appearAt: sched.appearAt,
        appearDuration: sched.appearDuration,
        isOverhead: sched.isOverhead,
        paintAt: sched.paintAt,
        hirePrice: CATALOG_MAP[rawItem.catalogId]?.priceHire ?? 250,
        unpaintedGroup,
        paintedGroup,
      });
    });

    // Sculptural Custom .GLB Product Centerpiece (drops onto West Showcase Plinth at t = 16.4s)
    const customGlbMesh = new THREE.Group();
    const coreMat = new THREE.MeshStandardMaterial({
      color: demoConfig.accentColor || '#D95D39',
      metalness: 0.78,
      roughness: 0.18,
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#F1F5F9',
      metalness: 0.9,
      roughness: 0.14,
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.08, 28), ringMat);
    pedestal.position.y = 0.04;
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.17, 0.05, 84, 18), coreMat);
    knot.position.y = 0.35;
    knot.castShadow = true;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.013, 12, 40), ringMat);
    halo.position.y = 0.35;
    halo.rotation.x = Math.PI / 3;
    customGlbMesh.add(pedestal, knot, halo);
    customGlbMesh.position.set(-1.85, 1.08, 1.05);
    customGlbMesh.visible = false;
    scene.add(customGlbMesh);

    // Plinth Highlight Ring when .GLB lands
    const glbPulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.31, 40),
      new THREE.MeshBasicMaterial({
        color: '#38BDF8',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })
    );
    glbPulseRing.rotation.x = -Math.PI / 2;
    glbPulseRing.position.set(-1.85, 1.1, 1.05);
    glbPulseRing.visible = false;
    scene.add(glbPulseRing);

    // Selection Highlight Ring + Live 0.1m Alignment Guide Lines (Chapter 04)
    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.87, 48),
      new THREE.MeshBasicMaterial({
        color: '#0EA5E9',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.02;
    selectionRing.visible = false;
    scene.add(selectionRing);

    const guideMat = new THREE.LineBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.88,
    });
    const guideLineX = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-4, 0.025, 0),
        new THREE.Vector3(4, 0.025, 0),
      ]),
      guideMat
    );
    guideLineX.visible = false;
    const guideLineZ = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.025, -3),
        new THREE.Vector3(0, 0.025, 3),
      ]),
      guideMat
    );
    guideLineZ.visible = false;
    scene.add(guideLineX, guideLineZ);

    // Scale human figures (visible from Visitor Eye-Level onward, t >= 34.8s)
    const scaleFigures = buildScaleFigures(demoConfig);
    scaleFigures.visible = false;
    scene.add(scaleFigures);

    sceneDataRef.current = {
      renderer,
      scene,
      camera,
      entries,
      customGlbMesh,
      glbPulseRing,
      aislePulseLines,
      selectionRing,
      guideLineX,
      guideLineZ,
      scaleFigures,
      hemi,
      keyLight,
      fillLight,
      warmSpot,
      rimSpot,
      paintFlashLight,
      hallFloorMat,
    };

    const resizeObserver = new ResizeObserver((obsEntries) => {
      const rect = obsEntries[0]?.contentRect;
      if (!rect || rect.width < 10 || rect.height < 10) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    });
    resizeObserver.observe(container);

    const paintPulseTimes = [25.6, 26.8, 27.4, 28.3, 29.2, 30.1];

    let rafId = 0;
    const renderFrame = () => {
      const data = sceneDataRef.current;
      if (!data) return;
      const t = elapsedRef.current;

      // 0. Aisle bounds pulse (0.7s -> 3.6s)
      const aisleMat = data.aislePulseLines.material as THREE.LineBasicMaterial;
      if (t >= 0.7 && t <= 3.8) {
        const pulse = Math.sin(((t - 0.7) / 0.55) * Math.PI) * 0.5 + 0.5;
        const fadeOut = 1 - clamp((t - 3.0) / 0.8, 0, 1);
        aisleMat.opacity = (0.35 + pulse * 0.65) * fadeOut;
        data.aislePulseLines.visible = true;
      } else {
        data.aislePulseLines.visible = false;
      }

      // 1. Update every stand item deterministically from t
      for (const entry of data.entries) {
        const isVisible = t >= entry.appearAt;
        const dropT = clamp((t - entry.appearAt) / entry.appearDuration, 0, 1);
        const dropEase = easeOutBack(dropT);
        const isPainted = entry.paintAt !== null && t >= entry.paintAt && entry.paintedGroup !== null;

        let posX = entry.item.x;
        let posY = entry.item.y;
        let posZ = entry.item.z;
        let rotRad = (entry.item.rotationY * Math.PI) / 180;

        if (dropT < 1) {
          posY = entry.isOverhead
            ? lerp(entry.item.y + 2.6, entry.item.y, easeOutCubic(dropT))
            : lerp(entry.item.y + 1.45, entry.item.y, easeOutCubic(dropT));
        }

        // Chapter 04 live manipulation:
        // Drag Reception Counter forward +0.50m along 0.1m snap grid (19.4s -> 21.8s)
        if (entry.item.catalogId === 'reception-desk' && t >= 19.3 && t < 22.0) {
          const outP = easeInOutCubic(clamp((t - 19.4) / 1.1, 0, 1));
          const backP = easeInOutCubic(clamp((t - 20.85) / 0.9, 0, 1));
          const rawOffset = 0.5 * (outP - backP);
          // Crisp 0.1m snap feel
          posZ = entry.item.z + Math.round(rawOffset * 10) / 10;
        }

        // Tap R to rotate East Demo Kiosk 90° toward approaching aisle (22.6s -> 24.4s)
        if (entry.item.catalogId === 'demo-kiosk' && entry.item.x > 0 && t >= 22.6) {
          const rotP = easeOutBack(clamp((t - 22.7) / 0.85, 0, 1));
          const extraDeg = lerp(0, 90, clamp(rotP, 0, 1.04));
          rotRad = ((entry.item.rotationY + extraDeg) * Math.PI) / 180;
        }

        // Subtle pop scale pulse right when painted in Chapter 05
        let paintPop = 1;
        if (entry.paintAt !== null && t >= entry.paintAt && t < entry.paintAt + 0.45) {
          const p = (t - entry.paintAt) / 0.45;
          paintPop = 1 + Math.sin(p * Math.PI) * 0.032;
        }

        const scaleVal = isVisible ? clamp(dropEase, 0.01, 1.04) * paintPop : 0.001;
        const applyToGroup = (grp: THREE.Group, show: boolean) => {
          grp.visible = show;
          if (!show) return;
          grp.position.set(posX, posY, posZ);
          grp.rotation.y = rotRad;
          grp.scale.setScalar(scaleVal);
        };

        applyToGroup(entry.unpaintedGroup, isVisible && !isPainted);
        if (entry.paintedGroup) {
          applyToGroup(entry.paintedGroup, isVisible && isPainted);
        }
      }

      // 2. Custom .GLB drop onto West Showcase Plinth at t = 16.4s
      if (t >= 16.4) {
        const glbT = clamp((t - 16.4) / 0.75, 0, 1);
        data.customGlbMesh.visible = true;
        data.customGlbMesh.position.set(-1.85, lerp(2.35, 1.08, easeOutCubic(glbT)), 1.05);
        data.customGlbMesh.scale.setScalar(clamp(easeOutBack(glbT), 0.01, 1.06));
        data.customGlbMesh.rotation.y = (t - 16.4) * 1.1;

        // Expanding highlight ring around plinth top right on impact
        if (t < 19.0) {
          const ringP = ((t - 16.4) % 1.1) / 1.1;
          data.glbPulseRing.visible = true;
          data.glbPulseRing.scale.setScalar(lerp(0.85, 1.65, easeOutCubic(ringP)));
          (data.glbPulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - ringP) * 0.9;
        } else {
          data.glbPulseRing.visible = false;
        }
      } else {
        data.customGlbMesh.visible = false;
        data.glbPulseRing.visible = false;
      }

      // 3. Selection ring & 0.1m alignment guide lines during Chapter 04 (19.0s – 25.0s)
      if (t >= 19.2 && t < 22.0) {
        const outP = easeInOutCubic(clamp((t - 19.4) / 1.1, 0, 1));
        const backP = easeInOutCubic(clamp((t - 20.85) / 0.9, 0, 1));
        const snappedOffset = Math.round(0.5 * (outP - backP) * 10) / 10;
        const curZ = 1.25 + snappedOffset;
        data.selectionRing.visible = true;
        data.selectionRing.position.set(0, 0.022, curZ);
        data.selectionRing.scale.set(1.55, 0.82, 1);

        data.guideLineX.visible = true;
        data.guideLineX.position.set(0, 0, curZ);
        data.guideLineZ.visible = true;
        data.guideLineZ.position.set(0, 0, 0);
      } else if (t >= 22.2 && t < 24.9) {
        data.selectionRing.visible = true;
        data.selectionRing.position.set(2.9, 0.022, 1.35);
        const pulse = 0.78 + Math.sin((t - 22.2) * 8) * 0.04;
        data.selectionRing.scale.set(pulse, pulse, 1);
        data.guideLineX.visible = false;
        data.guideLineZ.visible = false;
      } else {
        data.selectionRing.visible = false;
        data.guideLineX.visible = false;
        data.guideLineZ.visible = false;
      }

      // 4. 1-Click Brand Wave light bloom flash in Chapter 05
      let flashIntensity = 0;
      for (const pt of paintPulseTimes) {
        if (t >= pt && t < pt + 0.42) {
          const u = (t - pt) / 0.42;
          flashIntensity = Math.max(flashIntensity, Math.sin(u * Math.PI) * 3.2);
        }
      }
      data.paintFlashLight.intensity = flashIntensity;

      // 5. Scale human figures appear from Visitor Eye-Level onward (t >= 34.8s)
      data.scaleFigures.visible = t >= 34.8;

      // 6. Zuki AI Designer Live Lighting Shift: Expo Hall → Dramatic Keynote Spotlight (t >= 40.8s)
      const keynoteMix = easeInOutCubic(clamp((t - 40.8) / 1.4, 0, 1));
      const bgColor = expoBg.clone().lerp(keynoteBg, keynoteMix);
      data.scene.background = bgColor;
      if (data.scene.fog instanceof THREE.Fog) {
        data.scene.fog.color.copy(bgColor);
      }
      data.hallFloorMat.color.copy(expoFloorCol).lerp(keynoteFloorCol, keynoteMix);
      data.hemi.intensity = lerp(0.86, 0.28, keynoteMix);
      data.fillLight.intensity = lerp(0.5, 0.16, keynoteMix);
      data.keyLight.intensity = lerp(1.48, 0.78, keynoteMix);
      data.keyLight.color.copy(expoKeyCol).lerp(keynoteKeyCol, keynoteMix);
      data.warmSpot.intensity = lerp(0, 7.2, keynoteMix);
      data.rimSpot.intensity = lerp(0, 4.4, keynoteMix);
      data.scene.environmentIntensity = lerp(0.6, 0.28, keynoteMix);
      data.renderer.toneMappingExposure = lerp(1.06, 1.18, keynoteMix);

      // 7. Collision-free cinema camera
      const cam = evaluateWalkthroughCamera(t);
      if (Math.abs(data.camera.fov - cam.fov) > 0.01) {
        data.camera.fov = cam.fov;
        data.camera.updateProjectionMatrix();
      }
      data.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
      data.camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);

      data.renderer.render(data.scene, data.camera);
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      disposeObject3D(scene);
      envRT.dispose();
      renderer.dispose();
      sceneDataRef.current = null;
    };
  }, [demoConfig]);

  return <div ref={containerRef} className="wt-stage-canvas" />;
};

interface StudioWalkthroughProps {
  active: boolean;
  config: StandConfig;
  onClose: () => void;
}

export const StudioWalkthrough: React.FC<StudioWalkthroughProps> = ({
  active,
  config,
  onClose,
}) => {
  if (!active) return null;
  return <StudioWalkthroughModal config={config} onClose={onClose} />;
};

const StudioWalkthroughModal: React.FC<{
  config: StandConfig;
  onClose: () => void;
}> = ({ config, onClose }) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [showCaptions, setShowCaptions] = useState(true);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WALKTHROUGH_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);
  const speedRef = useRef<number>(1);
  const lastFrameRef = useRef<number | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);

  // Precompute deterministic item schedule + pricing for live ticking telemetry HUD
  const scheduledTelemetry = useMemo(() => {
    const templateInstance = instantiateTemplate(STAND_TEMPLATES[0]);
    return templateInstance.items.map((item, idx) => ({
      appearAt: getItemSchedule(item, idx).appearAt,
      hirePrice: CATALOG_MAP[item.catalogId]?.priceHire ?? 250,
    }));
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    speedRef.current = SPEED_OPTIONS[speedIdx];
  }, [speedIdx]);

  // Deterministic timeline loop while modal is mounted
  useEffect(() => {
    elapsedRef.current = 0;
    lastFrameRef.current = null;

    let rafId = 0;
    const tick = (now: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = now;
      }
      const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      if (!pausedRef.current) {
        const next = elapsedRef.current + dt * speedRef.current;
        if (next >= TOUR_DURATION_SEC) {
          elapsedRef.current = TOUR_DURATION_SEC;
          setElapsedSec(TOUR_DURATION_SEC);
          setPaused(true);
        } else {
          elapsedRef.current = next;
          setElapsedSec(next);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const seekTo = useCallback((sec: number) => {
    const next = clamp(sec, 0, TOUR_DURATION_SEC);
    elapsedRef.current = next;
    setElapsedSec(next);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (elapsedRef.current >= TOUR_DURATION_SEC - 0.1) {
      seekTo(0);
      setPaused(false);
      return;
    }
    setPaused((p) => !p);
  }, [seekTo]);

  // Keyboard shortcuts while modal is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekTo(elapsedRef.current + 5);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(elapsedRef.current - 5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, seekTo, togglePlayPause]);

  const handleToggleDontShow = (checked: boolean) => {
    setDontShowAgain(checked);
    try {
      localStorage.setItem(WALKTHROUGH_DISMISSED_KEY, checked ? 'true' : 'false');
    } catch {
      // ignore storage quota errors
    }
  };

  const handleScrubPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const bar = scrubberRef.current;
    if (!bar) return;
    const updateFromClientX = (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      seekTo(ratio * TOUR_DURATION_SEC);
    };
    updateFromClientX(e.clientX);

    const onMove = (ev: PointerEvent) => updateFromClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const activeChapter =
    CHAPTERS.find((c) => elapsedSec >= c.startSec && elapsedSec < c.endSec) ||
    CHAPTERS[CHAPTERS.length - 1];

  const accent = config.accentColor || '#D95D39';
  const primary = config.primaryColor || '#1B365D';
  const brandLabel = config.brandName || 'ZUKI STUDIO';
  const progressPct = (elapsedSec / TOUR_DURATION_SEC) * 100;

  // Live ticking telemetry: items placed & real hire budget estimate
  let placedCount = 0;
  let liveEstimate = 1850; // Base 48m² raised oak floor + grid shell
  for (const row of scheduledTelemetry) {
    if (elapsedSec >= row.appearAt) {
      placedCount += 1;
      liveEstimate += row.hirePrice;
    }
  }
  if (elapsedSec >= 16.4) {
    placedCount += 1; // Custom .GLB product drop
  }

  // Subtle 180ms cinema beat-cut flash at chapter cuts
  let cutFlashOpacity = 0;
  for (const ct of CHAPTER_CUT_TIMES) {
    const d = elapsedSec - ct;
    if (d >= 0 && d < 0.18) {
      cutFlashOpacity = Math.max(cutFlashOpacity, (1 - d / 0.18) * 0.22);
    }
  }

  // Animated cursor coordinates during Chapter 04 (19.0s – 25.0s)
  const showCursor = elapsedSec >= 19.1 && elapsedSec < 24.8;
  const cursorDragOut = easeInOutCubic(clamp((elapsedSec - 19.4) / 1.1, 0, 1));
  const cursorDragBack = easeInOutCubic(clamp((elapsedSec - 20.85) / 0.9, 0, 1));
  const cursorMoveToKiosk = easeOutQuint(clamp((elapsedSec - 22.0) / 0.7, 0, 1));
  const cursorX =
    elapsedSec < 22.0
      ? lerp(49, 51, cursorDragOut - cursorDragBack)
      : lerp(51, 61, cursorMoveToKiosk);
  const cursorY =
    elapsedSec < 22.0
      ? lerp(54, 62, cursorDragOut - cursorDragBack)
      : lerp(54, 52, cursorMoveToKiosk);
  const cursorClicking =
    (elapsedSec >= 19.35 && elapsedSec < 21.75) ||
    (elapsedSec >= 22.55 && elapsedSec < 23.1);
  const rKeyPressed = elapsedSec >= 22.65 && elapsedSec < 23.65;

  // Live brand wave active label (Chapter 05: 25.0s – 32.0s)
  const activePaintTarget =
    elapsedSec < 26.8
      ? '3.8m LED Video Wall'
      : elapsedSec < 28.3
        ? 'Twin SEG Lightboxes'
        : elapsedSec < 29.2
          ? 'Architectural Brand Arch'
          : elapsedSec < 30.1
            ? 'Reception Desk & Kiosks'
            : '4.2m 360° Overhead Halo';

  // Active view mode pill in Chapter 06 (32.0s – 38.0s)
  const activeViewTab: '3d' | '2d' | 'visitor' =
    elapsedSec >= 32.0 && elapsedSec < 35.0
      ? '2d'
      : elapsedSec >= 35.0 && elapsedSec < 38.0
        ? 'visitor'
        : '3d';

  // Live typing AI prompt in Chapter 07 (38.2s – 40.6s)
  const aiTypedChars = Math.floor(
    clamp((elapsedSec - 38.2) / 2.3, 0, 1) * AI_PROMPT_TEXT.length
  );
  const aiPromptTyped = AI_PROMPT_TEXT.slice(0, aiTypedChars);
  const keynoteActive = elapsedSec >= 40.8;

  // Grand Finale End-Slate (45.0s – 48.0s)
  const showFinaleSlate = elapsedSec >= 45.0;

  return (
    <div
      className="wt-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Zuki Studio 48-Second Interactive 3D Product Film"
      onClick={onClose}
    >
      <div className="wt-modal-shell" onClick={(e) => e.stopPropagation()}>
        {/* Sleek Cinema Header */}
        <header className="wt-modal-header">
          <div className="wt-header-left">
            <span className="wt-studio-badge" style={{ background: accent }}>
              ZUKI FILM
            </span>
            <h2 className="wt-modal-title">Zuki Exhibition Planner · Interactive 3D Showcase</h2>
            <span className="wt-duration-chip mono-num">0:48 · 8 Beats</span>
          </div>
          <button
            type="button"
            className="wt-close-btn"
            onClick={onClose}
            aria-label="Close walkthrough"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </header>

        {/* Main Split Body: 16:9 Live 3D Cinema Stage + Interactive Beat Rail */}
        <div className="wt-modal-body">
          <div className="wt-stage-column">
            <div className="wt-stage-frame" onClick={togglePlayPause}>
              <WalkthroughStage3D elapsedSec={elapsedSec} brandConfig={config} />

              {/* Subtle Cinema Beat-Cut Flash */}
              {cutFlashOpacity > 0.005 && (
                <div
                  className="wt-cut-flash"
                  style={{ opacity: cutFlashOpacity }}
                  aria-hidden="true"
                />
              )}

              {/* Crisp Opening Hook Title (0.0s – 2.1s, light glass so 3D floor stays vivid!) */}
              {elapsedSec < 2.1 && (
                <div className="wt-title-slate wt-hook-slate" aria-hidden="true">
                  <span className="wt-slate-kicker mono-num">ZUKI STUDIO · ZUKISTUDIO.CO.UK</span>
                  <h3 className="wt-slate-heading">From Blank Floor to Flagship in 48 Seconds</h3>
                  <div className="wt-hook-pills mono-num">
                    <span>8m × 6m · 48 m²</span>
                    <span>4 Open Sides</span>
                    <span>0.1m Live Grid</span>
                  </div>
                </div>
              )}

              {/* Live Ticking Telemetry Bar (Top-Left, 1.4s – 45.0s) */}
              {elapsedSec >= 1.4 && !showFinaleSlate && (
                <div className="wt-telemetry-bar mono-num">
                  <span className="wt-tel-item">
                    <CheckCircle2 size={12} className="wt-ok" />
                    <strong>48 m²</strong>
                  </span>
                  <span className="wt-tel-sep" />
                  <span className="wt-tel-item">
                    <Layers size={12} />
                    <strong>{placedCount}</strong> items
                  </span>
                  <span className="wt-tel-sep" />
                  <span className="wt-tel-item">
                    <strong>£{liveEstimate.toLocaleString('en-GB')}</strong> est.
                  </span>
                </div>
              )}

              {/* Top-Right Active Beat Pill */}
              <div className="wt-stage-badge mono-num">
                <span className="wt-live-dot" style={{ background: accent }} />
                {activeChapter.number}/08 · {activeChapter.headline.toUpperCase()}
              </div>

              {/* CH 02 Rapid Architecture Feed (4.5s – 12.0s) */}
              {elapsedSec >= 4.5 && elapsedSec < 12.0 && (
                <div className="wt-sim-panel left compact">
                  <div className="wt-sim-panel-head">
                    <Zap size={12} />
                    <span>Live Modular Assembly</span>
                  </div>
                  {[
                    { label: 'Overhead Truss Rig', at: 4.7 },
                    { label: 'Twin SEG Lightboxes', at: 5.5 },
                    { label: '5.4m Brand Arch', at: 7.0 },
                    { label: 'Illuminated Totems', at: 7.9 },
                    { label: '4.2m 360° Halo', at: 9.4 },
                  ].map((row) => {
                    const placed = elapsedSec >= row.at;
                    return (
                      <div key={row.label} className={`wt-sim-row ${placed ? 'done' : 'pending'}`}>
                        <span>{row.label}</span>
                        {placed ? (
                          <Check size={12} className="wt-ok" />
                        ) : (
                          <span className="mono-num wt-dim">…</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* CH 03 Custom .GLB Spotlight Callout (16.1s – 19.0s) */}
              {elapsedSec >= 16.1 && elapsedSec < 19.0 && (
                <div className="wt-hud-float bottom-left accent">
                  <Upload size={13} />
                  <span>
                    Custom 3D Drop · <strong>flagship-product.glb</strong>{' '}
                    <span className="wt-dim">(.GLB / .STL / .OBJ)</span>
                  </span>
                </div>
              )}

              {/* CH 04 Live Studio Cursor + R Keycap Pop + Right Inspector (19.0s – 25.0s) */}
              {showCursor && (
                <div
                  className={`wt-sim-cursor ${cursorClicking ? 'clicking' : ''}`}
                  style={{ left: `${cursorX}%`, top: `${cursorY}%` }}
                  aria-hidden="true"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 3L19.5 11.2L12.6 13.4L9.8 20.5L4 3Z"
                      fill="#FFFFFF"
                      stroke="#0F172A"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {cursorClicking && <span className="wt-cursor-ripple" />}
                </div>
              )}

              {elapsedSec >= 19.0 && elapsedSec < 25.0 && (
                <div className="wt-sim-panel right compact">
                  <div className="wt-sim-panel-head">
                    {elapsedSec < 22.0 ? <Move size={12} /> : <RotateCw size={12} />}
                    <span>{elapsedSec < 22.0 ? '0.1m Grid Snap' : 'Rotate & Inspector'}</span>
                  </div>
                  {elapsedSec < 22.0 ? (
                    <>
                      <div className="wt-sim-row done">
                        <span>Target</span>
                        <strong>Reception Desk</strong>
                      </div>
                      <div className="wt-sim-row done">
                        <span>Snap Z</span>
                        <span className="mono-num">
                          +
                          {(
                            Math.round(
                              0.5 * (cursorDragOut - cursorDragBack) * 10
                            ) / 10
                          ).toFixed(1)}
                          m
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="wt-sim-row done">
                        <span>Target</span>
                        <strong>East Demo Kiosk</strong>
                      </div>
                      <div className="wt-sim-row done">
                        <span>Rotate 90°</span>
                        <kbd className={`wt-kbd ${rKeyPressed ? 'pressed' : ''}`}>R</kbd>
                      </div>
                      <div className="wt-sim-row done">
                        <span>Angle Y</span>
                        <span className="mono-num">
                          {Math.round(
                            lerp(-55, 35, clamp((elapsedSec - 22.7) / 0.85, 0, 1))
                          )}
                          °
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* CH 05 1-Click Brand Wave HUD (25.0s – 32.0s) */}
              {elapsedSec >= 25.0 && elapsedSec < 32.0 && (
                <div className="wt-hud-float bottom-left accent wt-brand-wave-pill">
                  <Paintbrush size={13} />
                  <span className="wt-swatch-pair">
                    <span className="wt-swatch" style={{ background: primary }} />
                    <span className="wt-swatch" style={{ background: accent }} />
                  </span>
                  <span>
                    1-Click Brand Wave · <strong>{activePaintTarget}</strong>
                  </span>
                </div>
              )}

              {/* CH 06 3D -> 2D Blueprint -> Visitor Eye-Level Switcher (32.0s – 38.0s) */}
              {elapsedSec >= 32.0 && elapsedSec < 38.0 && (
                <>
                  <div className="wt-view-switcher">
                    <span className={activeViewTab === '3d' ? 'active' : ''}>
                      <Compass size={12} /> 3D Studio
                    </span>
                    <span className={activeViewTab === '2d' ? 'active' : ''}>
                      <Grid size={12} /> 2D Blueprint
                    </span>
                    <span className={activeViewTab === 'visitor' ? 'active' : ''}>
                      <Eye size={12} /> Visitor 1:1
                    </span>
                  </div>
                  {activeViewTab === '2d' && (
                    <div className="wt-hud-float bottom-left compliance">
                      <CheckCircle2 size={14} className="wt-ok" />
                      <span className="mono-num">
                        ✓ 48 m² · Within Bounds · 1.4m Aisle Clear
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* CH 07 Zuki AI Designer Live Typing Prompt & Keynote Badge (38.0s – 44.0s) */}
              {elapsedSec >= 38.0 && elapsedSec < 44.0 && (
                <div className="wt-ai-floating-box">
                  <div className="wt-ai-floating-head">
                    <Sparkles size={13} style={{ color: accent }} />
                    <span>Zuki AI Designer</span>
                    <span className={`wt-light-badge mono-num ${keynoteActive ? 'keynote' : ''}`}>
                      {keynoteActive ? '✦ Keynote Spotlight' : 'Expo Hall'}
                    </span>
                  </div>
                  <div className="wt-ai-prompt-pill">
                    “{aiPromptTyped}
                    {aiTypedChars < AI_PROMPT_TEXT.length && (
                      <span className="wt-typing-caret" />
                    )}
                    ”
                  </div>
                </div>
              )}

              {/* CH 08 Grand Hero Finale End-Slate (45.0s – 48.0s) */}
              {showFinaleSlate && (
                <div
                  className="wt-finale-slate"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="wt-finale-brand mono-num">
                    ZUKI STUDIO · ZUKISTUDIO.CO.UK
                  </div>
                  <h3 className="wt-finale-title">
                    {brandLabel} Pavilion Ready for Production
                  </h3>
                  <div className="wt-finale-pills mono-num">
                    <span>
                      <Download size={11} /> 1600px Studio PNG
                    </span>
                    <span>
                      <CheckCircle2 size={11} className="wt-ok" /> Print-Ready Brief
                    </span>
                    <span>
                      <Zap size={11} /> Instant BOM
                    </span>
                  </div>
                  <div className="wt-finale-actions">
                    <button
                      type="button"
                      className="wt-finale-cta"
                      style={{ background: accent }}
                      onClick={onClose}
                    >
                      <span>Start Designing Now</span>
                      <ArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      className="wt-finale-replay"
                      onClick={() => {
                        seekTo(0);
                        setPaused(false);
                      }}
                    >
                      <RotateCcw size={13} />
                      <span>Replay 0:48</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Crisp 1-Line Kinetic Captions (hidden during opening 2.1s & finale slate) */}
              {showCaptions && elapsedSec >= 2.1 && !showFinaleSlate && (
                <div className="wt-caption-bar" key={activeChapter.id}>
                  <span>{activeChapter.caption}</span>
                </div>
              )}

              {/* Center Play Indicator when Paused (unless finale slate is active) */}
              {paused && !showFinaleSlate && (
                <div className="wt-paused-center" aria-hidden="true">
                  <div className="wt-paused-circle">
                    <Play size={26} />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Cinema Transport Controls */}
            <div className="wt-transport">
              <div
                ref={scrubberRef}
                className="wt-scrubber"
                onPointerDown={handleScrubPointer}
                role="slider"
                aria-label="Walkthrough timeline"
                aria-valuemin={0}
                aria-valuemax={TOUR_DURATION_SEC}
                aria-valuenow={Math.round(elapsedSec)}
              >
                <div className="wt-scrubber-track">
                  <div
                    className="wt-scrubber-fill"
                    style={{ width: `${progressPct}%`, background: accent }}
                  />
                  {CHAPTERS.slice(1).map((ch) => (
                    <span
                      key={ch.id}
                      className="wt-scrubber-tick"
                      style={{ left: `${(ch.startSec / TOUR_DURATION_SEC) * 100}%` }}
                      title={`${ch.number}. ${ch.title} (${formatClock(ch.startSec)})`}
                    />
                  ))}
                  <div
                    className="wt-scrubber-thumb"
                    style={{ left: `${progressPct}%`, borderColor: accent }}
                  />
                </div>
              </div>

              <div className="wt-controls-row">
                <div className="wt-controls-left">
                  <button
                    type="button"
                    className="wt-ctrl-btn primary"
                    onClick={togglePlayPause}
                    title={paused ? 'Play (Space)' : 'Pause (Space)'}
                    aria-label={paused ? 'Play' : 'Pause'}
                  >
                    {paused ? <Play size={15} /> : <Pause size={15} />}
                  </button>
                  <button
                    type="button"
                    className="wt-ctrl-btn"
                    onClick={() => seekTo(elapsedSec - 5)}
                    title="Back 5s (←)"
                    aria-label="Back 5 seconds"
                  >
                    <SkipBack size={14} />
                  </button>
                  <button
                    type="button"
                    className="wt-ctrl-btn"
                    onClick={() => seekTo(elapsedSec + 5)}
                    title="Forward 5s (→)"
                    aria-label="Forward 5 seconds"
                  >
                    <SkipForward size={14} />
                  </button>
                  <button
                    type="button"
                    className="wt-ctrl-btn"
                    onClick={() => {
                      seekTo(0);
                      setPaused(false);
                    }}
                    title="Replay from start"
                    aria-label="Replay"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <span className="wt-timecode mono-num">
                    {formatClock(elapsedSec)}{' '}
                    <span className="wt-dim">/ {formatClock(TOUR_DURATION_SEC)}</span>
                  </span>
                </div>

                <div className="wt-controls-right">
                  <button
                    type="button"
                    className={`wt-ctrl-pill mono-num ${showCaptions ? 'active' : ''}`}
                    onClick={() => setShowCaptions((c) => !c)}
                    title="Toggle captions"
                  >
                    <Subtitles size={13} />
                    <span>CC</span>
                  </button>
                  <button
                    type="button"
                    className="wt-ctrl-pill mono-num"
                    onClick={() => setSpeedIdx((i) => (i + 1) % SPEED_OPTIONS.length)}
                    title="Playback speed (1×, 1.25×, 1.5×)"
                  >
                    {SPEED_OPTIONS[speedIdx]}×
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Interactive Chapter Rail */}
          <aside className="wt-syllabus" aria-label="Walkthrough beats">
            <div className="wt-syllabus-head">
              <span className="mono-num">SHOWCASE BEATS</span>
              <span className="mono-num wt-dim">
                {activeChapter.number} / {String(CHAPTERS.length).padStart(2, '0')}
              </span>
            </div>
            <div className="wt-syllabus-list">
              {CHAPTERS.map((ch) => {
                const isCurrent = ch.id === activeChapter.id;
                const isDone = elapsedSec >= ch.endSec;
                const chPct = isCurrent
                  ? clamp(((elapsedSec - ch.startSec) / (ch.endSec - ch.startSec)) * 100, 0, 100)
                  : isDone
                    ? 100
                    : 0;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={`wt-chapter-item ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
                    onClick={() => {
                      seekTo(ch.startSec + 0.05);
                      setPaused(false);
                    }}
                  >
                    <div className="wt-chapter-top">
                      <span className="wt-chapter-num mono-num">
                        {isDone ? <Check size={11} /> : ch.number}
                      </span>
                      <span className="wt-chapter-title">{ch.title}</span>
                      <span className="wt-chapter-time mono-num">{formatClock(ch.startSec)}</span>
                    </div>
                    <p className="wt-chapter-desc">{ch.shortDesc}</p>
                    <div className="wt-chapter-bar">
                      <div
                        className="wt-chapter-bar-fill"
                        style={{
                          width: `${chPct}%`,
                          background: isCurrent ? accent : undefined,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>

        {/* Modal Footer */}
        <footer className="wt-modal-footer">
          <label className="wt-dont-show">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleToggleDontShow(e.target.checked)}
            />
            <span>Don’t show automatically when creating a new design</span>
          </label>

          <div className="wt-footer-actions">
            <button type="button" className="wt-btn-secondary" onClick={onClose}>
              Skip
            </button>
            <button
              type="button"
              className="wt-btn-primary"
              style={{ background: accent }}
              onClick={onClose}
            >
              Start Designing
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
