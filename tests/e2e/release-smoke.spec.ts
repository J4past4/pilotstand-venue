import { expect, test, type Page } from '@playwright/test';

function attachStrictErrorCollectors(page: Page, opts?: { allowExpected401?: boolean }) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Static vite preview returns 404 for /api/auth/session when unmocked
      if (text.includes('/api/auth/session') && text.includes('404')) return;
      if (opts?.allowExpected401 && text.includes('401 (Unauthorized)')) return;
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });

  return {
    assertZeroErrors() {
      expect(pageErrors, `Uncaught page errors: ${pageErrors.join('\n')}`).toEqual([]);
      expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    },
  };
}

test.describe('Zuki Exhibition Planner — Private Beta Release QA', () => {
  test('1. Private Beta Login Gate blocks unauthenticated users, rejects bad creds, signs in marketer, and signs out', async ({
    page,
  }) => {
    const errors = attachStrictErrorCollectors(page, { allowExpected401: true });
    let loggedInUser: { email: string; name: string; role: 'admin' | 'beta' } | null = null;

    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authEnabled: true,
          authenticated: Boolean(loggedInUser),
          user: loggedInUser,
        }),
      });
    });

    await page.route('**/api/auth/login', async (route) => {
      const payload = route.request().postDataJSON() as { email?: string; password?: string };
      if (payload.email === 'marketer@company.com' && payload.password === 'BetaPass!2026') {
        loggedInUser = { email: 'marketer@company.com', name: 'Alex Marketing', role: 'beta' };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, authEnabled: true, user: loggedInUser }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid email or password.' }),
        });
      }
    });

    await page.route('**/api/auth/logout', async (route) => {
      loggedInUser = null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto('/');

    // Login screen must gate the workspace
    await expect(page.getByRole('heading', { name: /Sign in to your workspace/i })).toBeVisible();
    await expect(page.getByText('Private Beta')).toBeVisible();

    // Bad password rejected
    await page.getByLabel('Work Email').fill('marketer@company.com');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid email or password.');

    // Valid marketer credentials unlock Dashboard and show user pill
    await page.getByLabel('Password', { exact: true }).fill('BetaPass!2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: /Your Stand Projects/i })).toBeVisible();
    await expect(page.locator('.beta-user-pill')).toContainText('Alex Marketing');

    // Sign out returns to login gate
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: /Sign in to your workspace/i })).toBeVisible();

    errors.assertZeroErrors();
  });

  test('1b. Invite-link self-signup pre-fills invite code, creates account, signs in, and supports sign-out/re-login', async ({
    page,
  }) => {
    const errors = attachStrictErrorCollectors(page);
    const users = new Map<string, { name: string; email: string; password: string }>();
    let loggedInUser: { email: string; name: string; role: 'beta' } | null = null;

    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authEnabled: true,
          signupEnabled: true,
          signupReady: true,
          authenticated: Boolean(loggedInUser),
          user: loggedInUser,
        }),
      });
    });

    await page.route('**/api/auth/signup', async (route) => {
      const body = route.request().postDataJSON() as {
        name: string;
        email: string;
        password: string;
        inviteCode: string;
      };
      if (body.inviteCode !== 'ZUKI-BETA-2026') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid beta invite code.' }),
        });
        return;
      }
      const key = body.email.toLowerCase();
      users.set(key, { name: body.name, email: key, password: body.password });
      loggedInUser = { email: key, name: body.name, role: 'beta' };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, authEnabled: true, user: loggedInUser }),
      });
    });

    await page.route('**/api/auth/login', async (route) => {
      const body = route.request().postDataJSON() as { email: string; password: string };
      const rec = users.get(body.email.toLowerCase());
      if (rec && rec.password === body.password) {
        loggedInUser = { email: rec.email, name: rec.name, role: 'beta' };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, authEnabled: true, user: loggedInUser }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid email or password.' }),
        });
      }
    });

    await page.route('**/api/auth/logout', async (route) => {
      loggedInUser = null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    // Opening with ?invite=CODE auto-selects Create account and pre-fills the invite code
    await page.goto('/?invite=ZUKI-BETA-2026');
    await expect(page.getByRole('heading', { name: /Create your beta account/i })).toBeVisible();
    await expect(page.getByLabel('Invite Code')).toHaveValue('ZUKI-BETA-2026');

    await page.getByLabel('Full Name').fill('Sam Marketer');
    await page.getByLabel('Work Email').fill('sam@company.com');
    await page.getByLabel('Create Password').fill('MyOwnSecurePass!26');
    await page.getByRole('button', { name: 'Create account' }).click();

    // Immediately logged into Dashboard with clean URL (invite param removed)
    await expect(page.getByRole('heading', { name: /Your Stand Projects/i })).toBeVisible();
    await expect(page.locator('.beta-user-pill')).toContainText('Sam Marketer');
    expect(page.url()).not.toContain('invite=');

    // Sign out and sign back in with the newly created credentials
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: /Sign in to your workspace/i })).toBeVisible();
    await page.getByLabel('Work Email').fill('sam@company.com');
    await page.getByLabel('Password', { exact: true }).fill('MyOwnSecurePass!26');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.beta-user-pill')).toContainText('Sam Marketer');

    errors.assertZeroErrors();
  });

async function mockAuthDisabled(page: Page) {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authEnabled: false, authenticated: true, user: null }),
    });
  });
}

  test('2. Projects Dashboard, Asset Library, Custom Asset Builder & persistence across reload', async ({
    page,
  }) => {
    const errors = attachStrictErrorCollectors(page);
    await mockAuthDisabled(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Dashboard renders
    await expect(page.getByRole('heading', { name: /Your Stand Projects/i })).toBeVisible();

    // Open Asset Library modal and verify Escape closes it cleanly
    await page.getByRole('button', { name: /^Asset Library$/i }).first().click();
    await expect(page.getByRole('dialog', { name: /Asset Library/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Asset Library/i })).toBeHidden();

    // Open Custom Asset Builder (Shape Builder) from dashboard quick tools and close with Escape
    await page.getByRole('button', { name: /Asset Creator \(Shapes\)/i }).click();
    await expect(page.getByRole('button', { name: 'Close Custom Asset Builder' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close Custom Asset Builder' })).toBeHidden();

    // Create a new blank project -> enters 3D editor
    await page.getByRole('button', { name: /New Project/i }).first().click();
    await expect(page.locator('#studio-topbar')).toBeVisible();

    // Return to Dashboard and reload to confirm localStorage persistence
    await page.locator('#btn-projects').click();
    await expect(page.getByRole('heading', { name: /Your Stand Projects/i })).toBeVisible();
    await expect(page.getByText(/Untitled Stand/i).first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Untitled Stand/i).first()).toBeVisible();

    errors.assertZeroErrors();
  });

  test('3. 3D/2D Studio viewport renders WebGL frames, switches modes/modals/walkthrough cleanly', async ({
    page,
  }) => {
    const errors = attachStrictErrorCollectors(page);
    await mockAuthDisabled(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Enter editor via "Back to Editor"
    await page.getByRole('button', { name: /Back to Editor/i }).click();
    await expect(page.locator('#studio-topbar')).toBeVisible();

    // Verify 3D Three.js WebGL canvas exists and has real dimensions
    const canvas = page.locator('.viewport-canvas-host canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width || 0).toBeGreaterThan(400);
    expect(box?.height || 0).toBeGreaterThan(300);

    // Wait for WebGL render and confirm non-empty pixel output
    await page.waitForTimeout(300);
    const hasDrawnPixels = await page.evaluate(() => {
      const c = document.querySelector('.viewport-canvas-host canvas') as HTMLCanvasElement | null;
      if (!c) return false;
      const url = c.toDataURL('image/png');
      return url.startsWith('data:image/png;base64,') && url.length > 2000;
    });
    expect(hasDrawnPixels).toBe(true);

    // Switch viewport modes (Plan, Visitor, back to 3D)
    await page.getByRole('tab', { name: 'Plan' }).click();
    await page.getByRole('tab', { name: 'Visitor' }).click();
    await page.getByRole('tab', { name: '3D' }).click();

    // Test camera preset buttons
    await page.getByRole('button', { name: 'Front' }).click();
    await page.getByRole('button', { name: 'Iso' }).click();

    // Test Estimate modal + Escape close
    await page.locator('#btn-estimate').click();
    await expect(page.locator('.modal-backdrop')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-backdrop')).toBeHidden();

    // Test Templates modal + Escape close
    await page.locator('#btn-templates').click();
    await expect(page.locator('.modal-backdrop')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-backdrop')).toBeHidden();

    // Test Export modal + Escape close
    await page.locator('#btn-export').click();
    await expect(page.locator('.modal-backdrop')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-backdrop')).toBeHidden();

    // Test AI Designer drawer open & close
    await page.locator('#btn-ai-designer').click();
    await expect(page.getByPlaceholder(/Ask to build or edit/i)).toBeVisible();
    await page.locator('#btn-ai-designer').click();

    // Check responsive Tablet viewport (no crash or horizontal overflow)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(200);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflowX).toBeLessThanOrEqual(4);

    errors.assertZeroErrors();
  });
});
