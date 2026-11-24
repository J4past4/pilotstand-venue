import {
  checkPublicFormRateLimit,
  submitQuoteRequest,
  type QuoteRequestItemSummary,
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

interface QuoteRequestBody {
  contactName?: unknown;
  email?: unknown;
  company?: unknown;
  eventName?: unknown;
  eventDate?: unknown;
  eventLocation?: unknown;
  pricingMode?: unknown;
  currency?: unknown;
  standWidthM?: unknown;
  standDepthM?: unknown;
  openSides?: unknown;
  itemCount?: unknown;
  totalPrintAreaM2?: unknown;
  estimatedTotalGbp?: unknown;
  itemsSummary?: unknown;
  notes?: unknown;
  consentToShareWithSuppliers?: unknown;
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

  const limit = await checkPublicFormRateLimit(req.headers, 'quote-request', 8, 900);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Too many quote requests. Please wait ${Math.ceil((limit.retryAfterSec || 60) / 60)} minute(s) and try again.`,
    });
  }

  let body: QuoteRequestBody | undefined;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as QuoteRequestBody;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
  } else {
    body = req.body as QuoteRequestBody | undefined;
  }

  try {
    const result = await submitQuoteRequest({
      contactName: typeof body?.contactName === 'string' ? body.contactName : '',
      email: typeof body?.email === 'string' ? body.email : '',
      company: typeof body?.company === 'string' ? body.company : undefined,
      eventName: typeof body?.eventName === 'string' ? body.eventName : undefined,
      eventDate: typeof body?.eventDate === 'string' ? body.eventDate : undefined,
      eventLocation: typeof body?.eventLocation === 'string' ? body.eventLocation : undefined,
      pricingMode: body?.pricingMode === 'buy' ? 'buy' : 'hire',
      currency: body?.currency === 'USD' || body?.currency === 'EUR' ? body.currency : 'GBP',
      standWidthM: Number(body?.standWidthM ?? 4),
      standDepthM: Number(body?.standDepthM ?? 3),
      openSides: Number(body?.openSides ?? 2),
      itemCount: Number(body?.itemCount ?? 0),
      totalPrintAreaM2: Number(body?.totalPrintAreaM2 ?? 0),
      estimatedTotalGbp: Number(body?.estimatedTotalGbp ?? 0),
      itemsSummary: Array.isArray(body?.itemsSummary)
        ? (body.itemsSummary as QuoteRequestItemSummary[])
        : [],
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
      consentToShareWithSuppliers: Boolean(body?.consentToShareWithSuppliers),
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(201).json({
      ok: true,
      id: result.record.id,
      message: 'Your stand brief has been queued for supplier quotes.',
    });
  } catch (err) {
    console.error('[quote-request] error:', err);
    return res.status(503).json({
      error: 'Could not submit your quote request right now. Please try again shortly.',
    });
  }
}
