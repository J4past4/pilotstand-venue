import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  Check,
  Circle,
  Copy,
  Cylinder,
  FileImage,
  Layers,
  Loader2,
  MousePointer2,
  Pentagon,
  Plus,
  Ruler,
  ScanSearch,
  Sparkles,
  Square,
  Trash2,
  Triangle,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import {
  buildPrimitivesGroup,
  computePrimitivesBounds,
  createDefaultPrimitive,
  createPrimitiveId,
  createSampleSchematicDataUrl,
  CUSTOM_ASSET_CATEGORIES,
  CUSTOM_ASSET_PRESETS,
  instantiatePresetPrimitives,
} from '../engine/customAssetMesh';
import type {
  AssetPrimitive,
  AssetPrimitiveFinish,
  AssetPrimitiveKind,
  CustomAssetCategory,
  CustomBuiltAsset,
} from '../types/stand';
import {
  analyzeSchematicLocally,
  analyzeSchematicWithAI,
  type SchematicViewPlane,
} from '../utils/schematicAnalyzer';
import './customAssetBuilder.css';

export type BuilderMode = 'shapes' | 'schematic';
type TraceTool = 'select' | 'calibrate' | 'box' | 'circle' | 'polygon';

interface CustomAssetBuilderModalProps {
  initialMode?: BuilderMode;
  launchContext?: 'editor' | 'dashboard';
  editingAsset?: {
    itemId?: string;
    assetId?: string;
    name: string;
    category?: CustomAssetCategory;
    primitives: AssetPrimitive[];
  } | null;
  onClose: () => void;
  onSaveAsset: (
    asset: CustomBuiltAsset,
    options: { editingItemId?: string; placeOnStand?: boolean; keepOpen?: boolean }
  ) => void;
}

const COLOR_SWATCHES = [
  '#E2E8F0',
  '#CBD5E1',
  '#64748B',
  '#334155',
  '#1E293B',
  '#1B365D',
  '#D95D39',
  '#0F766E',
  '#EAB308',
  '#BAE6FD',
];

const FINISH_OPTIONS: { id: AssetPrimitiveFinish; label: string }[] = [
  { id: 'metal', label: 'Metal' },
  { id: 'dark-steel', label: 'Dark Steel' },
  { id: 'matte', label: 'Matte' },
  { id: 'accent', label: 'Accent' },
  { id: 'glass', label: 'Glass' },
];

const SHAPE_TOOLS: { kind: AssetPrimitiveKind; label: string; hint: string }[] = [
  { kind: 'box', label: 'Box / Mast', hint: 'Rectangle, mast, cabinet' },
  { kind: 'cylinder', label: 'Cylinder', hint: 'Turntable, drum, column' },
  { kind: 'wedge', label: 'Ramp / Wedge', hint: 'Loading ramp, chute' },
  { kind: 'cone', label: 'Cone / Hopper', hint: 'Tapered funnel, hopper' },
  { kind: 'sphere', label: 'Dome / Tank', hint: 'Rounded tank, dome' },
  { kind: 'ring', label: 'Ring / Collar', hint: 'Hollow ring, flange' },
];

/* ==================== LIVE 3D PREVIEW SUB-COMPONENT ==================== */

interface Preview3DProps {
  primitives: AssetPrimitive[];
  selectedId: string | null;
  onSelectPrimitive: (id: string) => void;
  compact?: boolean;
}

const AssetBuilderPreview3D: React.FC<Preview3DProps> = ({
  primitives,
  selectedId,
  onSelectPrimitive,
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const assetGroupRef = useRef<THREE.Group | null>(null);
  const onSelectRef = useRef(onSelectPrimitive);
  useEffect(() => {
    onSelectRef.current = onSelectPrimitive;
  }, [onSelectPrimitive]);

  const bounds = useMemo(() => computePrimitivesBounds(primitives), [primitives]);

  const setCameraView = useCallback(
    (view: 'iso' | 'front' | 'side' | 'top') => {
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      if (!cam || !ctrl) return;
      const span = Math.max(bounds.dims.w, bounds.dims.h, bounds.dims.d, 1.4);
      const cy = Math.max(0.4, bounds.dims.h * 0.45);
      const dist = span * 1.95;

      ctrl.target.set(0, cy, 0);
      if (view === 'iso') {
        cam.position.set(dist * 0.85, cy + dist * 0.65, dist * 0.95);
      } else if (view === 'front') {
        cam.position.set(0, cy, dist * 1.25);
      } else if (view === 'side') {
        cam.position.set(dist * 1.25, cy, 0);
      } else if (view === 'top') {
        cam.position.set(0, dist * 1.45, 0.01);
      }
      ctrl.update();
    },
    [bounds.dims.d, bounds.dims.h, bounds.dims.w]
  );

  // Initialize Three.js preview once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F1F5F9');
    sceneRef.current = scene;

    const width = Math.max(200, container.clientWidth);
    const height = Math.max(180, container.clientHeight);
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 100);
    camera.position.set(2.8, 2.2, 3.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.75, 0);
    controls.minDistance = 0.4;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controlsRef.current = controls;

    // Studio lighting
    const hemi = new THREE.HemisphereLight('#ffffff', '#cbd5e1', 1.05);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight('#ffffff', 1.15);
    dir.position.set(4.5, 7.5, 5.0);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 25;
    const d = 4.5;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    scene.add(dir);

    const fill = new THREE.DirectionalLight('#e2e8f0', 0.45);
    fill.position.set(-4, 3, -4);
    scene.add(fill);

    // Studio floor + 500mm grid (6m x 6m, 12 divisions = 500mm squares)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ color: '#E8EDF3', roughness: 0.9, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(6, 12, '#94A3B8', '#CBD5E1');
    grid.position.y = 0.002;
    scene.add(grid);

    const assetGroup = new THREE.Group();
    scene.add(assetGroup);
    assetGroupRef.current = assetGroup;

    // Click picking to select primitive
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(assetGroup.children, true);
      for (const hit of hits) {
        let cur: THREE.Object3D | null = hit.object;
        while (cur) {
          if (cur.userData?.primitiveId) {
            onSelectRef.current(cur.userData.primitiveId as string);
            return;
          }
          cur = cur.parent;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const nw = Math.max(160, container.clientWidth);
      const nh = Math.max(140, container.clientHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    resizeObserver.observe(container);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Rebuild meshes when primitives or selection changes
  useEffect(() => {
    const group = assetGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
        }
      });
    }

    if (primitives.length > 0) {
      const built = buildPrimitivesGroup(primitives, {
        selectedPrimitiveId: selectedId,
        centerOnFloor: false,
      });
      group.add(built);
    }
  }, [primitives, selectedId]);

  return (
    <div className={`cab-preview-wrap ${compact ? 'compact' : ''}`}>
      <div className="cab-preview-toolbar">
        <div className="cab-preview-dims mono-num">
          <span>
            {bounds.widthMm} × {bounds.depthMm} × {bounds.heightMm} mm
          </span>
          <span className="cab-preview-dims-m">
            ({bounds.dims.w} × {bounds.dims.d} × {bounds.dims.h} m)
          </span>
        </div>
        <div className="cab-preview-cams">
          <button type="button" onClick={() => setCameraView('iso')}>
            Iso
          </button>
          <button type="button" onClick={() => setCameraView('front')}>
            Front
          </button>
          <button type="button" onClick={() => setCameraView('side')}>
            Side
          </button>
          <button type="button" onClick={() => setCameraView('top')}>
            Top
          </button>
        </div>
      </div>
      <div ref={containerRef} className="cab-preview-canvas" />
      <div className="cab-preview-footer-hint">
        Drag to orbit · Scroll to zoom · Click any shape to edit · Grid = 500 mm squares
      </div>
    </div>
  );
};

/* ==================== MAIN CUSTOM ASSET BUILDER MODAL ==================== */

export const CustomAssetBuilderModal: React.FC<CustomAssetBuilderModalProps> = ({
  initialMode = 'shapes',
  launchContext = 'editor',
  editingAsset = null,
  onClose,
  onSaveAsset,
}) => {
  const [mode, setMode] = useState<BuilderMode>(initialMode);
  const [assetName, setAssetName] = useState<string>(
    editingAsset?.name || 'New Custom Asset'
  );
  const [assetCategory, setAssetCategory] = useState<CustomAssetCategory>(
    editingAsset?.category || 'product'
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [primitives, setPrimitives] = useState<AssetPrimitive[]>(() =>
    editingAsset && editingAsset.primitives.length > 0
      ? editingAsset.primitives.map((p) => ({ ...p }))
      : instantiatePresetPrimitives('blank')
  );
  const [rawSelectedId, setSelectedId] = useState<string | null>(
    () => (editingAsset?.primitives[0]?.id ?? null)
  );

  const selectedId = useMemo(() => {
    if (rawSelectedId && primitives.some((p) => p.id === rawSelectedId)) {
      return rawSelectedId;
    }
    return primitives[0]?.id ?? null;
  }, [primitives, rawSelectedId]);

  const selectedPrim = useMemo(
    () => primitives.find((p) => p.id === selectedId) || null,
    [primitives, selectedId]
  );

  const bounds = useMemo(() => computePrimitivesBounds(primitives), [primitives]);

  /* -------- Shape CRUD helpers -------- */
  const updatePrimitive = useCallback((id: string, patch: Partial<AssetPrimitive>) => {
    setPrimitives((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        // Keep cylinder / cone / ring diameter synchronized on w & d
        if (
          (next.kind === 'cylinder' || next.kind === 'cone' || next.kind === 'ring') &&
          patch.w !== undefined &&
          patch.d === undefined
        ) {
          next.d = patch.w;
        }
        return next;
      })
    );
  }, []);

  const addShape = useCallback(
    (kind: AssetPrimitiveKind) => {
      const next = createDefaultPrimitive(kind, primitives.length + 1);
      setPrimitives((prev) => [...prev, next]);
      setSelectedId(next.id);
    },
    [primitives.length]
  );

  const duplicatePrimitive = useCallback((id: string) => {
    setPrimitives((prev) => {
      const src = prev.find((p) => p.id === id);
      if (!src) return prev;
      const copy: AssetPrimitive = {
        ...src,
        id: createPrimitiveId(),
        label: `${src.label} Copy`,
        x: src.x + 250,
        points: src.points ? src.points.map((pt) => ({ ...pt })) : undefined,
      };
      setSelectedId(copy.id);
      return [...prev, copy];
    });
  }, []);

  const deletePrimitive = useCallback((id: string) => {
    setPrimitives((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const stackOnTopOfHighest = useCallback(
    (id: string) => {
      const others = primitives.filter((p) => p.id !== id);
      const maxTop = others.reduce((acc, p) => Math.max(acc, p.y + p.h), 0);
      updatePrimitive(id, { y: Math.round(maxTop) });
    },
    [primitives, updatePrimitive]
  );

  const applyPreset = useCallback((presetId: string) => {
    const preset = CUSTOM_ASSET_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next = instantiatePresetPrimitives(presetId);
    setPrimitives(next);
    setSelectedId(next[0]?.id ?? null);
    setAssetName(preset.name);
    setAssetCategory(preset.category);
  }, []);

  /* ==================== 2D SCHEMATIC STATE & TRACING ==================== */
  const schematicInputRef = useRef<HTMLInputElement | null>(null);
  const [schematicDataUrl, setSchematicDataUrl] = useState<string | null>(null);
  const [schematicImg, setSchematicImg] = useState<HTMLImageElement | null>(null);
  const [schematicNaturalSize, setSchematicNaturalSize] = useState<{ w: number; h: number }>({
    w: 900,
    h: 720,
  });
  const [schematicViewPlane, setSchematicViewPlane] = useState<SchematicViewPlane>('top');
  const [overallWidthMm, setOverallWidthMm] = useState<number>(3900);
  const [defaultHeightMm, setDefaultHeightMm] = useState<number>(1600);
  const [defaultDepthMm, setDefaultDepthMm] = useState<number>(900);
  const [traceElevationMm, setTraceElevationMm] = useState<number>(0);
  const [schematicOpacity, setSchematicOpacity] = useState<number>(0.88);
  const [schematicNotes, setSchematicNotes] = useState<string>('');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);

  // Interactive 2D tracing state
  const [traceTool, setTraceTool] = useState<TraceTool>('box');
  const [dragStartPx, setDragStartPx] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrPx, setDragCurrPx] = useState<{ x: number; y: number } | null>(null);
  const [polyPointsPx, setPolyPointsPx] = useState<Array<{ x: number; y: number }>>([]);
  const [calibPtsPx, setCalibPtsPx] = useState<Array<{ x: number; y: number }>>([]);
  const [calibInputMm, setCalibInputMm] = useState<number>(1650);

  const mmPerPx = useMemo(
    () => overallWidthMm / Math.max(1, schematicNaturalSize.w),
    [overallWidthMm, schematicNaturalSize.w]
  );

  const loadSchematicFromDataUrl = useCallback(
    (dataUrl: string, suggestedWidthMm?: number, suggestedName?: string) => {
      const img = new Image();
      img.onload = () => {
        setSchematicDataUrl(dataUrl);
        setSchematicImg(img);
        setSchematicNaturalSize({
          w: img.naturalWidth || 900,
          h: img.naturalHeight || 720,
        });
        if (suggestedWidthMm) setOverallWidthMm(suggestedWidthMm);
        if (suggestedName && !editingAsset) setAssetName(suggestedName);
        setAnalysisStatus(
          'Schematic loaded. Click "Auto-Generate 3D" or trace boxes, circles, and polygons directly over the drawing.'
        );
      };
      img.src = dataUrl;
    },
    [editingAsset]
  );

  const handleUploadSchematicFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const cleanName = file.name.replace(/\.[^.]+$/, '');
        loadSchematicFromDataUrl(dataUrl, 3000, cleanName);
      };
      reader.readAsDataURL(file);
    },
    [loadSchematicFromDataUrl]
  );

  const handleLoadSampleSchematic = useCallback(() => {
    const sample = createSampleSchematicDataUrl();
    setSchematicViewPlane('top');
    loadSchematicFromDataUrl(sample.dataUrl, sample.realWidthMm, sample.name);
  }, [loadSchematicFromDataUrl]);

  const handleAutoGenerate = useCallback(
    async (forceLocal: boolean) => {
      if (!schematicImg) return;
      setAnalyzing(true);
      setAnalysisStatus(
        forceLocal
          ? 'Scanning schematic contours locally...'
          : 'Analyzing 2D schematic & generating 3D shapes...'
      );
      try {
        const result = forceLocal
          ? analyzeSchematicLocally({
              image: schematicImg,
              mmPerPx,
              viewPlane: schematicViewPlane,
              defaultHeightMm,
              defaultDepthMm,
            })
          : await analyzeSchematicWithAI({
              image: schematicImg,
              mmPerPx,
              viewPlane: schematicViewPlane,
              defaultHeightMm,
              defaultDepthMm,
              overallWidthMm,
              notes: schematicNotes,
            });

        if (result.primitives.length > 0) {
          setPrimitives(result.primitives);
          setSelectedId(result.primitives[0].id);
          if (result.assetName && !editingAsset) {
            setAssetName(result.assetName);
          }
        }
        setAnalysisStatus(result.summary);
      } finally {
        setAnalyzing(false);
      }
    },
    [
      schematicImg,
      mmPerPx,
      schematicViewPlane,
      defaultHeightMm,
      defaultDepthMm,
      overallWidthMm,
      schematicNotes,
      editingAsset,
    ]
  );

  // Convert SVG/image pixel coordinates to asset mm coordinates (centered on image center)
  const pxToMm = useCallback(
    (px: number, py: number) => {
      const cx = schematicNaturalSize.w / 2;
      const cy = schematicNaturalSize.h / 2;
      return {
        xMm: Math.round((px - cx) * mmPerPx),
        yMm: Math.round((py - cy) * mmPerPx),
        // For front elevation, bottom of image is floor (0)
        elevMm: Math.max(0, Math.round((schematicNaturalSize.h - py) * mmPerPx)),
      };
    },
    [mmPerPx, schematicNaturalSize.h, schematicNaturalSize.w]
  );

  const mmToPx = useCallback(
    (xMm: number, zOrYMm: number) => {
      const cx = schematicNaturalSize.w / 2;
      const cy = schematicNaturalSize.h / 2;
      return {
        x: cx + xMm / mmPerPx,
        y: cy + zOrYMm / mmPerPx,
      };
    },
    [mmPerPx, schematicNaturalSize.h, schematicNaturalSize.w]
  );

  const svgRef = useRef<SVGSVGElement | null>(null);

  const getSvgCoords = (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * schematicNaturalSize.w;
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * schematicNaturalSize.h;
    return { x, y };
  };

  const finishPolygon = useCallback(() => {
    if (polyPointsPx.length < 3) {
      setPolyPointsPx([]);
      return;
    }
    const mmPts = polyPointsPx.map((pt) => pxToMm(pt.x, pt.y));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of mmPts) {
      minX = Math.min(minX, p.xMm);
      maxX = Math.max(maxX, p.xMm);
      minY = Math.min(minY, p.yMm);
      maxY = Math.max(maxY, p.yMm);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const wMm = Math.max(60, Math.round(maxX - minX));
    const dOrHMm = Math.max(60, Math.round(maxY - minY));

    const newPrim: AssetPrimitive =
      schematicViewPlane === 'top'
        ? {
            id: createPrimitiveId(),
            label: `Traced Shape ${primitives.length + 1}`,
            kind: 'extrusion',
            w: wMm,
            h: defaultHeightMm,
            d: dOrHMm,
            x: Math.round(cx),
            y: traceElevationMm,
            z: Math.round(cy),
            color: '#475569',
            finish: 'metal',
            extrudeAxis: 'y',
            points: mmPts.map((p) => ({ x: Math.round(p.xMm - cx), y: Math.round(p.yMm - cy) })),
          }
        : {
            id: createPrimitiveId(),
            label: `Traced Profile ${primitives.length + 1}`,
            kind: 'extrusion',
            w: wMm,
            h: dOrHMm,
            d: defaultDepthMm,
            x: Math.round(cx),
            y: Math.max(0, Math.round(schematicNaturalSize.h * mmPerPx - maxY - schematicNaturalSize.h * mmPerPx * 0.5)),
            z: 0,
            color: '#475569',
            finish: 'metal',
            extrudeAxis: 'z',
            points: mmPts.map((p) => ({ x: Math.round(p.xMm - cx), y: Math.round(-(p.yMm - cy)) })),
          };

    setPrimitives((prev) => [...prev, newPrim]);
    setSelectedId(newPrim.id);
    setPolyPointsPx([]);
    setAnalysisStatus(`Added traced polygon (${wMm} × ${dOrHMm} mm).`);
  }, [
    polyPointsPx,
    pxToMm,
    schematicViewPlane,
    primitives.length,
    defaultHeightMm,
    traceElevationMm,
    defaultDepthMm,
    schematicNaturalSize.h,
    mmPerPx,
  ]);

  const handleCanvasPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!schematicDataUrl) return;
    const pt = getSvgCoords(e);

    if (traceTool === 'calibrate') {
      if (calibPtsPx.length === 0) {
        setCalibPtsPx([pt]);
      } else if (calibPtsPx.length === 1) {
        setCalibPtsPx([calibPtsPx[0], pt]);
      } else {
        setCalibPtsPx([pt]);
      }
      return;
    }

    if (traceTool === 'polygon') {
      // Close polygon if clicking near first vertex
      if (polyPointsPx.length >= 3) {
        const first = polyPointsPx[0];
        if (Math.hypot(pt.x - first.x, pt.y - first.y) < schematicNaturalSize.w * 0.025) {
          finishPolygon();
          return;
        }
      }
      setPolyPointsPx((prev) => [...prev, pt]);
      return;
    }

    if (traceTool === 'box' || traceTool === 'circle') {
      setDragStartPx(pt);
      setDragCurrPx(pt);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragStartPx) return;
    setDragCurrPx(getSvgCoords(e));
  };

  const handleCanvasPointerUp = () => {
    if (!dragStartPx || !dragCurrPx) return;

    if (traceTool === 'box') {
      const minX = Math.min(dragStartPx.x, dragCurrPx.x);
      const maxX = Math.max(dragStartPx.x, dragCurrPx.x);
      const minY = Math.min(dragStartPx.y, dragCurrPx.y);
      const maxY = Math.max(dragStartPx.y, dragCurrPx.y);
      const pxW = maxX - minX;
      const pxH = maxY - minY;
      if (pxW > 8 && pxH > 8) {
        const centerMm = pxToMm((minX + maxX) / 2, (minY + maxY) / 2);
        const wMm = Math.max(50, Math.round(pxW * mmPerPx));
        const hOrDMm = Math.max(50, Math.round(pxH * mmPerPx));
        const newPrim: AssetPrimitive =
          schematicViewPlane === 'top'
            ? {
                id: createPrimitiveId(),
                label: `Traced Box ${primitives.length + 1} (${wMm}×${hOrDMm}mm)`,
                kind: 'box',
                w: wMm,
                h: defaultHeightMm,
                d: hOrDMm,
                x: centerMm.xMm,
                y: traceElevationMm,
                z: centerMm.yMm,
                color: '#E2E8F0',
                finish: 'metal',
              }
            : {
                id: createPrimitiveId(),
                label: `Traced Box ${primitives.length + 1} (${wMm}×${hOrDMm}mm)`,
                kind: 'box',
                w: wMm,
                h: hOrDMm,
                d: defaultDepthMm,
                x: centerMm.xMm,
                y: Math.max(0, Math.round((schematicNaturalSize.h - maxY) * mmPerPx)),
                z: 0,
                color: '#E2E8F0',
                finish: 'metal',
              };
        setPrimitives((prev) => [...prev, newPrim]);
        setSelectedId(newPrim.id);
        setAnalysisStatus(`Traced box: ${wMm} × ${hOrDMm} mm.`);
      }
    } else if (traceTool === 'circle') {
      const rPx = Math.hypot(dragCurrPx.x - dragStartPx.x, dragCurrPx.y - dragStartPx.y);
      if (rPx > 6) {
        const diamMm = Math.max(60, Math.round(rPx * 2 * mmPerPx));
        const centerMm = pxToMm(dragStartPx.x, dragStartPx.y);
        const newPrim: AssetPrimitive =
          schematicViewPlane === 'top'
            ? {
                id: createPrimitiveId(),
                label: `Traced Cylinder ${primitives.length + 1} (Ø${diamMm}mm)`,
                kind: 'cylinder',
                w: diamMm,
                h: diamMm >= 900 ? 100 : defaultHeightMm,
                d: diamMm,
                x: centerMm.xMm,
                y: traceElevationMm,
                z: centerMm.yMm,
                color: '#334155',
                finish: 'dark-steel',
              }
            : {
                id: createPrimitiveId(),
                label: `Traced Cylinder ${primitives.length + 1} (Ø${diamMm}mm)`,
                kind: 'cylinder',
                w: diamMm,
                h: defaultDepthMm,
                d: diamMm,
                x: centerMm.xMm,
                y: Math.max(0, Math.round((schematicNaturalSize.h - (dragStartPx.y + rPx)) * mmPerPx)),
                z: 0,
                rotX: 90,
                color: '#334155',
                finish: 'dark-steel',
              };
        setPrimitives((prev) => [...prev, newPrim]);
        setSelectedId(newPrim.id);
        setAnalysisStatus(`Traced cylinder: Ø${diamMm} mm.`);
      }
    }

    setDragStartPx(null);
    setDragCurrPx(null);
  };

  const applyCalibration = () => {
    if (calibPtsPx.length !== 2 || calibInputMm <= 0) return;
    const distPx = Math.hypot(
      calibPtsPx[1].x - calibPtsPx[0].x,
      calibPtsPx[1].y - calibPtsPx[0].y
    );
    if (distPx < 5) return;
    const newMmPerPx = calibInputMm / distPx;
    const newOverallW = Math.max(200, Math.round(newMmPerPx * schematicNaturalSize.w));
    setOverallWidthMm(newOverallW);
    setCalibPtsPx([]);
    setTraceTool('box');
    setAnalysisStatus(
      `Scale calibrated: reference span = ${calibInputMm} mm (full drawing width = ${newOverallW} mm).`
    );
  };

  const handleSave = (opts?: { keepOpen?: boolean; placeOnStand?: boolean }) => {
    if (primitives.length === 0) return;
    const computed = computePrimitivesBounds(primitives);
    const keepOpen = Boolean(opts?.keepOpen);
    const finalName = assetName.trim() || 'Custom Asset';
    const builtAsset: CustomBuiltAsset = {
      id:
        !keepOpen && editingAsset?.assetId
          ? editingAsset.assetId
          : `built-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: finalName,
      category: assetCategory,
      primitives: primitives.map((p) => ({
        ...p,
        points: p.points ? p.points.map((pt) => ({ ...pt })) : undefined,
      })),
      dims: computed.dims,
      createdAt: Date.now(),
    };
    onSaveAsset(builtAsset, {
      editingItemId: !keepOpen ? editingAsset?.itemId : undefined,
      placeOnStand: opts?.placeOnStand ?? (launchContext === 'editor' && !keepOpen),
      keepOpen,
    });

    if (keepOpen) {
      const fresh = instantiatePresetPrimitives('blank');
      setPrimitives(fresh);
      setSelectedId(fresh[0]?.id ?? null);
      setAssetName('New Custom Asset');
      setSavedNotice(`Saved "${finalName}" to Asset Library — ready to build your next asset.`);
      window.setTimeout(() => setSavedNotice(null), 3500);
    }
  };

  return (
    <div
      className="modal-backdrop cab-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="cab-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Custom Asset Builder"
      >
        {/* ==================== HEADER ==================== */}
        <header className="cab-header">
          <div className="cab-header-left">
            <div className="cab-header-icon">
              <Box size={18} />
            </div>
            <div className="cab-title-group">
              <div className="cab-title-row">
                <input
                  id="cab-asset-name-input"
                  className="cab-name-input"
                  type="text"
                  aria-label="Custom asset name"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="Name your custom asset..."
                />
                <select
                  className="cab-category-select"
                  aria-label="Asset category"
                  value={assetCategory}
                  onChange={(e) => setAssetCategory(e.target.value as CustomAssetCategory)}
                >
                  {CUSTOM_ASSET_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <span className="cab-subtitle">
                Custom Asset Builder · All dimensions in millimetres (mm)
              </span>
            </div>
          </div>

          <div className="cab-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'shapes'}
              className={`cab-mode-tab ${mode === 'shapes' ? 'active' : ''}`}
              onClick={() => setMode('shapes')}
            >
              <Layers size={14} />
              <span>Shape Builder</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'schematic'}
              className={`cab-mode-tab ${mode === 'schematic' ? 'active' : ''}`}
              onClick={() => setMode('schematic')}
            >
              <FileImage size={14} />
              <span>2D Schematic (Auto / Trace)</span>
            </button>
          </div>

          <button
            type="button"
            className="cab-close-btn"
            onClick={onClose}
            aria-label="Close Custom Asset Builder"
          >
            <X size={18} />
          </button>
        </header>

        {/* ==================== BODY ==================== */}
        <div className="cab-body">
          {/* ---------- MODE 1: SHAPE BUILDER ---------- */}
          {mode === 'shapes' && (
            <>
              <div className="cab-left-pane">
                {/* Quick Presets */}
                <div className="cab-section">
                  <div className="cab-section-head">
                    <span>Starter Templates</span>
                  </div>
                  <div className="cab-preset-strip">
                    {CUSTOM_ASSET_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="cab-preset-chip"
                        onClick={() => applyPreset(preset.id)}
                        title={preset.subtitle}
                      >
                        {preset.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Add Simple Shapes */}
                <div className="cab-section">
                  <div className="cab-section-head">
                    <span>Add Simple Shape</span>
                  </div>
                  <div className="cab-shape-grid">
                    {SHAPE_TOOLS.map((st) => (
                      <button
                        key={st.kind}
                        type="button"
                        className="cab-shape-btn"
                        onClick={() => addShape(st.kind)}
                        title={st.hint}
                      >
                        {st.kind === 'box' && <Box size={15} />}
                        {st.kind === 'cylinder' && <Cylinder size={15} />}
                        {st.kind === 'wedge' && <Triangle size={15} />}
                        {st.kind === 'cone' && <Triangle size={15} />}
                        {st.kind === 'sphere' && <Circle size={15} />}
                        {st.kind === 'ring' && <Circle size={15} />}
                        <span>{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Parts List */}
                <div className="cab-section cab-parts-section">
                  <div className="cab-section-head">
                    <span>Parts ({primitives.length})</span>
                    {primitives.length > 0 && (
                      <button
                        type="button"
                        className="cab-text-btn danger"
                        onClick={() => setPrimitives([])}
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="cab-parts-list">
                    {primitives.length === 0 ? (
                      <div className="cab-empty-hint">
                        Add a shape above or switch to <strong>2D Schematic</strong> to trace or auto-generate from a drawing.
                      </div>
                    ) : (
                      primitives.map((p) => {
                        const isSel = p.id === selectedId;
                        return (
                          <div
                            key={p.id}
                            className={`cab-part-row ${isSel ? 'selected' : ''}`}
                            onClick={() => setSelectedId(p.id)}
                          >
                            <span
                              className="cab-part-swatch"
                              style={{ backgroundColor: p.color }}
                            />
                            <div className="cab-part-info">
                              <span className="cab-part-label">{p.label}</span>
                              <span className="cab-part-dims mono-num">
                                {p.kind === 'cylinder' || p.kind === 'cone' || p.kind === 'ring'
                                  ? `Ø${p.w} × H${p.h} mm`
                                  : `${p.w} × ${p.d} × H${p.h} mm`}
                              </span>
                            </div>
                            <div className="cab-part-actions">
                              <button
                                type="button"
                                title="Duplicate part"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicatePrimitive(p.id);
                                }}
                              >
                                <Copy size={12} />
                              </button>
                              <button
                                type="button"
                                title="Delete part"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deletePrimitive(p.id);
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Selected Part Dimension & Position Inspector */}
                {selectedPrim && (
                  <div className="cab-section cab-editor-section">
                    <div className="cab-section-head">
                      <span>Selected Part Dimensions (mm)</span>
                      <div className="cab-quick-align">
                        <button
                          type="button"
                          title="Snap bottom to floor (Y = 0)"
                          onClick={() => updatePrimitive(selectedPrim.id, { y: 0 })}
                        >
                          <ArrowDownToLine size={12} /> Floor
                        </button>
                        <button
                          type="button"
                          title="Stack on top of highest part"
                          onClick={() => stackOnTopOfHighest(selectedPrim.id)}
                        >
                          <ArrowUpFromLine size={12} /> Stack
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      className="cab-input-text"
                      value={selectedPrim.label}
                      onChange={(e) =>
                        updatePrimitive(selectedPrim.id, { label: e.target.value })
                      }
                      aria-label="Part label"
                    />

                    <div className="cab-num-grid-3">
                      <label className="cab-num-field">
                        <span>
                          {selectedPrim.kind === 'cylinder' ||
                          selectedPrim.kind === 'cone' ||
                          selectedPrim.kind === 'ring'
                            ? 'Diameter (mm)'
                            : 'Width X (mm)'}
                        </span>
                        <input
                          type="number"
                          min={20}
                          max={12000}
                          step={10}
                          value={selectedPrim.w}
                          onChange={(e) =>
                            updatePrimitive(selectedPrim.id, {
                              w: Math.max(20, Number(e.target.value) || 20),
                            })
                          }
                        />
                      </label>
                      <label className="cab-num-field">
                        <span>Height Y (mm)</span>
                        <input
                          type="number"
                          min={10}
                          max={8000}
                          step={10}
                          value={selectedPrim.h}
                          onChange={(e) =>
                            updatePrimitive(selectedPrim.id, {
                              h: Math.max(10, Number(e.target.value) || 10),
                            })
                          }
                        />
                      </label>
                      {selectedPrim.kind !== 'cylinder' &&
                        selectedPrim.kind !== 'cone' &&
                        selectedPrim.kind !== 'ring' && (
                          <label className="cab-num-field">
                            <span>Depth Z (mm)</span>
                            <input
                              type="number"
                              min={20}
                              max={12000}
                              step={10}
                              value={selectedPrim.d}
                              onChange={(e) =>
                                updatePrimitive(selectedPrim.id, {
                                  d: Math.max(20, Number(e.target.value) || 20),
                                })
                              }
                            />
                          </label>
                        )}
                    </div>

                    <div className="cab-num-grid-3">
                      <label className="cab-num-field">
                        <span>Pos X (mm)</span>
                        <input
                          type="number"
                          step={25}
                          value={selectedPrim.x}
                          onChange={(e) =>
                            updatePrimitive(selectedPrim.id, {
                              x: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                      <label className="cab-num-field">
                        <span>Elev Y (mm)</span>
                        <input
                          type="number"
                          min={0}
                          step={25}
                          value={selectedPrim.y}
                          onChange={(e) =>
                            updatePrimitive(selectedPrim.id, {
                              y: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </label>
                      <label className="cab-num-field">
                        <span>Pos Z (mm)</span>
                        <input
                          type="number"
                          step={25}
                          value={selectedPrim.z}
                          onChange={(e) =>
                            updatePrimitive(selectedPrim.id, {
                              z: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className="cab-num-grid-3">
                      <label className="cab-num-field">
                        <span>Rotate Y (°)</span>
                        <input
                          type="number"
                          step={15}
                          value={selectedPrim.rotY ?? 0}
                          onChange={(e) =>
                            updatePrimitive(selectedPrim.id, {
                              rotY: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                      <label className="cab-num-field">
                        <span>Tilt X (°)</span>
                        <input
                          type="number"
                          step={15}
                          value={selectedPrim.rotX ?? 0}
                          onChange={(e) =>
                            updatePrimitive(selectedPrim.id, {
                              rotX: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                      <label className="cab-num-field">
                        <span>Tilt Z (°)</span>
                        <input
                          type="number"
                          step={15}
                          value={selectedPrim.rotZ ?? 0}
                          onChange={(e) =>
                            updatePrimitive(selectedPrim.id, {
                              rotZ: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                    </div>

                    {/* Finish & Color */}
                    <div className="cab-finish-row">
                      {FINISH_OPTIONS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`cab-finish-pill ${selectedPrim.finish === f.id ? 'active' : ''}`}
                          onClick={() => updatePrimitive(selectedPrim.id, { finish: f.id })}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <div className="cab-swatch-row">
                      {COLOR_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          className={`cab-swatch-btn ${selectedPrim.color.toLowerCase() === hex.toLowerCase() ? 'active' : ''}`}
                          style={{ backgroundColor: hex }}
                          onClick={() => updatePrimitive(selectedPrim.id, { color: hex })}
                          aria-label={`Color ${hex}`}
                        />
                      ))}
                      <input
                        type="color"
                        className="cab-color-picker"
                        value={selectedPrim.color}
                        onChange={(e) =>
                          updatePrimitive(selectedPrim.id, { color: e.target.value })
                        }
                        title="Custom color"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="cab-right-pane">
                <AssetBuilderPreview3D
                  primitives={primitives}
                  selectedId={selectedId}
                  onSelectPrimitive={setSelectedId}
                />
              </div>
            </>
          )}

          {/* ---------- MODE 2: 2D SCHEMATIC (AUTO-GENERATE & TRACE) ---------- */}
          {mode === 'schematic' && (
            <>
              <div className="cab-left-pane cab-schematic-sidebar">
                {/* Upload / Sample */}
                <div className="cab-section">
                  <div className="cab-section-head">
                    <span>1. Upload 2D Drawing / Schematic</span>
                  </div>
                  <div className="cab-schematic-upload-row">
                    <button
                      type="button"
                      className="primary-btn cab-upload-btn"
                      onClick={() => schematicInputRef.current?.click()}
                    >
                      <Upload size={14} />
                      <span>{schematicDataUrl ? 'Replace Drawing' : 'Upload 2D Drawing'}</span>
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={handleLoadSampleSchematic}
                      title="Load a sample technical schematic of a 1650mm turntable pallet wrapper"
                    >
                      Sample Plan
                    </button>
                    <input
                      ref={schematicInputRef}
                      type="file"
                      accept="image/*,.svg"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadSchematicFile(file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>

                {/* View Orientation & Scale */}
                <div className="cab-section">
                  <div className="cab-section-head">
                    <span>2. Orientation &amp; Scale (mm)</span>
                  </div>
                  <div className="cab-seg-toggle">
                    <button
                      type="button"
                      className={schematicViewPlane === 'top' ? 'active' : ''}
                      onClick={() => setSchematicViewPlane('top')}
                    >
                      Top-Down Plan
                    </button>
                    <button
                      type="button"
                      className={schematicViewPlane === 'front' ? 'active' : ''}
                      onClick={() => setSchematicViewPlane('front')}
                    >
                      Front Elevation
                    </button>
                  </div>

                  <div className="cab-num-grid-2">
                    <label className="cab-num-field">
                      <span>Drawing Width (mm)</span>
                      <input
                        type="number"
                        min={200}
                        max={20000}
                        step={50}
                        value={overallWidthMm}
                        onChange={(e) =>
                          setOverallWidthMm(Math.max(200, Number(e.target.value) || 200))
                        }
                      />
                    </label>
                    {schematicViewPlane === 'top' ? (
                      <label className="cab-num-field">
                        <span>Extrude Height (mm)</span>
                        <input
                          type="number"
                          min={50}
                          max={6000}
                          step={50}
                          value={defaultHeightMm}
                          onChange={(e) =>
                            setDefaultHeightMm(Math.max(50, Number(e.target.value) || 50))
                          }
                        />
                      </label>
                    ) : (
                      <label className="cab-num-field">
                        <span>Extrude Depth (mm)</span>
                        <input
                          type="number"
                          min={50}
                          max={6000}
                          step={50}
                          value={defaultDepthMm}
                          onChange={(e) =>
                            setDefaultDepthMm(Math.max(50, Number(e.target.value) || 50))
                          }
                        />
                      </label>
                    )}
                  </div>

                  {schematicViewPlane === 'top' && (
                    <div className="cab-num-grid-2" style={{ marginTop: 6 }}>
                      <label className="cab-num-field">
                        <span>Base Elevation Y (mm)</span>
                        <input
                          type="number"
                          min={0}
                          max={4000}
                          step={50}
                          value={traceElevationMm}
                          onChange={(e) =>
                            setTraceElevationMm(Math.max(0, Number(e.target.value) || 0))
                          }
                        />
                      </label>
                      <label className="cab-num-field">
                        <span>Drawing Opacity</span>
                        <input
                          type="range"
                          min={0.2}
                          max={1}
                          step={0.05}
                          value={schematicOpacity}
                          onChange={(e) => setSchematicOpacity(parseFloat(e.target.value))}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Automated Procedure */}
                <div className="cab-section cab-auto-box">
                  <div className="cab-section-head">
                    <span>3. Automated 3D Creation</span>
                  </div>
                  <input
                    type="text"
                    className="cab-input-text"
                    placeholder="Optional notes (e.g. turntable 1650mm, mast 2400mm tall)"
                    value={schematicNotes}
                    onChange={(e) => setSchematicNotes(e.target.value)}
                  />
                  <div className="cab-auto-btn-row">
                    <button
                      type="button"
                      className="primary-btn cab-auto-btn"
                      disabled={!schematicImg || analyzing}
                      onClick={() => handleAutoGenerate(false)}
                    >
                      {analyzing ? (
                        <Loader2 size={14} className="spin-icon" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      <span>Auto-Generate 3D</span>
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={!schematicImg || analyzing}
                      onClick={() => handleAutoGenerate(true)}
                      title="Run instant offline shape detection without calling an external AI API"
                    >
                      <ScanSearch size={14} />
                      <span>Local Detect</span>
                    </button>
                  </div>
                  {analysisStatus && <p className="cab-status-note">{analysisStatus}</p>}
                </div>

                {/* Manual Tracing Tools */}
                <div className="cab-section">
                  <div className="cab-section-head">
                    <span>4. Or Trace Directly Over Drawing</span>
                  </div>
                  <div className="cab-trace-tool-grid">
                    <button
                      type="button"
                      className={`cab-trace-btn ${traceTool === 'box' ? 'active' : ''}`}
                      onClick={() => {
                        setTraceTool('box');
                        setPolyPointsPx([]);
                      }}
                    >
                      <Square size={14} />
                      <span>Trace Box</span>
                    </button>
                    <button
                      type="button"
                      className={`cab-trace-btn ${traceTool === 'circle' ? 'active' : ''}`}
                      onClick={() => {
                        setTraceTool('circle');
                        setPolyPointsPx([]);
                      }}
                    >
                      <Circle size={14} />
                      <span>Trace Circle</span>
                    </button>
                    <button
                      type="button"
                      className={`cab-trace-btn ${traceTool === 'polygon' ? 'active' : ''}`}
                      onClick={() => {
                        setTraceTool('polygon');
                        setPolyPointsPx([]);
                      }}
                    >
                      <Pentagon size={14} />
                      <span>Trace Polygon</span>
                    </button>
                    <button
                      type="button"
                      className={`cab-trace-btn ${traceTool === 'calibrate' ? 'active' : ''}`}
                      onClick={() => {
                        setTraceTool('calibrate');
                        setCalibPtsPx([]);
                      }}
                    >
                      <Ruler size={14} />
                      <span>Calibrate Scale</span>
                    </button>
                    <button
                      type="button"
                      className={`cab-trace-btn ${traceTool === 'select' ? 'active' : ''}`}
                      onClick={() => setTraceTool('select')}
                    >
                      <MousePointer2 size={14} />
                      <span>Select</span>
                    </button>
                  </div>

                  {traceTool === 'polygon' && polyPointsPx.length > 0 && (
                    <div className="cab-inline-action-bar">
                      <span>{polyPointsPx.length} points placed</span>
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={polyPointsPx.length < 3}
                        onClick={finishPolygon}
                      >
                        <Check size={13} /> Finish Shape
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => setPolyPointsPx([])}
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {traceTool === 'calibrate' && (
                    <div className="cab-calib-box">
                      <p>
                        {calibPtsPx.length < 2
                          ? `Click ${2 - calibPtsPx.length} point${calibPtsPx.length === 1 ? '' : 's'} on a known dimension line.`
                          : 'Enter the real-world length between the two points:'}
                      </p>
                      {calibPtsPx.length === 2 && (
                        <div className="cab-calib-apply-row">
                          <input
                            type="number"
                            min={50}
                            max={20000}
                            step={10}
                            value={calibInputMm}
                            onChange={(e) => setCalibInputMm(Number(e.target.value) || 0)}
                          />
                          <span>mm</span>
                          <button
                            type="button"
                            className="primary-btn"
                            onClick={applyCalibration}
                          >
                            Apply Scale
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick height/elevation tweak for currently selected traced part */}
                  {selectedPrim && (
                    <div className="cab-selected-trace-quick">
                      <div className="cab-section-head">
                        <span>Selected: {selectedPrim.label}</span>
                        <button
                          type="button"
                          className="cab-text-btn"
                          onClick={() => setMode('shapes')}
                        >
                          Full Edit →
                        </button>
                      </div>
                      <div className="cab-num-grid-2">
                        <label className="cab-num-field">
                          <span>Height (mm)</span>
                          <input
                            type="number"
                            min={10}
                            max={8000}
                            step={25}
                            value={selectedPrim.h}
                            onChange={(e) =>
                              updatePrimitive(selectedPrim.id, {
                                h: Math.max(10, Number(e.target.value) || 10),
                              })
                            }
                          />
                        </label>
                        <label className="cab-num-field">
                          <span>Elev Y (mm)</span>
                          <input
                            type="number"
                            min={0}
                            max={6000}
                            step={25}
                            value={selectedPrim.y}
                            onChange={(e) =>
                              updatePrimitive(selectedPrim.id, {
                                y: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Split: Interactive 2D Tracing Canvas + Live 3D Preview */}
              <div className="cab-right-pane cab-schematic-split">
                <div className="cab-trace-stage">
                  {!schematicDataUrl ? (
                    <div className="cab-trace-empty">
                      <Wand2 size={28} />
                      <h3>Upload a 2D Drawing or Schematic</h3>
                      <p>
                        Drop a PNG, JPG, or SVG technical drawing to automatically generate a 3D
                        blockout or trace shapes to exact millimetre scale.
                      </p>
                      <div className="cab-trace-empty-btns">
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => schematicInputRef.current?.click()}
                        >
                          <Upload size={14} /> Upload 2D Drawing
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={handleLoadSampleSchematic}
                        >
                          Load Sample 1650mm Plan
                        </button>
                      </div>
                    </div>
                  ) : (
                    <svg
                      ref={svgRef}
                      className={`cab-trace-svg tool-${traceTool}`}
                      viewBox={`0 0 ${schematicNaturalSize.w} ${schematicNaturalSize.h}`}
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPointerUp}
                    >
                      <image
                        href={schematicDataUrl}
                        x={0}
                        y={0}
                        width={schematicNaturalSize.w}
                        height={schematicNaturalSize.h}
                        opacity={schematicOpacity}
                      />

                      {/* Existing primitives projected onto the 2D schematic */}
                      {primitives.map((p) => {
                        const isSel = p.id === selectedId;
                        const stroke = isSel ? '#2563EB' : '#D95D39';
                        const fill = isSel
                          ? 'rgba(37, 99, 235, 0.20)'
                          : 'rgba(217, 93, 57, 0.14)';

                        if (schematicViewPlane === 'top') {
                          const pos = mmToPx(p.x, p.z);
                          const wPx = p.w / mmPerPx;
                          const dPx =
                            (p.kind === 'cylinder' || p.kind === 'cone' || p.kind === 'ring'
                              ? p.w
                              : p.d) / mmPerPx;

                          if (p.kind === 'cylinder' || p.kind === 'cone' || p.kind === 'ring' || p.kind === 'sphere') {
                            return (
                              <g
                                key={p.id}
                                onClick={(e) => {
                                  if (traceTool === 'select') {
                                    e.stopPropagation();
                                    setSelectedId(p.id);
                                  }
                                }}
                              >
                                <circle
                                  cx={pos.x}
                                  cy={pos.y}
                                  r={wPx / 2}
                                  fill={fill}
                                  stroke={stroke}
                                  strokeWidth={Math.max(2, schematicNaturalSize.w * 0.003)}
                                />
                                <text
                                  x={pos.x}
                                  y={pos.y}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="#0F172A"
                                  fontSize={Math.max(12, schematicNaturalSize.w * 0.016)}
                                  fontWeight={700}
                                >
                                  Ø{p.w}
                                </text>
                              </g>
                            );
                          }

                          if (p.kind === 'extrusion' && p.points && p.points.length >= 3) {
                            const ptsStr = p.points
                              .map((pt) => {
                                const pp = mmToPx(p.x + pt.x, p.z + pt.y);
                                return `${pp.x},${pp.y}`;
                              })
                              .join(' ');
                            return (
                              <polygon
                                key={p.id}
                                points={ptsStr}
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={Math.max(2, schematicNaturalSize.w * 0.003)}
                                onClick={(e) => {
                                  if (traceTool === 'select') {
                                    e.stopPropagation();
                                    setSelectedId(p.id);
                                  }
                                }}
                              />
                            );
                          }

                          return (
                            <g
                              key={p.id}
                              onClick={(e) => {
                                if (traceTool === 'select') {
                                  e.stopPropagation();
                                  setSelectedId(p.id);
                                }
                              }}
                            >
                              <rect
                                x={pos.x - wPx / 2}
                                y={pos.y - dPx / 2}
                                width={wPx}
                                height={dPx}
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={Math.max(2, schematicNaturalSize.w * 0.003)}
                              />
                            </g>
                          );
                        } else {
                          // Front elevation projection
                          const cx = schematicNaturalSize.w / 2 + p.x / mmPerPx;
                          const wPx = p.w / mmPerPx;
                          const hPx = p.h / mmPerPx;
                          const bottomY = schematicNaturalSize.h - p.y / mmPerPx;
                          return (
                            <rect
                              key={p.id}
                              x={cx - wPx / 2}
                              y={bottomY - hPx}
                              width={wPx}
                              height={hPx}
                              fill={fill}
                              stroke={stroke}
                              strokeWidth={Math.max(2, schematicNaturalSize.w * 0.003)}
                              onClick={(e) => {
                                if (traceTool === 'select') {
                                  e.stopPropagation();
                                  setSelectedId(p.id);
                                }
                              }}
                            />
                          );
                        }
                      })}

                      {/* Active Box Drag Preview */}
                      {traceTool === 'box' && dragStartPx && dragCurrPx && (
                        <rect
                          x={Math.min(dragStartPx.x, dragCurrPx.x)}
                          y={Math.min(dragStartPx.y, dragCurrPx.y)}
                          width={Math.abs(dragCurrPx.x - dragStartPx.x)}
                          height={Math.abs(dragCurrPx.y - dragStartPx.y)}
                          fill="rgba(37, 99, 235, 0.22)"
                          stroke="#2563EB"
                          strokeWidth={Math.max(2, schematicNaturalSize.w * 0.003)}
                          strokeDasharray="6 4"
                        />
                      )}

                      {/* Active Circle Drag Preview */}
                      {traceTool === 'circle' && dragStartPx && dragCurrPx && (() => {
                        const r = Math.hypot(
                          dragCurrPx.x - dragStartPx.x,
                          dragCurrPx.y - dragStartPx.y
                        );
                        const diamMm = Math.round(r * 2 * mmPerPx);
                        return (
                          <g>
                            <circle
                              cx={dragStartPx.x}
                              cy={dragStartPx.y}
                              r={r}
                              fill="rgba(37, 99, 235, 0.22)"
                              stroke="#2563EB"
                              strokeWidth={Math.max(2, schematicNaturalSize.w * 0.003)}
                              strokeDasharray="6 4"
                            />
                            <text
                              x={dragStartPx.x}
                              y={dragStartPx.y}
                              textAnchor="middle"
                              fill="#1D4ED8"
                              fontSize={Math.max(14, schematicNaturalSize.w * 0.02)}
                              fontWeight={700}
                            >
                              Ø{diamMm} mm
                            </text>
                          </g>
                        );
                      })()}

                      {/* Active Polygon Points */}
                      {traceTool === 'polygon' && polyPointsPx.length > 0 && (
                        <g>
                          <polyline
                            points={polyPointsPx.map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="rgba(37, 99, 235, 0.16)"
                            stroke="#2563EB"
                            strokeWidth={Math.max(2, schematicNaturalSize.w * 0.003)}
                          />
                          {polyPointsPx.map((p, i) => (
                            <circle
                              key={i}
                              cx={p.x}
                              cy={p.y}
                              r={Math.max(4, schematicNaturalSize.w * 0.007)}
                              fill={i === 0 ? '#16A34A' : '#2563EB'}
                              stroke="#FFFFFF"
                              strokeWidth={2}
                            />
                          ))}
                        </g>
                      )}

                      {/* Active Calibration Ruler */}
                      {calibPtsPx.length > 0 && (
                        <g>
                          {calibPtsPx.length === 2 && (
                            <line
                              x1={calibPtsPx[0].x}
                              y1={calibPtsPx[0].y}
                              x2={calibPtsPx[1].x}
                              y2={calibPtsPx[1].y}
                              stroke="#16A34A"
                              strokeWidth={Math.max(2.5, schematicNaturalSize.w * 0.0035)}
                              strokeDasharray="6 4"
                            />
                          )}
                          {calibPtsPx.map((p, i) => (
                            <circle
                              key={i}
                              cx={p.x}
                              cy={p.y}
                              r={Math.max(5, schematicNaturalSize.w * 0.008)}
                              fill="#16A34A"
                              stroke="#FFFFFF"
                              strokeWidth={2}
                            />
                          ))}
                        </g>
                      )}
                    </svg>
                  )}
                </div>

                {/* Live 3D Preview alongside 2D Schematic */}
                <AssetBuilderPreview3D
                  primitives={primitives}
                  selectedId={selectedId}
                  onSelectPrimitive={setSelectedId}
                  compact
                />
              </div>
            </>
          )}
        </div>

        {/* ==================== FOOTER ==================== */}
        <footer className="cab-footer">
          <div className="cab-footer-meta mono-num">
            {savedNotice ? (
              <span className="cab-saved-notice">
                <Check size={13} /> {savedNotice}
              </span>
            ) : (
              <>
                <span>
                  {primitives.length} part{primitives.length === 1 ? '' : 's'}
                </span>
                <span>·</span>
                <span>
                  Overall {bounds.widthMm} × {bounds.depthMm} × {bounds.heightMm} mm (
                  {bounds.dims.w} × {bounds.dims.d} × {bounds.dims.h} m)
                </span>
              </>
            )}
          </div>
          <div className="cab-footer-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            {!editingAsset?.itemId && (
              <button
                type="button"
                className="secondary-btn"
                disabled={primitives.length === 0}
                onClick={() => handleSave({ keepOpen: true, placeOnStand: false })}
                title="Save this asset to your Asset Library and start building another one"
              >
                <Plus size={14} />
                <span>Save &amp; Create Another</span>
              </button>
            )}
            <button
              id="cab-save-asset-btn"
              type="button"
              className="primary-btn"
              disabled={primitives.length === 0}
              onClick={() =>
                handleSave({
                  keepOpen: false,
                  placeOnStand: launchContext === 'editor',
                })
              }
            >
              <Check size={14} />
              <span>
                {editingAsset?.itemId
                  ? 'Update Asset on Stand'
                  : editingAsset?.assetId
                    ? 'Save Changes'
                    : launchContext === 'dashboard'
                      ? 'Save to Asset Library'
                      : 'Save & Place on Stand'}
              </span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
