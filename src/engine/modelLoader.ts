import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { CustomModelAsset, CustomModelFormat, Dimensions3D, StandItem } from '../types/stand';

interface LoadedModelEntry {
  prototype: THREE.Group;
  rawSize: THREE.Vector3;
  hasNativeMaterials: boolean;
}

const modelCache = new Map<string, LoadedModelEntry>();

export function detectModelFormat(filename: string): CustomModelFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'glb' || ext === 'gltf' || ext === 'stl' || ext === 'obj') {
    return ext;
  }
  return null;
}

export function isSupportedModelFile(file: File): boolean {
  return detectModelFormat(file.name) !== null;
}

function normalizePrototype(
  root: THREE.Object3D,
  hasNativeMaterials: boolean
): { group: THREE.Group; dims: Dimensions3D; rawSize: THREE.Vector3 } {
  const wrapper = new THREE.Group();
  wrapper.add(root);

  // Measure initial bounds
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrapper);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);

  // Auto-detect CAD units:
  // Industrial CAD exports (.stl / .obj) are often exported in millimetres (e.g., 1500mm -> 1.5m)
  let unitScale = 1;
  if (maxDim > 80) {
    unitScale = 0.001; // mm -> m
  } else if (maxDim > 12) {
    unitScale = 0.01; // cm -> m
  } else if (maxDim < 0.05) {
    unitScale = 1.2 / maxDim; // tiny unitless mesh -> 1.2m showcase scale
  }

  // Clamp extreme post-conversion scale to a practical exhibition range (0.25m to 4.5m)
  const scaledMax = maxDim * unitScale;
  if (scaledMax > 4.5) {
    unitScale *= 2.0 / scaledMax;
  } else if (scaledMax < 0.25) {
    unitScale *= 1.0 / scaledMax;
  }

  root.scale.multiplyScalar(unitScale);
  wrapper.updateMatrixWorld(true);

  const normBox = new THREE.Box3().setFromObject(wrapper);
  const normSize = new THREE.Vector3();
  const normCenter = new THREE.Vector3();
  normBox.getSize(normSize);
  normBox.getCenter(normCenter);

  // Center X/Z at 0 and sit flush on y = 0 floor
  root.position.x -= normCenter.x;
  root.position.z -= normCenter.z;
  root.position.y -= normBox.min.y;

  // Ensure shadows and sane PBR defaults
  wrapper.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (!hasNativeMaterials && !mesh.material) {
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#CBD5E1',
          metalness: 0.35,
          roughness: 0.42,
        });
      }
    }
  });

  const dims: Dimensions3D = {
    w: Math.max(0.15, Number(normSize.x.toFixed(2))),
    h: Math.max(0.15, Number(normSize.y.toFixed(2))),
    d: Math.max(0.15, Number(normSize.z.toFixed(2))),
  };

  return { group: wrapper, dims, rawSize: normSize };
}

export async function parseAndRegister3DModel(file: File): Promise<CustomModelAsset> {
  const format = detectModelFormat(file.name);
  if (!format) {
    throw new Error('Unsupported 3D format. Please use .glb, .gltf, .stl, or .obj.');
  }

  const buffer = await file.arrayBuffer();
  const id = `model-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const cleanName = file.name.replace(/\.[^.]+$/, '');
  const blobUrl = URL.createObjectURL(file);

  let loadedRoot: THREE.Object3D;
  let hasNativeMaterials = true;

  if (format === 'glb' || format === 'gltf') {
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });
    loadedRoot = gltf.scene;
    hasNativeMaterials = true;
  } else if (format === 'stl') {
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: '#D4DBE3',
      metalness: 0.38,
      roughness: 0.38,
    });
    loadedRoot = new THREE.Mesh(geometry, material);
    hasNativeMaterials = false;
  } else {
    // OBJ
    const loader = new OBJLoader();
    const text = new TextDecoder().decode(buffer);
    const objGroup = loader.parse(text);
    const defaultMat = new THREE.MeshStandardMaterial({
      color: '#D4DBE3',
      metalness: 0.32,
      roughness: 0.44,
    });
    objGroup.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        if (!mesh.geometry.attributes.normal) {
          mesh.geometry.computeVertexNormals();
        }
        mesh.material = defaultMat.clone();
      }
    });
    loadedRoot = objGroup;
    hasNativeMaterials = false;
  }

  const { group, dims, rawSize } = normalizePrototype(loadedRoot, hasNativeMaterials);
  modelCache.set(id, {
    prototype: group,
    rawSize,
    hasNativeMaterials,
  });

  return {
    id,
    name: cleanName,
    format,
    fileSizeBytes: file.size,
    originalDims: dims,
    blobUrl,
  };
}

/**
 * Generates an authentic, clean demo CAD showcase machine (.obj) so users can test
 * custom 3D model placement, scaling, rotation, and tinting in 1 click.
 */
export function registerSampleShowcaseMachine(): CustomModelAsset {
  const existingId = 'sample-cnc-machine';
  if (modelCache.has(existingId)) {
    const cached = modelCache.get(existingId)!;
    return {
      id: existingId,
      name: 'Precision CNC Showcase Unit (Sample)',
      format: 'glb',
      fileSizeBytes: 18400,
      originalDims: {
        w: Number(cached.rawSize.x.toFixed(2)),
        h: Number(cached.rawSize.y.toFixed(2)),
        d: Number(cached.rawSize.z.toFixed(2)),
      },
      blobUrl: '',
    };
  }

  const root = new THREE.Group();
  const housingMat = new THREE.MeshStandardMaterial({
    color: '#E6EAEF',
    metalness: 0.25,
    roughness: 0.38,
  });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: '#252B34',
    metalness: 0.65,
    roughness: 0.3,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: '#D95D39',
    metalness: 0.2,
    roughness: 0.4,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#D8EEF8',
    transparent: true,
    opacity: 0.36,
    roughness: 0.08,
    metalness: 0.1,
  });

  // Heavy industrial base plinth
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 1.1), darkSteel);
  base.position.y = 0.11;
  root.add(base);

  // Main machine enclosure body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.38, 1.0), housingMat);
  body.position.set(0, 0.91, -0.02);
  root.add(body);

  // Recessed dark interior chamber + viewing window
  const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.72, 0.14), darkSteel);
  chamber.position.set(-0.14, 1.06, 0.44);
  root.add(chamber);

  const windowPane = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.68, 0.03), glassMat);
  windowPane.position.set(-0.14, 1.06, 0.51);
  root.add(windowPane);

  // Interior rotary spindle & precision table
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 16), accentMat);
  spindle.position.set(-0.14, 1.18, 0.44);
  root.add(spindle);

  // Side HMI touchscreen control console arm
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), darkSteel);
  arm.position.set(0.76, 1.24, 0.34);
  root.add(arm);

  const hmiPanel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.05), darkSteel);
  hmiPanel.position.set(0.84, 1.24, 0.4);
  hmiPanel.rotation.y = -0.25;
  root.add(hmiPanel);

  const hmiScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.22),
    new THREE.MeshBasicMaterial({ color: '#38BDF8' })
  );
  hmiScreen.position.set(0.83, 1.3, 0.43);
  hmiScreen.rotation.y = -0.25;
  root.add(hmiScreen);

  // Accent header stripe + status beacon light
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.1, 1.02), accentMat);
  stripe.position.set(0, 1.56, -0.02);
  root.add(stripe);

  const beaconPole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.24, 8), darkSteel);
  beaconPole.position.set(0.55, 1.72, 0.2);
  root.add(beaconPole);

  const beaconLight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.12, 12),
    new THREE.MeshBasicMaterial({ color: '#22C55E' })
  );
  beaconLight.position.set(0.55, 1.86, 0.2);
  root.add(beaconLight);

  const { group, dims, rawSize } = normalizePrototype(root, true);
  modelCache.set(existingId, {
    prototype: group,
    rawSize,
    hasNativeMaterials: true,
  });

  return {
    id: existingId,
    name: 'Precision CNC Showcase Unit (Sample)',
    format: 'glb',
    fileSizeBytes: 18400,
    originalDims: dims,
    blobUrl: '',
  };
}

export function buildCustomModelMesh(item: StandItem): THREE.Group {
  const outer = new THREE.Group();
  outer.name = `item:${item.id}`;
  outer.userData.itemId = item.id;

  const entry = item.customModelId ? modelCache.get(item.customModelId) : undefined;
  if (!entry) {
    // Graceful placeholder box if loaded from saved JSON whose binary 3D file needs re-attaching
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(item.dims.w, item.dims.h, item.dims.d),
      new THREE.MeshStandardMaterial({
        color: '#94A3B8',
        roughness: 0.6,
        wireframe: false,
      })
    );
    fallback.position.y = item.dims.h / 2;
    fallback.castShadow = true;
    fallback.receiveShadow = true;
    outer.add(fallback);
  } else {
    const clone = entry.prototype.clone(true);

    // Clone materials so per-instance tinting / disposal never mutates cached prototype
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const clonedMats = mats.map((m) => {
          const cm = m.clone();
          if (item.modelTintColor && cm instanceof THREE.MeshStandardMaterial) {
            cm.color.set(item.modelTintColor);
          }
          return cm;
        });
        mesh.material = Array.isArray(mesh.material) ? clonedMats : clonedMats[0];
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.sharedGeometry = true;
      }
    });

    // Optional CAD Z-Up -> Y-Up rotation fix
    const innerPivot = new THREE.Group();
    innerPivot.add(clone);
    if (item.zUpFix) {
      clone.rotation.x = -Math.PI / 2;
      innerPivot.updateMatrixWorld(true);
      const rotBox = new THREE.Box3().setFromObject(innerPivot);
      const rotCenter = new THREE.Vector3();
      rotBox.getCenter(rotCenter);
      clone.position.x -= rotCenter.x;
      clone.position.z -= rotCenter.z;
      clone.position.y -= rotBox.min.y;
    }

    // Measure current normalized size and scale cleanly to requested item.dims
    innerPivot.updateMatrixWorld(true);
    const curBox = new THREE.Box3().setFromObject(innerPivot);
    const curSize = new THREE.Vector3();
    curBox.getSize(curSize);

    const sx = item.dims.w / Math.max(0.001, curSize.x);
    const sy = item.dims.h / Math.max(0.001, curSize.y);
    const sz = item.dims.d / Math.max(0.001, curSize.z);
    innerPivot.scale.set(sx, sy, sz);

    outer.add(innerPivot);
  }

  outer.traverse((child) => {
    child.userData.itemId = item.id;
  });

  outer.position.set(item.x, item.y, item.z);
  outer.rotation.y = (item.rotationY * Math.PI) / 180;
  outer.visible = item.visible !== false;

  return outer;
}
