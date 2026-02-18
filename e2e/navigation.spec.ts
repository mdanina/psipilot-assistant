import { test, expect } from './fixtures/test-fixtures';

test.describe('Navigation & Layout', () => {
  test('sidebar shows all main navigation links', async ({ authedPage: page }) => {
    // Verify all sidebar items are present
    await expect(page.getByText('Запись аудио')).toBeVisible();
    await expect(page.getByText('Пациенты')).toBeVisible();
    await expect(page.getByText('Сессии')).toBeVisible();
    await expect(page.getByText('Календарь')).toBeVisible();
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
      await page.getByText(section.link).click();
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
    // Open user dropdown
    const sidebar = page.locator('.bg-sidebar, [class*="sidebar"]').first();
    const userTrigger = sidebar.locator('button').last();
    await userTrigger.click();

    // Toggle theme
    const themeBtn = page.getByText(/Темная тема|Светлая тема/);
    await expect(themeBtn).toBeVisible({ timeout: 5_000 });
    const initialText = await themeBtn.textContent();
    await themeBtn.click();

    // Re-open dropdown and verify theme changed
    await userTrigger.click();
    const newThemeBtn = page.getByText(/Темная тема|Светлая тема/);
    await expect(newThemeBtn).toBeVisible({ timeout: 5_000 });
    const newText = await newThemeBtn.textContent();
    expect(newText).not.toBe(initialText);
  });
});
