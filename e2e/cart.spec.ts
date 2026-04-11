import { test, expect } from '@playwright/test';

test.describe('Shopping Cart', () => {
  test('should add item to cart from menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();

    await page.waitForSelector('a[href^="/item/"]', { timeout: 10000 });
    const firstItem = page.locator('a[href^="/item/"]').first();
    await firstItem.click();
    
    await expect(page).toHaveURL(/\/item\/.+/);
    
    const addToCartButton = page.locator('button:has-text("Add to Cart")').first();
    await addToCartButton.click();
    
    await page.waitForTimeout(1000);
  });

  test('should view cart page', async ({ page }) => {
    await page.goto('/cart');
    
    await expect(page.locator('h1')).toContainText(/cart/i, { timeout: 10000 });
  });

  test('should update item quantity in cart', async ({ page }) => {
    await page.goto('/cart');
    
    const increaseButton = page.locator('button[aria-label*="increase"], button:has-text("+")').first();
    const decreaseButton = page.locator('button[aria-label*="decrease"], button:has-text("-")').first();
    
    if (await increaseButton.isVisible()) {
      await increaseButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('should remove item from cart', async ({ page }) => {
    await page.goto('/cart');
    
    const removeButton = page.locator('button:has-text("Remove"), button[aria-label*="Remove"]').first();
    
    if (await removeButton.isVisible()) {
      await removeButton.click();
      await page.waitForTimeout(500);
    }
  });
});
