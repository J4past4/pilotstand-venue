import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {
  ExhibitionVenue,
  VenueLayerVisibility,
  VenueStand,
} from '../types/venue';
import {
  getExhibitorBrandProfile,
  type ExhibitorBrandProfile,
} from '../data/exhibitorBrands';

export type Venue3DCameraMode = 'orbit' | 'walk';

export interface TestFitBrandConfig {
  enabled: boolean;
  companyName: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
  packageTier: 'shell' | 'modular' | 'flagship';
}

interface VenueViewport3DProps {
  venue: ExhibitionVenue;
  matchingStandIds: Set<string>;
  selectedStandId: string | null;
  competitorStandIds: Set<string>;
  layers: VenueLayerVisibility;
  cameraMode: Venue3DCameraMode;
  testFit?: TestFitBrandConfig;
  showSightlines?: boolean;
  showVisitorFlow?: boolean;
  onSelectStand: (standId: string) => void;
  focusTrigger?: { standId: string; walk?: boolean; seq: number } | null;
}

/** Refined architectural exhibition carpet tones (NEC Halls 6–8) */
const ZONE_CARPET_3D: Record<string, string> = {
  'packaging-innovation': '#d9b8cc',
  'smart-packaging': '#bcd1ad',
  'start-up': '#cabfd9',
  'contract-pack': '#accbde',
  'robotics-automation': '#84a8d4',
  empack: '#325188',
};

function createHallConcreteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#E4DFD6';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = 'rgba(120, 114, 104, 0.045)';
  for (let i = 0; i < 650; i++) {
    ctx.fillRect((i * 73) % 512, (i * 139) % 512, 3, 3);
  }
  ctx.strokeStyle = 'rgba(116, 112, 103, 0.24)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 510, 510);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(32, 60);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCarpetGrainTexture(baseHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 256, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.045)';
  for (let x = 0; x < 256; x += 4) ctx.fillRect(x, 0, 1, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 255, 255);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createAvailablePlotTexture(
  standId: string,
  widthM: number,
  depthM: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(0.5, 0.5);
  ctx.fillStyle = '#fafaf8';
  ctx.fillRect(0, 0, 512, 512);

  // Architectural 1m floor grid
  ctx.strokeStyle = 'rgba(17, 24, 39, 0.08)';
  ctx.lineWidth = 2;
  const cols = Math.max(2, Math.round(widthM));
  const rows = Math.max(2, Math.round(depthM));
  for (let i = 1; i < cols; i++) {
    ctx.beginPath();
    ctx.moveTo((i / cols) * 512, 0);
    ctx.lineTo((i / cols) * 512, 512);
    ctx.stroke();
  }
  for (let j = 1; j < rows; j++) {
    ctx.beginPath();
    ctx.moveTo(0, (j / rows) * 512);
    ctx.lineTo(512, (j / rows) * 512);
    ctx.stroke();
  }

  ctx.strokeStyle = '#16a34a';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 498, 498);

  ctx.fillStyle = '#dcfce7';
  ctx.fillRect(140, 118, 232, 46);
  ctx.fillStyle = '#15803d';
  ctx.font = '800 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AVAILABLE PLOT', 256, 142);

  ctx.fillStyle = '#111315';
  ctx.font = '800 94px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText(standId, 256, 260);

  ctx.fillStyle = '#585c66';
  ctx.font = '700 38px "JetBrains Mono", monospace';
  ctx.fillText(`${widthM}m × ${depthM}m`, 256, 352);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Freestanding 3D "AVAILABLE" Exhibition Totem Sign Texture */
function createAvailableTotemTexture(
  standId: string,
  widthM: number,
  depthM: number,
  openSides: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(0.5, 0.5);

  // Clean architectural white body
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 768);

  // Vivid emerald top banner
  ctx.fillStyle = '#15803d';
  ctx.fillRect(0, 0, 512, 196);
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(0, 186, 512, 12);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 62px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText('AVAILABLE', 256, 98);

  // Stand Number
  ctx.fillStyle = '#111315';
  ctx.font = '800 92px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText(standId, 256, 315);

  // Dimensions & Area
  const area = Math.round(widthM * depthM * 10) / 10;
  ctx.fillStyle = '#374151';
  ctx.font = '700 40px "JetBrains Mono", monospace';
  ctx.fillText(`${widthM}m × ${depthM}m`, 256, 410);
  ctx.fillStyle = '#15803d';
  ctx.font = '800 44px "JetBrains Mono", monospace';
  ctx.fillText(`${area} m²`, 256, 478);

  // Open sides badge
  const sidesText =
    openSides === 4
      ? 'ISLAND • 4 OPEN SIDES'
      : openSides === 3
      ? 'PENINSULA • 3 OPEN SIDES'
      : openSides === 2
      ? 'CORNER • 2 OPEN SIDES'
      : 'INLINE • 1 OPEN SIDE';
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(46, 540, 420, 62);
  ctx.fillStyle = '#111827';
  ctx.font = '700 24px Inter, sans-serif';
  ctx.fillText(sidesText, 256, 572);

  // Footer CTA
  ctx.fillStyle = '#111315';
  ctx.fillRect(0, 668, 512, 100);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px Inter, sans-serif';
  ctx.fillText('CLICK TO TEST-FIT & DESIGN', 256, 718);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Backlit SEG Hero Backwall Graphic with real exhibitor wordmark, tagline & website */
function createBrandHeroWallTexture(
  brand: ExhibitorBrandProfile,
  standId: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(0.5, 0.5);

  const grad = ctx.createLinearGradient(0, 0, 768, 384);
  grad.addColorStop(0, brand.primaryColor);
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 768, 384);

  // Architectural geometric brand accent slash
  ctx.fillStyle = brand.accentColor;
  ctx.fillRect(0, 0, 768, 16);
  ctx.globalAlpha = 0.14;
  ctx.beginPath();
  ctx.moveTo(520, 0);
  ctx.lineTo(768, 0);
  ctx.lineTo(768, 384);
  ctx.lineTo(410, 384);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Stand ID Pill top-left
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(28, 34, 112, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(standId, 84, 51);

  // Company Wordmark
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  const name = brand.company;
  const fontSize = name.length > 22 ? 42 : name.length > 14 ? 54 : 68;
  ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", Inter, sans-serif`;
  ctx.fillText(name.length > 28 ? `${name.slice(0, 26)}…` : name, 384, 158);

  // Accent divider
  ctx.fillStyle = brand.accentColor;
  ctx.fillRect(304, 206, 160, 6);

  // Real Tagline
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 24px Inter, sans-serif';
  const tag = brand.tagline.length > 48 ? `${brand.tagline.slice(0, 46)}…` : brand.tagline;
  ctx.fillText(tag, 384, 254);

  // Clean website domain
  const domain = brand.website
    .replace(/^https?:\/\/(www\.)?/, '')
    .split('/')[0];
  if (domain && !domain.includes('google.com')) {
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '600 19px "JetBrains Mono", monospace';
    ctx.fillText(domain, 384, 326);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createFasciaSignTexture(
  title: string,
  subtitle: string,
  bgHex: string,
  accentHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 144);
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 512, 12);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = title.length > 22 ? 30 : title.length > 14 ? 38 : 46;
  ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", Inter, sans-serif`;
  ctx.fillText(title.length > 28 ? `${title.slice(0, 26)}…` : title, 256, 66);

  if (subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '600 22px Inter, sans-serif';
    ctx.fillText(subtitle.length > 34 ? `${subtitle.slice(0, 32)}…` : subtitle, 256, 112);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createStageScreenTexture(title: string, sponsor?: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 1024, 384);
  grad.addColorStop(0, '#1e1b4b');
  grad.addColorStop(0.55, '#312e81');
  grad.addColorStop(1, '#4c1d95');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 384);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, 290, 1024, 94);
  ctx.fillStyle = '#ff4d2e';
  ctx.fillRect(412, 56, 200, 8);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = title.length > 22 ? 54 : 68;
  ctx.font = `800 ${size}px "Plus Jakarta Sans", Inter, sans-serif`;
  ctx.fillText(title, 512, 174);

  if (sponsor) {
    ctx.fillStyle = '#e0e7ff';
    ctx.font = '600 34px Inter, sans-serif';
    ctx.fillText(`Hosted by ${sponsor}`, 512, 260);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createArchitecturalPerson(
  bodyMat: THREE.MeshStandardMaterial,
  darkMat: THREE.MeshStandardMaterial
): THREE.Group {
  const g = new THREE.Group();
  const legGeom = new THREE.CylinderGeometry(0.055, 0.042, 0.82, 8);
  const leftLeg = new THREE.Mesh(legGeom, darkMat);
  leftLeg.position.set(-0.085, 0.41, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeom, darkMat);
  rightLeg.position.set(0.085, 0.41, 0);
  rightLeg.castShadow = true;
  g.add(leftLeg, rightLeg);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.58, 10), bodyMat);
  torso.position.set(0, 1.11, 0);
  torso.scale.set(1.15, 1, 0.72);
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 10), bodyMat);
  head.position.set(0, 1.56, 0);
  head.castShadow = true;
  g.add(head);
  return g;
}

/** Build a rich architectural branded 3D stand (used for both booked exhibitors AND live B2B Test-Fit!) */
function buildBrandedExhibitionStand(
  stand: { id: string; width: number; depth: number; openSides: number },
  brand: ExhibitorBrandProfile,
  mats: {
    aluminumMat: THREE.MeshStandardMaterial;
    darkSteelMat: THREE.MeshStandardMaterial;
    shellWallMat: THREE.MeshStandardMaterial;
    woodDeckMat: THREE.MeshStandardMaterial;
    screenGlowMat: THREE.MeshStandardMaterial;
    foliageMat: THREE.MeshStandardMaterial;
    sofaMat: THREE.MeshStandardMaterial;
  },
  pickableMeshes?: THREE.Object3D[],
  forceTier?: 'shell' | 'modular' | 'flagship'
): THREE.Group {
  const sGroup = new THREE.Group();
  const w = Math.max(1.2, stand.width - 0.14);
  const d = Math.max(1.2, stand.depth - 0.14);
  const area = stand.width * stand.depth;

  const isFlagship = forceTier === 'flagship' || (!forceTier && area >= 24);
  const isMedium = forceTier === 'modular' || (!forceTier && area >= 12);
  const boothH = isFlagship ? 3.35 : isMedium ? 2.95 : 2.6;
  const wallT = 0.09;

  const floorMat = new THREE.MeshStandardMaterial({
    color: brand.floorColor || '#2b303a',
    roughness: 0.8,
    metalness: 0.03,
  });
  const primaryMat = new THREE.MeshStandardMaterial({
    color: brand.primaryColor,
    roughness: 0.48,
    metalness: 0.08,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: brand.accentColor,
    roughness: 0.32,
    metalness: 0.14,
  });

  // Raised Floor Platform with Aluminum Bevel Trim
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), [
    mats.aluminumMat,
    mats.aluminumMat,
    floorMat,
    mats.aluminumMat,
    mats.aluminumMat,
    mats.aluminumMat,
  ]);
  plinth.position.y = 0.03;
  plinth.receiveShadow = true;
  plinth.userData = { standId: stand.id };
  sGroup.add(plinth);
  pickableMeshes?.push(plinth);

  const heroTex = createBrandHeroWallTexture(brand, stand.id);
  const heroBacklitMat = new THREE.MeshStandardMaterial({
    map: heroTex,
    emissiveMap: heroTex,
    emissive: '#ffffff',
    emissiveIntensity: 0.22,
    roughness: 0.35,
  });

  // Walls based on openSides (or central backlit brand tower for Islands)
  if (stand.openSides < 4) {
    // Full Backlit SEG Hero Backwall (-Z)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, boothH, wallT), [
      mats.aluminumMat,
      mats.aluminumMat,
      mats.aluminumMat,
      mats.aluminumMat,
      heroBacklitMat, // Front-facing interior graphic
      mats.shellWallMat,
    ]);
    backWall.position.set(0, boothH / 2 + 0.06, -d / 2 + wallT / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    backWall.userData = { standId: stand.id };
    sGroup.add(backWall);
    pickableMeshes?.push(backWall);

    // Brushed aluminum vertical mullions
    const mullionGeom = new THREE.BoxGeometry(0.055, boothH + 0.04, wallT + 0.03);
    for (const mx of [-w / 2 + 0.03, w / 2 - 0.03]) {
      const m = new THREE.Mesh(mullionGeom, mats.aluminumMat);
      m.position.set(mx, boothH / 2 + 0.06, -d / 2 + wallT / 2);
      sGroup.add(m);
    }

    // Left Wall (-X) for Inline (1) & Corner (2)
    if (stand.openSides <= 2) {
      const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallT, boothH, d),
        mats.shellWallMat
      );
      leftWall.position.set(-w / 2 + wallT / 2, boothH / 2 + 0.06, 0);
      leftWall.castShadow = true;
      leftWall.receiveShadow = true;
      leftWall.userData = { standId: stand.id };
      sGroup.add(leftWall);
      pickableMeshes?.push(leftWall);

      const leftHeader = new THREE.Mesh(
        new THREE.BoxGeometry(wallT + 0.03, 0.38, d + 0.02),
        primaryMat
      );
      leftHeader.position.set(-w / 2 + wallT / 2, boothH - 0.13, 0);
      sGroup.add(leftHeader);
    }

    // Right Wall (+X) for Inline (1)
    if (stand.openSides === 1) {
      const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallT, boothH, d),
        mats.shellWallMat
      );
      rightWall.position.set(w / 2 - wallT / 2, boothH / 2 + 0.06, 0);
      rightWall.castShadow = true;
      rightWall.receiveShadow = true;
      rightWall.userData = { standId: stand.id };
      sGroup.add(rightWall);
      pickableMeshes?.push(rightWall);
    }
  } else {
    // Island Stand (4 Open Sides) — Architectural central backlit brand pavilion core
    const coreW = Math.min(3.2, w * 0.44);
    const coreD = Math.min(1.5, d * 0.34);
    const core = new THREE.Mesh(new THREE.BoxGeometry(coreW, boothH + 0.25, coreD), [
      primaryMat,
      primaryMat,
      mats.darkSteelMat,
      mats.darkSteelMat,
      heroBacklitMat,
      heroBacklitMat,
    ]);
    core.position.set(0, (boothH + 0.25) / 2 + 0.06, 0);
    core.castShadow = true;
    core.receiveShadow = true;
    core.userData = { standId: stand.id };
    sGroup.add(core);
    pickableMeshes?.push(core);
  }

  // Suspended 360° Overhead Hanging Brand Cube for Flagship Stands (≥ 24m²)
  if (isFlagship) {
    const signTex = createFasciaSignTexture(
      brand.company,
      brand.tagline,
      brand.primaryColor,
      brand.accentColor
    );
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: '#ffffff',
      emissiveIntensity: 0.16,
      roughness: 0.35,
    });
    const cubeW = Math.min(w * 0.72, 4.8);
    const cubeD = Math.min(d * 0.62, 3.2);
    const hangingCube = new THREE.Mesh(new THREE.BoxGeometry(cubeW, 1.05, cubeD), [
      signMat,
      signMat,
      mats.darkSteelMat,
      mats.darkSteelMat,
      signMat,
      signMat,
    ]);
    hangingCube.position.set(0, 4.95, 0);
    hangingCube.castShadow = true;
    hangingCube.userData = { standId: stand.id };
    sGroup.add(hangingCube);
    pickableMeshes?.push(hangingCube);
  } else {
    // Overhead Fascia Sign Banner
    const signTex = createFasciaSignTexture(
      brand.company,
      stand.id,
      brand.primaryColor,
      brand.accentColor
    );
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4 });
    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(w - 0.14, 4.8), 0.54, 0.12),
      [primaryMat, primaryMat, primaryMat, primaryMat, signMat, signMat]
    );
    fascia.position.set(0, boothH + 0.33, stand.openSides === 4 ? 0 : -d / 2 + 0.1);
    fascia.userData = { standId: stand.id };
    sGroup.add(fascia);
    pickableMeshes?.push(fascia);
  }

  // Branded Reception Desk with Accent Strip & Countertop
  const counterW = Math.min(1.65, w * 0.42);
  const counterX = stand.openSides === 4 ? w * 0.27 : -w * 0.16;
  const counterZ = d * 0.25;
  const counter = new THREE.Mesh(new THREE.BoxGeometry(counterW, 0.96, 0.56), primaryMat);
  counter.position.set(counterX, 0.54, counterZ);
  counter.castShadow = true;
  sGroup.add(counter);

  const counterAccent = new THREE.Mesh(
    new THREE.BoxGeometry(counterW + 0.02, 0.1, 0.58),
    accentMat
  );
  counterAccent.position.set(counterX, 0.14, counterZ);
  sGroup.add(counterAccent);

  const counterTop = new THREE.Mesh(
    new THREE.BoxGeometry(counterW + 0.08, 0.055, 0.64),
    mats.shellWallMat
  );
  counterTop.position.set(counterX, 1.05, counterZ);
  sGroup.add(counterTop);

  // Medium & Flagship Interior Furnishings (Lounge / Machinery Plinth / Planter / 4K Kiosk)
  if (isMedium && w >= 3.5 && d >= 2.8) {
    // Lounge Seating (Sofa + Oak Coffee Table) or Industrial Showcase Plinth
    const zoneX = stand.openSides === 4 ? -w * 0.28 : w * 0.24;
    if (brand.buildStyle === 'machinery-showcase') {
      // Industrial machine demo plinth + safety rail silhouette
      const machineBase = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.85, 1.1),
        mats.darkSteelMat
      );
      machineBase.position.set(zoneX, 0.48, 0.1);
      machineBase.castShadow = true;
      const machineHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.72, 0.78),
        mats.aluminumMat
      );
      machineHead.position.set(zoneX, 1.26, 0.05);
      machineHead.castShadow = true;
      const accentCap = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.8), accentMat);
      accentCap.position.set(zoneX, 1.66, 0.05);
      sGroup.add(machineBase, machineHead, accentCap);
    } else {
      // Modern Lounge Sofa + Oak Coffee Table
      const sofaSeat = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.42, 0.72), mats.sofaMat);
      sofaSeat.position.set(zoneX, 0.27, -0.15);
      sofaSeat.castShadow = true;
      const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.46, 0.16), mats.sofaMat);
      sofaBack.position.set(zoneX, 0.64, -0.44);
      const table = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.38, 0.52), mats.woodDeckMat);
      table.position.set(zoneX, 0.25, 0.62);
      sGroup.add(sofaSeat, sofaBack, table);
    }

    // Potted Architectural Planter at corner
    const pot = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.45), mats.woodDeckMat);
    pot.position.set(w / 2 - 0.36, 0.34, d / 2 - 0.36);
    const plant = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), mats.foliageMat);
    plant.position.set(w / 2 - 0.36, 0.82, d / 2 - 0.36);
    sGroup.add(pot, plant);
  }

  return sGroup;
}

export const VenueViewport3D: React.FC<VenueViewport3DProps> = ({
  venue,
  matchingStandIds,
  selectedStandId,
  competitorStandIds,
  layers,
  cameraMode,
  testFit,
  showSightlines = false,
  showVisitorFlow = true,
  onSelectStand,
  focusTrigger,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraModeRef = useRef<Venue3DCameraMode>(cameraMode);
  cameraModeRef.current = cameraMode;
  const showVisitorFlowRef = useRef<boolean>(showVisitorFlow);
  showVisitorFlowRef.current = showVisitorFlow;

  const onSelectStandRef = useRef(onSelectStand);
  onSelectStandRef.current = onSelectStand;

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    availableTotems: Map<string, THREE.Group>;
    standBaseMeshes: Map<string, THREE.Mesh>;
    pillarGroup: THREE.Group;
    amenityGroup: THREE.Group;
    competitorGroup: THREE.Group;
    sightlineGroup: THREE.Group;
    testFitGroup: THREE.Group;
    flowGroup: THREE.Group;
    flowParticles: Array<{ mesh: THREE.Mesh; start: THREE.Vector3; end: THREE.Vector3; phase: number; speed: number }>;
    selectionFrame: THREE.Group;
    sharedMats: {
      aluminumMat: THREE.MeshStandardMaterial;
      darkSteelMat: THREE.MeshStandardMaterial;
      shellWallMat: THREE.MeshStandardMaterial;
      woodDeckMat: THREE.MeshStandardMaterial;
      screenGlowMat: THREE.MeshStandardMaterial;
      foliageMat: THREE.MeshStandardMaterial;
      sofaMat: THREE.MeshStandardMaterial;
    };
    walkYaw: number;
    walkPitch: number;
  } | null>(null);

  // Build static NEC Halls 6-8 venue scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#EDE9E2');
    scene.fog = new THREE.Fog('#EDE9E2', 150, 380);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 560);
    const hallCenterX = venue.widthM * 0.44;
    const hallCenterZ = venue.depthM * 0.46;
    camera.position.set(hallCenterX + 64, 52, hallCenterZ + 60);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    let isSoftwareRenderer = false;
    try {
      const gl = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
      isSoftwareRenderer = /swiftshader|llvmpipe|software/i.test(rStr);
    } catch {
      // ignore
    }

    let envRT: THREE.WebGLRenderTarget | null = null;
    if (!isSoftwareRenderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.56;
      roomEnv.dispose();
      pmrem.dispose();
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 4;
    controls.maxDistance = 240;
    controls.target.set(hallCenterX, 0.8, hallCenterZ);
    controls.update();

    // 3-Point Studio Expo Hall Lighting
    const iblBoost = isSoftwareRenderer ? 1.24 : 1.0;
    scene.add(new THREE.HemisphereLight('#F8FAFF', '#C5C9D1', 0.84 * iblBoost));

    const keyLight = new THREE.DirectionalLight('#FFFBF4', 1.28);
    keyLight.position.set(hallCenterX + 68, 96, hallCenterZ + 52);
    keyLight.castShadow = !isSoftwareRenderer;
    if (!isSoftwareRenderer) {
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.near = 10;
      keyLight.shadow.camera.far = 360;
      const d = 145;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0002;
      keyLight.shadow.normalBias = 0.03;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#D9E7F8', 0.48);
    rimLight.position.set(-55, 58, hallCenterZ - 65);
    scene.add(rimLight);

    const sharedMats = {
      aluminumMat: new THREE.MeshStandardMaterial({ color: '#C8CED6', roughness: 0.34, metalness: 0.68 }),
      darkSteelMat: new THREE.MeshStandardMaterial({ color: '#222730', roughness: 0.42, metalness: 0.55 }),
      shellWallMat: new THREE.MeshStandardMaterial({ color: '#F4F3EF', roughness: 0.74, metalness: 0.02 }),
      woodDeckMat: new THREE.MeshStandardMaterial({ color: '#8B6D4B', roughness: 0.56, metalness: 0.04 }),
      screenGlowMat: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        emissive: '#38bdf8',
        emissiveIntensity: 0.28,
        roughness: 0.2,
      }),
      foliageMat: new THREE.MeshStandardMaterial({ color: '#2e6f40', roughness: 0.8 }),
      sofaMat: new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.85 }),
    };

    const ledStripMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#FFFBF0',
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });

    // 1. NEC Hall Concrete Floor
    const hallFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(venue.widthM + 140, venue.depthM + 140),
      new THREE.MeshStandardMaterial({
        map: createHallConcreteTexture(),
        color: '#FAF8F4',
        roughness: 0.9,
        metalness: 0.02,
      })
    );
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(venue.widthM / 2, -0.05, venue.depthM / 2);
    hallFloor.receiveShadow = true;
    scene.add(hallFloor);

    // 2. NEC Atrium Concourse Walkway (East side: x = 94..112, z = 72..195)
    const atriumFloor = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.04, 130),
      new THREE.MeshStandardMaterial({ color: '#dcd6cc', roughness: 0.6, metalness: 0.08 })
    );
    atriumFloor.position.set(103, -0.025, 134);
    atriumFloor.receiveShadow = true;
    scene.add(atriumFloor);

    // NEC Atrium Glass Curtain Wall along East Concourse Edge
    const atriumGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 9.5, 130),
      new THREE.MeshStandardMaterial({
        color: '#bae6fd',
        roughness: 0.15,
        metalness: 0.3,
        transparent: true,
        opacity: 0.24,
      })
    );
    atriumGlass.position.set(112, 4.75, 134);
    scene.add(atriumGlass);

    // 3. Refined Woven Zone Carpets
    for (const zone of venue.zones) {
      const hex = ZONE_CARPET_3D[zone.id] || zone.carpetColor;
      const mat = new THREE.MeshStandardMaterial({
        map: createCarpetGrainTexture(hex),
        roughness: 0.9,
        metalness: 0.02,
      });
      for (const r of zone.regions) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.03, r.depth), mat);
        mesh.position.set(r.x + r.width / 2, -0.02, r.z + r.depth / 2);
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }

    // 4. NEC Steel Roof Trusses & High-Bay Linear LED Banks
    const trussH = venue.ceilingHeightM;
    for (let z = 14; z < venue.depthM; z += 22) {
      const topChord = new THREE.Mesh(
        new THREE.BoxGeometry(venue.widthM + 4, 0.22, 0.24),
        sharedMats.aluminumMat
      );
      topChord.position.set(venue.widthM / 2, trussH + 0.75, z);
      scene.add(topChord);

      const botChord = new THREE.Mesh(
        new THREE.BoxGeometry(venue.widthM + 4, 0.18, 0.24),
        sharedMats.aluminumMat
      );
      botChord.position.set(venue.widthM / 2, trussH, z);
      scene.add(botChord);

      for (let x = 14; x < venue.widthM - 8; x += 24) {
        const fixture = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.12, 0.45), ledStripMat);
        fixture.position.set(x, trussH - 0.16, z);
        scene.add(fixture);
      }
    }

    // Acoustic North & West Perimeter Hall Walls
    const wallCladMat = new THREE.MeshStandardMaterial({ color: '#DCD7CE', roughness: 0.82 });
    const northWall = new THREE.Mesh(
      new THREE.BoxGeometry(venue.widthM + 4, trussH + 0.8, 0.5),
      wallCladMat
    );
    northWall.position.set(venue.widthM / 2, (trussH + 0.8) / 2, -1.2);
    scene.add(northWall);

    const westWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, trussH + 0.8, venue.depthM + 4),
      wallCladMat
    );
    westWall.position.set(-1.2, (trussH + 0.8) / 2, venue.depthM / 2);
    scene.add(westWall);

    // 5. Stands (Booked Branded Booths, Open Stage Pavilions & Available Plots with 3D "AVAILABLE" Totems)
    const availableTotems = new Map<string, THREE.Group>();
    const standBaseMeshes = new Map<string, THREE.Mesh>();
    const pickableMeshes: THREE.Object3D[] = [];

    for (const stand of venue.stands) {
      const cx = stand.x + stand.width / 2;
      const cz = stand.z + stand.depth / 2;
      const w = Math.max(1.2, stand.width - 0.12);
      const d = Math.max(1.2, stand.depth - 0.12);

      if (stand.status === 'available') {
        const sGroup = new THREE.Group();
        sGroup.position.set(cx, 0, cz);
        scene.add(sGroup);

        const plotTex = createAvailablePlotTexture(stand.id, stand.width, stand.depth);
        const topMat = new THREE.MeshStandardMaterial({ map: plotTex, roughness: 0.65 });
        const plot = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), [
          sharedMats.aluminumMat,
          sharedMats.aluminumMat,
          topMat,
          sharedMats.aluminumMat,
          sharedMats.aluminumMat,
          sharedMats.aluminumMat,
        ]);
        plot.position.y = 0.03;
        plot.receiveShadow = true;
        plot.userData = { standId: stand.id };
        sGroup.add(plot);
        standBaseMeshes.set(stand.id, plot);
        pickableMeshes.push(plot);

        // Freestanding 3D Illuminated "AVAILABLE" Exhibition Totem Sign!
        const totemGroup = new THREE.Group();
        const totemTex = createAvailableTotemTexture(
          stand.id,
          stand.width,
          stand.depth,
          stand.openSides
        );
        const totemFaceMat = new THREE.MeshStandardMaterial({
          map: totemTex,
          emissiveMap: totemTex,
          emissive: '#ffffff',
          emissiveIntensity: 0.18,
          roughness: 0.35,
        });
        const totemBase = new THREE.Mesh(
          new THREE.BoxGeometry(1.18, 0.08, 0.48),
          sharedMats.darkSteelMat
        );
        totemBase.position.y = 0.1;
        const totemBoard = new THREE.Mesh(new THREE.BoxGeometry(1.06, 2.05, 0.12), [
          sharedMats.aluminumMat,
          sharedMats.aluminumMat,
          sharedMats.aluminumMat,
          sharedMats.aluminumMat,
          totemFaceMat,
          totemFaceMat,
        ]);
        totemBoard.position.y = 1.16;
        totemBoard.castShadow = true;
        totemBoard.userData = { standId: stand.id };
        totemGroup.add(totemBase, totemBoard);
        sGroup.add(totemGroup);
        availableTotems.set(stand.id, totemGroup);
        pickableMeshes.push(totemBoard);
      } else if (stand.status === 'reserved') {
        const resMat = new THREE.MeshStandardMaterial({
          color: '#0284c7',
          roughness: 0.35,
          metalness: 0.15,
          transparent: true,
          opacity: 0.74,
        });
        const plot = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), resMat);
        plot.position.set(cx, 0.08, cz);
        plot.receiveShadow = true;
        plot.userData = { standId: stand.id };
        scene.add(plot);
        standBaseMeshes.set(stand.id, plot);
        pickableMeshes.push(plot);
      } else if (stand.status === 'feature') {
        const sGroup = new THREE.Group();
        sGroup.position.set(cx, 0, cz);
        scene.add(sGroup);

        const stageH = 4.6;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.34, d), [
          sharedMats.darkSteelMat,
          sharedMats.darkSteelMat,
          sharedMats.woodDeckMat,
          sharedMats.darkSteelMat,
          sharedMats.darkSteelMat,
          sharedMats.darkSteelMat,
        ]);
        deck.position.y = 0.17;
        deck.receiveShadow = true;
        deck.castShadow = true;
        deck.userData = { standId: stand.id };
        sGroup.add(deck);
        standBaseMeshes.set(stand.id, deck);
        pickableMeshes.push(deck);

        const towerGeom = new THREE.BoxGeometry(0.28, stageH, 0.28);
        for (const [sx, sz] of [
          [-w / 2 + 0.25, -d / 2 + 0.25],
          [w / 2 - 0.25, -d / 2 + 0.25],
          [-w / 2 + 0.25, d / 2 - 0.25],
          [w / 2 - 0.25, d / 2 - 0.25],
        ]) {
          const tower = new THREE.Mesh(towerGeom, sharedMats.aluminumMat);
          tower.position.set(sx, stageH / 2, sz);
          tower.castShadow = true;
          sGroup.add(tower);
        }

        const beamN = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.34, 0.28), sharedMats.darkSteelMat);
        beamN.position.set(0, stageH, -d / 2 + 0.25);
        const beamS = beamN.clone();
        beamS.position.set(0, stageH, d / 2 - 0.25);
        const beamW = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, d - 0.3), sharedMats.darkSteelMat);
        beamW.position.set(-w / 2 + 0.25, stageH, 0);
        const beamE = beamW.clone();
        beamE.position.set(w / 2 - 0.25, stageH, 0);
        sGroup.add(beamN, beamS, beamW, beamE);

        const isWide = w >= d;
        const screenW = Math.max(2.2, (isWide ? w : d) * 0.74);
        const screenH = 2.8;
        const screenTex = createStageScreenTexture(stand.exhibitorName || stand.id, stand.sponsor);
        const screenMat = new THREE.MeshStandardMaterial({
          map: screenTex,
          emissiveMap: screenTex,
          emissive: '#ffffff',
          emissiveIntensity: 0.35,
          roughness: 0.25,
        });
        const backdrop = new THREE.Mesh(new THREE.BoxGeometry(screenW, screenH, 0.22), [
          sharedMats.darkSteelMat,
          sharedMats.darkSteelMat,
          sharedMats.darkSteelMat,
          sharedMats.darkSteelMat,
          screenMat,
          screenMat,
        ]);
        if (isWide) {
          backdrop.position.set(0, 0.34 + screenH / 2, -d / 2 + 0.55);
        } else {
          backdrop.rotation.y = Math.PI / 2;
          backdrop.position.set(-w / 2 + 0.55, 0.34 + screenH / 2, 0);
        }
        backdrop.castShadow = true;
        backdrop.userData = { standId: stand.id };
        sGroup.add(backdrop);
        pickableMeshes.push(backdrop);

        const bannerTex = createFasciaSignTexture(
          stand.exhibitorName || stand.id,
          stand.sponsor || 'Feature Pavilion',
          '#312e81',
          '#a78bfa'
        );
        const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.4 });
        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(Math.min(w - 0.6, 10), 0.95, 0.16),
          [
            sharedMats.darkSteelMat,
            sharedMats.darkSteelMat,
            sharedMats.darkSteelMat,
            sharedMats.darkSteelMat,
            bannerMat,
            bannerMat,
          ]
        );
        banner.position.set(0, stageH + 0.55, d / 2 - 0.25);
        sGroup.add(banner);
      } else {
        // SOLD STAND — Real Researched Brand Identity 3D Booth!
        const brand = getExhibitorBrandProfile(stand.exhibitorName, stand.sector);
        const booth = buildBrandedExhibitionStand(stand, brand, sharedMats, pickableMeshes);
        booth.position.set(cx, 0, cz);
        scene.add(booth);
      }
    }

    // 6. Structural NEC Columns
    const pillarGroup = new THREE.Group();
    const concreteMat = new THREE.MeshStandardMaterial({ color: '#8C9199', roughness: 0.86 });
    const hazardMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.4 });
    for (const pillar of venue.pillars) {
      const pcx = pillar.x + pillar.width / 2;
      const pcz = pillar.z + pillar.depth / 2;
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(pillar.width, pillar.heightM, pillar.depth),
        concreteMat
      );
      col.position.set(pcx, pillar.heightM / 2, pcz);
      col.castShadow = true;
      col.receiveShadow = true;
      pillarGroup.add(col);

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(pillar.width + 0.14, 0.34, pillar.depth + 0.14),
        sharedMats.darkSteelMat
      );
      base.position.set(pcx, 0.17, pcz);
      pillarGroup.add(base);

      const collar = new THREE.Mesh(
        new THREE.BoxGeometry(pillar.width + 0.08, 0.36, pillar.depth + 0.08),
        hazardMat
      );
      collar.position.set(pcx, 1.62, pcz);
      pillarGroup.add(collar);
    }
    scene.add(pillarGroup);

    // 7. NEC Toilets (WC), Starbucks Atrium Cafe, Helpdesk & Amenities
    const amenityGroup = new THREE.Group();
    for (const am of venue.amenities) {
      const acx = am.x + am.width / 2;
      const acz = am.z + am.depth / 2;
      const color =
        am.kind === 'toilets'
          ? '#0f766e'
          : am.kind === 'catering'
          ? am.label.includes('Starbucks')
            ? '#00704A'
            : '#0284c7'
          : am.kind === 'first-aid'
          ? '#dc2626'
          : am.kind === 'cloakroom'
          ? '#475569'
          : '#4338ca';
      const amMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });

      const kiosk = new THREE.Mesh(new THREE.BoxGeometry(am.width, 2.9, am.depth), amMat);
      kiosk.position.set(acx, 1.45, acz);
      kiosk.castShadow = true;
      amenityGroup.add(kiosk);

      const title =
        am.kind === 'toilets'
          ? 'TOILETS • WC'
          : am.label.includes('Starbucks')
          ? 'STARBUCKS CAFE'
          : am.kind === 'catering'
          ? 'COFFEE & BISTRO'
          : am.kind === 'cloakroom'
          ? 'CHARGING & CLOAKROOM'
          : am.kind === 'first-aid'
          ? 'FIRST AID & SECURITY'
          : 'ORGANISER HELPDESK';
      const tex = createFasciaSignTexture(title, am.label, color, '#ffffff');
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      sprite.position.set(acx, 4.2, acz);
      sprite.scale.set(5.8, 1.75, 1);
      amenityGroup.add(sprite);
    }
    scene.add(amenityGroup);

    // 8. NEC Atrium Hall 6 / Hall 7 / Hall 8 Visitors Entrance Portals
    for (const ent of venue.entrances) {
      const portalGroup = new THREE.Group();
      portalGroup.position.set(ent.x + 1.0, 0, ent.z);

      const postGeom = new THREE.BoxGeometry(0.45, 4.6, 0.45);
      const postN = new THREE.Mesh(postGeom, sharedMats.darkSteelMat);
      postN.position.set(0, 2.3, -ent.widthM / 2);
      const postS = new THREE.Mesh(postGeom, sharedMats.darkSteelMat);
      postS.position.set(0, 2.3, ent.widthM / 2);
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 1.0, ent.widthM + 0.6),
        sharedMats.darkSteelMat
      );
      header.position.set(0, 4.5, 0);
      portalGroup.add(postN, postS, header);

      const tex = createFasciaSignTexture('NEC VISITORS ENTRANCE', ent.label, '#111315', '#ff4d2e');
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      sprite.position.set(0, 5.9, 0);
      sprite.scale.set(8.6, 2.4, 1);
      portalGroup.add(sprite);
      scene.add(portalGroup);
    }

    // 9. Stylized 1.75m Architectural Human Scale Figures
    const personBodyMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.72 });
    const personBodyMatAlt = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.72 });
    const personLegMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.78 });
    const aislePeopleCoords: Array<[number, number, number]> = [
      [88, 86, -Math.PI / 2],
      [86, 88, -Math.PI / 2 + 0.3],
      [87, 129, -Math.PI / 2],
      [85, 131, -Math.PI / 2 - 0.25],
      [86, 164, -Math.PI / 2],
      [52, 70, 0.4],
      [48, 70.5, -0.6],
      [44, 111, 1.1],
      [62, 111.5, -1.2],
      [58, 172, 0.2],
      [68, 236, 0.8],
      [64, 243, -0.5],
      [57, 242.5, 0.3],
      [33, 20, 0.9],
      [58, 43.5, -0.4],
      [28, 108, 0.5],
      [98, 122, -Math.PI / 2],
      [99, 127, -Math.PI / 2 + 0.2],
    ];
    aislePeopleCoords.forEach(([px, pz, rot], idx) => {
      const person = createArchitecturalPerson(
        idx % 2 === 0 ? personBodyMat : personBodyMatAlt,
        personLegMat
      );
      person.position.set(px, 0, pz);
      person.rotation.y = rot;
      scene.add(person);
    });

    // 10. Animated Visitor Traffic Flow Pulses (from NEC Atrium Entrances down main boulevards)
    const flowGroup = new THREE.Group();
    const flowParticles: Array<{
      mesh: THREE.Mesh;
      start: THREE.Vector3;
      end: THREE.Vector3;
      phase: number;
      speed: number;
    }> = [];
    const flowPaths: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(96, 0.22, 86), new THREE.Vector3(24, 0.22, 86)],
      [new THREE.Vector3(96, 0.22, 129), new THREE.Vector3(16, 0.22, 129)],
      [new THREE.Vector3(96, 0.22, 164), new THREE.Vector3(48, 0.22, 164)],
      [new THREE.Vector3(62, 0.22, 86), new THREE.Vector3(62, 0.22, 238)],
      [new THREE.Vector3(45, 0.22, 129), new THREE.Vector3(45, 0.22, 20)],
    ];
    const pulseGeom = new THREE.SphereGeometry(0.32, 8, 8);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: '#ff4d2e',
      transparent: true,
      opacity: 0.72,
    });
    for (const [start, end] of flowPaths) {
      for (let i = 0; i < 6; i++) {
        const mesh = new THREE.Mesh(pulseGeom, pulseMat);
        flowGroup.add(mesh);
        flowParticles.push({
          mesh,
          start,
          end,
          phase: i / 6,
          speed: 0.085,
        });
      }
    }
    scene.add(flowGroup);

    // Dynamic Groups (Competitors, Sightlines, Live Test-Fit Stand, Selection Frame)
    const competitorGroup = new THREE.Group();
    const sightlineGroup = new THREE.Group();
    const testFitGroup = new THREE.Group();
    scene.add(competitorGroup, sightlineGroup, testFitGroup);

    const selectionFrame = new THREE.Group();
    const selBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.14, 1),
      new THREE.MeshBasicMaterial({ color: '#ff4d2e', transparent: true, opacity: 0.28 })
    );
    const selEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.22, 1)),
      new THREE.LineBasicMaterial({ color: '#ff4d2e' })
    );
    selectionFrame.add(selBox, selEdges);
    selectionFrame.visible = false;
    scene.add(selectionFrame);

    sceneRefs.current = {
      scene,
      camera,
      controls,
      availableTotems,
      standBaseMeshes,
      pillarGroup,
      amenityGroup,
      competitorGroup,
      sightlineGroup,
      testFitGroup,
      flowGroup,
      flowParticles,
      selectionFrame,
      sharedMats,
      walkYaw: 0,
      walkPitch: 0,
    };

    // Raycasting & Walkthrough Controls
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let isWalkLooking = false;
    let lastLookPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      if (cameraModeRef.current === 'walk') {
        isWalkLooking = true;
        lastLookPos = { x: e.clientX, y: e.clientY };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (cameraModeRef.current === 'walk' && isWalkLooking && sceneRefs.current) {
        const dx = e.clientX - lastLookPos.x;
        const dy = e.clientY - lastLookPos.y;
        lastLookPos = { x: e.clientX, y: e.clientY };
        sceneRefs.current.walkYaw -= dx * 0.0045;
        sceneRefs.current.walkPitch = Math.max(
          -0.55,
          Math.min(0.45, sceneRefs.current.walkPitch - dy * 0.0035)
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      isWalkLooking = false;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickableMeshes, false);
      if (hits.length > 0) {
        const standId = hits[0].object.userData?.standId as string | undefined;
        if (standId) onSelectStandRef.current(standId);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const keysPressed = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }
      keysPressed.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    let animId = 0;
    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);

      // Animate visitor traffic flow pulses
      if (sceneRefs.current) {
        sceneRefs.current.flowGroup.visible = showVisitorFlowRef.current;
        if (showVisitorFlowRef.current) {
          for (const p of sceneRefs.current.flowParticles) {
            p.phase = (p.phase + dt * p.speed) % 1;
            p.mesh.position.lerpVectors(p.start, p.end, p.phase);
          }
        }
      }

      if (cameraModeRef.current === 'walk' && sceneRefs.current) {
        controls.enabled = false;
        const speed = keysPressed.has('ShiftLeft') || keysPressed.has('ShiftRight') ? 16 : 8.5;
        const yaw = sceneRefs.current.walkYaw;
        const pitch = sceneRefs.current.walkPitch;

        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
        right.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

        if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) {
          camera.position.addScaledVector(forward, speed * dt);
        }
        if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) {
          camera.position.addScaledVector(forward, -speed * dt);
        }
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) {
          camera.position.addScaledVector(right, -speed * dt);
        }
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) {
          camera.position.addScaledVector(right, speed * dt);
        }

        camera.position.y = 1.68;
        camera.position.x = Math.max(-4, Math.min(venue.widthM + 16, camera.position.x));
        camera.position.z = Math.max(-4, Math.min(venue.depthM + 10, camera.position.z));

        const lookTarget = new THREE.Vector3(
          camera.position.x - Math.sin(yaw) * Math.cos(pitch) * 10,
          camera.position.y + Math.sin(pitch) * 10,
          camera.position.z - Math.cos(yaw) * Math.cos(pitch) * 10
        );
        camera.lookAt(lookTarget);
      } else {
        controls.enabled = true;
        controls.update();
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      controls.dispose();
      envRT?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRefs.current = null;
    };
  }, [venue]);

  // Sync Layers, Selection, Competitors, Sightline Rays & Live "Test-Fit Your Brand" Stand!
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    refs.pillarGroup.visible = layers.pillars;
    refs.amenityGroup.visible = layers.amenities;

    // Selection frame
    const selectedStand: VenueStand | undefined = venue.stands.find(
      (s) => s.id === selectedStandId
    );
    if (selectedStand) {
      refs.selectionFrame.visible = true;
      refs.selectionFrame.scale.set(selectedStand.width + 0.5, 1, selectedStand.depth + 0.5);
      refs.selectionFrame.position.set(
        selectedStand.x + selectedStand.width / 2,
        0.12,
        selectedStand.z + selectedStand.depth / 2
      );
    } else {
      refs.selectionFrame.visible = false;
    }

    // Live "Test-Fit Your Brand" 3D Stand right on the selected Available plot!
    while (refs.testFitGroup.children.length > 0) {
      refs.testFitGroup.remove(refs.testFitGroup.children[0]);
    }
    for (const [id, totem] of refs.availableTotems.entries()) {
      totem.visible = !(
        testFit?.enabled &&
        selectedStand?.status === 'available' &&
        selectedStand.id === id
      );
    }
    if (testFit?.enabled && selectedStand && selectedStand.status === 'available') {
      const customBrand: ExhibitorBrandProfile = {
        company: testFit.companyName.trim() || 'YOUR BRAND',
        tagline: testFit.tagline.trim() || 'Live Stand Preview — Packaging Innovations 2026',
        primaryColor: testFit.primaryColor || '#111315',
        accentColor: testFit.accentColor || '#ff4d2e',
        floorColor: '#272c35',
        website: 'https://pilotstand.com',
        buildStyle: testFit.packageTier === 'flagship' ? 'flagship-island' : 'modern-seg',
      };
      const previewStand = buildBrandedExhibitionStand(
        selectedStand,
        customBrand,
        refs.sharedMats,
        undefined,
        testFit.packageTier
      );
      previewStand.position.set(
        selectedStand.x + selectedStand.width / 2,
        0.04,
        selectedStand.z + selectedStand.depth / 2
      );
      refs.testFitGroup.add(previewStand);
    }

    // 3D Sightline & Visibility Ray Analyzer
    while (refs.sightlineGroup.children.length > 0) {
      refs.sightlineGroup.remove(refs.sightlineGroup.children[0]);
    }
    if (showSightlines && selectedStand) {
      const targetPt = new THREE.Vector3(
        selectedStand.x + selectedStand.width / 2,
        2.1,
        selectedStand.z + selectedStand.depth / 2
      );
      const vantagePoints = [
        ...venue.entrances.map((e) => new THREE.Vector3(e.x - 1, 2.1, e.z)),
        new THREE.Vector3(selectedStand.x + selectedStand.width / 2, 2.1, Math.max(4, selectedStand.z - 22)),
        new THREE.Vector3(selectedStand.x + selectedStand.width / 2, 2.1, Math.min(venue.depthM - 4, selectedStand.z + selectedStand.depth + 22)),
      ];

      for (const vp of vantagePoints) {
        if (vp.distanceTo(targetPt) > 95) continue;
        // Check if any pillar lies close to the 2D line segment between vp and targetPt
        const segDx = targetPt.x - vp.x;
        const segDz = targetPt.z - vp.z;
        const segLenSq = segDx * segDx + segDz * segDz || 1;
        let blocked = false;
        for (const p of venue.pillars) {
          const px = p.x + p.width / 2;
          const pz = p.z + p.depth / 2;
          const t = Math.max(0, Math.min(1, ((px - vp.x) * segDx + (pz - vp.z) * segDz) / segLenSq));
          const closestX = vp.x + t * segDx;
          const closestZ = vp.z + t * segDz;
          if (Math.hypot(px - closestX, pz - closestZ) < Math.max(p.width, p.depth) * 0.75 + 0.5) {
            blocked = true;
            break;
          }
        }
        const geom = new THREE.BufferGeometry().setFromPoints([vp, targetPt]);
        const mat = new THREE.LineBasicMaterial({
          color: blocked ? '#ef4444' : '#16a34a',
          transparent: true,
          opacity: 0.85,
        });
        refs.sightlineGroup.add(new THREE.Line(geom, mat));
      }
    }

    // Competitor Beacons
    while (refs.competitorGroup.children.length > 0) {
      refs.competitorGroup.remove(refs.competitorGroup.children[0]);
    }
    if (layers.competitors && competitorStandIds.size > 0) {
      for (const standId of competitorStandIds) {
        const stand = venue.stands.find((s) => s.id === standId);
        if (!stand) continue;
        const cx = stand.x + stand.width / 2;
        const cz = stand.z + stand.depth / 2;
        const tex = createFasciaSignTexture(
          'COMPETITOR',
          stand.exhibitorName || stand.id,
          '#b91c1c',
          '#fecaca'
        );
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
        sprite.position.set(cx, 6.2, cz);
        sprite.scale.set(6.4, 1.8, 1);
        refs.competitorGroup.add(sprite);
      }
    }
  }, [
    venue,
    matchingStandIds,
    selectedStandId,
    competitorStandIds,
    layers,
    testFit,
    showSightlines,
  ]);

  // Smart Camera Positioning for Orbit Focus & Unobstructed Eye-Level Walkthrough
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    const placeWalkCameraForStand = (stand: VenueStand) => {
      const cx = stand.x + stand.width / 2;
      const cz = stand.z + stand.depth / 2;
      const candidates = [
        { x: cx, z: stand.z - 3.0 },
        { x: cx, z: stand.z + stand.depth + 3.0 },
        { x: stand.x - 3.0, z: cz },
        { x: stand.x + stand.width + 3.0, z: cz },
        { x: stand.x - 2.4, z: stand.z - 2.4 },
        { x: stand.x + stand.width + 2.4, z: stand.z - 2.4 },
      ];
      const isClear = (px: number, pz: number) =>
        !venue.stands.some(
          (other) =>
            other.id !== stand.id &&
            px >= other.x - 0.8 &&
            px <= other.x + other.width + 0.8 &&
            pz >= other.z - 0.8 &&
            pz <= other.z + other.depth + 0.8
        );
      const chosen = candidates.find((c) => isClear(c.x, c.z)) || candidates[0];
      refs.camera.position.set(chosen.x, 1.68, chosen.z);
      refs.walkYaw = Math.atan2(chosen.x - cx, chosen.z - cz);
      refs.walkPitch = -0.04;
    };

    if (focusTrigger) {
      const stand = venue.stands.find((s) => s.id === focusTrigger.standId);
      if (stand) {
        const cx = stand.x + stand.width / 2;
        const cz = stand.z + stand.depth / 2;
        if (focusTrigger.walk || cameraMode === 'walk') {
          placeWalkCameraForStand(stand);
        } else {
          refs.controls.target.set(cx, 1.2, cz);
          refs.camera.position.set(cx + 16, 14, cz + 18);
          refs.controls.update();
        }
        return;
      }
    }

    if (cameraMode === 'walk') {
      const targetStand = selectedStandId
        ? venue.stands.find((s) => s.id === selectedStandId)
        : null;
      if (targetStand) {
        placeWalkCameraForStand(targetStand);
      } else {
        refs.camera.position.set(88, 1.68, 129);
        refs.walkYaw = Math.PI / 2;
        refs.walkPitch = -0.03;
      }
    }
  }, [focusTrigger, cameraMode, selectedStandId, venue.stands]);

  return (
    <div className="venue-viewport3d-root" ref={mountRef}>
      {cameraMode === 'walk' && (
        <div className="venue-walk-hud">
          <span>
            <strong>NEC Halls 6–8 Eye-Level Walkthrough (1.68m)</strong>
          </span>
          <span>
            • <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> / Arrows to walk aisles
          </span>
          <span>• Drag to look around</span>
        </div>
      )}
    </div>
  );
};
