import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — scoped to the guide-driven E2E nav skeleton.
 *
 * The spec at `e2e/guide-nav.generated.spec.ts` is GENERATED from the smart-guide
 * by `npm run gen:guide-e2e` (scripts/e2e-nav.ts). It navigates to absolute URLs
 * (GUIDE_E2E_BASE + each guide href), so no global `baseURL` is needed here.
 *
 * This is intentionally minimal and separate from the vitest unit suite
 * (`__tests__/`). It only runs on demand (the guide-e2e workflow_dispatch CI, or
 * locally), never as part of `next build`.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  reporter: "list",
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    ...devices["Desktop Chrome"],
    trace: "on-first-retry",
  },
});
