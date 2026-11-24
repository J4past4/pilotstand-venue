import * as THREE from 'three';
import type {
  AssetPrimitive,
  AssetPrimitiveFinish,
  AssetPrimitiveKind,
  Dimensions3D,
  StandItem,
} from '../types/stand';

export interface PrimitivesBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  dims: Dimensions3D; // meters
}

export function createPrimitiveId(): string {
  return `prim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createDefaultPrimitive(
  kind: AssetPrimitiveKind,
  count: number
): AssetPrimitive {
  const id = createPrimitiveId();
  switch (kind) {
    case 'cylinder':
      return {
        id,
        label: `Turntable / Cylinder ${count}`,
        kind: 'cylinder',
        w: 1650,
        h: 120,
        d: 1650,
        x: 0,
        y: 0,
        z: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: '#475569',
        finish: 'dark-steel',
      };
    case 'cone':
      return {
        id,
        label: `Hopper / Cone ${count}`,
        kind: 'cone',
        w: 800,
        h: 700,
        d: 800,
        x: 0,
        y: 0,
        z: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: '#CBD5E1',
        finish: 'metal',
      };
    case 'sphere':
      return {
        id,
        label: `Dome / Tank ${count}`,
        kind: 'sphere',
        w: 900,
        h: 900,
        d: 900,
        x: 0,
        y: 0,
        z: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: '#E2E8F0',
        finish: 'matte',
      };
    case 'wedge':
      return {
        id,
        label: `Ramp / Wedge ${count}`,
        kind: 'wedge',
        w: 1200,
        h: 120,
        d: 900,
        x: 0,
        y: 0,
        z: 950,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: '#64748B',
        finish: 'dark-steel',
      };
    case 'ring':
      return {
        id,
        label: `Ring / Collar ${count}`,
        kind: 'ring',
        w: 1200,
        h: 140,
        d: 1200,
        x: 0,
        y: 0,
        z: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: '#D95D39',
        finish: 'accent',
      };
    case 'box':
    default:
      return {
        id,
        label: `Box / Mast ${count}`,
        kind: 'box',
        w: 400,
        h: 2200,
        d: 400,
        x: 0,
        y: 0,
        z: -850,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        color: '#E2E8F0',
        finish: 'metal',
      };
  }
}

export interface CustomAssetPreset {
  id: string;
  name: string;
  subtitle: string;
  primitives: Omit<AssetPrimitive, 'id'>[];
}

export const CUSTOM_ASSET_PRESETS: CustomAssetPreset[] = [
  {
    id: 'pallet-wrapper',
    name: 'Pallet Wrapper (1650 Turntable + Mast)',
    subtitle: 'Ø1650mm low turntable, 2.4m vertical mast, film carriage & ramp',
    primitives: [
      {
        label: '1650 Turntable',
        kind: 'cylinder',
        w: 1650,
        h: 95,
        d: 1650,
        x: 0,
        y: 0,
        z: 220,
        rotY: 0,
        color: '#334155',
        finish: 'dark-steel',
      },
      {
        label: 'Base Frame',
        kind: 'box',
        w: 720,
        h: 95,
        d: 1150,
        x: 0,
        y: 0,
        z: -560,
        rotY: 0,
        color: '#475569',
        finish: 'dark-steel',
      },
      {
        label: 'Vertical Mast',
        kind: 'box',
        w: 360,
        h: 2400,
        d: 320,
        x: 0,
        y: 95,
        z: -950,
        rotY: 0,
        color: '#E2E8F0',
        finish: 'metal',
      },
      {
        label: 'Film Carriage',
        kind: 'box',
        w: 440,
        h: 560,
        d: 280,
        x: 0,
        y: 950,
        z: -680,
        rotY: 0,
        color: '#D95D39',
        finish: 'accent',
      },
      {
        label: 'Control Panel',
        kind: 'box',
        w: 240,
        h: 340,
        d: 140,
        x: 260,
        y: 1220,
        z: -860,
        rotY: 18,
        color: '#1E293B',
        finish: 'matte',
      },
      {
        label: 'Loading Ramp',
        kind: 'wedge',
        w: 1100,
        h: 95,
        d: 850,
        x: 0,
        y: 0,
        z: 1420,
        rotY: 0,
        color: '#64748B',
        finish: 'dark-steel',
      },
    ],
  },
  {
    id: 'industrial-enclosure',
    name: 'Industrial Machine Enclosure',
    subtitle: 'Heavy plinth, main cabinet, HMI arm & safety beacon',
    primitives: [
      {
        label: 'Base Plinth',
        kind: 'box',
        w: 1800,
        h: 240,
        d: 1300,
        x: 0,
        y: 0,
        z: 0,
        color: '#334155',
        finish: 'dark-steel',
      },
      {
        label: 'Main Housing',
        kind: 'box',
        w: 1700,
        h: 1550,
        d: 1180,
        x: 0,
        y: 240,
        z: -20,
        color: '#E2E8F0',
        finish: 'metal',
      },
      {
        label: 'Viewing Window',
        kind: 'box',
        w: 960,
        h: 720,
        d: 40,
        x: -140,
        y: 860,
        z: 580,
        color: '#BAE6FD',
        finish: 'glass',
      },
      {
        label: 'HMI Console',
        kind: 'box',
        w: 380,
        h: 460,
        d: 120,
        x: 1020,
        y: 1150,
        z: 420,
        rotY: -18,
        color: '#1E293B',
        finish: 'matte',
      },
      {
        label: 'Status Beacon',
        kind: 'cylinder',
        w: 90,
        h: 240,
        d: 90,
        x: 680,
        y: 1790,
        z: 360,
        color: '#22C55E',
        finish: 'accent',
      },
    ],
  },
  {
    id: 'conveyor-hopper',
    name: 'Conveyor & Hopper Unit',
    subtitle: '2.2m conveyor bed, support legs & stainless hopper',
    primitives: [
      {
        label: 'Conveyor Bed',
        kind: 'box',
        w: 2200,
        h: 180,
        d: 750,
        x: 0,
        y: 820,
        z: 0,
        color: '#475569',
        finish: 'dark-steel',
      },
      {
        label: 'Left Support Frame',
        kind: 'box',
        w: 140,
        h: 820,
        d: 680,
        x: -880,
        y: 0,
        z: 0,
        color: '#CBD5E1',
        finish: 'metal',
      },
      {
        label: 'Right Support Frame',
        kind: 'box',
        w: 140,
        h: 820,
        d: 680,
        x: 880,
        y: 0,
        z: 0,
        color: '#CBD5E1',
        finish: 'metal',
      },
      {
        label: 'Feed Hopper',
        kind: 'cone',
        w: 760,
        h: 640,
        d: 760,
        x: -620,
        y: 1000,
        z: 0,
        rotX: 180,
        color: '#E2E8F0',
        finish: 'metal',
      },
      {
        label: 'Drive Motor',
        kind: 'cylinder',
        w: 320,
        h: 460,
        d: 320,
        x: 880,
        y: 740,
        z: -480,
        rotZ: 90,
        color: '#1B365D',
        finish: 'accent',
      },
    ],
  },
  {
    id: 'display-plinth',
    name: 'Stepped Showcase Pedestal',
    subtitle: 'Circular tiered plinth with clear display vitrine',
    primitives: [
      {
        label: 'Base Tier',
        kind: 'cylinder',
        w: 1200,
        h: 160,
        d: 1200,
        x: 0,
        y: 0,
        z: 0,
        color: '#1B365D',
        finish: 'matte',
      },
      {
        label: 'Pedestal Column',
        kind: 'cylinder',
        w: 780,
        h: 840,
        d: 780,
        x: 0,
        y: 160,
        z: 0,
        color: '#F8FAFC',
        finish: 'matte',
      },
      {
        label: 'Accent Collar',
        kind: 'ring',
        w: 840,
        h: 60,
        d: 840,
        x: 0,
        y: 960,
        z: 0,
        color: '#D95D39',
        finish: 'accent',
      },
      {
        label: 'Glass Showcase Hood',
        kind: 'box',
        w: 620,
        h: 620,
        d: 620,
        x: 0,
        y: 1000,
        z: 0,
        color: '#E0F2FE',
        finish: 'glass',
      },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Canvas',
    subtitle: 'Start with a single block and add your own dimensions',
    primitives: [
      {
        label: 'Base Block',
        kind: 'box',
        w: 1000,
        h: 1000,
        d: 1000,
        x: 0,
        y: 0,
        z: 0,
        color: '#CBD5E1',
        finish: 'metal',
      },
    ],
  },
];

export function instantiatePresetPrimitives(presetId: string): AssetPrimitive[] {
  const preset = CUSTOM_ASSET_PRESETS.find((p) => p.id === presetId) || CUSTOM_ASSET_PRESETS[0];
  return preset.primitives.map((p) => ({
    ...p,
    id: createPrimitiveId(),
    rotX: p.rotX ?? 0,
    rotY: p.rotY ?? 0,
    rotZ: p.rotZ ?? 0,
  }));
}

function makeMaterial(
  color: string,
  finish: AssetPrimitiveFinish,
  isSelected: boolean,
  overrideTint?: string
): THREE.Material {
  const col = overrideTint || color || '#CBD5E1';
  if (finish === 'glass') {
    return new THREE.MeshPhysicalMaterial({
      color: col,
      transparent: true,
      opacity: 0.36,
      roughness: 0.08,
      metalness: 0.08,
      emissive: isSelected ? new THREE.Color('#2563EB') : new THREE.Color('#000000'),
      emissiveIntensity: isSelected ? 0.22 : 0,
    });
  }

  let metalness = 0.08;
  let roughness = 0.55;
  if (finish === 'metal') {
    metalness = 0.58;
    roughness = 0.32;
  } else if (finish === 'dark-steel') {
    metalness = 0.65;
    roughness = 0.36;
  } else if (finish === 'accent') {
    metalness = 0.18;
    roughness = 0.42;
  }

  return new THREE.MeshStandardMaterial({
    color: col,
    metalness,
    roughness,
    emissive: isSelected ? new THREE.Color('#1D4ED8') : new THREE.Color('#000000'),
    emissiveIntensity: isSelected ? 0.18 : 0,
  });
}

function buildWedgeGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  // Right-triangle wedge: tall at back (-z = -d/2), tapering down to front (+z = +d/2)
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, -h / 2);
  shape.lineTo(d / 2, -h / 2);
  shape.lineTo(-d / 2, h / 2);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: w,
    bevelEnabled: false,
  });
  // ExtrudeGeometry extrudes along +Z, so rotateY(-PI/2) puts extrusion along X and profile along Z/Y
  geom.translate(0, 0, -w / 2);
  geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

function buildRingGeometry(outerDiam: number, h: number): THREE.BufferGeometry {
  const outerR = Math.max(0.01, outerDiam / 2);
  const innerR = Math.max(0.004, outerR * 0.64);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.005, h),
    bevelEnabled: false,
    curveSegments: 32,
  });
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, -h / 2, 0);
  geom.computeVertexNormals();
  return geom;
}

function buildExtrusionGeometry(prim: AssetPrimitive): THREE.BufferGeometry {
  const pts = prim.points && prim.points.length >= 3 ? prim.points : [
    { x: -prim.w / 2, y: -prim.d / 2 },
    { x: prim.w / 2, y: -prim.d / 2 },
    { x: prim.w / 2, y: prim.d / 2 },
    { x: -prim.w / 2, y: prim.d / 2 },
  ];

  const shape = new THREE.Shape();
  const axis = prim.extrudeAxis || 'y';

  if (axis === 'y') {
    // Top-down plan: (x, y) in mm -> (x, -z) in 2D shape before rotating -PI/2 around X
    pts.forEach((pt, idx) => {
      const sx = pt.x / 1000;
      const sy = -pt.y / 1000;
      if (idx === 0) shape.moveTo(sx, sy);
      else shape.lineTo(sx, sy);
    });
    shape.closePath();

    const heightM = Math.max(0.01, prim.h / 1000);
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: heightM,
      bevelEnabled: false,
    });
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, -heightM / 2, 0);
    geom.computeVertexNormals();
    return geom;
  } else {
    // Front elevation: (x, y) in mm -> (x, y) in 2D shape extruded along Z by depth d
    pts.forEach((pt, idx) => {
      const sx = pt.x / 1000;
      const sy = pt.y / 1000;
      if (idx === 0) shape.moveTo(sx, sy);
      else shape.lineTo(sx, sy);
    });
    shape.closePath();

    const depthM = Math.max(0.01, prim.d / 1000);
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: depthM,
      bevelEnabled: false,
    });
    geom.translate(0, 0, -depthM / 2);
    geom.computeVertexNormals();
    return geom;
  }
}

export function buildSinglePrimitiveMesh(
  prim: AssetPrimitive,
  isSelected = false,
  overrideTint?: string
): THREE.Group {
  const holder = new THREE.Group();
  holder.userData.primitiveId = prim.id;

  const w = Math.max(0.01, prim.w / 1000);
  const h = Math.max(0.01, prim.h / 1000);
  const d = Math.max(0.01, prim.d / 1000);

  let geometry: THREE.BufferGeometry;
  switch (prim.kind) {
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(w / 2, w / 2, h, 36);
      break;
    case 'cone':
      geometry = new THREE.CylinderGeometry(Math.max(0.01, w * 0.14), w / 2, h, 32);
      break;
    case 'sphere': {
      geometry = new THREE.SphereGeometry(0.5, 24, 18);
      geometry.scale(w, h, d);
      break;
    }
    case 'wedge':
      geometry = buildWedgeGeometry(w, h, d);
      break;
    case 'ring':
      geometry = buildRingGeometry(w, h);
      break;
    case 'extrusion':
      geometry = buildExtrusionGeometry(prim);
      break;
    case 'box':
    default:
      geometry = new THREE.BoxGeometry(w, h, d);
      break;
  }

  const mat = makeMaterial(prim.color, prim.finish, isSelected, overrideTint);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.primitiveId = prim.id;
  holder.add(mesh);

  if (isSelected) {
    const edges = new THREE.EdgesGeometry(geometry, 25);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: '#2563EB' })
    );
    holder.add(line);
  }

  // Position: x, z are center in mm; y is bottom elevation from floor in mm
  holder.position.set(prim.x / 1000, prim.y / 1000 + h / 2, prim.z / 1000);
  holder.rotation.set(
    ((prim.rotX ?? 0) * Math.PI) / 180,
    ((prim.rotY ?? 0) * Math.PI) / 180,
    ((prim.rotZ ?? 0) * Math.PI) / 180
  );

  return holder;
}

export function buildPrimitivesGroup(
  primitives: AssetPrimitive[],
  options?: {
    selectedPrimitiveId?: string | null;
    overrideTint?: string;
    centerOnFloor?: boolean;
  }
): THREE.Group {
  const root = new THREE.Group();
  const inner = new THREE.Group();

  for (const prim of primitives) {
    const m = buildSinglePrimitiveMesh(
      prim,
      options?.selectedPrimitiveId === prim.id,
      options?.overrideTint
    );
    inner.add(m);
  }

  root.add(inner);

  if (options?.centerOnFloor && primitives.length > 0) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    if (!box.isEmpty()) {
      const center = new THREE.Vector3();
      box.getCenter(center);
      inner.position.x -= center.x;
      inner.position.z -= center.z;
      inner.position.y -= box.min.y;
    }
  }

  return root;
}

export function computePrimitivesBounds(primitives: AssetPrimitive[]): PrimitivesBounds {
  if (primitives.length === 0) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0,
      widthMm: 1000,
      heightMm: 1000,
      depthMm: 1000,
      dims: { w: 1, h: 1, d: 1 },
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const p of primitives) {
    const effD = p.kind === 'cylinder' || p.kind === 'cone' || p.kind === 'ring' ? p.w : p.d;
    const hw = p.w / 2;
    const hd = effD / 2;
    minX = Math.min(minX, p.x - hw);
    maxX = Math.max(maxX, p.x + hw);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y + p.h);
    minZ = Math.min(minZ, p.z - hd);
    maxZ = Math.max(maxZ, p.z + hd);
  }

  const widthMm = Math.max(50, Math.round(maxX - minX));
  const heightMm = Math.max(50, Math.round(maxY - minY));
  const depthMm = Math.max(50, Math.round(maxZ - minZ));

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    widthMm,
    heightMm,
    depthMm,
    dims: {
      w: Math.max(0.1, Number((widthMm / 1000).toFixed(2))),
      h: Math.max(0.1, Number((heightMm / 1000).toFixed(2))),
      d: Math.max(0.1, Number((depthMm / 1000).toFixed(2))),
    },
  };
}

export function buildCustomBuiltAssetMesh(item: StandItem): THREE.Group {
  const outer = new THREE.Group();
  outer.name = `item:${item.id}`;
  outer.userData.itemId = item.id;

  const primitives = item.customPrimitives || [];
  if (primitives.length === 0) {
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(item.dims.w, item.dims.h, item.dims.d),
      new THREE.MeshStandardMaterial({ color: '#94A3B8', roughness: 0.55 })
    );
    fallback.position.y = item.dims.h / 2;
    fallback.castShadow = true;
    fallback.receiveShadow = true;
    outer.add(fallback);
  } else {
    const built = buildPrimitivesGroup(primitives, {
      overrideTint: item.modelTintColor,
      centerOnFloor: true,
    });
    built.updateMatrixWorld(true);
    const curBox = new THREE.Box3().setFromObject(built);
    const curSize = new THREE.Vector3();
    curBox.getSize(curSize);

    const sx = item.dims.w / Math.max(0.001, curSize.x);
    const sy = item.dims.h / Math.max(0.001, curSize.y);
    const sz = item.dims.d / Math.max(0.001, curSize.z);
    built.scale.set(sx, sy, sz);
    outer.add(built);
  }

  outer.traverse((child) => {
    child.userData.itemId = item.id;
  });

  outer.position.set(item.x, item.y, item.z);
  outer.rotation.y = (item.rotationY * Math.PI) / 180;
  outer.visible = item.visible !== false;

  return outer;
}

/**
 * Generates a crisp technical 2D top-down schematic SVG of a pallet wrapper
 * (Ø1650mm turntable + mast + base + ramp) so users can test 2D schematic
 * auto-generation and tracing in one click.
 */
export function createSampleSchematicDataUrl(): {
  dataUrl: string;
  realWidthMm: number;
  name: string;
} {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 720" width="900" height="720">
    <rect width="900" height="720" fill="#FFFFFF"/>
    <g stroke="#E2E8F0" stroke-width="1">
      <line x1="0" y1="120" x2="900" y2="120"/>
      <line x1="0" y1="240" x2="900" y2="240"/>
      <line x1="0" y1="360" x2="900" y2="360"/>
      <line x1="0" y1="480" x2="900" y2="480"/>
      <line x1="0" y1="600" x2="900" y2="600"/>
      <line x1="150" y1="0" x2="150" y2="720"/>
      <line x1="300" y1="0" x2="300" y2="720"/>
      <line x1="450" y1="0" x2="450" y2="720"/>
      <line x1="600" y1="0" x2="600" y2="720"/>
      <line x1="750" y1="0" x2="750" y2="720"/>
    </g>
    <!-- Border frame -->
    <rect x="20" y="20" width="860" height="680" fill="none" stroke="#1E293B" stroke-width="2"/>
    <!-- Vertical Mast (top-down footprint: 380x320mm) -->
    <rect x="120" y="295" width="95" height="130" fill="#CBD5E1" stroke="#0F172A" stroke-width="4"/>
    <!-- Base Frame connecting mast to turntable -->
    <rect x="215" y="315" width="125" height="90" fill="#E2E8F0" stroke="#0F172A" stroke-width="3.5"/>
    <!-- 1650mm Turntable (circle) -->
    <circle cx="510" cy="360" r="190" fill="#DBEAFE" stroke="#0F172A" stroke-width="4.5"/>
    <circle cx="510" cy="360" r="24" fill="#94A3B8" stroke="#0F172A" stroke-width="2"/>
    <!-- Control Box -->
    <rect x="135" y="455" width="75" height="55" fill="#FED7AA" stroke="#0F172A" stroke-width="3"/>
    <!-- Dimension Callouts -->
    <g stroke="#2563EB" stroke-width="1.8" fill="#1D4ED8" font-family="monospace" font-size="16" font-weight="bold">
      <line x1="320" y1="130" x2="700" y2="130"/>
      <line x1="320" y1="120" x2="320" y2="140"/>
      <line x1="700" y1="120" x2="700" y2="140"/>
      <text x="452" y="118">Ø 1650 mm</text>
      <line x1="120" y1="620" x2="700" y2="620"/>
      <line x1="120" y1="610" x2="120" y2="630"/>
      <line x1="700" y1="610" x2="700" y2="630"/>
      <text x="348" y="646">OVERALL 2520 mm</text>
    </g>
    <g font-family="sans-serif" font-size="14" fill="#0F172A" font-weight="600">
      <text x="128" y="282">MAST (H:2400)</text>
      <text x="448" y="398">TURNTABLE (H:95)</text>
      <text x="122" y="532">CTRL</text>
      <text x="44" y="56" font-size="16" font-weight="700">PALLET WRAPPER — TOP PLAN SCHEMATIC (SCALE 1:10)</text>
    </g>
  </svg>`;
  return {
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    realWidthMm: 3900,
    name: 'Pallet Wrapper Plan Schematic',
  };
}
