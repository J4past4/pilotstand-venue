import { CATALOG_MAP } from '../data/catalog';
import type {
  ArtworkFit,
  BrandAsset,
  EquipmentCategory,
  ShellWallSide,
  StandConfig,
  StandItem,
  SurfaceArtwork,
  SurfaceZoneDef,
} from '../types/stand';
import { evaluateCompliance, formatArea, formatLength } from './pricing';

export interface PrintColorSpec {
  label: string;
  hex: string;
  rgb: string;
  cmyk: string;
}

export interface DesignerAssetMockup {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  kind: 'uploaded' | 'preset';
  effectiveDpi?: number;
  lowResWarning?: boolean;
}

export interface DesignerAssetSpec {
  refCode: string;
  itemId: string;
  itemName: string;
  catalogId: string;
  category: EquipmentCategory | 'shell-wall';
  surfaceId: string;
  surfaceLabel: string;
  role: SurfaceZoneDef['defaultRole'];
  isDigitalScreen: boolean;
  isBacklit: boolean;
  /** Visible / finished trim width in mm */
  widthMm: number;
  /** Visible / finished trim height in mm */
  heightMm: number;
  /** Recommended bleed per edge in mm */
  bleedMm: number;
  /** Recommended inner safe zone margin from trim edge in mm */
  safeZoneMm: number;
  /** Total artwork file width including bleed on both sides (mm) */
  totalWithBleedWidthMm: number;
  /** Total artwork file height including bleed on top & bottom (mm) */
  totalWithBleedHeightMm: number;
  areaM2: number;
  aspectRatio: number;
  aspectRatioLabel: string;
  orientation: 'landscape' | 'portrait' | 'square';
  recommendedDpi: number;
  recommendedPixels: { width: number; height: number };
  colorSpace: 'sRGB (Digital)' | 'CMYK (Print)';
  fileFormat: string;
  productionNotes: string[];
  suggestedFilename: string;
  artworkStatus: 'uploaded-mockup' | 'preset-mockup' | 'auto-branded';
  assignedAsset: DesignerAssetMockup | null;
  fit: ArtworkFit;
  bgColor: string;
  customHeading?: string;
  finish?: string;
}

export interface ReferencedBrandAsset {
  asset: BrandAsset;
  usedByRefs: string[];
}

export interface DesignerSpecPack {
  projectName: string;
  generatedAtIso: string;
  brand: {
    name: string;
    tagline: string;
    eventName?: string;
    standNumber?: string;
    websiteUrl?: string;
    notes?: string;
    displayFont: string;
    bodyFont: string;
    palette: PrintColorSpec[];
  };
  standSummary: {
    widthM: number;
    depthM: number;
    heightLimitM: number;
    unit: StandConfig['unit'];
    footprintLabel: string;
    areaLabel: string;
    heightLimitLabel: string;
    openSidesLabel: string;
    floorMaterial: string;
    totalBrandedSurfaces: number;
    printSurfaceCount: number;
    digitalScreenCount: number;
    backlitCount: number;
    totalPrintAreaM2: number;
    uploadedMockupCount: number;
    needsArtworkCount: number;
  };
  specs: DesignerAssetSpec[];
  referencedAssets: ReferencedBrandAsset[];
}

/**
 * Parse a 3- or 6-digit hex color string to RGB channels.
 */
export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return {
      r: parseInt(cleaned[0] + cleaned[0], 16),
      g: parseInt(cleaned[1] + cleaned[1], 16),
      b: parseInt(cleaned[2] + cleaned[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16),
      g: parseInt(cleaned.slice(2, 4), 16),
      b: parseInt(cleaned.slice(4, 6), 16),
    };
  }
  return null;
}

/**
 * Convert a hex color string to formatted RGB and approximate CMYK values for print briefs.
 */
export function hexToPrintColorSpec(label: string, hex: string): PrintColorSpec {
  const normalizedHex = hex.trim().toUpperCase();
  const rgbObj = parseHexColor(normalizedHex);
  if (!rgbObj) {
    return {
      label,
      hex: normalizedHex || '#000000',
      rgb: '—',
      cmyk: '—',
    };
  }

  const { r, g, b } = rgbObj;
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const k = 1 - Math.max(rN, gN, bN);

  let c = 0;
  let m = 0;
  let y = 0;
  if (k < 1) {
    c = (1 - rN - k) / (1 - k);
    m = (1 - gN - k) / (1 - k);
    y = (1 - bN - k) / (1 - k);
  }

  return {
    label,
    hex: normalizedHex.startsWith('#') ? normalizedHex : `#${normalizedHex}`,
    rgb: `rgb(${r}, ${g}, ${b})`,
    cmyk: `C${Math.round(c * 100)} M${Math.round(m * 100)} Y${Math.round(y * 100)} K${Math.round(k * 100)}`,
  };
}

function slugifyFilenamePart(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return slug || 'asset';
}

function describeOrientation(widthMm: number, heightMm: number): {
  aspectRatio: number;
  orientation: 'landscape' | 'portrait' | 'square';
  aspectRatioLabel: string;
} {
  const safeH = Math.max(1, heightMm);
  const ratio = widthMm / safeH;
  if (Math.abs(ratio - 1) <= 0.06) {
    return {
      aspectRatio: ratio,
      orientation: 'square',
      aspectRatioLabel: '1.00:1 (Square)',
    };
  }
  if (ratio > 1) {
    return {
      aspectRatio: ratio,
      orientation: 'landscape',
      aspectRatioLabel: `${ratio.toFixed(2)}:1 (Landscape)`,
    };
  }
  return {
    aspectRatio: ratio,
    orientation: 'portrait',
    aspectRatioLabel: `${ratio.toFixed(2)}:1 (Portrait)`,
  };
}

function computePrintRules(params: {
  catalogId: string;
  role: SurfaceZoneDef['defaultRole'];
  isBacklit: boolean;
  widthMm: number;
  heightMm: number;
  finish?: string;
  customHeading?: string;
}): {
  isDigitalScreen: boolean;
  bleedMm: number;
  safeZoneMm: number;
  recommendedDpi: number;
  recommendedPixels: { width: number; height: number };
  colorSpace: 'sRGB (Digital)' | 'CMYK (Print)';
  fileFormat: string;
  productionNotes: string[];
} {
  const { catalogId, role, isBacklit, widthMm, heightMm, finish, customHeading } = params;
  const notes: string[] = [];

  if (role === 'screen') {
    const isLargeLed = catalogId === 'led-video-wall' || widthMm >= 1800;
    const targetW = isLargeLed ? 3840 : 1920;
    const targetH = Math.max(480, Math.round(targetW / Math.max(0.25, widthMm / Math.max(1, heightMm))));
    notes.push(
      isLargeLed
        ? 'Digital LED video wall content — supply in sRGB with high contrast and bold typography for distance viewing.'
        : 'Digital AV display screen — supply static slide (PNG) or looping motion graphic (MP4 H.264) in sRGB.'
    );
    notes.push('Keep critical text/logos within 5% title-safe margin from all screen edges.');
    if (customHeading) notes.push(`Requested headline/copy: "${customHeading}"`);
    return {
      isDigitalScreen: true,
      bleedMm: 0,
      safeZoneMm: 0,
      recommendedDpi: 72,
      recommendedPixels: { width: targetW, height: targetH },
      colorSpace: 'sRGB (Digital)',
      fileFormat: 'PNG / MP4 (sRGB)',
      productionNotes: notes,
    };
  }

  let bleedMm = 10;
  let safeZoneMm = 50;

  if (isBacklit || catalogId === 'seg-lightbox') {
    bleedMm = 15;
    safeZoneMm = 50;
    notes.push(
      'SEG Backlit tension fabric — include 15 mm bleed on all edges for silicone keder stitching.'
    );
    notes.push(
      'Use rich backlit CMYK blacks (e.g. C40 M30 Y30 K100) and saturated brand tones to avoid washout under LEDs.'
    );
  } else if (catalogId === 'rollup-banner') {
    bleedMm = 5;
    safeZoneMm = 30;
    notes.push(
      'Roll-up banner — add an extra 100 mm non-visible bottom leader (background color/bleed only) for the base roller mechanism.'
    );
  } else if (catalogId === 'popup-wall-curved') {
    bleedMm = 15;
    safeZoneMm = 60;
    notes.push(
      'Curved pop-up mural — keep logos and key text centered away from the curved outer return edges (60 mm safe zone).'
    );
  } else if (catalogId === 'hanging-ring' || catalogId === 'hanging-cube') {
    bleedMm = 15;
    safeZoneMm = 60;
    notes.push(
      catalogId === 'hanging-ring'
        ? 'Overhead 360° circular hanging banner — repeat brand mark 3–4× evenly around circumference so it reads from every aisle.'
        : 'Overhead 4-sided hanging rig — design for long-distance legibility (minimum 120 mm cap height recommended).'
    );
  } else if (catalogId === 'feather-flag') {
    bleedMm = 10;
    safeZoneMm = 40;
    notes.push(
      'Feather flag — supply mirrored reverse artwork if double-sided, and keep logos away from the pole sleeve edge.'
    );
  } else if (
    catalogId === 'reception-desk' ||
    catalogId === 'quickfold-counter' ||
    catalogId === 'demo-kiosk' ||
    catalogId === 'display-plinth' ||
    catalogId === 'brand-totem'
  ) {
    bleedMm = 5;
    safeZoneMm = 30;
    notes.push(
      'Close-viewing counter/plinth graphic — keep critical logos in the upper two-thirds for visibility above waist height.'
    );
  } else if (catalogId === 'shell-wall') {
    bleedMm = 10;
    safeZoneMm = 50;
    notes.push(
      'Full shell-scheme wall mural — confirm panel seam pitch (typically 950–1000 mm bays) with venue contractor before finalising text placement.'
    );
  } else {
    bleedMm = 10;
    safeZoneMm = 50;
    notes.push('Large-format print panel — extend background imagery/color cleanly into the bleed area.');
  }

  const maxDimMm = Math.max(widthMm, heightMm);
  const recommendedDpi = maxDimMm <= 1200 ? 300 : 150;
  const totalW = widthMm + bleedMm * 2;
  const totalH = heightMm + bleedMm * 2;
  const pxW = Math.round((totalW / 25.4) * recommendedDpi);
  const pxH = Math.round((totalH / 25.4) * recommendedDpi);

  if (finish) {
    notes.push(`Preferred substrate finish: ${finish}.`);
  }
  if (customHeading) {
    notes.push(`Requested headline/copy: "${customHeading}"`);
  }

  return {
    isDigitalScreen: false,
    bleedMm,
    safeZoneMm,
    recommendedDpi,
    recommendedPixels: { width: pxW, height: pxH },
    colorSpace: 'CMYK (Print)',
    fileFormat: 'PDF/X-4 (CMYK, Outlined Fonts)',
    productionNotes: notes,
  };
}

function buildMockupInfo(
  art: SurfaceArtwork | undefined,
  assetsMap: Map<string, BrandAsset>,
  widthMm: number,
  heightMm: number,
  recommendedDpi: number,
  isDigitalScreen: boolean
): {
  status: DesignerAssetSpec['artworkStatus'];
  assignedAsset: DesignerAssetMockup | null;
} {
  if (!art?.assetId) {
    return { status: 'auto-branded', assignedAsset: null };
  }
  const asset = assetsMap.get(art.assetId);
  if (!asset) {
    return { status: 'auto-branded', assignedAsset: null };
  }

  let effectiveDpi: number | undefined;
  let lowResWarning = false;

  if (!isDigitalScreen && asset.width > 0 && asset.height > 0 && widthMm > 0 && heightMm > 0) {
    const dpiX = asset.width / (widthMm / 25.4);
    const dpiY = asset.height / (heightMm / 25.4);
    effectiveDpi = Math.round(Math.min(dpiX, dpiY));
    // Large format print generally needs >= 72-100 DPI minimum to avoid visible pixelation
    const minAcceptableDpi = recommendedDpi >= 300 ? 150 : 72;
    lowResWarning = effectiveDpi < minAcceptableDpi;
  }

  return {
    status: asset.kind === 'uploaded' ? 'uploaded-mockup' : 'preset-mockup',
    assignedAsset: {
      id: asset.id,
      name: asset.name,
      dataUrl: asset.dataUrl,
      width: asset.width,
      height: asset.height,
      kind: asset.kind,
      effectiveDpi,
      lowResWarning,
    },
  };
}

/**
 * Build a complete, structured Graphic Designer Artwork Specification Pack
 * containing every branded surface, exact mm measurements, bleed/safe zones,
 * brand colors (HEX/RGB/CMYK), and mockup DPI readiness checks.
 */
export function buildDesignerSpecPack(
  projectName: string,
  config: StandConfig,
  items: StandItem[],
  assetsMap: Map<string, BrandAsset>
): DesignerSpecPack {
  const compliance = evaluateCompliance(config, items);
  const specs: DesignerAssetSpec[] = [];
  const assetRefUsage = new Map<string, Set<string>>();

  let refCounter = 1;
  const nextRefCode = () => `G-${String(refCounter++).padStart(2, '0')}`;

  const registerAssetUsage = (assetId: string, refCode: string) => {
    const existing = assetRefUsage.get(assetId);
    if (existing) {
      existing.add(refCode);
    } else {
      assetRefUsage.set(assetId, new Set([refCode]));
    }
  };

  // 1. Active Perimeter Shell Walls (respecting openSides)
  if (config.showShellWalls && config.openSides < 4) {
    const activeSides: ShellWallSide[] = ['back'];
    if (config.openSides <= 2) activeSides.push('left');
    if (config.openSides === 1) activeSides.push('right');

    for (const side of activeSides) {
      const art = config.shellArtwork[side];
      if (!art?.assetId && !art?.customHeading) continue;

      const refCode = nextRefCode();
      const lenM = side === 'back' ? config.width : config.depth;
      const widthMm = Math.round(lenM * 1000);
      const heightMm = Math.round(config.shellWallHeight * 1000);
      const orient = describeOrientation(widthMm, heightMm);
      const rules = computePrintRules({
        catalogId: 'shell-wall',
        role: 'hero',
        isBacklit: false,
        widthMm,
        heightMm,
        customHeading: art?.customHeading,
      });
      const mockup = buildMockupInfo(
        art,
        assetsMap,
        widthMm,
        heightMm,
        rules.recommendedDpi,
        rules.isDigitalScreen
      );

      if (mockup.assignedAsset) {
        registerAssetUsage(mockup.assignedAsset.id, refCode);
      }

      specs.push({
        refCode,
        itemId: `shell-${side}`,
        itemName: `Perimeter Shell Wall (${side.toUpperCase()})`,
        catalogId: 'shell-wall',
        category: 'shell-wall',
        surfaceId: side,
        surfaceLabel: 'Full Wall Mural',
        role: 'hero',
        isDigitalScreen: rules.isDigitalScreen,
        isBacklit: false,
        widthMm,
        heightMm,
        bleedMm: rules.bleedMm,
        safeZoneMm: rules.safeZoneMm,
        totalWithBleedWidthMm: widthMm + rules.bleedMm * 2,
        totalWithBleedHeightMm: heightMm + rules.bleedMm * 2,
        areaM2: (widthMm * heightMm) / 1_000_000,
        aspectRatio: orient.aspectRatio,
        aspectRatioLabel: orient.aspectRatioLabel,
        orientation: orient.orientation,
        recommendedDpi: rules.recommendedDpi,
        recommendedPixels: rules.recommendedPixels,
        colorSpace: rules.colorSpace,
        fileFormat: rules.fileFormat,
        productionNotes: rules.productionNotes,
        suggestedFilename: `${refCode}_shell-wall-${side}_${widthMm}x${heightMm}mm.pdf`,
        artworkStatus: mockup.status,
        assignedAsset: mockup.assignedAsset,
        fit: art?.fit || 'cover',
        bgColor: art?.bgColor || config.wallColor,
        customHeading: art?.customHeading,
      });
    }
  }

  // 2. Placed Stand Items with Brandable Surfaces
  for (const item of items) {
    if (item.visible === false) continue;
    const def = CATALOG_MAP[item.catalogId];
    if (!def || def.surfaces.length === 0) continue;

    const scaleW = def.defaultDims.w > 0 ? item.dims.w / def.defaultDims.w : 1;
    const scaleH = def.defaultDims.h > 0 ? item.dims.h / def.defaultDims.h : 1;

    for (const surface of def.surfaces) {
      const refCode = nextRefCode();
      const art = item.artwork[surface.id];
      const widthMm = Math.max(10, Math.round(surface.widthMm * scaleW));
      const heightMm = Math.max(10, Math.round(surface.heightMm * scaleH));
      const isBacklit = Boolean(item.backlit ?? surface.backlitDefault ?? art?.emissive);
      const orient = describeOrientation(widthMm, heightMm);
      const rules = computePrintRules({
        catalogId: item.catalogId,
        role: surface.defaultRole,
        isBacklit,
        widthMm,
        heightMm,
        finish: item.finish || def.defaultFinish,
        customHeading: art?.customHeading,
      });
      const mockup = buildMockupInfo(
        art,
        assetsMap,
        widthMm,
        heightMm,
        rules.recommendedDpi,
        rules.isDigitalScreen
      );

      if (mockup.assignedAsset) {
        registerAssetUsage(mockup.assignedAsset.id, refCode);
      }

      const ext = rules.isDigitalScreen ? 'png' : 'pdf';
      const itemSlug = slugifyFilenamePart(item.name);
      const surfSlug = slugifyFilenamePart(surface.id);

      specs.push({
        refCode,
        itemId: item.id,
        itemName: item.name,
        catalogId: item.catalogId,
        category: def.category,
        surfaceId: surface.id,
        surfaceLabel: surface.label,
        role: surface.defaultRole,
        isDigitalScreen: rules.isDigitalScreen,
        isBacklit,
        widthMm,
        heightMm,
        bleedMm: rules.bleedMm,
        safeZoneMm: rules.safeZoneMm,
        totalWithBleedWidthMm: widthMm + rules.bleedMm * 2,
        totalWithBleedHeightMm: heightMm + rules.bleedMm * 2,
        areaM2: (widthMm * heightMm) / 1_000_000,
        aspectRatio: orient.aspectRatio,
        aspectRatioLabel: orient.aspectRatioLabel,
        orientation: orient.orientation,
        recommendedDpi: rules.recommendedDpi,
        recommendedPixels: rules.recommendedPixels,
        colorSpace: rules.colorSpace,
        fileFormat: rules.fileFormat,
        productionNotes: rules.productionNotes,
        suggestedFilename: `${refCode}_${itemSlug}_${surfSlug}_${widthMm}x${heightMm}mm.${ext}`,
        artworkStatus: mockup.status,
        assignedAsset: mockup.assignedAsset,
        fit: art?.fit || 'cover',
        bgColor: art?.bgColor || item.primaryColor || config.primaryColor,
        customHeading: art?.customHeading,
        finish: item.finish || def.defaultFinish,
      });
    }
  }

  const referencedAssets: ReferencedBrandAsset[] = [];
  for (const [assetId, refs] of assetRefUsage.entries()) {
    const asset = assetsMap.get(assetId);
    if (asset) {
      referencedAssets.push({
        asset,
        usedByRefs: Array.from(refs),
      });
    }
  }

  const printSpecs = specs.filter((s) => !s.isDigitalScreen);
  const digitalSpecs = specs.filter((s) => s.isDigitalScreen);
  const backlitCount = specs.filter((s) => s.isBacklit && !s.isDigitalScreen).length;
  const totalPrintAreaM2 = printSpecs.reduce((acc, s) => acc + s.areaM2, 0);
  const uploadedMockupCount = specs.filter((s) => s.artworkStatus === 'uploaded-mockup').length;
  const needsArtworkCount = specs.filter(
    (s) => s.artworkStatus !== 'uploaded-mockup' || s.assignedAsset?.lowResWarning
  ).length;

  const openSidesLabel =
    config.openSides === 1
      ? 'Inline (1 Open Side)'
      : config.openSides === 2
        ? 'Corner (2 Open Sides)'
        : config.openSides === 3
          ? 'Peninsula (3 Open Sides)'
          : 'Island (4 Open Sides)';

  return {
    projectName,
    generatedAtIso: new Date().toISOString(),
    brand: {
      name: config.brandName || 'Untitled Brand',
      tagline: config.brandTagline || '',
      eventName: config.eventName,
      standNumber: config.standNumber,
      websiteUrl: config.websiteUrl,
      notes: config.brandNotes,
      displayFont: config.displayFont || 'Inter',
      bodyFont: config.bodyFont || 'Inter',
      palette: [
        hexToPrintColorSpec('Primary Brand', config.primaryColor),
        hexToPrintColorSpec('Accent Brand', config.accentColor),
        hexToPrintColorSpec('Wall Base', config.wallColor),
        hexToPrintColorSpec('Trim / Frame', config.trimColor),
        hexToPrintColorSpec('Flooring', config.floorColor),
      ],
    },
    standSummary: {
      widthM: config.width,
      depthM: config.depth,
      heightLimitM: config.heightLimit,
      unit: config.unit,
      footprintLabel: `${formatLength(config.width, config.unit)} × ${formatLength(config.depth, config.unit)}`,
      areaLabel: formatArea(compliance.areaM2, config.unit),
      heightLimitLabel: formatLength(config.heightLimit, config.unit),
      openSidesLabel,
      floorMaterial: config.floorMaterial,
      totalBrandedSurfaces: specs.length,
      printSurfaceCount: printSpecs.length,
      digitalScreenCount: digitalSpecs.length,
      backlitCount,
      totalPrintAreaM2,
      uploadedMockupCount,
      needsArtworkCount,
    },
    specs,
    referencedAssets,
  };
}

function escapeCsvCell(value: string | number | boolean | undefined): string {
  const str = value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate a clean, spreadsheet-ready CSV Artwork Schedule for graphic designers.
 */
export function buildDesignerSpecCsv(pack: DesignerSpecPack): string {
  const headers = [
    'Ref Code',
    'Equipment / Structure',
    'Surface Zone',
    'Type',
    'Backlit',
    'Trim Width (mm)',
    'Trim Height (mm)',
    'Bleed Per Edge (mm)',
    'Total With Bleed Width (mm)',
    'Total With Bleed Height (mm)',
    'Safe Zone Margin (mm)',
    'Area (m2)',
    'Aspect Ratio',
    'Color Space',
    'Recommended DPI',
    'Recommended Pixel Size',
    'File Format',
    'Mockup Status',
    'Current Mockup File',
    'Mockup Resolution (px)',
    'Mockup Effective DPI',
    'Suggested Delivery Filename',
    'Designer & Production Notes',
  ];

  const rows = pack.specs.map((s) => [
    s.refCode,
    s.itemName,
    s.surfaceLabel,
    s.isDigitalScreen ? 'Digital Screen' : 'Print Graphic',
    s.isBacklit ? 'Yes' : 'No',
    s.widthMm,
    s.heightMm,
    s.bleedMm,
    s.totalWithBleedWidthMm,
    s.totalWithBleedHeightMm,
    s.safeZoneMm,
    s.areaM2.toFixed(2),
    s.aspectRatioLabel,
    s.colorSpace,
    s.recommendedDpi,
    `${s.recommendedPixels.width}x${s.recommendedPixels.height}`,
    s.fileFormat,
    s.artworkStatus === 'uploaded-mockup'
      ? s.assignedAsset?.lowResWarning
        ? 'Low-Res Mockup (Rebuild for Print)'
        : 'Mockup Uploaded'
      : s.artworkStatus === 'preset-mockup'
        ? 'Preset Mockup (Replace with Brand Artwork)'
        : 'Auto-Branded Placeholder (Artwork Needed)',
    s.assignedAsset?.name || 'None',
    s.assignedAsset ? `${s.assignedAsset.width}x${s.assignedAsset.height}` : '',
    s.assignedAsset?.effectiveDpi ?? '',
    s.suggestedFilename,
    s.productionNotes.join(' | '),
  ]);

  return [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ].join('\r\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render an inline scaled SVG blueprint showing bleed, trim, safe zone,
 * exact mm callouts, and current mockup preview for a single branded surface.
 */
function renderSurfaceDiagramSvg(spec: DesignerAssetSpec, brandName: string): string {
  const vbW = 280;
  const vbH = 190;
  const padX = 48;
  const padTop = 32;
  const padBottom = 34;
  const maxBoxW = vbW - padX * 2;
  const maxBoxH = vbH - padTop - padBottom;

  const ratio = Math.max(0.28, Math.min(3.6, spec.widthMm / Math.max(1, spec.heightMm)));
  let boxW = maxBoxW;
  let boxH = boxW / ratio;
  if (boxH > maxBoxH) {
    boxH = maxBoxH;
    boxW = boxH * ratio;
  }

  const x = (vbW - boxW) / 2;
  const y = padTop + (maxBoxH - boxH) / 2;
  const bleedPad = spec.isDigitalScreen ? 0 : 7;
  const safePad = spec.isDigitalScreen ? 8 : Math.min(12, Math.max(6, Math.min(boxW, boxH) * 0.12));

  const clipId = `clip-${spec.refCode.replace(/[^a-zA-Z0-9]/g, '')}`;
  const safeHex = /^#[0-9a-fA-F]{3,6}$/.test(spec.bgColor) ? spec.bgColor : '#1E293B';

  const previewLayer = spec.assignedAsset?.dataUrl
    ? `<image href="${escapeHtml(spec.assignedAsset.dataUrl)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" preserveAspectRatio="${spec.fit === 'contain' ? 'xMidYMid meet' : spec.fit === 'stretch' ? 'none' : 'xMidYMid slice'}" clip-path="url(#${clipId})" opacity="0.92" />`
    : `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${safeHex}" opacity="0.22" />
       <text x="${(x + boxW / 2).toFixed(1)}" y="${(y + boxH / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#334155">${escapeHtml((spec.customHeading || brandName).slice(0, 24))}</text>`;

  return `<svg viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(spec.refCode)} ${spec.widthMm} by ${spec.heightMm} mm diagram">
    <defs>
      <clipPath id="${clipId}">
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" />
      </clipPath>
    </defs>
    <rect x="0" y="0" width="${vbW}" height="${vbH}" rx="8" fill="#F8FAFC" />

    ${
      bleedPad > 0
        ? `<rect x="${(x - bleedPad).toFixed(1)}" y="${(y - bleedPad).toFixed(1)}" width="${(boxW + bleedPad * 2).toFixed(1)}" height="${(boxH + bleedPad * 2).toFixed(1)}" fill="rgba(239,68,68,0.06)" stroke="#EF4444" stroke-width="1" stroke-dasharray="4 3" />`
        : ''
    }

    <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.5" />
    ${previewLayer}

    <rect x="${(x + safePad).toFixed(1)}" y="${(y + safePad).toFixed(1)}" width="${Math.max(4, boxW - safePad * 2).toFixed(1)}" height="${Math.max(4, boxH - safePad * 2).toFixed(1)}" fill="none" stroke="#0EA5E9" stroke-width="1" stroke-dasharray="3 2.5" />

    <!-- Top width dimension line -->
    <line x1="${x.toFixed(1)}" y1="${(y - bleedPad - 10).toFixed(1)}" x2="${(x + boxW).toFixed(1)}" y2="${(y - bleedPad - 10).toFixed(1)}" stroke="#0F172A" stroke-width="1" />
    <line x1="${x.toFixed(1)}" y1="${(y - bleedPad - 14).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y - bleedPad - 6).toFixed(1)}" stroke="#0F172A" stroke-width="1" />
    <line x1="${(x + boxW).toFixed(1)}" y1="${(y - bleedPad - 14).toFixed(1)}" x2="${(x + boxW).toFixed(1)}" y2="${(y - bleedPad - 6).toFixed(1)}" stroke="#0F172A" stroke-width="1" />
    <text x="${(x + boxW / 2).toFixed(1)}" y="${(y - bleedPad - 14).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" font-family="ui-monospace, SFMono-Regular, monospace" fill="#0F172A">${spec.widthMm} mm</text>

    <!-- Right height dimension line -->
    <line x1="${(x + boxW + bleedPad + 10).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + boxW + bleedPad + 10).toFixed(1)}" y2="${(y + boxH).toFixed(1)}" stroke="#0F172A" stroke-width="1" />
    <line x1="${(x + boxW + bleedPad + 6).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + boxW + bleedPad + 14).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#0F172A" stroke-width="1" />
    <line x1="${(x + boxW + bleedPad + 6).toFixed(1)}" y1="${(y + boxH).toFixed(1)}" x2="${(x + boxW + bleedPad + 14).toFixed(1)}" y2="${(y + boxH).toFixed(1)}" stroke="#0F172A" stroke-width="1" />
    <text x="${(x + boxW + bleedPad + 16).toFixed(1)}" y="${(y + boxH / 2 + 3).toFixed(1)}" text-anchor="start" font-size="9.5" font-weight="700" font-family="ui-monospace, SFMono-Regular, monospace" fill="#0F172A">${spec.heightMm} mm</text>

    <!-- Legend strip -->
    <g font-size="8.5" fill="#475569" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
      ${
        bleedPad > 0
          ? `<line x1="12" y1="${vbH - 12}" x2="26" y2="${vbH - 12}" stroke="#EF4444" stroke-width="1.2" stroke-dasharray="3 2" />
             <text x="30" y="${vbH - 9}">Bleed (+${spec.bleedMm}mm)</text>
             <line x1="108" y1="${vbH - 12}" x2="122" y2="${vbH - 12}" stroke="#0F172A" stroke-width="1.5" />
             <text x="126" y="${vbH - 9}">Trim</text>
             <line x1="164" y1="${vbH - 12}" x2="178" y2="${vbH - 12}" stroke="#0EA5E9" stroke-width="1.2" stroke-dasharray="3 2" />
             <text x="182" y="${vbH - 9}">Safe (-${spec.safeZoneMm}mm)</text>`
          : `<line x1="12" y1="${vbH - 12}" x2="26" y2="${vbH - 12}" stroke="#0F172A" stroke-width="1.5" />
             <text x="30" y="${vbH - 9}">Screen Frame</text>
             <line x1="110" y1="${vbH - 12}" x2="124" y2="${vbH - 12}" stroke="#0EA5E9" stroke-width="1.2" stroke-dasharray="3 2" />
             <text x="128" y="${vbH - 9}">5% Title-Safe Margin</text>`
      }
    </g>
  </svg>`;
}

/**
 * Build a plain-text checklist summary ideal for pasting into Slack or email to a graphic designer.
 */
export function buildDesignerPlainTextSummary(pack: DesignerSpecPack): string {
  const lines: string[] = [
    `GRAPHIC DESIGNER ARTWORK BRIEF — ${pack.projectName}`,
    `Brand: ${pack.brand.name}${pack.brand.tagline ? ` — "${pack.brand.tagline}"` : ''}`,
    `Stand: ${pack.standSummary.footprintLabel} (${pack.standSummary.openSidesLabel}) | Branded Surfaces: ${pack.standSummary.totalBrandedSurfaces} | Total Print Area: ${pack.standSummary.totalPrintAreaM2.toFixed(2)} m²`,
    `Colors: ${pack.brand.palette.slice(0, 3).map((c) => `${c.label} ${c.hex} (${c.cmyk})`).join(' | ')}`,
    `Fonts: Display ${pack.brand.displayFont} / Body ${pack.brand.bodyFont}`,
    '',
    'ARTWORK DELIVERABLES:',
  ];

  if (pack.specs.length === 0) {
    lines.push('- No branded surfaces configured on this stand yet.');
  } else {
    for (const s of pack.specs) {
      const sizeStr = s.isDigitalScreen
        ? `${s.widthMm}×${s.heightMm}mm screen (${s.recommendedPixels.width}×${s.recommendedPixels.height}px sRGB)`
        : `${s.widthMm}×${s.heightMm}mm trim (+${s.bleedMm}mm bleed → ${s.totalWithBleedWidthMm}×${s.totalWithBleedHeightMm}mm file, ${s.safeZoneMm}mm safe zone, ${s.recommendedDpi} DPI CMYK)`;
      lines.push(
        `- [${s.refCode}] ${s.itemName} — ${s.surfaceLabel}: ${sizeStr}${s.isBacklit ? ' [BACKLIT]' : ''} → File: ${s.suggestedFilename}`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Generate a complete, standalone, print/PDF-ready HTML Graphic Designer Artwork Pack.
 */
export function buildDesignerBriefHtml(
  pack: DesignerSpecPack,
  snapshotDataUrl: string | null
): string {
  const csvContent = buildDesignerSpecCsv(pack);
  const plainTextSummary = buildDesignerPlainTextSummary(pack);
  const safeFileSlug = slugifyFilenamePart(pack.projectName);
  const generatedDate = new Date(pack.generatedAtIso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const escapeForScriptJson = (val: string) =>
    JSON.stringify(val).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const embeddedCsvJson = escapeForScriptJson(csvContent);
  const embeddedSummaryJson = escapeForScriptJson(plainTextSummary);

  const renderStatusBadge = (s: DesignerAssetSpec) => {
    if (s.artworkStatus === 'uploaded-mockup' && s.assignedAsset?.lowResWarning) {
      return `<span class="badge badge-warn">Low-Res Mockup (${s.assignedAsset.effectiveDpi} DPI) — Rebuild</span>`;
    }
    if (s.artworkStatus === 'uploaded-mockup') {
      return `<span class="badge badge-ok">Mockup Attached${s.assignedAsset?.effectiveDpi ? ` (~${s.assignedAsset.effectiveDpi} DPI)` : ''}</span>`;
    }
    if (s.artworkStatus === 'preset-mockup') {
      return `<span class="badge badge-info">Placeholder Preset — Replace</span>`;
    }
    return `<span class="badge badge-need">Artwork Needed</span>`;
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(pack.projectName)} — Graphic Designer Artwork Pack</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
    color: #0F172A;
    background: #FFFFFF;
    margin: 0;
    padding: 74px 40px 48px;
    line-height: 1.5;
  }
  .toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    background: rgba(15, 23, 42, 0.96);
    color: #F8FAFC;
    padding: 12px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 12px rgba(15, 23, 42, 0.16);
  }
  .toolbar-title {
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .toolbar-pill {
    background: #7C3AED;
    color: #FFFFFF;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border-radius: 999px;
    font-weight: 700;
  }
  .toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .tb-btn {
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.08);
    color: #FFFFFF;
    border-radius: 7px;
    padding: 7px 13px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .tb-btn:hover { background: rgba(255,255,255,0.18); }
  .tb-btn.primary {
    background: #FF4D2E;
    border-color: #FF4D2E;
  }
  .tb-btn.primary:hover { background: #E53E20; }

  .doc-wrap { max-width: 1080px; margin: 0 auto; }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #0F172A;
    padding-bottom: 16px;
    margin-bottom: 24px;
    gap: 16px;
  }
  .kicker {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #7C3AED;
    font-weight: 800;
    margin-bottom: 4px;
  }
  h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; }
  .subtitle { margin: 4px 0 0; font-size: 13.5px; color: #475569; }
  .meta { font-size: 12.5px; color: #475569; text-align: right; line-height: 1.6; }

  .hero-wrap {
    margin-bottom: 24px;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    overflow: hidden;
    background: #F8FAFC;
  }
  .hero-img { width: 100%; display: block; max-height: 440px; object-fit: cover; }
  .hero-caption {
    padding: 9px 14px;
    font-size: 11.5px;
    color: #64748B;
    border-top: 1px solid #E2E8F0;
    display: flex;
    justify-content: space-between;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 26px;
  }
  .kpi {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 9px;
    padding: 12px 14px;
  }
  .kpi-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748B; font-weight: 700; }
  .kpi-val { font-size: 20px; font-weight: 800; margin-top: 4px; color: #0F172A; }
  .kpi-sub { font-size: 11px; color: #64748B; margin-top: 2px; }

  h2 {
    font-size: 16px;
    margin: 28px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #E2E8F0;
    color: #0F172A;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .h2-note { font-size: 12px; font-weight: 500; color: #64748B; }

  .brand-box {
    display: grid;
    grid-template-columns: 1.35fr 1fr;
    gap: 16px;
    margin-bottom: 22px;
  }
  .panel {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .swatch-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
    gap: 10px;
  }
  .swatch-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 9px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .swatch-chip {
    width: 34px;
    height: 34px;
    border-radius: 7px;
    border: 1px solid rgba(15, 23, 42, 0.14);
    flex-shrink: 0;
  }
  .swatch-meta { font-size: 11px; line-height: 1.35; }
  .swatch-name { font-weight: 700; color: #0F172A; font-size: 12px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 18px; }
  th {
    text-align: left;
    padding: 9px 10px;
    background: #F1F5F9;
    border-bottom: 1.5px solid #CBD5E1;
    font-weight: 700;
    font-size: 11.5px;
    color: #334155;
  }
  td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; vertical-align: middle; }
  .num { text-align: right; font-family: ui-monospace, SFMono-Regular, monospace; }

  .badge {
    display: inline-block;
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .badge-ok { background: #DCFCE7; color: #166534; }
  .badge-warn { background: #FEF3C7; color: #92400E; }
  .badge-info { background: #E0F2FE; color: #075985; }
  .badge-need { background: #F3E8FF; color: #6B21A8; }
  .badge-backlit { background: #FEF9C3; color: #854D0E; margin-left: 4px; }
  .badge-screen { background: #DBEAFE; color: #1E40AF; margin-left: 4px; }

  .spec-cards { display: flex; flex-direction: column; gap: 16px; }
  .spec-card {
    border: 1px solid #CBD5E1;
    border-radius: 12px;
    overflow: hidden;
    background: #FFFFFF;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .spec-card-head {
    background: #F8FAFC;
    border-bottom: 1px solid #E2E8F0;
    padding: 11px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .spec-ref {
    display: inline-block;
    background: #0F172A;
    color: #FFFFFF;
    font-weight: 800;
    font-size: 12px;
    padding: 3px 9px;
    border-radius: 6px;
    margin-right: 8px;
  }
  .spec-title { font-size: 14.5px; font-weight: 800; color: #0F172A; }
  .spec-zone { font-size: 12.5px; color: #475569; margin-left: 6px; }
  .spec-body {
    display: grid;
    grid-template-columns: 290px 1fr;
    gap: 18px;
    padding: 16px;
    align-items: start;
  }
  .diagram-box {
    border: 1px solid #E2E8F0;
    border-radius: 9px;
    overflow: hidden;
    background: #F8FAFC;
  }
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 12px;
  }
  .metric-cell {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 7px;
    padding: 8px 10px;
  }
  .metric-k { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748B; font-weight: 700; }
  .metric-v { font-size: 13px; font-weight: 700; color: #0F172A; margin-top: 2px; }
  .filename-row {
    background: #F1F5F9;
    border: 1px dashed #94A3B8;
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 12px;
    margin-bottom: 10px;
    word-break: break-all;
  }
  .notes-list {
    margin: 0;
    padding-left: 18px;
    font-size: 12.5px;
    color: #334155;
  }
  .notes-list li { margin-bottom: 4px; }

  .checklist {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 12.5px;
  }
  .check-item strong { color: #0F172A; }

  .ref-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
  }
  .ref-card {
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    overflow: hidden;
    background: #FFFFFF;
  }
  .ref-thumb {
    height: 92px;
    background: #F1F5F9;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .ref-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .ref-info { padding: 8px 10px; font-size: 11px; color: #475569; }
  .ref-name { font-weight: 700; color: #0F172A; font-size: 12px; margin-bottom: 2px; word-break: break-word; }

  .footer {
    margin-top: 34px;
    padding-top: 12px;
    border-top: 1px solid #E2E8F0;
    font-size: 11px;
    color: #64748B;
    display: flex;
    justify-content: space-between;
  }

  @media (max-width: 780px) {
    body { padding: 86px 16px 32px; }
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .brand-box, .spec-body, .checklist { grid-template-columns: 1fr; }
    .metrics-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media print {
    .toolbar { display: none !important; }
    body { padding: 10px 14px; }
    .spec-card { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-title">
      <span class="toolbar-pill">Designer Handoff</span>
      <span>${escapeHtml(pack.projectName)} — Artwork Measurements &amp; Spec Pack</span>
    </div>
    <div class="toolbar-actions">
      <button class="tb-btn" id="btn-copy-summary" type="button">Copy Email / Slack Summary</button>
      <button class="tb-btn" id="btn-dl-csv" type="button">Download CSV Schedule</button>
      <button class="tb-btn primary" type="button" onclick="window.print()">Print / Save PDF</button>
    </div>
  </div>

  <div class="doc-wrap">
    <div class="header">
      <div>
        <div class="kicker">PilotStand — Graphic Designer Artwork Specification Pack</div>
        <h1>${escapeHtml(pack.projectName)}</h1>
        ${pack.brand.tagline ? `<p class="subtitle">${escapeHtml(pack.brand.tagline)}</p>` : ''}
      </div>
      <div class="meta">
        <div>Brand: <strong>${escapeHtml(pack.brand.name)}</strong></div>
        ${pack.brand.eventName ? `<div>Event: <strong>${escapeHtml(pack.brand.eventName)}</strong>${pack.brand.standNumber ? ` · Stand ${escapeHtml(pack.brand.standNumber)}` : ''}</div>` : ''}
        <div>Footprint: <strong>${escapeHtml(pack.standSummary.footprintLabel)}</strong> (${escapeHtml(pack.standSummary.openSidesLabel)})</div>
        <div>Generated: ${escapeHtml(generatedDate)}</div>
      </div>
    </div>

    ${
      snapshotDataUrl
        ? `<div class="hero-wrap">
             <img class="hero-img" src="${snapshotDataUrl}" alt="3D Exhibition Stand Reference Render" />
             <div class="hero-caption">
               <span>3D Spatial Reference Render — use this view to check sightlines, graphic continuity, and panel placement.</span>
               <span>Height Limit: ${escapeHtml(pack.standSummary.heightLimitLabel)}</span>
             </div>
           </div>`
        : ''
    }

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Branded Surfaces</div>
        <div class="kpi-val">${pack.standSummary.totalBrandedSurfaces}</div>
        <div class="kpi-sub">${pack.standSummary.printSurfaceCount} print · ${pack.standSummary.digitalScreenCount} screen</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Total Print Area</div>
        <div class="kpi-val">${pack.standSummary.totalPrintAreaM2.toFixed(2)} m²</div>
        <div class="kpi-sub">Visible trim area</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Backlit Units</div>
        <div class="kpi-val">${pack.standSummary.backlitCount}</div>
        <div class="kpi-sub">15 mm SEG bleed</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Mockups Placed</div>
        <div class="kpi-val">${pack.standSummary.uploadedMockupCount}</div>
        <div class="kpi-sub">Uploaded reference art</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Artwork Needed</div>
        <div class="kpi-val">${pack.standSummary.needsArtworkCount}</div>
        <div class="kpi-sub">New or hi-res rebuild</div>
      </div>
    </div>

    <h2>Brand Identity &amp; Print Color Guide <span class="h2-note">CMYK values are approximate — match Pantone / brand guidelines if supplied</span></h2>
    <div class="brand-box">
      <div class="panel">
        <div class="swatch-grid">
          ${pack.brand.palette
            .map(
              (c) => `<div class="swatch-card">
                <span class="swatch-chip" style="background:${escapeHtml(c.hex)}"></span>
                <div class="swatch-meta">
                  <div class="swatch-name">${escapeHtml(c.label)}</div>
                  <div class="mono">${escapeHtml(c.hex)}</div>
                  <div class="mono" style="color:#64748B">${escapeHtml(c.cmyk)}</div>
                </div>
              </div>`
            )
            .join('')}
        </div>
      </div>
      <div class="panel" style="font-size:12.5px;display:flex;flex-direction:column;gap:8px;">
        <div><strong>Display Font:</strong> ${escapeHtml(pack.brand.displayFont)}</div>
        <div><strong>Body Font:</strong> ${escapeHtml(pack.brand.bodyFont)}</div>
        ${pack.brand.websiteUrl ? `<div><strong>Website:</strong> ${escapeHtml(pack.brand.websiteUrl)}</div>` : ''}
        ${pack.brand.notes ? `<div><strong>Creative / Brand Notes:</strong><br/>${escapeHtml(pack.brand.notes)}</div>` : '<div style="color:#64748B;">No extra brand notes supplied. Follow brand guidelines for logo clear-space and typography.</div>'}
      </div>
    </div>

    <h2>Master Branded Asset Schedule <span class="h2-note">All physical measurements in millimetres (W × H)</span></h2>
    <table>
      <thead>
        <tr>
          <th>Ref</th>
          <th>Asset / Structure</th>
          <th>Zone</th>
          <th class="num">Visible Trim (mm)</th>
          <th class="num">Bleed</th>
          <th class="num">File Size w/ Bleed</th>
          <th>Format</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${
          pack.specs.length > 0
            ? pack.specs
                .map(
                  (s) => `<tr>
                    <td><strong class="mono">${escapeHtml(s.refCode)}</strong></td>
                    <td><strong>${escapeHtml(s.itemName)}</strong>${s.isBacklit && !s.isDigitalScreen ? '<span class="badge badge-backlit">Backlit</span>' : ''}${s.isDigitalScreen ? '<span class="badge badge-screen">Screen</span>' : ''}</td>
                    <td>${escapeHtml(s.surfaceLabel)}</td>
                    <td class="num">${s.widthMm} × ${s.heightMm}</td>
                    <td class="num">${s.isDigitalScreen ? '0 mm' : `+${s.bleedMm} mm`}</td>
                    <td class="num"><strong>${s.isDigitalScreen ? `${s.recommendedPixels.width}×${s.recommendedPixels.height} px` : `${s.totalWithBleedWidthMm} × ${s.totalWithBleedHeightMm} mm`}</strong></td>
                    <td>${escapeHtml(s.colorSpace)}</td>
                    <td>${renderStatusBadge(s)}</td>
                  </tr>`
                )
                .join('')
            : '<tr><td colspan="8">No branded surfaces are currently placed on this stand. Add walls, counters, lightboxes, or signage in PilotStand to generate artwork specs.</td></tr>'
        }
      </tbody>
    </table>

    ${
      pack.specs.length > 0
        ? `<h2>Individual Artwork Specification Cards <span class="h2-note">${pack.specs.length} deliverable${pack.specs.length === 1 ? '' : 's'} with scaled measurement diagrams</span></h2>
           <div class="spec-cards">
             ${pack.specs
               .map(
                 (s) => `<div class="spec-card">
                   <div class="spec-card-head">
                     <div>
                       <span class="spec-ref mono">${escapeHtml(s.refCode)}</span>
                       <span class="spec-title">${escapeHtml(s.itemName)}</span>
                       <span class="spec-zone">— ${escapeHtml(s.surfaceLabel)}</span>
                       ${s.isBacklit && !s.isDigitalScreen ? '<span class="badge badge-backlit">Backlit LED</span>' : ''}
                       ${s.isDigitalScreen ? '<span class="badge badge-screen">Digital Screen</span>' : ''}
                     </div>
                     <div>${renderStatusBadge(s)}</div>
                   </div>
                   <div class="spec-body">
                     <div class="diagram-box">${renderSurfaceDiagramSvg(s, pack.brand.name)}</div>
                     <div>
                       <div class="metrics-grid">
                         <div class="metric-cell">
                           <div class="metric-k">Visible Trim Size</div>
                           <div class="metric-v mono">${s.widthMm} × ${s.heightMm} mm</div>
                         </div>
                         <div class="metric-cell">
                           <div class="metric-k">${s.isDigitalScreen ? 'Target Pixel Canvas' : 'Artwork w/ Bleed'}</div>
                           <div class="metric-v mono">${s.isDigitalScreen ? `${s.recommendedPixels.width} × ${s.recommendedPixels.height} px` : `${s.totalWithBleedWidthMm} × ${s.totalWithBleedHeightMm} mm`}</div>
                         </div>
                         <div class="metric-cell">
                           <div class="metric-k">${s.isDigitalScreen ? 'Title-Safe Margin' : 'Bleed / Safe Zone'}</div>
                           <div class="metric-v mono">${s.isDigitalScreen ? '5% all edges' : `+${s.bleedMm} mm / -${s.safeZoneMm} mm`}</div>
                         </div>
                         <div class="metric-cell">
                           <div class="metric-k">Aspect / Area</div>
                           <div class="metric-v">${escapeHtml(s.aspectRatioLabel)} · ${s.areaM2.toFixed(2)} m²</div>
                         </div>
                         <div class="metric-cell">
                           <div class="metric-k">Color &amp; Resolution</div>
                           <div class="metric-v">${escapeHtml(s.colorSpace)} · ${s.recommendedDpi} DPI</div>
                         </div>
                         <div class="metric-cell">
                           <div class="metric-k">Delivery Format</div>
                           <div class="metric-v">${escapeHtml(s.fileFormat)}</div>
                         </div>
                       </div>

                       <div class="filename-row">
                         <strong>Suggested Filename:</strong> <span class="mono">${escapeHtml(s.suggestedFilename)}</span>
                       </div>

                       ${
                         s.assignedAsset
                           ? `<div style="font-size:12px;margin-bottom:8px;color:#334155;">
                                <strong>Current Reference Graphic:</strong> ${escapeHtml(s.assignedAsset.name)}
                                <span class="mono" style="color:#64748B;">(${s.assignedAsset.width}×${s.assignedAsset.height}px${s.assignedAsset.effectiveDpi ? ` · ~${s.assignedAsset.effectiveDpi} DPI at trim` : ''} · fit: ${escapeHtml(s.fit)})</span>
                              </div>`
                           : ''
                       }

                       <ul class="notes-list">
                         ${s.productionNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
                       </ul>
                     </div>
                   </div>
                 </div>`
               )
               .join('')}
           </div>`
        : ''
    }

    ${
      pack.referencedAssets.length > 0
        ? `<h2>Reference Brand Assets Placed in 3D Mockup <span class="h2-note">${pack.referencedAssets.length} unique asset${pack.referencedAssets.length === 1 ? '' : 's'}</span></h2>
           <div class="ref-gallery">
             ${pack.referencedAssets
               .map(
                 (r) => `<div class="ref-card">
                   <div class="ref-thumb"><img src="${escapeHtml(r.asset.dataUrl)}" alt="${escapeHtml(r.asset.name)}" /></div>
                   <div class="ref-info">
                     <div class="ref-name">${escapeHtml(r.asset.name)}</div>
                     <div class="mono">${r.asset.width}×${r.asset.height}px</div>
                     <div>Used on: <strong>${escapeHtml(r.usedByRefs.join(', '))}</strong></div>
                   </div>
                 </div>`
               )
               .join('')}
           </div>`
        : ''
    }

    <h2>Pre-Flight &amp; Artwork Delivery Checklist</h2>
    <div class="checklist">
      <div class="check-item"><strong>1. Scale &amp; Resolution:</strong> Supply print artwork at 100% scale (150 DPI min for walls/banners, 300 DPI for counters) or at 1:10 scale at 1500 DPI.</div>
      <div class="check-item"><strong>2. Color Profile:</strong> Convert all print files to CMYK (ISO Coated v2 / FOGRA39 or GRACoL). Keep digital screen slides/videos in sRGB.</div>
      <div class="check-item"><strong>3. Fonts &amp; Links:</strong> Convert all text to outlines/curves and embed all linked raster imagery before exporting PDF/X-4.</div>
      <div class="check-item"><strong>4. Bleed &amp; Safe Zone:</strong> Extend background colors/photos to the outer bleed line; keep logos, QR codes, and copy inside the safe zone.</div>
    </div>

    <div class="footer">
      <span>Generated in <strong>PilotStand</strong> — 3D Exhibition Stand Planner</span>
      <span>Artwork Reference Pack · ${escapeHtml(pack.projectName)}</span>
    </div>
  </div>

  <script>
    (function () {
      var csvData = ${embeddedCsvJson};
      var summaryData = ${embeddedSummaryJson};
      var dlBtn = document.getElementById('btn-dl-csv');
      if (dlBtn) {
        dlBtn.addEventListener('click', function () {
          var blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = '${safeFileSlug}-designer-artwork-specs.csv';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });
      }
      var copyBtn = document.getElementById('btn-copy-summary');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(summaryData).then(function () {
              copyBtn.textContent = 'Copied Summary!';
              setTimeout(function () { copyBtn.textContent = 'Copy Email / Slack Summary'; }, 2000);
            });
          }
        });
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Open the Graphic Designer Artwork Specification Pack in a new tab (with .html download fallback).
 */
export function exportDesignerBriefHtml(
  projectName: string,
  config: StandConfig,
  items: StandItem[],
  assetsMap: Map<string, BrandAsset>,
  snapshotDataUrl: string | null
): DesignerSpecPack {
  const pack = buildDesignerSpecPack(projectName, config, items, assetsMap);
  const html = buildDesignerBriefHtml(pack, snapshotDataUrl);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugifyFilenamePart(projectName)}-designer-artwork-pack.html`;
    a.click();
  }
  return pack;
}

/**
 * Trigger an immediate download of the CSV Artwork Measurement Schedule for graphic designers.
 */
export function downloadDesignerSpecCsv(
  projectName: string,
  config: StandConfig,
  items: StandItem[],
  assetsMap: Map<string, BrandAsset>
): DesignerSpecPack {
  const pack = buildDesignerSpecPack(projectName, config, items, assetsMap);
  const csv = buildDesignerSpecCsv(pack);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugifyFilenamePart(projectName)}-designer-artwork-specs.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return pack;
}
