import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — scoped to the guide-driven E2E nav skeleton.
 *
 * The spec at `e2e/guide-nav.generated.spec.ts` is GENERATED from the smart-guide
 * by `npm run gen:guide-e2e` (scripts/e2e-nav.ts). It navigates to absolute URLs
 * (GUIDE_E2E_BASE + each guide href), so no global `baseURL` is needed here.
 *
 * Two projects:
 *   - `setup` runs e2e/auth.setup.ts, which mints a `<persona>.json` storageState
 *     per persona via the dev-only /auth/test-login page. It is a NO-OP unless
 *     GUIDE_E2E_AUTHED=1, so the nav project can depend on it unconditionally.
 *   - `guide-nav` runs the generated spec after `setup`, so each persona's
 *     storageState exists before the login-bounce assertion runs.
 *
 * This is intentionally minimal and separate from the vitest unit suite
 * (`__tests__/`). It only runs on demand (the guide-e2e workflow_dispatch CI, or
 * locally), never as part of `next build`.
 */
export default defineConfig({
  testDir: "e2e",
  reporter: "list",
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    ...devices["Desktop Chrome"],
    trace: "on-first-retry",
  },
  projects: [
    // Mints a Playwright storageState per persona via /auth/test-login.
    // No-op unless GUIDE_E2E_AUTHED=1 (see e2e/auth.setup.ts). Runs first.
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    // The generated guide nav skeleton. Depends on `setup` so a per-persona
    // storageState exists before the login-bounce assertion runs. The spec sets
    // storageState per-test (it checks the file exists), so no project-level
    // storageState is needed here.
    {
      name: "guide-nav",
      testMatch: /guide-nav\.generated\.spec\.ts$/,
      dependencies: ["setup"],
    },
  ],
});
