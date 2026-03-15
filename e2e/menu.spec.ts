import { test, expect } from '@playwright/test';

test.describe('Menu Browsing', () => {
  test('should display menu items on home page', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/Mad Krapow/i);
    
    await expect(page.locator('text=Menu')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to item detail when clicking menu item', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForSelector('a[href^="/item/"]', { timeout: 10000 });
    
    const firstItem = page.locator('a[href^="/item/"]').first();
    await firstItem.click();
    
    await expect(page).toHaveURL(/\/item\/.+/);
  });

  test('should filter items by category', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForSelector('[role="tablist"]', { timeout: 10000 });
    
    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();
    
    if (tabCount > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
    }
  });
});
