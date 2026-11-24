import {
  authenticateBetaUserAsync,
  buildSessionCookie,
  checkLoginRateLimit,
  clearLoginFailures,
  createSessionToken,
  isBetaAuthEnabled,
  isSecureRequest,
  recordLoginFailure,
} from '../_lib/auth.ts';
import { isAllowedOrigin } from '../_lib/security.ts';

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

interface LoginBody {
  email?: unknown;
  password?: unknown;
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

  if (!isBetaAuthEnabled()) {
    return res.status(200).json({ ok: true, authEnabled: false, user: null });
  }

  const limit = await checkLoginRateLimit(req.headers);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Too many sign-in attempts. Please wait ${Math.ceil((limit.retryAfterSec || 60) / 60)} minute(s) and try again.`,
    });
  }

  let body: LoginBody | undefined;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as LoginBody;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
  } else {
    body = req.body as LoginBody | undefined;
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter both your email address and password.' });
  }

  try {
    const user = await authenticateBetaUserAsync(email, password);
    if (!user) {
      await recordLoginFailure(req.headers);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await clearLoginFailures(req.headers);
    const token = createSessionToken(user);
    res.setHeader('Set-Cookie', buildSessionCookie(token, isSecureRequest(req.headers)));

    return res.status(200).json({
      ok: true,
      authEnabled: true,
      user,
    });
  } catch (err) {
    console.error('[auth/login] error:', err);
    return res.status(503).json({
      error: 'Authentication storage is temporarily unavailable. Please try again shortly.',
    });
  }
}
