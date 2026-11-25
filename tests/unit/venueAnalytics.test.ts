import { describe, expect, it } from 'vitest';
import { PACKAGING_INNOVATIONS_VENUE } from '../../src/data/packagingInnovationsVenue';
import {
  computeStandAnalytics,
  filterAndSortStands,
  getUniqueSectors,
} from '../../src/utils/venueAnalytics';
import type { VenueFilterState } from '../../src/types/venue';

describe('Packaging Innovations & Empack 2026 Venue Data & Analytics', () => {
  it('contains digitized zones, available stands, sold stands, features, pillars, entrances and toilets', () => {
    const v = PACKAGING_INNOVATIONS_VENUE;
    expect(v.zones.length).toBeGreaterThanOrEqual(6);
    expect(v.stands.length).toBeGreaterThan(150);
    expect(v.stands.filter((s) => s.status === 'available').length).toBeGreaterThan(30);
    expect(v.stands.filter((s) => s.status === 'sold').length).toBeGreaterThan(100);
    expect(v.stands.filter((s) => s.status === 'feature').length).toBeGreaterThanOrEqual(10);
    expect(v.pillars.length).toBeGreaterThanOrEqual(10);
    expect(v.entrances.length).toBe(3);
    expect(v.amenities.filter((a) => a.kind === 'toilets').length).toBeGreaterThanOrEqual(3);
  });

  it('detects structural pillar obstructions on known obstructed stands like D120 and K130', () => {
    const d120 = PACKAGING_INNOVATIONS_VENUE.stands.find((s) => s.id === 'D120')!;
    const ac72 = PACKAGING_INNOVATIONS_VENUE.stands.find((s) => s.id === 'AC72')!;
    expect(d120).toBeDefined();
    expect(ac72).toBeDefined();

    const d120Analytics = computeStandAnalytics(d120, PACKAGING_INNOVATIONS_VENUE, new Set());
    const ac72Analytics = computeStandAnalytics(ac72, PACKAGING_INNOVATIONS_VENUE, new Set());

    expect(d120Analytics.obstructingPillars.length).toBeGreaterThan(0);
    expect(ac72Analytics.obstructingPillars.length).toBe(0);
    expect(ac72Analytics.areaM2).toBe(32);
    expect(ac72Analytics.spaceOnlyPriceGbp).toBeGreaterThan(10000);
    expect(ac72Analytics.nearestEntrance).not.toBeNull();
    expect(ac72Analytics.nearestToilet).not.toBeNull();
  });

  it('computes competitor distance when competitors are flagged', () => {
    const ac72 = PACKAGING_INNOVATIONS_VENUE.stands.find((s) => s.id === 'AC72')!;
    const analytics = computeStandAnalytics(
      ac72,
      PACKAGING_INNOVATIONS_VENUE,
      new Set(['AD60']) // Orkka
    );
    expect(analytics.nearestCompetitor).not.toBeNull();
    expect(analytics.nearestCompetitor?.standId).toBe('AD60');
    expect(analytics.nearestCompetitor?.distanceM).toBeLessThan(10);
  });

  it('filters pillar-free available island stands correctly', () => {
    const analyticsMap = new Map(
      PACKAGING_INNOVATIONS_VENUE.stands.map((s) => [
        s.id,
        computeStandAnalytics(s, PACKAGING_INNOVATIONS_VENUE, new Set()),
      ])
    );

    const filters: VenueFilterState = {
      search: '',
      statuses: ['available'],
      zoneId: 'all',
      minAreaM2: 20,
      maxAreaM2: 200,
      openSides: 4,
      pillarFreeOnly: true,
      sectorFilter: 'all',
      sortBy: 'match',
    };

    const results = filterAndSortStands(PACKAGING_INNOVATIONS_VENUE, analyticsMap, filters);
    expect(results.some((s) => s.id === 'AC72')).toBe(true);
    // K130 is an island but has a structural void pillar, so pillarFreeOnly must exclude it
    expect(results.some((s) => s.id === 'K130')).toBe(false);
    expect(getUniqueSectors(PACKAGING_INNOVATIONS_VENUE).length).toBeGreaterThan(8);
  });
});
