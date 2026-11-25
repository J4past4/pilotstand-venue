import type { OpenSides } from '../types/stand';
import type {
  ExhibitionVenue,
  StandCustomBrand,
  VenueStand,
  VenueStandStatus,
  VenueZone,
} from '../types/venue';
import { getExhibitorBrandProfile } from '../data/exhibitorBrands';

export const SAMPLE_CSV_TEMPLATE = `stand_id,zone,x,z,width,depth,status,exhibitor_name,sector,open_sides,price_per_sqm,website
A10,Main Pavilion,4,6,8,6,sold,Siemens Energy,Automation & Machinery,4,520,https://www.siemens-energy.com
A12,Main Pavilion,16,6,6,4,available,,Sustainable Packaging,3,495,
A14,Main Pavilion,26,6,6,4,available,,Robotics & Automation,3,495,
A16,Main Pavilion,36,6,8,6,sold,ABB Robotics,Robotics & Automation,4,520,https://new.abb.com
B10,Innovation Zone,4,18,6,4,sold,Schneider Electric,Smart Packaging,2,475,https://www.se.com
B12,Innovation Zone,14,18,6,4,available,,CleanTech,2,465,
B14,Innovation Zone,24,18,8,4,reserved,Octopus Energy,CleanTech,3,490,
B16,Innovation Zone,36,18,6,4,available,,Sustainable Packaging,2,465,
S01,Main Pavilion,18,28,14,6,feature,Keynote Arena,Main Stage,4,0,`;

const ZONE_COLOR_POOL = [
  { carpet: '#bae6fd', border: '#0284c7', accent: '#0284c7' },
  { carpet: '#cce8b5', border: '#65a30d', accent: '#65a30d' },
  { carpet: '#f6a5d4', border: '#db2777', accent: '#ec4899' },
  { carpet: '#e2d4f0', border: '#9333ea', accent: '#9333ea' },
  { carpet: '#fde68a', border: '#d97706', accent: '#d97706' },
];

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'main-hall';
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function normalizeStatus(raw: string): VenueStandStatus {
  const s = raw.trim().toLowerCase();
  if (s === 'sold' || s === 'booked' || s === 'confirmed') return 'sold';
  if (s === 'reserved' || s === 'hold' || s === 'option') return 'reserved';
  if (s === 'feature' || s === 'stage' || s === 'lounge') return 'feature';
  return 'available';
}

export interface VenueImportMeta {
  name: string;
  edition: string;
  organizer: string;
  venueLocation: string;
  hallName: string;
  primaryColor?: string;
  accentColor?: string;
}

export function parseVenueCsv(csvText: string, meta: VenueImportMeta): ExhibitionVenue {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error('CSV must contain a header row and at least one stand row.');
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const col = (name: string) => headers.indexOf(name);

  const idIdx = col('stand_id');
  const xIdx = col('x');
  const zIdx = col('z');
  const wIdx = col('width');
  const dIdx = col('depth');
  if (idIdx < 0 || xIdx < 0 || zIdx < 0 || wIdx < 0 || dIdx < 0) {
    throw new Error('CSV requires columns: stand_id, x, z, width, depth');
  }

  const zoneIdx = col('zone');
  const statusIdx = col('status');
  const nameIdx = col('exhibitor_name');
  const sectorIdx = col('sector');
  const openIdx = col('open_sides');
  const priceIdx = col('price_per_sqm');
  const webIdx = col('website');

  const stands: VenueStand[] = [];
  const zoneBuckets = new Map<
    string,
    { name: string; minX: number; minZ: number; maxX: number; maxZ: number }
  >();

  let maxHallX = 50;
  let maxHallZ = 40;

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const id = cells[idIdx]?.trim();
    if (!id) continue;

    const x = Math.max(1, Number(cells[xIdx]) || 2);
    const z = Math.max(1, Number(cells[zIdx]) || 2);
    const width = Math.max(2, Number(cells[wIdx]) || 4);
    const depth = Math.max(2, Number(cells[dIdx]) || 3);
    const zoneName = (zoneIdx >= 0 && cells[zoneIdx]) || 'Main Exhibition Hall';
    const zoneId = slugify(zoneName);
    const status = normalizeStatus(statusIdx >= 0 ? cells[statusIdx] || 'available' : 'available');
    const exhibitorName = nameIdx >= 0 && cells[nameIdx] ? cells[nameIdx] : undefined;
    const sector = sectorIdx >= 0 && cells[sectorIdx] ? cells[sectorIdx] : undefined;
    const rawOpen = openIdx >= 0 ? Number(cells[openIdx]) : 2;
    const openSides = (Math.min(4, Math.max(1, Math.round(rawOpen || 2))) as OpenSides);
    const pricePerSqmGbp = priceIdx >= 0 && Number(cells[priceIdx]) > 0 ? Number(cells[priceIdx]) : 475;
    const website = webIdx >= 0 && cells[webIdx] ? cells[webIdx] : undefined;

    maxHallX = Math.max(maxHallX, x + width + 8);
    maxHallZ = Math.max(maxHallZ, z + depth + 8);

    const bucket = zoneBuckets.get(zoneId);
    if (!bucket) {
      zoneBuckets.set(zoneId, {
        name: zoneName,
        minX: Math.max(0, x - 3),
        minZ: Math.max(0, z - 3),
        maxX: x + width + 3,
        maxZ: z + depth + 3,
      });
    } else {
      bucket.minX = Math.min(bucket.minX, Math.max(0, x - 3));
      bucket.minZ = Math.min(bucket.minZ, Math.max(0, z - 3));
      bucket.maxX = Math.max(bucket.maxX, x + width + 3);
      bucket.maxZ = Math.max(bucket.maxZ, z + depth + 3);
    }

    const baseBrand =
      status === 'sold' && website
        ? getExhibitorBrandProfile(exhibitorName, sector)
        : undefined;

    stands.push({
      id,
      zoneId,
      x,
      z,
      width,
      depth,
      status,
      exhibitorName,
      sector,
      openSides,
      pricePerSqmGbp,
      customBrand:
        baseBrand && website
          ? {
              primaryColor: baseBrand.primaryColor,
              accentColor: baseBrand.accentColor,
              tagline: baseBrand.tagline,
              website,
            }
          : undefined,
    });
  }

  if (stands.length === 0) {
    throw new Error('No valid stand rows were found in the CSV.');
  }

  const zones: VenueZone[] = Array.from(zoneBuckets.entries()).map(([id, b], idx) => {
    const palette = ZONE_COLOR_POOL[idx % ZONE_COLOR_POOL.length];
    return {
      id,
      name: b.name,
      shortName: b.name,
      carpetColor: palette.carpet,
      borderColor: palette.border,
      accentColor: palette.accent,
      description: `${b.name} exhibition zone`,
      regions: [
        {
          x: b.minX,
          z: b.minZ,
          width: Math.max(10, b.maxX - b.minX),
          depth: Math.max(10, b.maxZ - b.minZ),
        },
      ],
      labelPos: { x: (b.minX + b.maxX) / 2, z: b.minZ + 2 },
    };
  });

  const widthM = Math.ceil(maxHallX);
  const depthM = Math.ceil(maxHallZ);

  return {
    id: `custom-${slugify(meta.name)}-${Date.now().toString(36)}`,
    name: meta.name.trim() || 'Custom Exhibition',
    edition: meta.edition.trim() || '2026',
    organizer: meta.organizer.trim() || 'Exhibition Organiser',
    venueLocation: meta.venueLocation.trim() || 'London, UK',
    hallName: meta.hallName.trim() || 'Main Hall',
    issueNumber: '1.0',
    issueDate: new Date().toISOString().slice(0, 10),
    widthM,
    depthM,
    ceilingHeightM: 10.0,
    currency: 'GBP',
    defaultPricePerSqmGbp: 475,
    shellSchemeSurchargePerSqmGbp: 85,
    brandTheme: {
      organizerName: meta.organizer.trim() || 'Exhibition Organiser',
      primaryColor: meta.primaryColor || '#111315',
      accentColor: meta.accentColor || '#ff4d2e',
      badgeText: 'VENUE',
    },
    zones,
    stands,
    pillars: [
      {
        id: 'P-1',
        label: 'Hall Column C1 (1.2m × 1.2m)',
        x: Math.round(widthM * 0.35),
        z: Math.round(depthM * 0.45),
        width: 1.2,
        depth: 1.2,
        heightM: 10.0,
      },
      {
        id: 'P-2',
        label: 'Hall Column C2 (1.2m × 1.2m)',
        x: Math.round(widthM * 0.68),
        z: Math.round(depthM * 0.45),
        width: 1.2,
        depth: 1.2,
        heightM: 10.0,
      },
    ],
    entrances: [
      {
        id: 'ent-main',
        label: 'Main Visitors Entrance',
        x: widthM - 2,
        z: Math.round(depthM * 0.5),
        direction: 'west',
        widthM: 8,
      },
    ],
    amenities: [
      {
        id: 'wc-main',
        kind: 'toilets',
        label: 'Main Concourse Toilets (WC)',
        x: widthM - 5,
        z: 2,
        width: 4,
        depth: 2.5,
      },
      {
        id: 'cafe-main',
        kind: 'catering',
        label: 'Exhibitor Coffee Lounge',
        x: 2,
        z: depthM - 5,
        width: 5,
        depth: 3,
      },
    ],
    aisleLabels: [],
  };
}

export function parseVenueJson(jsonText: string): ExhibitionVenue {
  const parsed = JSON.parse(jsonText) as Partial<ExhibitionVenue>;
  if (!parsed || !parsed.name || !Array.isArray(parsed.stands) || !Array.isArray(parsed.zones)) {
    throw new Error('Invalid venue JSON: expected name, zones[], and stands[].');
  }
  return parsed as ExhibitionVenue;
}

/** Second pre-built demo venue showing multi-show white-label versatility */
export const EXCEL_LONDON_CLEANTECH_VENUE: ExhibitionVenue = {
  id: 'excel-london-cleantech-2026',
  name: 'CleanTech & Advanced Manufacturing',
  edition: '2026',
  organizer: 'Informa / ExCeL Events',
  venueLocation: 'ExCeL London, E16 1XL',
  hallName: 'Halls S4–S6 (Boulevard South)',
  issueNumber: '204',
  issueDate: '12 Nov 2026',
  widthM: 76,
  depthM: 58,
  ceilingHeightM: 10.0,
  currency: 'GBP',
  defaultPricePerSqmGbp: 520,
  shellSchemeSurchargePerSqmGbp: 95,
  brandTheme: {
    organizerName: 'CleanTech Expo',
    primaryColor: '#064e3b',
    accentColor: '#10b981',
    badgeText: 'EXCEL LONDON',
  },
  zones: [
    {
      id: 'clean-energy',
      name: 'Clean Energy & Grid',
      shortName: 'Clean Energy',
      carpetColor: '#cce8b5',
      borderColor: '#15803d',
      accentColor: '#16a34a',
      description: 'Battery storage, hydrogen, solar microgrids & industrial electrification.',
      regions: [{ x: 0, z: 0, width: 38, depth: 56 }],
      labelPos: { x: 19, z: 4 },
    },
    {
      id: 'smart-factory',
      name: 'Smart Factory & Robotics',
      shortName: 'Smart Factory',
      carpetColor: '#bae6fd',
      borderColor: '#0284c7',
      accentColor: '#0284c7',
      description: 'Industrial cobots, digital twins, AI vision inspection & automated logistics.',
      regions: [{ x: 38, z: 0, width: 36, depth: 56 }],
      labelPos: { x: 56, z: 4 },
    },
  ],
  stands: [
    { id: 'S100', zoneId: 'clean-energy', x: 4, z: 8, width: 8, depth: 6, status: 'sold', exhibitorName: 'Siemens Energy', sector: 'Automation & Machinery', openSides: 4, customBrand: { primaryColor: '#4c1d95', accentColor: '#c084fc', tagline: 'Energizing Society — Net-Zero Industrial Grids', website: 'https://www.siemens-energy.com' } },
    { id: 'S104', zoneId: 'clean-energy', x: 16, z: 8, width: 6, depth: 6, status: 'available', openSides: 4, pricePerSqmGbp: 560, notes: 'Prime 36m² Island opposite Keynote Arena.' },
    { id: 'S108', zoneId: 'clean-energy', x: 26, z: 8, width: 8, depth: 6, status: 'sold', exhibitorName: 'Octopus Energy Tech', sector: 'Sustainable Packaging', openSides: 3, customBrand: { primaryColor: '#180048', accentColor: '#f472b6', tagline: 'Kraken Smart Grid & Green Industrial Power', website: 'https://octopus.energy' } },
    { id: 'S200', zoneId: 'smart-factory', x: 42, z: 8, width: 8, depth: 6, status: 'sold', exhibitorName: 'ABB Robotics', sector: 'Robotics & Automation', openSides: 4, customBrand: { primaryColor: '#111827', accentColor: '#ef4444', tagline: 'Autonomous Mobile Robots & Smart Cells', website: 'https://new.abb.com/products/robotics' } },
    { id: 'S204', zoneId: 'smart-factory', x: 54, z: 8, width: 6, depth: 6, status: 'available', openSides: 3, pricePerSqmGbp: 545 },
    { id: 'S208', zoneId: 'smart-factory', x: 63, z: 8, width: 6, depth: 6, status: 'available', openSides: 2, pricePerSqmGbp: 530 },

    { id: 'S120', zoneId: 'clean-energy', x: 4, z: 20, width: 14, depth: 8, status: 'feature', exhibitorName: 'Net-Zero Keynote Arena', sponsor: 'UK CleanTech Council', openSides: 4 },
    { id: 'S124', zoneId: 'clean-energy', x: 22, z: 20, width: 6, depth: 4, status: 'available', openSides: 3, pricePerSqmGbp: 540 },
    { id: 'S126', zoneId: 'clean-energy', x: 22, z: 24, width: 6, depth: 4, status: 'sold', exhibitorName: 'Schneider Electric', sector: 'Automation & Machinery', openSides: 3, customBrand: { primaryColor: '#006a38', accentColor: '#3dcd58', tagline: 'EcoStruxure™ Industrial Sustainability', website: 'https://www.se.com' } },
    { id: 'S220', zoneId: 'smart-factory', x: 42, z: 20, width: 8, depth: 4, status: 'available', openSides: 4, pricePerSqmGbp: 555, notes: 'High-visibility Boulevard-facing island plot.' },
    { id: 'S224', zoneId: 'smart-factory', x: 54, z: 20, width: 6, depth: 8, status: 'sold', exhibitorName: 'Fanuc UK', sector: 'Robotics & Automation', openSides: 3, customBrand: { primaryColor: '#1f2937', accentColor: '#facc15', tagline: 'Factory Automation, CNC & Industrial Robots', website: 'https://www.fanuc.eu' } },
    { id: 'S228', zoneId: 'smart-factory', x: 63, z: 20, width: 6, depth: 4, status: 'reserved', exhibitorName: 'KUKA Robotics', openSides: 2 },

    { id: 'S140', zoneId: 'clean-energy', x: 4, z: 34, width: 6, depth: 5, status: 'available', openSides: 2, pricePerSqmGbp: 510 },
    { id: 'S142', zoneId: 'clean-energy', x: 14, z: 34, width: 6, depth: 5, status: 'available', openSides: 3, pricePerSqmGbp: 520 },
    { id: 'S144', zoneId: 'clean-energy', x: 24, z: 34, width: 8, depth: 5, status: 'sold', exhibitorName: 'ITM Power', sector: 'Sustainable Packaging', openSides: 3, customBrand: { primaryColor: '#0c4a6e', accentColor: '#38bdf8', tagline: 'PEM Electrolyser Green Hydrogen Systems', website: 'https://itm-power.com' } },
    { id: 'S240', zoneId: 'smart-factory', x: 42, z: 34, width: 12, depth: 8, status: 'feature', exhibitorName: 'VIP Investor & Buyer Lounge', sponsor: 'ExCeL London', openSides: 4 },
    { id: 'S244', zoneId: 'smart-factory', x: 58, z: 34, width: 8, depth: 5, status: 'available', openSides: 3, pricePerSqmGbp: 535 },
  ],
  pillars: [
    { id: 'EX-C1', label: 'ExCeL Column S4-A (1.2m × 1.2m)', x: 35.5, z: 16, width: 1.2, depth: 1.2, heightM: 10 },
    { id: 'EX-C2', label: 'ExCeL Column S5-B (1.2m × 1.2m)', x: 35.5, z: 32, width: 1.2, depth: 1.2, heightM: 10 },
  ],
  entrances: [
    { id: 'ent-s4', label: 'Boulevard Entrance S4 (West DLR)', x: 74, z: 16, direction: 'west', widthM: 8 },
    { id: 'ent-s6', label: 'Boulevard Entrance S6 (Elizabeth Line)', x: 74, z: 36, direction: 'west', widthM: 8 },
  ],
  amenities: [
    { id: 'ex-wc-1', kind: 'toilets', label: 'ExCeL Boulevard Toilets (WC)', x: 68, z: 1, width: 4.5, depth: 2.2 },
    { id: 'ex-cafe-1', kind: 'catering', label: 'Boulevard Coffee & Deli', x: 68, z: 48, width: 5, depth: 3.5 },
    { id: 'ex-info-1', kind: 'info', label: 'Organiser & Media Desk', x: 68, z: 25, width: 3.5, depth: 3.5 },
  ],
  aisleLabels: [
    { id: 'ex-a1', x: 38, z: 17, widthM: 6, orientation: 'horizontal' },
    { id: 'ex-a2', x: 38, z: 31, widthM: 6, orientation: 'horizontal' },
  ],
};

export interface BrandEnrichResult extends StandCustomBrand {
  company: string;
  source: 'live-scrape' | 'curated-fallback';
}

/**
 * Fetches real brand name, tagline & theme color from an exhibitor's website via /api/enrich-exhibitor,
 * falling back cleanly to curated/domain brand inference in offline/local dev environments.
 */
export async function enrichExhibitorFromWebsite(
  rawUrl: string,
  fallbackName?: string
): Promise<BrandEnrichResult> {
  const cleanUrl = rawUrl.trim().startsWith('http')
    ? rawUrl.trim()
    : `https://${rawUrl.trim()}`;

  try {
    const resp = await fetch('/api/enrich-exhibitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl }),
    });
    if (resp.ok) {
      const data = (await resp.json()) as Partial<BrandEnrichResult>;
      if (data.company && data.primaryColor) {
        return {
          company: data.company,
          tagline: data.tagline || `${data.company} Official Showcase`,
          primaryColor: data.primaryColor,
          accentColor: data.accentColor || '#38bdf8',
          website: data.website || cleanUrl,
          source: 'live-scrape',
        };
      }
    }
  } catch {
    // Fallback below when running locally without Vercel serverless functions
  }

  let hostLabel = fallbackName || 'Exhibitor';
  try {
    const u = new URL(cleanUrl);
    const bare = u.hostname.replace(/^www\./i, '').split('.')[0] || hostLabel;
    hostLabel = bare.charAt(0).toUpperCase() + bare.slice(1);
  } catch {
    // keep fallback
  }

  const curated = getExhibitorBrandProfile(fallbackName || hostLabel);
  return {
    company: curated.company || hostLabel,
    tagline: curated.tagline,
    primaryColor: curated.primaryColor,
    accentColor: curated.accentColor,
    website: cleanUrl,
    source: 'curated-fallback',
  };
}
