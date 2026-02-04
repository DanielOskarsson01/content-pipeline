// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Content Pipeline App', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  });

  test('should show projects tab by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Step 0')).toBeVisible();
  });

  test('should show step containers', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Project Setup')).toBeVisible();
    await expect(page.getByText('Discovery')).toBeVisible();
  });
});
