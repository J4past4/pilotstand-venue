import {
  buildSessionCookie,
  checkLoginRateLimit,
  clearLoginFailures,
  createSessionToken,
  isSecureRequest,
  recordLoginFailure,
  registerBetaUser,
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

interface SignupBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  inviteCode?: unknown;
  company?: unknown;
  userType?: unknown;
  upcomingEvent?: unknown;
  standSize?: unknown;
  marketingOptIn?: unknown;
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

  const limit = await checkLoginRateLimit(req.headers);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Too many attempts. Please wait ${Math.ceil((limit.retryAfterSec || 60) / 60)} minute(s) and try again.`,
    });
  }

  let body: SignupBody | undefined;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as SignupBody;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
  } else {
    body = req.body as SignupBody | undefined;
  }

  const name = typeof body?.name === 'string' ? body.name : '';
  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const inviteCode = typeof body?.inviteCode === 'string' ? body.inviteCode : '';
  const company = typeof body?.company === 'string' ? body.company : undefined;
  const userType = typeof body?.userType === 'string' ? body.userType : undefined;
  const upcomingEvent = typeof body?.upcomingEvent === 'string' ? body.upcomingEvent : undefined;
  const standSize = typeof body?.standSize === 'string' ? body.standSize : undefined;
  const marketingOptIn = typeof body?.marketingOptIn === 'boolean' ? body.marketingOptIn : undefined;

  try {
    const result = await registerBetaUser({
      name,
      email,
      password,
      inviteCode,
      company,
      userType,
      upcomingEvent,
      standSize,
      marketingOptIn,
    });
    if (!result.ok) {
      if (result.status === 403) {
        await recordLoginFailure(req.headers);
      }
      return res.status(result.status).json({ error: result.error });
    }

    await clearLoginFailures(req.headers);
    const token = createSessionToken(result.user);
    res.setHeader('Set-Cookie', buildSessionCookie(token, isSecureRequest(req.headers)));

    return res.status(201).json({
      ok: true,
      authEnabled: true,
      user: result.user,
    });
  } catch (err) {
    console.error('[auth/signup] error:', err);
    return res.status(503).json({
      error: 'Could not complete sign-up right now. Please try again shortly.',
    });
  }
}
