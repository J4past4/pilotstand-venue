import type {
  BrandAsset,
  BrandFontPairing,
  BrandKitSetupResult,
  StandConfig,
  StandItem,
  StandTemplate,
  SurfaceArtwork,
} from '../types/stand';
import { instantiateTemplate } from '../data/templates';

export const BRAND_FONT_PAIRINGS: BrandFontPairing[] = [
  {
    id: 'architectural',
    label: 'Plus Jakarta + Inter',
    styleTag: 'Architectural Studio',
    displayFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
  },
  {
    id: 'precision',
    label: 'Space Grotesk + IBM Plex',
    styleTag: 'Precision Engineering',
    displayFont: 'Space Grotesk',
    bodyFont: 'IBM Plex Sans',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap',
  },
  {
    id: 'editorial',
    label: 'Playfair + Source Sans',
    styleTag: 'Editorial Luxury',
    displayFont: 'Playfair Display',
    bodyFont: 'Source Sans 3',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Source+Sans+3:wght@400;500;600&display=swap',
  },
  {
    id: 'avant-garde',
    label: 'Syne + DM Sans',
    styleTag: 'Avant-Garde Brand',
    displayFont: 'Syne',
    bodyFont: 'DM Sans',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Syne:wght@600;700;800&display=swap',
  },
  {
    id: 'contemporary',
    label: 'Outfit + Manrope',
    styleTag: 'Clean Contemporary',
    displayFont: 'Outfit',
    bodyFont: 'Manrope',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&family=Outfit:wght@500;600;700;800&display=swap',
  },
  {
    id: 'commercial',
    label: 'Montserrat + Open Sans',
    styleTag: 'Bold Commercial',
    displayFont: 'Montserrat',
    bodyFont: 'Open Sans',
    googleFontsHref:
      'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Open+Sans:wght@400;500;600&display=swap',
  },
];

const loadedFontLinks = new Set<string>();

export function ensureGoogleFontPairingLoaded(displayFont?: string, bodyFont?: string): void {
  if (typeof document === 'undefined') return;
  const match = BRAND_FONT_PAIRINGS.find(
    (p) => p.displayFont === displayFont || p.bodyFont === bodyFont
  );
  if (!match?.googleFontsHref || loadedFontLinks.has(match.googleFontsHref)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = match.googleFontsHref;
  document.head.appendChild(link);
  loadedFontLinks.add(match.googleFontsHref);
}

export async function registerCustomFontFile(file: File): Promise<string> {
  const cleanBase = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim();
  const familyName = cleanBase || 'Custom Brand Font';
  const buffer = await file.arrayBuffer();
  const face = new FontFace(familyName, buffer);
  await face.load();
  document.fonts.add(face);
  return familyName;
}

const DEFAULT_FAVICON_HREF =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231B365D'/%3E%3Cpath d='M7 22V11L16 6.5L25 11V22L16 26.5L7 22Z' stroke='%23FFFFFF' stroke-width='2.2' fill='none' stroke-linejoin='round'/%3E%3Cpath d='M16 15.5L25 11M16 15.5L7 11M16 15.5V26.5' stroke='%23D95D39' stroke-width='2' fill='none' stroke-linejoin='round'/%3E%3C/svg%3E";

export function applyDocumentFavicon(dataUrl: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = dataUrl || DEFAULT_FAVICON_HREF;
}

export function readBrandImageFile(
  file: File,
  preferredCategory?: BrandAsset['category']
): Promise<BrandAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        resolve({
          id: `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          dataUrl,
          width: img.naturalWidth || 1000,
          height: img.naturalHeight || 1000,
          kind: 'uploaded',
          category:
            preferredCategory ||
            (file.type.includes('svg') || file.type.includes('png') ? 'logo' : 'banner'),
        });
      };
      img.onerror = () => {
        resolve({
          id: `asset-${Date.now().toString(36)}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          dataUrl,
          width: 1000,
          height: 1000,
          kind: 'uploaded',
          category: preferredCategory || 'banner',
        });
      };
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function makeSurfaceArt(
  assetId: string | null,
  fit: SurfaceArtwork['fit'],
  bgColor: string,
  scale = 1,
  emissive = false
): SurfaceArtwork {
  return {
    assetId,
    fit,
    scale,
    offsetX: 0,
    offsetY: 0,
    bgColor,
    emissive,
  };
}

/**
 * Instantiates a flagship stand template and applies the user's Brand Kit
 * (colours, typography, uploaded logo/hero/screen imagery, and event metadata)
 * across every brandable 3D surface.
 */
export function buildBrandedStandFromSetup(
  template: StandTemplate,
  setup: BrandKitSetupResult
): {
  config: StandConfig;
  items: StandItem[];
  uploadedAssets: BrandAsset[];
  projectTitle: string;
} {
  const inst = instantiateTemplate(template);

  const config: StandConfig = {
    ...inst.config,
    brandName: setup.brandName.trim() || 'YOUR BRAND',
    brandTagline: setup.brandTagline.trim() || 'Flagship Exhibition Pavilion',
    primaryColor: setup.primaryColor,
    accentColor: setup.accentColor,
    wallColor: setup.wallColor,
    floorMaterial: setup.floorMaterial,
    floorColor: setup.floorColor,
    lightingPreset: setup.lightingPreset,
    displayFont: setup.displayFont || 'Plus Jakarta Sans',
    bodyFont: setup.bodyFont || 'Inter',
    faviconDataUrl: setup.faviconDataUrl,
    websiteUrl: setup.websiteUrl.trim(),
    eventName: setup.eventName.trim(),
    standNumber: setup.standNumber.trim(),
    brandNotes: setup.brandNotes.trim(),
  };

  const logoId = setup.logoAsset?.id ?? null;
  const heroId = setup.heroAsset?.id ?? null;
  const screenId = setup.screenAsset?.id ?? heroId ?? null;

  const items: StandItem[] = inst.items.map((item) => {
    const nextArt: Record<string, SurfaceArtwork> = { ...item.artwork };

    switch (item.catalogId) {
      case 'hanging-ring':
        nextArt.ring = makeSurfaceArt(logoId, 'contain', setup.primaryColor, 0.78, true);
        break;
      case 'hanging-cube':
        nextArt.sides = makeSurfaceArt(logoId, 'contain', setup.primaryColor, 0.82, true);
        break;
      case 'front-arch':
        nextArt.fascia = makeSurfaceArt(logoId, 'contain', setup.primaryColor, 0.82, false);
        nextArt['pillar-left'] = makeSurfaceArt(heroId, 'cover', setup.primaryColor, 1, false);
        nextArt['pillar-right'] = makeSurfaceArt(heroId, 'cover', setup.primaryColor, 1, false);
        break;
      case 'led-video-wall':
        nextArt.screen = makeSurfaceArt(screenId, 'cover', '#0F172A', 1, true);
        break;
      case 'tv-stand':
        nextArt.screen = makeSurfaceArt(screenId, 'cover', '#0F172A', 1, true);
        break;
      case 'seg-lightbox':
        nextArt.front = makeSurfaceArt(heroId, 'cover', setup.primaryColor, 1, true);
        break;
      case 'storage-cabin':
        nextArt.front = makeSurfaceArt(heroId, 'cover', setup.primaryColor, 1, false);
        nextArt.side = makeSurfaceArt(logoId, 'contain', setup.primaryColor, 0.75, false);
        break;
      case 'reception-desk':
      case 'quickfold-counter':
        nextArt.front = makeSurfaceArt(logoId, 'contain', setup.primaryColor, 0.82, false);
        break;
      case 'demo-kiosk':
      case 'display-plinth':
        nextArt.front = makeSurfaceArt(logoId, 'contain', setup.primaryColor, 0.78, false);
        break;
      case 'brand-totem':
        nextArt.front = makeSurfaceArt(heroId || logoId, heroId ? 'cover' : 'contain', setup.primaryColor, heroId ? 1 : 0.8, true);
        break;
      case 'popup-wall-curved':
      case 'popup-wall-straight':
        nextArt.front = makeSurfaceArt(heroId, 'cover', setup.primaryColor, 1, false);
        break;
      default:
        break;
    }

    return {
      ...item,
      artwork: nextArt,
    };
  });

  const uploadedAssets: BrandAsset[] = [];
  const seenIds = new Set<string>();
  const addUnique = (a: BrandAsset | null) => {
    if (a && !seenIds.has(a.id)) {
      seenIds.add(a.id);
      uploadedAssets.push(a);
    }
  };
  addUnique(setup.logoAsset);
  addUnique(setup.heroAsset);
  addUnique(setup.screenAsset);
  setup.extraAssets.forEach(addUnique);

  const eventPrefix = setup.eventName.trim() ? `${setup.eventName.trim()} — ` : '';
  const projectTitle = `${eventPrefix}${config.brandName} Flagship Pavilion`;

  return { config, items, uploadedAssets, projectTitle };
}
