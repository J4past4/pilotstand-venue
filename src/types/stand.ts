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

export type ViewportNavMode = 'select' | 'orbit' | 'pan';

export type CameraPreset = 'isometric' | 'front' | 'back' | 'left' | 'right' | 'top' | 'eye-level';

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

export type CustomModelFormat = 'glb' | 'gltf' | 'stl' | 'obj';

export type CustomAssetCategory =
  | 'product'
  | 'machine'
  | 'furniture'
  | 'structure'
  | 'signage'
  | 'other';

export interface CustomModelAsset {
  id: string;
  name: string;
  format: CustomModelFormat;
  fileSizeBytes: number;
  originalDims: Dimensions3D; // normalized dimensions in meters
  /** Object URL or data URL for fast in-session loading */
  blobUrl: string;
  category?: CustomAssetCategory;
  zUpFix?: boolean;
  defaultTintColor?: string;
  /** Whether this model supports toggling branded decals/graphics on or off */
  supportsBrandingToggle?: boolean;
  /** Default branding state when placed (defaults to true) */
  defaultBranded?: boolean;
  /** Node/mesh names in the 3D hierarchy toggled by modelBranded */
  brandingNodeNames?: string[];
  /** True for user-scoped preloaded exclusive models */
  isExclusive?: boolean;
}

export type AssetPrimitiveKind =
  | 'box'
  | 'cylinder'
  | 'cone'
  | 'sphere'
  | 'wedge'
  | 'ring'
  | 'extrusion';

export type AssetPrimitiveFinish = 'matte' | 'metal' | 'dark-steel' | 'glass' | 'accent';

export interface AssetPrimitive {
  id: string;
  label: string;
  kind: AssetPrimitiveKind;
  /** Dimensions in millimetres (mm) */
  w: number;
  h: number;
  d: number;
  /** Position in mm relative to asset origin; y is bottom elevation from floor */
  x: number;
  y: number;
  z: number;
  /** Optional rotations in degrees */
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  color: string;
  finish: AssetPrimitiveFinish;
  /** For 'extrusion' kind: 2D polygon vertices in mm relative to primitive center */
  points?: Array<{ x: number; y: number }>;
  /** Axis along which traced 2D polygons are extruded ('y' = top-down plan, 'z' = front elevation) */
  extrudeAxis?: 'y' | 'z';
}

export interface CustomBuiltAsset {
  id: string;
  name: string;
  category?: CustomAssetCategory;
  primitives: AssetPrimitive[];
  /** Bounding dimensions in meters */
  dims: Dimensions3D;
  createdAt: number;
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
  /** For imported custom 3D models (.glb, .gltf, .stl, .obj) */
  customModelId?: string;
  /** For user-created parametric/traced assets from the Custom Asset Builder */
  customAssetId?: string;
  customPrimitives?: AssetPrimitive[];
  zUpFix?: boolean;
  lockAspect?: boolean;
  modelTintColor?: string;
  /** For 3D models that support branded vs unbranded graphics (true = branded, false = unbranded) */
  modelBranded?: boolean;
  /** Whether the selected 3D model supports toggling branded graphics */
  supportsBrandingToggle?: boolean;
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
  displayFont?: string;
  bodyFont?: string;
  faviconDataUrl?: string | null;
  websiteUrl?: string;
  eventName?: string;
  standNumber?: string;
  brandNotes?: string;
  lightingPreset: LightingPreset;
  showScaleFigures: boolean;
  showDimensions: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  gridStep: number; // 0.1 or 0.25
  unit: MeasurementUnit;
  shellArtwork: Partial<Record<ShellWallSide, SurfaceArtwork>>;
}

export interface BrandFontPairing {
  id: string;
  label: string;
  styleTag: string;
  displayFont: string;
  bodyFont: string;
  googleFontsHref?: string;
}

export interface BrandKitSetupResult {
  brandName: string;
  brandTagline: string;
  websiteUrl: string;
  eventName: string;
  standNumber: string;
  brandNotes: string;
  displayFont: string;
  bodyFont: string;
  primaryColor: string;
  accentColor: string;
  wallColor: string;
  floorMaterial: FloorMaterial;
  floorColor: string;
  lightingPreset: LightingPreset;
  faviconDataUrl: string | null;
  logoAsset: BrandAsset | null;
  heroAsset: BrandAsset | null;
  screenAsset: BrandAsset | null;
  extraAssets: BrandAsset[];
  customModelFiles: File[];
  startTour: boolean;
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
  customBuiltAssets?: CustomBuiltAsset[];
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
