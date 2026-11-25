import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {
  ExhibitionVenue,
  VenueLayerVisibility,
  VenueStand,
} from '../types/venue';

export type Venue3DCameraMode = 'orbit' | 'walk';

interface VenueViewport3DProps {
  venue: ExhibitionVenue;
  matchingStandIds: Set<string>;
  selectedStandId: string | null;
  competitorStandIds: Set<string>;
  layers: VenueLayerVisibility;
  cameraMode: Venue3DCameraMode;
  onSelectStand: (standId: string) => void;
  focusTrigger?: { standId: string; walk?: boolean; seq: number } | null;
}

/** Tasteful architectural brand accent palette per exhibition sector */
const SECTOR_PALETTES: Record<string, { primary: string; accent: string; floor: string }> = {
  'Flexible Films': { primary: '#1e3a5f', accent: '#38bdf8', floor: '#2b303a' },
  'Rigid Packaging': { primary: '#1f2937', accent: '#f59e0b', floor: '#333842' },
  'Corrugated & Cartons': { primary: '#44403c', accent: '#d97706', floor: '#c9b79c' },
  'Labelling & Print': { primary: '#312e81', accent: '#a78bfa', floor: '#2a2d3a' },
  'Sustainable Packaging': { primary: '#14532d', accent: '#4ade80', floor: '#c5b89f' },
  'Sustainability & Compliance': { primary: '#065f46', accent: '#34d399', floor: '#30383a' },
  'Automation & Machinery': { primary: '#0f172a', accent: '#3b82f6', floor: '#262b33' },
  'Robotics & Automation': { primary: '#172554', accent: '#60a5fa', floor: '#242934' },
  'Contract Packing': { primary: '#0c4a6e', accent: '#38bdf8', floor: '#2f3640' },
  'Moulded Fibre': { primary: '#3f3f46', accent: '#a3e635', floor: '#cbbca4' },
  'Glass & Rigid Containers': { primary: '#134e4a', accent: '#2dd4bf', floor: '#2d333b' },
  'Metal Packaging': { primary: '#27272a', accent: '#e4e4e7', floor: '#343840' },
  'Smart Packaging': { primary: '#3b0764', accent: '#c084fc', floor: '#2b2938' },
  'E-Commerce Packaging': { primary: '#7c2d12', accent: '#fb923c', floor: '#c8b8a0' },
};

const DEFAULT_BRAND_PALETTE = { primary: '#1e293b', accent: '#ff4d2e', floor: '#2e333c' };

/** Refined architectural exhibition carpet tones (less harsh than 2D CAD legend colors) */
const ZONE_CARPET_3D: Record<string, string> = {
  'packaging-innovation': '#d8b4c8',
  'smart-packaging': '#b8cfa8',
  'start-up': '#c8bed9',
  'contract-pack': '#a8c8dc',
  'robotics-automation': '#7fa6d4',
  empack: '#35548c',
};

function createHallConcreteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#E4DFD6';
  ctx.fillRect(0, 0, 512, 512);
  // Subtle concrete micro-grain
  ctx.fillStyle = 'rgba(120, 114, 104, 0.04)';
  for (let i = 0; i < 650; i++) {
    const x = (i * 73) % 512;
    const y = (i * 139) % 512;
    ctx.fillRect(x, y, 3, 3);
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
  // Subtle woven exhibition carpet tile seams & grain
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < 256; y += 4) {
    ctx.fillRect(0, y, 256, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.045)';
  for (let x = 0; x < 256; x += 4) {
    ctx.fillRect(x, 0, 1, 256);
  }
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
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Clean architectural studio plot surface
  ctx.fillStyle = '#fafaf8';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle 1m architectural grid
  ctx.strokeStyle = 'rgba(17, 24, 39, 0.08)';
  ctx.lineWidth = 2;
  const cols = Math.max(2, Math.round(widthM));
  const rows = Math.max(2, Math.round(depthM));
  for (let i = 1; i < cols; i++) {
    const x = (i / cols) * 512;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let j = 1; j < rows; j++) {
    const y = (j / rows) * 512;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Crisp emerald architectural border
  ctx.strokeStyle = '#16a34a';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 498, 498);

  // Pill badge "AVAILABLE"
  ctx.fillStyle = '#dcfce7';
  ctx.fillRect(156, 130, 200, 44);
  ctx.fillStyle = '#15803d';
  ctx.font = '800 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AVAILABLE', 256, 153);

  // Stand ID
  ctx.fillStyle = '#111315';
  ctx.font = '800 96px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.fillText(standId, 256, 266);

  // Dimensions
  ctx.fillStyle = '#585c66';
  ctx.font = '700 40px "JetBrains Mono", monospace';
  ctx.fillText(`${widthM}m × ${depthM}m`, 256, 356);

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

  // Sleek top/bottom architectural accent strip
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 512, 12);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = title.length > 22 ? 30 : title.length > 14 ? 38 : 46;
  ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", Inter, sans-serif`;
  ctx.fillText(title.length > 28 ? `${title.slice(0, 26)}…` : title, 256, 66);

  if (subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.74)';
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

  // Subtle architectural light streaks
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
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

/** Sleek stylized 1.75m architectural human scale figure matching StandViewport3D */
function createArchitecturalPerson(
  bodyMat: THREE.MeshStandardMaterial,
  darkMat: THREE.MeshStandardMaterial
): THREE.Group {
  const g = new THREE.Group();
  // Legs
  const legGeom = new THREE.CylinderGeometry(0.055, 0.042, 0.82, 8);
  const leftLeg = new THREE.Mesh(legGeom, darkMat);
  leftLeg.position.set(-0.085, 0.41, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeom, darkMat);
  rightLeg.position.set(0.085, 0.41, 0);
  rightLeg.castShadow = true;
  g.add(leftLeg, rightLeg);

  // Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.58, 10), bodyMat);
  torso.position.set(0, 1.11, 0);
  torso.scale.set(1.15, 1, 0.72);
  torso.castShadow = true;
  g.add(torso);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 10), bodyMat);
  head.position.set(0, 1.56, 0);
  head.castShadow = true;
  g.add(head);

  return g;
}

export const VenueViewport3D: React.FC<VenueViewport3DProps> = ({
  venue,
  matchingStandIds,
  selectedStandId,
  competitorStandIds,
  layers,
  cameraMode,
  onSelectStand,
  focusTrigger,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraModeRef = useRef<Venue3DCameraMode>(cameraMode);
  cameraModeRef.current = cameraMode;

  const onSelectStandRef = useRef(onSelectStand);
  onSelectStandRef.current = onSelectStand;

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    standGroups: Map<string, THREE.Group>;
    standBaseMeshes: Map<string, THREE.Mesh>;
    pillarGroup: THREE.Group;
    amenityGroup: THREE.Group;
    competitorGroup: THREE.Group;
    selectionFrame: THREE.Group;
    walkYaw: number;
    walkPitch: number;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Warm Architectural Expo Hall Studio Atmosphere (matches StandViewport3D)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#EDE9E2');
    scene.fog = new THREE.Fog('#EDE9E2', 145, 360);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 550);
    const hallCenterX = venue.widthM * 0.44;
    const hallCenterZ = venue.depthM * 0.46;
    camera.position.set(hallCenterX + 64, 54, hallCenterZ + 62);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Detect software WebGL (e.g., SwiftShader headless) to keep rendering snappy
    let isSoftwareRenderer = false;
    try {
      const gl = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
      isSoftwareRenderer = /swiftshader|llvmpipe|software/i.test(rStr);
    } catch {
      // ignore
    }

    // Studio PBR RoomEnvironment IBL (exact same setup as StandViewport3D)
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
    controls.minDistance = 5;
    controls.maxDistance = 240;
    controls.target.set(hallCenterX, 0.8, hallCenterZ);
    controls.update();

    // Crisp 3-Point Expo Hall Lighting Rig (matches StandViewport3D)
    const iblBoost = isSoftwareRenderer ? 1.24 : 1.0;
    const hemi = new THREE.HemisphereLight('#F8FAFF', '#C5C9D1', 0.82 * iblBoost);
    scene.add(hemi);

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

    // Shared Architectural PBR Materials
    const aluminumMat = new THREE.MeshStandardMaterial({
      color: '#C8CED6',
      roughness: 0.34,
      metalness: 0.68,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: '#262B34',
      roughness: 0.42,
      metalness: 0.55,
    });
    const shellWallMat = new THREE.MeshStandardMaterial({
      color: '#F4F3EF',
      roughness: 0.74,
      metalness: 0.02,
    });
    const woodDeckMat = new THREE.MeshStandardMaterial({
      color: '#8B6D4B',
      roughness: 0.56,
      metalness: 0.04,
    });
    const screenGlowMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      emissive: '#38bdf8',
      emissiveIntensity: 0.28,
      roughness: 0.2,
    });
    const ledStripMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#FFFBF0',
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });

    // 1. Surrounding Exhibition Hall Concrete Floor
    const hallFloorTex = createHallConcreteTexture();
    const hallFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(venue.widthM + 120, venue.depthM + 120),
      new THREE.MeshStandardMaterial({
        map: hallFloorTex,
        color: '#FAF8F4',
        roughness: 0.9,
        metalness: 0.02,
      })
    );
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(venue.widthM / 2, -0.05, venue.depthM / 2);
    hallFloor.receiveShadow = true;
    scene.add(hallFloor);

    // 2. Refined Woven Zone Carpets with subtle aluminum trim
    for (const zone of venue.zones) {
      const hex = ZONE_CARPET_3D[zone.id] || zone.carpetColor;
      const carpetTex = createCarpetGrainTexture(hex);
      const mat = new THREE.MeshStandardMaterial({
        map: carpetTex,
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

    // 3. Architectural Hall Roof Trusses & High-Bay Linear LED Lighting
    const trussH = venue.ceilingHeightM;
    for (let z = 14; z < venue.depthM; z += 22) {
      // Main top & bottom chord of steel roof truss
      const topChord = new THREE.Mesh(
        new THREE.BoxGeometry(venue.widthM + 4, 0.22, 0.24),
        aluminumMat
      );
      topChord.position.set(venue.widthM / 2, trussH + 0.75, z);
      scene.add(topChord);

      const botChord = new THREE.Mesh(
        new THREE.BoxGeometry(venue.widthM + 4, 0.18, 0.24),
        aluminumMat
      );
      botChord.position.set(venue.widthM / 2, trussH, z);
      scene.add(botChord);

      // Glowing high-bay linear LED fixtures suspended beneath truss
      for (let x = 14; x < venue.widthM - 8; x += 24) {
        const fixture = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.12, 0.45), ledStripMat);
        fixture.position.set(x, trussH - 0.16, z);
        scene.add(fixture);
      }
    }

    // Subtle North & West Architectural Hall Perimeter Walls (low-profile so orbit never clips)
    const wallCladMat = new THREE.MeshStandardMaterial({
      color: '#DCD7CE',
      roughness: 0.82,
      metalness: 0.05,
    });
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

    // 4. Stands (Architectural Modular Booths, Open Stage Pavilions & Available Plots)
    const standGroups = new Map<string, THREE.Group>();
    const standBaseMeshes = new Map<string, THREE.Mesh>();
    const pickableMeshes: THREE.Object3D[] = [];

    for (const stand of venue.stands) {
      const cx = stand.x + stand.width / 2;
      const cz = stand.z + stand.depth / 2;
      const w = Math.max(1.2, stand.width - 0.12);
      const d = Math.max(1.2, stand.depth - 0.12);
      const area = stand.width * stand.depth;

      const sGroup = new THREE.Group();
      sGroup.position.set(cx, 0, cz);
      scene.add(sGroup);
      standGroups.set(stand.id, sGroup);

      if (stand.status === 'available') {
        // Architectural Available Plot: Raised plinth + 1m grid + aluminum bevel + emerald border
        const plotTex = createAvailablePlotTexture(stand.id, stand.width, stand.depth);
        const topMat = new THREE.MeshStandardMaterial({
          map: plotTex,
          roughness: 0.65,
          metalness: 0.03,
        });
        const plot = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), [
          aluminumMat,
          aluminumMat,
          topMat,
          aluminumMat,
          aluminumMat,
          aluminumMat,
        ]);
        plot.position.y = 0.03;
        plot.receiveShadow = true;
        plot.userData = { standId: stand.id };
        sGroup.add(plot);
        standBaseMeshes.set(stand.id, plot);
        pickableMeshes.push(plot);

        // Sleek corner marker posts (0.28m tall architectural plot pins)
        const pinGeom = new THREE.BoxGeometry(0.08, 0.28, 0.08);
        const pinMat = new THREE.MeshStandardMaterial({
          color: '#16a34a',
          roughness: 0.35,
          metalness: 0.2,
        });
        for (const [sx, sz] of [
          [-w / 2 + 0.06, -d / 2 + 0.06],
          [w / 2 - 0.06, -d / 2 + 0.06],
          [-w / 2 + 0.06, d / 2 - 0.06],
          [w / 2 - 0.06, d / 2 - 0.06],
        ]) {
          const pin = new THREE.Mesh(pinGeom, pinMat);
          pin.position.set(sx, 0.14, sz);
          sGroup.add(pin);
        }
      } else if (stand.status === 'reserved') {
        // Reserved Plot: Architectural frosted sky-blue glass plinth
        const resMat = new THREE.MeshStandardMaterial({
          color: '#0284c7',
          roughness: 0.35,
          metalness: 0.15,
          transparent: true,
          opacity: 0.72,
        });
        const plot = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), resMat);
        plot.position.y = 0.08;
        plot.receiveShadow = true;
        plot.userData = { standId: stand.id };
        sGroup.add(plot);
        standBaseMeshes.set(stand.id, plot);
        pickableMeshes.push(plot);
      } else if (stand.status === 'feature') {
        // Open-Truss Architectural Stage / Lounge Pavilion (instead of solid purple cube!)
        const stageH = 4.6;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.34, d), [
          darkSteelMat,
          darkSteelMat,
          woodDeckMat,
          darkSteelMat,
          darkSteelMat,
          darkSteelMat,
        ]);
        deck.position.y = 0.17;
        deck.receiveShadow = true;
        deck.castShadow = true;
        deck.userData = { standId: stand.id };
        sGroup.add(deck);
        standBaseMeshes.set(stand.id, deck);
        pickableMeshes.push(deck);

        // 4 Sleek Aluminum Corner Truss Towers
        const towerGeom = new THREE.BoxGeometry(0.28, stageH, 0.28);
        for (const [sx, sz] of [
          [-w / 2 + 0.25, -d / 2 + 0.25],
          [w / 2 - 0.25, -d / 2 + 0.25],
          [-w / 2 + 0.25, d / 2 - 0.25],
          [w / 2 - 0.25, d / 2 - 0.25],
        ]) {
          const tower = new THREE.Mesh(towerGeom, aluminumMat);
          tower.position.set(sx, stageH / 2, sz);
          tower.castShadow = true;
          sGroup.add(tower);
        }

        // Overhead Aluminum Truss Perimeter Frame
        const beamN = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.34, 0.28), darkSteelMat);
        beamN.position.set(0, stageH, -d / 2 + 0.25);
        const beamS = beamN.clone();
        beamS.position.set(0, stageH, d / 2 - 0.25);
        const beamW = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, d - 0.3), darkSteelMat);
        beamW.position.set(-w / 2 + 0.25, stageH, 0);
        const beamE = beamW.clone();
        beamE.position.set(w / 2 - 0.25, stageH, 0);
        sGroup.add(beamN, beamS, beamW, beamE);

        // Glowing Feature LED Backdrop Wall (along the longer back edge)
        const isWide = w >= d;
        const screenW = Math.max(2.2, (isWide ? w : d) * 0.72);
        const screenH = 2.75;
        const screenTex = createStageScreenTexture(
          stand.exhibitorName || stand.id,
          stand.sponsor
        );
        const screenMat = new THREE.MeshStandardMaterial({
          map: screenTex,
          emissiveMap: screenTex,
          emissive: '#ffffff',
          emissiveIntensity: 0.35,
          roughness: 0.25,
        });
        const backdrop = new THREE.Mesh(new THREE.BoxGeometry(screenW, screenH, 0.22), [
          darkSteelMat,
          darkSteelMat,
          darkSteelMat,
          darkSteelMat,
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

        // Overhead Suspended Banner Header (visible from Orbit & Walkthrough)
        const bannerTex = createFasciaSignTexture(
          stand.exhibitorName || stand.id,
          stand.sponsor || 'Feature Pavilion',
          '#312e81',
          '#a78bfa'
        );
        const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.4 });
        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(Math.min(w - 0.6, 10), 0.95, 0.16),
          [darkSteelMat, darkSteelMat, darkSteelMat, darkSteelMat, bannerMat, bannerMat]
        );
        banner.position.set(0, stageH + 0.55, d / 2 - 0.25);
        sGroup.add(banner);
      } else {
        // SOLD STAND — Real Architectural Open-Sided Modular Exhibition Booth!
        const palette = (stand.sector && SECTOR_PALETTES[stand.sector]) || DEFAULT_BRAND_PALETTE;
        const boothH = area >= 36 ? 3.2 : area >= 18 ? 2.85 : 2.55;
        const wallT = 0.09;

        const floorMat = new THREE.MeshStandardMaterial({
          color: palette.floor,
          roughness: 0.82,
          metalness: 0.03,
        });
        const primaryMat = new THREE.MeshStandardMaterial({
          color: palette.primary,
          roughness: 0.5,
          metalness: 0.08,
        });
        const accentMat = new THREE.MeshStandardMaterial({
          color: palette.accent,
          roughness: 0.35,
          metalness: 0.12,
        });

        // Raised Booth Plinth with brushed aluminum edge trim
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), [
          aluminumMat,
          aluminumMat,
          floorMat,
          aluminumMat,
          aluminumMat,
          aluminumMat,
        ]);
        plinth.position.y = 0.03;
        plinth.receiveShadow = true;
        plinth.userData = { standId: stand.id };
        sGroup.add(plinth);
        standBaseMeshes.set(stand.id, plinth);
        pickableMeshes.push(plinth);

        // Build modular shell walls based on openSides (matching meshFactory.ts!)
        // openSides: 1=back+left+right, 2=back+left, 3=back only, 4=central architectural island totem
        if (stand.openSides < 4) {
          // Back Wall (-Z)
          const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(w, boothH, wallT),
            shellWallMat
          );
          backWall.position.set(0, boothH / 2 + 0.06, -d / 2 + wallT / 2);
          backWall.castShadow = true;
          backWall.receiveShadow = true;
          backWall.userData = { standId: stand.id };
          sGroup.add(backWall);
          pickableMeshes.push(backWall);

          // Colored Brand Header Band along top of back wall
          const backHeader = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.02, 0.42, wallT + 0.03),
            primaryMat
          );
          backHeader.position.set(0, boothH - 0.15, -d / 2 + wallT / 2);
          sGroup.add(backHeader);

          // Brushed aluminum vertical corner mullions
          const mullionGeom = new THREE.BoxGeometry(0.055, boothH + 0.05, wallT + 0.03);
          for (const mx of [-w / 2 + 0.03, w / 2 - 0.03]) {
            const m = new THREE.Mesh(mullionGeom, aluminumMat);
            m.position.set(mx, boothH / 2 + 0.06, -d / 2 + wallT / 2);
            sGroup.add(m);
          }

          // Left Wall (-X) for Inline (1) & Corner (2)
          if (stand.openSides <= 2) {
            const leftWall = new THREE.Mesh(
              new THREE.BoxGeometry(wallT, boothH, d),
              shellWallMat
            );
            leftWall.position.set(-w / 2 + wallT / 2, boothH / 2 + 0.06, 0);
            leftWall.castShadow = true;
            leftWall.receiveShadow = true;
            leftWall.userData = { standId: stand.id };
            sGroup.add(leftWall);
            pickableMeshes.push(leftWall);

            const leftHeader = new THREE.Mesh(
              new THREE.BoxGeometry(wallT + 0.03, 0.42, d + 0.02),
              primaryMat
            );
            leftHeader.position.set(-w / 2 + wallT / 2, boothH - 0.15, 0);
            sGroup.add(leftHeader);
          }

          // Right Wall (+X) for Inline (1)
          if (stand.openSides === 1) {
            const rightWall = new THREE.Mesh(
              new THREE.BoxGeometry(wallT, boothH, d),
              shellWallMat
            );
            rightWall.position.set(w / 2 - wallT / 2, boothH / 2 + 0.06, 0);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            rightWall.userData = { standId: stand.id };
            sGroup.add(rightWall);
            pickableMeshes.push(rightWall);
          }

          // Wall-mounted 55" Display Screen on Back Wall
          if (w >= 2.6) {
            const screen = new THREE.Mesh(
              new THREE.BoxGeometry(Math.min(1.4, w * 0.42), 0.82, 0.05),
              screenGlowMat
            );
            screen.position.set(0, 1.58, -d / 2 + wallT + 0.03);
            sGroup.add(screen);
          }
        } else {
          // Island Stand (4 Open Sides) — Central architectural brand totem + overhead halo fascia
          const totemW = Math.min(2.2, w * 0.35);
          const totemD = Math.min(1.4, d * 0.3);
          const totem = new THREE.Mesh(
            new THREE.BoxGeometry(totemW, boothH + 0.4, totemD),
            primaryMat
          );
          totem.position.set(0, (boothH + 0.4) / 2 + 0.06, 0);
          totem.castShadow = true;
          totem.receiveShadow = true;
          totem.userData = { standId: stand.id };
          sGroup.add(totem);
          pickableMeshes.push(totem);

          const accentRing = new THREE.Mesh(
            new THREE.BoxGeometry(totemW + 0.08, 0.18, totemD + 0.08),
            accentMat
          );
          accentRing.position.set(0, boothH + 0.15, 0);
          sGroup.add(accentRing);
        }

        // Branded Reception Counter inside booth (adds instant scale & realism at eye-level!)
        const counterW = Math.min(1.6, w * 0.44);
        const counter = new THREE.Mesh(
          new THREE.BoxGeometry(counterW, 0.98, 0.56),
          primaryMat
        );
        counter.position.set(
          stand.openSides === 4 ? w * 0.28 : 0,
          0.55,
          d * 0.24
        );
        counter.castShadow = true;
        sGroup.add(counter);

        const counterTop = new THREE.Mesh(
          new THREE.BoxGeometry(counterW + 0.08, 0.06, 0.64),
          shellWallMat
        );
        counterTop.position.set(counter.position.x, 1.06, counter.position.z);
        sGroup.add(counterTop);

        // Overhead Fascia Signage Banner with Exhibitor Name (readable in Orbit & Walkthrough)
        if (stand.exhibitorName && area >= 9) {
          const signTex = createFasciaSignTexture(
            stand.exhibitorName,
            stand.id,
            palette.primary,
            palette.accent
          );
          const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.42 });
          const signW = Math.min(w - 0.16, 5.4);
          const signH = 0.62;
          const fascia = new THREE.Mesh(
            new THREE.BoxGeometry(signW, signH, 0.14),
            [primaryMat, primaryMat, primaryMat, primaryMat, signMat, signMat]
          );
          fascia.position.set(
            0,
            boothH + signH / 2 + 0.06,
            stand.openSides === 4 ? 0 : -d / 2 + 0.12
          );
          fascia.castShadow = true;
          fascia.userData = { standId: stand.id };
          sGroup.add(fascia);
          pickableMeshes.push(fascia);
        }
      }
    }

    // 5. Structural Hall Columns (Concrete + Dark-Steel Base Plinth + Amber Eye-Level Band)
    const pillarGroup = new THREE.Group();
    const concreteMat = new THREE.MeshStandardMaterial({
      color: '#8C9199',
      roughness: 0.86,
      metalness: 0.05,
    });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: '#d97706',
      roughness: 0.4,
      metalness: 0.15,
    });
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

      // Architectural dark-steel base plinth
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(pillar.width + 0.14, 0.32, pillar.depth + 0.14),
        darkSteelMat
      );
      base.position.set(pcx, 0.16, pcz);
      pillarGroup.add(base);

      // Subtle architectural eye-level hazard collar
      const collar = new THREE.Mesh(
        new THREE.BoxGeometry(pillar.width + 0.08, 0.36, pillar.depth + 0.08),
        hazardMat
      );
      collar.position.set(pcx, 1.62, pcz);
      pillarGroup.add(collar);
    }
    scene.add(pillarGroup);

    // 6. Toilets & Amenities Wayfinding Totems
    const amenityGroup = new THREE.Group();
    for (const am of venue.amenities) {
      const acx = am.x + am.width / 2;
      const acz = am.z + am.depth / 2;
      const color =
        am.kind === 'toilets'
          ? '#0f766e'
          : am.kind === 'catering'
          ? '#0284c7'
          : am.kind === 'first-aid'
          ? '#dc2626'
          : '#4338ca';
      const amMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 });

      const kiosk = new THREE.Mesh(new THREE.BoxGeometry(am.width, 2.8, am.depth), amMat);
      kiosk.position.set(acx, 1.4, acz);
      kiosk.castShadow = true;
      amenityGroup.add(kiosk);

      const tex = createFasciaSignTexture(
        am.kind === 'toilets' ? 'TOILETS (WC)' : am.kind.toUpperCase(),
        am.label,
        color,
        '#ffffff'
      );
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      sprite.position.set(acx, 4.1, acz);
      sprite.scale.set(5.4, 1.65, 1);
      amenityGroup.add(sprite);
    }
    scene.add(amenityGroup);

    // 7. Visitors Entrance Architectural Portals
    for (const ent of venue.entrances) {
      const portalGroup = new THREE.Group();
      portalGroup.position.set(ent.x + 1.0, 0, ent.z);

      const postGeom = new THREE.BoxGeometry(0.45, 4.4, 0.45);
      const postN = new THREE.Mesh(postGeom, darkSteelMat);
      postN.position.set(0, 2.2, -ent.widthM / 2);
      const postS = new THREE.Mesh(postGeom, darkSteelMat);
      postS.position.set(0, 2.2, ent.widthM / 2);
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.95, ent.widthM + 0.6),
        darkSteelMat
      );
      header.position.set(0, 4.35, 0);
      portalGroup.add(postN, postS, header);

      const tex = createFasciaSignTexture('VISITORS ENTRANCE', ent.label, '#111315', '#ff4d2e');
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      sprite.position.set(0, 5.7, 0);
      sprite.scale.set(8.2, 2.3, 1);
      portalGroup.add(sprite);
      scene.add(portalGroup);
    }

    // 8. Stylized 1.75m Architectural Human Scale Figures in Main Aisles
    const personBodyMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.72,
      metalness: 0.04,
    });
    const personBodyMatAlt = new THREE.MeshStandardMaterial({
      color: '#64748b',
      roughness: 0.72,
      metalness: 0.04,
    });
    const personLegMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.78,
      metalness: 0.04,
    });
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

    // Competitor Beacons Group
    const competitorGroup = new THREE.Group();
    scene.add(competitorGroup);

    // Architectural Selection Frame (Coral-Vermilion perimeter glow)
    const selectionFrame = new THREE.Group();
    const selBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.14, 1),
      new THREE.MeshBasicMaterial({
        color: '#ff4d2e',
        transparent: true,
        opacity: 0.32,
      })
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
      standGroups,
      standBaseMeshes,
      pillarGroup,
      amenityGroup,
      competitorGroup,
      selectionFrame,
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
        camera.position.x = Math.max(-4, Math.min(venue.widthM + 10, camera.position.x));
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

  // Sync layers, selection ring & competitor beacons
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    refs.pillarGroup.visible = layers.pillars;
    refs.amenityGroup.visible = layers.amenities;

    for (const stand of venue.stands) {
      const grp = refs.standGroups.get(stand.id);
      if (!grp) continue;
      const isSelected = stand.id === selectedStandId;
      const isCompetitor = layers.competitors && competitorStandIds.has(stand.id);
      const isMatching = matchingStandIds.has(stand.id);
      // Keep features always visible; subtly dim non-matching plots
      grp.visible = true;
      const baseMesh = refs.standBaseMeshes.get(stand.id);
      if (baseMesh && !Array.isArray(baseMesh.material)) {
        const mat = baseMesh.material as THREE.MeshStandardMaterial;
        if (isCompetitor) {
          mat.color.set('#dc2626');
        } else if (stand.status === 'reserved') {
          mat.opacity = isMatching || isSelected ? 0.78 : 0.28;
        }
      }
    }

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
        sprite.position.set(cx, 5.6, cz);
        sprite.scale.set(6.4, 1.8, 1);
        refs.competitorGroup.add(sprite);
      }
    }
  }, [venue, matchingStandIds, selectedStandId, competitorStandIds, layers]);

  // Smart Camera Positioning for Orbit Focus & Unobstructed Eye-Level Walkthrough
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    const placeWalkCameraForStand = (stand: VenueStand) => {
      const cx = stand.x + stand.width / 2;
      const cz = stand.z + stand.depth / 2;
      const candidates = [
        { x: cx, z: stand.z - 2.4 }, // North aisle
        { x: cx, z: stand.z + stand.depth + 2.4 }, // South aisle
        { x: stand.x - 2.4, z: cz }, // West aisle
        { x: stand.x + stand.width + 2.4, z: cz }, // East aisle
        { x: stand.x - 2.0, z: stand.z - 2.0 }, // NW diagonal aisle
        { x: stand.x + stand.width + 2.0, z: stand.z - 2.0 }, // NE diagonal aisle
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
      refs.walkPitch = -0.05;
    };

    if (focusTrigger) {
      const stand = venue.stands.find((s) => s.id === focusTrigger.standId);
      if (stand) {
        const cx = stand.x + stand.width / 2;
        const cz = stand.z + stand.depth / 2;
        if (focusTrigger.walk || cameraMode === 'walk') {
          placeWalkCameraForStand(stand);
        } else {
          refs.controls.target.set(cx, 1.0, cz);
          refs.camera.position.set(cx + 18, 17, cz + 20);
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
            <strong>Eye-Level Walkthrough (1.68m)</strong>
          </span>
          <span>
            • Use <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> or Arrow keys to walk aisles
          </span>
          <span>• Drag to look around</span>
          <span>
            • Hold <kbd>Shift</kbd> to walk faster
          </span>
        </div>
      )}
    </div>
  );
};
