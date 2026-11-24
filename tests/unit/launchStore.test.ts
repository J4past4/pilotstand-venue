import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearInMemoryRegisteredUsers,
  createSessionToken,
  getAppAccessMode,
  isPublicLaunchMode,
  listRegisteredUsers,
  registerBetaUser,
  requireAdminSession,
  SESSION_COOKIE_NAME,
} from '../../api/_lib/auth.ts';
import {
  clearInMemoryLaunchStore,
  getPlatformMetrics,
  listQuoteRequests,
  listSupplierInquiries,
  submitQuoteRequest,
  submitSupplierInquiry,
  trackPlatformMetric,
} from '../../api/_lib/launchStore.ts';

describe('Public Launch Mode & Monetisation Store', () => {
  beforeEach(() => {
    clearInMemoryRegisteredUsers();
    clearInMemoryLaunchStore();
  });

  const publicEnv: NodeJS.ProcessEnv = {
    APP_ACCESS_MODE: 'public',
    AUTH_SESSION_SECRET: 'public-launch-test-secret-32-chars-min',
  };

  it('supports public launch self-signup without invite code and stores lead profile metadata', async () => {
    expect(getAppAccessMode(publicEnv)).toBe('public');
    expect(isPublicLaunchMode(publicEnv)).toBe(true);

    const res = await registerBetaUser(
      {
        name: 'Morgan Shaw',
        email: 'Morgan@RoboticsCo.uk',
        password: 'StrongPublicPass!2026',
        company: 'Robotics Co Ltd',
        userType: 'exhibitor',
        upcomingEvent: 'ExCeL London — Oct 2026',
        standSize: '6×3m Peninsula',
        marketingOptIn: true,
      },
      publicEnv
    );

    expect(res).toEqual({
      ok: true,
      user: {
        email: 'morgan@roboticsco.uk',
        name: 'Morgan Shaw',
        role: 'beta',
        company: 'Robotics Co Ltd',
      },
    });

    const users = await listRegisteredUsers(publicEnv);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: 'morgan@roboticsco.uk',
      name: 'Morgan Shaw',
      company: 'Robotics Co Ltd',
      userType: 'exhibitor',
      upcomingEvent: 'ExCeL London — Oct 2026',
      standSize: '6×3m Peninsula',
      marketingOptIn: true,
      source: 'public-launch',
    });
    // Must never leak password hashes
    expect('password' in users[0]).toBe(false);
  });

  it('enforces admin-only access via requireAdminSession', () => {
    const betaToken = createSessionToken(
      { email: 'user@company.com', name: 'User', role: 'beta' },
      publicEnv
    );
    const adminToken = createSessionToken(
      { email: 'founder@zukistudio.co.uk', name: 'Founder', role: 'admin' },
      publicEnv
    );

    expect(
      requireAdminSession(
        { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(betaToken)}` },
        publicEnv
      ).authorized
    ).toBe(false);

    const adminCheck = requireAdminSession(
      { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(adminToken)}` },
      publicEnv
    );
    expect(adminCheck.authorized).toBe(true);
    expect(adminCheck.user?.email).toBe('founder@zukistudio.co.uk');
  });

  it('validates and stores supplier catalog hosting inquiries', async () => {
    const bad = await submitSupplierInquiry(
      {
        contactName: 'Jordan',
        email: 'not-an-email',
        companyName: 'ExpoKit',
        categories: ['Modular Walls & SEG'],
        region: 'UK',
        skuCount: '26–100',
        cadReadiness: 'ready',
        planInterest: 'founding-pilot',
      },
      publicEnv
    );
    expect(bad).toMatchObject({ ok: false, status: 400 });

    const created = await submitSupplierInquiry(
      {
        contactName: 'Jordan Reid',
        email: 'jordan@expokit.co.uk',
        companyName: 'ExpoKit Hire Ltd',
        website: 'expokit.co.uk',
        categories: ['Modular Walls & SEG', 'AV & LED Displays'],
        region: 'UK',
        skuCount: '100–500',
        cadReadiness: 'ready',
        planInterest: 'verified-catalog',
        notes: 'Full beMatrix & LED wall hire range.',
      },
      publicEnv
    );
    expect(created.ok).toBe(true);

    const list = await listSupplierInquiries(publicEnv);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      companyName: 'ExpoKit Hire Ltd',
      website: 'https://expokit.co.uk',
      planInterest: 'verified-catalog',
      categories: ['Modular Walls & SEG', 'AV & LED Displays'],
    });
  });

  it('requires explicit GDPR consent for exhibitor quote requests and records BOM metrics', async () => {
    const noConsent = await submitQuoteRequest(
      {
        contactName: 'Alex',
        email: 'alex@brand.com',
        pricingMode: 'hire',
        currency: 'GBP',
        standWidthM: 6,
        standDepthM: 3,
        openSides: 3,
        itemCount: 8,
        totalPrintAreaM2: 14.5,
        estimatedTotalGbp: 6400,
        itemsSummary: [{ label: 'SEG Lightbox', qty: 2, totalGbp: 1800 }],
        consentToShareWithSuppliers: false,
      },
      publicEnv
    );
    expect(noConsent).toMatchObject({ ok: false, status: 400 });

    const ok = await submitQuoteRequest(
      {
        contactName: 'Alex Taylor',
        email: 'alex@brand.com',
        company: 'Brand Ltd',
        eventName: 'Tech Expo UK',
        pricingMode: 'hire',
        currency: 'GBP',
        standWidthM: 6,
        standDepthM: 3,
        openSides: 3,
        itemCount: 8,
        totalPrintAreaM2: 14.5,
        estimatedTotalGbp: 6400,
        itemsSummary: [{ label: 'SEG Lightbox', qty: 2, totalGbp: 1800 }],
        consentToShareWithSuppliers: true,
      },
      publicEnv
    );
    expect(ok.ok).toBe(true);

    const quotes = await listQuoteRequests(publicEnv);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].estimatedTotalGbp).toBe(6400);

    await trackPlatformMetric(
      {
        event: 'brief_exported',
        estimatedTotalGbp: 6400,
        standAreaM2: 18,
        categories: ['walls', 'signage'],
      },
      publicEnv
    );
    await trackPlatformMetric(
      {
        event: 'estimate_viewed',
        estimatedTotalGbp: 3200,
        standAreaM2: 12,
        categories: ['walls', 'furniture'],
      },
      publicEnv
    );

    const metrics = await getPlatformMetrics(publicEnv);
    expect(metrics.briefsExported).toBe(1);
    expect(metrics.estimatesViewed).toBe(1);
    expect(metrics.quotesRequested).toBe(1);
    expect(metrics.totalEstimatedBomGbp).toBe(9600);
    expect(metrics.totalStandAreaM2).toBe(30);
    expect(metrics.topCategories[0]).toEqual({ category: 'walls', count: 2 });
  });
});
