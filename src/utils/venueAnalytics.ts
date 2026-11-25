import type {
  ExhibitionVenue,
  StandAnalytics,
  VenueFilterState,
  VenuePillar,
  VenueStand,
} from '../types/venue';

function standCenter(s: { x: number; z: number; width: number; depth: number }) {
  return { cx: s.x + s.width / 2, cz: s.z + s.depth / 2 };
}

function rectDistance(
  a: { x: number; z: number; width: number; depth: number },
  b: { x: number; z: number; width: number; depth: number }
): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dz = Math.max(0, a.z - (b.z + b.depth), b.z - (a.z + a.depth));
  return Math.hypot(dx, dz);
}

function pointToRectDistance(
  px: number,
  pz: number,
  r: { x: number; z: number; width: number; depth: number }
): number {
  const dx = Math.max(0, r.x - px, px - (r.x + r.width));
  const dz = Math.max(0, r.z - pz, pz - (r.z + r.depth));
  return Math.hypot(dx, dz);
}

export function getOpenSidesLabel(openSides: number): string {
  switch (openSides) {
    case 1:
      return 'Inline (1 Open)';
    case 2:
      return 'Corner (2 Open)';
    case 3:
      return 'Peninsula (3 Open)';
    case 4:
      return 'Island (4 Open)';
    default:
      return `${openSides} Open`;
  }
}

export function getOpenSidesMultiplier(openSides: number): number {
  if (openSides === 4) return 1.15;
  if (openSides === 3) return 1.09;
  if (openSides === 2) return 1.04;
  return 1.0;
}

export function computeStandAnalytics(
  stand: VenueStand,
  venue: ExhibitionVenue,
  competitorStandIds: Set<string>
): StandAnalytics {
  const areaM2 = Math.round(stand.width * stand.depth * 10) / 10;
  const baseRate = stand.pricePerSqmGbp ?? venue.defaultPricePerSqmGbp;
  const mult = getOpenSidesMultiplier(stand.openSides);
  const spaceOnlyPriceGbp = Math.round(areaM2 * baseRate * mult);
  const shellSchemePriceGbp = Math.round(
    spaceOnlyPriceGbp + areaM2 * venue.shellSchemeSurchargePerSqmGbp
  );

  // Obstructing & nearby pillars
  const obstructingPillars: VenuePillar[] = [];
  const nearbyPillars: VenuePillar[] = [];
  for (const pillar of venue.pillars) {
    const dist = rectDistance(stand, pillar);
    const explicitlyAffected = pillar.affectedStandIds?.includes(stand.id) ?? false;
    if (explicitlyAffected || dist < 0.35) {
      obstructingPillars.push(pillar);
    } else if (dist <= 3.0) {
      nearbyPillars.push(pillar);
    }
  }

  // Nearest entrance
  let nearestEntrance: { label: string; distanceM: number } | null = null;
  for (const ent of venue.entrances) {
    const d = Math.round(pointToRectDistance(ent.x, ent.z, stand));
    if (!nearestEntrance || d < nearestEntrance.distanceM) {
      nearestEntrance = { label: ent.label, distanceM: d };
    }
  }

  // Nearest toilet
  let nearestToilet: { label: string; distanceM: number } | null = null;
  for (const am of venue.amenities) {
    if (am.kind !== 'toilets') continue;
    const d = Math.round(rectDistance(stand, am));
    if (!nearestToilet || d < nearestToilet.distanceM) {
      nearestToilet = { label: am.label, distanceM: d };
    }
  }

  // Nearest feature (Stage / Pub / Lounge / Theatre)
  let nearestFeature: { label: string; distanceM: number } | null = null;
  for (const other of venue.stands) {
    if (other.status !== 'feature' || other.id === stand.id) continue;
    const d = Math.round(rectDistance(stand, other));
    if (!nearestFeature || d < nearestFeature.distanceM) {
      nearestFeature = { label: other.exhibitorName || other.id, distanceM: d };
    }
  }

  // Nearest pinned competitor
  let nearestCompetitor: { standId: string; name: string; distanceM: number } | null = null;
  if (competitorStandIds.size > 0) {
    for (const other of venue.stands) {
      if (!competitorStandIds.has(other.id) || other.id === stand.id) continue;
      const d = Math.round(rectDistance(stand, other));
      if (!nearestCompetitor || d < nearestCompetitor.distanceM) {
        nearestCompetitor = {
          standId: other.id,
          name: other.exhibitorName || other.id,
          distanceM: d,
        };
      }
    }
  }

  // Neighboring sold exhibitors (within 18m)
  const neighboringExhibitors: Array<{
    standId: string;
    name: string;
    sector?: string;
    distanceM: number;
  }> = [];
  for (const other of venue.stands) {
    if (other.status !== 'sold' || other.id === stand.id || !other.exhibitorName) continue;
    const d = Math.round(rectDistance(stand, other));
    if (d <= 18) {
      neighboringExhibitors.push({
        standId: other.id,
        name: other.exhibitorName,
        sector: other.sector,
        distanceM: d,
      });
    }
  }
  neighboringExhibitors.sort((a, b) => a.distanceM - b.distanceM);

  // Footfall score (0-100)
  const entranceScore = nearestEntrance
    ? Math.max(0, 42 - nearestEntrance.distanceM * 0.42)
    : 15;
  const featureScore = nearestFeature
    ? Math.max(0, 28 - nearestFeature.distanceM * 0.55)
    : 10;
  const visibilityScore = stand.openSides * 7.5; // 7.5 to 30
  const pillarPenalty = obstructingPillars.length > 0 ? -8 : 0;
  const footfallScore = Math.max(
    18,
    Math.min(99, Math.round(entranceScore + featureScore + visibilityScore + pillarPenalty))
  );

  // Match score (for available stands, rewards high footfall, pillar-free, open sides)
  const pillarBonus = obstructingPillars.length === 0 ? 12 : -14;
  const matchScore = Math.max(
    10,
    Math.min(99, Math.round(footfallScore * 0.72 + stand.openSides * 6 + pillarBonus))
  );

  return {
    standId: stand.id,
    areaM2,
    spaceOnlyPriceGbp,
    shellSchemePriceGbp,
    footfallScore,
    matchScore,
    nearestEntrance,
    nearestToilet,
    nearestFeature,
    nearestCompetitor,
    obstructingPillars,
    nearbyPillars,
    neighboringExhibitors: neighboringExhibitors.slice(0, 6),
  };
}

export function getUniqueSectors(venue: ExhibitionVenue): string[] {
  const set = new Set<string>();
  for (const s of venue.stands) {
    if (s.sector) set.add(s.sector);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function filterAndSortStands(
  venue: ExhibitionVenue,
  analyticsMap: Map<string, StandAnalytics>,
  filters: VenueFilterState
): VenueStand[] {
  const q = filters.search.trim().toLowerCase();

  const filtered = venue.stands.filter((stand) => {
    if (!filters.statuses.includes(stand.status)) return false;
    if (filters.zoneId !== 'all' && stand.zoneId !== filters.zoneId) return false;

    const a = analyticsMap.get(stand.id);
    if (!a) return false;

    if (stand.status !== 'feature') {
      if (a.areaM2 < filters.minAreaM2 || a.areaM2 > filters.maxAreaM2) return false;
    }

    if (filters.openSides !== 'all' && stand.openSides !== filters.openSides) return false;
    if (filters.pillarFreeOnly && a.obstructingPillars.length > 0) return false;
    if (filters.sectorFilter !== 'all' && stand.sector !== filters.sectorFilter) return false;

    if (q) {
      const hay = `${stand.id} ${stand.exhibitorName || ''} ${stand.sector || ''} ${stand.sponsor || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    const aa = analyticsMap.get(a.id)!;
    const ab = analyticsMap.get(b.id)!;
    switch (filters.sortBy) {
      case 'footfall':
        return ab.footfallScore - aa.footfallScore;
      case 'price-asc':
        return aa.spaceOnlyPriceGbp - ab.spaceOnlyPriceGbp;
      case 'area-asc':
        return aa.areaM2 - ab.areaM2;
      case 'area-desc':
        return ab.areaM2 - aa.areaM2;
      case 'match':
      default:
        // Put available stands first if mixed statuses
        if (a.status === 'available' && b.status !== 'available') return -1;
        if (b.status === 'available' && a.status !== 'available') return 1;
        return ab.matchScore - aa.matchScore;
    }
  });

  return filtered;
}

export function getStandCenter(stand: VenueStand) {
  return standCenter(stand);
}

export function formatGbp(amount: number): string {
  return `£${Math.round(amount).toLocaleString('en-GB')}`;
}
