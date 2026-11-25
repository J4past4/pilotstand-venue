import { describe, expect, it } from 'vitest';
import { DEFAULT_STAND_CONFIG } from '../../src/data/templates';
import type { StandConfig, StandItem } from '../../src/types/stand';
import {
  clampVenueBrandingToDims,
  computeVenueFixtureBrandableAreaM2,
  createDefaultVenueBranding,
  getOuterGridMargin,
  isItemBrandingAllowed,
  isOuterGridVisible,
} from '../../src/utils/fixtures';
import { calculateEstimate, evaluateCompliance } from '../../src/utils/pricing';
import { checkWallCollision, findNearestAllowedPosition } from '../../src/utils/wallCollision';

function makePillar(overrides: Partial<StandItem> = {}): StandItem {
  return {
    id: 'pillar-1',
    catalogId: 'venue-pillar-square',
    name: 'Venue Structural Pillar (Square)',
    x: 2.3, // Outside a 4m wide booth (halfW = 2.0) on the open right wall / outer meter grid
    y: 0,
    z: 1.2,
    rotationY: 0,
    dims: { w: 0.6, h: 4.5, d: 0.6 },
    artwork: {},
    isPermanentFixture: true,
    fixtureOwner: 'venue',
    venueBranding: createDefaultVenueBranding({ w: 0.6, h: 4.5, d: 0.6 }, 'venue-pillar-square'),
    ...overrides,
  };
}

describe('Outer Meter Grid & Permanent Venue Fixtures', () => {
  it('defaults outer meter grid to visible with 3m margin and clamps custom margins to 1-6m', () => {
    expect(isOuterGridVisible(DEFAULT_STAND_CONFIG)).toBe(true);
    expect(getOuterGridMargin(DEFAULT_STAND_CONFIG)).toBe(3);
    expect(getOuterGridMargin({ outerGridMargin: 0 })).toBe(1);
    expect(getOuterGridMargin({ outerGridMargin: 12 })).toBe(6);
    expect(isOuterGridVisible({ showGrid: true, showOuterGrid: false })).toBe(false);
    expect(isOuterGridVisible({ showGrid: false, showOuterGrid: true })).toBe(false);
  });

  it('defaults venue permanent fixtures to branding disallowed (0 m²) and computes exact area when allowed', () => {
    const pillar = makePillar();
    expect(isItemBrandingAllowed(pillar)).toBe(false);
    expect(computeVenueFixtureBrandableAreaM2(pillar)).toBe(0);

    const brandedPillar = makePillar({
      venueBranding: {
        allowed: true,
        allowedFaces: ['front', 'left'],
        zoneWidthM: 0.6,
        zoneHeightM: 2.0,
        zoneBottomM: 0.8,
      },
    });
    expect(isItemBrandingAllowed(brandedPillar)).toBe(true);
    expect(computeVenueFixtureBrandableAreaM2(brandedPillar)).toBe(2.4);
  });

  it('clamps venue branding dimensions to fixture size and supports round column circumference', () => {
    const clampedSquare = clampVenueBrandingToDims(
      {
        allowed: true,
        allowedFaces: ['front', 'back'],
        zoneWidthM: 3.0,
        zoneHeightM: 5.0,
        zoneBottomM: 2.0,
      },
      { w: 0.6, h: 3.0, d: 0.6 },
      'venue-pillar-square'
    );
    expect(clampedSquare.zoneWidthM).toBe(0.6);
    expect(clampedSquare.zoneHeightM).toBe(3.0);
    expect(clampedSquare.zoneBottomM).toBe(0);

    const clampedRound = clampVenueBrandingToDims(
      {
        allowed: true,
        allowedFaces: ['front', 'left'], // left should be filtered out for round columns
        zoneWidthM: 1.5,
        zoneHeightM: 2.0,
        zoneBottomM: 0.5,
      },
      { w: 0.65, h: 3.8, d: 0.65 },
      'venue-pillar-round'
    );
    expect(clampedRound.allowedFaces).toEqual(['front']);
    expect(clampedRound.zoneWidthM).toBe(1.5);
  });

  it('exempts permanent fixtures on the outer meter grid from out-of-bounds and height compliance warnings', () => {
    const config: StandConfig = {
      ...DEFAULT_STAND_CONFIG,
      width: 4,
      depth: 3,
      heightLimit: 3.5,
    };
    const outerPillar = makePillar({
      x: 2.4, // completely outside [-2, 2]
      z: 0,
      dims: { w: 0.6, h: 5.0, d: 0.6 }, // taller than heightLimit 3.5m
    });

    const report = evaluateCompliance(config, [outerPillar]);
    expect(report.isCompliant).toBe(true);
    expect(report.outOfBoundsIds).toEqual([]);
    expect(report.overHeightIds).toEqual([]);
    expect(report.occupiedAreaM2).toBe(0);
    expect(report.totalPrintAreaM2).toBe(0);
  });

  it('prices venue fixtures at £0 hire while including permitted brandable area in print graphics cost', () => {
    const config: StandConfig = { ...DEFAULT_STAND_CONFIG, width: 4, depth: 3 };
    const unbranded = makePillar();
    const branded = makePillar({
      venueBranding: {
        allowed: true,
        allowedFaces: ['front', 'right'],
        zoneWidthM: 0.6,
        zoneHeightM: 2.0,
        zoneBottomM: 0.5,
      },
    });

    const estUnbranded = calculateEstimate(config, [unbranded], 'hire');
    const estBranded = calculateEstimate(config, [branded], 'hire');

    const venueLine = estBranded.lines.find((l) => l.category === 'Venue Fixture');
    expect(venueLine).toBeDefined();
    expect(venueLine?.totalGbp).toBe(0);
    expect(estUnbranded.totalPrintAreaM2).toBe(0);
    expect(estBranded.totalPrintAreaM2).toBe(2.4);
    expect(estBranded.printGraphicsGbp).toBeGreaterThan(estUnbranded.printGraphicsGbp);
  });

  it('allows permanent fixtures outside shell walls while blocking regular equipment from clipping into them', () => {
    const config: StandConfig = {
      ...DEFAULT_STAND_CONFIG,
      width: 4,
      depth: 3,
      openSides: 1, // Inline: back, left, right shell walls all active
      showShellWalls: true,
    };
    const outerPillar = makePillar({ x: 2.8, z: -2.1 });

    // Permanent fixture can sit outside both right and back shell walls freely
    expect(checkWallCollision(outerPillar, 2.8, -2.1, config, [outerPillar]).collides).toBe(false);

    // A regular counter inside the stand cannot clip into a permanent pillar on the stand edge
    const edgePillar = makePillar({ x: 1.7, z: 0.5 });
    const counter: StandItem = {
      id: 'counter-1',
      catalogId: 'reception-desk',
      name: 'Reception Desk',
      x: 1.6,
      y: 0,
      z: 0.5,
      rotationY: 0,
      dims: { w: 1.2, h: 1.0, d: 0.6 },
      artwork: {},
    };
    const collision = checkWallCollision(counter, 1.6, 0.5, config, [edgePillar, counter]);
    expect(collision.collides).toBe(true);
    expect(collision.collidedWallItemIds).toContain(edgePillar.id);

    const resolved = findNearestAllowedPosition(counter, 1.6, 0.5, config, [edgePillar, counter]);
    expect(resolved.adjusted).toBe(true);
    expect(
      checkWallCollision(counter, resolved.x, resolved.z, config, [edgePillar, counter]).collides
    ).toBe(false);
  });
});
