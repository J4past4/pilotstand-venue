export type OpenSides = 1 | 2 | 3 | 4;

export type FloorMaterial =
  | 'charcoal-carpet'
  | 'navy-carpet'
  | 'oak-timber'
  | 'light-concrete'
  | 'slate-tile'
  | 'brand-carpet';

export type LightingPreset = 'expo-hall' | 'daylight' | 'dramatic';

export type MeasurementUnit = 'm' | 'ft';

export type ViewMode = '3d' | '2d' | 'eye-level';

export type CameraPreset = 'isometric' | 'front' | 'left' | 'right' | 'top' | 'eye-level';

export type CurrencyCode = 'GBP' | 'USD' | 'EUR';

export type ArtworkFit = 'cover' | 'contain' | 'stretch';

export type EquipmentCategory = 'walls' | 'branding' | 'counters' | 'seating' | 'lighting';

export type ShellWallSide = 'back' | 'left' | 'right';

export interface SurfaceArtwork {
  assetId: string | null;
  fit: ArtworkFit;
  scale: number; // 0.25 to 2.0
  offsetX: number; // -0.5 to 0.5
  offsetY: number; // -0.5 to 0.5
  bgColor: string;
  emissive?: boolean;
  customHeading?: string;
}

export interface SurfaceZoneDef {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  defaultRole: 'hero' | 'logo' | 'screen' | 'fascia' | 'pattern';
  backlitDefault?: boolean;
}

export interface Dimensions3D {
  w: number;
  h: number;
  d: number;
}

export interface CatalogItemDef {
  id: string;
  name: string;
  shortName: string;
  category: EquipmentCategory;
  description: string;
  defaultDims: Dimensions3D;
  minDims: Dimensions3D;
  maxDims: Dimensions3D;
  resizable: boolean;
  elevatedY?: number; // e.g., hanging banners suspended overhead
  priceHire: number; // in GBP base
  priceBuy: number; // in GBP base
  printAreaM2: number;
  badge?: string;
  surfaces: SurfaceZoneDef[];
  supportsBacklit?: boolean;
  defaultFinish?: 'matte' | 'gloss' | 'oak' | 'metal';
}

export interface StandItem {
  id: string;
  catalogId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotationY: number; // degrees
  dims: Dimensions3D;
  primaryColor?: string;
  accentColor?: string;
  finish?: 'matte' | 'gloss' | 'oak' | 'metal';
  backlit?: boolean;
  locked?: boolean;
  visible?: boolean;
  artwork: Record<string, SurfaceArtwork>;
}

export interface StandConfig {
  width: number; // meters (X axis)
  depth: number; // meters (Z axis)
  heightLimit: number; // meters (venue rigging/build height limit)
  openSides: OpenSides; // 1=Inline, 2=Corner, 3=Peninsula, 4=Island
  showShellWalls: boolean;
  shellWallHeight: number;
  floorMaterial: FloorMaterial;
  floorColor: string;
  wallColor: string;
  trimColor: string;
  brandName: string;
  brandTagline: string;
  primaryColor: string;
  accentColor: string;
  lightingPreset: LightingPreset;
  showScaleFigures: boolean;
  showDimensions: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  gridStep: number; // 0.1 or 0.25
  unit: MeasurementUnit;
  shellArtwork: Partial<Record<ShellWallSide, SurfaceArtwork>>;
}

export interface BrandAsset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  kind: 'uploaded' | 'preset';
  category?: 'logo' | 'banner' | 'screen' | 'pattern';
}

export interface ColorPalettePreset {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  wallColor: string;
  floorMaterial: FloorMaterial;
  floorColor: string;
  trimColor: string;
}

export interface StandTemplate {
  id: string;
  name: string;
  subtitle: string;
  category: 'inline' | 'corner' | 'peninsula' | 'island' | 'compact';
  dimensionsLabel: string;
  openSidesLabel: string;
  highlights: string[];
  config: Partial<StandConfig>;
  items: Omit<StandItem, 'id'>[];
}

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: number;
  config: StandConfig;
  items: StandItem[];
  customAssets: BrandAsset[];
}

export interface ComplianceReport {
  areaM2: number;
  occupiedAreaM2: number;
  occupancyPct: number;
  outOfBoundsIds: string[];
  overHeightIds: string[];
  totalPrintAreaM2: number;
  isCompliant: boolean;
}
