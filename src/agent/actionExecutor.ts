import { CATALOG_MAP } from '../data/catalog';
import { COLOR_PALETTES } from '../data/palettes';
import {
  createItemId,
  DEFAULT_STAND_CONFIG,
  instantiateTemplate,
  STAND_TEMPLATES,
} from '../data/templates';
import type {
  CameraPreset,
  FloorMaterial,
  LightingPreset,
  OpenSides,
  StandConfig,
  StandItem,
} from '../types/stand';
import type { ItemFinish, StandAgentAction } from './types';

const VALID_FLOOR_MATERIALS = new Set<FloorMaterial>([
  'charcoal-carpet',
  'navy-carpet',
  'oak-timber',
  'light-concrete',
  'slate-tile',
  'brand-carpet',
]);

const VALID_LIGHTING_PRESETS = new Set<LightingPreset>(['expo-hall', 'daylight', 'dramatic']);
const VALID_FINISHES = new Set<ItemFinish>(['matte', 'gloss', 'oak', 'metal']);
const VALID_CAMERAS = new Set<CameraPreset>([
  'isometric',
  'front',
  'left',
  'right',
  'top',
  'eye-level',
]);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_ACTIONS_PER_TURN = 25;
const MAX_ITEMS_PER_STAND = 60;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR_RE.test(v);
}

function sanitizeText(v: unknown, maxLen: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.replace(/[<>]/g, '').trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : undefined;
}

function clampPositionToBooth(
  x: number,
  z: number,
  dims: { w: number; d: number },
  rotationY: number,
  config: StandConfig
): { x: number; z: number } {
  const rad = (rotationY * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfItemW = (dims.w * cos + dims.d * sin) / 2;
  const halfItemD = (dims.w * sin + dims.d * cos) / 2;

  const limitX = Math.max(0.1, config.width / 2 - Math.min(halfItemW, config.width / 2 - 0.05));
  const limitZ = Math.max(0.1, config.depth / 2 - Math.min(halfItemD, config.depth / 2 - 0.05));

  return {
    x: round2(clamp(x, -limitX, limitX)),
    z: round2(clamp(z, -limitZ, limitZ)),
  };
}

export interface ActionExecutionResult {
  nextConfig: StandConfig;
  nextItems: StandItem[];
  appliedSummaries: string[];
  warnings: string[];
  cameraPreset?: CameraPreset;
  mutated: boolean;
}

/**
 * Pure, deterministic executor that validates, clamps, and applies a batch of
 * AI actions to a cloned stand state so the whole turn becomes one Undo step.
 */
export function applyAgentActions(
  currentConfig: StandConfig,
  currentItems: StandItem[],
  rawActions: StandAgentAction[]
): ActionExecutionResult {
  let nextConfig: StandConfig = JSON.parse(JSON.stringify(currentConfig));
  let nextItems: StandItem[] = JSON.parse(JSON.stringify(currentItems));
  const appliedSummaries: string[] = [];
  const warnings: string[] = [];
  let cameraPreset: CameraPreset | undefined;
  let mutated = false;

  const safeActions = Array.isArray(rawActions)
    ? rawActions.slice(0, MAX_ACTIONS_PER_TURN)
    : [];

  if (Array.isArray(rawActions) && rawActions.length > MAX_ACTIONS_PER_TURN) {
    warnings.push(`Capped batch to ${MAX_ACTIONS_PER_TURN} actions for safety.`);
  }

  for (const action of safeActions) {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') continue;

    switch (action.type) {
      case 'apply_template': {
        const tpl = STAND_TEMPLATES.find((t) => t.id === action.templateId);
        if (!tpl) {
          warnings.push(`Unknown template "${action.templateId}" skipped.`);
          break;
        }
        const inst = instantiateTemplate(tpl);
        const preservedBrand =
          action.preserveBrand !== false
            ? {
                brandName: nextConfig.brandName,
                brandTagline: nextConfig.brandTagline,
              }
            : {};
        nextConfig = { ...inst.config, ...preservedBrand };
        nextItems = inst.items;
        cameraPreset = 'isometric';
        appliedSummaries.push(`Loaded "${tpl.name}" template`);
        mutated = true;
        break;
      }

      case 'start_blank': {
        const width = round2(clamp(Number(action.width), 2, 16));
        const depth = round2(clamp(Number(action.depth), 2, 12));
        const openSides = ([1, 2, 3, 4].includes(action.openSides)
          ? action.openSides
          : 2) as OpenSides;
        nextConfig = {
          ...DEFAULT_STAND_CONFIG,
          width,
          depth,
          openSides,
          showShellWalls: openSides < 4,
          brandName: nextConfig.brandName,
          brandTagline: nextConfig.brandTagline,
          primaryColor: nextConfig.primaryColor,
          accentColor: nextConfig.accentColor,
        };
        nextItems = [];
        cameraPreset = 'isometric';
        appliedSummaries.push(`Created blank ${width}×${depth}m stand (${openSides} open)`);
        mutated = true;
        break;
      }

      case 'apply_palette': {
        const palette = COLOR_PALETTES.find((p) => p.id === action.paletteId);
        if (!palette) {
          warnings.push(`Unknown palette "${action.paletteId}" skipped.`);
          break;
        }
        nextConfig = {
          ...nextConfig,
          primaryColor: palette.primaryColor,
          accentColor: palette.accentColor,
          wallColor: palette.wallColor,
          floorMaterial: palette.floorMaterial,
          floorColor: palette.floorColor,
          trimColor: palette.trimColor,
        };
        appliedSummaries.push(`Applied "${palette.name}" palette`);
        mutated = true;
        break;
      }

      case 'update_config': {
        const p = action.patch || {};
        const changes: string[] = [];

        if (typeof p.width === 'number') {
          nextConfig.width = round2(clamp(p.width, 2, 16));
          changes.push(`width ${nextConfig.width}m`);
        }
        if (typeof p.depth === 'number') {
          nextConfig.depth = round2(clamp(p.depth, 2, 12));
          changes.push(`depth ${nextConfig.depth}m`);
        }
        if (typeof p.heightLimit === 'number') {
          nextConfig.heightLimit = round2(clamp(p.heightLimit, 2.5, 8));
          changes.push(`height limit ${nextConfig.heightLimit}m`);
        }
        if (p.openSides !== undefined && [1, 2, 3, 4].includes(p.openSides)) {
          nextConfig.openSides = p.openSides;
          if (p.showShellWalls === undefined) {
            nextConfig.showShellWalls = p.openSides < 4;
          }
          changes.push(`${p.openSides} open side${p.openSides > 1 ? 's' : ''}`);
        }
        if (typeof p.showShellWalls === 'boolean') {
          nextConfig.showShellWalls = p.showShellWalls;
          changes.push(p.showShellWalls ? 'shell walls on' : 'shell walls off');
        }
        if (typeof p.shellWallHeight === 'number') {
          nextConfig.shellWallHeight = round2(clamp(p.shellWallHeight, 2.0, 4.5));
        }
        if (p.floorMaterial && VALID_FLOOR_MATERIALS.has(p.floorMaterial)) {
          nextConfig.floorMaterial = p.floorMaterial;
          changes.push(`floor ${p.floorMaterial}`);
        }
        if (isHexColor(p.floorColor)) nextConfig.floorColor = p.floorColor;
        if (isHexColor(p.wallColor)) nextConfig.wallColor = p.wallColor;
        if (isHexColor(p.trimColor)) nextConfig.trimColor = p.trimColor;
        if (isHexColor(p.primaryColor)) {
          nextConfig.primaryColor = p.primaryColor;
          changes.push(`primary ${p.primaryColor}`);
        }
        if (isHexColor(p.accentColor)) {
          nextConfig.accentColor = p.accentColor;
          changes.push(`accent ${p.accentColor}`);
        }
        const brandName = sanitizeText(p.brandName, 50);
        if (brandName) {
          nextConfig.brandName = brandName;
          changes.push(`brand "${brandName}"`);
        }
        const brandTagline = sanitizeText(p.brandTagline, 110);
        if (brandTagline) {
          nextConfig.brandTagline = brandTagline;
          changes.push('tagline updated');
        }
        if (p.lightingPreset && VALID_LIGHTING_PRESETS.has(p.lightingPreset)) {
          nextConfig.lightingPreset = p.lightingPreset;
          changes.push(`lighting ${p.lightingPreset}`);
        }

        if (changes.length > 0) {
          appliedSummaries.push(`Stand: ${changes.join(', ')}`);
          mutated = true;
        }
        break;
      }

      case 'add_item': {
        if (nextItems.length >= MAX_ITEMS_PER_STAND) {
          warnings.push(`Stand reached maximum ${MAX_ITEMS_PER_STAND} items.`);
          break;
        }
        const def = CATALOG_MAP[action.catalogId];
        if (!def) {
          warnings.push(`Unknown catalog item "${action.catalogId}" skipped.`);
          break;
        }

        const dims = {
          w: round2(
            clamp(
              action.dims?.w ?? def.defaultDims.w,
              def.minDims.w,
              Math.min(def.maxDims.w, nextConfig.width)
            )
          ),
          h: round2(
            clamp(
              action.dims?.h ?? def.defaultDims.h,
              def.minDims.h,
              Math.min(def.maxDims.h, nextConfig.heightLimit)
            )
          ),
          d: round2(
            clamp(
              action.dims?.d ?? def.defaultDims.d,
              def.minDims.d,
              Math.min(def.maxDims.d, nextConfig.depth)
            )
          ),
        };

        const rotationY = Number.isFinite(action.rotationY)
          ? ((Math.round(Number(action.rotationY)) % 360) + 360) % 360
          : 0;

        const clampedPos = clampPositionToBooth(
          Number(action.x ?? 0),
          Number(action.z ?? 0),
          dims,
          rotationY,
          nextConfig
        );

        const defaultY = def.elevatedY ?? 0;
        const maxY = Math.max(0, nextConfig.heightLimit - dims.h);
        const y = round2(clamp(Number(action.y ?? defaultY), 0, maxY));

        const newItem: StandItem = {
          id: createItemId(action.catalogId),
          catalogId: action.catalogId,
          name: sanitizeText(action.name, 50) || def.name,
          x: clampedPos.x,
          y,
          z: clampedPos.z,
          rotationY,
          dims,
          finish: action.finish && VALID_FINISHES.has(action.finish) ? action.finish : def.defaultFinish,
          backlit:
            typeof action.backlit === 'boolean'
              ? action.backlit
              : Boolean(def.supportsBacklit),
          ...(isHexColor(action.primaryColor) ? { primaryColor: action.primaryColor } : {}),
          ...(isHexColor(action.accentColor) ? { accentColor: action.accentColor } : {}),
          locked: false,
          visible: true,
          artwork: {},
        };

        nextItems.push(newItem);
        appliedSummaries.push(`+ ${def.shortName}`);
        mutated = true;
        break;
      }

      case 'update_item': {
        const idx = nextItems.findIndex((it) => it.id === action.itemId);
        if (idx === -1) {
          warnings.push(`Item "${action.itemId}" not found.`);
          break;
        }
        const existing = nextItems[idx];
        const def = CATALOG_MAP[existing.catalogId];
        const p = action.patch || {};

        const nextDims = {
          w:
            typeof p.dims?.w === 'number'
              ? round2(
                  clamp(
                    p.dims.w,
                    def?.minDims.w ?? 0.2,
                    Math.min(def?.maxDims.w ?? 12, nextConfig.width)
                  )
                )
              : existing.dims.w,
          h:
            typeof p.dims?.h === 'number'
              ? round2(
                  clamp(
                    p.dims.h,
                    def?.minDims.h ?? 0.2,
                    Math.min(def?.maxDims.h ?? 6, nextConfig.heightLimit)
                  )
                )
              : existing.dims.h,
          d:
            typeof p.dims?.d === 'number'
              ? round2(
                  clamp(
                    p.dims.d,
                    def?.minDims.d ?? 0.2,
                    Math.min(def?.maxDims.d ?? 12, nextConfig.depth)
                  )
                )
              : existing.dims.d,
        };

        const rotationY =
          typeof p.rotationY === 'number'
            ? ((Math.round(p.rotationY) % 360) + 360) % 360
            : existing.rotationY;

        const pos = clampPositionToBooth(
          typeof p.x === 'number' ? p.x : existing.x,
          typeof p.z === 'number' ? p.z : existing.z,
          nextDims,
          rotationY,
          nextConfig
        );

        const maxY = Math.max(0, nextConfig.heightLimit - nextDims.h);
        const y =
          typeof p.y === 'number' ? round2(clamp(p.y, 0, maxY)) : existing.y;

        nextItems[idx] = {
          ...existing,
          x: pos.x,
          y,
          z: pos.z,
          rotationY,
          dims: nextDims,
          name: sanitizeText(p.name, 50) || existing.name,
          finish:
            p.finish && VALID_FINISHES.has(p.finish) ? p.finish : existing.finish,
          backlit: typeof p.backlit === 'boolean' ? p.backlit : existing.backlit,
          primaryColor: isHexColor(p.primaryColor)
            ? p.primaryColor
            : existing.primaryColor,
          accentColor: isHexColor(p.accentColor)
            ? p.accentColor
            : existing.accentColor,
          visible: typeof p.visible === 'boolean' ? p.visible : existing.visible,
        };

        appliedSummaries.push(`Updated ${existing.name}`);
        mutated = true;
        break;
      }

      case 'remove_item': {
        const target = nextItems.find((it) => it.id === action.itemId);
        if (!target) {
          warnings.push(`Item "${action.itemId}" not found to remove.`);
          break;
        }
        nextItems = nextItems.filter((it) => it.id !== action.itemId);
        appliedSummaries.push(`Removed ${target.name}`);
        mutated = true;
        break;
      }

      case 'clear_items': {
        if (nextItems.length > 0) {
          nextItems = [];
          appliedSummaries.push('Cleared all stand equipment');
          mutated = true;
        }
        break;
      }

      case 'set_camera': {
        if (VALID_CAMERAS.has(action.preset)) {
          cameraPreset = action.preset;
          appliedSummaries.push(`Camera: ${action.preset}`);
        }
        break;
      }
    }
  }

  return {
    nextConfig,
    nextItems,
    appliedSummaries,
    warnings,
    cameraPreset,
    mutated,
  };
}
