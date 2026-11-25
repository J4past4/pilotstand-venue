import type {
  Dimensions3D,
  FixtureBrandFace,
  StandConfig,
  StandItem,
  VenueBrandingConfig,
} from '../types/stand';

export const VENUE_FIXTURE_CATALOG_IDS = new Set<string>([
  'venue-pillar-square',
  'venue-pillar-round',
  'venue-wall-segment',
  'venue-service-box',
]);

export const DEFAULT_OUTER_GRID_MARGIN = 3;
export const MIN_OUTER_GRID_MARGIN = 1;
export const MAX_OUTER_GRID_MARGIN = 6;

export function getOuterGridMargin(config: Pick<StandConfig, 'outerGridMargin'>): number {
  const raw = config.outerGridMargin ?? DEFAULT_OUTER_GRID_MARGIN;
  return Math.max(MIN_OUTER_GRID_MARGIN, Math.min(MAX_OUTER_GRID_MARGIN, Math.round(raw)));
}

export function isOuterGridVisible(config: Pick<StandConfig, 'showGrid' | 'showOuterGrid'>): boolean {
  return config.showGrid && config.showOuterGrid !== false;
}

export function isVenueFixtureCatalogId(catalogId: string): boolean {
  return VENUE_FIXTURE_CATALOG_IDS.has(catalogId);
}

/**
 * Returns true when an item is a permanent feature belonging to the venue / exhibition
 * (i.e. NOT part of the company's main stand or own products/assets).
 */
export function isVenuePermanentFixture(item: Pick<StandItem, 'isPermanentFixture' | 'fixtureOwner'>): boolean {
  return Boolean(item.isPermanentFixture && (item.fixtureOwner ?? 'venue') === 'venue');
}

/**
 * Returns false if this item is a venue permanent fixture whose branding is disallowed.
 */
export function isItemBrandingAllowed(
  item: Pick<StandItem, 'isPermanentFixture' | 'fixtureOwner' | 'venueBranding'>
): boolean {
  if (!isVenuePermanentFixture(item)) return true;
  return Boolean(item.venueBranding?.allowed);
}

/**
 * Returns which faces are configurable for branding on a given fixture.
 */
export function getAvailableFacesForFixture(
  item: Pick<StandItem, 'catalogId'>
): FixtureBrandFace[] {
  if (item.catalogId === 'venue-pillar-round') {
    return ['front']; // Cylindrical wrap surface
  }
  if (item.catalogId === 'venue-wall-segment') {
    return ['front', 'back'];
  }
  if (item.catalogId === 'venue-service-box') {
    return ['front'];
  }
  return ['front', 'back', 'left', 'right'];
}

export function getFaceLabel(catalogId: string, face: FixtureBrandFace): string {
  if (catalogId === 'venue-pillar-round') {
    return 'Column Wrap';
  }
  switch (face) {
    case 'front':
      return 'Front Face';
    case 'back':
      return 'Back Face';
    case 'left':
      return 'Left Face';
    case 'right':
      return 'Right Face';
  }
}

/**
 * Returns the maximum brandable width (m) on a fixture face.
 * For round columns, this is the full circumference (π × diameter).
 */
export function getMaxZoneWidthForFixture(
  dims: Dimensions3D,
  catalogId: string,
  face?: FixtureBrandFace
): number {
  if (catalogId === 'venue-pillar-round') {
    return Number((Math.PI * Math.max(0.1, dims.w)).toFixed(2));
  }
  if (face === 'left' || face === 'right') {
    return Number(Math.max(0.1, dims.d).toFixed(2));
  }
  if (face === 'front' || face === 'back') {
    return Number(Math.max(0.1, dims.w).toFixed(2));
  }
  return Number(Math.max(0.1, Math.max(dims.w, dims.d)).toFixed(2));
}

export function createDefaultVenueBranding(
  dims: Dimensions3D,
  catalogId: string
): VenueBrandingConfig {
  const maxW = getMaxZoneWidthForFixture(dims, catalogId, 'front');
  const zoneWidthM =
    catalogId === 'venue-pillar-round'
      ? Number(Math.min(maxW, Math.max(0.4, maxW * 0.6)).toFixed(2))
      : Number(Math.max(0.1, dims.w).toFixed(2));
  const zoneHeightM = Number(Math.min(dims.h, Math.max(0.4, Math.min(2.0, dims.h * 0.6))).toFixed(2));
  const zoneBottomM = Number(
    Math.min(Math.max(0, dims.h - zoneHeightM), Math.min(0.8, Math.max(0, (dims.h - zoneHeightM) * 0.4))).toFixed(2)
  );
  return {
    allowed: false,
    allowedFaces: ['front'],
    zoneWidthM,
    zoneHeightM,
    zoneBottomM,
    notes: '',
  };
}

export function clampVenueBrandingToDims(
  branding: VenueBrandingConfig,
  dims: Dimensions3D,
  catalogId: string
): VenueBrandingConfig {
  const availableFaces = getAvailableFacesForFixture({ catalogId });
  const filteredFaces = branding.allowedFaces.filter((f) => availableFaces.includes(f));
  const allowedFaces: FixtureBrandFace[] =
    filteredFaces.length > 0 ? filteredFaces : [availableFaces[0]];

  const maxW = getMaxZoneWidthForFixture(dims, catalogId);
  const zoneWidthM = Number(Math.max(0.1, Math.min(maxW, branding.zoneWidthM)).toFixed(2));
  const zoneHeightM = Number(Math.max(0.1, Math.min(dims.h, branding.zoneHeightM)).toFixed(2));
  const maxBottom = Math.max(0, Number((dims.h - zoneHeightM).toFixed(2)));
  const zoneBottomM = Number(Math.max(0, Math.min(maxBottom, branding.zoneBottomM)).toFixed(2));

  return {
    ...branding,
    allowedFaces,
    zoneWidthM,
    zoneHeightM,
    zoneBottomM,
  };
}

/**
 * Computes the effective brandable width (m) on a specific face of a venue fixture.
 */
export function getEffectiveFaceZoneWidth(
  item: Pick<StandItem, 'catalogId' | 'dims' | 'venueBranding'>,
  face: FixtureBrandFace
): number {
  const vb = item.venueBranding;
  if (!vb) return item.dims.w;
  const maxFaceW = getMaxZoneWidthForFixture(item.dims, item.catalogId, face);
  return Number(Math.max(0.1, Math.min(maxFaceW, vb.zoneWidthM)).toFixed(2));
}

/**
 * Computes the total permitted print/brandable area in m² for a venue permanent fixture.
 * Returns 0 when branding is not allowed.
 */
export function computeVenueFixtureBrandableAreaM2(
  item: Pick<StandItem, 'catalogId' | 'dims' | 'isPermanentFixture' | 'fixtureOwner' | 'venueBranding'>
): number {
  if (!isVenuePermanentFixture(item)) return 0;
  const vb = item.venueBranding;
  if (!vb || !vb.allowed) return 0;
  const faces = vb.allowedFaces.length > 0 ? vb.allowedFaces : (['front'] as FixtureBrandFace[]);
  const clampedH = Math.max(0.1, Math.min(item.dims.h, vb.zoneHeightM));
  let total = 0;
  for (const face of faces) {
    const faceW = getEffectiveFaceZoneWidth(item, face);
    total += faceW * clampedH;
  }
  return Number(total.toFixed(2));
}
