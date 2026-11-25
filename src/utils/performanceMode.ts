export type PerformanceMode = 'high' | 'balanced' | 'eco';

export interface PerformanceProfile {
  id: PerformanceMode;
  label: string;
  shortLabel: string;
  tagline: string;
  deviceHint: string;
  /** Maximum WebGL pixel ratio (values < 1 downsample internal buffer for low-power GPUs) */
  maxPixelRatio: number;
  /** Enable real-time shadow map pass */
  shadowsEnabled: boolean;
  /** Square shadow map texture resolution when shadows are enabled */
  shadowMapSize: number;
  /** Enable PMREM RoomEnvironment PBR reflections */
  useEnvironmentIBL: boolean;
  /** Use simplified 2-light rig (hemisphere + primary key) instead of multi-light studio rig */
  simplifiedLighting: boolean;
  /** Target FPS cap during active interaction (0 = uncapped native refresh rate) */
  targetFps: number;
  /** Pause continuous rAF rendering when the camera and scene are idle */
  renderOnDemandWhenIdle: boolean;
  /** Minimum interval (ms) between pointermove hover raycasts */
  hoverRaycastIntervalMs: number;
  /** Update 2D projected dimension badges every N rendered frames */
  labelUpdateIntervalFrames: number;
  /** Tone mapping mode ('aces' for studio realism, 'none' for minimal fragment shader cost) */
  toneMapping: 'aces' | 'none';
  /** OrbitControls damping factor (higher settles faster for idle sleep) */
  dampingFactor: number;
  /** Sustained FPS threshold below which a step-down suggestion is triggered (null = lowest tier) */
  slowFpsThreshold: number | null;
  /** Sustained render time (ms) threshold above which a step-down suggestion is triggered */
  slowRenderMsThreshold: number | null;
}

export const PERFORMANCE_MODE_ORDER: readonly PerformanceMode[] = ['high', 'balanced', 'eco'];

export const PERFORMANCE_PROFILES: Record<PerformanceMode, PerformanceProfile> = {
  high: {
    id: 'high',
    label: 'High Quality',
    shortLabel: 'High',
    tagline: '2K shadows · Studio reflections · Native FPS',
    deviceHint: 'Dedicated GPUs & workstations',
    maxPixelRatio: 2,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    useEnvironmentIBL: true,
    simplifiedLighting: false,
    targetFps: 0,
    renderOnDemandWhenIdle: false,
    hoverRaycastIntervalMs: 16,
    labelUpdateIntervalFrames: 4,
    toneMapping: 'aces',
    dampingFactor: 0.08,
    slowFpsThreshold: 24,
    slowRenderMsThreshold: 28,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    shortLabel: 'Balanced',
    tagline: '1K shadows · 30 FPS cap · Idle sleep',
    deviceHint: 'Everyday laptops, tablets & mini PCs',
    maxPixelRatio: 1.25,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    useEnvironmentIBL: true,
    simplifiedLighting: true,
    targetFps: 30,
    renderOnDemandWhenIdle: true,
    hoverRaycastIntervalMs: 60,
    labelUpdateIntervalFrames: 6,
    toneMapping: 'aces',
    dampingFactor: 0.12,
    slowFpsThreshold: 17,
    slowRenderMsThreshold: 40,
  },
  eco: {
    id: 'eco',
    label: 'Performance (Eco)',
    shortLabel: 'Eco',
    tagline: 'No shadows · Lite lighting · Idle sleep',
    deviceHint: 'Work mini PCs, integrated GPUs & battery',
    maxPixelRatio: 0.85,
    shadowsEnabled: false,
    shadowMapSize: 512,
    useEnvironmentIBL: false,
    simplifiedLighting: true,
    targetFps: 24,
    renderOnDemandWhenIdle: true,
    hoverRaycastIntervalMs: 120,
    labelUpdateIntervalFrames: 10,
    toneMapping: 'none',
    dampingFactor: 0.18,
    slowFpsThreshold: null,
    slowRenderMsThreshold: null,
  },
};

export const PERFORMANCE_STORAGE_KEY = 'pilotstand_performance_mode_v1';

export function isValidPerformanceMode(value: unknown): value is PerformanceMode {
  return value === 'high' || value === 'balanced' || value === 'eco';
}

export function loadSavedPerformanceMode(): PerformanceMode | null {
  try {
    const raw = localStorage.getItem(PERFORMANCE_STORAGE_KEY);
    if (isValidPerformanceMode(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return null;
}

export function savePerformanceMode(mode: PerformanceMode): void {
  try {
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

/**
 * Pick a sensible initial mode for first-time visitors based on lightweight
 * hardware hints (never blocks rendering).
 */
export function detectInitialPerformanceMode(hints?: {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  isSoftwareWebGL?: boolean;
}): PerformanceMode {
  if (hints?.isSoftwareWebGL) return 'eco';
  const cores =
    hints?.hardwareConcurrency ??
    (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined);
  const mem =
    hints?.deviceMemory ??
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined);

  if ((typeof cores === 'number' && cores <= 2) || (typeof mem === 'number' && mem <= 2)) {
    return 'eco';
  }
  if ((typeof cores === 'number' && cores <= 4) || (typeof mem === 'number' && mem <= 4)) {
    return 'balanced';
  }
  return 'high';
}

export function getNextLowerPerformanceMode(current: PerformanceMode): PerformanceMode | null {
  if (current === 'high') return 'balanced';
  if (current === 'balanced') return 'eco';
  return null;
}

export function getRecommendedStepDown(
  current: PerformanceMode,
  avgFps: number,
  isSoftwareWebGL = false
): PerformanceMode | null {
  if (current === 'eco') return null;
  if (isSoftwareWebGL) return 'eco';
  if (current === 'high') {
    return avgFps < 14 ? 'eco' : 'balanced';
  }
  return 'eco';
}

export interface SlowPerformanceAlert {
  currentMode: PerformanceMode;
  recommendedMode: PerformanceMode;
  avgFps: number;
  avgRenderMs: number;
  reason: string;
  isSoftwareWebGL: boolean;
}

export interface ViewportPerformanceMetrics {
  avgFps: number | null;
  isIdle: boolean;
  isSoftwareWebGL: boolean;
}

interface FrameSample {
  deltaMs: number;
  renderMs: number;
}

export interface PerformanceMonitorOptions {
  /** Number of initial active frames to ignore while shaders/textures warm up */
  warmupFrames?: number;
  /** Minimum number of active samples in the sliding window before evaluating slowness */
  minWindowSamples?: number;
  /** Sliding window size (samples) */
  windowSize?: number;
  /** Sustained slow duration (ms) required before firing an alert */
  sustainedSlowMs?: number;
  /** Ignore frame deltas larger than this (tab switch or idle sleep wakeup) */
  maxValidDeltaMs?: number;
}

/**
 * Tracks active WebGL render frame timing and detects sustained slowness
 * without false positives from idle sleep or background tabs.
 */
export class PerformanceMonitor {
  private mode: PerformanceMode;
  private isSoftwareWebGL: boolean;
  private readonly warmupFrames: number;
  private readonly minWindowSamples: number;
  private readonly windowSize: number;
  private readonly sustainedSlowMs: number;
  private readonly maxValidDeltaMs: number;

  private activeFrameCount = 0;
  private lastActiveTs: number | null = null;
  private samples: FrameSample[] = [];
  private slowAccumulatedMs = 0;
  private alertedForCurrentMode = false;

  constructor(
    initialMode: PerformanceMode,
    isSoftwareWebGL = false,
    options: PerformanceMonitorOptions = {}
  ) {
    this.mode = initialMode;
    this.isSoftwareWebGL = isSoftwareWebGL;
    this.warmupFrames = options.warmupFrames ?? 12;
    this.minWindowSamples = options.minWindowSamples ?? 16;
    this.windowSize = options.windowSize ?? 28;
    this.sustainedSlowMs = options.sustainedSlowMs ?? 2600;
    this.maxValidDeltaMs = options.maxValidDeltaMs ?? 500;
  }

  public setMode(mode: PerformanceMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.reset();
  }

  public setSoftwareWebGL(isSoftware: boolean): void {
    this.isSoftwareWebGL = isSoftware;
  }

  public reset(): void {
    this.activeFrameCount = 0;
    this.lastActiveTs = null;
    this.samples = [];
    this.slowAccumulatedMs = 0;
    this.alertedForCurrentMode = false;
  }

  public getAverageFps(): number | null {
    if (this.samples.length < 4) return null;
    const totalDelta = this.samples.reduce((sum, s) => sum + s.deltaMs, 0);
    if (totalDelta <= 0) return null;
    return Math.round((this.samples.length * 1000) / totalDelta);
  }

  public getAverageRenderMs(): number {
    if (this.samples.length === 0) return 0;
    const totalRender = this.samples.reduce((sum, s) => sum + s.renderMs, 0);
    return totalRender / this.samples.length;
  }

  /**
   * Call once per actively rendered frame.
   * Returns a SlowPerformanceAlert when sustained slowness is confirmed, or null otherwise.
   */
  public recordActiveFrame(nowMs: number, renderMs: number): SlowPerformanceAlert | null {
    const prevTs = this.lastActiveTs;
    this.lastActiveTs = nowMs;

    if (prevTs === null) {
      this.activeFrameCount += 1;
      return null;
    }

    const deltaMs = nowMs - prevTs;
    // Ignore huge gaps (tab hidden, idle sleep resume, or debugger pause)
    if (deltaMs <= 0 || deltaMs > this.maxValidDeltaMs) {
      return null;
    }

    this.activeFrameCount += 1;
    if (this.activeFrameCount <= this.warmupFrames) {
      return null;
    }

    this.samples.push({ deltaMs, renderMs });
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }

    const profile = PERFORMANCE_PROFILES[this.mode];
    if (this.alertedForCurrentMode || profile.slowFpsThreshold === null) {
      return null;
    }

    // Immediate software WebGL detection after warmup if not already in eco mode
    if (this.isSoftwareWebGL && this.mode !== 'eco' && this.samples.length >= 6) {
      const avgFps = this.getAverageFps() ?? 10;
      const avgRenderMs = Math.round(this.getAverageRenderMs());
      this.alertedForCurrentMode = true;
      return {
        currentMode: this.mode,
        recommendedMode: 'eco',
        avgFps,
        avgRenderMs,
        reason: 'Software graphics renderer detected (no hardware GPU acceleration)',
        isSoftwareWebGL: true,
      };
    }

    if (this.samples.length < this.minWindowSamples) {
      return null;
    }

    const avgFps = this.getAverageFps();
    const avgRenderMs = this.getAverageRenderMs();
    if (avgFps === null) return null;

    const isBelowFps = avgFps < profile.slowFpsThreshold;
    const isHeavyRender =
      profile.slowRenderMsThreshold !== null && avgRenderMs > profile.slowRenderMsThreshold;

    if (isBelowFps || isHeavyRender) {
      this.slowAccumulatedMs += deltaMs;
    } else {
      // Decay slowly so brief hiccups recover without triggering false alarms
      this.slowAccumulatedMs = Math.max(0, this.slowAccumulatedMs - deltaMs * 1.5);
    }

    if (this.slowAccumulatedMs >= this.sustainedSlowMs) {
      const recommendedMode = getRecommendedStepDown(this.mode, avgFps, this.isSoftwareWebGL);
      if (!recommendedMode) return null;
      this.alertedForCurrentMode = true;
      const reason = isBelowFps
        ? `Running at ~${avgFps} FPS in ${profile.label} mode`
        : `Heavy GPU frames (~${Math.round(avgRenderMs)} ms/frame) in ${profile.label} mode`;
      return {
        currentMode: this.mode,
        recommendedMode,
        avgFps,
        avgRenderMs: Math.round(avgRenderMs),
        reason,
        isSoftwareWebGL: this.isSoftwareWebGL,
      };
    }

    return null;
  }
}
