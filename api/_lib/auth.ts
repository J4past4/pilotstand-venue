import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { extractClientIp } from './security.ts';

export type AppAccessMode = 'public' | 'beta' | 'passcode' | 'open';

export type PublicUserType = 'exhibitor' | 'agency' | 'builder' | 'supplier' | 'other';

export interface BetaUserRecord {
  email: string;
  name: string;
  role: 'admin' | 'beta';
  password: string;
  createdAt?: number;
  company?: string;
  userType?: PublicUserType;
  upcomingEvent?: string;
  standSize?: string;
  marketingOptIn?: boolean;
  source?: 'public-launch' | 'private-beta';
}

export interface PublicUserSummary {
  email: string;
  name: string;
  role: 'admin' | 'beta';
  createdAt?: number;
  company?: string;
  userType?: PublicUserType;
  upcomingEvent?: string;
  standSize?: string;
  marketingOptIn?: boolean;
  source?: 'public-launch' | 'private-beta';
}

export interface BetaSessionUser {
  email: string;
  name: string;
  role: 'admin' | 'beta';
  company?: string;
}

interface SessionPayload extends BetaSessionUser {
  iat: number;
  exp: number;
  codeSig?: string;
}

export const SESSION_COOKIE_NAME = 'zuki_beta_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_LOGINS_PER_WINDOW = 10;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginFailureBucket {
  count: number;
  resetAt: number;
}

const loginFailures = new Map<string, LoginFailureBucket>();
// Local dev / unit-test fallback store when Upstash Redis / Vercel KV is not configured
const memoryRegisteredUsers = new Map<string, BetaUserRecord>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getRedisConfig(
  env: NodeJS.ProcessEnv = process.env
): { url: string; token: string } | null {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

export function hasDurableUserStore(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(getRedisConfig(env));
}

export async function redisPipeline(
  commands: Array<Array<string | number>>,
  env: NodeJS.ProcessEnv = process.env
): Promise<Array<{ result?: unknown; error?: string }> | null> {
  const cfg = getRedisConfig(env);
  if (!cfg) return null;

  const resp = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!resp.ok) {
    throw new Error(`User store request failed (${resp.status})`);
  }
  return (await resp.json()) as Array<{ result?: unknown; error?: string }>;
}

async function redisCommand<T = unknown>(
  args: Array<string | number>,
  env: NodeJS.ProcessEnv = process.env
): Promise<T | null> {
  const results = await redisPipeline([args], env);
  if (!results) return null;
  if (results[0]?.error) {
    throw new Error(results[0].error);
  }
  return (results[0]?.result as T | undefined) ?? null;
}

function userRedisKey(email: string): string {
  return `zuki-expo:beta-user:${normalizeEmail(email)}`;
}

const VALID_USER_TYPES = new Set<PublicUserType>([
  'exhibitor',
  'agency',
  'builder',
  'supplier',
  'other',
]);

function sanitizeUserType(raw: unknown): PublicUserType | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.trim().toLowerCase() as PublicUserType;
  return VALID_USER_TYPES.has(cleaned) ? cleaned : undefined;
}

function parseStoredUserRecord(raw: string): BetaUserRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BetaUserRecord>;
    if (
      typeof parsed.email === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.password === 'string'
    ) {
      return {
        email: normalizeEmail(parsed.email),
        name: parsed.name,
        role: parsed.role === 'admin' ? 'admin' : 'beta',
        password: parsed.password,
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : undefined,
        company: typeof parsed.company === 'string' && parsed.company.trim() ? parsed.company.trim() : undefined,
        userType: sanitizeUserType(parsed.userType),
        upcomingEvent:
          typeof parsed.upcomingEvent === 'string' && parsed.upcomingEvent.trim()
            ? parsed.upcomingEvent.trim()
            : undefined,
        standSize:
          typeof parsed.standSize === 'string' && parsed.standSize.trim()
            ? parsed.standSize.trim()
            : undefined,
        marketingOptIn: typeof parsed.marketingOptIn === 'boolean' ? parsed.marketingOptIn : undefined,
        source:
          parsed.source === 'public-launch' || parsed.source === 'private-beta'
            ? parsed.source
            : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}

async function getStoredRegisteredUser(
  email: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<BetaUserRecord | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  if (hasDurableUserStore(env)) {
    const raw = await redisCommand<string | null>(['GET', userRedisKey(normalized)], env);
    if (!raw || typeof raw !== 'string') return null;
    return parseStoredUserRecord(raw);
  }

  return memoryRegisteredUsers.get(normalized) ?? null;
}

async function saveRegisteredUser(
  record: BetaUserRecord,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const normalized = normalizeEmail(record.email);
  const toSave: BetaUserRecord = { ...record, email: normalized };

  if (hasDurableUserStore(env)) {
    const cmds: Array<Array<string | number>> = [
      ['SET', userRedisKey(normalized), JSON.stringify(toSave)],
      ['SADD', 'zuki-expo:beta-users', normalized],
    ];
    if (toSave.source === 'public-launch') {
      cmds.push(['SADD', 'zuki-expo:public-users', normalized]);
    }
    const results = await redisPipeline(cmds, env);
    if (!results) {
      throw new Error('Failed to persist user record');
    }
    return;
  }

  memoryRegisteredUsers.set(normalized, toSave);
}

/** Returns all registered user summaries (without password hashes), newest first. */
export async function listRegisteredUsers(
  env: NodeJS.ProcessEnv = process.env,
  limit = 200
): Promise<PublicUserSummary[]> {
  const summaries: PublicUserSummary[] = [];

  if (hasDurableUserStore(env)) {
    const emails = await redisCommand<string[] | null>(['SMEMBERS', 'zuki-expo:beta-users'], env);
    if (Array.isArray(emails) && emails.length > 0) {
      const slice = emails.slice(0, limit);
      const results = await redisPipeline(
        slice.map((em) => ['GET', userRedisKey(em)]),
        env
      );
      if (results) {
        for (const r of results) {
          if (typeof r.result === 'string') {
            const parsed = parseStoredUserRecord(r.result);
            if (parsed) {
              const { password: _pw, ...safe } = parsed;
              void _pw;
              summaries.push(safe);
            }
          }
        }
      }
    }
  } else {
    for (const rec of memoryRegisteredUsers.values()) {
      const { password: _pw, ...safe } = rec;
      void _pw;
      summaries.push(safe);
    }
  }

  return summaries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit);
}

/** Test helper to reset in-memory registered users between unit tests */
export function clearInMemoryRegisteredUsers(): void {
  memoryRegisteredUsers.clear();
}

/**
 * Parses `BETA_USERS` environment variable.
 *
 * Supported formats:
 * 1. JSON array (recommended):
 *    [{"email":"you@company.com","name":"James","role":"admin","password":"..."}]
 * 2. Comma-separated shorthand:
 *    you@company.com:password123:James:admin,marketer@company.com:secret456:Alex:beta
 */
export function parseBetaUsers(raw: string | undefined = process.env.BETA_USERS): BetaUserRecord[] {
  const trimmed = (raw || '').trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) return [];
      const users: BetaUserRecord[] = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        const email = typeof rec.email === 'string' ? normalizeEmail(rec.email) : '';
        const password = typeof rec.password === 'string' ? rec.password : '';
        if (!email || !password) continue;
        const name =
          typeof rec.name === 'string' && rec.name.trim()
            ? rec.name.trim()
            : email.split('@')[0] || 'Beta User';
        const role: 'admin' | 'beta' = rec.role === 'admin' ? 'admin' : 'beta';
        users.push({ email, name, role, password });
      }
      return users;
    } catch {
      return [];
    }
  }

  // Shorthand: email:password[:name[:role]],email2:password2[:name2[:role2]]
  const users: BetaUserRecord[] = [];
  for (const part of trimmed.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    const [rawEmail, rawPass, rawName, rawRole] = seg.split(':');
    const email = normalizeEmail(rawEmail || '');
    const password = rawPass || '';
    if (!email || !password) continue;
    const name = (rawName || '').trim() || email.split('@')[0] || 'Beta User';
    const role: 'admin' | 'beta' = (rawRole || '').trim() === 'admin' ? 'admin' : 'beta';
    users.push({ email, name, role, password });
  }
  return users;
}

export function parseInviteCodes(raw: string | undefined = process.env.BETA_INVITE_CODE): string[] {
  return (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getAppAccessMode(env: NodeJS.ProcessEnv = process.env): AppAccessMode {
  const explicit = (env.APP_ACCESS_MODE || '').trim().toLowerCase();
  if (explicit === 'public') return 'public';
  if (explicit === 'passcode') return 'passcode';
  if (explicit === 'beta') return 'beta';
  if (explicit === 'open') return 'open';
  if ((env.PUBLIC_LAUNCH_ENABLED || '').trim().toLowerCase() === 'true') return 'public';
  if (parseBetaUsers(env.BETA_USERS).length > 0 || parseInviteCodes(env.BETA_INVITE_CODE).length > 0) {
    return 'beta';
  }
  return 'open';
}

export function isPublicLaunchMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return getAppAccessMode(env) === 'public';
}

export function isPasscodeMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return getAppAccessMode(env) === 'passcode';
}

function passcodeFingerprint(env: NodeJS.ProcessEnv = process.env): string {
  const codes = parseInviteCodes(env.BETA_INVITE_CODE).join(',');
  return createHash('sha256').update(`zuki-passcode::${codes}`).digest('hex').slice(0, 16);
}

/**
 * Verifies a single shared beta passcode (case-sensitive, constant-time) against BETA_INVITE_CODE.
 * Changing BETA_INVITE_CODE in Vercel immediately invalidates all previously issued passcode sessions.
 */
export function authenticatePasscode(
  inputCode: string,
  env: NodeJS.ProcessEnv = process.env
): BetaSessionUser | null {
  const trimmed = inputCode.trim();
  if (!trimmed) return null;
  const codes = parseInviteCodes(env.BETA_INVITE_CODE);
  if (codes.length === 0) return null;
  const inputHash = sha256Buffer(trimmed);
  const matched = codes.some((code) => timingSafeEqual(inputHash, sha256Buffer(code)));
  if (!matched) return null;
  return {
    email: 'beta-access@zukistudio.co.uk',
    name: 'Beta Access',
    role: 'admin',
  };
}

export function isBetaSignupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isPasscodeMode(env)) return false;
  return isPublicLaunchMode(env) || parseInviteCodes(env.BETA_INVITE_CODE).length > 0;
}

export function isBetaAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getAppAccessMode(env) !== 'open';
}

function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (env.AUTH_SESSION_SECRET || '').trim();
  if (explicit) return explicit;
  // Deterministic fallback derived from server auth config so sessions remain valid across
  // Vercel serverless invocations even if AUTH_SESSION_SECRET was not separately set.
  return createHash('sha256')
    .update(
      `zuki-beta-fallback::${env.APP_ACCESS_MODE || ''}::${env.BETA_USERS || ''}::${env.BETA_INVITE_CODE || ''}`
    )
    .digest('hex');
}

function sha256Buffer(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedHex = scryptSync(plainPassword, salt, 32).toString('hex');
  return `scrypt:${salt}:${derivedHex}`;
}

/**
 * Constant-time password check supporting either:
 * - `scrypt:<salt>:<hexDerivedKey>` (salted scrypt hash)
 * - plain password strings (compared via constant-time SHA-256 digest equality)
 */
export function verifyPassword(inputPassword: string, storedPassword: string): boolean {
  if (!inputPassword || !storedPassword) return false;

  if (storedPassword.startsWith('scrypt:')) {
    const parts = storedPassword.split(':');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    try {
      const expected = Buffer.from(expectedHex, 'hex');
      const derived = scryptSync(inputPassword, salt, expected.length);
      return expected.length === derived.length && timingSafeEqual(expected, derived);
    } catch {
      return false;
    }
  }

  return timingSafeEqual(sha256Buffer(inputPassword), sha256Buffer(storedPassword));
}

export function verifyInviteCode(
  inputCode: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const normalizedInput = inputCode.trim().toLowerCase();
  if (!normalizedInput) return false;
  const codes = parseInviteCodes(env.BETA_INVITE_CODE);
  if (codes.length === 0) return false;
  const inputHash = sha256Buffer(normalizedInput);
  return codes.some((code) => timingSafeEqual(inputHash, sha256Buffer(code.toLowerCase())));
}

export function isEmailAllowedForSignup(
  email: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const normalized = normalizeEmail(email);
  const allowedEmails = (env.BETA_ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
  const allowedDomains = (env.BETA_ALLOWED_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

  if (allowedEmails.length === 0 && allowedDomains.length === 0) return true;
  if (allowedEmails.includes(normalized)) return true;

  const domain = normalized.split('@')[1] || '';
  return Boolean(domain && allowedDomains.includes(domain));
}

export function authenticateBetaUser(
  email: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env
): BetaSessionUser | null {
  const targetEmail = normalizeEmail(email);
  if (!targetEmail || !password) return null;

  const users = parseBetaUsers(env.BETA_USERS);
  const found = users.find((u) => u.email === targetEmail);
  if (!found) return null;

  if (!verifyPassword(password, found.password)) return null;

  return {
    email: found.email,
    name: found.name,
    role: found.role,
  };
}

export async function authenticateBetaUserAsync(
  email: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<BetaSessionUser | null> {
  const envUser = authenticateBetaUser(email, password, env);
  if (envUser) return envUser;

  const targetEmail = normalizeEmail(email);
  if (!targetEmail || !password) return null;

  const stored = await getStoredRegisteredUser(targetEmail, env);
  if (!stored) return null;
  if (!verifyPassword(password, stored.password)) return null;

  return {
    email: stored.email,
    name: stored.name,
    role: stored.role,
    ...(stored.company ? { company: stored.company } : {}),
  };
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  inviteCode?: string;
  company?: string;
  userType?: string;
  upcomingEvent?: string;
  standSize?: string;
  marketingOptIn?: boolean;
}

export type SignupResult =
  | { ok: true; user: BetaSessionUser }
  | { ok: false; status: number; error: string };

function sanitizeShortText(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLen);
}

export async function registerBetaUser(
  input: SignupInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<SignupResult> {
  const publicMode = isPublicLaunchMode(env);

  if (!isBetaSignupEnabled(env)) {
    return {
      ok: false,
      status: 403,
      error: 'Self-service sign-up is not enabled for this workspace.',
    };
  }

  // On Vercel production, require Upstash Redis / Vercel KV so registered accounts survive cold starts
  if (env.VERCEL && !hasDurableUserStore(env)) {
    return {
      ok: false,
      status: 503,
      error:
        'Account sign-up storage is not connected yet. Connect Upstash Redis in Vercel Storage (or contact your workspace admin).',
    };
  }

  const name = input.name.trim().replace(/\s+/g, ' ');
  const email = normalizeEmail(input.email);
  const password = input.password;
  const inviteCode = (input.inviteCode || '').trim();

  if (name.length < 2 || name.length > 80) {
    return { ok: false, status: 400, error: 'Please enter your name (2–80 characters).' };
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return { ok: false, status: 400, error: 'Please enter a valid work email address.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    return {
      ok: false,
      status: 400,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    };
  }
  if (!publicMode && !verifyInviteCode(inviteCode, env)) {
    return { ok: false, status: 403, error: 'Invalid beta invite code.' };
  }
  if (!publicMode && !isEmailAllowedForSignup(email, env)) {
    return {
      ok: false,
      status: 403,
      error: 'This email address is not on the private beta invite list.',
    };
  }

  const staticUsers = parseBetaUsers(env.BETA_USERS);
  if (staticUsers.some((u) => u.email === email)) {
    return {
      ok: false,
      status: 409,
      error: 'An account with this email already exists. Please sign in instead.',
    };
  }

  const existing = await getStoredRegisteredUser(email, env);
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: 'An account with this email already exists. Please sign in instead.',
    };
  }

  const company = sanitizeShortText(input.company, 100);
  const userType = sanitizeUserType(input.userType);
  const upcomingEvent = sanitizeShortText(input.upcomingEvent, 120);
  const standSize = sanitizeShortText(input.standSize, 40);
  const marketingOptIn = typeof input.marketingOptIn === 'boolean' ? input.marketingOptIn : undefined;

  const record: BetaUserRecord = {
    email,
    name,
    role: 'beta',
    password: hashPassword(password),
    createdAt: Date.now(),
    source: publicMode ? 'public-launch' : 'private-beta',
    ...(company ? { company } : {}),
    ...(userType ? { userType } : {}),
    ...(upcomingEvent ? { upcomingEvent } : {}),
    ...(standSize ? { standSize } : {}),
    ...(marketingOptIn !== undefined ? { marketingOptIn } : {}),
  };
  await saveRegisteredUser(record, env);

  return {
    ok: true,
    user: {
      email: record.email,
      name: record.name,
      role: record.role,
      ...(record.company ? { company: record.company } : {}),
    },
  };
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signTokenBody(bodyB64: string, secret: string): string {
  return createHmac('sha256', secret).update(bodyB64).digest('base64url');
}

export function createSessionToken(
  user: BetaSessionUser,
  env: NodeJS.ProcessEnv = process.env,
  nowSec: number = Math.floor(Date.now() / 1000)
): string {
  const payload: SessionPayload = {
    email: user.email,
    name: user.name,
    role: user.role,
    ...(user.company ? { company: user.company } : {}),
    ...(isPasscodeMode(env) ? { codeSig: passcodeFingerprint(env) } : {}),
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SECONDS,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = signTokenBody(body, getSessionSecret(env));
  return `${body}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  nowSec: number = Math.floor(Date.now() / 1000)
): BetaSessionUser | null {
  if (!token) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0 || dotIdx === token.length - 1) return null;

  const body = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  const expectedSig = signTokenBody(body, getSessionSecret(env));

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as Partial<SessionPayload>;
    if (
      typeof parsed.email !== 'string' ||
      typeof parsed.name !== 'string' ||
      (parsed.role !== 'admin' && parsed.role !== 'beta') ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (parsed.exp <= nowSec) return null;

    if (isPasscodeMode(env)) {
      if (parsed.codeSig !== passcodeFingerprint(env)) {
        return null;
      }
      return {
        email: parsed.email,
        name: parsed.name,
        role: parsed.role,
      };
    }

    // When only static BETA_USERS is used (no self-signup), verify the user still exists
    // in BETA_USERS so removing them from Vercel env revokes their session immediately.
    if (!isBetaSignupEnabled(env)) {
      const activeUsers = parseBetaUsers(env.BETA_USERS);
      if (activeUsers.length > 0 && !activeUsers.some((u) => u.email === parsed.email)) {
        return null;
      }
    }

    return {
      email: parsed.email,
      name: parsed.name,
      role: parsed.role,
      ...(typeof parsed.company === 'string' && parsed.company ? { company: parsed.company } : {}),
    };
  } catch {
    return null;
  }
}

export function parseCookieHeader(
  cookieHeader: string | string[] | undefined
): Record<string, string> {
  const raw = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader || '';
  const map: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    if (key) map[key] = decodeURIComponent(val);
  }
  return map;
}

export function getSessionFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env
): BetaSessionUser | null {
  const cookies = parseCookieHeader(headers.cookie);
  return verifySessionToken(cookies[SESSION_COOKIE_NAME], env);
}

export function isSecureRequest(headers: Record<string, string | string[] | undefined>): boolean {
  const proto = headers['x-forwarded-proto'];
  const protoVal = Array.isArray(proto) ? proto[0] : proto;
  if (protoVal === 'https') return true;
  if (protoVal === 'http') return false;
  return process.env.NODE_ENV === 'production';
}

export function buildSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearSessionCookie(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

const LOGIN_WINDOW_SECONDS = Math.round(LOGIN_WINDOW_MS / 1000);

function loginRateLimitRedisKey(ip: string): string {
  return `zuki-expo:auth-fail:${ip}`;
}

export async function checkLoginRateLimit(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const ip = extractClientIp(headers);

  if (hasDurableUserStore(env)) {
    try {
      const cfg = getRedisConfig(env)!;
      const key = loginRateLimitRedisKey(ip);
      const resp = await fetch(`${cfg.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['GET', key],
          ['TTL', key],
        ]),
      });
      if (resp.ok) {
        const results = (await resp.json()) as Array<{ result?: string | number | null }>;
        const count = Number(results[0]?.result ?? 0);
        const ttl = Number(results[1]?.result ?? LOGIN_WINDOW_SECONDS);
        if (Number.isFinite(count) && count >= MAX_FAILED_LOGINS_PER_WINDOW) {
          return {
            allowed: false,
            retryAfterSec: Math.max(1, ttl > 0 ? ttl : LOGIN_WINDOW_SECONDS),
          };
        }
        return { allowed: true };
      }
    } catch {
      // Fall through to in-memory limiter if Redis is transiently unreachable
    }
  }

  const now = Date.now();
  const existing = loginFailures.get(ip);
  if (!existing || existing.resetAt <= now) {
    return { allowed: true };
  }
  if (existing.count >= MAX_FAILED_LOGINS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true };
}

export async function recordLoginFailure(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const ip = extractClientIp(headers);

  if (hasDurableUserStore(env)) {
    try {
      const cfg = getRedisConfig(env)!;
      const key = loginRateLimitRedisKey(ip);
      await fetch(`${cfg.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, LOGIN_WINDOW_SECONDS, 'NX'],
        ]),
      });
      return;
    } catch {
      // Fall through to in-memory fallback
    }
  }

  const now = Date.now();
  const existing = loginFailures.get(ip);
  if (!existing || existing.resetAt <= now) {
    loginFailures.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

export async function clearLoginFailures(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const ip = extractClientIp(headers);
  loginFailures.delete(ip);

  if (hasDurableUserStore(env)) {
    try {
      await redisCommand(['DEL', loginRateLimitRedisKey(ip)], env);
    } catch {
      // Ignore cleanup failure
    }
  }
}

/**
 * Checks whether an incoming API request is authorized.
 * When neither `BETA_USERS` nor `BETA_INVITE_CODE` is configured, returns `{ authorized: true, user: null }`.
 * Otherwise requires a valid signed beta session cookie.
 */
export function requireBetaSession(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env
): { authorized: boolean; user: BetaSessionUser | null } {
  if (!isBetaAuthEnabled(env)) {
    return { authorized: true, user: null };
  }
  const user = getSessionFromHeaders(headers, env);
  return { authorized: Boolean(user), user };
}

/**
 * Checks whether an incoming API request belongs to an authenticated admin user.
 */
export function requireAdminSession(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env
): { authorized: boolean; user: BetaSessionUser | null } {
  const user = getSessionFromHeaders(headers, env);
  if (!user || user.role !== 'admin') {
    return { authorized: false, user: null };
  }
  return { authorized: true, user };
}
