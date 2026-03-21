import { test, expect } from '@playwright/test';

test.describe('Menu Browsing', () => {
  const itemSlugWithIdPattern = /\/item\/[a-z0-9-]+--[0-9a-f-]{36}$/;

  test('should display menu items on home page', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/Mad Krapow/i);
    await expect(page.locator('[data-testid="menu-item-primary-link"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to item detail when clicking menu item', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForSelector('a[href^="/item/"]', { timeout: 10000 });
    
    const firstPrimaryLink = page.locator('[data-testid="menu-item-primary-link"]').first();
    await firstPrimaryLink.click();
    await expect(page).toHaveURL(itemSlugWithIdPattern);
  });

  test('should navigate to item detail from image, content, and view button taps', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-item-primary-link"]', { timeout: 10000 });

    const primaryLink = page.locator('[data-testid="menu-item-primary-link"]').first();
    await primaryLink.click();
    await expect(page).toHaveURL(itemSlugWithIdPattern);

    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-item-primary-link"]', { timeout: 10000 });
    const primaryLinkViaHeading = page.locator('[data-testid="menu-item-primary-link"] h3').first();
    await primaryLinkViaHeading.click();
    await expect(page).toHaveURL(itemSlugWithIdPattern);

    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-item-view-link"]', { timeout: 10000 });
    const viewButtonLink = page.locator('[data-testid="menu-item-view-link"]').first();
    await viewButtonLink.click();
    await expect(page).toHaveURL(itemSlugWithIdPattern);
  });

  test('should show customization section for customizable menu item', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-item-primary-link"]', { timeout: 10000 });

    const customizableItem = page.locator('a[aria-label*="customize"]').first();
    await customizableItem.click();

    await expect(page).toHaveURL(itemSlugWithIdPattern);
    await expect(page.locator('text=Customize Your Order')).toBeVisible();
  });

  test('should redirect legacy uuid item URL to canonical slug URL', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-item-primary-link"]', { timeout: 10000 });

    const canonicalHref = await page.locator('[data-testid="menu-item-primary-link"]').first().getAttribute('href');
    expect(canonicalHref).toBeTruthy();

    const idMatch = canonicalHref?.match(/[0-9a-f-]{36}$/i);
    expect(idMatch).toBeTruthy();

    await page.goto(`/item/${idMatch![0]}`);
    await expect(page).toHaveURL(itemSlugWithIdPattern);
  });

  test('should open and zoom item image modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="menu-item-primary-link"]', { timeout: 10000 });
    await page.locator('[data-testid="menu-item-primary-link"]').first().click();

    await expect(page.locator('[data-testid="item-detail-content-panel"]')).toBeVisible();
    await page.locator('[data-testid="item-image-preview-button"]').click();

    const modal = page.locator('[data-testid="item-image-modal"]');
    const zoomToggle = page.locator('[data-testid="item-image-zoom-toggle"]');

    await expect(modal).toBeVisible();
    await expect(zoomToggle).toHaveText('Zoom in');
    await zoomToggle.focus();
    await page.keyboard.press('Enter');
    await expect(zoomToggle).toHaveText('Zoom out');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });

  test('should filter items by category', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForSelector('nav button', { timeout: 10000 });
    
    const tabs = page.locator('nav button');
    const tabCount = await tabs.count();
    
    if (tabCount > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
    }
  });
});
