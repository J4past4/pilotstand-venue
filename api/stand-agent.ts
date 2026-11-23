import type { AgentRequestPayload, AgentResponsePayload } from '../src/agent/types.ts';
import { buildStandAgentSystemPrompt, buildUserStateContext } from './_lib/prompt.ts';
import {
  callStandAgentProvider,
  getDefaultModelForProvider,
  ProviderRateLimitError,
  resolveActiveProvider,
} from './_lib/providers.ts';
import {
  enforceRateLimits,
  extractClientIp,
  getSecurityConfig,
  isAllowedOrigin,
  verifyTurnstileToken,
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

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const activeProvider = resolveActiveProvider();
    return res.status(200).json({
      configured: Boolean(activeProvider),
      provider: activeProvider,
      model: activeProvider ? getDefaultModelForProvider(activeProvider) : null,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAllowedOrigin(req.headers)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const provider = resolveActiveProvider();
  if (!provider) {
    return res.status(501).json({
      code: 'AI_NOT_CONFIGURED',
      error:
        'No AI provider API key is configured on the server. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in Vercel Environment Variables.',
    });
  }

  const cfg = getSecurityConfig();
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as
    | Partial<AgentRequestPayload>
    | undefined;

  if (!body || !body.state || !body.manifest) {
    return res.status(400).json({ error: 'Missing required stand state or catalog manifest.' });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const audio = body.audio;

  if (!message && !audio) {
    return res.status(400).json({ error: 'Please provide a text message or voice clip.' });
  }

  if (message.length > cfg.maxPromptChars) {
    return res.status(400).json({
      error: `Message is too long (max ${cfg.maxPromptChars} characters).`,
    });
  }

  if (audio) {
    if (typeof audio.base64 !== 'string' || audio.base64.length > cfg.maxAudioBase64Bytes) {
      return res.status(413).json({
        error: 'Voice clip exceeds the 30-second size limit. Please keep voice requests concise.',
      });
    }
    if (typeof audio.durationSec === 'number' && audio.durationSec > cfg.maxAudioDurationSec) {
      return res.status(400).json({
        error: `Voice clip is too long (max ${cfg.maxAudioDurationSec}s).`,
      });
    }
  }

  const ip = extractClientIp(req.headers);

  // Optional Cloudflare Turnstile verification
  const turnstileOk = await verifyTurnstileToken(body.turnstileToken, ip);
  if (!turnstileOk) {
    return res.status(403).json({ error: 'Bot verification failed. Please refresh and try again.' });
  }

  // Per-IP hourly/daily + global daily budget circuit breaker
  const rateLimit = await enforceRateLimits(ip, cfg);
  if (!rateLimit.allowed) {
    return res.status(rateLimit.statusCode || 429).json({
      error: rateLimit.error,
      remainingHourly: rateLimit.remainingHourly,
      remainingDaily: rateLimit.remainingDaily,
    });
  }

  const safeHistory = Array.isArray(body.history)
    ? body.history
        .filter(
          (t) =>
            t &&
            (t.role === 'user' || t.role === 'assistant') &&
            typeof t.content === 'string' &&
            t.content.trim().length > 0
        )
        .slice(-cfg.maxHistoryTurns)
        .map((t) => ({
          role: t.role,
          content: t.content.slice(0, 600),
        }))
    : [];

  try {
    const result = await callStandAgentProvider(provider, {
      systemPrompt: buildStandAgentSystemPrompt(body.manifest),
      stateContext: buildUserStateContext(body.state),
      history: safeHistory,
      userMessage: message || undefined,
      audio,
      maxOutputTokens: cfg.maxOutputTokens,
    });

    const payload: AgentResponsePayload = {
      reply: result.reply,
      actions: result.actions,
      transcript: result.transcript,
      meta: {
        provider: result.provider,
        model: result.model,
        estimatedCostUsd: result.estimatedCostUsd,
        remainingHourly: rateLimit.remainingHourly,
        remainingDaily: rateLimit.remainingDaily,
      },
    };

    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof ProviderRateLimitError) {
      return res.status(429).json({ error: err.message });
    }
    console.error('[stand-agent] provider error:', err);
    return res.status(502).json({
      error:
        'The AI designer encountered a temporary error. Please try again in a moment.',
    });
  }
}
