import { CATALOG_MAP } from '../data/catalog';
import type {
  ComplianceReport,
  CurrencyCode,
  MeasurementUnit,
  StandConfig,
  StandItem,
} from '../types/stand';

const CURRENCY_RATE: Record<CurrencyCode, { symbol: string; rate: number }> = {
  GBP: { symbol: '£', rate: 1 },
  USD: { symbol: '$', rate: 1.28 },
  EUR: { symbol: '€', rate: 1.18 },
};

export function formatMoney(amountGbp: number, currency: CurrencyCode): string {
  const { symbol, rate } = CURRENCY_RATE[currency];
  const converted = Math.round(amountGbp * rate);
  return `${symbol}${converted.toLocaleString('en-US')}`;
}

export function formatLength(meters: number, unit: MeasurementUnit): string {
  if (unit === 'ft') {
    const feet = meters * 3.28084;
    return `${feet.toFixed(1)} ft`;
  }
  return `${meters.toFixed(2).replace(/\.00$/, '')} m`;
}

export function formatArea(m2: number, unit: MeasurementUnit): string {
  if (unit === 'ft') {
    return `${Math.round(m2 * 10.7639)} sq ft`;
  }
  return `${m2.toFixed(1).replace(/\.0$/, '')} m²`;
}

export function computeItemFootprintBounds(item: StandItem): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
} {
  const rad = (item.rotationY * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (item.dims.w * cos + item.dims.d * sin) / 2;
  const halfD = (item.dims.w * sin + item.dims.d * cos) / 2;
  return {
    minX: item.x - halfW,
    maxX: item.x + halfW,
    minZ: item.z - halfD,
    maxZ: item.z + halfD,
    maxY: item.y + item.dims.h,
  };
}

export function evaluateCompliance(config: StandConfig, items: StandItem[]): ComplianceReport {
  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  const tolerance = 0.04;

  const outOfBoundsIds: string[] = [];
  const overHeightIds: string[] = [];
  let occupiedAreaM2 = 0;
  let totalPrintAreaM2 = 0;

  for (const item of items) {
    if (item.visible === false) continue;
    const def = CATALOG_MAP[item.catalogId];
    const bounds = computeItemFootprintBounds(item);

    if (
      bounds.minX < -halfW - tolerance ||
      bounds.maxX > halfW + tolerance ||
      bounds.minZ < -halfD - tolerance ||
      bounds.maxZ > halfD + tolerance
    ) {
      outOfBoundsIds.push(item.id);
    }

    if (bounds.maxY > config.heightLimit + 0.02) {
      overHeightIds.push(item.id);
    }

    // Only count floor-standing items toward floor footprint occupancy
    if (item.y < 1.5) {
      occupiedAreaM2 += item.dims.w * item.dims.d;
    }

    if (def && def.printAreaM2 > 0) {
      const scaleFactor =
        (item.dims.w * item.dims.h) /
        Math.max(0.01, def.defaultDims.w * def.defaultDims.h);
      totalPrintAreaM2 += def.printAreaM2 * scaleFactor;
    }
  }

  // Add shell wall branded graphics print area if custom artwork applied
  if (config.showShellWalls) {
    if (config.shellArtwork.back?.assetId) {
      totalPrintAreaM2 += config.width * config.shellWallHeight;
    }
    if (config.openSides <= 2 && config.shellArtwork.left?.assetId) {
      totalPrintAreaM2 += config.depth * config.shellWallHeight;
    }
    if (config.openSides === 1 && config.shellArtwork.right?.assetId) {
      totalPrintAreaM2 += config.depth * config.shellWallHeight;
    }
  }

  const areaM2 = config.width * config.depth;
  const occupancyPct = Math.min(100, Math.round((occupiedAreaM2 / Math.max(1, areaM2)) * 100));

  return {
    areaM2,
    occupiedAreaM2,
    occupancyPct,
    outOfBoundsIds,
    overHeightIds,
    totalPrintAreaM2,
    isCompliant: outOfBoundsIds.length === 0 && overHeightIds.length === 0,
  };
}

export interface EstimateLine {
  id: string;
  label: string;
  category: string;
  qty: number;
  unitPriceGbp: number;
  totalGbp: number;
}

export interface StandEstimate {
  lines: EstimateLine[];
  subtotalGbp: number;
  printGraphicsGbp: number;
  installAndPowerGbp: number;
  grandTotalGbp: number;
  totalPrintAreaM2: number;
}

export function calculateEstimate(
  config: StandConfig,
  items: StandItem[],
  mode: 'hire' | 'buy'
): StandEstimate {
  const areaM2 = config.width * config.depth;
  const compliance = evaluateCompliance(config, items);
  const lines: EstimateLine[] = [];

  // Floor plinth & finish
  const floorUnitRate =
    config.floorMaterial === 'oak-timber' || config.floorMaterial === 'slate-tile'
      ? mode === 'hire'
        ? 48
        : 92
      : mode === 'hire'
        ? 32
        : 58;

  const floorLabel = config.floorMaterial
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  lines.push({
    id: 'flooring',
    label: `Raised Platform & ${floorLabel} Flooring (${areaM2} m²)`,
    category: 'Structure',
    qty: areaM2,
    unitPriceGbp: floorUnitRate,
    totalGbp: Math.round(areaM2 * floorUnitRate),
  });

  // Shell scheme perimeter walls
  if (config.showShellWalls && config.openSides < 4) {
    let wallLinearM = config.width; // back wall
    if (config.openSides <= 2) wallLinearM += config.depth;
    if (config.openSides === 1) wallLinearM += config.depth;
    const rate = mode === 'hire' ? 95 : 220;
    lines.push({
      id: 'shell-walls',
      label: `Modular Perimeter Walling (${wallLinearM.toFixed(1)} linear m)`,
      category: 'Structure',
      qty: Number(wallLinearM.toFixed(1)),
      unitPriceGbp: rate,
      totalGbp: Math.round(wallLinearM * rate),
    });
  }

  // Group equipment items by catalogId
  const grouped = new Map<string, { name: string; category: string; qty: number; unit: number }>();
  for (const item of items) {
    if (item.visible === false) continue;
    if (item.catalogId === 'custom-3d-model' || item.catalogId === 'custom-built-asset') {
      const key = `custom:${item.name}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.qty += 1;
      } else {
        const tag =
          item.catalogId === 'custom-built-asset' ? 'Custom Built Asset' : 'Client 3D Exhibit';
        grouped.set(key, {
          name: `${item.name} (${tag} — ${item.dims.w}×${item.dims.d}m)`,
          category: 'Client Exhibit',
          qty: 1,
          unit: 0,
        });
      }
      continue;
    }
    const def = CATALOG_MAP[item.catalogId];
    if (!def) continue;
    const unit = mode === 'hire' ? def.priceHire : def.priceBuy;
    const existing = grouped.get(def.id);
    if (existing) {
      existing.qty += 1;
    } else {
      grouped.set(def.id, {
        name: def.name,
        category: def.category,
        qty: 1,
        unit,
      });
    }
  }

  for (const [id, entry] of grouped.entries()) {
    lines.push({
      id,
      label: entry.name,
      category: entry.category,
      qty: entry.qty,
      unitPriceGbp: entry.unit,
      totalGbp: entry.qty * entry.unit,
    });
  }

  const subtotalGbp = lines.reduce((sum, l) => sum + l.totalGbp, 0);
  const printGraphicsGbp = Math.round(compliance.totalPrintAreaM2 * 46); // £46 / m² high-res dye-sub graphic print
  const installAndPowerGbp = Math.round(320 + areaM2 * 24);
  const grandTotalGbp = subtotalGbp + printGraphicsGbp + installAndPowerGbp;

  return {
    lines,
    subtotalGbp,
    printGraphicsGbp,
    installAndPowerGbp,
    grandTotalGbp,
    totalPrintAreaM2: compliance.totalPrintAreaM2,
  };
}
