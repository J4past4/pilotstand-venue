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
} from '../types/stand';
import { buildBoothShell, buildScaleFigures, buildStandItemMesh } from './meshFactory';
import { buildCustomModelMesh } from './modelLoader';
import { formatLength } from '../utils/pricing';

export interface StandViewportHandle {
  setCameraPreset: (preset: CameraPreset, instant?: boolean) => void;
  setCameraTransform: (pos: [number, number, number], target: [number, number, number]) => void;
  captureSnapshot: (width?: number, height?: number) => string | null;
}

interface StandViewportProps {
  config: StandConfig;
  items: StandItem[];
  assetsMap: Map<string, BrandAsset>;
  selectedItemId: string | null;
  selectedShellWall: ShellWallSide | null;
  viewMode: ViewMode;
  compliance: ComplianceReport;
  paintAssetId: string | null;
  tourActive?: boolean;
  onUserInterruptTour?: () => void;
  onSelectItem: (itemId: string | null, surfaceId?: string | null) => void;
  onSelectShellWall: (side: ShellWallSide | null) => void;
  onMoveItem: (itemId: string, x: number, z: number, commitHistory: boolean) => void;
  onPaintSurface: (
    target:
      | { kind: 'item'; itemId: string; surfaceId: string }
      | { kind: 'shell'; side: ShellWallSide }
  ) => void;
  onDropCatalogItem: (catalogId: string, x: number, z: number) => void;
  onDropCustomModelAsset: (modelAssetId: string, x: number, z: number) => void;
  onDrop3DFiles: (files: FileList, x: number, z: number) => void;
}

interface OverlayLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  kind: 'dim' | 'aisle';
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry && !mesh.userData.sharedGeometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.dispose();
      }
    }
  });
}

export const StandViewport3D = forwardRef<StandViewportHandle, StandViewportProps>(
  function StandViewport3D(
    {
      config,
      items,
      assetsMap,
      selectedItemId,
      selectedShellWall,
      viewMode,
      compliance,
      paintAssetId,
      tourActive,
      onUserInterruptTour,
      onSelectItem,
      onSelectShellWall,
      onMoveItem,
      onPaintSurface,
      onDropCatalogItem,
      onDropCustomModelAsset,
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

    const shellGroupRef = useRef<THREE.Group | null>(null);
    const itemsGroupRef = useRef<THREE.Group | null>(null);
    const helpersGroupRef = useRef<THREE.Group | null>(null);
    const lightsGroupRef = useRef<THREE.Group | null>(null);
    const hallFloorRef = useRef<THREE.Mesh | null>(null);

    const [textureTick, setTextureTick] = useState(0);
    const [hoverPaintLabel, setHoverPaintLabel] = useState<string | null>(null);
    const [overlayLabels, setOverlayLabels] = useState<OverlayLabel[]>([]);
    const [dropHint, setDropHint] = useState<string | null>(null);

    // Keep latest props accessible inside pointer/animation closures
    const propsRef = useRef({
      config,
      items,
      selectedItemId,
      viewMode,
      paintAssetId,
      tourActive,
      onUserInterruptTour,
      onSelectItem,
      onSelectShellWall,
      onMoveItem,
      onPaintSurface,
    });
    propsRef.current = {
      config,
      items,
      selectedItemId,
      viewMode,
      paintAssetId,
      tourActive,
      onUserInterruptTour,
      onSelectItem,
      onSelectShellWall,
      onMoveItem,
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
      offsetX: number;
      offsetZ: number;
      moved: boolean;
      lastX: number;
      lastZ: number;
      pointerDownX: number;
      pointerDownY: number;
    }>({
      active: false,
      itemId: null,
      offsetX: 0,
      offsetZ: 0,
      moved: false,
      lastX: 0,
      lastZ: 0,
      pointerDownX: 0,
      pointerDownY: 0,
    });

    const applyCameraPreset = useCallback((preset: CameraPreset, instant = false) => {
      const { config: cfg } = propsRef.current;
      const maxSpan = Math.max(cfg.width, cfg.depth, 3.2);
      const persp = perspCamRef.current;
      const ortho = orthoCamRef.current;
      const controls = controlsRef.current;
      if (!persp || !ortho || !controls) return;

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
        controls.enableRotate = false;
        controls.screenSpacePanning = true;
        controls.update();
        cameraAnimRef.current.active = false;
        return;
      }

      activeCamRef.current = persp;
      controls.object = persp;
      controls.enableRotate = true;
      controls.screenSpacePanning = false;

      const targetPos = new THREE.Vector3();
      const targetLook = new THREE.Vector3(0, 1.05, 0);

      if (preset === 'isometric') {
        targetPos.set(maxSpan * 1.15, maxSpan * 0.86, maxSpan * 1.28);
      } else if (preset === 'front') {
        targetPos.set(0, 1.65, maxSpan * 1.55);
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
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        setCameraPreset: (preset: CameraPreset, instant?: boolean) =>
          applyCameraPreset(preset, instant),
        setCameraTransform: (pos: [number, number, number], target: [number, number, number]) => {
          const persp = perspCamRef.current;
          const controls = controlsRef.current;
          if (!persp || !controls) return;
          activeCamRef.current = persp;
          controls.object = persp;
          controls.enableRotate = true;
          controls.screenSpacePanning = false;
          cameraAnimRef.current.active = false;
          persp.position.set(pos[0], pos[1], pos[2]);
          controls.target.set(target[0], target[1], target[2]);
          controls.update();
        },
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
            cam.aspect = width / height;
            cam.updateProjectionMatrix();
          }
          renderer.render(scene, cam);
          const dataUrl = renderer.domElement.toDataURL('image/png');

          // Restore viewport
          if (helpers) helpers.visible = prevHelpersVis;
          renderer.setPixelRatio(prevPR);
          renderer.setSize(prevSize.x, prevSize.y, false);
          if (cam instanceof THREE.PerspectiveCamera) {
            cam.aspect = prevSize.x / Math.max(1, prevSize.y);
            cam.updateProjectionMatrix();
          }
          renderer.render(scene, cam);
          return dataUrl;
        },
      }),
      [applyCameraPreset]
    );

    // Initialize Three.js Scene once
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || 960;
      const height = container.clientHeight || 640;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#E8EAEF');
      scene.fog = new THREE.Fog('#E8EAEF', 18, 48);
      sceneRef.current = scene;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Studio PBR Environment IBL
      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      const envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.55;
      roomEnv.dispose();
      pmrem.dispose();

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
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.minDistance = 1.4;
      controls.maxDistance = 24;
      controls.target.set(0, 1.05, 0);
      controls.update();
      controlsRef.current = controls;

      // Stop camera animation if user manually interacts
      controls.addEventListener('start', () => {
        cameraAnimRef.current.active = false;
        if (propsRef.current.tourActive && propsRef.current.onUserInterruptTour) {
          propsRef.current.onUserInterruptTour();
        }
      });

      // Surrounding Exhibition Hall Floor
      const hallCanvas = document.createElement('canvas');
      hallCanvas.width = 512;
      hallCanvas.height = 512;
      const hCtx = hallCanvas.getContext('2d')!;
      hCtx.fillStyle = '#DFE2E7';
      hCtx.fillRect(0, 0, 512, 512);
      hCtx.strokeStyle = 'rgba(130, 140, 155, 0.22)';
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

      const updatePointerNDC = (ev: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
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
        updatePointerNDC(ev);
        const picked = findPickedTarget();
        const {
          paintAssetId: activePaint,
          items: curItems,
          onSelectItem: selectItem,
          onSelectShellWall: selectShell,
          onPaintSurface: paintSurface,
        } = propsRef.current;

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
          selectItem(picked.itemId, picked.surfaceId);
          const itemObj = curItems.find((i) => i.id === picked.itemId);
          if (itemObj && !itemObj.locked && activeCamRef.current) {
            raycaster.setFromCamera(pointerNDC, activeCamRef.current);
            if (raycaster.ray.intersectPlane(floorPlane, planeHit)) {
              dragStateRef.current = {
                active: true,
                itemId: itemObj.id,
                offsetX: itemObj.x - planeHit.x,
                offsetZ: itemObj.z - planeHit.z,
                moved: false,
                lastX: itemObj.x,
                lastZ: itemObj.z,
                pointerDownX: ev.clientX,
                pointerDownY: ev.clientY,
              };
              controls.enabled = false;
              renderer.domElement.setPointerCapture(ev.pointerId);
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

      const onPointerMove = (ev: PointerEvent) => {
        updatePointerNDC(ev);
        const drag = dragStateRef.current;
        if (drag.active && drag.itemId && activeCamRef.current) {
          const distPx = Math.hypot(
            ev.clientX - drag.pointerDownX,
            ev.clientY - drag.pointerDownY
          );
          if (distPx < 4 && !drag.moved) return;

          raycaster.setFromCamera(pointerNDC, activeCamRef.current);
          if (raycaster.ray.intersectPlane(floorPlane, planeHit)) {
            const { config: cfg, onMoveItem: moveItem } = propsRef.current;
            let nx = planeHit.x + drag.offsetX;
            let nz = planeHit.z + drag.offsetZ;
            if (cfg.snapToGrid) {
              const step = cfg.gridStep || 0.1;
              nx = Math.round(nx / step) * step;
              nz = Math.round(nz / step) * step;
            }
            nx = Math.max(-cfg.width * 0.9, Math.min(cfg.width * 0.9, Number(nx.toFixed(3))));
            nz = Math.max(-cfg.depth * 0.9, Math.min(cfg.depth * 0.9, Number(nz.toFixed(3))));

            if (nx !== drag.lastX || nz !== drag.lastZ) {
              drag.moved = true;
              drag.lastX = nx;
              drag.lastZ = nz;
              moveItem(drag.itemId, nx, nz, false);
            }
          }
          return;
        }

        // Hover feedback in Paint Mode or default cursor
        if (propsRef.current.paintAssetId) {
          const picked = findPickedTarget();
          if (picked?.kind === 'item' && picked.surfaceId) {
            renderer.domElement.style.cursor = 'crosshair';
            setHoverPaintLabel(`Click to apply artwork to ${picked.surfaceLabel}`);
          } else if (picked?.kind === 'shell') {
            renderer.domElement.style.cursor = 'crosshair';
            setHoverPaintLabel(`Click to apply artwork to ${picked.side.toUpperCase()} Shell Wall`);
          } else {
            renderer.domElement.style.cursor = 'not-allowed';
            setHoverPaintLabel('Hover over any wall, counter, banner, or screen');
          }
        } else {
          setHoverPaintLabel(null);
          const picked = findPickedTarget();
          renderer.domElement.style.cursor =
            picked?.kind === 'item' ? 'grab' : picked?.kind === 'shell' ? 'pointer' : 'default';
        }
      };

      const onPointerUp = (ev: PointerEvent) => {
        const drag = dragStateRef.current;
        if (drag.active) {
          if (drag.moved && drag.itemId) {
            propsRef.current.onMoveItem(drag.itemId, drag.lastX, drag.lastZ, true);
          }
          dragStateRef.current.active = false;
          dragStateRef.current.itemId = null;
          controls.enabled = true;
          try {
            renderer.domElement.releasePointerCapture(ev.pointerId);
          } catch {
            // ignore
          }
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (!container) return;
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        renderer.setSize(w, h);
        persp.aspect = w / h;
        persp.updateProjectionMatrix();

        const a = w / h;
        const halfH = (ortho.top - ortho.bottom) / 2;
        ortho.left = -halfH * a;
        ortho.right = halfH * a;
        ortho.updateProjectionMatrix();
      });
      ro.observe(container);

      // Render Loop + Dimension Label Projection
      let animId = 0;
      let frameCount = 0;
      const projVec = new THREE.Vector3();

      const animate = () => {
        animId = requestAnimationFrame(animate);
        frameCount += 1;

        if (cameraAnimRef.current.active && activeCamRef.current === persp) {
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
        const cam = activeCamRef.current || persp;
        renderer.render(scene, cam);

        // Update 2D projected dimension & aisle badges immediately on frame 1 and every 4 frames
        if ((frameCount === 1 || frameCount % 4 === 0) && propsRef.current.config.showDimensions) {
          const { config: cfg } = propsRef.current;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const points: { id: string; text: string; pos: THREE.Vector3; kind: 'dim' | 'aisle' }[] = [
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
              const sx = (projVec.x * 0.5 + 0.5) * cw;
              const sy = (-projVec.y * 0.5 + 0.5) * ch;
              if (sx > 24 && sx < cw - 24 && sy > 24 && sy < ch - 24) {
                nextLabels.push({ id: pt.id, text: pt.text, x: sx, y: sy, kind: pt.kind });
              }
            }
          }
          setOverlayLabels(nextLabels);
        }
      };

      animate();

      return () => {
        cancelAnimationFrame(animId);
        ro.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        controls.dispose();
        envRT.dispose();
        renderer.dispose();
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

    // Update Lighting Preset & Hall Backdrop
    useEffect(() => {
      const scene = sceneRef.current;
      const lightsGroup = lightsGroupRef.current;
      const hallFloor = hallFloorRef.current;
      const renderer = rendererRef.current;
      if (!scene || !lightsGroup || !renderer) return;

      while (lightsGroup.children.length > 0) {
        lightsGroup.remove(lightsGroup.children[0]);
      }

      const preset = config.lightingPreset;
      if (preset === 'dramatic') {
        scene.background = new THREE.Color('#1A1E26');
        scene.fog = new THREE.Fog('#1A1E26', 16, 42);
        scene.environmentIntensity = 0.25;
        renderer.toneMappingExposure = 1.05;
        if (hallFloor) {
          (hallFloor.material as THREE.MeshStandardMaterial).color.set('#303642');
        }
        const hemi = new THREE.HemisphereLight('#9DB4D4', '#1E232D', 0.45);
        lightsGroup.add(hemi);

        const spot1 = new THREE.SpotLight('#FFF4DC', 46, 20, Math.PI / 4, 0.55, 1.3);
        spot1.position.set(2.8, 6.2, 3.6);
        spot1.castShadow = true;
        spot1.shadow.mapSize.set(2048, 2048);
        spot1.shadow.bias = -0.0005;
        lightsGroup.add(spot1);

        const spot2 = new THREE.SpotLight('#E2EEFF', 30, 18, Math.PI / 3.5, 0.6, 1.4);
        spot2.position.set(-3.2, 5.5, 2.2);
        lightsGroup.add(spot2);
      } else if (preset === 'daylight') {
        scene.background = new THREE.Color('#F2F4F7');
        scene.fog = new THREE.Fog('#F2F4F7', 22, 55);
        scene.environmentIntensity = 0.72;
        renderer.toneMappingExposure = 1.1;
        if (hallFloor) {
          (hallFloor.material as THREE.MeshStandardMaterial).color.set('#FFFFFF');
        }
        const hemi = new THREE.HemisphereLight('#FFFFFF', '#D5D8DC', 0.95);
        lightsGroup.add(hemi);

        const sun = new THREE.DirectionalLight('#FFFDF8', 1.45);
        sun.position.set(6, 10, 7);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -8;
        sun.shadow.camera.right = 8;
        sun.shadow.camera.top = 8;
        sun.shadow.camera.bottom = -8;
        sun.shadow.bias = -0.0005;
        lightsGroup.add(sun);

        const fill = new THREE.DirectionalLight('#DCE8F7', 0.45);
        fill.position.set(-5, 4, -4);
        lightsGroup.add(fill);
      } else {
        // Default: Crisp Bright Exhibition Hall
        scene.background = new THREE.Color('#E6E9EF');
        scene.fog = new THREE.Fog('#E6E9EF', 20, 50);
        scene.environmentIntensity = 0.58;
        renderer.toneMappingExposure = 1.06;
        if (hallFloor) {
          (hallFloor.material as THREE.MeshStandardMaterial).color.set('#F5F6F8');
        }
        const hemi = new THREE.HemisphereLight('#F8FAFF', '#C5C9D1', 0.78);
        lightsGroup.add(hemi);

        const mainLight = new THREE.DirectionalLight('#FFFBF4', 1.25);
        mainLight.position.set(5.5, 9.2, 6.2);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.set(2048, 2048);
        mainLight.shadow.camera.left = -8;
        mainLight.shadow.camera.right = 8;
        mainLight.shadow.camera.top = 8;
        mainLight.shadow.camera.bottom = -8;
        mainLight.shadow.bias = -0.0005;
        lightsGroup.add(mainLight);

        const rimLight = new THREE.DirectionalLight('#D9E7F8', 0.48);
        rimLight.position.set(-6, 5.5, -5);
        lightsGroup.add(rimLight);

        // Warm overhead exhibition bay fill
        const bayLight = new THREE.PointLight('#FFF5E6', 6, 14, 1.8);
        bayLight.position.set(0, 4.4, 0.5);
        lightsGroup.add(bayLight);
      }
    }, [config.lightingPreset]);

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

      if (config.showScaleFigures) {
        shellGroup.add(buildScaleFigures(config));
      }

      // Highlight selected shell wall if selected
      if (selectedShellWall && config.showShellWalls) {
        const w = selectedShellWall === 'back' ? config.width : config.depth;
        const h = config.shellWallHeight;
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, 0.11)),
          new THREE.LineBasicMaterial({ color: '#D95D39' })
        );
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
    }, [config, assetsMap, selectedShellWall, textureTick]);

    // Rebuild Equipment Items
    useEffect(() => {
      const itemsGroup = itemsGroupRef.current;
      if (!itemsGroup) return;

      while (itemsGroup.children.length > 0) {
        const c = itemsGroup.children[0];
        itemsGroup.remove(c);
        disposeObject3D(c);
      }

      const ctx = {
        config,
        assetsMap,
        onTextureReady: () => setTextureTick((t) => t + 1),
      };

      for (const item of items) {
        const meshGroup =
          item.catalogId === 'custom-3d-model'
            ? buildCustomModelMesh(item)
            : buildStandItemMesh(item, ctx);
        itemsGroup.add(meshGroup);
      }
    }, [items, config, assetsMap, textureTick]);

    // Rebuild Helpers (Floor Grid, Selection Ring, Boundary Alerts, Venue Height Limit Frame)
    useEffect(() => {
      const helpersGroup = helpersGroupRef.current;
      if (!helpersGroup) return;

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
          color: compliance.isCompliant ? '#1B365D' : '#DC2626',
          transparent: true,
          opacity: 0.65,
        })
      );
      helpersGroup.add(borderLine);

      // Selected Item Highlight Ring + Corner Ticks
      if (selectedItemId) {
        const sel = items.find((i) => i.id === selectedItemId);
        if (sel && sel.visible !== false) {
          const pad = 0.08;
          const bw = sel.dims.w + pad * 2;
          const bd = sel.dims.d + pad * 2;
          const isOob = compliance.outOfBoundsIds.includes(sel.id);
          const selColor = isOob ? '#DC2626' : '#D95D39';

          const ringGroup = new THREE.Group();
          ringGroup.position.set(sel.x, 0.012, sel.z);
          ringGroup.rotation.y = (sel.rotationY * Math.PI) / 180;

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
              opacity: 0.14,
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
        }
      }

      // Highlight out-of-bounds items with subtle red warning footprints
      for (const oobId of compliance.outOfBoundsIds) {
        if (oobId === selectedItemId) continue;
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
    }, [config, items, selectedItemId, compliance]);

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
        x = Math.max(-config.width * 0.75, Math.min(config.width * 0.75, Number(x.toFixed(2))));
        z = Math.max(-config.depth * 0.75, Math.min(config.depth * 0.75, Number(z.toFixed(2))));
        return { x, z };
      }
      return { x: 0, z: 0 };
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const types = Array.from(e.dataTransfer.types || []);
      if (types.includes('application/x-zuki-catalog')) {
        setDropHint('Release to place equipment onto stand floor');
      } else if (types.includes('application/x-zuki-model')) {
        setDropHint('Release to place 3D model onto stand floor');
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

        {/* Projected 3D->2D Dimension & Aisle Labels */}
        {config.showDimensions && (
          <div className="viewport-overlay-labels" aria-hidden="true">
            {overlayLabels.map((lbl) => (
              <div
                key={lbl.id}
                className={lbl.kind === 'dim' ? 'dim-pill-label' : 'aisle-pill-label'}
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
