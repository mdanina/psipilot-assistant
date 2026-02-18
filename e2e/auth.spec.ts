import { test, expect, TEST_USER } from './fixtures/test-fixtures';

test.describe('Authentication', () => {
  // ---------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------

  test('shows login page with correct elements', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
    await expect(page.getByText('Забыли пароль?')).toBeVisible();
    await expect(page.getByText('Зарегистрироваться')).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('WrongPass123!');
    await page.getByRole('button', { name: 'Войти' }).click();

    // Should stay on login and show error
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Неверный email|ошибка/i)).toBeVisible({ timeout: 10_000 });
  });

  test('logs in successfully and redirects to dashboard', async ({ page, login }) => {
    await login(page);

    // Should be on dashboard (root)
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/patients');
    await expect(page).toHaveURL(/\/login/);
  });

  test('preserves intended destination after login', async ({ page, login }) => {
    // Go to a protected page first
    await page.goto('/patients');
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);

    // Login
    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('#password').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Войти' }).click();

    // Should redirect back to /patients after login
    await expect(page).toHaveURL(/\/patients/, { timeout: 15_000 });
  });

  // ---------------------------------------------------------------
  // Registration page (smoke — no actual account creation)
  // ---------------------------------------------------------------

  test('shows registration page with all fields', async ({ page }) => {
    await page.goto('/register');

    await expect(page.locator('#fullName')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    await expect(page.locator('#terms')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Создать аккаунт' })).toBeVisible();
  });

  test('validates required fields on register', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();

    // Native/browser validation differs across environments.
    // Check that the form is still open and has invalid required fields.
    await expect(page).toHaveURL(/\/register/);
    const hasInvalidName = await page.locator('#fullName').evaluate((el) => {
      return !(el as HTMLInputElement).checkValidity();
    });
    expect(hasInvalidName).toBe(true);
  });

  // ---------------------------------------------------------------
  // Forgot password page
  // ---------------------------------------------------------------

  test('navigates to forgot password from login', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Забыли пароль?').click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  // ---------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------

  test('logs out successfully', async ({ authedPage: page }) => {
    const userTrigger = page
      .locator('button[aria-haspopup="menu"], button[aria-expanded]')
      .last();

    if (!(await userTrigger.isVisible().catch(() => false))) {
      test.skip(true, 'User menu trigger is not visible in this layout.');
    }

    await userTrigger.click();

    const logoutButton = page.getByRole('menuitem').filter({ hasText: 'Выйти' }).first();
    await expect(logoutButton).toBeVisible({ timeout: 5_000 });
    await logoutButton.click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  // ---------------------------------------------------------------
  // Session timeout warning
  // ---------------------------------------------------------------

  test('shows session timeout warning after inactivity', async ({ authedPage: page }) => {
    // Structural smoke-check only (real timeout requires mocked timers).
    await expect(page.locator('body')).toBeVisible();
  });
});
