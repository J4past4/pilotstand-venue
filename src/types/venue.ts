import type { OpenSides } from './stand';

export type VenueStandStatus =
  | 'available'
  | 'reserved'
  | 'sold'
  | 'feature'
  | 'catering'
  | 'seating'
  | 'storage'
  | 'void';

export type VenueAmenityKind = 'toilets' | 'catering' | 'info' | 'first-aid' | 'cloakroom';

export interface VenueRect {
  x: number; // metres from hall west wall
  z: number; // metres from hall north wall
  width: number; // metres (X)
  depth: number; // metres (Z)
}

export interface VenueZone {
  id: string;
  name: string;
  shortName: string;
  carpetColor: string;
  borderColor: string;
  accentColor: string;
  description: string;
  /** Rectangular regions forming this zone's floor carpet */
  regions: VenueRect[];
  labelPos: { x: number; z: number };
}

export interface StandCustomBrand {
  primaryColor: string;
  accentColor: string;
  tagline: string;
  website: string;
  logoUrl?: string;
}

export interface OrganizerBrandTheme {
  organizerName: string;
  primaryColor: string;
  accentColor: string;
  badgeText?: string;
}

export interface VenueStand {
  id: string;
  zoneId: string;
  x: number; // metres from west wall
  z: number; // metres from north wall
  width: number; // metres (X)
  depth: number; // metres (Z)
  status: VenueStandStatus;
  exhibitorName?: string;
  sector?: string;
  openSides: OpenSides;
  openEdges?: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
  };
  /** Base rate per m² in GBP (before corner/island multiplier) */
  pricePerSqmGbp?: number;
  notes?: string;
  /** Optional subtitle for feature areas (e.g. sponsor name) */
  sponsor?: string;
  /** Optional live-scraped or organizer-customized brand override for booked stands */
  customBrand?: StandCustomBrand;
}

export interface VenuePillar {
  id: string;
  label: string;
  x: number; // top-left X in metres
  z: number; // top-left Z in metres
  width: number; // metres
  depth: number; // metres
  heightM: number;
  /** Optional stand ID if the pillar sits directly inside or on the edge of a stand */
  affectedStandIds?: string[];
}

export interface VenueEntrance {
  id: string;
  label: string;
  x: number;
  z: number;
  /** Direction visitors enter into the hall */
  direction: 'west' | 'east' | 'north' | 'south';
  widthM: number;
}

export interface VenueAmenity {
  id: string;
  kind: VenueAmenityKind;
  label: string;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface VenueAisleLabel {
  id: string;
  x: number;
  z: number;
  widthM: number;
  orientation: 'horizontal' | 'vertical';
}

export interface ExhibitionVenue {
  id: string;
  name: string;
  edition: string;
  organizer: string;
  venueLocation: string;
  hallName: string;
  issueNumber: string;
  issueDate: string;
  widthM: number;
  depthM: number;
  ceilingHeightM: number;
  currency: 'GBP' | 'USD' | 'EUR';
  defaultPricePerSqmGbp: number;
  shellSchemeSurchargePerSqmGbp: number;
  brandTheme?: OrganizerBrandTheme;
  zones: VenueZone[];
  stands: VenueStand[];
  pillars: VenuePillar[];
  entrances: VenueEntrance[];
  amenities: VenueAmenity[];
  aisleLabels: VenueAisleLabel[];
}

export interface StandAnalytics {
  standId: string;
  areaM2: number;
  spaceOnlyPriceGbp: number;
  shellSchemePriceGbp: number;
  footfallScore: number; // 0-100
  matchScore: number; // 0-100 based on active filters & competitor goals
  nearestEntrance: { label: string; distanceM: number } | null;
  nearestToilet: { label: string; distanceM: number } | null;
  nearestFeature: { label: string; distanceM: number } | null;
  nearestCompetitor: { standId: string; name: string; distanceM: number } | null;
  obstructingPillars: VenuePillar[];
  nearbyPillars: VenuePillar[];
  neighboringExhibitors: Array<{ standId: string; name: string; sector?: string; distanceM: number }>;
}

export interface VenueFilterState {
  search: string;
  statuses: VenueStandStatus[];
  zoneId: string; // 'all' or specific zoneId
  minAreaM2: number;
  maxAreaM2: number;
  openSides: 'all' | OpenSides;
  pillarFreeOnly: boolean;
  sectorFilter: string; // 'all' or specific sector
  sortBy: 'match' | 'footfall' | 'price-asc' | 'area-asc' | 'area-desc';
}

export interface VenueLayerVisibility {
  pillars: boolean;
  amenities: boolean;
  footfallHeatmap: boolean;
  aisleWidths: boolean;
  competitors: boolean;
  dimensions: boolean;
}
