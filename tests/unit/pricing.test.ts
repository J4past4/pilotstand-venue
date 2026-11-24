import { describe, expect, it } from 'vitest';
import { CATALOG_MAP } from '../../src/data/catalog';
import { instantiateTemplate, STAND_TEMPLATES } from '../../src/data/templates';
import {
  calculateEstimate,
  evaluateCompliance,
  formatArea,
  formatLength,
  formatMoney,
} from '../../src/utils/pricing';

describe('Templates, Compliance & Pricing Engine', () => {
  it('instantiates every built-in template with valid catalog references and finite coordinates', () => {
    expect(STAND_TEMPLATES.length).toBeGreaterThan(0);
    for (const tpl of STAND_TEMPLATES) {
      const { config, items } = instantiateTemplate(tpl);
      expect(config.width).toBeGreaterThan(0);
      expect(config.depth).toBeGreaterThan(0);
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(CATALOG_MAP[item.catalogId]).toBeDefined();
        expect(Number.isFinite(item.x)).toBe(true);
        expect(Number.isFinite(item.y)).toBe(true);
        expect(Number.isFinite(item.z)).toBe(true);
        expect(item.dims.w).toBeGreaterThan(0);
        expect(item.dims.h).toBeGreaterThan(0);
        expect(item.dims.d).toBeGreaterThan(0);
      }
    }
  });

  it('detects out-of-bounds and over-height items accurately', () => {
    const { config, items } = instantiateTemplate(STAND_TEMPLATES[0]);
    const pushedOutside = items.map((item, idx) =>
      idx === 0 ? { ...item, x: config.width + 2, y: config.heightLimit + 1 } : item
    );
    const report = evaluateCompliance(config, pushedOutside);
    expect(report.isCompliant).toBe(false);
    expect(report.outOfBoundsIds).toContain(pushedOutside[0].id);
    expect(report.overHeightIds).toContain(pushedOutside[0].id);
  });

  it('calculates hire vs buy estimates and currency formatting consistently', () => {
    const { config, items } = instantiateTemplate(STAND_TEMPLATES[0]);
    const hire = calculateEstimate(config, items, 'hire');
    const buy = calculateEstimate(config, items, 'buy');

    expect(hire.grandTotalGbp).toBeGreaterThan(0);
    expect(buy.grandTotalGbp).toBeGreaterThan(hire.grandTotalGbp);
    expect(hire.lines.length).toBeGreaterThan(0);

    expect(formatMoney(1000, 'GBP')).toBe('£1,000');
    expect(formatMoney(1000, 'USD')).toBe('$1,280');
    expect(formatMoney(1000, 'EUR')).toBe('€1,180');
    expect(formatLength(6, 'm')).toBe('6 m');
    expect(formatArea(24, 'm')).toBe('24 m²');
  });
});
