import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, Sparkles } from 'lucide-react';
import type { StandConfig, StandItem } from '../types/stand';
import type { StandViewportHandle } from '../engine/StandViewport3D';

export const TOUR_DURATION_SEC = 18;

type ShotMotion = 'whip-settle' | 'punch-in' | 'crane-drop' | 'pull-lock';

interface ReelShot {
  id: string;
  indexLabel: string;
  shotCode: string;
  startSec: number;
  endSec: number;
  zoneBadge: string;
  title: string;
  description: string | ((config: StandConfig) => string);
  motion: ShotMotion;
  mode: 'perimeter' | 'overhead';
  fromAzDeg: number;
  toAzDeg: number;
  /** For perimeter mode: distance outside the booth edge (m). For overhead mode: orbit radius (m). */
  fromDist: number;
  toDist: number;
  fromY: number;
  toY: number;
  /** Target offset in normalized 8m×6m stand space (scaled to active booth dims). */
  fromTarget: [number, number, number];
  toTarget: [number, number, number];
  fromFov: number;
  toFov: number;
}

const REEL_SHOTS: ReelShot[] = [
  {
    id: 'hero-snap-reveal',
    indexLabel: '01 / 09',
    shotCode: '01',
    startSec: 0.0,
    endSec: 2.2,
    zoneBadge: 'REAL-TIME 3D STUDIO',
    title: 'Your Stand, Live in 3D',
    description: (cfg) =>
      `${cfg.width}m × ${cfg.depth}m architectural showcase dressed in your brand palette, fonts & media.`,
    motion: 'whip-settle',
    mode: 'perimeter',
    fromAzDeg: 48,
    toAzDeg: 22,
    fromDist: 4.9,
    toDist: 3.9,
    fromY: 4.7,
    toY: 3.5,
    fromTarget: [0, 1.35, 0],
    toTarget: [0, 1.35, 0],
    fromFov: 46,
    toFov: 41,
  },
  {
    id: 'hero-front-push',
    indexLabel: '02 / 09',
    shotCode: '02',
    startSec: 2.2,
    endSec: 4.2,
    zoneBadge: 'BRAND ARCHITECTURE',
    title: 'Hero Front Presence',
    description:
      'Framing the entry arch, illuminated totems & reception counter at true exhibition scale.',
    motion: 'punch-in',
    mode: 'perimeter',
    fromAzDeg: -20,
    toAzDeg: -7,
    fromDist: 3.8,
    toDist: 2.8,
    fromY: 1.95,
    toY: 1.75,
    fromTarget: [0, 1.45, 0.8],
    toTarget: [0, 1.4, 0.5],
    fromFov: 40,
    toFov: 35,
  },
  {
    id: 'telephoto-led-wall',
    indexLabel: '03 / 09',
    shotCode: '03',
    startSec: 4.2,
    endSec: 6.2,
    zoneBadge: '1-CLICK SURFACE PAINT',
    title: 'Backlit LED & SEG Walls',
    description:
      'Select any brand graphic and click a 3D surface to paint backlit artwork in one click.',
    motion: 'whip-settle',
    mode: 'perimeter',
    fromAzDeg: 14,
    toAzDeg: 2,
    fromDist: 3.5,
    toDist: 2.9,
    fromY: 2.1,
    toY: 2.0,
    fromTarget: [0, 1.55, -0.75],
    toTarget: [0, 1.5, -0.8],
    fromFov: 32,
    toFov: 28,
  },
  {
    id: 'east-wing-catalog',
    indexLabel: '04 / 09',
    shotCode: '04',
    startSec: 6.2,
    endSec: 8.2,
    zoneBadge: 'MODULAR CATALOG',
    title: 'Drag, Snap & Rotate',
    description:
      'Drop counters, kiosks & meeting suites onto the grid—press R to rotate, inspect live.',
    motion: 'whip-settle',
    mode: 'perimeter',
    fromAzDeg: 64,
    toAzDeg: 82,
    fromDist: 3.3,
    toDist: 2.7,
    fromY: 2.9,
    toY: 2.4,
    fromTarget: [1.5, 1.0, 0.1],
    toTarget: [1.6, 0.95, -0.1],
    fromFov: 38,
    toFov: 35,
  },
  {
    id: 'west-wing-3d-drop',
    indexLabel: '05 / 09',
    shotCode: '05',
    startSec: 8.2,
    endSec: 10.2,
    zoneBadge: 'CUSTOM 3D IMPORTS',
    title: 'Drop .GLB, .STL & .OBJ',
    description:
      'Drag your own 3D product models straight onto the stand floor alongside VIP lounge zones.',
    motion: 'whip-settle',
    mode: 'perimeter',
    fromAzDeg: -76,
    toAzDeg: -54,
    fromDist: 3.3,
    toDist: 2.7,
    fromY: 2.8,
    toY: 2.3,
    fromTarget: [-1.5, 1.0, 0.1],
    toTarget: [-1.4, 0.95, 0.0],
    fromFov: 38,
    toFov: 35,
  },
  {
    id: 'crane-plan-compliance',
    indexLabel: '06 / 09',
    shotCode: '06',
    startSec: 10.2,
    endSec: 12.2,
    zoneBadge: '2D PLAN & COMPLIANCE',
    title: 'Live Bounds & Rigging',
    description:
      'Switch to 2D Floor Plan anytime. Zuki checks footprint, height limits & budget live.',
    motion: 'crane-drop',
    mode: 'overhead',
    fromAzDeg: -14,
    toAzDeg: 14,
    fromDist: 3.2,
    toDist: 2.0,
    fromY: 11.2,
    toY: 9.4,
    fromTarget: [0, 0.2, 0],
    toTarget: [0, 0.0, 0],
    fromFov: 40,
    toFov: 38,
  },
  {
    id: 'halo-rigging-sweep',
    indexLabel: '07 / 09',
    shotCode: '07',
    startSec: 12.2,
    endSec: 14.2,
    zoneBadge: 'LIGHTING & RIGGING',
    title: 'Overhead Halo & Truss',
    description:
      'Suspended 360° backlit halo, truss spotlights & expo hall presets tuned for impact.',
    motion: 'whip-settle',
    mode: 'perimeter',
    fromAzDeg: 132,
    toAzDeg: 156,
    fromDist: 4.1,
    toDist: 3.5,
    fromY: 4.8,
    toY: 4.2,
    fromTarget: [0, 2.45, 0],
    toTarget: [0, 2.35, 0],
    fromFov: 42,
    toFov: 38,
  },
  {
    id: 'ai-designer-punch',
    indexLabel: '08 / 09',
    shotCode: '08',
    startSec: 14.2,
    endSec: 16.2,
    zoneBadge: 'AI STAND DESIGNER',
    title: 'Redesign by Chat or Voice',
    description:
      'Command Zuki AI to swap layouts, add hospitality zones, or restyle surfaces in seconds.',
    motion: 'punch-in',
    mode: 'perimeter',
    fromAzDeg: -38,
    toAzDeg: -22,
    fromDist: 4.5,
    toDist: 3.3,
    fromY: 3.3,
    toY: 2.6,
    fromTarget: [0, 1.35, 0],
    toTarget: [0, 1.3, 0],
    fromFov: 42,
    toFov: 36,
  },
  {
    id: 'final-hero-lockout',
    indexLabel: '09 / 09',
    shotCode: '09',
    startSec: 16.2,
    endSec: 18.0,
    zoneBadge: 'STUDIO EXPORT',
    title: 'Studio PNGs & Print Briefs',
    description:
      'Export 1600px architectural renders & print-ready production briefs. Ready to edit.',
    motion: 'pull-lock',
    mode: 'perimeter',
    fromAzDeg: 32,
    toAzDeg: 41,
    fromDist: 3.5,
    toDist: 5.1,
    fromY: 3.2,
    toY: 4.6,
    fromTarget: [0, 1.15, 0],
    toTarget: [0, 1.05, 0],
    fromFov: 38,
    toFov: 42,
  },
];

interface SafetyBox3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * HyperFrames motion curves: decisive whip/snap energy on entry,
 * settling into a silky architectural micro-drift so every frame reads cleanly.
 */
function evalMotionCurve(tRaw: number, motion: ShotMotion): number {
  const t = clamp(tRaw, 0, 1);
  if (motion === 'whip-settle') {
    // 86% of travel completes rapidly with exponential snap, 14% linear micro-drift
    const expo = t >= 1 ? 1 : 1 - Math.pow(2, -9.5 * t);
    return expo * 0.86 + t * 0.14;
  }
  if (motion === 'punch-in') {
    const quart = 1 - Math.pow(1 - t, 3.6);
    return quart * 0.88 + t * 0.12;
  }
  if (motion === 'crane-drop') {
    const cubic = 1 - Math.pow(1 - t, 3.0);
    return cubic * 0.85 + t * 0.15;
  }
  // pull-lock: crisp deceleration into final resting studio frame
  const expo = t >= 1 ? 1 : 1 - Math.pow(2, -7.5 * t);
  return expo * 0.9 + t * 0.1;
}

/**
 * Restrict azimuth angles to open aisle hemispheres so the camera
 * never swings behind solid shell walls on Inline, Corner, or Peninsula booths.
 */
function mapAzimuthToOpenSides(azDeg: number, config: StandConfig): number {
  if (!config.showShellWalls || config.openSides >= 4) {
    return azDeg;
  }
  if (config.openSides === 3) {
    // Peninsula: back wall (-Z, ±180°) is closed; front/left/right open
    return clamp(azDeg, -110, 110);
  }
  if (config.openSides === 2) {
    // Corner: front (+Z) and right (+X) open; left (-X) and back (-Z) walls closed
    if (azDeg < -26) {
      // Mirror west-wing shots cleanly into the open front-right quadrant
      return clamp(22 + Math.abs(azDeg) * 0.65, 18, 108);
    }
    return clamp(azDeg, -26, 108);
  }
  // Inline (1 open side): only front (+Z) is open
  if (Math.abs(azDeg) > 46) {
    const sign = azDeg >= 0 ? 1 : -1;
    return sign * (18 + (Math.abs(azDeg) % 28));
  }
  return clamp(azDeg, -46, 46);
}

/**
 * Exact distance from stand center (0, 0) to the booth rectangle edge along azimuth angle `azRad`.
 * azRad = 0 -> +Z (front), +PI/2 -> +X (right), -PI/2 -> -X (left).
 */
function rectExitRadius(halfW: number, halfD: number, azRad: number): number {
  const sinA = Math.abs(Math.sin(azRad));
  const cosA = Math.abs(Math.cos(azRad));
  const rx = sinA > 1e-4 ? halfW / sinA : 1e6;
  const rz = cosA > 1e-4 ? halfD / cosA : 1e6;
  return Math.min(rx, rz);
}

/**
 * Build expanded 3D safety bounding boxes for all visible stand items and scale figures.
 */
function buildExclusionBoxes(config: StandConfig, items: StandItem[]): SafetyBox3D[] {
  const boxes: SafetyBox3D[] = [];
  const xzPad = 0.92;
  const yPad = 0.55;

  for (const item of items) {
    if (!item.visible) continue;
    const rad = (item.rotationY * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const halfX = (item.dims.w * c + item.dims.d * s) * 0.5 + xzPad;
    const halfZ = (item.dims.w * s + item.dims.d * c) * 0.5 + xzPad;
    boxes.push({
      minX: item.x - halfX,
      maxX: item.x + halfX,
      minY: item.y - 0.2,
      maxY: item.y + item.dims.h + yPad,
      minZ: item.z - halfZ,
      maxZ: item.z + halfZ,
    });
  }

  // Include human scale figures so camera never passes through visitors
  if (config.showScaleFigures) {
    const figureCoords: [number, number][] =
      config.openSides === 1
        ? [
            [config.width * 0.34, config.depth / 2 + 0.92],
            [-config.width * 0.36, config.depth / 2 + 1.05],
          ]
        : [
            [config.width / 2 + 0.62, config.depth * 0.18],
            [-config.width * 0.42, config.depth / 2 + 0.96],
          ];
    for (const [fx, fz] of figureCoords) {
      boxes.push({
        minX: fx - 0.85,
        maxX: fx + 0.85,
        minY: -0.1,
        maxY: 2.15,
        minZ: fz - 0.85,
        maxZ: fz + 0.85,
      });
    }
  }

  return boxes;
}

/**
 * Guarantee zero camera-to-asset clipping: if `pos` ever intersects an item or figure safety box,
 * smoothly push it outward along the radial aisle vector until completely clear.
 */
function enforceAssetClearance(
  pos: [number, number, number],
  boxes: SafetyBox3D[],
  mode: 'perimeter' | 'overhead'
): [number, number, number] {
  let [x, y, z] = pos;

  for (let pass = 0; pass < 4; pass++) {
    let collided = false;
    for (const b of boxes) {
      if (x > b.minX && x < b.maxX && y > b.minY && y < b.maxY && z > b.minZ && z < b.maxZ) {
        collided = true;
        if (mode === 'overhead') {
          y = Math.max(y, b.maxY + 0.4);
        } else {
          const len = Math.hypot(x, z) || 1;
          const nx = x / len;
          const nz = z / len;
          // Push radially outward past the box boundary
          const pushStep = 0.65;
          x += nx * pushStep;
          z += nz * pushStep;
        }
      }
    }
    if (!collided) break;
  }

  return [x, Math.max(0.85, y), z];
}

function fovToFocalMm(fovDeg: number): number {
  const rad = (fovDeg * Math.PI) / 180;
  return Math.round(24 / (2 * Math.tan(rad / 2)));
}

function formatTimecode(sec: number): string {
  const clamped = clamp(sec, 0, TOUR_DURATION_SEC);
  const whole = Math.floor(clamped);
  const tenths = Math.floor((clamped - whole) * 10);
  return `00:${String(whole).padStart(2, '0')}.${tenths}`;
}

interface StudioWalkthroughProps {
  active: boolean;
  paused: boolean;
  config: StandConfig;
  items: StandItem[];
  viewportRef: React.RefObject<StandViewportHandle | null>;
  onTogglePause: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

export const StudioWalkthrough: React.FC<StudioWalkthroughProps> = ({
  active,
  paused,
  config,
  items,
  viewportRef,
  onTogglePause,
  onFinish,
  onSkip,
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const exclusionBoxes = useMemo(() => buildExclusionBoxes(config, items), [config, items]);

  const maxAssetHeight = useMemo(() => {
    let maxH = config.showShellWalls ? config.shellWallHeight : 2.8;
    for (const item of items) {
      if (item.visible) {
        maxH = Math.max(maxH, item.y + item.dims.h);
      }
    }
    return maxH;
  }, [config.showShellWalls, config.shellWallHeight, items]);

  const computeShotCamera = useCallback(
    (tSec: number) => {
      const clamped = clamp(tSec, 0, TOUR_DURATION_SEC - 0.001);
      const shot =
        REEL_SHOTS.find((s) => clamped >= s.startSec && clamped < s.endSec) ||
        REEL_SHOTS[REEL_SHOTS.length - 1];

      const localT = (clamped - shot.startSec) / Math.max(0.001, shot.endSec - shot.startSec);
      const eased = evalMotionCurve(localT, shot.motion);

      const halfW = config.width * 0.5;
      const halfD = config.depth * 0.5;
      const spanScale = clamp(Math.max(config.width, config.depth) / 8, 0.62, 1.45);
      const xScale = config.width / 8;
      const zScale = config.depth / 6;

      const fromAz = mapAzimuthToOpenSides(shot.fromAzDeg, config);
      const toAz = mapAzimuthToOpenSides(shot.toAzDeg, config);
      const azDeg = lerp(fromAz, toAz, eased);
      const azRad = (azDeg * Math.PI) / 180;

      let camX = 0;
      let camY = 0;
      let camZ = 0;

      if (shot.mode === 'overhead') {
        const radius = lerp(shot.fromDist, shot.toDist, eased) * spanScale;
        camX = Math.sin(azRad) * radius;
        camZ = Math.cos(azRad) * radius;
        const minCraneY = maxAssetHeight + 4.4;
        camY = Math.max(minCraneY, lerp(shot.fromY, shot.toY, eased) * Math.max(0.82, spanScale));
      } else {
        const exitR = rectExitRadius(halfW, halfD, azRad);
        const margin = lerp(shot.fromDist, shot.toDist, eased) * Math.max(0.76, spanScale);
        const radius = exitR + margin;
        camX = Math.sin(azRad) * radius;
        camZ = Math.cos(azRad) * radius;
        camY = lerp(shot.fromY, shot.toY, eased) * clamp(spanScale, 0.85, 1.25);
      }

      const safePos = enforceAssetClearance([camX, camY, camZ], exclusionBoxes, shot.mode);

      const target: [number, number, number] = [
        lerp(shot.fromTarget[0], shot.toTarget[0], eased) * xScale,
        lerp(shot.fromTarget[1], shot.toTarget[1], eased),
        lerp(shot.fromTarget[2], shot.toTarget[2], eased) * zScale,
      ];

      const fov = lerp(shot.fromFov, shot.toFov, eased);
      return { shot, pos: safePos, target, fov, localT };
    },
    [config, exclusionBoxes, maxAssetHeight]
  );

  const applyCameraAtTime = useCallback(
    (tSec: number) => {
      const { pos, target, fov } = computeShotCamera(tSec);
      viewportRef.current?.setCameraTransform(pos, target, fov);
    },
    [computeShotCamera, viewportRef]
  );

  // Deterministic rAF timeline loop
  useEffect(() => {
    if (!active) return;
    elapsedRef.current = 0;
    lastFrameTimeRef.current = null;
    applyCameraAtTime(0);

    let rafId = 0;

    const tick = (now: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = now;
        setElapsedSec(0);
      }
      const dt = Math.min(0.1, (now - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = now;

      if (!pausedRef.current) {
        const next = elapsedRef.current + dt;
        if (next >= TOUR_DURATION_SEC) {
          elapsedRef.current = TOUR_DURATION_SEC;
          setElapsedSec(TOUR_DURATION_SEC);
          applyCameraAtTime(TOUR_DURATION_SEC);
          onFinish();
          return;
        }
        elapsedRef.current = next;
        setElapsedSec(next);
        applyCameraAtTime(next);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, applyCameraAtTime, onFinish]);

  // Escape exits cleanly, Space toggles pause, Arrow keys jump shots
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === ' ') {
        e.preventDefault();
        onTogglePause();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const curIdx = REEL_SHOTS.findIndex(
          (s) => elapsedRef.current >= s.startSec && elapsedRef.current < s.endSec
        );
        const idx = curIdx === -1 ? 0 : curIdx;
        const nextIdx =
          e.key === 'ArrowRight'
            ? Math.min(REEL_SHOTS.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        const jumpSec = REEL_SHOTS[nextIdx].startSec + 0.02;
        elapsedRef.current = jumpSec;
        setElapsedSec(jumpSec);
        applyCameraAtTime(jumpSec);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onSkip, onTogglePause, applyCameraAtTime]);

  if (!active) return null;

  const { shot: activeShot, fov: liveFov, localT } = computeShotCamera(elapsedSec);
  const accentColor = config.accentColor || '#D95D39';
  const descText =
    typeof activeShot.description === 'function'
      ? activeShot.description(config)
      : activeShot.description;

  const handleSeekTo = (sec: number) => {
    const clamped = clamp(sec, 0, TOUR_DURATION_SEC - 0.04);
    elapsedRef.current = clamped;
    setElapsedSec(clamped);
    applyCameraAtTime(clamped);
  };

  return (
    <div
      className="tour-overlay"
      id="studio-walkthrough-overlay"
      role="region"
      aria-label="18-second product walkthrough reel"
    >
      {/* Crisp HyperFrames Beat-Cut Flash */}
      <div className="tour-cut-flash" key={`flash-${activeShot.id}`} aria-hidden="true" />

      {/* Subtle Architectural Corner Framing Guides */}
      <div className="tour-frame-corner tl" aria-hidden="true" />
      <div className="tour-frame-corner tr" aria-hidden="true" />
      <div className="tour-frame-corner bl" aria-hidden="true" />
      <div className="tour-frame-corner br" aria-hidden="true" />

      {/* Top-Left Brand / Reel Identifier */}
      <div className="tour-brand-pill">
        <span className="tour-brand-dot" style={{ background: accentColor }} />
        <span className="mono-num">
          {config.brandName.toUpperCase()} · {config.width}M × {config.depth}M
        </span>
      </div>

      {/* Top-Right Live Broadcast Telemetry Pill */}
      <div className="tour-top-pill">
        <span className={`tour-rec-dot ${paused ? 'paused' : ''}`} />
        <span className="mono-num">
          {paused ? 'PAUSED' : 'PRODUCT REEL'} · SHOT {activeShot.shotCode}/09 · {fovToFocalMm(liveFov)}MM ·{' '}
          {formatTimecode(elapsedSec)} / {formatTimecode(TOUR_DURATION_SEC)}
        </span>
      </div>

      {/* Snappy HyperFrames Editorial Lower-Left Callout Card */}
      <div className="tour-callout-card" key={activeShot.id}>
        <div className="tour-callout-meta">
          <span className="tour-chapter-index mono-num">{activeShot.indexLabel}</span>
          <span className="tour-chapter-sep" />
          <span className="tour-zone-badge mono-num">
            <Sparkles size={10} />
            {activeShot.zoneBadge}
          </span>
        </div>

        <div className="tour-title-clip">
          <h2 className="tour-callout-title">{activeShot.title}</h2>
        </div>

        <div className="tour-rule-reveal" style={{ background: accentColor }} />

        <p className="tour-callout-desc">{descText}</p>

        {/* Live Beat Progress Hairline */}
        <div className="tour-card-beat-track" aria-hidden="true">
          <div
            className="tour-card-beat-fill"
            style={{
              width: `${Math.min(100, localT * 100)}%`,
              background: accentColor,
            }}
          />
        </div>
      </div>

      {/* Bottom 9-Beat HyperFrames Timeline Transport Bar */}
      <div className="tour-transport-bar">
        <button
          id="tour-play-pause"
          type="button"
          className="tour-transport-icon"
          onClick={onTogglePause}
          title={paused ? 'Resume reel (Space)' : 'Pause reel (Space)'}
          aria-label={paused ? 'Resume reel' : 'Pause reel'}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>

        <button
          id="tour-restart"
          type="button"
          className="tour-transport-icon"
          onClick={() => handleSeekTo(0)}
          title="Restart 18s product reel"
          aria-label="Restart product reel"
        >
          <RotateCcw size={13} />
        </button>

        {/* 9-Shot Segmented Scrub Track */}
        <div className="tour-segments" role="group" aria-label="Product reel shots">
          {REEL_SHOTS.map((sh) => {
            const segLen = sh.endSec - sh.startSec;
            const fillPct =
              elapsedSec <= sh.startSec
                ? 0
                : elapsedSec >= sh.endSec
                  ? 100
                  : ((elapsedSec - sh.startSec) / segLen) * 100;
            const isCurrent = sh.id === activeShot.id;
            return (
              <button
                key={sh.id}
                type="button"
                className={`tour-segment-btn ${isCurrent ? 'current' : ''}`}
                onClick={() => handleSeekTo(sh.startSec + 0.02)}
                title={`${sh.indexLabel} — ${sh.title}`}
              >
                <span className="tour-segment-track">
                  <span
                    className="tour-segment-fill"
                    style={{
                      width: `${fillPct}%`,
                      background: isCurrent ? accentColor : undefined,
                    }}
                  />
                </span>
                <span className="tour-segment-label mono-num">{sh.shotCode}</span>
              </button>
            );
          })}
        </div>

        <span className="tour-timecode mono-num">
          {formatTimecode(elapsedSec)}{' '}
          <span className="tour-timecode-dim">/ {formatTimecode(TOUR_DURATION_SEC)}</span>
        </span>

        <button
          id="tour-skip-btn"
          type="button"
          className="tour-skip-btn"
          onClick={onSkip}
        >
          <span>Skip Reel</span>
          <SkipForward size={13} />
        </button>
      </div>
    </div>
  );
};
