import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ArrowRight,
  Box,
  Calculator,
  Check,
  CheckCircle2,
  Download,
  Eye,
  Grid2x2,
  Image,
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
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { StandConfig } from '../types/stand';
import { BUILTIN_BRAND_ASSETS } from '../data/palettes';
import { buildBoothShell, buildScaleFigures, buildStandItemMesh } from '../engine/meshFactory';
import {
  CLICK_EVENTS,
  TOUR_DURATION_SEC,
  WALKTHROUGH_CHAPTERS,
  WALKTHROUGH_DISMISSED_KEY,
  WALKTHROUGH_ITEMS,
  buildPaintedWalkthroughItem,
  buildWalkthroughStandConfig,
  clamp,
  easeOutBack,
  easeOutCubic,
  evaluateCursor,
  evaluateStageZoom,
  evaluateWalkthroughCamera,
  evaluateWorkspaceState,
  formatClock,
  lerp,
  playWalkthroughSound,
} from './walkthroughScript';
import type { AnchorMap } from './walkthroughScript';

export { TOUR_DURATION_SEC, WALKTHROUGH_DISMISSED_KEY };

const SPEED_OPTIONS = [1, 1.25, 1.5] as const;

interface StageItemEntry {
  id: string;
  appearAt: number;
  paintAt: number | null;
  baseX: number;
  baseY: number;
  baseZ: number;
  baseRotDeg: number;
  unpaintedGroup: THREE.Group;
  paintedGroup: THREE.Group | null;
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
 * Live Three.js PBR viewport embedded inside the miniature Zuki Workspace.
 * 100% deterministic from `elapsedSec` so scrubbing, pausing, and chapter jumps are frame-accurate.
 */
const WalkthroughViewport3D: React.FC<{
  elapsedSec: number;
  brandConfig: StandConfig;
  appWindowRef: React.RefObject<HTMLDivElement | null>;
  onUpdate3DAnchors: (desk: { x: number; y: number }, kiosk: { x: number; y: number }) => void;
}> = ({ elapsedSec, brandConfig, appWindowRef, onUpdate3DAnchors }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef(elapsedSec);
  const onUpdate3DAnchorsRef = useRef(onUpdate3DAnchors);

  useEffect(() => {
    elapsedRef.current = elapsedSec;
  }, [elapsedSec]);

  useEffect(() => {
    onUpdate3DAnchorsRef.current = onUpdate3DAnchors;
  }, [onUpdate3DAnchors]);

  const primaryHex = brandConfig.primaryColor || '#1B365D';
  const accentHex = brandConfig.accentColor || '#D95D39';
  const brandName = brandConfig.brandName || 'ZUKI STUDIO';
  const brandTagline = brandConfig.brandTagline || 'Modular Exhibition Architecture';

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 420;

    const scene = new THREE.Scene();
    const bgCol = new THREE.Color('#E8ECF2');
    scene.background = bgCol;
    scene.fog = new THREE.Fog(bgCol, 18, 44);

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
    scene.environmentIntensity = 0.62;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 80);

    // Clean, bright architectural studio lighting
    const hemi = new THREE.HemisphereLight('#FFFFFF', '#CBD5E1', 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#FFFBF5', 1.45);
    keyLight.position.set(7, 11, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 28;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0006;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#DCE7F7', 0.52);
    fillLight.position.set(-6, 6, -5);
    scene.add(fillLight);

    // Subtle exhibition hall floor
    const hallFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 52),
      new THREE.MeshStandardMaterial({
        color: '#DFE4EC',
        roughness: 0.92,
        metalness: 0.03,
      })
    );
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.y = -0.048;
    hallFloor.receiveShadow = true;
    scene.add(hallFloor);

    const assetsMap = new Map(BUILTIN_BRAND_ASSETS.map((a) => [a.id, a]));
    const baseBrand: StandConfig = {
      ...brandConfig,
      brandName,
      brandTagline,
      primaryColor: primaryHex,
      accentColor: accentHex,
    };

    const makeCtx = (cfg: StandConfig) => ({
      config: cfg,
      assetsMap,
      onTextureReady: () => {
        renderer.render(scene, camera);
      },
    });

    // Pre-build 3 booth shells for instant, deterministic transitions (4×3 Charcoal -> 6×4 Charcoal -> 6×4 Warm Oak)
    const cfg4x3Charcoal = buildWalkthroughStandConfig(baseBrand, 4, 3, 'charcoal-carpet');
    const cfg6x4Charcoal = buildWalkthroughStandConfig(baseBrand, 6, 4, 'charcoal-carpet');
    const cfg6x4Oak = buildWalkthroughStandConfig(baseBrand, 6, 4, 'oak-timber');

    const shell4x3Charcoal = buildBoothShell(makeCtx(cfg4x3Charcoal));
    const shell6x4Charcoal = buildBoothShell(makeCtx(cfg6x4Charcoal));
    const shell6x4Oak = buildBoothShell(makeCtx(cfg6x4Oak));

    shell4x3Charcoal.visible = true;
    shell6x4Charcoal.visible = false;
    shell6x4Oak.visible = false;
    scene.add(shell4x3Charcoal, shell6x4Charcoal, shell6x4Oak);

    // Pre-build all 6 stand items (unpainted + painted variants)
    const itemCtx = makeCtx(cfg6x4Oak);
    const entries: StageItemEntry[] = WALKTHROUGH_ITEMS.map((spec) => {
      const unpaintedGroup = buildStandItemMesh(spec.item, itemCtx);
      unpaintedGroup.position.set(spec.item.x, spec.item.y, spec.item.z);
      unpaintedGroup.rotation.y = (spec.item.rotationY * Math.PI) / 180;
      unpaintedGroup.visible = false;
      scene.add(unpaintedGroup);

      let paintedGroup: THREE.Group | null = null;
      if (spec.paintAt !== null) {
        const paintedSpec = buildPaintedWalkthroughItem(spec.item, primaryHex);
        paintedGroup = buildStandItemMesh(paintedSpec, itemCtx);
        paintedGroup.position.set(spec.item.x, spec.item.y, spec.item.z);
        paintedGroup.rotation.y = (spec.item.rotationY * Math.PI) / 180;
        paintedGroup.visible = false;
        scene.add(paintedGroup);
      }

      return {
        id: spec.id,
        appearAt: spec.appearAt,
        paintAt: spec.paintAt,
        baseX: spec.item.x,
        baseY: spec.item.y,
        baseZ: spec.item.z,
        baseRotDeg: spec.item.rotationY,
        unpaintedGroup,
        paintedGroup,
      };
    });

    // Selection ring + 0.1m alignment snap guide lines (Chapter 04)
    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.78, 48),
      new THREE.MeshBasicMaterial({
        color: '#0EA5E9',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      })
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.022;
    selectionRing.visible = false;
    scene.add(selectionRing);

    const guideMat = new THREE.LineBasicMaterial({
      color: '#0284C7',
      transparent: true,
      opacity: 0.85,
    });
    const guideLineX = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-3.0, 0.025, 0),
        new THREE.Vector3(3.0, 0.025, 0),
      ]),
      guideMat
    );
    guideLineX.visible = false;
    const guideLineZ = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.025, -2.0),
        new THREE.Vector3(0, 0.025, 2.0),
      ]),
      guideMat
    );
    guideLineZ.visible = false;
    scene.add(guideLineX, guideLineZ);

    // Scale human figures shown in Visitor 1:1 Eye-Level view
    const scaleFigures = buildScaleFigures(cfg6x4Oak);
    scaleFigures.visible = false;
    scene.add(scaleFigures);

    const resizeObserver = new ResizeObserver((obsEntries) => {
      const rect = obsEntries[0]?.contentRect;
      if (!rect || rect.width < 10 || rect.height < 10) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    });
    resizeObserver.observe(container);

    let rafId = 0;
    const renderFrame = () => {
      const t = elapsedRef.current;
      const ws = evaluateWorkspaceState(t);

      // 1. Booth shell visibility + subtle scale settle on 6×4m resize
      shell4x3Charcoal.visible = ws.boothSize === '4x3';
      shell6x4Charcoal.visible = ws.boothSize === '6x4' && ws.floorMaterial !== 'oak-timber';
      shell6x4Oak.visible = ws.boothSize === '6x4' && ws.floorMaterial === 'oak-timber';

      if (ws.boothSize === '6x4' && t >= 4.45 && t < 5.1) {
        const popT = easeOutCubic(clamp((t - 4.45) / 0.55, 0, 1));
        const s = lerp(0.92, 1.0, popT);
        shell6x4Charcoal.scale.set(s, 1, s);
      } else {
        shell6x4Charcoal.scale.set(1, 1, 1);
      }

      // 2. Update all 6 stand items deterministically
      for (const entry of entries) {
        const isVisible = t >= entry.appearAt;
        const dropT = clamp((t - entry.appearAt) / 0.65, 0, 1);
        const dropEase = easeOutBack(dropT);
        const isPainted = entry.paintAt !== null && t >= entry.paintAt && entry.paintedGroup !== null;

        let posX = entry.baseX;
        let posY = entry.baseY;
        let posZ = entry.baseZ;
        let rotDeg = entry.baseRotDeg;

        if (dropT < 1) {
          posY = lerp(entry.baseY + 1.1, entry.baseY, easeOutCubic(dropT));
        }

        if (entry.id === 'wt-reception-desk') {
          posZ = entry.baseZ + ws.deskZOffset;
        }
        if (entry.id === 'wt-demo-kiosk') {
          rotDeg = ws.kioskRotDeg;
        }

        let paintPop = 1;
        if (entry.paintAt !== null && t >= entry.paintAt && t < entry.paintAt + 0.42) {
          const p = (t - entry.paintAt) / 0.42;
          paintPop = 1 + Math.sin(p * Math.PI) * 0.03;
        }

        const scaleVal = isVisible ? clamp(dropEase, 0.01, 1.04) * paintPop : 0.001;
        const rotRad = (rotDeg * Math.PI) / 180;

        const apply = (grp: THREE.Group, show: boolean) => {
          grp.visible = show;
          if (!show) return;
          grp.position.set(posX, posY, posZ);
          grp.rotation.y = rotRad;
          grp.scale.setScalar(scaleVal);
        };

        apply(entry.unpaintedGroup, isVisible && !isPainted);
        if (entry.paintedGroup) {
          apply(entry.paintedGroup, isVisible && isPainted);
        }
      }

      // 3. Selection ring & 0.1m snap guides during Chapter 04
      if (ws.selectedItemId === 'wt-reception-desk') {
        const curZ = 0.7 + ws.deskZOffset;
        selectionRing.visible = true;
        selectionRing.position.set(-0.55, 0.024, curZ);
        selectionRing.scale.set(1.45, 0.78, 1);
        guideLineX.visible = t >= 39.8 && t <= 43.3;
        guideLineX.position.set(0, 0, curZ);
        guideLineZ.visible = t >= 39.8 && t <= 43.3;
        guideLineZ.position.set(-0.55, 0, 0);
      } else if (ws.selectedItemId === 'wt-demo-kiosk') {
        selectionRing.visible = true;
        selectionRing.position.set(1.85, 0.024, 1.22);
        const pulse = 0.72 + Math.sin(t * 7) * 0.03;
        selectionRing.scale.set(pulse, pulse, 1);
        guideLineX.visible = false;
        guideLineZ.visible = false;
      } else {
        selectionRing.visible = false;
        guideLineX.visible = false;
        guideLineZ.visible = false;
      }

      // 4. Show scale human figures during Visitor 1:1 view & finale
      scaleFigures.visible = t >= 65.0;

      // 5. Calm, steady designer camera
      const cam = evaluateWalkthroughCamera(t);
      if (Math.abs(camera.fov - cam.fov) > 0.01) {
        camera.fov = cam.fov;
        camera.updateProjectionMatrix();
      }
      camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
      camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
      camera.updateMatrixWorld();

      // Project live 3D floor targets (Reception Desk & Demo Kiosk) during Ch 04
      const winEl = appWindowRef.current;
      if (winEl && t >= 35.0 && t <= 49.5) {
        const winRect = winEl.getBoundingClientRect();
        const canvasRect = container.getBoundingClientRect();
        if (winRect.width > 10 && winRect.height > 10 && canvasRect.width > 10) {
          const projectToWindowPct = (wx: number, wy: number, wz: number) => {
            const v = new THREE.Vector3(wx, wy, wz).project(camera);
            const cx = canvasRect.left + (v.x * 0.5 + 0.5) * canvasRect.width;
            const cy = canvasRect.top + (-v.y * 0.5 + 0.5) * canvasRect.height;
            return {
              x: ((cx - winRect.left) / winRect.width) * 100,
              y: ((cy - winRect.top) / winRect.height) * 100,
            };
          };
          onUpdate3DAnchorsRef.current(
            projectToWindowPct(-0.55, 0.62, 0.7 + ws.deskZOffset),
            projectToWindowPct(1.85, 0.68, 1.22)
          );
        }
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      disposeObject3D(scene);
      envRT.dispose();
      renderer.dispose();
    };
  }, [accentHex, appWindowRef, brandConfig, brandName, brandTagline, primaryHex]);

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
  const [soundEnabled, setSoundEnabled] = useState(true);
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
  const soundEnabledRef = useRef(true);
  const lastFrameRef = useRef<number | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const playedEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    speedRef.current = SPEED_OPTIONS[speedIdx];
  }, [speedIdx]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Deterministic timeline loop with tactile Web Audio click triggers
  useEffect(() => {
    elapsedRef.current = 0;
    lastFrameRef.current = null;
    playedEventsRef.current.clear();

    let rafId = 0;
    const tick = (now: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = now;
      }
      const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      if (!pausedRef.current) {
        const prev = elapsedRef.current;
        const next = prev + dt * speedRef.current;

        if (soundEnabledRef.current) {
          for (const ev of CLICK_EVENTS) {
            if (prev < ev.at && next >= ev.at && !playedEventsRef.current.has(ev.id)) {
              playedEventsRef.current.add(ev.id);
              playWalkthroughSound(ev.sound);
            }
          }
        }

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
    // Reset sound event triggers after the new seek timestamp
    const nextPlayed = new Set<string>();
    for (const ev of CLICK_EVENTS) {
      if (ev.at <= next) nextPlayed.add(ev.id);
    }
    playedEventsRef.current = nextPlayed;
  }, []);

  const togglePlayPause = useCallback(() => {
    if (elapsedRef.current >= TOUR_DURATION_SEC - 0.1) {
      seekTo(0);
      setPaused(false);
      return;
    }
    setPaused((p) => !p);
  }, [seekTo]);

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

  const appWindowRef = useRef<HTMLDivElement | null>(null);
  const [anchors, setAnchors] = useState<AnchorMap>({});

  const activeChapter =
    WALKTHROUGH_CHAPTERS.find((c) => elapsedSec >= c.startSec && elapsedSec < c.endSec) ||
    WALKTHROUGH_CHAPTERS[WALKTHROUGH_CHAPTERS.length - 1];

  const ws = useMemo(() => evaluateWorkspaceState(elapsedSec), [elapsedSec]);
  const zoom = useMemo(() => evaluateStageZoom(elapsedSec), [elapsedSec]);

  const measureDomAnchors = useCallback(() => {
    const winEl = appWindowRef.current;
    if (!winEl) return;
    const winRect = winEl.getBoundingClientRect();
    if (winRect.width < 10 || winRect.height < 10) return;

    const measured: AnchorMap = {};
    const nodes = winEl.querySelectorAll<HTMLElement>('[data-wt-target]');
    nodes.forEach((node) => {
      const id = node.dataset.wtTarget;
      if (!id) return;
      const r = node.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      measured[id] = {
        x: ((r.left + r.width * 0.5 - winRect.left) / winRect.width) * 100,
        y: ((r.top + r.height * 0.5 - winRect.top) / winRect.height) * 100,
      };
    });

    setAnchors((prev) => {
      let changed = false;
      for (const [k, v] of Object.entries(measured)) {
        const old = prev[k];
        if (!old || Math.abs(old.x - v.x) > 0.15 || Math.abs(old.y - v.y) > 0.15) {
          changed = true;
          break;
        }
      }
      return changed ? { ...prev, ...measured } : prev;
    });
  }, []);

  const handleUpdate3DAnchors = useCallback(
    (desk: { x: number; y: number }, kiosk: { x: number; y: number }) => {
      setAnchors((prev) => {
        const prevD = prev['canvas-desk'];
        const prevK = prev['canvas-kiosk'];
        const deskChanged =
          !prevD || Math.abs(prevD.x - desk.x) > 0.25 || Math.abs(prevD.y - desk.y) > 0.25;
        const kioskChanged =
          !prevK || Math.abs(prevK.x - kiosk.x) > 0.25 || Math.abs(prevK.y - kiosk.y) > 0.25;
        if (!deskChanged && !kioskChanged) return prev;
        return {
          ...prev,
          'canvas-desk': desk,
          'canvas-kiosk': kiosk,
        };
      });
    },
    []
  );

  // Re-measure whenever tabs change or the modal resizes so cursor tips land dead-center
  useLayoutEffect(() => {
    measureDomAnchors();
  }, [measureDomAnchors, ws.railTab, ws.buildTab]);

  useEffect(() => {
    const winEl = appWindowRef.current;
    if (!winEl) return;
    const ro = new ResizeObserver(() => measureDomAnchors());
    ro.observe(winEl);
    return () => ro.disconnect();
  }, [measureDomAnchors]);

  const cursor = useMemo(() => evaluateCursor(elapsedSec, anchors), [elapsedSec, anchors]);

  const accent = config.accentColor || '#D95D39';
  const primary = config.primaryColor || '#1B365D';
  const progressPct = (elapsedSec / TOUR_DURATION_SEC) * 100;

  const isTargetHovered = (id: string) => cursor.hoveredTarget === id;
  const isTargetPressed = (id: string) => cursor.pressedTarget === id;

  return (
    <div
      className="wt-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Zuki Studio Guided Walkthrough"
      onClick={onClose}
    >
      <div className="wt-modal-shell" onClick={(e) => e.stopPropagation()}>
        {/* Friendly, Clean Header */}
        <header className="wt-modal-header">
          <div className="wt-header-left">
            <span className="wt-studio-badge" style={{ background: accent }}>
              GUIDED TOUR
            </span>
            <h2 className="wt-modal-title">How to Build Your Stand in Zuki Studio</h2>
            <span className="wt-duration-chip mono-num">1:16 · 7 Steps</span>
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

        {/* Main Split Body: Screen Studio Stage + Right Step Syllabus */}
        <div className="wt-modal-body">
          <div className="wt-stage-column">
            {/* Soft Screen Studio Framed Canvas */}
            <div className="wt-stage-frame" onClick={togglePlayPause}>
              <div
                ref={appWindowRef}
                className="wt-app-window"
                style={{
                  transform: `scale(${zoom.scale.toFixed(4)})`,
                  transformOrigin: `${zoom.originX}% ${zoom.originY}%`,
                }}
              >
                {/* Miniature Zuki TopBar */}
                <div className="wt-app-topbar">
                  <div className="wt-app-brand">
                    <span className="wt-app-mark" style={{ background: primary }}>
                      Z
                    </span>
                    <span className="wt-app-wordmark">Zuki</span>
                    <span className="wt-app-proj-pill">
                      {ws.boothSize === '6x4' ? '6×4m Launch Stand' : '4×3m New Stand'}
                    </span>
                  </div>

                  {/* Real View Mode Switcher: 3D | Plan | Visitor */}
                  <div className="wt-app-view-seg">
                    <span
                      data-wt-target="view-3d"
                      className={`wt-app-seg-btn ${ws.viewMode === '3d' ? 'active' : ''} ${
                        isTargetHovered('view-3d') ? 'hovered' : ''
                      } ${isTargetPressed('view-3d') ? 'pressed' : ''}`}
                    >
                      <Box size={10} />
                      3D
                    </span>
                    <span
                      data-wt-target="view-2d"
                      className={`wt-app-seg-btn ${ws.viewMode === '2d' ? 'active' : ''} ${
                        isTargetHovered('view-2d') ? 'hovered' : ''
                      } ${isTargetPressed('view-2d') ? 'pressed' : ''}`}
                    >
                      <Grid2x2 size={10} />
                      Plan
                    </span>
                    <span
                      data-wt-target="view-visitor"
                      className={`wt-app-seg-btn ${ws.viewMode === 'eye-level' ? 'active' : ''} ${
                        isTargetHovered('view-visitor') ? 'hovered' : ''
                      } ${isTargetPressed('view-visitor') ? 'pressed' : ''}`}
                    >
                      <Eye size={10} />
                      Visitor
                    </span>
                  </div>

                  {/* Live Estimate Pill + Export Brief CTA */}
                  <div className="wt-app-top-actions">
                    <span
                      className={`wt-app-budget-pill mono-num ${
                        ws.recentEstimateBump ? 'bumped' : ''
                      }`}
                    >
                      <Calculator size={10} />£{ws.liveEstimate.toLocaleString('en-GB')}
                    </span>
                    <span
                      data-wt-target="btn-export"
                      className={`wt-app-export-btn ${
                        isTargetHovered('btn-export') ? 'hovered' : ''
                      } ${isTargetPressed('btn-export') ? 'pressed' : ''}`}
                      style={{ background: accent }}
                    >
                      <Upload size={10} />
                      Export brief
                    </span>
                  </div>
                </div>

                {/* Miniature Zuki Workspace Body */}
                <div className="wt-app-body">
                  {/* Left Icon Rail (Build / Brand / Assets) */}
                  <div className="wt-app-rail">
                    <div className={`wt-app-rail-btn ${ws.railTab === 'build' ? 'active' : ''}`}>
                      <Box size={12} />
                      <span>Build</span>
                    </div>
                    <div
                      data-wt-target="rail-brand"
                      className={`wt-app-rail-btn ${ws.railTab === 'branding' ? 'active' : ''} ${
                        isTargetHovered('rail-brand') ? 'hovered' : ''
                      } ${isTargetPressed('rail-brand') ? 'pressed' : ''}`}
                    >
                      <Paintbrush size={12} />
                      <span>Brand</span>
                    </div>
                    <div className="wt-app-rail-btn">
                      <Image size={12} />
                      <span>Assets</span>
                    </div>
                  </div>

                  {/* Left Tool Panel */}
                  <div className="wt-app-sidebar">
                    {ws.railTab === 'build' ? (
                      <>
                        <div className="wt-app-subtabs">
                          <span
                            data-wt-target="tab-catalog"
                            className={`wt-app-subtab ${ws.buildTab === 'catalog' ? 'active' : ''} ${
                              isTargetHovered('tab-catalog') ? 'hovered' : ''
                            } ${isTargetPressed('tab-catalog') ? 'pressed' : ''}`}
                          >
                            Equipment
                          </span>
                          <span
                            data-wt-target="tab-space"
                            className={`wt-app-subtab ${ws.buildTab === 'space' ? 'active' : ''} ${
                              isTargetHovered('tab-space') ? 'hovered' : ''
                            } ${isTargetPressed('tab-space') ? 'pressed' : ''}`}
                          >
                            Space
                          </span>
                          <span className="wt-app-subtab">Presets</span>
                        </div>

                        {ws.buildTab === 'space' ? (
                          <div className="wt-app-panel-scroll">
                            <div className="wt-app-sec-label">Stand footprint</div>
                            <div className="wt-app-size-grid">
                              <span className="wt-app-size-chip">3×3m</span>
                              <span
                                className={`wt-app-size-chip ${
                                  ws.boothSize === '4x3' ? 'active' : ''
                                }`}
                              >
                                4×3m
                              </span>
                              <span
                                data-wt-target="size-6x4"
                                className={`wt-app-size-chip ${
                                  ws.boothSize === '6x4' ? 'active' : ''
                                } ${isTargetHovered('size-6x4') ? 'hovered' : ''} ${
                                  isTargetPressed('size-6x4') ? 'pressed' : ''
                                }`}
                              >
                                6×4m
                              </span>
                              <span className="wt-app-size-chip">6×6m</span>
                            </div>

                            <div className="wt-app-sec-label">Floor finish</div>
                            <div className="wt-app-floor-grid">
                              <span
                                data-wt-target="floor-oak"
                                className={`wt-app-floor-chip ${
                                  ws.floorMaterial === 'oak-timber' ? 'active' : ''
                                } ${isTargetHovered('floor-oak') ? 'hovered' : ''} ${
                                  isTargetPressed('floor-oak') ? 'pressed' : ''
                                }`}
                              >
                                <span
                                  className="wt-app-swatch"
                                  style={{
                                    background: 'linear-gradient(135deg,#CFAF86,#A98359)',
                                  }}
                                />
                                Warm Oak
                              </span>
                              <span
                                className={`wt-app-floor-chip ${
                                  ws.floorMaterial === 'charcoal-carpet' ? 'active' : ''
                                }`}
                              >
                                <span
                                  className="wt-app-swatch"
                                  style={{ background: '#2E333B' }}
                                />
                                Charcoal
                              </span>
                              <span className="wt-app-floor-chip">
                                <span
                                  className="wt-app-swatch"
                                  style={{ background: '#1E3452' }}
                                />
                                Navy
                              </span>
                              <span className="wt-app-floor-chip">
                                <span
                                  className="wt-app-swatch"
                                  style={{ background: '#D8D5CE' }}
                                />
                                Concrete
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="wt-app-panel-scroll wt-app-catalog-list">
                            {WALKTHROUGH_ITEMS.map((spec) => {
                              const placed = elapsedSec >= spec.appearAt;
                              const targetId = `item-${spec.catalogId}`;
                              return (
                                <div
                                  key={spec.id}
                                  data-wt-target={targetId}
                                  className={`wt-app-item-card ${placed ? 'placed' : ''} ${
                                    isTargetHovered(targetId) ? 'hovered' : ''
                                  } ${isTargetPressed(targetId) ? 'pressed' : ''}`}
                                >
                                  <div className="wt-app-item-info">
                                    <span className="wt-app-item-name">{spec.label}</span>
                                    <span className="wt-app-item-price mono-num">
                                      £{spec.priceHire.toLocaleString('en-GB')}
                                    </span>
                                  </div>
                                  <span className="wt-app-item-action">
                                    {placed ? <Check size={10} /> : '+ Add'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="wt-app-panel-scroll">
                        <div className="wt-app-sec-label">Brand colour palette</div>
                        <div
                          data-wt-target="palette-navy"
                          className={`wt-app-palette-card ${ws.paletteSelected ? 'active' : ''} ${
                            isTargetHovered('palette-navy') ? 'hovered' : ''
                          } ${isTargetPressed('palette-navy') ? 'pressed' : ''}`}
                        >
                          <div className="wt-app-palette-dots">
                            <span style={{ background: primary }} />
                            <span style={{ background: accent }} />
                          </div>
                          <div>
                            <div className="wt-app-item-name">Deep Navy & Coral</div>
                            <div className="wt-app-item-price">High-contrast backlit theme</div>
                          </div>
                        </div>
                        <div className="wt-app-palette-card">
                          <div className="wt-app-palette-dots">
                            <span style={{ background: '#1F4E46' }} />
                            <span style={{ background: '#C59B5F' }} />
                          </div>
                          <div>
                            <div className="wt-app-item-name">Forest & Brass</div>
                            <div className="wt-app-item-price">Warm architectural tones</div>
                          </div>
                        </div>

                        <div
                          data-wt-target="btn-apply-brand"
                          className={`wt-app-apply-btn ${
                            isTargetHovered('btn-apply-brand') ? 'hovered' : ''
                          } ${isTargetPressed('btn-apply-brand') ? 'pressed' : ''} ${
                            ws.brandApplied ? 'done' : ''
                          }`}
                          style={{ background: ws.brandApplied ? '#059669' : primary }}
                        >
                          {ws.brandApplied ? (
                            <>
                              <Check size={11} />
                              <span>Applied to 4 surfaces</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={11} />
                              <span>Apply Brand Artwork</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Center Live Three.js 3D Viewport */}
                  <div className="wt-app-canvas-wrap">
                    <WalkthroughViewport3D
                      elapsedSec={elapsedSec}
                      brandConfig={config}
                      appWindowRef={appWindowRef}
                      onUpdate3DAnchors={handleUpdate3DAnchors}
                    />

                    {/* Subtle 2D Plan Compliance Pill */}
                    {ws.viewMode === '2d' && (
                      <div className="wt-app-plan-badge mono-num">
                        <CheckCircle2 size={11} className="wt-ok" />
                        <span>24 m² (6×4m) · Clear aisles · Within bounds</span>
                      </div>
                    )}

                    {/* Subtle Visitor View Badge */}
                    {ws.viewMode === 'eye-level' && (
                      <div className="wt-app-plan-badge mono-num">
                        <Eye size={11} />
                        <span>1:1 Visitor Eye-Level (1.68m)</span>
                      </div>
                    )}

                    {/* Right Inspector Overlay (slides open when an item is clicked on the floor) */}
                    {ws.selectedItemId && (
                      <div className="wt-app-inspector">
                        <div className="wt-app-insp-head">
                          {ws.selectedItemId === 'wt-reception-desk' ? (
                            <Move size={11} />
                          ) : (
                            <RotateCw size={11} />
                          )}
                          <span>
                            {ws.selectedItemId === 'wt-reception-desk'
                              ? 'Reception Desk'
                              : 'Demo Kiosk'}
                          </span>
                        </div>
                        <div className="wt-app-insp-row">
                          <span>Position X</span>
                          <span className="mono-num">
                            {ws.selectedItemId === 'wt-reception-desk' ? '-0.55 m' : '+1.85 m'}
                          </span>
                        </div>
                        <div className="wt-app-insp-row highlight">
                          <span>Position Z</span>
                          <span className="mono-num">
                            {ws.selectedItemId === 'wt-reception-desk'
                              ? `+${(0.7 + ws.deskZOffset).toFixed(1)} m`
                              : '+1.22 m'}
                          </span>
                        </div>
                        <div className="wt-app-insp-row highlight">
                          <span>Rotation Y</span>
                          <span className="mono-num">
                            {ws.selectedItemId === 'wt-reception-desk'
                              ? '0°'
                              : `${ws.kioskRotDeg}°`}
                          </span>
                        </div>
                        <div className="wt-app-insp-hint">
                          {ws.selectedItemId === 'wt-reception-desk' ? (
                            <span>0.1m grid snap active</span>
                          ) : (
                            <span>
                              Press <kbd className={ws.rKeyPressed ? 'pressed' : ''}>R</kbd> to
                              rotate 90°
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Export Brief Modal Sheet (Chapter 07 finale) */}
                    {ws.exportModalOpen && (
                      <div
                        className="wt-export-overlay"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="wt-export-card">
                          <div className="wt-export-kicker mono-num">EXPORT PRODUCTION BRIEF</div>
                          <h3 className="wt-export-title">Your 6×4m Stand Is Ready to Share</h3>
                          <div className="wt-export-list">
                            <span>
                              <Download size={11} /> 1600px Studio PNG Render
                            </span>
                            <span>
                              <CheckCircle2 size={11} className="wt-ok" /> Print Artwork Spec Sheet
                            </span>
                            <span>
                              <Calculator size={11} /> Itemised Quote (£
                              {ws.liveEstimate.toLocaleString('en-GB')})
                            </span>
                          </div>
                          <div className="wt-export-actions">
                            <button
                              type="button"
                              className="wt-finale-cta"
                              style={{ background: accent }}
                              onClick={onClose}
                            >
                              <span>Start Building Your Stand</span>
                              <ArrowRight size={14} />
                            </button>
                            <button
                              type="button"
                              className="wt-finale-replay"
                              onClick={() => {
                                seekTo(0);
                                setPaused(false);
                              }}
                            >
                              <RotateCcw size={12} />
                              <span>Replay</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Animated macOS/Studio Mouse Cursor */}
                <div
                  className={`wt-mouse-cursor ${cursor.clicking ? 'clicking' : ''} ${
                    cursor.dragging ? 'dragging' : ''
                  }`}
                  style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
                  aria-hidden="true"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4.5 2.5L19.5 11.4L12.5 13.4L9.6 20.4L4.5 2.5Z"
                      fill="#111827"
                      stroke="#FFFFFF"
                      strokeWidth="1.9"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {cursor.rippleProgress !== null && (
                    <span
                      className="wt-mouse-ripple"
                      style={{
                        transform: `scale(${lerp(0.35, 1.9, easeOutCubic(cursor.rippleProgress))})`,
                        opacity: (1 - cursor.rippleProgress) * 0.85,
                      }}
                    />
                  )}
                  {ws.rKeyPressed && (
                    <span className="wt-cursor-keycap">
                      <kbd>R</kbd> Rotate 90°
                    </span>
                  )}
                  {cursor.dragging && <span className="wt-cursor-drag-tag">Dragging · 0.1m</span>}
                </div>
              </div>

              {/* Center Play Indicator when Paused */}
              {paused && !ws.exportModalOpen && (
                <div className="wt-paused-center" aria-hidden="true">
                  <div className="wt-paused-circle">
                    <Play size={24} />
                  </div>
                </div>
              )}
            </div>

            {/* Friendly Coaching Caption Bar (sits cleanly below the workspace window so it never covers the 3D stand) */}
            {showCaptions && (
              <div className="wt-coach-caption" key={activeChapter.id}>
                <span className="wt-coach-step mono-num" style={{ color: accent }}>
                  STEP {activeChapter.number}
                </span>
                <p className="wt-coach-text">{activeChapter.caption}</p>
              </div>
            )}

            {/* Bottom Player Transport Controls */}
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
                  {WALKTHROUGH_CHAPTERS.slice(1).map((ch) => (
                    <span
                      key={ch.id}
                      className="wt-scrubber-tick"
                      style={{ left: `${(ch.startSec / TOUR_DURATION_SEC) * 100}%` }}
                      title={`${ch.number}. ${ch.title} (${formatClock(ch.startSec)})`}
                    />
                  ))}
                  <span
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
                    aria-label={paused ? 'Play walkthrough' : 'Pause walkthrough'}
                    title={paused ? 'Play (Space)' : 'Pause (Space)'}
                  >
                    {paused ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <button
                    type="button"
                    className="wt-ctrl-btn"
                    onClick={() => seekTo(elapsedSec - 5)}
                    aria-label="Back 5 seconds"
                    title="Back 5s (Left arrow)"
                  >
                    <SkipBack size={13} />
                  </button>
                  <button
                    type="button"
                    className="wt-ctrl-btn"
                    onClick={() => seekTo(elapsedSec + 5)}
                    aria-label="Forward 5 seconds"
                    title="Forward 5s (Right arrow)"
                  >
                    <SkipForward size={13} />
                  </button>
                  <span className="wt-timecode mono-num">
                    {formatClock(elapsedSec)} <span className="wt-dim">/</span>{' '}
                    {formatClock(TOUR_DURATION_SEC)}
                  </span>
                </div>

                <div className="wt-controls-right">
                  <button
                    type="button"
                    className={`wt-ctrl-pill ${soundEnabled ? 'active' : ''}`}
                    onClick={() => setSoundEnabled((s) => !s)}
                    title={soundEnabled ? 'Mute UI click sounds' : 'Unmute UI click sounds'}
                  >
                    {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                    <span>{soundEnabled ? 'Sound' : 'Muted'}</span>
                  </button>
                  <button
                    type="button"
                    className="wt-ctrl-pill mono-num"
                    onClick={() => setSpeedIdx((idx) => (idx + 1) % SPEED_OPTIONS.length)}
                    title="Playback speed"
                  >
                    {SPEED_OPTIONS[speedIdx]}×
                  </button>
                  <button
                    type="button"
                    className={`wt-ctrl-pill ${showCaptions ? 'active' : ''}`}
                    onClick={() => setShowCaptions((c) => !c)}
                    title="Toggle coaching captions"
                  >
                    <Subtitles size={12} />
                    <span>Tips</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Interactive 7-Step Syllabus Rail */}
          <aside className="wt-syllabus" aria-label="Walkthrough steps">
            <div className="wt-syllabus-head">
              <span>WALKTHROUGH STEPS</span>
              <span className="mono-num wt-dim">
                {activeChapter.number} / 0{WALKTHROUGH_CHAPTERS.length}
              </span>
            </div>
            <div className="wt-syllabus-list">
              {WALKTHROUGH_CHAPTERS.map((ch) => {
                const isCurrent = ch.id === activeChapter.id;
                const isDone = elapsedSec >= ch.endSec;
                const chProgress = isDone
                  ? 100
                  : isCurrent
                    ? clamp(
                        ((elapsedSec - ch.startSec) / (ch.endSec - ch.startSec)) * 100,
                        0,
                        100
                      )
                    : 0;

                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={`wt-chapter-item ${isCurrent ? 'current' : ''} ${
                      isDone ? 'done' : ''
                    }`}
                    onClick={() => {
                      seekTo(ch.startSec + 0.05);
                      setPaused(false);
                    }}
                  >
                    <div className="wt-chapter-top">
                      <span
                        className="wt-chapter-num mono-num"
                        style={isCurrent ? { background: accent, color: '#fff' } : undefined}
                      >
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
                          width: `${chProgress}%`,
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

        {/* Clean Footer */}
        <footer className="wt-modal-footer">
          <label className="wt-dont-show">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleToggleDontShow(e.target.checked)}
            />
            <span>Don&apos;t show automatically on startup</span>
          </label>
          <div className="wt-footer-actions">
            <button
              type="button"
              className="wt-btn-secondary"
              onClick={() => {
                seekTo(0);
                setPaused(false);
              }}
            >
              Restart
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
