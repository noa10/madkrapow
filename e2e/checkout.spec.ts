import { test, expect } from '@playwright/test';

test.describe('Checkout', () => {
  test('redirects anonymous visitors from /checkout to sign up', async ({ page }) => {
    await page.goto('/checkout');

    await expect(page).toHaveURL(/\/auth\/signup\?redirect=%2Fcheckout$/, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText(/create your/i, { timeout: 10000 });
  });

  test('answers /checkout with a redirect before rendering', async ({ request }) => {
    const response = await request.get('/checkout', { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toContain('/auth/signup?redirect=%2Fcheckout');
  });
});
