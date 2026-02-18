import { test, expect } from './fixtures/test-fixtures';

test.describe('Sessions', () => {
  // ---------------------------------------------------------------
  // Sessions list
  // ---------------------------------------------------------------

  test('shows sessions page with search', async ({ authedPage: page }) => {
    await page.goto('/sessions');

    await expect(page.getByPlaceholder('Поиск сессий...')).toBeVisible();
    // Should either show sessions or empty state
    await expect(
      page.getByText(/Нет сессий|Сессия|Выберите сессию/),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('opens create session dialog', async ({ authedPage: page }) => {
    await page.goto('/sessions');

    const createBtn = page.locator('button[title="Создать новую сессию"]');
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    await expect(page.getByRole('dialog', { name: 'Создать новую сессию' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('navigates to sessions via sidebar', async ({ authedPage: page }) => {
    await page.getByRole('link', { name: 'Сессии' }).click();
    await expect(page).toHaveURL(/\/sessions/);
  });

  // ---------------------------------------------------------------
  // Session analysis page
  // ---------------------------------------------------------------

  test('shows analysis page structure', async ({ authedPage: page }) => {
    // First create or select a session to get its ID
    await page.goto('/sessions');

    const createBtn = page.locator('button[title="Создать новую сессию"]');
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    // Wait for session to be created, then look for the "Generate analysis" button
    const generateBtn = page.getByText('Сгенерировать анализ');
    if (await generateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await generateBtn.click();

      // Should navigate to analysis page
      await expect(page).toHaveURL(/\/sessions\/.*\/analysis/, { timeout: 10_000 });
      await expect(page.getByText('AI Анализ сессии')).toBeVisible();
      await expect(page.getByText('Источники данных')).toBeVisible();
      await expect(page.getByText('Клиническая заметка')).toBeVisible();
    }
  });
});

test.describe('Calendar', () => {
  test('shows calendar page', async ({ authedPage: page }) => {
    await page.goto('/calendar');

    await expect(page.getByText('Новая встреча')).toBeVisible({ timeout: 10_000 });
  });

  test('navigates to calendar via sidebar', async ({ authedPage: page }) => {
    await page.getByRole('link', { name: 'Календарь' }).click();
    await expect(page).toHaveURL(/\/calendar/);
  });
});
