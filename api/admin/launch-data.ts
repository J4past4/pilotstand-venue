import {
  getAppAccessMode,
  hasDurableUserStore,
  listRegisteredUsers,
  requireAdminSession,
} from '../_lib/auth.ts';
import {
  getPlatformMetrics,
  listQuoteRequests,
  listSupplierInquiries,
} from '../_lib/launchStore.ts';

interface VercelLikeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  setHeader(name: string, value: string): void;
  json(payload: unknown): void;
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireAdminSession(req.headers);
  if (!auth.authorized) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  try {
    const [users, supplierInquiries, quoteRequests, metrics] = await Promise.all([
      listRegisteredUsers(),
      listSupplierInquiries(),
      listQuoteRequests(),
      getPlatformMetrics(),
    ]);

    return res.status(200).json({
      ok: true,
      accessMode: getAppAccessMode(),
      durableStorageConnected: hasDurableUserStore(),
      summary: {
        totalRegisteredUsers: users.length,
        publicLaunchSignups: users.filter((u) => u.source === 'public-launch').length,
        marketingOptIns: users.filter((u) => u.marketingOptIn).length,
        supplierInquiriesCount: supplierInquiries.length,
        quoteRequestsCount: quoteRequests.length,
        ...metrics,
      },
      users,
      supplierInquiries,
      quoteRequests,
    });
  } catch (err) {
    console.error('[admin/launch-data] error:', err);
    return res.status(503).json({ error: 'Unable to load launch insights right now.' });
  }
}
