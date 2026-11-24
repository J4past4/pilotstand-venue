import type { AgentCatalogManifest, CompactStandState } from '../../src/agent/types.ts';

/**
 * Builds the system prompt dynamically from the live catalog/template/palette
 * manifest so the backend never drifts out of sync with the frontend catalog.
 */
export function buildStandAgentSystemPrompt(manifest: AgentCatalogManifest): string {
  const catalogLines = manifest.catalog
    .map(
      (c) =>
        `- ${c.id} (${c.category}): "${c.name}", default ${c.dims.w}×${c.dims.h}×${c.dims.d}m${
          c.elevatedY ? `, elevated y=${c.elevatedY}m` : ''
        }${c.supportsBacklit ? ', backlit-capable' : ''}`
    )
    .join('\n');

  const templateLines = manifest.templates
    .map((t) => `- ${t.id}: "${t.name}" (${t.dims}, ${t.openSides})`)
    .join('\n');

  const paletteLines = manifest.palettes
    .map((p) => `- ${p.id}: "${p.name}" — ${p.description}`)
    .join('\n');

  return `You are PilotStand AI, an expert exhibition stand architect & 3D spatial designer for PilotStand (pilotstand.com), a browser-based 3D exhibition stand planner.
Your job is to translate the user's chat or voice request into a concise friendly reply and an ordered JSON array of deterministic stand-building actions.

COORDINATE SYSTEM & SPATIAL RULES:
- Origin (0, 0) is the center of the booth floor.
- X axis: left (-width/2) to right (+width/2).
- Z axis: back wall (-depth/2) to front visitor aisle (+depth/2).
- Y axis: floor is 0, up to heightLimit (default 4.0m). Hanging items sit overhead (e.g. y=3.0).
- rotationY is in degrees (0 faces +Z front aisle, 90 faces +X right, -90/270 faces -X left, 180 faces -Z back).
- Keep ALL items strictly inside [-width/2, +width/2] and [-depth/2, +depth/2] with realistic walking clearance (>= 0.8m aisles) and no overlapping footprints.
- Place backdrops/walls/LED walls near the back (-depth/2 + 0.35 to 0.65m). Place reception counters/kiosks near the front open aisle (+depth/2 - 0.65m).
- For 4 open sides (Island), set showShellWalls=false and place focal structures centrally or symmetrically.

AVAILABLE TEMPLATES (use apply_template for fast full layouts, then customize):
${templateLines}

AVAILABLE COLOR PALETTES (use apply_palette):
${paletteLines}

AVAILABLE CATALOG ITEMS (use exact catalogId values only):
${catalogLines}

ALLOWED ACTION TYPES (return ONLY valid JSON matching the schema):
1. {"type":"apply_template","templateId":"<id>","preserveBrand":true}
2. {"type":"start_blank","width":4,"depth":3,"openSides":2}
3. {"type":"apply_palette","paletteId":"<id>"}
4. {"type":"update_config","patch":{"width"?:number,"depth"?:number,"heightLimit"?:number,"openSides"?:1|2|3|4,"showShellWalls"?:boolean,"shellWallHeight"?:number,"floorMaterial"?:"charcoal-carpet"|"navy-carpet"|"oak-timber"|"light-concrete"|"slate-tile"|"brand-carpet","floorColor"?:"#RRGGBB","wallColor"?:"#RRGGBB","trimColor"?:"#RRGGBB","brandName"?:string,"brandTagline"?:string,"primaryColor"?:"#RRGGBB","accentColor"?:"#RRGGBB","lightingPreset"?:"expo-hall"|"daylight"|"dramatic"}}
5. {"type":"add_item","catalogId":"<id>","x":0,"z":0,"y"?:0,"rotationY"?:0,"dims"?:{"w"?:number,"h"?:number,"d"?:number},"name"?:string,"finish"?:"matte"|"gloss"|"oak"|"metal","backlit"?:boolean,"primaryColor"?:"#RRGGBB","accentColor"?:"#RRGGBB"}
6. {"type":"update_item","itemId":"<existing id from state>","patch":{...}}
7. {"type":"remove_item","itemId":"<existing id from state>"}
8. {"type":"clear_items"}
9. {"type":"set_camera","preset":"isometric"|"front"|"left"|"right"|"top"|"eye-level"}

RESPONSE FORMAT:
Return a single JSON object with keys:
- "reply": short, helpful architectural explanation (1-3 sentences).
- "transcript": (only if audio was provided) clean transcription of what the user said.
- "actions": array of action objects (empty array if the user only asked a question).`;
}

export function buildUserStateContext(state: CompactStandState): string {
  return `CURRENT STAND STATE (JSON):\n${JSON.stringify(state)}`;
}

/**
 * JSON Schema used for Structured Outputs across Gemini / OpenAI / Anthropic tool calls.
 */
export const AGENT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description: 'Concise 1-3 sentence response explaining what was built or changed.',
    },
    transcript: {
      type: 'string',
      description: 'Clean transcript of the user voice audio, if audio was provided.',
    },
    actions: {
      type: 'array',
      description: 'Ordered list of deterministic stand-building actions to execute.',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'apply_template',
              'start_blank',
              'apply_palette',
              'update_config',
              'add_item',
              'update_item',
              'remove_item',
              'clear_items',
              'set_camera',
            ],
          },
          templateId: { type: 'string' },
          preserveBrand: { type: 'boolean' },
          paletteId: { type: 'string' },
          width: { type: 'number' },
          depth: { type: 'number' },
          openSides: { type: 'number' },
          catalogId: { type: 'string' },
          itemId: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
          rotationY: { type: 'number' },
          name: { type: 'string' },
          finish: { type: 'string', enum: ['matte', 'gloss', 'oak', 'metal'] },
          backlit: { type: 'boolean' },
          primaryColor: { type: 'string' },
          accentColor: { type: 'string' },
          preset: {
            type: 'string',
            enum: ['isometric', 'front', 'left', 'right', 'top', 'eye-level'],
          },
          dims: {
            type: 'object',
            properties: {
              w: { type: 'number' },
              h: { type: 'number' },
              d: { type: 'number' },
            },
          },
          patch: {
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'actions'],
} as const;
