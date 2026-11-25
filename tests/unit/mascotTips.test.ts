import { describe, expect, it } from 'vitest';
import {
  getNextTipIndex,
  getRandomTipIndex,
  getTipsForContext,
  MASCOT_TIPS,
} from '../../src/data/mascotTips';

describe('mascotTips', () => {
  it('filters tips by context and always includes shared tips', () => {
    const dashboardTips = getTipsForContext('dashboard');
    const editorTips = getTipsForContext('editor');

    expect(dashboardTips.length).toBeGreaterThanOrEqual(3);
    expect(editorTips.length).toBeGreaterThanOrEqual(6);
    expect(dashboardTips.every((t) => t.context === 'all' || t.context === 'dashboard')).toBe(true);
    expect(editorTips.every((t) => t.context === 'all' || t.context === 'editor')).toBe(true);
    expect(new Set(MASCOT_TIPS.map((t) => t.id)).size).toBe(MASCOT_TIPS.length);
  });

  it('cycles tip indices and wraps cleanly back to 0', () => {
    expect(getNextTipIndex(0, 4)).toBe(1);
    expect(getNextTipIndex(3, 4)).toBe(0);
    expect(getNextTipIndex(0, 1)).toBe(0);
    expect(getNextTipIndex(0, 0)).toBe(0);
  });

  it('never picks the same index when shuffling across multiple tips', () => {
    const picked = getRandomTipIndex(2, 5, () => 0.45);
    expect(picked).not.toBe(2);
    expect(picked).toBeGreaterThanOrEqual(0);
    expect(picked).toBeLessThan(5);
    expect(getRandomTipIndex(0, 1, () => 0)).toBe(0);
  });
});
