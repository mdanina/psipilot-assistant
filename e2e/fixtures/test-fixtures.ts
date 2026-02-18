import { test as base, expect, type Page } from '@playwright/test';

/**
 * Test user credentials — set via environment variables or .env.test
 *
 * PLAYWRIGHT_TEST_EMAIL    — email of a pre-created test user (specialist role)
 * PLAYWRIGHT_TEST_PASSWORD — password for that user
 * PLAYWRIGHT_ADMIN_EMAIL   — email of a pre-created admin user
 * PLAYWRIGHT_ADMIN_PASSWORD— password for that admin user
 */
const TEST_USER = {
  email: process.env.PLAYWRIGHT_TEST_EMAIL || 'test-specialist@example.com',
  password: process.env.PLAYWRIGHT_TEST_PASSWORD || 'TestPassword123!',
};

const ADMIN_USER = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL || 'test-admin@example.com',
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD || 'AdminPassword123!',
};

const HAS_ADMIN_CREDENTIALS = Boolean(
  process.env.PLAYWRIGHT_ADMIN_EMAIL && process.env.PLAYWRIGHT_ADMIN_PASSWORD
);

/** Helper: log in through the UI */
async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  // Wait for redirect away from login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

// ----------------------------------------------------------------
// Extended test fixtures
// ----------------------------------------------------------------

type Fixtures = {
  /** A Page already authenticated as a specialist user */
  authedPage: Page;
  /** A Page already authenticated as an admin user */
  adminPage: Page;
  /** Login helper callable from any test */
  login: (page: Page, email?: string, password?: string) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    await loginViaUI(page, TEST_USER.email, TEST_USER.password);
    await use(page);
  },

  adminPage: async ({ page }, use) => {
    await loginViaUI(page, ADMIN_USER.email, ADMIN_USER.password);
    await use(page);
  },

  login: async ({}, use) => {
    await use(async (page, email?, password?) => {
      await loginViaUI(
        page,
        email ?? TEST_USER.email,
        password ?? TEST_USER.password,
      );
    });
  },
});

export { expect };
export { TEST_USER, ADMIN_USER };
export { HAS_ADMIN_CREDENTIALS };
