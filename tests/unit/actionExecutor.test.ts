import { describe, expect, it } from 'vitest';
import { applyAgentActions } from '../../src/agent/actionExecutor';
import { DEFAULT_STAND_CONFIG, STAND_TEMPLATES } from '../../src/data/templates';

describe('AI Stand Agent Action Executor', () => {
  it('applies valid templates, adds items safely within booth bounds, and sanitizes text', () => {
    const firstTemplate = STAND_TEMPLATES[0];
    const result = applyAgentActions(DEFAULT_STAND_CONFIG, [], [
      { type: 'apply_template', templateId: firstTemplate.id },
      {
        type: 'update_config',
        patch: {
          brandName: '<script>Acme</script> Robotics',
          primaryColor: '#1B365D',
        },
      },
      {
        type: 'add_item',
        catalogId: 'reception-desk',
        x: 999, // intentionally absurd coordinate — must be clamped inside stand
        z: 999,
      },
    ]);

    expect(result.mutated).toBe(true);
    expect(result.appliedSummaries.length).toBe(3);
    expect(result.nextConfig.brandName).not.toContain('<');
    expect(result.nextConfig.brandName).not.toContain('>');
    const added = result.nextItems[result.nextItems.length - 1];
    expect(added.catalogId).toBe('reception-desk');
    expect(Math.abs(added.x)).toBeLessThanOrEqual(result.nextConfig.width / 2);
    expect(Math.abs(added.z)).toBeLessThanOrEqual(result.nextConfig.depth / 2);
  });

  it('ignores unknown catalog items and invalid hex colors gracefully without crashing', () => {
    const result = applyAgentActions(DEFAULT_STAND_CONFIG, [], [
      { type: 'add_item', catalogId: 'non-existent-item-xyz', x: 0, z: 0 },
      { type: 'update_config', patch: { primaryColor: 'not-a-color' } },
    ]);

    expect(result.nextItems).toHaveLength(0);
    expect(result.nextConfig.primaryColor).toBe(DEFAULT_STAND_CONFIG.primaryColor);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
