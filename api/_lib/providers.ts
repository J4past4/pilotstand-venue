import type {
  AgentAudioPayload,
  AgentHistoryTurn,
  StandAgentAction,
} from '../../src/agent/types.ts';
import { AGENT_RESPONSE_JSON_SCHEMA } from './prompt.ts';

export type ProviderName = 'gemini' | 'anthropic' | 'openai';

export interface ProviderCallInput {
  systemPrompt: string;
  stateContext: string;
  history: AgentHistoryTurn[];
  userMessage?: string;
  audio?: AgentAudioPayload;
  maxOutputTokens: number;
}

export interface ProviderCallOutput {
  provider: ProviderName;
  model: string;
  reply: string;
  actions: StandAgentAction[];
  transcript?: string;
  estimatedCostUsd: number;
}

interface ParsedModelJson {
  reply?: string;
  transcript?: string;
  actions?: StandAgentAction[];
}

function parseJsonSafely(raw: string): ParsedModelJson {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as ParsedModelJson;
  return {
    reply: typeof parsed.reply === 'string' ? parsed.reply : 'Updated the exhibition stand.',
    transcript: typeof parsed.transcript === 'string' ? parsed.transcript : undefined,
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
  };
}

/**
 * Resolves the active provider from AI_PROVIDER, or auto-detects from whichever
 * API key is configured in Vercel Environment Variables.
 */
export function resolveActiveProvider(): ProviderName | null {
  const explicit = process.env.AI_PROVIDER?.toLowerCase().trim();
  if (explicit === 'gemini' || explicit === 'anthropic' || explicit === 'openai') {
    return explicit;
  }
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

export class ProviderRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderRateLimitError';
  }
}

export function getDefaultModelForProvider(provider: ProviderName): string {
  if (process.env.AI_MODEL?.trim()) return process.env.AI_MODEL.trim();
  switch (provider) {
    case 'gemini':
      return 'gemini-2.5-flash-lite';
    case 'anthropic':
      return 'claude-haiku-5-5';
    case 'openai':
      return 'gpt-5.4-nano';
  }
}

// --- 1. Google Gemini Adapter (supports native text + audio in one call, free-tier resilient) ---

const GEMINI_FREE_FALLBACK_CHAIN = [
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
];

async function callGemini(input: ProviderCallInput): Promise<ProviderCallOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const primaryModel = getDefaultModelForProvider('gemini');
  const candidateModels = Array.from(
    new Set([primaryModel, ...GEMINI_FREE_FALLBACK_CHAIN])
  );

  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

  for (const turn of input.history) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    });
  }

  const userParts: Array<Record<string, unknown>> = [{ text: input.stateContext }];
  if (input.audio) {
    userParts.push({
      inlineData: {
        mimeType: input.audio.mimeType || 'audio/webm',
        data: input.audio.base64,
      },
    });
    userParts.push({
      text:
        input.userMessage?.trim() ||
        'Listen to the attached voice request, transcribe it in "transcript", and return the stand actions.',
    });
  } else if (input.userMessage) {
    userParts.push({ text: `USER REQUEST:\n${input.userMessage}` });
  }

  contents.push({ role: 'user', parts: userParts });

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: input.systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: input.maxOutputTokens,
      responseMimeType: 'application/json',
    },
  });

  let lastError: Error | null = null;
  let sawRateLimit = false;

  for (const model of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      // On 429 (free-tier RPM/RPD limit) or 404 (model rotation), try next free-tier model
      if (resp.status === 429) {
        sawRateLimit = true;
        lastError = new ProviderRateLimitError(
          'Google AI Studio free-tier rate limit reached. Wait 10–20 seconds and try again.'
        );
        continue;
      }
      if (resp.status === 404 || resp.status === 503) {
        lastError = new Error(`Gemini model ${model} unavailable (${resp.status})`);
        continue;
      }
      throw new Error(`Gemini API error (${resp.status}): ${errText.slice(0, 240)}`);
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastError = new Error(`Gemini model ${model} returned an empty response`);
      continue;
    }

    const parsed = parseJsonSafely(text);
    const inTok = data.usageMetadata?.promptTokenCount ?? 2500;
    const outTok = data.usageMetadata?.candidatesTokenCount ?? 400;
    // Flash-Lite baseline ($0.10 / 1M in, $0.40 / 1M out; $0 on AI Studio free tier)
    const estimatedCostUsd = (inTok * 0.1 + outTok * 0.4) / 1_000_000;

    return {
      provider: 'gemini',
      model,
      reply: parsed.reply || 'Updated your stand.',
      actions: parsed.actions || [],
      transcript: parsed.transcript,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    };
  }

  if (sawRateLimit && lastError) throw lastError;
  throw lastError || new Error('Gemini API call failed across fallback models');
}

// --- 2. OpenAI Transcription Helper (used when OpenAI/Anthropic receives audio) ---

async function transcribeWithOpenAI(audio: AgentAudioPayload): Promise<{
  transcript: string;
  costUsd: number;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Voice audio transcription requires GEMINI_API_KEY (native audio) or OPENAI_API_KEY (gpt-transcribe).'
    );
  }

  const bytes = Buffer.from(audio.base64, 'base64');
  const ext = audio.mimeType.includes('mp4')
    ? 'm4a'
    : audio.mimeType.includes('ogg')
      ? 'ogg'
      : 'webm';
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: audio.mimeType || 'audio/webm' }), `voice.${ext}`);
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`OpenAI transcription error (${resp.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { text?: string };
  const minutes = Math.max(0.05, (audio.durationSec || 10) / 60);
  return {
    transcript: (data.text || '').trim(),
    costUsd: minutes * 0.0045,
  };
}

// --- 3. Anthropic Claude Adapter (Tool-Use Structured Output) ---

async function callAnthropic(input: ProviderCallInput): Promise<ProviderCallOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  let effectiveMessage = input.userMessage || '';
  let transcript: string | undefined;
  let audioCost = 0;

  if (input.audio) {
    const tr = await transcribeWithOpenAI(input.audio);
    transcript = tr.transcript;
    audioCost = tr.costUsd;
    effectiveMessage = effectiveMessage
      ? `${effectiveMessage}\n\nVoice transcript: ${tr.transcript}`
      : tr.transcript;
  }

  const model = process.env.AI_MODEL || 'claude-haiku-5-5';
  const messages = [
    ...input.history.map((h) => ({ role: h.role, content: h.content })),
    {
      role: 'user' as const,
      content: `${input.stateContext}\n\nUSER REQUEST:\n${effectiveMessage}`,
    },
  ];

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxOutputTokens,
      temperature: 0.2,
      system: input.systemPrompt,
      messages,
      tools: [
        {
          name: 'apply_stand_plan',
          description: 'Return the conversational reply and deterministic stand actions.',
          input_schema: AGENT_RESPONSE_JSON_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'apply_stand_plan' },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Anthropic API error (${resp.status}): ${errText.slice(0, 240)}`);
  }

  const data = (await resp.json()) as {
    content?: Array<{ type: string; input?: ParsedModelJson; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const toolBlock = data.content?.find((b) => b.type === 'tool_use');
  const parsed: ParsedModelJson = toolBlock?.input
    ? toolBlock.input
    : { reply: data.content?.[0]?.text || 'Updated your stand.', actions: [] };

  const inTok = data.usage?.input_tokens ?? 2500;
  const outTok = data.usage?.output_tokens ?? 400;
  const isSonnet = model.includes('sonnet');
  const rateIn = isSonnet ? 2.0 : 0.1;
  const rateOut = isSonnet ? 10.0 : 0.5;
  const estimatedCostUsd = (inTok * rateIn + outTok * rateOut) / 1_000_000 + audioCost;

  return {
    provider: 'anthropic',
    model,
    reply: parsed.reply || 'Updated your stand.',
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    transcript: transcript || parsed.transcript,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  };
}

// --- 4. OpenAI Chat Completions Adapter (JSON Mode) ---

async function callOpenAI(input: ProviderCallInput): Promise<ProviderCallOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  let effectiveMessage = input.userMessage || '';
  let transcript: string | undefined;
  let audioCost = 0;

  if (input.audio) {
    const tr = await transcribeWithOpenAI(input.audio);
    transcript = tr.transcript;
    audioCost = tr.costUsd;
    effectiveMessage = effectiveMessage
      ? `${effectiveMessage}\n\nVoice transcript: ${tr.transcript}`
      : tr.transcript;
  }

  const model = process.env.AI_MODEL || 'gpt-5.4-nano';
  const messages = [
    { role: 'system', content: input.systemPrompt },
    ...input.history.map((h) => ({ role: h.role, content: h.content })),
    {
      role: 'user',
      content: `${input.stateContext}\n\nUSER REQUEST:\n${effectiveMessage}`,
    },
  ];

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_completion_tokens: input.maxOutputTokens,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`OpenAI API error (${resp.status}): ${errText.slice(0, 240)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response');

  const parsed = parseJsonSafely(content);
  const inTok = data.usage?.prompt_tokens ?? 2500;
  const outTok = data.usage?.completion_tokens ?? 400;
  const estimatedCostUsd = (inTok * 0.2 + outTok * 1.25) / 1_000_000 + audioCost;

  return {
    provider: 'openai',
    model,
    reply: parsed.reply || 'Updated your stand.',
    actions: parsed.actions || [],
    transcript: transcript || parsed.transcript,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  };
}

export async function callStandAgentProvider(
  provider: ProviderName,
  input: ProviderCallInput
): Promise<ProviderCallOutput> {
  switch (provider) {
    case 'gemini':
      return callGemini(input);
    case 'anthropic':
      return callAnthropic(input);
    case 'openai':
      return callOpenAI(input);
  }
}
