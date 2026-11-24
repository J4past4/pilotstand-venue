import {
  checkPublicFormRateLimit,
  trackPlatformMetric,
  type MetricEventType,
} from './_lib/launchStore.ts';
import { isAllowedOrigin } from './_lib/security.ts';

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

interface MetricBody {
  event?: unknown;
  estimatedTotalGbp?: unknown;
  standAreaM2?: unknown;
  categories?: unknown;
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

  const limit = await checkPublicFormRateLimit(req.headers, 'metrics', 120, 900);
  if (!limit.allowed) {
    return res.status(200).json({ ok: true, throttled: true });
  }

  let body: MetricBody | undefined;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as MetricBody;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
  } else {
    body = req.body as MetricBody | undefined;
  }

  const event = typeof body?.event === 'string' ? (body.event as MetricEventType) : null;
  if (!event) {
    return res.status(400).json({ error: 'Missing metric event.' });
  }

  try {
    const ok = await trackPlatformMetric({
      event,
      estimatedTotalGbp:
        typeof body?.estimatedTotalGbp === 'number' ? body.estimatedTotalGbp : undefined,
      standAreaM2: typeof body?.standAreaM2 === 'number' ? body.standAreaM2 : undefined,
      categories: Array.isArray(body?.categories)
        ? body.categories.filter((c): c is string => typeof c === 'string')
        : undefined,
    });
    return res.status(ok ? 200 : 400).json({ ok });
  } catch (err) {
    console.error('[metrics] error:', err);
    return res.status(200).json({ ok: false });
  }
}
