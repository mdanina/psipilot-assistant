import { test, expect } from './fixtures/test-fixtures';

test.describe('Session timeout with protected activity', () => {
  test('keeps session alive during protected activity and expires after it ends', async ({
    page,
    login,
  }) => {
    await login(page);
    await page.goto('/');

    const hasDebugApi = await page.evaluate(() => {
      return typeof (window as typeof window & { __psipilotSessionDebug?: unknown })
        .__psipilotSessionDebug !== 'undefined';
    });
    test.skip(!hasDebugApi, 'Session debug API is not available in this environment.');

    await page.evaluate(() => {
      const debug = (window as typeof window & {
        __psipilotSessionDebug: {
          startProtectedActivity: () => void;
          setLastActivityAgoMs: (ms: number) => void;
          forceTimeoutCheck: () => void;
        };
      }).__psipilotSessionDebug;

      debug.startProtectedActivity();
      debug.setLastActivityAgoMs(16 * 60 * 1000);
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const debug = (window as typeof window & {
        __psipilotSessionDebug: {
          forceTimeoutCheck: () => void;
        };
      }).__psipilotSessionDebug;
      debug.forceTimeoutCheck();
    });

    await expect(page).not.toHaveURL(/\/login/);

    await page.evaluate(() => {
      const debug = (window as typeof window & {
        __psipilotSessionDebug: {
          stopProtectedActivity: () => void;
          setLastActivityAgoMs: (ms: number) => void;
          forceTimeoutCheck: () => void;
        };
      }).__psipilotSessionDebug;

      debug.stopProtectedActivity();
      debug.setLastActivityAgoMs(16 * 60 * 1000);
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const debug = (window as typeof window & {
        __psipilotSessionDebug: {
          forceTimeoutCheck: () => void;
        };
      }).__psipilotSessionDebug;
      debug.forceTimeoutCheck();
    });

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
