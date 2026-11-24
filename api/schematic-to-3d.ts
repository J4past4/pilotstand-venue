import { getDefaultModelForProvider, resolveActiveProvider } from './_lib/providers.ts';
import {
  enforceRateLimits,
  extractClientIp,
  getSecurityConfig,
  isAllowedOrigin,
} from './_lib/security.ts';

interface VercelLikeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  setHeader(name: string, value: string): void;
  json(payload: unknown): void;
}

interface SchematicRequestBody {
  imageDataUrl?: string;
  viewPlane?: 'top' | 'front';
  overallWidthMm?: number;
  defaultHeightMm?: number;
  notes?: string;
}

const SYSTEM_PROMPT = `You are an industrial CAD & exhibition stand 3D blockout assistant.
Given a 2D technical schematic, floor plan, or elevation drawing of a machine/product/asset, decompose it into simple 3D primitive shapes in MILLIMETRES (mm) so it can be placed onto an exhibition stand.

Allowed primitive kinds: "box", "cylinder", "cone", "sphere", "wedge", "ring".
Allowed finishes: "matte", "metal", "dark-steel", "glass", "accent".

Coordinate system (ALL values in millimetres):
- x: left/right center position (0 is asset center)
- y: elevation of the BOTTOM of the shape from the floor (0 = sits on floor)
- z: front/back center position (0 is asset center)
- w: width along X (or diameter for cylinder/cone/ring)
- h: height along Y
- d: depth along Z (equal to w for cylinder/cone/ring)
- rotX, rotY, rotZ: optional rotation in degrees (0 if unrotated)

Read any dimension callouts printed on the drawing (e.g., "1650", "Ø1650", "H:2400") and honour them accurately.
Return STRICT JSON ONLY with this exact schema:
{
  "assetName": "Short descriptive name of the machine/asset",
  "summary": "One concise sentence describing the detected parts and dimensions",
  "primitives": [
    {
      "label": "Part name",
      "kind": "cylinder",
      "w": 1650,
      "h": 100,
      "d": 1650,
      "x": 0,
      "y": 0,
      "z": 200,
      "rotX": 0,
      "rotY": 0,
      "rotZ": 0,
      "color": "#334155",
      "finish": "dark-steel"
    }
  ]
}`;

function parseJsonResponse(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return {
    mimeType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1],
    base64: match[2],
  };
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAllowedOrigin(req.headers)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const provider = resolveActiveProvider();
  if (!provider) {
    return res.status(501).json({
      code: 'AI_NOT_CONFIGURED',
      error: 'No AI vision provider configured.',
    });
  }

  const ip = extractClientIp(req.headers);
  const limit = await enforceRateLimits(ip, getSecurityConfig());
  if (!limit.allowed) {
    return res
      .status(limit.statusCode || 429)
      .json({ error: limit.error || 'Rate limit exceeded.' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as
    | SchematicRequestBody
    | undefined;

  if (!body?.imageDataUrl || typeof body.imageDataUrl !== 'string') {
    return res.status(400).json({ error: 'Missing imageDataUrl.' });
  }

  if (body.imageDataUrl.length > 4_000_000) {
    return res.status(413).json({ error: 'Schematic image is too large.' });
  }

  const parsedImg = parseDataUrl(body.imageDataUrl);
  if (!parsedImg) {
    return res.status(400).json({ error: 'Unsupported image format. Use PNG, JPEG, or WebP.' });
  }

  const userPrompt = [
    `Analyze this 2D ${body.viewPlane === 'front' ? 'front elevation' : 'top-down plan'} schematic and convert it into 3D primitives (max 12 parts).`,
    body.overallWidthMm ? `Reference overall drawing width: ~${Math.round(body.overallWidthMm)} mm.` : '',
    body.defaultHeightMm ? `Default height if not labeled on drawing: ${Math.round(body.defaultHeightMm)} mm.` : '',
    body.notes ? `User notes: ${body.notes.slice(0, 400)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    let rawText = '';

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(501).json({ error: 'GEMINI_API_KEY not configured' });
      const model = getDefaultModelForProvider('gemini');
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: parsedImg.mimeType, data: parsedImg.base64 } },
                { text: userPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1600,
            responseMimeType: 'application/json',
          },
        }),
      });
      if (!resp.ok) {
        return res.status(502).json({ error: `Gemini vision error (${resp.status})` });
      }
      const data = (await resp.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(501).json({ error: 'ANTHROPIC_API_KEY not configured' });
      const model = getDefaultModelForProvider('anthropic');
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1600,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: parsedImg.mimeType,
                    data: parsedImg.base64,
                  },
                },
                { type: 'text', text: userPrompt },
              ],
            },
          ],
        }),
      });
      if (!resp.ok) {
        return res.status(502).json({ error: `Anthropic vision error (${resp.status})` });
      }
      const data = (await resp.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      rawText = data.content?.find((c) => c.type === 'text')?.text || '';
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(501).json({ error: 'OPENAI_API_KEY not configured' });
      const model = getDefaultModelForProvider('openai');
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 1600,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: userPrompt },
                { type: 'image_url', image_url: { url: body.imageDataUrl } },
              ],
            },
          ],
        }),
      });
      if (!resp.ok) {
        return res.status(502).json({ error: `OpenAI vision error (${resp.status})` });
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      rawText = data.choices?.[0]?.message?.content || '';
    }

    if (!rawText) {
      return res.status(502).json({ error: 'Empty AI response' });
    }

    const parsed = parseJsonResponse(rawText);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('schematic-to-3d error:', err);
    return res.status(500).json({ error: 'Failed to analyze schematic.' });
  }
}
