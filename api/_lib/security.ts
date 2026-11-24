/**
 * Security, rate-limiting, Turnstile verification, and global spend circuit-breaker
 * for /api/stand-agent.
 *
 * Supports Upstash Redis REST API in production (zero extra npm dependencies)
 * and falls back gracefully to an in-memory sliding window for local dev.
 */

export interface SecurityConfig {
  maxPromptChars: number;
  maxHistoryTurns: number;
  maxAudioBase64Bytes: number;
  maxAudioDurationSec: number;
  hourlyLimitPerIp: number;
  dailyLimitPerIp: number;
  globalDailyRequestCap: number;
  maxOutputTokens: number;
}

export function getSecurityConfig(): SecurityConfig {
  const num = (key: string, fallback: number): number => {
    const parsed = Number(process.env[key]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    maxPromptChars: num('AI_MAX_PROMPT_CHARS', 1000),
    maxHistoryTurns: num('AI_MAX_HISTORY_TURNS', 6),
    maxAudioBase64Bytes: num('AI_MAX_AUDIO_BYTES', 1_500_000), // ~1.1MB binary (~30s opus/webm)
    maxAudioDurationSec: num('AI_MAX_AUDIO_SECONDS', 32),
    hourlyLimitPerIp: num('AI_RATE_LIMIT_HOURLY', 20),
    dailyLimitPerIp: num('AI_RATE_LIMIT_DAILY', 50),
    globalDailyRequestCap: num('AI_GLOBAL_DAILY_CAP', 1500), // Hard circuit breaker (~$0.60-$1.50/day on Flash-Lite/Haiku)
    maxOutputTokens: num('AI_MAX_OUTPUT_TOKENS', 1200),
  };
}

export function extractClientIp(headers: Record<string, string | string[] | undefined>): string {
  const xff = headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers['x-real-ip'];
  return (Array.isArray(realIp) ? realIp[0] : realIp) || 'unknown';
}

export function isAllowedOrigin(headers: Record<string, string | string[] | undefined>): boolean {
  const allowList = process.env.ALLOWED_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowList || allowList.length === 0) return true;

  const originHeader = headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (!origin) return true; // Same-origin requests may omit Origin on some clients
  return allowList.some((allowed) => origin === allowed);
}

export async function verifyTurnstileToken(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // Turnstile not configured
  if (!token) return false;

  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip !== 'unknown') form.set('remoteip', ip);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// --- Rate limiter & daily global circuit breaker ---

interface CounterBucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, CounterBucket>();

async function incrementCounter(key: string, windowSeconds: number): Promise<number> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      const resp = await fetch(`${upstashUrl.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, windowSeconds, 'NX'],
        ]),
      });
      if (resp.ok) {
        const results = (await resp.json()) as Array<{ result?: number }>;
        if (typeof results[0]?.result === 'number') {
          return results[0].result;
        }
      }
    } catch {
      // Fall through to in-memory fallback if Redis is transiently unreachable
    }
  }

  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export interface RateLimitResult {
  allowed: boolean;
  statusCode?: number;
  error?: string;
  remainingHourly: number;
  remainingDaily: number;
}

export async function enforceRateLimits(
  ip: string,
  cfg: SecurityConfig
): Promise<RateLimitResult> {
  const dayKey = new Date().toISOString().slice(0, 10);
  const hourKey = new Date().toISOString().slice(0, 13);

  const [globalCount, hourlyCount, dailyCount] = await Promise.all([
    incrementCounter(`zuki-expo:global:${dayKey}`, 86_400),
    incrementCounter(`zuki-expo:ip:h:${ip}:${hourKey}`, 3_600),
    incrementCounter(`zuki-expo:ip:d:${ip}:${dayKey}`, 86_400),
  ]);

  const remainingHourly = Math.max(0, cfg.hourlyLimitPerIp - hourlyCount);
  const remainingDaily = Math.max(0, cfg.dailyLimitPerIp - dailyCount);

  if (globalCount > cfg.globalDailyRequestCap) {
    return {
      allowed: false,
      statusCode: 503,
      error:
        'Zuki AI Designer has reached its daily safety budget cap. Manual 3D editing remains fully available — please try again tomorrow.',
      remainingHourly,
      remainingDaily,
    };
  }

  if (hourlyCount > cfg.hourlyLimitPerIp) {
    return {
      allowed: false,
      statusCode: 429,
      error: `Rate limit reached (${cfg.hourlyLimitPerIp} AI prompts/hour). Please wait a bit before sending another prompt.`,
      remainingHourly: 0,
      remainingDaily,
    };
  }

  if (dailyCount > cfg.dailyLimitPerIp) {
    return {
      allowed: false,
      statusCode: 429,
      error: `Daily limit reached (${cfg.dailyLimitPerIp} AI prompts/day). Please try again tomorrow.`,
      remainingHourly,
      remainingDaily: 0,
    };
  }

  return {
    allowed: true,
    remainingHourly,
    remainingDaily,
  };
}
