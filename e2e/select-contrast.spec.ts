import { test, expect } from '@playwright/test';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`native select options remain readable with ${colorScheme} system appearance`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.evaluate(() => {
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Select menu item');
      select.className = 'bg-transparent';
      select.innerHTML = '<option value="">Choose a menu item...</option><option value="item">Menu item</option>';
      document.body.append(select);
    });

    const select = page.getByLabel('Select menu item');
    await expect(select).toHaveCSS('color-scheme', 'dark');
    const colors = await select.locator('option').nth(1).evaluate((option) => {
      const style = getComputedStyle(option);
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d')!;
      const luminance = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        const linear = [r, g, b].map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      };
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return {
        contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
        backgroundAlpha: context.getImageData(0, 0, 1, 1).data[3],
      };
    });
    expect(colors.backgroundAlpha).toBe(255);
    expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
    await select.selectOption('item');
    await expect(select).toHaveValue('item');
  });
}
