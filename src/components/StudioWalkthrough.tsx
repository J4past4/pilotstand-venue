import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
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
} from 'lucide-react';
import type { StandConfig, StandItem } from '../types/stand';
import { STAND_TEMPLATES, instantiateTemplate } from '../data/templates';
import { BUILTIN_BRAND_ASSETS } from '../data/palettes';
import { buildBoothShell, buildScaleFigures, buildStandItemMesh } from '../engine/meshFactory';

export const TOUR_DURATION_SEC = 150; // 2:30 calm, Adobe-standard build-from-scratch walkthrough
export const WALKTHROUGH_DISMISSED_KEY = 'zuki_walkthrough_dismissed_v1';

interface WalkthroughChapter {
  id: string;
  number: string;
  title: string;
  shortDesc: string;
  startSec: number;
  endSec: number;
  caption: string;
  secondaryCaption?: { atOffset: number; text: string };
}

const CHAPTERS: WalkthroughChapter[] = [
  {
    id: 'empty-floor',
    number: '01',
    title: 'Booth Footprint & Scale',
    shortDesc: 'Set dimensions, open aisles & compliance grid',
    startSec: 0,
    endSec: 16,
    caption:
      'Every project begins with an accurate, venue-compliant booth floor—here an 8m × 6m four-sided island pavilion.',
    secondaryCaption: {
      atOffset: 8,
      text: 'Live floor gridlines, aisle indicators, and rigging limits keep every placement build-ready from frame one.',
    },
  },
  {
    id: 'brand-upload',
    number: '02',
    title: 'Uploading Brand & Media',
    shortDesc: 'Import logo, colours & campaign artwork',
    startSec: 16,
    endSec: 36,
    caption:
      'Upload your logo, pick your brand palette, and drop in campaign graphics once in the Brand Media Library.',
    secondaryCaption: {
      atOffset: 10,
      text: 'Your colours and uploaded artwork stay ready in the sidebar to dress walls, lightboxes, and counters in one click.',
    },
  },
  {
    id: 'core-structure',
    number: '03',
    title: 'Placing Core Architecture',
    shortDesc: 'Drag walls, LED screen, lightboxes & halo',
    startSec: 36,
    endSec: 58,
    caption:
      'Drag modular architecture from the Catalog onto the floor—starting with the Central Brand Tower and 3.8m LED Video Wall.',
    secondaryCaption: {
      atOffset: 11,
      text: 'Add twin SEG backlit lightboxes, an Architectural Brand Arch, and a 4.2m suspended 360° overhead halo.',
    },
  },
  {
    id: 'furniture-and-3d',
    number: '04',
    title: 'Furniture & Custom 3D Drops',
    shortDesc: 'Add lounges, kiosks & your own .GLB models',
    startSec: 58,
    endSec: 78,
    caption:
      'Build out visitor zones with reception counters, VIP lounge seating, executive meeting suites, and interactive kiosks.',
    secondaryCaption: {
      atOffset: 11,
      text: 'Need a real product on a plinth? Drop your own .GLB, .STL, or .OBJ 3D file straight onto the stand floor.',
    },
  },
  {
    id: 'move-rotate-inspect',
    number: '05',
    title: 'Moving, Rotating & Precision',
    shortDesc: 'Drag on grid, press R to rotate, edit specs',
    startSec: 78,
    endSec: 98,
    caption:
      'Click any element to drag it smoothly along the 0.1m snap grid with live spacing feedback.',
    secondaryCaption: {
      atOffset: 10,
      text: 'Press R to rotate kiosks toward approaching aisles, or dial exact dimensions in the Right Inspector.',
    },
  },
  {
    id: 'surface-painting',
    number: '06',
    title: '1-Click Surface Painting',
    shortDesc: 'Apply backlit artwork directly to 3D faces',
    startSec: 98,
    endSec: 116,
    caption:
      'Select any graphic from your Brand Library and click a 3D face to paint seamless, backlit artwork immediately.',
    secondaryCaption: {
      atOffset: 9,
      text: 'LED walls, SEG lightboxes, arch fascias, and reception counters update live with accurate glow and scale.',
    },
  },
  {
    id: 'view-modes',
    number: '07',
    title: '3D, 2D Plan & Visitor Views',
    shortDesc: 'Verify blueprint spacing & eye-level impact',
    startSec: 116,
    endSec: 134,
    caption:
      'Switch effortlessly between 3D Studio and Orthographic 2D Floor Plan to verify aisle clearances and compliance.',
    secondaryCaption: {
      atOffset: 10,
      text: 'Drop into Visitor Eye-Level View with 1:1 scale figures to experience your pavilion as attendees will.',
    },
  },
  {
    id: 'ai-and-export',
    number: '08',
    title: 'AI Designer & Studio Export',
    shortDesc: 'Restyle by prompt & export client briefs',
    startSec: 134,
    endSec: 150,
    caption:
      'Use the AI Stand Designer by chat or voice to adjust lighting, swap layouts, or explore fresh concepts in seconds.',
    secondaryCaption: {
      atOffset: 8,
      text: 'When ready, export crisp 1600px studio PNGs and print-ready Exhibition Production Briefs. Your workspace is ready.',
    },
  },
];

const SPEED_OPTIONS = [1, 1.25, 1.5, 0.75] as const;

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

function easeInOutCubic(x: number): number {
  const t = clamp(x, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBack(x: number): number {
  const t = clamp(x, 0, 1);
  const c1 = 1.35;
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
  unpaintedGroup: THREE.Group;
  paintedGroup: THREE.Group | null;
}

/**
 * Deterministic timeline timing for each catalog item so the stand builds
 * cleanly from a bare floor to a complete architectural flagship.
 */
function getItemSchedule(item: StandItem, index: number): {
  appearAt: number;
  appearDuration: number;
  isOverhead: boolean;
  paintAt: number | null;
} {
  switch (item.catalogId) {
    case 'storage-cabin':
      return { appearAt: 37.5, appearDuration: 1.4, isOverhead: false, paintAt: 109.0 };
    case 'led-video-wall':
      return { appearAt: 40.5, appearDuration: 1.5, isOverhead: false, paintAt: 100.5 };
    case 'truss-rig':
      return { appearAt: 42.2, appearDuration: 1.4, isOverhead: true, paintAt: null };
    case 'seg-lightbox':
      return {
        appearAt: item.x < 0 ? 45.0 : 46.8,
        appearDuration: 1.4,
        isOverhead: false,
        paintAt: item.x < 0 ? 104.2 : 105.6,
      };
    case 'front-arch':
      return { appearAt: 49.2, appearDuration: 1.6, isOverhead: false, paintAt: 108.5 };
    case 'brand-totem':
      return {
        appearAt: item.x < 0 ? 51.4 : 52.4,
        appearDuration: 1.2,
        isOverhead: false,
        paintAt: 109.8,
      };
    case 'hanging-ring':
      return { appearAt: 53.8, appearDuration: 2.0, isOverhead: true, paintAt: 112.2 };
    case 'reception-desk':
      return { appearAt: 59.5, appearDuration: 1.3, isOverhead: false, paintAt: 110.6 };
    case 'display-plinth':
      return {
        appearAt: item.x < 0 ? 61.2 : 62.0,
        appearDuration: 1.1,
        isOverhead: false,
        paintAt: 111.2,
      };
    case 'lounge-sofa':
      return { appearAt: 63.4, appearDuration: 1.2, isOverhead: false, paintAt: null };
    case 'coffee-table':
      return { appearAt: 64.4, appearDuration: 1.0, isOverhead: false, paintAt: null };
    case 'meeting-table':
      return { appearAt: 65.4, appearDuration: 1.2, isOverhead: false, paintAt: null };
    case 'meeting-chair':
      return {
        appearAt: 66.2 + (index % 4) * 0.35,
        appearDuration: 0.9,
        isOverhead: false,
        paintAt: null,
      };
    case 'demo-kiosk':
      return {
        appearAt: item.x < 0 ? 67.8 : 68.6,
        appearDuration: 1.1,
        isOverhead: false,
        paintAt: 111.6,
      };
    default:
      return {
        appearAt: 69.2 + (index % 6) * 0.35,
        appearDuration: 0.95,
        isOverhead: false,
        paintAt: item.catalogId === 'tv-stand' ? 107.0 : null,
      };
  }
}

/**
 * Assign rich built-in brand artwork for the painted state in Chapter 06.
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
 * Compute smooth, 100% collision-free camera position, target, and FOV
 * for any timestamp `t` in [0, 150].
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

  // Ch 1 (0–16): Empty floor establishing orbit
  if (t < 16) {
    const u = easeInOutCubic(t / 16);
    return {
      pos: perimeterPos(lerp(44, 24, u), lerp(5.1, 4.6, u), lerp(4.9, 4.1, u)),
      target: [0, lerp(0.4, 0.7, u), 0],
      fov: 42,
    };
  }

  // Ch 2 (16–36): Brand & Media Upload (camera holds gracefully to the right-front so left upload drawer is balanced)
  if (t < 36) {
    const u = easeInOutCubic((t - 16) / 20);
    return {
      pos: perimeterPos(lerp(24, 12, u), lerp(4.6, 4.4, u), lerp(4.1, 3.8, u)),
      target: [lerp(-0.6, -0.3, u), 0.9, 0],
      fov: 41,
    };
  }

  // Ch 3 (36–58): Core Structure dropping in (calm wide 3/4 sweep)
  if (t < 58) {
    const u = easeInOutCubic((t - 36) / 22);
    return {
      pos: perimeterPos(lerp(12, 46, u), lerp(4.4, 5.1, u), lerp(3.8, 4.5, u)),
      target: [0, lerp(1.1, 1.55, u), -0.2],
      fov: 42,
    };
  }

  // Ch 4 (58–78): Furniture & Custom 3D .GLB drop (sweeps across front to west plinth)
  if (t < 78) {
    const u = easeInOutCubic((t - 58) / 20);
    const focusPlinth = clamp((t - 70) / 6, 0, 1);
    const pu = easeInOutCubic(focusPlinth);
    const az = lerp(46, -34, u);
    const margin = lerp(5.0, 3.6, pu);
    const y = lerp(4.4, 2.55, pu);
    return {
      pos: perimeterPos(az, margin, y),
      target: [lerp(0, -1.65, pu), lerp(1.35, 1.15, pu), lerp(0, 0.95, pu)],
      fov: lerp(42, 36, pu),
    };
  }

  // Ch 5 (78–98): Move Reception Counter & Rotate East Kiosk (clear front-right elevated framing)
  if (t < 98) {
    const u = easeInOutCubic((t - 78) / 20);
    const toKiosk = easeInOutCubic(clamp((t - 88) / 5, 0, 1));
    const az = lerp(-18, 36, u);
    return {
      pos: perimeterPos(az, lerp(3.8, 3.4, toKiosk), lerp(3.15, 2.85, toKiosk)),
      target: [lerp(0, 1.9, toKiosk), lerp(0.85, 0.95, toKiosk), lerp(1.25, 1.15, toKiosk)],
      fov: lerp(38, 36, toKiosk),
    };
  }

  // Ch 6 (98–116): 1-Click Surface Painting (telephoto front framing outside the Brand Arch!)
  if (t < 116) {
    const u = easeInOutCubic((t - 98) / 18);
    return {
      pos: perimeterPos(lerp(-14, 16, u), 4.0, lerp(2.25, 2.45, u)),
      target: [0, 1.65, -0.5],
      fov: 34,
    };
  }

  // Ch 7 (116–134): Views — 3D (116–121) -> 2D Floor Plan (121–128) -> Visitor Eye-Level (128–134)
  if (t < 121) {
    const u = easeInOutCubic((t - 116) / 5);
    return {
      pos: perimeterPos(lerp(16, 38, u), lerp(4.0, 4.9, u), lerp(2.45, 4.6, u)),
      target: [0, lerp(1.65, 1.1, u), 0],
      fov: lerp(34, 42, u),
    };
  }
  if (t < 128) {
    // Smooth crane up to crisp top-down 2D Floor Plan
    const enter = easeOutCubic(clamp((t - 121) / 2.2, 0, 1));
    const startPos = perimeterPos(38, 4.9, 4.6);
    const topPos: [number, number, number] = [0, 12.6, 0.35];
    return {
      pos: [
        lerp(startPos[0], topPos[0], enter),
        lerp(startPos[1], topPos[1], enter),
        lerp(startPos[2], topPos[2], enter),
      ],
      target: [0, lerp(1.1, 0, enter), 0],
      fov: lerp(42, 38, enter),
    };
  }
  if (t < 134) {
    // Smooth drop into Visitor Eye-Level arrival (safely outside front aisle at z ≈ 6.7m)
    const enter = easeOutCubic(clamp((t - 128) / 2.2, 0, 1));
    const drift = clamp((t - 130.2) / 3.8, 0, 1);
    const eyePos = perimeterPos(lerp(-10, 4, drift), lerp(3.9, 3.3, drift), 1.68);
    return {
      pos: [
        lerp(0, eyePos[0], enter),
        lerp(12.6, eyePos[1], enter),
        lerp(0.35, eyePos[2], enter),
      ],
      target: [0, lerp(0, 1.42, enter), lerp(0, 0.2, enter)],
      fov: lerp(38, 40, enter),
    };
  }

  // Ch 8 (134–150): AI Designer lighting & Final Hero Export Orbit
  const u = easeInOutCubic((t - 134) / 16);
  return {
    pos: perimeterPos(lerp(4, 42, u), lerp(3.8, 5.2, u), lerp(2.6, 4.6, u)),
    target: [0, lerp(1.4, 1.2, u), 0],
    fov: lerp(40, 42, u),
  };
}

/**
 * Self-contained Three.js PBR 3D stage rendered inside the 16:9 walkthrough modal.
 * Every visual element is a deterministic function of `elapsedSec` so scrubbing,
 * pausing, speed changes, and chapter jumps are 100% frame-accurate.
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
    selectionRing: THREE.Mesh;
    scaleFigures: THREE.Group;
    warmSpot: THREE.SpotLight;
    keyLight: THREE.DirectionalLight;
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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#E6E9EF');
    scene.fog = new THREE.Fog('#E6E9EF', 20, 50);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.58;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);

    // Studio Lighting
    const hemi = new THREE.HemisphereLight('#FFFFFF', '#CBD5E1', 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#FFFBF5', 1.45);
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

    const fillLight = new THREE.DirectionalLight('#DCE7F7', 0.48);
    fillLight.position.set(-7, 7, -6);
    scene.add(fillLight);

    // Warm gallery spotlight triggered in Chapter 08 (AI Designer)
    const warmSpot = new THREE.SpotLight('#FFCE96', 0, 22, Math.PI / 4, 0.55, 1.2);
    warmSpot.position.set(0, 7.2, 4.5);
    warmSpot.target.position.set(0, 1.2, 0);
    scene.add(warmSpot, warmSpot.target);

    // Hall Floor
    const hallFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: '#DDE1E8', roughness: 0.92, metalness: 0.02 })
    );
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.y = -0.048;
    hallFloor.receiveShadow = true;
    scene.add(hallFloor);

    // Build Booth Floor & Grid
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

    // Build all Flagship Pavilion items (unpainted + painted variants for Ch 06)
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
        unpaintedGroup,
        paintedGroup,
      });
    });

    // Sculptural custom .GLB product centerpiece that drops onto the left plinth at t = 71s
    const customGlbMesh = new THREE.Group();
    const coreMat = new THREE.MeshStandardMaterial({
      color: demoConfig.accentColor || '#D95D39',
      metalness: 0.72,
      roughness: 0.22,
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#E2E8F0',
      metalness: 0.88,
      roughness: 0.16,
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.08, 24), ringMat);
    pedestal.position.y = 0.04;
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.16, 0.048, 72, 16), coreMat);
    knot.position.y = 0.34;
    knot.castShadow = true;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.012, 12, 36), ringMat);
    halo.position.y = 0.34;
    halo.rotation.x = Math.PI / 3;
    customGlbMesh.add(pedestal, knot, halo);
    customGlbMesh.position.set(-1.85, 1.08, 1.05);
    customGlbMesh.visible = false;
    scene.add(customGlbMesh);

    // Selection highlight ring for Chapter 05 (Moving & Rotating)
    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.86, 48),
      new THREE.MeshBasicMaterial({
        color: '#0EA5E9',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      })
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.018;
    selectionRing.visible = false;
    scene.add(selectionRing);

    // Scale human figures (appear during Visitor View & final showcase)
    const scaleFigures = buildScaleFigures(demoConfig);
    scaleFigures.visible = false;
    scene.add(scaleFigures);

    sceneDataRef.current = {
      renderer,
      scene,
      camera,
      entries,
      customGlbMesh,
      selectionRing,
      scaleFigures,
      warmSpot,
      keyLight,
    };

    const resizeObserver = new ResizeObserver((obsEntries) => {
      const rect = obsEntries[0]?.contentRect;
      if (!rect || rect.width < 10 || rect.height < 10) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    });
    resizeObserver.observe(container);

    // Continuous render loop synced to elapsedRef
    let rafId = 0;
    const renderFrame = () => {
      const data = sceneDataRef.current;
      if (!data) return;
      const t = elapsedRef.current;

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
            ? lerp(entry.item.y + 2.4, entry.item.y, easeOutCubic(dropT))
            : lerp(entry.item.y + 1.35, entry.item.y, easeOutCubic(dropT));
        }

        // Chapter 05 live manipulation:
        // Drag Reception Counter forward on grid (80s -> 84s) then glide back smoothly (85.5s -> 88s)
        if (entry.item.catalogId === 'reception-desk' && t >= 80 && t < 88.5) {
          const outP = easeInOutCubic(clamp((t - 80) / 3.6, 0, 1));
          const backP = easeInOutCubic(clamp((t - 85.2) / 2.8, 0, 1));
          posZ = entry.item.z + 0.48 * (outP - backP);
        }

        // Rotate East Demo Kiosk toward visitor aisle (90s -> 96s)
        if (entry.item.catalogId === 'demo-kiosk' && entry.item.x > 0 && t >= 89.5) {
          const rotP = easeInOutCubic(clamp((t - 90.0) / 4.2, 0, 1));
          const extraDeg = lerp(0, 42, rotP);
          rotRad = ((entry.item.rotationY + extraDeg) * Math.PI) / 180;
        }

        const scaleVal = isVisible ? clamp(dropEase, 0.01, 1.02) : 0.001;
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

      // 2. Custom .GLB drop onto left plinth at t = 71s
      if (t >= 71.0) {
        const glbT = clamp((t - 71.0) / 1.4, 0, 1);
        data.customGlbMesh.visible = true;
        data.customGlbMesh.position.set(-1.85, lerp(2.2, 1.08, easeOutCubic(glbT)), 1.05);
        data.customGlbMesh.scale.setScalar(clamp(easeOutBack(glbT), 0.01, 1.04));
        data.customGlbMesh.rotation.y = (t - 71.0) * 0.65;
      } else {
        data.customGlbMesh.visible = false;
      }

      // 3. Selection ring during Chapter 05 (Moving & Rotating)
      if (t >= 79.2 && t < 88.5) {
        const outP = easeInOutCubic(clamp((t - 80) / 3.6, 0, 1));
        const backP = easeInOutCubic(clamp((t - 85.2) / 2.8, 0, 1));
        data.selectionRing.visible = true;
        data.selectionRing.position.set(0, 0.02, 1.25 + 0.48 * (outP - backP));
        data.selectionRing.scale.set(1.55, 0.82, 1);
      } else if (t >= 89.2 && t < 97.5) {
        data.selectionRing.visible = true;
        data.selectionRing.position.set(2.9, 0.02, 1.35);
        data.selectionRing.scale.set(0.76, 0.76, 1);
      } else {
        data.selectionRing.visible = false;
      }

      // 4. Scale human figures appear from Visitor View onward (t >= 127.5s)
      data.scaleFigures.visible = t >= 127.5;

      // 5. AI Designer warm gallery lighting shift in Chapter 08 (t >= 137.5s)
      const warmMix = easeInOutCubic(clamp((t - 137.5) / 2.8, 0, 1));
      data.warmSpot.intensity = lerp(0, 3.6, warmMix);
      data.keyLight.color.set(warmMix > 0.5 ? '#FFF3E0' : '#FFFBF5');

      // 6. Update collision-free camera
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
        seekTo(elapsedRef.current + 10);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(elapsedRef.current - 10);
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
  const chapterElapsed = elapsedSec - activeChapter.startSec;
  const activeCaption =
    activeChapter.secondaryCaption && chapterElapsed >= activeChapter.secondaryCaption.atOffset
      ? activeChapter.secondaryCaption.text
      : activeChapter.caption;

  const accent = config.accentColor || '#D95D39';
  const primary = config.primaryColor || '#1B365D';
  const brandLabel = config.brandName || 'ZUKI STUDIO';
  const progressPct = (elapsedSec / TOUR_DURATION_SEC) * 100;

  // Determine active view mode badge in Chapter 07
  const activeViewTab: '3d' | '2d' | 'visitor' =
    elapsedSec >= 121 && elapsedSec < 128
      ? '2d'
      : elapsedSec >= 128 && elapsedSec < 134
        ? 'visitor'
        : '3d';

  return (
    <div
      className="wt-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Zuki Studio Guided Walkthrough Video"
      onClick={onClose}
    >
      <div className="wt-modal-shell" onClick={(e) => e.stopPropagation()}>
        {/* Top Adobe-Style Cinema Header */}
        <header className="wt-modal-header">
          <div className="wt-header-left">
            <span className="wt-studio-badge" style={{ background: accent }}>
              WALKTHROUGH
            </span>
            <h2 className="wt-modal-title">Build an Exhibition Stand from Scratch</h2>
            <span className="wt-duration-chip mono-num">2:30 · 8 Chapters</span>
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

        {/* Main Split Body: 16:9 Live 3D Cinema Stage + Chapter Syllabus */}
        <div className="wt-modal-body">
          <div className="wt-stage-column">
            <div className="wt-stage-frame" onClick={togglePlayPause}>
              <WalkthroughStage3D elapsedSec={elapsedSec} brandConfig={config} />

              {/* Chapter 01 Opening Title Slate (0:00 – 0:06.5) */}
              {elapsedSec < 6.5 && (
                <div className="wt-title-slate" aria-hidden="true">
                  <span className="wt-slate-kicker mono-num">ZUKI EXHIBITION PLANNER</span>
                  <h3 className="wt-slate-heading">From Blank Floor to Flagship Pavilion</h3>
                  <p className="wt-slate-sub">
                    Branding · Modular Assets · Custom 3D · 2D Compliance · AI &amp; Export
                  </p>
                </div>
              )}

              {/* Chapter 01 Booth Dimension Pill (0:06.5 – 0:16) */}
              {elapsedSec >= 6.5 && elapsedSec < 16 && (
                <div className="wt-hud-float top-left">
                  <Grid size={13} />
                  <span className="mono-num">8.0m × 6.0m · 48 m² · 4 Open Sides · Grid 0.1m</span>
                </div>
              )}

              {/* Chapter 02 Simulated Brand & Media Upload Panel (0:16 – 0:36) */}
              {elapsedSec >= 16 && elapsedSec < 36 && (
                <div className="wt-sim-panel left">
                  <div className="wt-sim-panel-head">
                    <Upload size={13} />
                    <span>Brand Kit &amp; Media Upload</span>
                  </div>
                  <div className="wt-sim-row done">
                    <span className="wt-sim-file">{brandLabel.toLowerCase().replace(/\s+/g, '-')}-logo.svg</span>
                    <CheckCircle2 size={13} className="wt-ok" />
                  </div>
                  <div className={`wt-sim-row ${elapsedSec >= 21 ? 'done' : 'pending'}`}>
                    <span>Brand Palette</span>
                    <span className="wt-swatch-pair">
                      <span className="wt-swatch" style={{ background: primary }} />
                      <span className="wt-swatch" style={{ background: accent }} />
                    </span>
                  </div>
                  <div className={`wt-sim-row ${elapsedSec >= 26 ? 'done' : 'pending'}`}>
                    <span className="wt-sim-file">hero-campaign-mural.png</span>
                    {elapsedSec >= 26 ? (
                      <CheckCircle2 size={13} className="wt-ok" />
                    ) : (
                      <span className="mono-num wt-dim">Uploading…</span>
                    )}
                  </div>
                  <div className={`wt-sim-row ${elapsedSec >= 30.5 ? 'done' : 'pending'}`}>
                    <span className="wt-sim-file">led-product-reel.png</span>
                    {elapsedSec >= 30.5 ? (
                      <CheckCircle2 size={13} className="wt-ok" />
                    ) : (
                      <span className="mono-num wt-dim">Queued</span>
                    )}
                  </div>
                </div>
              )}

              {/* Chapter 03 Catalog Drag-and-Drop HUD (0:36 – 0:58) */}
              {elapsedSec >= 36 && elapsedSec < 58 && (
                <div className="wt-sim-panel left">
                  <div className="wt-sim-panel-head">
                    <Layers size={13} />
                    <span>Catalog · Drag to Floor</span>
                  </div>
                  {[
                    { label: 'Central Brand Tower', at: 37.5 },
                    { label: '3.8m LED Video Wall + Truss', at: 40.5 },
                    { label: 'Twin SEG Lightbox Wings', at: 45.0 },
                    { label: 'Architectural Brand Arch', at: 49.2 },
                    { label: '4.2m Suspended 360° Halo', at: 53.8 },
                  ].map((row) => {
                    const placed = elapsedSec >= row.at;
                    return (
                      <div key={row.label} className={`wt-sim-row ${placed ? 'done' : 'pending'}`}>
                        <span>{row.label}</span>
                        {placed ? (
                          <Check size={13} className="wt-ok" />
                        ) : (
                          <span className="mono-num wt-dim">+</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Chapter 04 Custom .GLB File Drop Callout (1:10 – 1:18) */}
              {elapsedSec >= 70.5 && elapsedSec < 78 && (
                <div className="wt-hud-float top-left accent">
                  <Upload size={13} />
                  <span>
                    Dropped <strong>flagship-product.glb</strong> onto Showcase Plinth
                  </span>
                </div>
              )}

              {/* Chapter 05 Move / Rotate / Inspector Callout (1:18 – 1:38) */}
              {elapsedSec >= 78 && elapsedSec < 98 && (
                <div className="wt-sim-panel right">
                  <div className="wt-sim-panel-head">
                    {elapsedSec < 89 ? <Move size={13} /> : <RotateCw size={13} />}
                    <span>{elapsedSec < 89 ? 'Direct Floor Drag' : 'Rotate & Inspect'}</span>
                  </div>
                  {elapsedSec < 89 ? (
                    <>
                      <div className="wt-sim-row done">
                        <span>Selected</span>
                        <strong>Reception Counter</strong>
                      </div>
                      <div className="wt-sim-row done">
                        <span>Snap Grid</span>
                        <span className="mono-num">0.10m</span>
                      </div>
                      <div className="wt-sim-row done">
                        <span>Offset Z</span>
                        <span className="mono-num">
                          +
                          {(
                            0.48 *
                            (easeInOutCubic(clamp((elapsedSec - 80) / 3.6, 0, 1)) -
                              easeInOutCubic(clamp((elapsedSec - 85.2) / 2.8, 0, 1)))
                          ).toFixed(2)}
                          m
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="wt-sim-row done">
                        <span>Selected</span>
                        <strong>Demo Kiosk (East)</strong>
                      </div>
                      <div className="wt-sim-row done">
                        <span>Shortcut</span>
                        <kbd className="wt-kbd">R</kbd>
                      </div>
                      <div className="wt-sim-row done">
                        <span>Rotation Y</span>
                        <span className="mono-num">
                          {Math.round(
                            lerp(-55, -13, easeInOutCubic(clamp((elapsedSec - 90) / 4.2, 0, 1)))
                          )}
                          °
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Chapter 06 1-Click Surface Painting HUD (1:38 – 1:56) */}
              {elapsedSec >= 98 && elapsedSec < 116 && (
                <div className="wt-hud-float top-left accent">
                  <Paintbrush size={13} />
                  <span>
                    1-Click Surface Paint ·{' '}
                    <strong>
                      {elapsedSec < 104
                        ? 'LED Video Wall'
                        : elapsedSec < 108
                          ? 'SEG Lightboxes'
                          : elapsedSec < 112
                            ? 'Brand Arch & Reception'
                            : '360° Overhead Halo'}
                    </strong>
                  </span>
                </div>
              )}

              {/* Chapter 07 View Mode Switcher Pill (1:56 – 2:14) */}
              {elapsedSec >= 116 && elapsedSec < 134 && (
                <>
                  <div className="wt-view-switcher">
                    <span className={activeViewTab === '3d' ? 'active' : ''}>
                      <Compass size={12} /> 3D Studio
                    </span>
                    <span className={activeViewTab === '2d' ? 'active' : ''}>
                      <Grid size={12} /> 2D Floor Plan
                    </span>
                    <span className={activeViewTab === 'visitor' ? 'active' : ''}>
                      <Eye size={12} /> Visitor View
                    </span>
                  </div>
                  {activeViewTab === '2d' && (
                    <div className="wt-hud-float top-left">
                      <CheckCircle2 size={13} className="wt-ok" />
                      <span className="mono-num">
                        48.0 m² · Within Bounds · 1.4m Aisle Clear
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Chapter 08 AI Designer & Export HUD (2:14 – 2:30) */}
              {elapsedSec >= 134 && (
                <div className="wt-sim-panel right">
                  <div className="wt-sim-panel-head">
                    {elapsedSec < 142 ? <Sparkles size={13} /> : <Download size={13} />}
                    <span>{elapsedSec < 142 ? 'Zuki AI Designer' : 'Export Ready'}</span>
                  </div>
                  {elapsedSec < 142 ? (
                    <div className="wt-ai-prompt-pill">
                      “Apply warm gallery spotlights &amp; prepare production brief”
                    </div>
                  ) : (
                    <>
                      <div className="wt-sim-row done">
                        <span>1600px Studio PNG</span>
                        <CheckCircle2 size={13} className="wt-ok" />
                      </div>
                      <div className="wt-sim-row done">
                        <span>Print Brief &amp; BOM</span>
                        <CheckCircle2 size={13} className="wt-ok" />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Top-Right Active Chapter Pill */}
              <div className="wt-stage-badge mono-num">
                CH {activeChapter.number}/08 · {activeChapter.title.toUpperCase()}
              </div>

              {/* Adobe-Style Subtitles / Narration Captions */}
              {showCaptions && elapsedSec >= 5.5 && (
                <div className="wt-caption-bar" key={activeCaption}>
                  <span>{activeCaption}</span>
                </div>
              )}

              {/* Center Play Indicator when Paused */}
              {paused && (
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
                    onClick={() => seekTo(elapsedSec - 10)}
                    title="Back 10s (←)"
                    aria-label="Back 10 seconds"
                  >
                    <SkipBack size={14} />
                  </button>
                  <button
                    type="button"
                    className="wt-ctrl-btn"
                    onClick={() => seekTo(elapsedSec + 10)}
                    title="Forward 10s (→)"
                    aria-label="Forward 10 seconds"
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
                    title="Restart from beginning"
                    aria-label="Restart"
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
                    title="Toggle instructional captions"
                  >
                    <Subtitles size={13} />
                    <span>CC</span>
                  </button>
                  <button
                    type="button"
                    className="wt-ctrl-pill mono-num"
                    onClick={() => setSpeedIdx((i) => (i + 1) % SPEED_OPTIONS.length)}
                    title="Playback speed"
                  >
                    {SPEED_OPTIONS[speedIdx]}×
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Chapter Syllabus Rail (Adobe Creative Cloud / Figma Learn style) */}
          <aside className="wt-syllabus" aria-label="Walkthrough chapters">
            <div className="wt-syllabus-head">
              <span className="mono-num">CHAPTERS</span>
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
              Skip for Now
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
