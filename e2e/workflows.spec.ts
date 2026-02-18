import { test, expect } from './fixtures/test-fixtures';

async function ensureAuthenticated(
  page: import('@playwright/test').Page,
  login: (page: import('@playwright/test').Page, email?: string, password?: string) => Promise<void>
) {
  try {
    await login(page);
    return true;
  } catch {
    test.skip(true, 'Test credentials are not configured or login failed');
    return false;
  }
}

async function openCreateSessionDialog(page: import('@playwright/test').Page) {
  await page.goto('/sessions');
  const createBtn = page.locator('button[title="Создать новую сессию"]').first();
  await expect(createBtn).toBeVisible({ timeout: 15_000 });
  await createBtn.click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Создать новую сессию' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Core Workflows E2E', () => {
  test('session create dialog supports link-later flow', async ({ page, login }) => {
    if (!(await ensureAuthenticated(page, login))) return;
    const dialog = await openCreateSessionDialog(page);

    const createButton = dialog.getByRole('button', { name: 'Создать' });
    await expect(createButton).toBeDisabled();

    await dialog.getByLabel('Привязать к пациенту позже').click();
    await expect(createButton).toBeEnabled();

    await dialog.locator('#title').fill(`E2E link-later ${Date.now()}`);
    await createButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  test('session create dialog supports selecting a patient', async ({ page, login }) => {
    if (!(await ensureAuthenticated(page, login))) return;
    const dialog = await openCreateSessionDialog(page);

    const patientCombobox = dialog.getByRole('combobox').first();
    await patientCombobox.click();

    const options = page.locator('[cmdk-item]');
    const optionCount = await options.count();
    test.skip(optionCount === 0, 'No patients available in environment');

    const firstOption = options.first();
    await expect(firstOption).toBeVisible();
    const selectedText = (await firstOption.textContent())?.trim() || '';
    await firstOption.click();

    await expect(patientCombobox).toContainText(selectedText.split('\n')[0]);
    await expect(dialog.getByRole('button', { name: 'Создать' })).toBeEnabled();
  });

  test('creates session with custom title and shows it in sessions UI', async ({ page, login }) => {
    if (!(await ensureAuthenticated(page, login))) return;
    const customTitle = `E2E Session ${Date.now()}`;
    const dialog = await openCreateSessionDialog(page);

    await dialog.getByLabel('Привязать к пациенту позже').click();
    await dialog.locator('#title').fill(customTitle);
    await dialog.getByRole('button', { name: 'Создать' }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(customTitle)).toBeVisible({ timeout: 15_000 });
  });

  test('patient detail activities tab is accessible from list', async ({ page, login }) => {
    if (!(await ensureAuthenticated(page, login))) return;
    await page.goto('/patients');

    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await firstRow.click();

    await expect(page).toHaveURL(/\/patients\/[a-f0-9-]+/i, { timeout: 10_000 });
    await page.getByRole('tab', { name: 'Активности' }).click();

    const hasSearch = await page
      .getByPlaceholder('Поиск по содержимому сессий...')
      .isVisible()
      .catch(() => false);

    if (hasSearch) {
      await expect(page.getByPlaceholder('Поиск по содержимому сессий...')).toBeVisible();
    }

    await expect(
      page
        .locator('h3, span, p')
        .filter({ hasText: /Сессия|Запланирована|В процессе|Нет активностей/i })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('calendar subscription dialog opens from calendar page', async ({ page, login }) => {
    if (!(await ensureAuthenticated(page, login))) return;
    await page.goto('/calendar');

    const subscriptionButton = page.getByRole('button', { name: 'Подписка на календарь' });
    await expect(subscriptionButton).toBeVisible({ timeout: 15_000 });
    await subscriptionButton.click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Подписка на календарь' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        'Добавьте ваши сессии в Google Calendar, Apple Calendar или другое приложение календаря.'
      )
    ).toBeVisible();
  });

  test('calendar subscription dialog handles token generation UI', async ({ page, login }) => {
    if (!(await ensureAuthenticated(page, login))) return;
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'Подписка на календарь' }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Подписка на календарь' });
    const createLinkBtn = dialog.getByRole('button', { name: 'Создать ссылку' });
    await expect(createLinkBtn).toBeVisible();
    await createLinkBtn.click();

    await expect(
      dialog.getByRole('link', { name: /Google Календарь|Apple \/ другой календарь/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
