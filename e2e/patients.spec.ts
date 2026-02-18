import { test, expect } from './fixtures/test-fixtures';

test.describe('Patients CRUD', () => {
  const uniqueSuffix = () => Date.now().toString(36);

  // ---------------------------------------------------------------
  // List
  // ---------------------------------------------------------------

  test('shows patients list page', async ({ authedPage: page }) => {
    await page.goto('/patients');

    await expect(page.getByText('Управление пациентами')).toBeVisible();
    await expect(page.getByPlaceholder('Поиск пациентов...')).toBeVisible();
    await expect(page.getByText(/Новый пациент/)).toBeVisible();
  });

  test('search filters patient list', async ({ authedPage: page }) => {
    await page.goto('/patients');

    const searchInput = page.getByPlaceholder('Поиск пациентов...');
    await searchInput.fill('zzz-nonexistent-name');

    // Should show "not found" message or empty table
    await expect(
      page.getByText(/Пациенты не найдены|Найдено: 0/),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ---------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------

  test('opens patient creation form', async ({ authedPage: page }) => {
    await page.goto('/patients/new');

    await expect(page.getByText('Новый пациент')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранить' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отмена' })).toBeVisible();
  });

  test('validates required name field', async ({ authedPage: page }) => {
    await page.goto('/patients/new');

    // Try to submit without filling name
    await page.getByRole('button', { name: 'Сохранить' }).click();

    // Validation error should appear
    await expect(page.getByText(/Имя обязательно|не может быть пустым/)).toBeVisible();
  });

  test('creates a new patient and shows in list', async ({ authedPage: page }) => {
    const patientName = `E2E Тест ${uniqueSuffix()}`;

    await page.goto('/patients/new');

    await page.locator('#name').fill(patientName);
    await page.locator('#email').fill(`e2e-${uniqueSuffix()}@test.com`);
    await page.locator('#phone').fill('+7 999 123-45-67');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    // Should redirect to patient list or detail page
    await expect(page).toHaveURL(/\/patients/, { timeout: 10_000 });

    // Verify the patient appears in the list
    await page.goto('/patients');
    await expect(page.getByText(patientName)).toBeVisible({ timeout: 10_000 });
  });

  test('cancel button returns to patients list', async ({ authedPage: page }) => {
    await page.goto('/patients/new');
    await page.getByRole('button', { name: 'Отмена' }).click();
    await expect(page).toHaveURL(/\/patients/);
  });

  // ---------------------------------------------------------------
  // Detail / Edit
  // ---------------------------------------------------------------

  test('navigates to patient detail on row click', async ({ authedPage: page }) => {
    await page.goto('/patients');

    // Wait for table to load
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();

    // Should navigate to patient detail
    await expect(page).toHaveURL(/\/patients\/[a-f0-9-]+/);
  });

  // ---------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------

  test('shows delete confirmation dialog', async ({ authedPage: page }) => {
    await page.goto('/patients');

    // Wait for table
    const deleteBtn = page.locator('button[title="Удалить"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await deleteBtn.click();

    // Confirmation dialog
    await expect(page.getByText('Удалить пациента?')).toBeVisible();
    await expect(page.getByText('Это действие нельзя отменить')).toBeVisible();

    // Cancel deletion
    await page.getByRole('button', { name: 'Отмена' }).click();
    await expect(page.getByText('Удалить пациента?')).not.toBeVisible();
  });

  // ---------------------------------------------------------------
  // Navigation from sidebar
  // ---------------------------------------------------------------

  test('navigates to patients via sidebar', async ({ authedPage: page }) => {
    // Click sidebar link
    await page.getByText('Пациенты').click();
    await expect(page).toHaveURL(/\/patients/);
    await expect(page.getByText('Управление пациентами')).toBeVisible();
  });
});
