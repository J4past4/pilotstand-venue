import type { FloorMaterial, LightingPreset, OpenSides } from '../types/stand';
import type {
  AgentResponsePayload,
  CompactStandState,
  StandAgentAction,
} from './types';

/**
 * Lightweight local rule-based fallback used ONLY when the serverless AI API
 * is not configured (e.g., local Vite dev without API keys). Allows testing
 * the full chat/voice UI and action execution pipeline at $0 cost.
 */
export function runLocalPreviewAgent(
  rawPrompt: string,
  state: CompactStandState
): AgentResponsePayload {
  const prompt = rawPrompt.trim();
  const lower = prompt.toLowerCase();
  const actions: StandAgentAction[] = [];
  const notes: string[] = [];

  // 1. Dimensions detection (e.g., "6x4", "6m x 4m", "5 by 3")
  const dimMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:m)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:m)?/);
  let width = state.config.width;
  let depth = state.config.depth;
  let openSides: OpenSides | undefined;

  if (lower.includes('island')) openSides = 4;
  else if (lower.includes('peninsula')) openSides = 3;
  else if (lower.includes('corner')) openSides = 2;
  else if (lower.includes('inline') || lower.includes('in-line')) openSides = 1;

  // 2. Template shortcuts
  if (lower.includes('island') && (lower.includes('build') || lower.includes('create') || lower.includes('template') || lower.includes('stand'))) {
    actions.push({ type: 'apply_template', templateId: 'island-flagship', preserveBrand: true });
    notes.push('loaded the Island Flagship layout');
    width = 6;
    depth = 6;
  } else if (lower.includes('compact') || lower.includes('small') || lower.includes('3x2') || lower.includes('3×2')) {
    actions.push({ type: 'apply_template', templateId: 'compact-popup', preserveBrand: true });
    notes.push('loaded the Compact Pop-Up template');
    width = 3;
    depth = 2;
  } else if (lower.includes('arch') && lower.includes('build')) {
    actions.push({ type: 'apply_template', templateId: 'front-arc-pavilion', preserveBrand: true });
    notes.push('loaded the Front Arch Pavilion template');
  } else if (lower.includes('clear') && (lower.includes('all') || lower.includes('stand') || lower.includes('blank'))) {
    actions.push({ type: 'clear_items' });
    notes.push('cleared existing equipment');
  }

  // Apply explicit size/openSides patch
  const configPatch: Extract<StandAgentAction, { type: 'update_config' }>['patch'] = {};
  if (dimMatch) {
    width = Math.max(2, Math.min(16, Number(dimMatch[1])));
    depth = Math.max(2, Math.min(12, Number(dimMatch[2])));
    configPatch.width = width;
    configPatch.depth = depth;
    notes.push(`resized the booth to ${width}×${depth}m`);
  }
  if (openSides) {
    configPatch.openSides = openSides;
    configPatch.showShellWalls = openSides < 4;
  }

  // 3. Brand name detection (e.g., 'brand "Acme"' or 'called Acme')
  const brandMatch =
    prompt.match(/(?:brand(?:\s+name)?|called|named|for)\s+["']([^"']+)["']/i) ||
    prompt.match(/(?:brand\s+name\s+to|brand\s+to)\s+([A-Za-z0-9 &.-]{2,32})/i);
  if (brandMatch?.[1]) {
    configPatch.brandName = brandMatch[1].trim();
    notes.push(`set brand name to "${configPatch.brandName}"`);
  }

  // 4. Lighting & floor detection
  const lightingMap: Array<[string[], LightingPreset]> = [
    [['dramatic', 'keynote', 'spotlight', 'moody'], 'dramatic'],
    [['daylight', 'bright', 'natural'], 'daylight'],
    [['expo', 'hall', 'standard'], 'expo-hall'],
  ];
  for (const [keys, preset] of lightingMap) {
    if (keys.some((k) => lower.includes(k))) {
      configPatch.lightingPreset = preset;
      notes.push(`switched lighting to ${preset}`);
      break;
    }
  }

  const floorMap: Array<[string[], FloorMaterial]> = [
    [['oak', 'wood', 'timber'], 'oak-timber'],
    [['concrete', 'industrial'], 'light-concrete'],
    [['charcoal', 'dark carpet'], 'charcoal-carpet'],
    [['navy'], 'navy-carpet'],
    [['slate', 'tile'], 'slate-tile'],
  ];
  for (const [keys, mat] of floorMap) {
    if (keys.some((k) => lower.includes(k))) {
      configPatch.floorMaterial = mat;
      notes.push(`changed flooring to ${mat}`);
      break;
    }
  }

  if (Object.keys(configPatch).length > 0) {
    actions.push({ type: 'update_config', patch: configPatch });
  }

  // 5. Palette detection
  if (lower.includes('obsidian') || lower.includes('dark') || lower.includes('luxury') || lower.includes('gold') || lower.includes('brass')) {
    actions.push({ type: 'apply_palette', paletteId: 'obsidian-amber' });
    notes.push('applied the Obsidian & Brass palette');
  } else if (lower.includes('green') || lower.includes('sage') || lower.includes('eco') || lower.includes('botanical') || lower.includes('sustainab')) {
    actions.push({ type: 'apply_palette', paletteId: 'botanical-sage' });
    notes.push('applied the Botanical Sage palette');
  } else if (lower.includes('blue') || lower.includes('tech') || lower.includes('ocean')) {
    actions.push({ type: 'apply_palette', paletteId: 'oceanic-tech' });
    notes.push('applied the Oceanic Precision palette');
  } else if (lower.includes('red') || lower.includes('swiss') || lower.includes('crimson')) {
    actions.push({ type: 'apply_palette', paletteId: 'crimson-studio' });
    notes.push('applied the Swiss Signal palette');
  } else if (lower.includes('sand') || lower.includes('warm') || lower.includes('minimal') || lower.includes('beige')) {
    actions.push({ type: 'apply_palette', paletteId: 'sandstone-minimal' });
    notes.push('applied the Warm Sandstone palette');
  }

  // 6. Equipment additions
  const backZ = -depth / 2 + 0.55;
  const frontZ = depth / 2 - 0.65;

  if (lower.includes('led') || lower.includes('video wall')) {
    actions.push({ type: 'add_item', catalogId: 'led-video-wall', x: 0, z: backZ, rotationY: 0 });
    notes.push('added an LED Video Wall at the back');
  } else if (lower.includes('lightbox') || lower.includes('light box')) {
    actions.push({ type: 'add_item', catalogId: 'seg-lightbox', x: 0, z: backZ, rotationY: 0, backlit: true });
    notes.push('added a backlit SEG Lightbox');
  }

  if (lower.includes('reception') || lower.includes('counter') || lower.includes('desk')) {
    actions.push({ type: 'add_item', catalogId: 'reception-desk', x: 0, z: frontZ, rotationY: 0 });
    notes.push('placed a Reception Counter near the front aisle');
  }

  if (lower.includes('sofa') || lower.includes('lounge')) {
    const lx = Math.min(width / 2 - 0.9, 1.1);
    actions.push({ type: 'add_item', catalogId: 'lounge-sofa', x: lx, z: 0.1, rotationY: -90 });
    actions.push({ type: 'add_item', catalogId: 'coffee-table', x: lx - 0.75, z: 0.1, rotationY: 0 });
    notes.push('created a lounge seating area');
  }

  if (lower.includes('meeting') || lower.includes('table')) {
    const mx = Math.max(-width / 2 + 0.9, -1.0);
    actions.push({ type: 'add_item', catalogId: 'meeting-table', x: mx, z: 0.2, rotationY: 0 });
    actions.push({ type: 'add_item', catalogId: 'meeting-chair', x: mx - 0.65, z: 0.2, rotationY: 90 });
    actions.push({ type: 'add_item', catalogId: 'meeting-chair', x: mx + 0.65, z: 0.2, rotationY: -90 });
    notes.push('added a meeting table with chairs');
  }

  if (lower.includes('stool')) {
    const count = lower.includes('two') || lower.includes('2') ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      actions.push({
        type: 'add_item',
        catalogId: 'bar-stool',
        x: -0.4 + i * 0.8,
        z: frontZ - 0.45,
        rotationY: 0,
      });
    }
    notes.push(`added ${count} bar stool${count > 1 ? 's' : ''}`);
  }

  if (lower.includes('tv') || lower.includes('screen') || lower.includes('display')) {
    actions.push({ type: 'add_item', catalogId: 'tv-stand', x: width / 2 - 0.8, z: backZ + 0.3, rotationY: -25 });
    notes.push('added a 55" 4K Display Totem');
  }

  if (lower.includes('plant') || lower.includes('greenery')) {
    actions.push({ type: 'add_item', catalogId: 'planter-box', x: -width / 2 + 0.5, z: frontZ, rotationY: 0 });
    notes.push('added a planter box');
  }

  if (lower.includes('hanging') || lower.includes('banner') || lower.includes('ring')) {
    actions.push({ type: 'add_item', catalogId: 'hanging-ring', x: 0, z: 0, rotationY: 0 });
    notes.push('suspended an overhead hanging ring banner');
  }

  // 7. Camera view requests
  if (lower.includes('eye level') || lower.includes('visitor view')) {
    actions.push({ type: 'set_camera', preset: 'eye-level' });
  } else if (lower.includes('top view') || lower.includes('2d') || lower.includes('floor plan')) {
    actions.push({ type: 'set_camera', preset: 'top' });
  }

  const reply =
    notes.length > 0
      ? `Done! I ${notes.join(', ')}. (Running in Local Preview Mode — connect GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY on Vercel for full spatial reasoning.)`
      : `I'm running in Local Preview Mode right now. Try asking for specific changes like "Build a 6x4m island stand with an LED video wall, lounge sofa, and dark obsidian palette", or configure an API key on Vercel for full natural-language design.`;

  return {
    reply,
    actions,
    meta: {
      provider: 'local-preview',
      model: 'rule-engine-v1',
      estimatedCostUsd: 0,
    },
  };
}
