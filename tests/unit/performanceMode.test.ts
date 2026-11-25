import { describe, expect, it } from 'vitest';
import {
  detectInitialPerformanceMode,
  getNextLowerPerformanceMode,
  getRecommendedStepDown,
  PERFORMANCE_PROFILES,
  PerformanceMonitor,
} from '../../src/utils/performanceMode';

describe('performanceMode profiles & helpers', () => {
  it('orders profiles from highest fidelity to lowest compute cost', () => {
    const high = PERFORMANCE_PROFILES.high;
    const balanced = PERFORMANCE_PROFILES.balanced;
    const eco = PERFORMANCE_PROFILES.eco;

    expect(high.maxPixelRatio).toBeGreaterThan(balanced.maxPixelRatio);
    expect(balanced.maxPixelRatio).toBeGreaterThan(eco.maxPixelRatio);

    expect(high.shadowsEnabled).toBe(true);
    expect(balanced.shadowsEnabled).toBe(true);
    expect(eco.shadowsEnabled).toBe(false);

    expect(high.shadowMapSize).toBeGreaterThan(balanced.shadowMapSize);
    expect(high.useEnvironmentIBL).toBe(true);
    expect(eco.useEnvironmentIBL).toBe(false);

    expect(high.renderOnDemandWhenIdle).toBe(false);
    expect(balanced.renderOnDemandWhenIdle).toBe(true);
    expect(eco.renderOnDemandWhenIdle).toBe(true);
  });

  it('detects sensible initial modes from hardware hints', () => {
    expect(detectInitialPerformanceMode({ isSoftwareWebGL: true, hardwareConcurrency: 16 })).toBe(
      'eco'
    );
    expect(detectInitialPerformanceMode({ hardwareConcurrency: 2, deviceMemory: 8 })).toBe('eco');
    expect(detectInitialPerformanceMode({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(
      'balanced'
    );
    expect(detectInitialPerformanceMode({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe(
      'balanced'
    );
    expect(detectInitialPerformanceMode({ hardwareConcurrency: 12, deviceMemory: 16 })).toBe(
      'high'
    );
  });

  it('recommends appropriate step-down modes', () => {
    expect(getNextLowerPerformanceMode('high')).toBe('balanced');
    expect(getNextLowerPerformanceMode('balanced')).toBe('eco');
    expect(getNextLowerPerformanceMode('eco')).toBeNull();

    expect(getRecommendedStepDown('high', 19)).toBe('balanced');
    expect(getRecommendedStepDown('high', 10)).toBe('eco');
    expect(getRecommendedStepDown('high', 22, true)).toBe('eco');
    expect(getRecommendedStepDown('balanced', 12)).toBe('eco');
    expect(getRecommendedStepDown('eco', 8)).toBeNull();
  });
});

describe('PerformanceMonitor', () => {
  it('does not alert during smooth 60 FPS rendering', () => {
    const monitor = new PerformanceMonitor('high', false, {
      warmupFrames: 4,
      minWindowSamples: 8,
      sustainedSlowMs: 1000,
    });

    let now = 1000;
    let alert = null;
    for (let i = 0; i < 120; i += 1) {
      now += 16.6;
      alert = monitor.recordActiveFrame(now, 4);
      if (alert) break;
    }

    expect(alert).toBeNull();
    expect(monitor.getAverageFps()).toBeGreaterThanOrEqual(55);
  });

  it('ignores idle sleep and tab-switch gaps without false alarms', () => {
    const monitor = new PerformanceMonitor('balanced', false, {
      warmupFrames: 3,
      minWindowSamples: 6,
      sustainedSlowMs: 1000,
      maxValidDeltaMs: 500,
    });

    let now = 1000;
    let alert = null;
    for (let i = 0; i < 20; i += 1) {
      // Simulate 30 FPS bursts separated by 2-second idle sleeps
      now += i % 5 === 0 ? 2000 : 33;
      alert = monitor.recordActiveFrame(now, 8);
      expect(alert).toBeNull();
    }
  });

  it('detects sustained slow frames in high mode and recommends balanced', () => {
    const monitor = new PerformanceMonitor('high', false, {
      warmupFrames: 3,
      minWindowSamples: 8,
      sustainedSlowMs: 1200,
    });

    let now = 1000;
    let alert = null;
    // ~18 FPS (55ms per frame)
    for (let i = 0; i < 60; i += 1) {
      now += 55;
      alert = monitor.recordActiveFrame(now, 22);
      if (alert) break;
    }

    expect(alert).not.toBeNull();
    expect(alert?.currentMode).toBe('high');
    expect(alert?.recommendedMode).toBe('balanced');
    expect(alert?.avgFps).toBeLessThan(24);
  });

  it('recommends jumping straight to eco when high mode is severely slow (<14 FPS)', () => {
    const monitor = new PerformanceMonitor('high', false, {
      warmupFrames: 2,
      minWindowSamples: 6,
      sustainedSlowMs: 1000,
    });

    let now = 1000;
    let alert = null;
    // ~9 FPS (110ms per frame)
    for (let i = 0; i < 40; i += 1) {
      now += 110;
      alert = monitor.recordActiveFrame(now, 65);
      if (alert) break;
    }

    expect(alert).not.toBeNull();
    expect(alert?.recommendedMode).toBe('eco');
  });

  it('resets cleanly on mode switch and can alert again if balanced is still slow', () => {
    const monitor = new PerformanceMonitor('high', false, {
      warmupFrames: 2,
      minWindowSamples: 6,
      sustainedSlowMs: 900,
    });

    let now = 1000;
    let firstAlert = null;
    for (let i = 0; i < 40; i += 1) {
      now += 55;
      firstAlert = monitor.recordActiveFrame(now, 20);
      if (firstAlert) break;
    }
    expect(firstAlert?.recommendedMode).toBe('balanced');

    // Switch to balanced and simulate still-slow ~12 FPS
    monitor.setMode('balanced');
    let secondAlert = null;
    for (let i = 0; i < 40; i += 1) {
      now += 82;
      secondAlert = monitor.recordActiveFrame(now, 45);
      if (secondAlert) break;
    }
    expect(secondAlert).not.toBeNull();
    expect(secondAlert?.currentMode).toBe('balanced');
    expect(secondAlert?.recommendedMode).toBe('eco');

    // Never alerts once already in eco
    monitor.setMode('eco');
    for (let i = 0; i < 40; i += 1) {
      now += 120;
      expect(monitor.recordActiveFrame(now, 60)).toBeNull();
    }
  });

  it('recommends eco mode quickly when software WebGL is detected', () => {
    const monitor = new PerformanceMonitor('high', true, {
      warmupFrames: 2,
    });

    let now = 1000;
    let alert = null;
    for (let i = 0; i < 20; i += 1) {
      now += 100;
      alert = monitor.recordActiveFrame(now, 50);
      if (alert) break;
    }

    expect(alert).not.toBeNull();
    expect(alert?.isSoftwareWebGL).toBe(true);
    expect(alert?.recommendedMode).toBe('eco');
  });
});
