import { expect, test } from '@playwright/test';

test.describe('Booth Buddy Mascot Tips', () => {
  test('pops up bottom-right with mascot photo, cycles tips, and collapses/reopens cleanly', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('/api/auth/session') && text.includes('404')) return;
        consoleErrors.push(text);
      }
    });
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authEnabled: false,
          authenticated: true,
          publicLaunch: true,
          user: null,
        }),
      });
    });

    await page.goto('/');

    const widget = page.getByTestId('mascot-widget');
    const trigger = page.getByTestId('mascot-trigger');
    const bubble = page.getByTestId('mascot-bubble');

    await expect(widget).toBeVisible();
    await expect(trigger).toBeVisible();
    await expect(bubble).toBeVisible({ timeout: 5000 });

    // Confirm mascot image loaded properly
    const imgLoaded = await trigger.locator('img').evaluate((el: HTMLImageElement) => {
      return el.complete && el.naturalWidth > 0;
    });
    expect(imgLoaded).toBe(true);

    // Confirm it's positioned in the bottom-right quadrant
    const viewport = page.viewportSize()!;
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeGreaterThan(viewport.width - 60);
    expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 60);

    // Cycle to next tip
    const firstTip = await page.getByTestId('mascot-tip-text').textContent();
    await page.getByTestId('mascot-next').click();
    const secondTip = await page.getByTestId('mascot-tip-text').textContent();
    expect(secondTip).not.toBe(firstTip);

    // Collapse tip bubble
    await page.getByTestId('mascot-close').click();
    await expect(bubble).toBeHidden();

    // Reopen by clicking the mascot avatar
    await trigger.click();
    await expect(bubble).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
