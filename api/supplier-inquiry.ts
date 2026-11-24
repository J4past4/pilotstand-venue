import {
  checkPublicFormRateLimit,
  submitSupplierInquiry,
  type SupplierPlanInterest,
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

interface SupplierInquiryBody {
  contactName?: unknown;
  email?: unknown;
  companyName?: unknown;
  website?: unknown;
  categories?: unknown;
  region?: unknown;
  skuCount?: unknown;
  cadReadiness?: unknown;
  planInterest?: unknown;
  notes?: unknown;
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

  const limit = await checkPublicFormRateLimit(req.headers, 'supplier-inquiry', 6, 900);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Too many submissions. Please wait ${Math.ceil((limit.retryAfterSec || 60) / 60)} minute(s) and try again.`,
    });
  }

  let body: SupplierInquiryBody | undefined;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as SupplierInquiryBody;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
  } else {
    body = req.body as SupplierInquiryBody | undefined;
  }

  try {
    const result = await submitSupplierInquiry({
      contactName: typeof body?.contactName === 'string' ? body.contactName : '',
      email: typeof body?.email === 'string' ? body.email : '',
      companyName: typeof body?.companyName === 'string' ? body.companyName : '',
      website: typeof body?.website === 'string' ? body.website : undefined,
      categories: Array.isArray(body?.categories)
        ? body.categories.filter((c): c is string => typeof c === 'string')
        : [],
      region: typeof body?.region === 'string' ? body.region : 'UK',
      skuCount: typeof body?.skuCount === 'string' ? body.skuCount : '1–25',
      cadReadiness: typeof body?.cadReadiness === 'string' ? body.cadReadiness : 'partial',
      planInterest: (typeof body?.planInterest === 'string'
        ? body.planInterest
        : 'founding-pilot') as SupplierPlanInterest,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(201).json({
      ok: true,
      id: result.record.id,
      message: 'Thanks! Your supplier listing inquiry has been received.',
    });
  } catch (err) {
    console.error('[supplier-inquiry] error:', err);
    return res.status(503).json({
      error: 'Could not save your inquiry right now. Please try again shortly.',
    });
  }
}
