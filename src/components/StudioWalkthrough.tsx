import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, Sparkles } from 'lucide-react';
import type { StandConfig } from '../types/stand';
import type { StandViewportHandle } from '../engine/StandViewport3D';

export const TOUR_DURATION_SEC = 30;

interface TourChapter {
  id: string;
  indexLabel: string;
  startSec: number;
  endSec: number;
  zoneBadge: string;
  title: string;
  description: string;
  fromPos: [number, number, number];
  toPos: [number, number, number];
  fromTarget: [number, number, number];
  toTarget: [number, number, number];
}

const TOUR_CHAPTERS: TourChapter[] = [
  {
    id: 'establishing-orbit',
    indexLabel: '01 / 06',
    startSec: 0,
    endSec: 5,
    zoneBadge: '3D STUDIO · FLAGSHIP PAVILION',
    title: 'Welcome to Your Flagship Pavilion',
    description:
      'Orbit freely in real-time 3D. Every session launches with an 8m × 6m architectural showcase dressed in your brand colours, fonts, and uploaded media.',
    fromPos: [8.4, 5.2, 8.6],
    toPos: [-6.8, 4.4, 7.8],
    fromTarget: [0, 1.35, 0],
    toTarget: [0, 1.45, 0],
  },
  {
    id: 'visitor-arrival',
    indexLabel: '02 / 06',
    startSec: 5,
    endSec: 10,
    zoneBadge: 'DIRECT MANIPULATION · FLOOR DRAG',
    title: 'Visitor Eye-Level Arrival',
    description:
      'Glide through the Brand Arch toward reception. Click any wall, counter, or furniture piece to drag on the grid, press R to rotate, or refine dimensions in the Right Inspector.',
    fromPos: [-0.8, 1.75, 6.8],
    toPos: [0.9, 1.65, 3.3],
    fromTarget: [0, 1.45, 0.5],
    toTarget: [0, 1.35, -0.8],
  },
  {
    id: 'hero-media-branding',
    indexLabel: '03 / 06',
    startSec: 10,
    endSec: 15,
    zoneBadge: 'BRAND TAB · 1-CLICK SURFACE PAINT',
    title: 'Live Backlit Media & Brand Surfaces',
    description:
      'Your LED video wall, twin SEG lightboxes, and 360° suspended halo update live. Select any graphic in the Brand tab and click any 3D face to paint artwork in one click.',
    fromPos: [-2.8, 2.05, 2.5],
    toPos: [2.8, 2.05, 2.2],
    fromTarget: [0, 1.45, -1.0],
    toTarget: [0, 1.45, -1.0],
  },
  {
    id: 'hospitality-wings',
    indexLabel: '04 / 06',
    startSec: 15,
    endSec: 20,
    zoneBadge: 'LEFT RAIL · CATALOG & 3D MODEL DROP',
    title: '360° Spatial Flow & Custom 3D Imports',
    description:
      'Explore the VIP lounge, executive meeting suite, and demo kiosks. Drag equipment from the Left Catalog—or drop your own .GLB, .STL, or .OBJ files straight onto the floor.',
    fromPos: [6.4, 2.8, 1.6],
    toPos: [5.4, 2.6, -4.8],
    fromTarget: [1.2, 1.0, -0.2],
    toTarget: [-0.8, 1.0, -0.8],
  },
  {
    id: 'plan-compliance',
    indexLabel: '05 / 06',
    startSec: 20,
    endSec: 25,
    zoneBadge: 'TOP BAR · 2D PLAN & LIVE COMPLIANCE',
    title: 'Precision Floor Plan & Venue Compliance',
    description:
      'Switch between 3D Studio, 2D Plan, and Visitor View anytime. StandCraft continuously checks booth bounds, rigging height limits, print area, and hire/buy estimates.',
    fromPos: [-2.4, 9.8, 4.2],
    toPos: [0.0, 11.4, 1.6],
    fromTarget: [0, 0.2, 0],
    toTarget: [0, 0, 0],
  },
  {
    id: 'ai-and-export',
    indexLabel: '06 / 06',
    startSec: 25,
    endSec: 30,
    zoneBadge: 'AI DESIGNER · CHAT, VOICE & BRIEF EXPORT',
    title: 'Command the AI Designer or Export Briefs',
    description:
      'Open the AI Designer to redesign by chat or voice, or export 1600px studio PNGs and print-ready Exhibition Production Briefs. Your workspace is ready.',
    fromPos: [3.2, 5.8, 6.2],
    toPos: [7.6, 4.6, 8.2],
    fromTarget: [0, 1.1, 0],
    toTarget: [0, 1.35, 0],
  },
];

function easeInOutCubic(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function formatTimecode(sec: number): string {
  const clamped = Math.max(0, Math.min(TOUR_DURATION_SEC, sec));
  const whole = Math.floor(clamped);
  const tenths = Math.floor((clamped - whole) * 10);
  return `00:${String(whole).padStart(2, '0')}.${tenths}`;
}

interface StudioWalkthroughProps {
  active: boolean;
  paused: boolean;
  config: StandConfig;
  viewportRef: React.RefObject<StandViewportHandle | null>;
  onTogglePause: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

export const StudioWalkthrough: React.FC<StudioWalkthroughProps> = ({
  active,
  paused,
  config,
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

  const scaleFactor = Math.max(0.6, Math.max(config.width, config.depth) / 8);

  const applyCameraAtTime = useCallback(
    (tSec: number) => {
      const clamped = Math.max(0, Math.min(TOUR_DURATION_SEC - 0.001, tSec));
      const chapter =
        TOUR_CHAPTERS.find((c) => clamped >= c.startSec && clamped < c.endSec) ||
        TOUR_CHAPTERS[TOUR_CHAPTERS.length - 1];
      const localT = (clamped - chapter.startSec) / (chapter.endSec - chapter.startSec);
      const eased = easeInOutCubic(localT);

      const pos: [number, number, number] = [
        lerp(chapter.fromPos[0], chapter.toPos[0], eased) * scaleFactor,
        lerp(chapter.fromPos[1], chapter.toPos[1], eased) * Math.max(0.75, scaleFactor),
        lerp(chapter.fromPos[2], chapter.toPos[2], eased) * scaleFactor,
      ];
      const target: [number, number, number] = [
        lerp(chapter.fromTarget[0], chapter.toTarget[0], eased) * scaleFactor,
        lerp(chapter.fromTarget[1], chapter.toTarget[1], eased),
        lerp(chapter.fromTarget[2], chapter.toTarget[2], eased) * scaleFactor,
      ];
      viewportRef.current?.setCameraTransform(pos, target);
    },
    [scaleFactor, viewportRef]
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

  // Escape exits the walkthrough cleanly
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === ' ') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          onTogglePause();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onSkip, onTogglePause]);

  if (!active) return null;

  const activeChapter =
    TOUR_CHAPTERS.find((c) => elapsedSec >= c.startSec && elapsedSec < c.endSec) ||
    TOUR_CHAPTERS[TOUR_CHAPTERS.length - 1];

  const handleSeekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(TOUR_DURATION_SEC - 0.05, sec));
    elapsedRef.current = clamped;
    setElapsedSec(clamped);
    applyCameraAtTime(clamped);
  };

  return (
    <div className="tour-overlay" id="studio-walkthrough-overlay" role="region" aria-label="30-second studio walkthrough">
      {/* Subtle Architectural Corner Framing Guides */}
      <div className="tour-frame-corner tl" aria-hidden="true" />
      <div className="tour-frame-corner tr" aria-hidden="true" />

      {/* Top-Right Live Broadcast Pill */}
      <div className="tour-top-pill">
        <span className={`tour-rec-dot ${paused ? 'paused' : ''}`} />
        <span className="mono-num">
          {paused ? 'PAUSED' : 'GUIDED WALKTHROUGH'} · {formatTimecode(elapsedSec)} / 00:30.0
        </span>
      </div>

      {/* HyperFrames-Style Editorial Lower-Left Callout Card */}
      <div className="tour-callout-card" key={activeChapter.id}>
        <div className="tour-callout-meta">
          <span className="tour-chapter-index mono-num">{activeChapter.indexLabel}</span>
          <span className="tour-chapter-sep" />
          <span className="tour-zone-badge mono-num">
            <Sparkles size={11} />
            {activeChapter.zoneBadge}
          </span>
        </div>

        <div className="tour-title-clip">
          <h2 className="tour-callout-title">{activeChapter.title}</h2>
        </div>

        <div className="tour-rule-reveal" style={{ background: config.accentColor || '#D95D39' }} />

        <p className="tour-callout-desc">{activeChapter.description}</p>
      </div>

      {/* Bottom HyperFrames Timeline Transport Bar */}
      <div className="tour-transport-bar">
        <button
          id="tour-play-pause"
          type="button"
          className="tour-transport-icon"
          onClick={onTogglePause}
          title={paused ? 'Resume walkthrough (Space)' : 'Pause walkthrough (Space)'}
          aria-label={paused ? 'Resume walkthrough' : 'Pause walkthrough'}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>

        <button
          id="tour-restart"
          type="button"
          className="tour-transport-icon"
          onClick={() => handleSeekTo(0)}
          title="Restart 30s walkthrough"
          aria-label="Restart walkthrough"
        >
          <RotateCcw size={13} />
        </button>

        {/* 6-Chapter Segmented Scrub Track */}
        <div className="tour-segments" role="group" aria-label="Walkthrough chapters">
          {TOUR_CHAPTERS.map((ch) => {
            const segLen = ch.endSec - ch.startSec;
            const fillPct =
              elapsedSec <= ch.startSec
                ? 0
                : elapsedSec >= ch.endSec
                  ? 100
                  : ((elapsedSec - ch.startSec) / segLen) * 100;
            const isCurrent = ch.id === activeChapter.id;
            return (
              <button
                key={ch.id}
                type="button"
                className={`tour-segment-btn ${isCurrent ? 'current' : ''}`}
                onClick={() => handleSeekTo(ch.startSec + 0.05)}
                title={`${ch.indexLabel} — ${ch.title}`}
              >
                <span className="tour-segment-track">
                  <span
                    className="tour-segment-fill"
                    style={{
                      width: `${fillPct}%`,
                      background: isCurrent ? config.accentColor || '#D95D39' : undefined,
                    }}
                  />
                </span>
                <span className="tour-segment-label mono-num">{ch.indexLabel.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        <span className="tour-timecode mono-num">
          {formatTimecode(elapsedSec)} <span className="tour-timecode-dim">/ 00:30.0</span>
        </span>

        <button
          id="tour-skip-btn"
          type="button"
          className="tour-skip-btn"
          onClick={onSkip}
        >
          <span>Skip Tour</span>
          <SkipForward size={13} />
        </button>
      </div>
    </div>
  );
};
