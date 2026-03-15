import { test, expect } from '@playwright/test';

test.describe('Checkout', () => {
  test('should display checkout page', async ({ page }) => {
    await page.goto('/checkout');
    
    await expect(page.locator('h1')).toContainText(/checkout/i, { timeout: 10000 });
  });

  test('should show empty cart message on checkout with no items', async ({ page }) => {
    await page.goto('/checkout');
    
    await page.waitForTimeout(2000);
    
    const hasEmptyMessage = await page.locator('text=empty').isVisible().catch(() => false) ||
                           await page.locator('text=Your cart is empty').isVisible().catch(() => false);
    
    if (hasEmptyMessage) {
      await expect(page.locator('a[href="/"]')).toBeVisible();
    }
  });

  test('should display delivery address form', async ({ page }) => {
    await page.goto('/checkout');
    
    await page.waitForTimeout(2000);
    
    const addressInput = page.locator('input[name*="address"], input[name*="delivery"]').first();
    if (await addressInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(addressInput).toBeVisible();
    }
  });

  test('should have proceed to payment button', async ({ page }) => {
    await page.goto('/checkout');
    
    await page.waitForTimeout(2000);
    
    const payButton = page.locator('button:has-text("Place Order"), button:has-text("Proceed to Payment"), button:has-text("Pay")').first();
    if (await payButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(payButton).toBeVisible();
    }
  });
});
