interface ReqLike {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ResLike {
  status: (code: number) => ResLike;
  json: (payload: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])/i;

function extractMeta(html: string, attrName: string, attrVal: string): string {
  const re = new RegExp(
    `<meta[^>]+${attrName}=["']${attrVal}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${attrVal}["']`,
    'i'
  );
  const m = html.match(re);
  return (m?.[1] || m?.[2] || '').trim();
}

function cleanText(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHexColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

export default async function handler(req: ReqLike, res: ResLike) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawUrl = '';
  if (req.method === 'GET') {
    const q = req.query?.url;
    rawUrl = Array.isArray(q) ? q[0] || '' : q || '';
  } else {
    const body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body || '{}') as { url?: string })
        : ((req.body || {}) as { url?: string });
    rawUrl = body.url || '';
  }

  const normalized = rawUrl.trim().startsWith('http')
    ? rawUrl.trim()
    : `https://${rawUrl.trim()}`;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return res.status(400).json({ error: 'Please enter a valid company website URL.' });
  }

  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || PRIVATE_HOST_RE.test(parsed.hostname)) {
    return res.status(400).json({ error: 'Public HTTP/HTTPS website URL required.' });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'PilotStandVenueBot/1.0 (+https://pilotstand.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(502).json({ error: `Website returned HTTP ${response.status}` });
    }

    const html = (await response.text()).slice(0, 120_000);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogSite = extractMeta(html, 'property', 'og:site_name');
    const ogTitle = extractMeta(html, 'property', 'og:title');
    const description =
      extractMeta(html, 'name', 'description') ||
      extractMeta(html, 'property', 'og:description');
    const themeColor = extractMeta(html, 'name', 'theme-color');

    const companyRaw = cleanText(ogSite || ogTitle || titleMatch?.[1] || parsed.hostname);
    const company = companyRaw.split(/[|\-–—]/)[0].trim().slice(0, 48) || parsed.hostname;
    const tagline = cleanText(description || ogTitle || '').slice(0, 96);

    const primaryColor = isHexColor(themeColor) ? themeColor : '#0f172a';
    const accentColor = primaryColor.toLowerCase() === '#0f172a' ? '#ff4d2e' : '#38bdf8';

    return res.status(200).json({
      company,
      tagline: tagline || `${company} Official Showcase`,
      primaryColor,
      accentColor,
      website: parsed.origin,
      source: 'live-scrape',
    });
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : 'Unable to reach website',
    });
  }
}
