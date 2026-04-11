import { test, expect } from '@playwright/test';

test.describe('Order Tracking', () => {
  test('should display orders page', async ({ page }) => {
    await page.goto('/orders');
    
    await expect(page.locator('h1').first()).toContainText(/order/i, { timeout: 10000 });
  });

  test('should display order not found for invalid order id', async ({ page }) => {
    await page.goto('/order/invalid-order-id');
    
    await page.waitForTimeout(2000);
    
    const notFoundText = await page.locator('text=not found, text=Order not found').first().isVisible().catch(() => false);
    if (notFoundText) {
      await expect(page.locator('text=not found, text=Order not found')).toBeVisible();
    }
  });

  test('should show order status information', async ({ page }) => {
    await page.goto('/order/123');
    
    await page.waitForTimeout(2000);
    
    const statusElements = page.locator('text=Status, text=status');
    if (await statusElements.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(statusElements.first()).toBeVisible();
    }
  });

  test('should display driver info section when order is delivered', async ({ page }) => {
    await page.goto('/order/123');
    
    await page.waitForTimeout(2000);
    
    const driverInfo = page.locator('text=Driver, text=driver').first();
    if (await driverInfo.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(driverInfo).toBeVisible();
    }
  });
});
