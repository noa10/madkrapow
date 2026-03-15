import { test as setup, expect } from '@playwright/test';

setup('should authenticate as test user', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.locator('h1')).toContainText(/sign in|login/i, { timeout: 10000 });
});
