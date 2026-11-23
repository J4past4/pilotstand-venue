import { EQUIPMENT_CATALOG } from '../data/catalog';
import { COLOR_PALETTES } from '../data/palettes';
import { STAND_TEMPLATES } from '../data/templates';
import type { StandConfig, StandItem } from '../types/stand';
import type { AgentCatalogManifest, CompactStandState } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Strips base64 textures, blob URLs, and non-essential UI toggles so the LLM
 * only receives lightweight spatial & branding context (~150-400 tokens).
 */
export function buildCompactStandState(
  config: StandConfig,
  items: StandItem[]
): CompactStandState {
  return {
    config: {
      width: round2(config.width),
      depth: round2(config.depth),
      heightLimit: round2(config.heightLimit),
      openSides: config.openSides,
      showShellWalls: config.showShellWalls,
      shellWallHeight: round2(config.shellWallHeight),
      floorMaterial: config.floorMaterial,
      lightingPreset: config.lightingPreset,
      brandName: config.brandName.slice(0, 60),
      brandTagline: config.brandTagline.slice(0, 120),
      primaryColor: config.primaryColor,
      accentColor: config.accentColor,
    },
    items: items
      .filter((it) => it.visible !== false)
      .slice(0, 60)
      .map((it) => ({
        id: it.id,
        catalogId: it.catalogId,
        name: it.name.slice(0, 60),
        x: round2(it.x),
        y: round2(it.y),
        z: round2(it.z),
        rotationY: Math.round(it.rotationY),
        dims: {
          w: round2(it.dims.w),
          h: round2(it.dims.h),
          d: round2(it.dims.d),
        },
        ...(it.finish ? { finish: it.finish } : {}),
        ...(it.backlit ? { backlit: it.backlit } : {}),
      })),
  };
}

let cachedManifest: AgentCatalogManifest | null = null;

/**
 * Builds a compact manifest directly from live catalog/templates/palettes data.
 * Adding new catalog items or templates automatically updates the AI's knowledge.
 */
export function getAgentCatalogManifest(): AgentCatalogManifest {
  if (cachedManifest) return cachedManifest;

  cachedManifest = {
    catalog: EQUIPMENT_CATALOG.map((item) => ({
      id: item.id,
      name: item.shortName,
      category: item.category,
      dims: item.defaultDims,
      resizable: item.resizable,
      ...(item.elevatedY !== undefined ? { elevatedY: item.elevatedY } : {}),
      ...(item.supportsBacklit ? { supportsBacklit: true } : {}),
    })),
    templates: STAND_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      dims: t.dimensionsLabel,
      openSides: t.openSidesLabel,
    })),
    palettes: COLOR_PALETTES.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
    })),
  };

  return cachedManifest;
}
