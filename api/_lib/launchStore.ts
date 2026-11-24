import { randomBytes } from 'node:crypto';
import { hasDurableUserStore, redisPipeline } from './auth.ts';
import { extractClientIp } from './security.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SupplierPlanInterest =
  | 'founding-pilot'
  | 'verified-catalog'
  | 'white-label-embed'
  | 'rfq-leads';

export interface SupplierInquiryInput {
  contactName: string;
  email: string;
  companyName: string;
  website?: string;
  categories: string[];
  region: string;
  skuCount: string;
  cadReadiness: string;
  planInterest: SupplierPlanInterest;
  notes?: string;
}

export interface SupplierInquiryRecord {
  id: string;
  contactName: string;
  email: string;
  companyName: string;
  website?: string;
  categories: string[];
  region: string;
  skuCount: string;
  cadReadiness: string;
  planInterest: SupplierPlanInterest;
  notes?: string;
  createdAt: number;
}

export interface QuoteRequestItemSummary {
  label: string;
  qty: number;
  totalGbp: number;
}

export interface QuoteRequestInput {
  contactName: string;
  email: string;
  company?: string;
  eventName?: string;
  eventDate?: string;
  eventLocation?: string;
  pricingMode: 'hire' | 'buy';
  currency: 'GBP' | 'USD' | 'EUR';
  standWidthM: number;
  standDepthM: number;
  openSides: number;
  itemCount: number;
  totalPrintAreaM2: number;
  estimatedTotalGbp: number;
  itemsSummary: QuoteRequestItemSummary[];
  notes?: string;
  consentToShareWithSuppliers: boolean;
}

export interface QuoteRequestRecord extends QuoteRequestInput {
  id: string;
  createdAt: number;
}

export type MetricEventType =
  | 'stand_created'
  | 'template_used'
  | 'brief_exported'
  | 'png_exported'
  | 'json_exported'
  | 'estimate_viewed'
  | 'quote_requested'
  | 'supplier_inquiry';

export interface TrackMetricInput {
  event: MetricEventType;
  estimatedTotalGbp?: number;
  standAreaM2?: number;
  categories?: string[];
}

export interface PlatformMetricsSummary {
  standsCreated: number;
  templatesUsed: number;
  briefsExported: number;
  pngsExported: number;
  jsonsExported: number;
  estimatesViewed: number;
  quotesRequested: number;
  supplierInquiries: number;
  totalEstimatedBomGbp: number;
  totalStandAreaM2: number;
  topCategories: Array<{ category: string; count: number }>;
}

const VALID_PLANS = new Set<SupplierPlanInterest>([
  'founding-pilot',
  'verified-catalog',
  'white-label-embed',
  'rfq-leads',
]);

const VALID_METRIC_EVENTS = new Set<MetricEventType>([
  'stand_created',
  'template_used',
  'brief_exported',
  'png_exported',
  'json_exported',
  'estimate_viewed',
  'quote_requested',
  'supplier_inquiry',
]);

const SUPPLIER_LIST_KEY = 'zuki-expo:supplier-inquiries';
const QUOTE_LIST_KEY = 'zuki-expo:quote-requests';
const METRICS_HASH_KEY = 'zuki-expo:metrics:counters';
const CATEGORY_HASH_KEY = 'zuki-expo:metrics:categories';

// Local dev / unit-test in-memory fallback stores
const memorySupplierInquiries: SupplierInquiryRecord[] = [];
const memoryQuoteRequests: QuoteRequestRecord[] = [];
const memoryMetricCounters = new Map<string, number>();
const memoryCategoryCounters = new Map<string, number>();
const memoryFormRateLimits = new Map<string, { count: number; resetAt: number }>();

export function clearInMemoryLaunchStore(): void {
  memorySupplierInquiries.length = 0;
  memoryQuoteRequests.length = 0;
  memoryMetricCounters.clear();
  memoryCategoryCounters.clear();
  memoryFormRateLimits.clear();
}

function cleanText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function cleanOptionalUrl(raw: unknown): string | undefined {
  const txt = cleanText(raw, 200);
  if (!txt) return undefined;
  if (/^https?:\/\//i.test(txt)) return txt;
  return `https://${txt}`;
}

export async function checkPublicFormRateLimit(
  headers: Record<string, string | string[] | undefined>,
  bucket: string,
  maxPerWindow = 10,
  windowSec = 900,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const ip = extractClientIp(headers);
  const key = `zuki-expo:form-rl:${bucket}:${ip}`;

  if (hasDurableUserStore(env)) {
    try {
      const results = await redisPipeline(
        [
          ['INCR', key],
          ['EXPIRE', key, windowSec, 'NX'],
          ['TTL', key],
        ],
        env
      );
      if (results) {
        const count = Number(results[0]?.result ?? 0);
        const ttl = Number(results[2]?.result ?? windowSec);
        if (Number.isFinite(count) && count > maxPerWindow) {
          return { allowed: false, retryAfterSec: Math.max(1, ttl > 0 ? ttl : windowSec) };
        }
        return { allowed: true };
      }
    } catch {
      // fall back to in-memory
    }
  }

  const now = Date.now();
  const existing = memoryFormRateLimits.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryFormRateLimits.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true };
  }
  existing.count += 1;
  if (existing.count > maxPerWindow) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true };
}

export async function submitSupplierInquiry(
  input: SupplierInquiryInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ ok: true; record: SupplierInquiryRecord } | { ok: false; status: number; error: string }> {
  const contactName = cleanText(input.contactName, 80);
  const email = cleanText(input.email, 120).toLowerCase();
  const companyName = cleanText(input.companyName, 120);
  const website = cleanOptionalUrl(input.website);
  const region = cleanText(input.region, 60) || 'UK';
  const skuCount = cleanText(input.skuCount, 40) || '1–25';
  const cadReadiness = cleanText(input.cadReadiness, 80) || 'partial';
  const planInterest: SupplierPlanInterest = VALID_PLANS.has(input.planInterest)
    ? input.planInterest
    : 'founding-pilot';
  const notes = cleanText(input.notes, 600) || undefined;
  const categories = Array.isArray(input.categories)
    ? input.categories
        .map((c) => cleanText(c, 50))
        .filter(Boolean)
        .slice(0, 12)
    : [];

  if (contactName.length < 2) {
    return { ok: false, status: 400, error: 'Please enter your contact name.' };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: 'Please enter a valid work email address.' };
  }
  if (companyName.length < 2) {
    return { ok: false, status: 400, error: 'Please enter your company name.' };
  }
  if (categories.length === 0) {
    return { ok: false, status: 400, error: 'Please select at least one product category.' };
  }

  const record: SupplierInquiryRecord = {
    id: `sup_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
    contactName,
    email,
    companyName,
    ...(website ? { website } : {}),
    categories,
    region,
    skuCount,
    cadReadiness,
    planInterest,
    ...(notes ? { notes } : {}),
    createdAt: Date.now(),
  };

  if (hasDurableUserStore(env)) {
    await redisPipeline(
      [
        ['LPUSH', SUPPLIER_LIST_KEY, JSON.stringify(record)],
        ['LTRIM', SUPPLIER_LIST_KEY, 0, 499],
        ['HINCRBY', METRICS_HASH_KEY, 'supplier_inquiry', 1],
      ],
      env
    );
  } else {
    memorySupplierInquiries.unshift(record);
    memoryMetricCounters.set(
      'supplier_inquiry',
      (memoryMetricCounters.get('supplier_inquiry') || 0) + 1
    );
  }

  return { ok: true, record };
}

export async function listSupplierInquiries(
  env: NodeJS.ProcessEnv = process.env,
  limit = 100
): Promise<SupplierInquiryRecord[]> {
  if (hasDurableUserStore(env)) {
    const results = await redisPipeline([['LRANGE', SUPPLIER_LIST_KEY, 0, limit - 1]], env);
    const rawList = results?.[0]?.result;
    if (!Array.isArray(rawList)) return [];
    const parsed: SupplierInquiryRecord[] = [];
    for (const item of rawList) {
      if (typeof item !== 'string') continue;
      try {
        parsed.push(JSON.parse(item) as SupplierInquiryRecord);
      } catch {
        // skip malformed entry
      }
    }
    return parsed;
  }

  return memorySupplierInquiries.slice(0, limit);
}

export async function submitQuoteRequest(
  input: QuoteRequestInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ ok: true; record: QuoteRequestRecord } | { ok: false; status: number; error: string }> {
  const contactName = cleanText(input.contactName, 80);
  const email = cleanText(input.email, 120).toLowerCase();
  const company = cleanText(input.company, 120) || undefined;
  const eventName = cleanText(input.eventName, 120) || undefined;
  const eventDate = cleanText(input.eventDate, 40) || undefined;
  const eventLocation = cleanText(input.eventLocation, 100) || undefined;
  const notes = cleanText(input.notes, 600) || undefined;

  if (contactName.length < 2) {
    return { ok: false, status: 400, error: 'Please enter your name.' };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: 'Please enter a valid work email address.' };
  }
  if (!input.consentToShareWithSuppliers) {
    return {
      ok: false,
      status: 400,
      error: 'Please confirm consent to share your stand specification with matched suppliers.',
    };
  }

  const standWidthM = Number.isFinite(input.standWidthM)
    ? Math.max(1, Math.min(50, Number(input.standWidthM)))
    : 4;
  const standDepthM = Number.isFinite(input.standDepthM)
    ? Math.max(1, Math.min(50, Number(input.standDepthM)))
    : 3;
  const openSides = Number.isFinite(input.openSides)
    ? Math.max(1, Math.min(4, Math.round(input.openSides)))
    : 2;
  const itemCount = Number.isFinite(input.itemCount)
    ? Math.max(0, Math.min(500, Math.round(input.itemCount)))
    : 0;
  const totalPrintAreaM2 = Number.isFinite(input.totalPrintAreaM2)
    ? Math.max(0, Math.min(5000, Math.round(input.totalPrintAreaM2 * 10) / 10))
    : 0;
  const estimatedTotalGbp = Number.isFinite(input.estimatedTotalGbp)
    ? Math.max(0, Math.min(10_000_000, Math.round(input.estimatedTotalGbp)))
    : 0;

  const itemsSummary: QuoteRequestItemSummary[] = Array.isArray(input.itemsSummary)
    ? input.itemsSummary.slice(0, 40).map((it) => ({
        label: cleanText(it.label, 80) || 'Stand item',
        qty: Math.max(1, Math.min(200, Math.round(Number(it.qty) || 1))),
        totalGbp: Math.max(0, Math.min(1_000_000, Math.round(Number(it.totalGbp) || 0))),
      }))
    : [];

  const record: QuoteRequestRecord = {
    id: `rfq_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
    contactName,
    email,
    ...(company ? { company } : {}),
    ...(eventName ? { eventName } : {}),
    ...(eventDate ? { eventDate } : {}),
    ...(eventLocation ? { eventLocation } : {}),
    pricingMode: input.pricingMode === 'buy' ? 'buy' : 'hire',
    currency: input.currency === 'USD' || input.currency === 'EUR' ? input.currency : 'GBP',
    standWidthM,
    standDepthM,
    openSides,
    itemCount,
    totalPrintAreaM2,
    estimatedTotalGbp,
    itemsSummary,
    ...(notes ? { notes } : {}),
    consentToShareWithSuppliers: true,
    createdAt: Date.now(),
  };

  if (hasDurableUserStore(env)) {
    await redisPipeline(
      [
        ['LPUSH', QUOTE_LIST_KEY, JSON.stringify(record)],
        ['LTRIM', QUOTE_LIST_KEY, 0, 499],
        ['HINCRBY', METRICS_HASH_KEY, 'quote_requested', 1],
      ],
      env
    );
  } else {
    memoryQuoteRequests.unshift(record);
    memoryMetricCounters.set(
      'quote_requested',
      (memoryMetricCounters.get('quote_requested') || 0) + 1
    );
  }

  return { ok: true, record };
}

export async function listQuoteRequests(
  env: NodeJS.ProcessEnv = process.env,
  limit = 100
): Promise<QuoteRequestRecord[]> {
  if (hasDurableUserStore(env)) {
    const results = await redisPipeline([['LRANGE', QUOTE_LIST_KEY, 0, limit - 1]], env);
    const rawList = results?.[0]?.result;
    if (!Array.isArray(rawList)) return [];
    const parsed: QuoteRequestRecord[] = [];
    for (const item of rawList) {
      if (typeof item !== 'string') continue;
      try {
        parsed.push(JSON.parse(item) as QuoteRequestRecord);
      } catch {
        // skip malformed entry
      }
    }
    return parsed;
  }

  return memoryQuoteRequests.slice(0, limit);
}

export async function trackPlatformMetric(
  input: TrackMetricInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  if (!VALID_METRIC_EVENTS.has(input.event)) return false;

  const bomGbp =
    typeof input.estimatedTotalGbp === 'number' && Number.isFinite(input.estimatedTotalGbp)
      ? Math.max(0, Math.min(500_000, Math.round(input.estimatedTotalGbp)))
      : 0;
  const standAreaM2 =
    typeof input.standAreaM2 === 'number' && Number.isFinite(input.standAreaM2)
      ? Math.max(0, Math.min(1000, Math.round(input.standAreaM2)))
      : 0;
  const categories = Array.isArray(input.categories)
    ? input.categories
        .map((c) => cleanText(c, 40).toLowerCase())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  if (hasDurableUserStore(env)) {
    const cmds: Array<Array<string | number>> = [['HINCRBY', METRICS_HASH_KEY, input.event, 1]];
    if (bomGbp > 0) {
      cmds.push(['HINCRBY', METRICS_HASH_KEY, 'total_bom_gbp', bomGbp]);
    }
    if (standAreaM2 > 0) {
      cmds.push(['HINCRBY', METRICS_HASH_KEY, 'total_stand_area_m2', standAreaM2]);
    }
    for (const cat of categories) {
      cmds.push(['HINCRBY', CATEGORY_HASH_KEY, cat, 1]);
    }
    await redisPipeline(cmds, env);
    return true;
  }

  memoryMetricCounters.set(input.event, (memoryMetricCounters.get(input.event) || 0) + 1);
  if (bomGbp > 0) {
    memoryMetricCounters.set(
      'total_bom_gbp',
      (memoryMetricCounters.get('total_bom_gbp') || 0) + bomGbp
    );
  }
  if (standAreaM2 > 0) {
    memoryMetricCounters.set(
      'total_stand_area_m2',
      (memoryMetricCounters.get('total_stand_area_m2') || 0) + standAreaM2
    );
  }
  for (const cat of categories) {
    memoryCategoryCounters.set(cat, (memoryCategoryCounters.get(cat) || 0) + 1);
  }
  return true;
}

function parseRedisHashReply(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length - 1; i += 2) {
      const k = String(raw[i]);
      const v = Number(raw[i + 1]);
      if (Number.isFinite(v)) out[k] = v;
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const num = Number(v);
      if (Number.isFinite(num)) out[k] = num;
    }
  }
  return out;
}

export async function getPlatformMetrics(
  env: NodeJS.ProcessEnv = process.env
): Promise<PlatformMetricsSummary> {
  let counters: Record<string, number> = {};
  let catCounts: Record<string, number> = {};

  if (hasDurableUserStore(env)) {
    const results = await redisPipeline(
      [
        ['HGETALL', METRICS_HASH_KEY],
        ['HGETALL', CATEGORY_HASH_KEY],
      ],
      env
    );
    counters = parseRedisHashReply(results?.[0]?.result);
    catCounts = parseRedisHashReply(results?.[1]?.result);
  } else {
    for (const [k, v] of memoryMetricCounters.entries()) counters[k] = v;
    for (const [k, v] of memoryCategoryCounters.entries()) catCounts[k] = v;
  }

  const topCategories = Object.entries(catCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    standsCreated: counters.stand_created || 0,
    templatesUsed: counters.template_used || 0,
    briefsExported: counters.brief_exported || 0,
    pngsExported: counters.png_exported || 0,
    jsonsExported: counters.json_exported || 0,
    estimatesViewed: counters.estimate_viewed || 0,
    quotesRequested: counters.quote_requested || 0,
    supplierInquiries: counters.supplier_inquiry || 0,
    totalEstimatedBomGbp: counters.total_bom_gbp || 0,
    totalStandAreaM2: counters.total_stand_area_m2 || 0,
    topCategories,
  };
}
