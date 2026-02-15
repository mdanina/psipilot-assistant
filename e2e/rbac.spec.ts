import { test, expect } from './fixtures/test-fixtures';

test.describe('Role-based access control', () => {
  // ---------------------------------------------------------------
  // Specialist role — should access patients, sessions, calendar
  // ---------------------------------------------------------------

  test('specialist can access patients page', async ({ authedPage: page }) => {
    await page.goto('/patients');
    await expect(page.getByText('Управление пациентами')).toBeVisible({ timeout: 10_000 });
  });

  test('specialist can access sessions page', async ({ authedPage: page }) => {
    await page.goto('/sessions');
    await expect(page).not.toHaveURL(/\/unauthorized/);
  });

  test('specialist can access calendar page', async ({ authedPage: page }) => {
    await page.goto('/calendar');
    await expect(page).not.toHaveURL(/\/unauthorized/);
  });

  test('specialist cannot access administration', async ({ authedPage: page }) => {
    await page.goto('/administration');
    // Should redirect to unauthorized or show error
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 10_000 });
  });

  // ---------------------------------------------------------------
  // Admin role — should access everything including administration
  // ---------------------------------------------------------------

  test('admin can access administration page', async ({ adminPage: page }) => {
    await page.goto('/administration');
    await expect(page).not.toHaveURL(/\/unauthorized/);
  });

  test('admin can access patients page', async ({ adminPage: page }) => {
    await page.goto('/patients');
    await expect(page.getByText('Управление пациентами')).toBeVisible({ timeout: 10_000 });
  });

  // ---------------------------------------------------------------
  // Public pages — accessible without auth
  // ---------------------------------------------------------------

  test('terms page is accessible without auth', async ({ page }) => {
    await page.goto('/terms');
    await expect(page).toHaveURL(/\/terms/);
  });

  test('privacy page is accessible without auth', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy/);
  });

  // ---------------------------------------------------------------
  // 404
  // ---------------------------------------------------------------

  test('shows 404 for unknown routes', async ({ authedPage: page }) => {
    await page.goto('/this-page-does-not-exist');
    // Should show NotFound or redirect
    await expect(page.locator('body')).toContainText(/404|не найдена|not found/i, {
      timeout: 10_000,
    });
  });
});
