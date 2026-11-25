import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {
  BrandAsset,
  CameraPreset,
  ComplianceReport,
  ShellWallSide,
  StandConfig,
  StandItem,
  ViewMode,
  ViewportNavMode,
} from '../types/stand';
import {
  applyVenueFixtureBrandingOverlay,
  buildBoothShell,
  buildScaleFigures,
  buildStandItemMesh,
} from './meshFactory';
import { buildCustomModelMesh, isModelCached } from './modelLoader';
import { buildCustomBuiltAssetMesh } from './customAssetMesh';
import {
  getOuterGridMargin,
  isItemBrandingAllowed,
  isOuterGridVisible,
  isVenuePermanentFixture,
} from '../utils/fixtures';
import { formatLength } from '../utils/pricing';
import { checkWallCollision, findNearestAllowedPosition } from '../utils/wallCollision';
import {
  PERFORMANCE_PROFILES,
  PerformanceMonitor,
  type PerformanceMode,
  type SlowPerformanceAlert,
  type ViewportPerformanceMetrics,
} from '../utils/performanceMode';
import {
  computeGroupBounds,
  computeMarqueeRect,
  computeMultiDragPositions,
  isScreenBoxIntersectingRect,
  mergeSelection,
  type MarqueeRect,
} from '../utils/multiSelect';

export interface StandViewportHandle {
  setCameraPreset: (preset: CameraPreset, instant?: boolean) => void;
  setCameraTransform: (
    pos: [number, number, number],
    target: [number, number, number],
    fov?: number
  ) => void;
  zoomBy: (factor: number) => void;
  frameSelected: () => void;
  captureSnapshot: (width?: number, height?: number) => string | null;
}

interface StandViewportProps {
  config: StandConfig;
  items: StandItem[];
  assetsMap: Map<string, BrandAsset>;
  modelsVersion?: number;
  selectedItemIds: string[];
  selectedShellWall: ShellWallSide | null;
  viewMode: ViewMode;
  navMode?: ViewportNavMode;
  performanceMode?: PerformanceMode;
  compliance: ComplianceReport;
  paintAssetId: string | null;
  tourActive?: boolean;
  onUserInterruptTour?: () => void;
  onPerformanceMetrics?: (metrics: ViewportPerformanceMetrics) => void;
  onSlowPerformanceDetected?: (alert: SlowPerformanceAlert) => void;
  onSelectItem: (itemId: string | null, surfaceId?: string | null) => void;
  onSelectItems: (itemIds: string[]) => void;
  onToggleSelectItem: (itemId: string) => void;
  onSelectShellWall: (side: ShellWallSide | null) => void;
  onMoveItem: (itemId: string, x: number, z: number, commitHistory: boolean) => void;
  onMoveItems: (
    updates: Array<{ id: string; x: number; z: number }>,
    commitHistory: boolean
  ) => void;
  onPaintSurface: (
    target:
      | { kind: 'item'; itemId: string; surfaceId: string }
      | { kind: 'shell'; side: ShellWallSide }
  ) => void;
  onDropCatalogItem: (catalogId: string, x: number, z: number) => void;
  onDropCustomModelAsset: (modelAssetId: string, x: number, z: number) => void;
  onDropCustomBuiltAsset?: (customAssetId: string, x: number, z: number) => void;
  onDrop3DFiles: (files: FileList, x: number, z: number) => void;
}

interface OverlayLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  kind: 'dim' | 'aisle' | 'grid-tick';
}

function disposeObject3D(obj: THREE.Object3D) {
  const disposedTextures = new Set<THREE.Texture>();
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry && !mesh.userData.sharedGeometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        const textures = [std.map, std.emissiveMap];
        for (const tex of textures) {
          if (tex && tex.userData?.disposeOnCleanup && !disposedTextures.has(tex)) {
            disposedTextures.add(tex);
            tex.dispose();
          }
        }
        m.dispose();
      }
    }
  });
}

function disposeLight(obj: THREE.Object3D) {
  if (obj instanceof THREE.Light) {
    const withShadow = obj as THREE.DirectionalLight;
    withShadow.shadow?.map?.dispose();
    obj.dispose();
  }
}

function applyWallCollisionRedTint(meshGroup: THREE.Group, item: StandItem) {
  meshGroup.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    // Skip floor contact shadows so we don't paint a red smudge on the floor
    if (child.renderOrder === 1) return;

    const tintMaterial = (mat: THREE.Material): THREE.Material => {
      const cloned = mat.clone();
      if (
        cloned instanceof THREE.MeshStandardMaterial ||
        cloned instanceof THREE.MeshPhysicalMaterial ||
        cloned instanceof THREE.MeshPhongMaterial ||
        cloned instanceof THREE.MeshLambertMaterial
      ) {
        cloned.color.set('#EF4444');
        cloned.emissive.set('#DC2626');
        cloned.emissiveMap = null;
        cloned.emissiveIntensity = 0.65;
        cloned.transparent = true;
        cloned.opacity = 0.88;
      } else if (cloned instanceof THREE.MeshBasicMaterial) {
        cloned.color.set('#EF4444');
      }
      cloned.needsUpdate = true;
      return cloned;
    };

    if (Array.isArray(child.material)) {
      child.material = child.material.map(tintMaterial);
    } else if (child.material) {
      child.material = tintMaterial(child.material);
    }
  });

  // Crisp vivid-red 3D wireframe cage around the colliding item
  const boxGeom = new THREE.BoxGeometry(
    item.dims.w + 0.04,
    item.dims.h + 0.04,
    item.dims.d + 0.04
  );
  const boxWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeom),
    new THREE.LineBasicMaterial({ color: '#FF1F1F' })
  );
  boxGeom.dispose();
  boxWire.position.y = item.dims.h / 2;
  meshGroup.add(boxWire);
}

interface WallCollisionFeedback {
  itemId: string;
  collidedShellSides: ShellWallSide[];
  collidedWallItemIds: string[];
  snapX: number;
  snapZ: number;
}

// Keep the stand in frame as the canvas narrows or switches to portrait.
function resizePerspectiveCamera(camera: THREE.PerspectiveCamera, aspect: number) {
  camera.aspect = aspect;
  camera.zoom = Math.min(1, aspect / 1.18);
  camera.updateProjectionMatrix();
}

function isOverheadRcpItem(item: StandItem, viewMode: ViewMode): boolean {
  return (
    viewMode === '2d' &&
    (item.y >= 1.8 ||
      item.catalogId === 'hanging-cube' ||
      item.catalogId === 'hanging-ring' ||
      item.catalogId === 'front-arch' ||
      item.catalogId === 'truss-rig')
  );
}

function computeItemVisualSignature(
  item: StandItem,
  viewMode: ViewMode,
  isColliding: boolean,
  globalSig: string
): string {
  const { x: _x, y: _y, z: _z, rotationY: _r, visible: _v, locked: _l, ...visualProps } = item;
  void _x;
  void _y;
  void _z;
  void _r;
  void _v;
  void _l;
  const modelReady =
    item.catalogId === 'custom-3d-model' && item.customModelId
      ? isModelCached(item.customModelId)
        ? 'ready'
        : 'pending'
      : 'na';
  return `${globalSig}|${isOverheadRcpItem(item, viewMode) ? 'rcp' : 'std'}|${
    isColliding ? 'col' : 'ok'
  }|${modelReady}|${JSON.stringify(visualProps)}`;
}

export const StandViewport3D = forwardRef<StandViewportHandle, StandViewportProps>(
  function StandViewport3D(
    {
      config,
      items,
      assetsMap,
      modelsVersion = 0,
      selectedItemIds,
      selectedShellWall,
      viewMode,
      navMode = 'select',
      performanceMode = 'high',
      compliance,
      paintAssetId,
      tourActive,
      onUserInterruptTour,
      onPerformanceMetrics,
      onSlowPerformanceDetected,
      onSelectItem,
      onSelectItems,
      onToggleSelectItem,
      onSelectShellWall,
      onMoveItem,
      onMoveItems,
      onPaintSurface,
      onDropCatalogItem,
      onDropCustomModelAsset,
      onDropCustomBuiltAsset,
      onDrop3DFiles,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const perspCamRef = useRef<THREE.PerspectiveCamera | null>(null);
    const orthoCamRef = useRef<THREE.OrthographicCamera | null>(null);
    const activeCamRef = useRef<THREE.Camera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const envRTRef = useRef<THREE.WebGLRenderTarget | null>(null);

    const shellGroupRef = useRef<THREE.Group | null>(null);
    const itemsGroupRef = useRef<THREE.Group | null>(null);
    const helpersGroupRef = useRef<THREE.Group | null>(null);
    const lightsGroupRef = useRef<THREE.Group | null>(null);
    const hallFloorRef = useRef<THREE.Mesh | null>(null);

    // Per-item 3D mesh cache & persistent selection ring for zero-rebuild imperative dragging
    const itemMeshCacheRef = useRef<Map<string, { group: THREE.Group; sig: string }>>(new Map());
    const selectionRingRef = useRef<THREE.Group | null>(null);
    const canvasRectRef = useRef<DOMRect | null>(null);
    const assetsVersionRef = useRef(0);
    const lastAssetsMapRef = useRef(assetsMap);

    const [textureTick, setTextureTick] = useState(0);
    const [hoverPaintLabel, setHoverPaintLabel] = useState<string | null>(null);
    const [overlayLabels, setOverlayLabels] = useState<OverlayLabel[]>([]);
    const [dropHint, setDropHint] = useState<string | null>(null);
    const [wallCollision, setWallCollision] = useState<WallCollisionFeedback | null>(null);
    const [webglContextLost, setWebglContextLost] = useState(false);
    const [spacePanning, setSpacePanning] = useState(false);
    const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
    const lastLabelsKeyRef = useRef<string>('');
    const isSoftwareWebGLRef = useRef<boolean>(false);
    const dirtyRef = useRef<boolean>(true);
    const lastActivityTsRef = useRef<number>(performance.now());
    const perfMonitorRef = useRef<PerformanceMonitor>(new PerformanceMonitor(performanceMode));
    const effectiveNavMode: ViewportNavMode = spacePanning ? 'pan' : navMode;

    const markSceneDirty = useCallback(() => {
      dirtyRef.current = true;
      lastActivityTsRef.current = performance.now();
    }, []);

    const markShadowsDirty = useCallback(() => {
      const renderer = rendererRef.current;
      if (renderer && renderer.shadowMap.enabled) {
        renderer.shadowMap.needsUpdate = true;
      }
    }, []);

    // Keep latest props accessible inside pointer/animation closures
    const propsRef = useRef({
      config,
      items,
      selectedItemIds,
      viewMode,
      navMode: effectiveNavMode,
      performanceMode,
      paintAssetId,
      tourActive,
      onUserInterruptTour,
      onPerformanceMetrics,
      onSlowPerformanceDetected,
      onSelectItem,
      onSelectItems,
      onToggleSelectItem,
      onSelectShellWall,
      onMoveItem,
      onMoveItems,
      onPaintSurface,
    });
    propsRef.current = {
      config,
      items,
      selectedItemIds,
      viewMode,
      navMode: effectiveNavMode,
      performanceMode,
      paintAssetId,
      tourActive,
      onUserInterruptTour,
      onPerformanceMetrics,
      onSlowPerformanceDetected,
      onSelectItem,
      onSelectItems,
      onToggleSelectItem,
      onSelectShellWall,
      onMoveItem,
      onMoveItems,
      onPaintSurface,
    };

    const cameraAnimRef = useRef<{
      active: boolean;
      targetPos: THREE.Vector3;
      targetLook: THREE.Vector3;
    }>({
      active: false,
      targetPos: new THREE.Vector3(),
      targetLook: new THREE.Vector3(),
    });

    const dragStateRef = useRef<{
      active: boolean;
      itemId: string | null;
      isMulti: boolean;
      clickedInMultiId: string | null;
      clickedSurfaceId: string | null;
      startPlaneX: number;
      startPlaneZ: number;
      startPositions: Array<{ id: string; x: number; z: number }>;
      lastPositions: Array<{ id: string; x: number; z: number }>;
      lastValidPositions: Array<{ id: string; x: number; z: number }>;
      offsetX: number;
      offsetZ: number;
      moved: boolean;
      lastX: number;
      lastZ: number;
      lastValidX: number;
      lastValidZ: number;
      colliding: boolean;
      pointerDownX: number;
      pointerDownY: number;
    }>({
      active: false,
      itemId: null,
      isMulti: false,
      clickedInMultiId: null,
      clickedSurfaceId: null,
      startPlaneX: 0,
      startPlaneZ: 0,
      startPositions: [],
      lastPositions: [],
      lastValidPositions: [],
      offsetX: 0,
      offsetZ: 0,
      moved: false,
      lastX: 0,
      lastZ: 0,
      lastValidX: 0,
      lastValidZ: 0,
      colliding: false,
      pointerDownX: 0,
      pointerDownY: 0,
    });

    const marqueeStateRef = useRef<{
      active: boolean;
      dragging: boolean;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      startedOnItemId: string | null;
    }>({
      active: false,
      dragging: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      startedOnItemId: null,
    });

    const syncControlsInteraction = useCallback((mode: ViewportNavMode, isTop2D: boolean) => {
      const controls = controlsRef.current;
      if (!controls) return;
      controls.enablePan = true;
      controls.screenSpacePanning = true;
      if (isTop2D) {
        controls.enableRotate = false;
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        };
      } else if (mode === 'pan') {
        controls.enableRotate = true;
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        };
      } else {
        controls.enableRotate = true;
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        };
      }
      controls.update();
    }, []);

    const applyCameraPreset = useCallback(
      (preset: CameraPreset, instant = false) => {
        const { config: cfg, navMode: activeNav } = propsRef.current;
        const maxSpan = Math.max(cfg.width, cfg.depth, 3.2);
        const persp = perspCamRef.current;
        const ortho = orthoCamRef.current;
        const controls = controlsRef.current;
        if (!persp || !ortho || !controls) return;
        markSceneDirty();

        if (preset === 'top') {
          const container = containerRef.current;
          const aspect = container
            ? container.clientWidth / Math.max(1, container.clientHeight)
            : 1.6;
          const halfH = Math.max(cfg.depth, cfg.width / aspect) * 0.78 + 0.9;
          ortho.left = -halfH * aspect;
          ortho.right = halfH * aspect;
          ortho.top = halfH;
          ortho.bottom = -halfH;
          ortho.zoom = 1;
          ortho.position.set(0, 14, 0.001);
          ortho.lookAt(0, 0, 0);
          ortho.updateProjectionMatrix();
          activeCamRef.current = ortho;
          controls.object = ortho;
          controls.target.set(0, 0, 0);
          syncControlsInteraction(activeNav, true);
          cameraAnimRef.current.active = false;
          return;
        }

        activeCamRef.current = persp;
        controls.object = persp;
        syncControlsInteraction(activeNav, false);
        if (Math.abs(persp.fov - 42) > 0.01) {
          persp.fov = 42;
          persp.updateProjectionMatrix();
        }

        const targetPos = new THREE.Vector3();
        const targetLook = new THREE.Vector3(0, 1.05, 0);

        if (preset === 'isometric') {
          if (cfg.openSides === 1 && cfg.showShellWalls) {
            targetPos.set(maxSpan * 0.36, maxSpan * 0.78, maxSpan * 1.56);
          } else {
            targetPos.set(maxSpan * 1.15, maxSpan * 0.86, maxSpan * 1.28);
          }
        } else if (preset === 'front') {
          targetPos.set(0, 1.65, maxSpan * 1.55);
        } else if (preset === 'back') {
          targetPos.set(0, 1.85, -maxSpan * 1.55);
        } else if (preset === 'left') {
          targetPos.set(-maxSpan * 1.5, 1.85, maxSpan * 0.35);
        } else if (preset === 'right') {
          targetPos.set(maxSpan * 1.5, 1.85, maxSpan * 0.35);
        } else if (preset === 'eye-level') {
          targetPos.set(cfg.width * 0.12, 1.65, cfg.depth / 2 + Math.max(2.3, cfg.width * 0.48));
          targetLook.set(0, 1.32, -cfg.depth * 0.15);
        }

        if (instant) {
          persp.position.copy(targetPos);
          controls.target.copy(targetLook);
          controls.update();
          cameraAnimRef.current.active = false;
        } else {
          cameraAnimRef.current = {
            active: true,
            targetPos,
            targetLook,
          };
        }
      },
      [syncControlsInteraction, markSceneDirty]
    );

    const zoomBy = useCallback((factor: number) => {
      const cam = activeCamRef.current;
      const controls = controlsRef.current;
      if (!cam || !controls) return;
      cameraAnimRef.current.active = false;
      markSceneDirty();

      if (cam instanceof THREE.OrthographicCamera) {
        cam.zoom = Math.max(0.35, Math.min(6, cam.zoom / factor));
        cam.updateProjectionMatrix();
        controls.update();
        return;
      }

      if (cam instanceof THREE.PerspectiveCamera) {
        const offset = cam.position.clone().sub(controls.target);
        const curDist = offset.length();
        const nextDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, curDist * factor));
        if (curDist > 0.001) {
          offset.multiplyScalar(nextDist / curDist);
          cam.position.copy(controls.target).add(offset);
          controls.update();
        }
      }
    }, [markSceneDirty]);

    const frameTargetItemOrStand = useCallback(
      (explicitItemId?: string | null) => {
        const { items: curItems, selectedItemIds: selIds, viewMode: curView } = propsRef.current;
        const targetIds =
          explicitItemId !== undefined
            ? explicitItemId
              ? [explicitItemId]
              : []
            : selIds;
        const targetItems = curItems.filter(
          (i) => targetIds.includes(i.id) && i.visible !== false
        );
        const bounds = computeGroupBounds(targetItems);
        if (!bounds) {
          applyCameraPreset(curView === '2d' ? 'top' : curView === 'eye-level' ? 'eye-level' : 'isometric');
          return;
        }

        const controls = controlsRef.current;
        const persp = perspCamRef.current;
        const ortho = orthoCamRef.current;
        if (!controls || !persp || !ortho) return;
        markSceneDirty();

        if (activeCamRef.current === ortho) {
          ortho.position.set(bounds.cx, 14, bounds.cz + 0.001);
          controls.target.set(bounds.cx, 0, bounds.cz);
          ortho.zoom = Math.max(
            0.85,
            Math.min(3.5, 4 / Math.max(bounds.width, bounds.depth, 1.2))
          );
          ortho.updateProjectionMatrix();
          controls.update();
          return;
        }

        const span = Math.max(bounds.width, bounds.height, bounds.depth, 1.1);
        const centerY = bounds.minY + bounds.height * 0.45;
        const look = new THREE.Vector3(bounds.cx, centerY, bounds.cz);
        const dir = persp.position.clone().sub(controls.target);
        if (dir.lengthSq() < 0.01) dir.set(1, 0.75, 1.1);
        dir.normalize();
        const dist = Math.max(2.2, span * 2.4);
        const targetPos = look.clone().add(dir.multiplyScalar(dist));
        targetPos.y = Math.max(0.85, targetPos.y);
        cameraAnimRef.current = {
          active: true,
          targetPos,
          targetLook: look,
        };
      },
      [applyCameraPreset, markSceneDirty]
    );

    useImperativeHandle(
      ref,
      () => ({
        setCameraPreset: (preset: CameraPreset, instant?: boolean) =>
          applyCameraPreset(preset, instant),
        setCameraTransform: (
          pos: [number, number, number],
          target: [number, number, number],
          fov?: number
        ) => {
          const persp = perspCamRef.current;
          const controls = controlsRef.current;
          if (!persp || !controls) return;
          activeCamRef.current = persp;
          controls.object = persp;
          syncControlsInteraction(propsRef.current.navMode, false);
          cameraAnimRef.current.active = false;
          if (typeof fov === 'number' && Math.abs(persp.fov - fov) > 0.01) {
            persp.fov = fov;
            persp.updateProjectionMatrix();
          }
          persp.position.set(pos[0], pos[1], pos[2]);
          controls.target.set(target[0], target[1], target[2]);
          controls.update();
        },
        zoomBy,
        frameSelected: () => frameTargetItemOrStand(),
        captureSnapshot: (width = 1600, height = 1000) => {
          const renderer = rendererRef.current;
          const scene = sceneRef.current;
          const cam = activeCamRef.current;
          if (!renderer || !scene || !cam) return null;

          const prevSize = new THREE.Vector2();
          renderer.getSize(prevSize);
          const prevPR = renderer.getPixelRatio();

          // Temporarily hide selection helper ring for clean architectural render
          const helpers = helpersGroupRef.current;
          const prevHelpersVis = helpers ? helpers.visible : true;
          if (helpers) helpers.visible = false;

          renderer.setPixelRatio(1);
          renderer.setSize(width, height, false);
          if (cam instanceof THREE.PerspectiveCamera) {
            resizePerspectiveCamera(cam, width / height);
          }
          if (renderer.shadowMap.enabled) {
            renderer.shadowMap.needsUpdate = true;
          }
          renderer.render(scene, cam);
          const dataUrl = renderer.domElement.toDataURL('image/png');

          // Restore viewport
          if (helpers) helpers.visible = prevHelpersVis;
          renderer.setPixelRatio(prevPR);
          renderer.setSize(prevSize.x, prevSize.y, false);
          if (cam instanceof THREE.PerspectiveCamera) {
            resizePerspectiveCamera(cam, prevSize.x / Math.max(1, prevSize.y));
          }
          renderer.render(scene, cam);
          return dataUrl;
        },
      }),
      [applyCameraPreset, syncControlsInteraction, zoomBy, frameTargetItemOrStand]
    );

    // Initialize Three.js Scene once
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || 960;
      const height = container.clientHeight || 640;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#EDE9E2');
      scene.fog = new THREE.Fog('#EDE9E2', 18, 48);
      sceneRef.current = scene;

      const initialProfile = PERFORMANCE_PROFILES[propsRef.current.performanceMode];
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
      const gl = renderer.getContext();
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const gpuRendererStr = String(
        (debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || ''
      );
      const isSoftwareRenderer = /swiftshader|llvmpipe|software|basic render driver|mesa offscreen/i.test(
        gpuRendererStr
      );
      isSoftwareWebGLRef.current = isSoftwareRenderer;
      perfMonitorRef.current.setSoftwareWebGL(isSoftwareRenderer);
      renderer.setPixelRatio(
        isSoftwareRenderer
          ? Math.min(1, initialProfile.maxPixelRatio)
          : Math.min(window.devicePixelRatio || 1, initialProfile.maxPixelRatio)
      );
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = !isSoftwareRenderer && initialProfile.shadowsEnabled;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      renderer.toneMapping =
        initialProfile.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Studio PBR Environment IBL (skip expensive PMREM cubemap pass on software/CPU WebGL)
      let envRT: THREE.WebGLRenderTarget | null = null;
      if (!isSoftwareRenderer) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const roomEnv = new RoomEnvironment();
        envRT = pmrem.fromScene(roomEnv, 0.04);
        envRTRef.current = envRT;
        if (initialProfile.useEnvironmentIBL) {
          scene.environment = envRT.texture;
          scene.environmentIntensity = 0.55;
        }
        roomEnv.dispose();
        pmrem.dispose();
      }

      // Cameras
      const persp = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
      persp.position.set(4.8, 3.6, 5.4);
      perspCamRef.current = persp;

      const aspect = width / Math.max(1, height);
      const ortho = new THREE.OrthographicCamera(-4 * aspect, 4 * aspect, 4, -4, 0.1, 80);
      ortho.position.set(0, 14, 0.001);
      ortho.lookAt(0, 0, 0);
      orthoCamRef.current = ortho;

      activeCamRef.current = persp;

      // OrbitControls
      const controls = new OrbitControls(persp, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = initialProfile.dampingFactor;
      controls.enablePan = true;
      controls.screenSpacePanning = true;
      controls.zoomToCursor = true;
      controls.panSpeed = 0.9;
      controls.rotateSpeed = 0.85;
      controls.zoomSpeed = 1.05;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.minDistance = 1.1;
      controls.maxDistance = 28;
      controls.target.set(0, 1.05, 0);
      controls.update();
      controlsRef.current = controls;

      // Stop camera animation if user manually interacts & wake idle render loop
      controls.addEventListener('start', () => {
        markSceneDirty();
        cameraAnimRef.current.active = false;
        if (propsRef.current.tourActive && propsRef.current.onUserInterruptTour) {
          propsRef.current.onUserInterruptTour();
        }
      });
      controls.addEventListener('change', () => {
        markSceneDirty();
      });

      // Surrounding Exhibition Hall Floor
      const hallCanvas = document.createElement('canvas');
      hallCanvas.width = 512;
      hallCanvas.height = 512;
      const hCtx = hallCanvas.getContext('2d')!;
      hCtx.fillStyle = '#E4DFD6';
      hCtx.fillRect(0, 0, 512, 512);
      hCtx.strokeStyle = 'rgba(116, 112, 103, 0.29)';
      hCtx.lineWidth = 2;
      hCtx.strokeRect(1, 1, 510, 510);
      const hallTex = new THREE.CanvasTexture(hallCanvas);
      hallTex.wrapS = THREE.RepeatWrapping;
      hallTex.wrapT = THREE.RepeatWrapping;
      hallTex.repeat.set(22, 22);
      hallTex.colorSpace = THREE.SRGBColorSpace;

      const hallFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(66, 66),
        new THREE.MeshStandardMaterial({
          map: hallTex,
          roughness: 0.92,
          metalness: 0.02,
        })
      );
      hallFloor.rotation.x = -Math.PI / 2;
      hallFloor.position.y = -0.048;
      hallFloor.receiveShadow = true;
      scene.add(hallFloor);
      hallFloorRef.current = hallFloor;

      // Scene Layer Groups
      const lightsGroup = new THREE.Group();
      const shellGroup = new THREE.Group();
      const itemsGroup = new THREE.Group();
      const helpersGroup = new THREE.Group();
      scene.add(lightsGroup, shellGroup, itemsGroup, helpersGroup);
      lightsGroupRef.current = lightsGroup;
      shellGroupRef.current = shellGroup;
      itemsGroupRef.current = itemsGroup;
      helpersGroupRef.current = helpersGroup;

      // Pointer raycasting for Selection, Dragging & Click-to-Assign Artwork
      const raycaster = new THREE.Raycaster();
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const pointerNDC = new THREE.Vector2();
      const planeHit = new THREE.Vector3();

      const refreshCanvasRect = () => {
        canvasRectRef.current = renderer.domElement.getBoundingClientRect();
      };
      refreshCanvasRect();

      const updatePointerNDC = (ev: PointerEvent) => {
        const rect = canvasRectRef.current ?? renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        pointerNDC.y = -((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      };

      const findPickedTarget = () => {
        const cam = activeCamRef.current;
        if (!cam) return null;
        raycaster.setFromCamera(pointerNDC, cam);

        // First check items
        const itemHits = raycaster.intersectObjects(itemsGroup.children, true);
        for (const hit of itemHits) {
          let cur: THREE.Object3D | null = hit.object;
          let itemId: string | null = null;
          let surfaceId: string | null = null;
          let surfaceLabel: string | null = null;
          while (cur && cur !== itemsGroup) {
            if (!surfaceId && cur.userData.surfaceId) {
              surfaceId = cur.userData.surfaceId;
              surfaceLabel = cur.userData.surfaceLabel || surfaceId;
            }
            if (!itemId && cur.userData.itemId) {
              itemId = cur.userData.itemId;
            }
            cur = cur.parent;
          }
          if (itemId) {
            return { kind: 'item' as const, itemId, surfaceId, surfaceLabel, point: hit.point };
          }
        }

        // Next check shell walls (for branding assignment)
        const shellHits = raycaster.intersectObjects(shellGroup.children, true);
        for (const hit of shellHits) {
          if (hit.object.userData.shellWall) {
            return {
              kind: 'shell' as const,
              side: hit.object.userData.shellWall as ShellWallSide,
              point: hit.point,
            };
          }
        }
        return null;
      };

      const onPointerDown = (ev: PointerEvent) => {
        if (ev.button !== 0) return;
        refreshCanvasRect();
        const {
          navMode: activeNav,
          paintAssetId: activePaint,
          items: curItems,
          selectedItemIds: curSelectedIds,
          onSelectItem: selectItem,
          onSelectShellWall: selectShell,
          onPaintSurface: paintSurface,
        } = propsRef.current;

        const isMultiMod = ev.ctrlKey || ev.metaKey;

        // Ctrl/Cmd + click or Ctrl/Cmd + drag: intercept before OrbitControls so it never pans
        if (!activePaint && isMultiMod) {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          updatePointerNDC(ev);
          const picked = findPickedTarget();
          const rect = renderer.domElement.getBoundingClientRect();
          const localX = ev.clientX - rect.left;
          const localY = ev.clientY - rect.top;

          marqueeStateRef.current = {
            active: true,
            dragging: false,
            startX: localX,
            startY: localY,
            currentX: localX,
            currentY: localY,
            startedOnItemId: picked?.kind === 'item' ? picked.itemId : null,
          };
          controls.enabled = false;
          renderer.domElement.setPointerCapture(ev.pointerId);
          return;
        }

        // In Orbit or Pan navigation mode (or Shift+drag), let OrbitControls handle pointer directly
        if (!activePaint && (activeNav === 'orbit' || activeNav === 'pan' || ev.shiftKey)) {
          return;
        }

        updatePointerNDC(ev);
        const picked = findPickedTarget();

        if (activePaint) {
          if (picked?.kind === 'item' && picked.surfaceId) {
            paintSurface({ kind: 'item', itemId: picked.itemId, surfaceId: picked.surfaceId });
            selectItem(picked.itemId, picked.surfaceId);
            return;
          }
          if (picked?.kind === 'shell') {
            paintSurface({ kind: 'shell', side: picked.side });
            selectShell(picked.side);
            return;
          }
          // Even if clicked a non-brandable part of an item that HAS a primary surface, paint its first surface!
          if (picked?.kind === 'item') {
            const obj = curItems.find((i) => i.id === picked.itemId);
            if (obj) {
              selectItem(obj.id, null);
            }
          }
          return;
        }

        if (picked?.kind === 'item') {
          selectShell(null);
          const itemObj = curItems.find((i) => i.id === picked.itemId);
          const isAlreadyInMulti =
            curSelectedIds.length > 1 && curSelectedIds.includes(picked.itemId);

          if (!isAlreadyInMulti) {
            selectItem(picked.itemId, picked.surfaceId);
          }

          if (itemObj && activeCamRef.current) {
            raycaster.setFromCamera(pointerNDC, activeCamRef.current);
            if (raycaster.ray.intersectPlane(floorPlane, planeHit)) {
              if (isAlreadyInMulti) {
                const movableItems = curItems.filter(
                  (i) => curSelectedIds.includes(i.id) && !i.locked
                );
                const startPositions = movableItems.map((i) => ({
                  id: i.id,
                  x: i.x,
                  z: i.z,
                }));
                dragStateRef.current = {
                  active: true,
                  itemId: itemObj.id,
                  isMulti: true,
                  clickedInMultiId: picked.itemId,
                  clickedSurfaceId: picked.surfaceId,
                  startPlaneX: planeHit.x,
                  startPlaneZ: planeHit.z,
                  startPositions,
                  lastPositions: startPositions.map((p) => ({ ...p })),
                  lastValidPositions: startPositions.map((p) => ({ ...p })),
                  offsetX: itemObj.x - planeHit.x,
                  offsetZ: itemObj.z - planeHit.z,
                  moved: false,
                  lastX: itemObj.x,
                  lastZ: itemObj.z,
                  lastValidX: itemObj.x,
                  lastValidZ: itemObj.z,
                  colliding: false,
                  pointerDownX: ev.clientX,
                  pointerDownY: ev.clientY,
                };
                controls.enabled = false;
                renderer.domElement.style.cursor = movableItems.length > 0 ? 'grabbing' : 'default';
                renderer.domElement.setPointerCapture(ev.pointerId);
              } else if (!itemObj.locked) {
                dragStateRef.current = {
                  active: true,
                  itemId: itemObj.id,
                  isMulti: false,
                  clickedInMultiId: null,
                  clickedSurfaceId: null,
                  startPlaneX: planeHit.x,
                  startPlaneZ: planeHit.z,
                  startPositions: [{ id: itemObj.id, x: itemObj.x, z: itemObj.z }],
                  lastPositions: [{ id: itemObj.id, x: itemObj.x, z: itemObj.z }],
                  lastValidPositions: [{ id: itemObj.id, x: itemObj.x, z: itemObj.z }],
                  offsetX: itemObj.x - planeHit.x,
                  offsetZ: itemObj.z - planeHit.z,
                  moved: false,
                  lastX: itemObj.x,
                  lastZ: itemObj.z,
                  lastValidX: itemObj.x,
                  lastValidZ: itemObj.z,
                  colliding: false,
                  pointerDownX: ev.clientX,
                  pointerDownY: ev.clientY,
                };
                controls.enabled = false;
                renderer.domElement.style.cursor = 'grabbing';
                renderer.domElement.setPointerCapture(ev.pointerId);
              }
            }
          }
        } else if (picked?.kind === 'shell') {
          selectItem(null, null);
          selectShell(picked.side);
        } else {
          selectItem(null, null);
          selectShell(null);
        }
      };

      let lastHoverRaycastTs = 0;
      let lastDragShadowUpdateTs = 0;
      let lastDragCollisionSearchTs = 0;

      const onPointerMove = (ev: PointerEvent) => {
        updatePointerNDC(ev);

        // Active Ctrl+drag marquee box selection
        const marquee = marqueeStateRef.current;
        if (marquee.active) {
          const rect = renderer.domElement.getBoundingClientRect();
          const localX = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
          const localY = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
          marquee.currentX = localX;
          marquee.currentY = localY;
          const distPx = Math.hypot(localX - marquee.startX, localY - marquee.startY);
          if (distPx >= 5 || marquee.dragging) {
            marquee.dragging = true;
            renderer.domElement.style.cursor = 'crosshair';
            setMarqueeRect(
              computeMarqueeRect(marquee.startX, marquee.startY, localX, localY)
            );
          }
          return;
        }

        const drag = dragStateRef.current;
        if (drag.active && drag.itemId && activeCamRef.current) {
          const distPx = Math.hypot(
            ev.clientX - drag.pointerDownX,
            ev.clientY - drag.pointerDownY
          );
          if (distPx < 4 && !drag.moved) return;

          raycaster.setFromCamera(pointerNDC, activeCamRef.current);
          if (raycaster.ray.intersectPlane(floorPlane, planeHit)) {
            const {
              config: cfg,
              items: curItems,
              onMoveItems: moveItems,
            } = propsRef.current;

            if (drag.isMulti) {
              if (drag.startPositions.length === 0) return;
              const deltaX = planeHit.x - drag.startPlaneX;
              const deltaZ = planeHit.z - drag.startPlaneZ;
              const nextPositions = computeMultiDragPositions(
                drag.startPositions,
                deltaX,
                deltaZ,
                cfg
              );
              const changed = nextPositions.some((p, idx) => {
                const prev = drag.lastPositions[idx];
                return !prev || p.x !== prev.x || p.z !== prev.z;
              });
              if (changed) {
                drag.moved = true;
                drag.lastPositions = nextPositions;

                // Evaluate collisions against non-moving walls/shell walls using updated group positions
                const nextPosMap = new Map(nextPositions.map((p) => [p.id, p]));
                const simulatedItems = curItems.map((it) => {
                  const np = nextPosMap.get(it.id);
                  return np ? { ...it, x: np.x, z: np.z } : it;
                });

                let firstCollision: WallCollisionFeedback | null = null;
                for (const np of nextPositions) {
                  const simItem = simulatedItems.find((i) => i.id === np.id);
                  if (!simItem) continue;
                  const collision = checkWallCollision(simItem, np.x, np.z, cfg, simulatedItems);
                  if (collision.collides) {
                    const fallback =
                      drag.lastValidPositions.find((p) => p.id === np.id) || {
                        x: np.x,
                        z: np.z,
                      };
                    firstCollision = {
                      itemId: np.id,
                      collidedShellSides: collision.collidedShellSides,
                      collidedWallItemIds: collision.collidedWallItemIds,
                      snapX: fallback.x,
                      snapZ: fallback.z,
                    };
                    break;
                  }
                }

                if (firstCollision) {
                  drag.colliding = true;
                  renderer.domElement.style.cursor = 'not-allowed';
                  setWallCollision(firstCollision);
                } else {
                  drag.colliding = false;
                  drag.lastValidPositions = nextPositions.map((p) => ({ ...p }));
                  renderer.domElement.style.cursor = 'grabbing';
                  setWallCollision((prev) => (prev ? null : prev));
                }

                markSceneDirty();
                moveItems(nextPositions, false);
              }
              return;
            }
            let nx = planeHit.x + drag.offsetX;
            let nz = planeHit.z + drag.offsetZ;
            if (cfg.snapToGrid) {
              const step = cfg.gridStep || 0.1;
              nx = Math.round(nx / step) * step;
              nz = Math.round(nz / step) * step;
            }
            const outerMargin = getOuterGridMargin(cfg);
            const maxX = Math.max(cfg.width * 0.9, cfg.width / 2 + outerMargin);
            const maxZ = Math.max(cfg.depth * 0.9, cfg.depth / 2 + outerMargin);
            nx = Math.max(-maxX, Math.min(maxX, Number(nx.toFixed(3))));
            nz = Math.max(-maxZ, Math.min(maxZ, Number(nz.toFixed(3))));

            if (nx !== drag.lastX || nz !== drag.lastZ) {
              drag.moved = true;
              drag.lastX = nx;
              drag.lastZ = nz;

              const nowTs = performance.now();
              const itemObj = curItems.find((i) => i.id === drag.itemId);

              // Imperative 3D transform update — zero React re-renders or mesh rebuilds while dragging
              const cachedMesh = itemMeshCacheRef.current.get(drag.itemId);
              if (cachedMesh && itemObj) {
                cachedMesh.group.position.set(nx, itemObj.y, nz);
              }
              if (selectionRingRef.current) {
                selectionRingRef.current.position.set(nx, 0.012, nz);
              }

              // Throttle shadow map refresh during drag (~10 Hz) and finalize crisply on drop
              if (renderer.shadowMap.enabled && nowTs - lastDragShadowUpdateTs >= 100) {
                lastDragShadowUpdateTs = nowTs;
                renderer.shadowMap.needsUpdate = true;
              }

              if (itemObj) {
                const collision = checkWallCollision(itemObj, nx, nz, cfg, curItems);
                if (collision.collides) {
                  const enteredCollision = !drag.colliding;
                  drag.colliding = true;
                  renderer.domElement.style.cursor = 'not-allowed';
                  if (enteredCollision || nowTs - lastDragCollisionSearchTs >= 100) {
                    lastDragCollisionSearchTs = nowTs;
                    const nearest = findNearestAllowedPosition(itemObj, nx, nz, cfg, curItems, {
                      x: drag.lastValidX,
                      z: drag.lastValidZ,
                    });
                    setWallCollision({
                      itemId: drag.itemId,
                      collidedShellSides: collision.collidedShellSides,
                      collidedWallItemIds: collision.collidedWallItemIds,
                      snapX: nearest.x,
                      snapZ: nearest.z,
                    });
                  }
                } else {
                  const wasColliding = drag.colliding;
                  drag.colliding = false;
                  drag.lastValidX = nx;
                  drag.lastValidZ = nz;
                  renderer.domElement.style.cursor = 'grabbing';
                  if (wasColliding) {
                    setWallCollision(null);
                  }
                }
              }

              markSceneDirty();
            }
          }
          return;
        }

        // Throttle hover raycasting according to active performance profile
        const hoverInterval = PERFORMANCE_PROFILES[propsRef.current.performanceMode].hoverRaycastIntervalMs;
        const nowTs = performance.now();
        if (nowTs - lastHoverRaycastTs < hoverInterval) return;
        lastHoverRaycastTs = nowTs;

        // Hover feedback in Paint Mode, Navigation Mode, or default cursor
        if (propsRef.current.paintAssetId) {
          const picked = findPickedTarget();
          if (picked?.kind === 'item' && picked.surfaceId) {
            renderer.domElement.style.cursor = 'crosshair';
            setHoverPaintLabel(`Click to apply artwork to ${picked.surfaceLabel}`);
          } else if (picked?.kind === 'item') {
            const hoveredItem = propsRef.current.items.find((i) => i.id === picked.itemId);
            if (hoveredItem && !isItemBrandingAllowed(hoveredItem)) {
              renderer.domElement.style.cursor = 'not-allowed';
              setHoverPaintLabel('Branding not permitted on this permanent venue fixture');
            } else {
              renderer.domElement.style.cursor = 'not-allowed';
              setHoverPaintLabel('Hover over a brandable surface or allowed venue branding zone');
            }
          } else if (picked?.kind === 'shell') {
            renderer.domElement.style.cursor = 'crosshair';
            setHoverPaintLabel(`Click to apply artwork to ${picked.side.toUpperCase()} Shell Wall`);
          } else {
            renderer.domElement.style.cursor = 'not-allowed';
            setHoverPaintLabel('Hover over any wall, counter, banner, or screen');
          }
        } else if (ev.ctrlKey || ev.metaKey) {
          setHoverPaintLabel(null);
          renderer.domElement.style.cursor = 'crosshair';
        } else if (propsRef.current.navMode === 'pan' || propsRef.current.viewMode === '2d') {
          setHoverPaintLabel(null);
          if (propsRef.current.navMode === 'pan') {
            renderer.domElement.style.cursor = 'grab';
          } else {
            const picked = findPickedTarget();
            renderer.domElement.style.cursor =
              picked?.kind === 'item' ? 'grab' : picked?.kind === 'shell' ? 'pointer' : 'move';
          }
        } else if (propsRef.current.navMode === 'orbit') {
          setHoverPaintLabel(null);
          renderer.domElement.style.cursor = 'grab';
        } else {
          setHoverPaintLabel(null);
          const picked = findPickedTarget();
          renderer.domElement.style.cursor =
            picked?.kind === 'item' ? 'grab' : picked?.kind === 'shell' ? 'pointer' : 'default';
        }
      };

      const onDoubleClick = (ev: MouseEvent) => {
        if (propsRef.current.paintAssetId) return;
        const rect = canvasRectRef.current ?? renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        pointerNDC.y = -((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
        const picked = findPickedTarget();
        if (picked?.kind === 'item') {
          frameTargetItemOrStand(picked.itemId);
        }
      };

      const finishMarquee = (pointerId?: number) => {
        const marquee = marqueeStateRef.current;
        if (!marquee.active) return;

        const {
          items: curItems,
          selectedItemIds: curSelectedIds,
          onSelectItems: selectItems,
          onToggleSelectItem: toggleSelectItem,
          onSelectShellWall: selectShell,
        } = propsRef.current;

        if (marquee.dragging && activeCamRef.current) {
          const boxRect = computeMarqueeRect(
            marquee.startX,
            marquee.startY,
            marquee.currentX,
            marquee.currentY
          );
          const rect = renderer.domElement.getBoundingClientRect();
          const cam = activeCamRef.current;
          const cornerVec = new THREE.Vector3();
          const matchedIds: string[] = [];

          for (const item of curItems) {
            if (item.visible === false) continue;
            const hw = item.dims.w / 2;
            const hd = item.dims.d / 2;
            const rad = (item.rotationY * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            let visibleCornerCount = 0;

            for (const lx of [-hw, hw]) {
              for (const ly of [0, item.dims.h]) {
                for (const lz of [-hd, hd]) {
                  const wx = item.x + lx * cos + lz * sin;
                  const wy = item.y + ly;
                  const wz = item.z - lx * sin + lz * cos;
                  cornerVec.set(wx, wy, wz).project(cam);
                  if (cornerVec.z >= -1 && cornerVec.z <= 1) {
                    const sx = (cornerVec.x * 0.5 + 0.5) * rect.width;
                    const sy = (-cornerVec.y * 0.5 + 0.5) * rect.height;
                    minX = Math.min(minX, sx);
                    maxX = Math.max(maxX, sx);
                    minY = Math.min(minY, sy);
                    maxY = Math.max(maxY, sy);
                    visibleCornerCount += 1;
                  }
                }
              }
            }

            if (
              visibleCornerCount > 0 &&
              isScreenBoxIntersectingRect({ minX, minY, maxX, maxY }, boxRect)
            ) {
              matchedIds.push(item.id);
            }
          }

          if (matchedIds.length > 0) {
            selectShell(null);
            selectItems(mergeSelection(curSelectedIds, matchedIds, true));
          }
        } else if (marquee.startedOnItemId) {
          selectShell(null);
          toggleSelectItem(marquee.startedOnItemId);
        }

        marqueeStateRef.current.active = false;
        marqueeStateRef.current.dragging = false;
        marqueeStateRef.current.startedOnItemId = null;
        setMarqueeRect(null);
        controls.enabled = true;
        renderer.domElement.style.cursor = 'default';
        if (typeof pointerId === 'number') {
          try {
            renderer.domElement.releasePointerCapture(pointerId);
          } catch {
            // ignore
          }
        }
      };

      const finishDrag = (pointerId?: number) => {
        if (marqueeStateRef.current.active) {
          finishMarquee(pointerId);
          return;
        }

        const drag = dragStateRef.current;
        if (!drag.active) return;

        if (!drag.moved && drag.clickedInMultiId) {
          // User clicked an item inside an existing multi-selection without dragging:
          // collapse selection to that single item (standard editor behavior)
          propsRef.current.onSelectItem(drag.clickedInMultiId, drag.clickedSurfaceId);
        } else if (drag.moved && drag.itemId) {
          const {
            config: cfg,
            items: curItems,
            onMoveItem: moveItem,
            onMoveItems: moveItems,
          } = propsRef.current;

          if (drag.isMulti) {
            const finalPositions = drag.colliding
              ? drag.lastValidPositions
              : drag.lastPositions;
            for (const pos of finalPositions) {
              const cachedMesh = itemMeshCacheRef.current.get(pos.id);
              const targetItem = curItems.find((i) => i.id === pos.id);
              if (cachedMesh && targetItem) {
                cachedMesh.group.position.set(pos.x, targetItem.y, pos.z);
              }
            }
            markShadowsDirty();
            markSceneDirty();
            moveItems(finalPositions, true);
          } else {
            const itemObj = curItems.find((i) => i.id === drag.itemId);
            let finalX = drag.lastX;
            let finalZ = drag.lastZ;
            if (itemObj) {
              const nearest = findNearestAllowedPosition(itemObj, drag.lastX, drag.lastZ, cfg, curItems, {
                x: drag.lastValidX,
                z: drag.lastValidZ,
              });
              finalX = nearest.x;
              finalZ = nearest.z;
            }
            // Snap imperative 3D meshes to final allowed position immediately before React commits
            const cachedMesh = itemMeshCacheRef.current.get(drag.itemId);
            if (cachedMesh && itemObj) {
              cachedMesh.group.position.set(finalX, itemObj.y, finalZ);
            }
            if (selectionRingRef.current) {
              selectionRingRef.current.position.set(finalX, 0.012, finalZ);
            }
            markShadowsDirty();
            markSceneDirty();
            moveItem(drag.itemId, finalX, finalZ, true);
          }
        }

        dragStateRef.current.active = false;
        dragStateRef.current.itemId = null;
        dragStateRef.current.isMulti = false;
        dragStateRef.current.clickedInMultiId = null;
        dragStateRef.current.clickedSurfaceId = null;
        dragStateRef.current.colliding = false;
        setWallCollision(null);
        controls.enabled = true;
        renderer.domElement.style.cursor = 'default';
        if (typeof pointerId === 'number') {
          try {
            renderer.domElement.releasePointerCapture(pointerId);
          } catch {
            // ignore
          }
        }
      };

      const onPointerUp = (ev: PointerEvent) => finishDrag(ev.pointerId);
      const onPointerCancel = (ev: PointerEvent) => finishDrag(ev.pointerId);
      const onContextMenu = (ev: MouseEvent) => {
        if (ev.ctrlKey) {
          ev.preventDefault();
        }
      };

      const onContextLost = (ev: Event) => {
        ev.preventDefault();
        setWebglContextLost(true);
      };
      const onContextRestored = () => {
        setWebglContextLost(false);
        setTextureTick((t) => t + 1);
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('dblclick', onDoubleClick);
      renderer.domElement.addEventListener('contextmenu', onContextMenu);
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('resize', refreshCanvasRect);

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (!container) return;
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        renderer.setSize(w, h);
        refreshCanvasRect();
        const a = w / h;
        resizePerspectiveCamera(persp, a);

        const cfg = propsRef.current.config;
        const halfH = Math.max(cfg.depth, cfg.width / a) * 0.78 + 0.9;
        ortho.top = halfH;
        ortho.bottom = -halfH;
        ortho.left = -halfH * a;
        ortho.right = halfH * a;
        ortho.updateProjectionMatrix();
        markSceneDirty();
      });
      ro.observe(container);

      // Render Loop + Dimension Label Projection + Performance Monitoring
      let animId = 0;
      let frameCount = 0;
      let nextSoftwareRenderTs = 0;
      let lastRenderedTs = 0;
      let lastMetricsReportTs = 0;
      let wasIdle = false;
      let lastEmittedMetricsKey = '';
      const projVec = new THREE.Vector3();

      const itemMeshCache = itemMeshCacheRef.current;

      const emitMetricsIfChanged = (
        avgFps: number | null,
        isIdle: boolean,
        isSoftwareWebGL: boolean
      ) => {
        const key = `${avgFps ?? 'null'}|${isIdle ? 1 : 0}|${isSoftwareWebGL ? 1 : 0}`;
        if (key === lastEmittedMetricsKey) return;
        lastEmittedMetricsKey = key;
        propsRef.current.onPerformanceMetrics?.({
          avgFps,
          isIdle,
          isSoftwareWebGL,
        });
      };

      const animate = (now: number = performance.now()) => {
        animId = requestAnimationFrame(animate);
        if (document.hidden) return;
        if (isSoftwareWebGLRef.current && frameCount > 0 && now < nextSoftwareRenderTs) {
          return;
        }

        const profile = PERFORMANCE_PROFILES[propsRef.current.performanceMode];

        // On-demand idle sleep: skip GPU work when camera & scene are still
        const isAnimatingCam = cameraAnimRef.current.active && activeCamRef.current === persp;
        const isDragging = dragStateRef.current.active;
        const isWithinActivityWindow = now - lastActivityTsRef.current < 450;
        const shouldRender =
          frameCount === 0 ||
          !profile.renderOnDemandWhenIdle ||
          dirtyRef.current ||
          isAnimatingCam ||
          isWithinActivityWindow;

        if (!shouldRender) {
          if (!wasIdle) {
            wasIdle = true;
            lastMetricsReportTs = now;
            emitMetricsIfChanged(
              perfMonitorRef.current.getAverageFps(),
              true,
              isSoftwareWebGLRef.current
            );
          }
          return;
        }

        // Frame-rate pacing when targetFps is capped (e.g. 30 FPS Balanced, 24 FPS Eco)
        if (profile.targetFps > 0 && frameCount > 0 && !dirtyRef.current) {
          const minIntervalMs = 1000 / profile.targetFps;
          if (now - lastRenderedTs < minIntervalMs - 1) {
            return;
          }
        }

        wasIdle = false;
        dirtyRef.current = false;
        lastRenderedTs = now;
        frameCount += 1;

        if (isAnimatingCam) {
          persp.position.lerp(cameraAnimRef.current.targetPos, 0.12);
          controls.target.lerp(cameraAnimRef.current.targetLook, 0.12);
          if (
            persp.position.distanceTo(cameraAnimRef.current.targetPos) < 0.03 &&
            controls.target.distanceTo(cameraAnimRef.current.targetLook) < 0.03
          ) {
            cameraAnimRef.current.active = false;
          }
        }

        controls.update();
        if (activeCamRef.current === persp && controls.target.y < 0) {
          controls.target.y = 0;
        }
        const cam = activeCamRef.current || persp;
        const renderStart = performance.now();
        renderer.render(scene, cam);
        const renderMs = performance.now() - renderStart;

        if (isSoftwareWebGLRef.current) {
          nextSoftwareRenderTs = performance.now() + Math.max(200, renderMs * 2);
        }

        // Record active frame for slow-device detection & live FPS readout (paused during drag)
        const slowAlert = perfMonitorRef.current.recordActiveFrame(now, renderMs);
        if (slowAlert && !isDragging) {
          propsRef.current.onSlowPerformanceDetected?.(slowAlert);
        }
        if (!isDragging && now - lastMetricsReportTs >= 1000) {
          lastMetricsReportTs = now;
          emitMetricsIfChanged(
            perfMonitorRef.current.getAverageFps(),
            false,
            isSoftwareWebGLRef.current
          );
        }

        // Update 2D projected dimension & aisle badges (paused during item drag since camera is locked)
        const labelInterval = profile.labelUpdateIntervalFrames;
        if (
          !isDragging &&
          (frameCount === 1 || frameCount % labelInterval === 0) &&
          propsRef.current.config.showDimensions
        ) {
          const { config: cfg } = propsRef.current;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const points: { id: string; text: string; pos: THREE.Vector3; kind: 'dim' | 'aisle' | 'grid-tick' }[] = [
            {
              id: 'dim-w',
              text: formatLength(cfg.width, cfg.unit),
              pos: new THREE.Vector3(0, 0.04, cfg.depth / 2 + 0.38),
              kind: 'dim',
            },
            {
              id: 'dim-d',
              text: formatLength(cfg.depth, cfg.unit),
              pos: new THREE.Vector3(cfg.width / 2 + 0.4, 0.04, 0),
              kind: 'dim',
            },
            {
              id: 'aisle-front',
              text: 'FRONT AISLE',
              pos: new THREE.Vector3(0, 0.02, cfg.depth / 2 + 1.18),
              kind: 'aisle',
            },
          ];

          if (isOuterGridVisible(cfg)) {
            const margin = getOuterGridMargin(cfg);
            for (let m = 1; m <= margin; m++) {
              points.push({
                id: `grid-tick-x-${m}`,
                text: `+${formatLength(m, cfg.unit)}`,
                pos: new THREE.Vector3(cfg.width / 2 + m, -0.03, cfg.depth / 2 + 0.22),
                kind: 'grid-tick',
              });
              points.push({
                id: `grid-tick-z-${m}`,
                text: `+${formatLength(m, cfg.unit)}`,
                pos: new THREE.Vector3(-cfg.width / 2 - 0.26, -0.03, cfg.depth / 2 + m),
                kind: 'grid-tick',
              });
            }
          }

          if (cfg.openSides >= 2) {
            points.push({
              id: 'aisle-right',
              text: 'OPEN AISLE',
              pos: new THREE.Vector3(cfg.width / 2 + 1.48, 0.02, 0),
              kind: 'aisle',
            });
          }
          if (cfg.openSides >= 3) {
            points.push({
              id: 'aisle-left',
              text: 'OPEN AISLE',
              pos: new THREE.Vector3(-cfg.width / 2 - 1.35, 0.02, 0),
              kind: 'aisle',
            });
          }
          if (cfg.openSides === 4) {
            points.push({
              id: 'aisle-back',
              text: 'OPEN AISLE',
              pos: new THREE.Vector3(0, 0.02, -cfg.depth / 2 - 1.18),
              kind: 'aisle',
            });
          }

          const nextLabels: OverlayLabel[] = [];
          for (const pt of points) {
            projVec.copy(pt.pos).project(cam);
            if (projVec.z >= -1 && projVec.z <= 1) {
              const sx = Math.round((projVec.x * 0.5 + 0.5) * cw);
              const sy = Math.round((-projVec.y * 0.5 + 0.5) * ch);
              if (sx > 24 && sx < cw - 24 && sy > 24 && sy < ch - 24) {
                nextLabels.push({ id: pt.id, text: pt.text, x: sx, y: sy, kind: pt.kind });
              }
            }
          }
          const labelsKey = nextLabels.map((l) => `${l.id}:${l.text}:${l.x}:${l.y}`).join('|');
          if (labelsKey !== lastLabelsKeyRef.current) {
            lastLabelsKeyRef.current = labelsKey;
            setOverlayLabels(nextLabels);
          }
        }
      };

      animate();

      return () => {
        cancelAnimationFrame(animId);
        ro.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('dblclick', onDoubleClick);
        renderer.domElement.removeEventListener('contextmenu', onContextMenu);
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        window.removeEventListener('resize', refreshCanvasRect);
        itemMeshCache.clear();
        selectionRingRef.current = null;
        canvasRectRef.current = null;
        controls.dispose();
        envRT?.dispose();
        envRTRef.current = null;
        renderer.dispose();
      };
    }, [frameTargetItemOrStand, markSceneDirty, markShadowsDirty]);

    // Sync OrbitControls mouse bindings whenever navMode or viewMode changes
    useEffect(() => {
      syncControlsInteraction(effectiveNavMode, viewMode === '2d');
    }, [effectiveNavMode, viewMode, syncControlsInteraction]);

    // Hold Space for temporary Pan mode (like CAD / Figma)
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code !== 'Space' || e.repeat) return;
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable) {
          return;
        }
        e.preventDefault();
        setSpacePanning(true);
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          setSpacePanning(false);
        }
      };
      const onBlur = () => setSpacePanning(false);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
      };
    }, []);

    // Switch camera automatically when viewMode changes
    useEffect(() => {
      if (viewMode === '2d') {
        applyCameraPreset('top');
      } else if (viewMode === 'eye-level') {
        applyCameraPreset('eye-level');
      } else {
        applyCameraPreset('isometric');
      }
    }, [viewMode, applyCameraPreset]);

    // Dynamically apply Performance Mode changes without recreating WebGL context
    useEffect(() => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const controls = controlsRef.current;
      const container = containerRef.current;
      const profile = PERFORMANCE_PROFILES[performanceMode];

      perfMonitorRef.current.setMode(performanceMode);

      if (renderer && container) {
        const nextPR = isSoftwareWebGLRef.current
          ? Math.min(1, profile.maxPixelRatio)
          : Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
        renderer.setPixelRatio(nextPR);
        renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
        renderer.shadowMap.enabled = !isSoftwareWebGLRef.current && profile.shadowsEnabled;
        renderer.shadowMap.needsUpdate = true;
        renderer.toneMapping =
          profile.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      }

      if (scene) {
        scene.environment =
          profile.useEnvironmentIBL && !isSoftwareWebGLRef.current
            ? envRTRef.current?.texture ?? null
            : null;
        // Recompile materials cleanly when shadows / environment IBL toggle
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
              m.needsUpdate = true;
            }
          }
        });
      }

      if (controls) {
        controls.dampingFactor = profile.dampingFactor;
      }

      markSceneDirty();
    }, [performanceMode, markSceneDirty]);

    // Update Lighting Preset & Hall Backdrop
    useEffect(() => {
      const scene = sceneRef.current;
      const lightsGroup = lightsGroupRef.current;
      const hallFloor = hallFloorRef.current;
      const renderer = rendererRef.current;
      if (!scene || !lightsGroup || !renderer) return;

      while (lightsGroup.children.length > 0) {
        const child = lightsGroup.children[0];
        lightsGroup.remove(child);
        disposeLight(child);
      }

      const profile = PERFORMANCE_PROFILES[performanceMode];
      const useShadows = !isSoftwareWebGLRef.current && profile.shadowsEnabled;
      const shadowSize = profile.shadowMapSize;
      const iblBoost = profile.useEnvironmentIBL ? 1 : 1.24;

      const preset = config.lightingPreset;
      const frustumHalf = Math.max(config.width, config.depth, 4) * 0.95;
      if (preset === 'dramatic') {
        scene.background = new THREE.Color('#1A1E26');
        scene.fog = new THREE.Fog('#1A1E26', 16, 42);
        scene.environmentIntensity = 0.25;
        renderer.toneMappingExposure = 1.05;
        if (hallFloor) {
          (hallFloor.material as THREE.MeshStandardMaterial).color.set('#303642');
        }
        const hemi = new THREE.HemisphereLight('#9DB4D4', '#1E232D', 0.45 * iblBoost);
        lightsGroup.add(hemi);

        const spot1 = new THREE.SpotLight('#FFF4DC', 46, 20, Math.PI / 4, 0.55, 1.3);
        spot1.position.set(2.8, 6.2, 3.6);
        spot1.castShadow = useShadows;
        if (useShadows) {
          spot1.shadow.mapSize.set(shadowSize, shadowSize);
          spot1.shadow.bias = -0.00015;
          spot1.shadow.normalBias = 0.025;
        }
        lightsGroup.add(spot1);

        if (!profile.simplifiedLighting) {
          const spot2 = new THREE.SpotLight('#E2EEFF', 30, 18, Math.PI / 3.5, 0.6, 1.4);
          spot2.position.set(-3.2, 5.5, 2.2);
          lightsGroup.add(spot2);
        }
      } else if (preset === 'daylight') {
        scene.background = new THREE.Color('#F2F4F7');
        scene.fog = new THREE.Fog('#F2F4F7', 22, 55);
        scene.environmentIntensity = 0.72;
        renderer.toneMappingExposure = 1.1;
        if (hallFloor) {
          (hallFloor.material as THREE.MeshStandardMaterial).color.set('#FFFFFF');
        }
        const hemi = new THREE.HemisphereLight('#FFFFFF', '#D5D8DC', 0.95 * iblBoost);
        lightsGroup.add(hemi);

        const sun = new THREE.DirectionalLight('#FFFDF8', 1.45);
        sun.position.set(6, 10, 7);
        sun.castShadow = useShadows;
        if (useShadows) {
          sun.shadow.mapSize.set(shadowSize, shadowSize);
          sun.shadow.camera.left = -frustumHalf;
          sun.shadow.camera.right = frustumHalf;
          sun.shadow.camera.top = frustumHalf;
          sun.shadow.camera.bottom = -frustumHalf;
          sun.shadow.bias = -0.00015;
          sun.shadow.normalBias = 0.028;
        }
        lightsGroup.add(sun);

        if (!profile.simplifiedLighting) {
          const fill = new THREE.DirectionalLight('#DCE8F7', 0.45);
          fill.position.set(-5, 4, -4);
          lightsGroup.add(fill);
        }
      } else {
        // Default: Crisp Bright Exhibition Hall
        scene.background = new THREE.Color('#EDE9E2');
        scene.fog = new THREE.Fog('#EDE9E2', 20, 50);
        scene.environmentIntensity = 0.58;
        renderer.toneMappingExposure = 1.06;
        if (hallFloor) {
          (hallFloor.material as THREE.MeshStandardMaterial).color.set('#FAF8F4');
        }
        const hemi = new THREE.HemisphereLight('#F8FAFF', '#C5C9D1', 0.78 * iblBoost);
        lightsGroup.add(hemi);

        const mainLight = new THREE.DirectionalLight('#FFFBF4', 1.25);
        mainLight.position.set(5.5, 9.2, 6.2);
        mainLight.castShadow = useShadows;
        if (useShadows) {
          mainLight.shadow.mapSize.set(shadowSize, shadowSize);
          mainLight.shadow.camera.left = -frustumHalf;
          mainLight.shadow.camera.right = frustumHalf;
          mainLight.shadow.camera.top = frustumHalf;
          mainLight.shadow.camera.bottom = -frustumHalf;
          mainLight.shadow.bias = -0.00015;
          mainLight.shadow.normalBias = 0.028;
        }
        lightsGroup.add(mainLight);

        if (!profile.simplifiedLighting) {
          const rimLight = new THREE.DirectionalLight('#D9E7F8', 0.48);
          rimLight.position.set(-6, 5.5, -5);
          lightsGroup.add(rimLight);

          // Warm overhead exhibition bay fill
          const bayLight = new THREE.PointLight('#FFF5E6', 6, 14, 1.8);
          bayLight.position.set(0, 4.4, 0.5);
          lightsGroup.add(bayLight);
        }
      }
      markShadowsDirty();
      markSceneDirty();
    }, [config.lightingPreset, config.width, config.depth, performanceMode, markSceneDirty, markShadowsDirty]);

    // Rebuild Booth Shell + Scale Figures
    useEffect(() => {
      const shellGroup = shellGroupRef.current;
      if (!shellGroup) return;

      while (shellGroup.children.length > 0) {
        const c = shellGroup.children[0];
        shellGroup.remove(c);
        disposeObject3D(c);
      }

      const ctx = {
        config,
        assetsMap,
        onTextureReady: () => setTextureTick((t) => t + 1),
      };

      shellGroup.add(buildBoothShell(ctx));

      // Hide scale figures in 2D architectural plan view so dimension pills stay unobstructed
      if (config.showScaleFigures && viewMode !== '2d') {
        shellGroup.add(buildScaleFigures(config));
      }

      // Highlight selected shell wall if selected
      if (selectedShellWall && config.showShellWalls) {
        const w = selectedShellWall === 'back' ? config.width : config.depth;
        const h = config.shellWallHeight;
        const wallBox = new THREE.BoxGeometry(w, h, 0.11);
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(wallBox),
          new THREE.LineBasicMaterial({ color: '#D95D39' })
        );
        wallBox.dispose();
        if (selectedShellWall === 'back') {
          edge.position.set(0, h / 2, -config.depth / 2 - 0.04);
        } else if (selectedShellWall === 'left') {
          edge.position.set(-config.width / 2 - 0.04, h / 2, 0);
          edge.rotation.y = Math.PI / 2;
        } else {
          edge.position.set(config.width / 2 + 0.04, h / 2, 0);
          edge.rotation.y = -Math.PI / 2;
        }
        shellGroup.add(edge);
      }
      markShadowsDirty();
      markSceneDirty();
    }, [config, assetsMap, selectedShellWall, textureTick, viewMode, markSceneDirty, markShadowsDirty]);

    // Sync Equipment Items incrementally (reuse cached 3D meshes when only transform/visibility changes)
    const collidingItemId = wallCollision?.itemId ?? null;
    useEffect(() => {
      const itemsGroup = itemsGroupRef.current;
      if (!itemsGroup) return;

      const cache = itemMeshCacheRef.current;
      const activeIds = new Set<string>();
      for (const item of items) {
        activeIds.add(item.id);
      }

      // Remove and dispose items that were deleted
      for (const [id, entry] of cache.entries()) {
        if (!activeIds.has(id)) {
          itemsGroup.remove(entry.group);
          disposeObject3D(entry.group);
          cache.delete(id);
        }
      }

      if (lastAssetsMapRef.current !== assetsMap) {
        lastAssetsMapRef.current = assetsMap;
        assetsVersionRef.current += 1;
      }

      const globalItemSig = [
        viewMode,
        textureTick,
        assetsVersionRef.current,
        config.primaryColor,
        config.accentColor,
        config.brandName,
        config.brandTagline,
        config.displayFont || '',
        config.bodyFont || '',
        config.standNumber || '',
        config.eventName || '',
      ].join('|');

      const ctx = {
        config,
        assetsMap,
        onTextureReady: () => setTextureTick((t) => t + 1),
      };

      const activeDrag = dragStateRef.current;

      for (const item of items) {
        const isColliding = Boolean(collidingItemId && collidingItemId === item.id);
        const sig = computeItemVisualSignature(item, viewMode, isColliding, globalItemSig);
        const existing = cache.get(item.id);
        const posX = activeDrag.active && activeDrag.itemId === item.id ? activeDrag.lastX : item.x;
        const posZ = activeDrag.active && activeDrag.itemId === item.id ? activeDrag.lastZ : item.z;

        if (existing && existing.sig === sig) {
          existing.group.position.set(posX, item.y, posZ);
          existing.group.rotation.y = (item.rotationY * Math.PI) / 180;
          existing.group.visible = item.visible !== false;
          continue;
        }

        if (existing) {
          itemsGroup.remove(existing.group);
          disposeObject3D(existing.group);
        }

        const meshGroup =
          item.catalogId === 'custom-3d-model'
            ? buildCustomModelMesh(item)
            : item.catalogId === 'custom-built-asset'
              ? buildCustomBuiltAssetMesh(item)
              : buildStandItemMesh(item, ctx);

        if (
          (item.catalogId === 'custom-3d-model' || item.catalogId === 'custom-built-asset') &&
          isVenuePermanentFixture(item)
        ) {
          applyVenueFixtureBrandingOverlay(meshGroup, item, ctx);
        }

        // In 2D Plan mode, render overhead rigging/hanging signs as semi-transparent
        // Reflected Ceiling Plan (RCP) outlines so they never obscure floor furniture below
        if (isOverheadRcpItem(item, viewMode)) {
          meshGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const applyGhost = (m: THREE.Material) => {
                const cloned = m.clone();
                cloned.transparent = true;
                cloned.opacity = 0.16;
                cloned.depthWrite = false;
                return cloned;
              };
              if (Array.isArray(child.material)) {
                child.material = child.material.map(applyGhost);
              } else if (child.material) {
                child.material = applyGhost(child.material);
              }
              child.castShadow = false;
            }
          });
          const rcpBox = new THREE.BoxGeometry(item.dims.w, 0.02, item.dims.d);
          const rcpOutline = new THREE.LineSegments(
            new THREE.EdgesGeometry(rcpBox),
            new THREE.LineDashedMaterial({
              color: '#1B365D',
              dashSize: 0.14,
              gapSize: 0.09,
              transparent: true,
              opacity: 0.65,
            })
          );
          rcpBox.dispose();
          rcpOutline.computeLineDistances();
          rcpOutline.position.y = item.dims.h;
          meshGroup.add(rcpOutline);
        }

        if (isColliding) {
          applyWallCollisionRedTint(meshGroup, item);
        }

        meshGroup.position.set(posX, item.y, posZ);
        meshGroup.rotation.y = (item.rotationY * Math.PI) / 180;
        meshGroup.visible = item.visible !== false;

        itemsGroup.add(meshGroup);
        cache.set(item.id, { group: meshGroup, sig });
      }
      markShadowsDirty();
      markSceneDirty();
    }, [items, config, assetsMap, textureTick, modelsVersion, viewMode, collidingItemId, markSceneDirty, markShadowsDirty]);

    // Rebuild Helpers (Floor Grid, Selection Ring, Boundary Alerts, Venue Height Limit Frame)
    useEffect(() => {
      const helpersGroup = helpersGroupRef.current;
      if (!helpersGroup) return;

      selectionRingRef.current = null;
      while (helpersGroup.children.length > 0) {
        const c = helpersGroup.children[0];
        helpersGroup.remove(c);
        disposeObject3D(c);
      }

      const { width, depth, heightLimit, showGrid } = config;

      // Subtle architectural meter grid on booth floor
      if (showGrid) {
        const gridColor = config.lightingPreset === 'dramatic' ? 0x526073 : 0x9aa4b2;
        const gridMat = new THREE.LineBasicMaterial({
          color: gridColor,
          transparent: true,
          opacity: 0.28,
        });
        const points: THREE.Vector3[] = [];
        for (let x = -width / 2; x <= width / 2 + 0.001; x += 0.5) {
          points.push(new THREE.Vector3(x, 0.004, -depth / 2));
          points.push(new THREE.Vector3(x, 0.004, depth / 2));
        }
        for (let z = -depth / 2; z <= depth / 2 + 0.001; z += 0.5) {
          points.push(new THREE.Vector3(-width / 2, 0.004, z));
          points.push(new THREE.Vector3(width / 2, 0.004, z));
        }
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        helpersGroup.add(new THREE.LineSegments(geom, gridMat));
      }

      // Outer 1m architectural meter grid extending outside the planned stand area
      // for placing permanent venue fixtures (pillars, walls, utility points) in exact relation to the stand
      if (isOuterGridVisible(config)) {
        const margin = getOuterGridMargin(config);
        const halfW = width / 2;
        const halfD = depth / 2;
        const outerHalfW = halfW + margin;
        const outerHalfD = halfD + margin;
        const gridY = -0.043;

        const outerMajorColor = config.lightingPreset === 'dramatic' ? 0x64748b : 0x64748b;
        const outerGridMat = new THREE.LineBasicMaterial({
          color: outerMajorColor,
          transparent: true,
          opacity: config.lightingPreset === 'dramatic' ? 0.34 : 0.4,
        });

        const outerPts: THREE.Vector3[] = [];

        // X-aligned 1m lines stepping outward from -halfW and +halfW, plus 1m lines across width
        const xTicks = new Set<number>();
        for (let m = 1; m <= margin; m++) {
          xTicks.add(Number((-halfW - m).toFixed(3)));
          xTicks.add(Number((halfW + m).toFixed(3)));
        }
        for (let x = -halfW; x <= halfW + 0.001; x += 1) {
          xTicks.add(Number(Math.min(halfW, x).toFixed(3)));
        }
        xTicks.add(Number((-halfW).toFixed(3)));
        xTicks.add(Number(halfW.toFixed(3)));

        for (const x of xTicks) {
          const insideX = x > -halfW + 0.001 && x < halfW - 0.001;
          if (insideX) {
            outerPts.push(new THREE.Vector3(x, gridY, -outerHalfD));
            outerPts.push(new THREE.Vector3(x, gridY, -halfD));
            outerPts.push(new THREE.Vector3(x, gridY, halfD));
            outerPts.push(new THREE.Vector3(x, gridY, outerHalfD));
          } else {
            outerPts.push(new THREE.Vector3(x, gridY, -outerHalfD));
            outerPts.push(new THREE.Vector3(x, gridY, outerHalfD));
          }
        }

        // Z-aligned 1m lines stepping outward from -halfD and +halfD, plus 1m lines across depth
        const zTicks = new Set<number>();
        for (let m = 1; m <= margin; m++) {
          zTicks.add(Number((-halfD - m).toFixed(3)));
          zTicks.add(Number((halfD + m).toFixed(3)));
        }
        for (let z = -halfD; z <= halfD + 0.001; z += 1) {
          zTicks.add(Number(Math.min(halfD, z).toFixed(3)));
        }
        zTicks.add(Number((-halfD).toFixed(3)));
        zTicks.add(Number(halfD.toFixed(3)));

        for (const z of zTicks) {
          const insideZ = z > -halfD + 0.001 && z < halfD - 0.001;
          if (insideZ) {
            outerPts.push(new THREE.Vector3(-outerHalfW, gridY, z));
            outerPts.push(new THREE.Vector3(-halfW, gridY, z));
            outerPts.push(new THREE.Vector3(halfW, gridY, z));
            outerPts.push(new THREE.Vector3(outerHalfW, gridY, z));
          } else {
            outerPts.push(new THREE.Vector3(-outerHalfW, gridY, z));
            outerPts.push(new THREE.Vector3(outerHalfW, gridY, z));
          }
        }

        const outerGeom = new THREE.BufferGeometry().setFromPoints(outerPts);
        helpersGroup.add(new THREE.LineSegments(outerGeom, outerGridMat));

        // Dashed outer planning boundary frame
        const outerFramePts = [
          new THREE.Vector3(-outerHalfW, gridY + 0.001, -outerHalfD),
          new THREE.Vector3(outerHalfW, gridY + 0.001, -outerHalfD),
          new THREE.Vector3(outerHalfW, gridY + 0.001, outerHalfD),
          new THREE.Vector3(-outerHalfW, gridY + 0.001, outerHalfD),
          new THREE.Vector3(-outerHalfW, gridY + 0.001, -outerHalfD),
        ];
        const outerFrame = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(outerFramePts),
          new THREE.LineDashedMaterial({
            color: config.lightingPreset === 'dramatic' ? '#94A3B8' : '#475569',
            dashSize: 0.25,
            gapSize: 0.15,
            transparent: true,
            opacity: 0.55,
          })
        );
        outerFrame.computeLineDistances();
        helpersGroup.add(outerFrame);
      }

      // Subtle structural dashed footprint markers for permanent fixtures
      for (const item of items) {
        if (item.visible === false || !item.isPermanentFixture || selectedItemIds.includes(item.id)) continue;
        const pw = item.dims.w + 0.12;
        const pd = item.dims.d + 0.12;
        const fxGroup = new THREE.Group();
        fxGroup.position.set(item.x, -0.04, item.z);
        fxGroup.rotation.y = (item.rotationY * Math.PI) / 180;
        const fxPts = [
          new THREE.Vector3(-pw / 2, 0, -pd / 2),
          new THREE.Vector3(pw / 2, 0, -pd / 2),
          new THREE.Vector3(pw / 2, 0, pd / 2),
          new THREE.Vector3(-pw / 2, 0, pd / 2),
          new THREE.Vector3(-pw / 2, 0, -pd / 2),
        ];
        const fxOutline = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(fxPts),
          new THREE.LineDashedMaterial({
            color: isVenuePermanentFixture(item) ? '#0F766E' : '#1B365D',
            dashSize: 0.1,
            gapSize: 0.06,
            transparent: true,
            opacity: 0.72,
          })
        );
        fxOutline.computeLineDistances();
        fxGroup.add(fxOutline);
        helpersGroup.add(fxGroup);
      }

      // Booth perimeter footprint boundary line
      const borderPts = [
        new THREE.Vector3(-width / 2, 0.006, -depth / 2),
        new THREE.Vector3(width / 2, 0.006, -depth / 2),
        new THREE.Vector3(width / 2, 0.006, depth / 2),
        new THREE.Vector3(-width / 2, 0.006, depth / 2),
        new THREE.Vector3(-width / 2, 0.006, -depth / 2),
      ];
      const borderLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(borderPts),
        new THREE.LineBasicMaterial({
          color: compliance.isCompliant && !wallCollision ? '#1B365D' : '#DC2626',
          transparent: true,
          opacity: 0.65,
        })
      );
      helpersGroup.add(borderLine);

      // Selected Item Highlight Ring(s) + Corner Ticks
      const selectedSet = new Set(selectedItemIds);
      const visibleSelectedItems: StandItem[] = [];
      const activeDrag = dragStateRef.current;
      for (const selId of selectedItemIds) {
        const sel = items.find((i) => i.id === selId);
        if (!sel || sel.visible === false) continue;
        visibleSelectedItems.push(sel);

        const pad = 0.08;
        const bw = sel.dims.w + pad * 2;
        const bd = sel.dims.d + pad * 2;
        const isWallColliding = wallCollision?.itemId === sel.id;
        const isOob = compliance.outOfBoundsIds.includes(sel.id);
        const selColor = isWallColliding ? '#EF4444' : isOob ? '#DC2626' : '#D95D39';
        const selX =
          activeDrag.active && !activeDrag.isMulti && activeDrag.itemId === sel.id
            ? activeDrag.lastX
            : sel.x;
        const selZ =
          activeDrag.active && !activeDrag.isMulti && activeDrag.itemId === sel.id
            ? activeDrag.lastZ
            : sel.z;

        const ringGroup = new THREE.Group();
        ringGroup.position.set(selX, 0.012, selZ);
        ringGroup.rotation.y = (sel.rotationY * Math.PI) / 180;
        if (selectedItemIds.length === 1) {
          selectionRingRef.current = ringGroup;
        }

        const rectPts = [
          new THREE.Vector3(-bw / 2, 0, -bd / 2),
          new THREE.Vector3(bw / 2, 0, -bd / 2),
          new THREE.Vector3(bw / 2, 0, bd / 2),
          new THREE.Vector3(-bw / 2, 0, bd / 2),
          new THREE.Vector3(-bw / 2, 0, -bd / 2),
        ];
        ringGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(rectPts),
            new THREE.LineBasicMaterial({ color: selColor })
          )
        );

        // Translucent selection footprint pad
        const padMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(bw, bd),
          new THREE.MeshBasicMaterial({
            color: selColor,
            transparent: true,
            opacity: isWallColliding ? 0.34 : 0.14,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        padMesh.rotation.x = -Math.PI / 2;
        ringGroup.add(padMesh);

        // Forward direction chevron indicator (+Z)
        const arrowMesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.065, 0.14, 3),
          new THREE.MeshBasicMaterial({ color: selColor })
        );
        arrowMesh.rotation.x = Math.PI / 2;
        arrowMesh.position.set(0, 0.02, bd / 2 + 0.1);
        ringGroup.add(arrowMesh);

        helpersGroup.add(ringGroup);

        // Ghost preview showing the nearest allowed snap-back position on drop
        if (isWallColliding && wallCollision) {
          const snapGroup = new THREE.Group();
          snapGroup.position.set(wallCollision.snapX, 0.016, wallCollision.snapZ);
          snapGroup.rotation.y = (sel.rotationY * Math.PI) / 180;

          const snapPts = [
            new THREE.Vector3(-sel.dims.w / 2, 0, -sel.dims.d / 2),
            new THREE.Vector3(sel.dims.w / 2, 0, -sel.dims.d / 2),
            new THREE.Vector3(sel.dims.w / 2, 0, sel.dims.d / 2),
            new THREE.Vector3(-sel.dims.w / 2, 0, sel.dims.d / 2),
            new THREE.Vector3(-sel.dims.w / 2, 0, -sel.dims.d / 2),
          ];
          const snapOutline = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(snapPts),
            new THREE.LineDashedMaterial({
              color: '#10B981',
              dashSize: 0.12,
              gapSize: 0.08,
            })
          );
          snapOutline.computeLineDistances();
          snapGroup.add(snapOutline);

          const snapPad = new THREE.Mesh(
            new THREE.PlaneGeometry(sel.dims.w, sel.dims.d),
            new THREE.MeshBasicMaterial({
              color: '#10B981',
              transparent: true,
              opacity: 0.14,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          );
          snapPad.rotation.x = -Math.PI / 2;
          snapGroup.add(snapPad);
          helpersGroup.add(snapGroup);

          // Dashed guide line connecting dragged item to its snap-back destination
          const guideLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(sel.x, 0.02, sel.z),
              new THREE.Vector3(wallCollision.snapX, 0.02, wallCollision.snapZ),
            ]),
            new THREE.LineDashedMaterial({
              color: '#EF4444',
              dashSize: 0.1,
              gapSize: 0.07,
            })
          );
          guideLine.computeLineDistances();
          helpersGroup.add(guideLine);
        }
      }

      // Dashed group bounding box when 2+ items are selected
      if (visibleSelectedItems.length > 1) {
        const groupBounds = computeGroupBounds(visibleSelectedItems);
        if (groupBounds) {
          const gPad = 0.14;
          const gMinX = groupBounds.minX - gPad;
          const gMaxX = groupBounds.maxX + gPad;
          const gMinZ = groupBounds.minZ - gPad;
          const gMaxZ = groupBounds.maxZ + gPad;
          const groupPts = [
            new THREE.Vector3(gMinX, 0.018, gMinZ),
            new THREE.Vector3(gMaxX, 0.018, gMinZ),
            new THREE.Vector3(gMaxX, 0.018, gMaxZ),
            new THREE.Vector3(gMinX, 0.018, gMaxZ),
            new THREE.Vector3(gMinX, 0.018, gMinZ),
          ];
          const groupLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(groupPts),
            new THREE.LineDashedMaterial({
              color: '#D95D39',
              dashSize: 0.14,
              gapSize: 0.09,
              transparent: true,
              opacity: 0.85,
            })
          );
          groupLine.computeLineDistances();
          helpersGroup.add(groupLine);
        }
      }

      // Highlight collided perimeter shell wall(s) in vivid red
      if (wallCollision && config.showShellWalls) {
        for (const side of wallCollision.collidedShellSides) {
          const wallW = side === 'back' ? width : depth;
          const wallH = config.shellWallHeight;
          const boxGeom = new THREE.BoxGeometry(wallW + 0.02, wallH + 0.02, 0.13);
          const wallWarn = new THREE.LineSegments(
            new THREE.EdgesGeometry(boxGeom),
            new THREE.LineBasicMaterial({ color: '#FF1F1F' })
          );
          boxGeom.dispose();
          if (side === 'back') {
            wallWarn.position.set(0, wallH / 2, -depth / 2 - 0.04);
          } else if (side === 'left') {
            wallWarn.position.set(-width / 2 - 0.04, wallH / 2, 0);
            wallWarn.rotation.y = Math.PI / 2;
          } else {
            wallWarn.position.set(width / 2 + 0.04, wallH / 2, 0);
            wallWarn.rotation.y = -Math.PI / 2;
          }
          helpersGroup.add(wallWarn);
        }
      }

      // Highlight out-of-bounds items with subtle red warning footprints
      for (const oobId of compliance.outOfBoundsIds) {
        if (selectedSet.has(oobId)) continue;
        const item = items.find((i) => i.id === oobId);
        if (!item) continue;
        const warnMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(item.dims.w + 0.08, item.dims.d + 0.08),
          new THREE.MeshBasicMaterial({
            color: '#EF4444',
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        warnMesh.rotation.x = -Math.PI / 2;
        warnMesh.rotation.z = -(item.rotationY * Math.PI) / 180;
        warnMesh.position.set(item.x, 0.015, item.z);
        helpersGroup.add(warnMesh);
      }

      // Show ceiling height limit plane only if an item violates venue max height
      if (compliance.overHeightIds.length > 0) {
        const ceilPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(width, depth),
          new THREE.MeshBasicMaterial({
            color: '#EF4444',
            transparent: true,
            opacity: 0.14,
            side: THREE.DoubleSide,
          })
        );
        ceilPlane.rotation.x = -Math.PI / 2;
        ceilPlane.position.y = heightLimit;
        helpersGroup.add(ceilPlane);
      }
      markSceneDirty();
    }, [config, items, selectedItemIds, compliance, wallCollision, markSceneDirty]);

    const projectClientToFloor = (clientX: number, clientY: number): { x: number; z: number } => {
      const renderer = rendererRef.current;
      const cam = activeCamRef.current;
      if (!renderer || !cam) return { x: 0, z: 0 };
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, cam);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) {
        let x = hit.x;
        let z = hit.z;
        if (config.snapToGrid) {
          const step = config.gridStep || 0.1;
          x = Math.round(x / step) * step;
          z = Math.round(z / step) * step;
        }
        const outerMargin = getOuterGridMargin(config);
        const maxX = Math.max(config.width * 0.75, config.width / 2 + outerMargin);
        const maxZ = Math.max(config.depth * 0.75, config.depth / 2 + outerMargin);
        x = Math.max(-maxX, Math.min(maxX, Number(x.toFixed(2))));
        z = Math.max(-maxZ, Math.min(maxZ, Number(z.toFixed(2))));
        return { x, z };
      }
      return { x: 0, z: 0 };
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const types = Array.from(e.dataTransfer.types || []);
      if (types.includes('application/x-zuki-catalog')) {
        setDropHint('Release to place equipment onto stand floor or outer grid');
      } else if (types.includes('application/x-zuki-model')) {
        setDropHint('Release to place 3D model onto stand floor or outer grid');
      } else if (types.includes('application/x-zuki-custom-asset')) {
        setDropHint('Release to place custom asset onto stand floor or outer grid');
      } else {
        setDropHint('Drop 3D model (.GLB, .GLTF, .STL, .OBJ) to place on stand');
      }
    };

    const handleDragLeave = (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDropHint(null);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDropHint(null);
      const pos = projectClientToFloor(e.clientX, e.clientY);

      const catalogId = e.dataTransfer.getData('application/x-zuki-catalog');
      if (catalogId) {
        onDropCatalogItem(catalogId, pos.x, pos.z);
        return;
      }

      const modelAssetId = e.dataTransfer.getData('application/x-zuki-model');
      if (modelAssetId) {
        onDropCustomModelAsset(modelAssetId, pos.x, pos.z);
        return;
      }

      const customAssetId = e.dataTransfer.getData('application/x-zuki-custom-asset');
      if (customAssetId && onDropCustomBuiltAsset) {
        onDropCustomBuiltAsset(customAssetId, pos.x, pos.z);
        return;
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDrop3DFiles(e.dataTransfer.files, pos.x, pos.z);
      }
    };

    return (
      <div
        className={`viewport-canvas-wrap ${dropHint ? 'drag-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div ref={containerRef} className="viewport-canvas-host" />

        {/* Projected 3D->2D Dimension, Outer Grid Tick & Aisle Labels */}
        {config.showDimensions && (
          <div className="viewport-overlay-labels" aria-hidden="true">
            {overlayLabels.map((lbl) => (
              <div
                key={lbl.id}
                className={
                  lbl.kind === 'dim'
                    ? 'dim-pill-label'
                    : lbl.kind === 'grid-tick'
                      ? 'grid-tick-pill-label'
                      : 'aisle-pill-label'
                }
                style={{
                  transform: `translate(-50%, -50%) translate(${lbl.x}px, ${lbl.y}px)`,
                }}
              >
                {lbl.text}
              </div>
            ))}
          </div>
        )}

        {/* Active Artwork Click-to-Assign Banner */}
        {paintAssetId && (
          <div className="paint-mode-banner">
            <span className="paint-dot" />
            <span>
              <strong>Click-to-Brand Mode:</strong>{' '}
              {hoverPaintLabel || 'Click any wall, counter, banner, or screen to apply artwork'}
            </span>
          </div>
        )}

        {/* Wall Collision Warning Banner */}
        {wallCollision && (
          <div className="wall-collision-banner" role="alert">
            <span className="wall-collision-dot" />
            <span>
              <strong>Blocked by wall:</strong> Release to snap back to nearest allowed position
            </span>
          </div>
        )}

        {/* WebGL Context Lost Recovery Overlay */}
        {webglContextLost && (
          <div className="wall-collision-banner" role="alert">
            <span>
              <strong>3D graphics context paused:</strong> Recovering automatically, or{' '}
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  textDecoration: 'underline',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                reload viewport
              </button>
              .
            </span>
          </div>
        )}

        {/* Ctrl+Drag Marquee Multi-Select Rectangle */}
        {marqueeRect && (
          <div
            className="viewport-marquee-box"
            aria-hidden="true"
            style={{
              left: `${marqueeRect.left}px`,
              top: `${marqueeRect.top}px`,
              width: `${marqueeRect.width}px`,
              height: `${marqueeRect.height}px`,
            }}
          />
        )}

        {/* Drag-and-Drop 3D Model / Equipment Overlay */}
        {dropHint && (
          <div className="viewport-drop-overlay" aria-hidden="true">
            <div className="viewport-drop-badge">{dropHint}</div>
          </div>
        )}
      </div>
    );
  }
);
