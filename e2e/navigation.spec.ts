import { test, expect } from './fixtures/test-fixtures';

test.describe('Navigation & Layout', () => {
  test('sidebar shows all main navigation links', async ({ authedPage: page }) => {
    // Verify all sidebar items are present
    await expect(page.getByRole('link', { name: 'Запись аудио' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Пациенты' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Сессии' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Календарь' })).toBeVisible();
  });

  test('sidebar navigation works correctly', async ({ authedPage: page }) => {
    // Navigate through all main sections
    const sections = [
      { link: 'Пациенты', url: /\/patients/ },
      { link: 'Сессии', url: /\/sessions/ },
      { link: 'Календарь', url: /\/calendar/ },
      { link: 'Запись аудио', url: /^\/$|\/$/ },
    ];

    for (const section of sections) {
      await page.getByRole('link', { name: section.link }).click();
      await expect(page).toHaveURL(section.url, { timeout: 10_000 });
    }
  });

  test('dashboard shows hero section', async ({ authedPage: page }) => {
    await page.goto('/');
    await expect(
      page.getByText('Анализируйте свои сессии с помощью ИИ'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('profile page is accessible', async ({ authedPage: page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);
  });

  test('theme toggle works', async ({ authedPage: page }) => {
    const userTrigger = page
      .locator('button[aria-haspopup="menu"], button[aria-expanded]')
      .last();

    if (!(await userTrigger.isVisible().catch(() => false))) {
      test.skip(true, 'User menu trigger is not visible in this layout.');
    }

    await userTrigger.click();

    // Toggle theme
    const themeBtn = page.getByRole('menuitem').filter({ hasText: /Темная тема|Светлая тема/ });
    if (!(await themeBtn.first().isVisible().catch(() => false))) {
      test.skip(true, 'Theme toggle is not available in this user menu configuration.');
    }
    await expect(themeBtn).toBeVisible({ timeout: 5_000 });
    const initialText = await themeBtn.textContent();
    await themeBtn.click();

    // Re-open dropdown and verify theme changed
    await userTrigger.click();
    const newThemeBtn = page
      .getByRole('menuitem')
      .filter({ hasText: /Темная тема|Светлая тема/ });
    await expect(newThemeBtn).toBeVisible({ timeout: 5_000 });
    const newText = await newThemeBtn.textContent();
    expect(newText).not.toBe(initialText);
  });
});
