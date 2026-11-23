import type { StandConfig, StandItem } from '../types/stand';
import { buildCompactStandState, getAgentCatalogManifest } from './catalogContext';
import { runLocalPreviewAgent } from './localFallback';
import type {
  AgentAudioPayload,
  AgentHistoryTurn,
  AgentRequestPayload,
  AgentResponsePayload,
} from './types';

export interface AgentServerStatus {
  configured: boolean;
  provider: 'gemini' | 'anthropic' | 'openai' | null;
  model: string | null;
}

export async function fetchAgentStatus(): Promise<AgentServerStatus> {
  try {
    const resp = await fetch('/api/stand-agent', { method: 'GET' });
    const ct = resp.headers.get('content-type') || '';
    if (resp.ok && ct.includes('application/json')) {
      return (await resp.json()) as AgentServerStatus;
    }
  } catch {
    // Local Vite dev without serverless runtime
  }
  return { configured: false, provider: null, model: null };
}

export interface SendAgentPromptOptions {
  message?: string;
  audio?: AgentAudioPayload;
  history: AgentHistoryTurn[];
  config: StandConfig;
  items: StandItem[];
  turnstileToken?: string;
}

export async function sendStandAgentPrompt(
  opts: SendAgentPromptOptions
): Promise<AgentResponsePayload> {
  const compactState = buildCompactStandState(opts.config, opts.items);
  const manifest = getAgentCatalogManifest();

  const payload: AgentRequestPayload = {
    message: opts.message?.trim() || undefined,
    audio: opts.audio,
    history: opts.history.slice(-6),
    state: compactState,
    manifest,
    turnstileToken: opts.turnstileToken,
  };

  try {
    const resp = await fetch('/api/stand-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const contentType = resp.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? ((await resp.json()) as Record<string, unknown>) : null;

    if (resp.ok && data) {
      return data as unknown as AgentResponsePayload;
    }

    // Local Vite dev (404 / HTML rewrite) or unconfigured server key (501):
    // gracefully fall back to zero-cost local preview engine for text prompts.
    const isUnconfigured =
      resp.status === 404 ||
      resp.status === 501 ||
      !isJson ||
      data?.code === 'AI_NOT_CONFIGURED';

    if (isUnconfigured) {
      if (opts.message?.trim()) {
        return runLocalPreviewAgent(opts.message, compactState);
      }
      throw new Error(
        'Voice audio transcription requires a configured API key on Vercel (GEMINI_API_KEY or OPENAI_API_KEY). Try Web Speech dictation or type a prompt.'
      );
    }

    const errMsg =
      typeof data?.error === 'string'
        ? data.error
        : `Request failed with status ${resp.status}`;
    throw new Error(errMsg);
  } catch (err) {
    // Network unreachable in offline preview: fall back for text prompts
    if (err instanceof TypeError && opts.message?.trim()) {
      return runLocalPreviewAgent(opts.message, compactState);
    }
    throw err;
  }
}
