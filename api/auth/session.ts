import { getSessionFromHeaders, isBetaAuthEnabled } from '../_lib/auth.ts';

interface VercelLikeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  setHeader(name: string, value: string): void;
  json(payload: unknown): void;
}

export default function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authEnabled = isBetaAuthEnabled();
  if (!authEnabled) {
    return res.status(200).json({
      authEnabled: false,
      authenticated: true,
      user: null,
    });
  }

  const user = getSessionFromHeaders(req.headers);
  return res.status(200).json({
    authEnabled: true,
    authenticated: Boolean(user),
    user,
  });
}
