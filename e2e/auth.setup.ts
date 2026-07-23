/**
 * auth.setup — mint a Playwright storageState per persona via /auth/test-login.
 *
 * Runs as the Playwright `setup` project (see playwright.config.ts) BEFORE the
 * generated nav spec. For each MAPPED persona (e2e/persona-accounts.ts) it drives
 * a real browser through the dev-only test-login page and saves the resulting
 * Supabase session to `${GUIDE_E2E_AUTH_DIR}/<persona>.json`. The generated nav
 * spec then loads that storageState and runs its login-bounce assertion
 * authenticated — but only for personas whose file was actually minted.
 *
 * SAFETY: /auth/test-login is disabled when NODE_ENV=production. Point
 * GUIDE_E2E_BASE at a local dev server or a staging deploy whose database has the
 * seeded test accounts (scripts/create-test-accounts.ts). NEVER production.
 *
 * This whole project is a no-op unless GUIDE_E2E_AUTHED=1 — so the nav project
 * can depend on `setup` unconditionally without forcing a login when you only
 * want the unauthenticated 404/5xx sweep.
 *
 * Unmapped personas (null in PERSONA_ACCOUNTS) are skipped — no storageState is
 * written, and the nav spec skips the authed assertion for them (nav-only).
 */
import { test as setup, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";

import { PERSONA_ACCOUNTS } from "./persona-accounts";

const BASE = process.env.GUIDE_E2E_BASE ?? "http://localhost:3104";
const AUTH_DIR = process.env.GUIDE_E2E_AUTH_DIR ?? ".auth";
const TEST_LOGIN_PATH = "/auth/test-login";
const AUTHED = !!process.env.GUIDE_E2E_AUTHED;

for (const [persona, account] of Object.entries(PERSONA_ACCOUNTS)) {
  if (!account) continue; // unmapped persona → nav-only; nothing to mint

  setup(`authenticate ${persona} (${account.email})`, async ({ page }) => {
    setup.skip(!AUTHED, "GUIDE_E2E_AUTHED not set — running nav-only, no storageState minted");

    await fs.mkdir(AUTH_DIR, { recursive: true });

    await page.goto(BASE + TEST_LOGIN_PATH);

    // The test-login page is dev-only: in production it renders a guard message
    // instead of the role cards. Fail loudly if we hit that (wrong environment).
    await expect(
      page.getByText("Test login is only available", { exact: false }),
      `${TEST_LOGIN_PATH} is production-guarded at ${BASE} — point GUIDE_E2E_BASE at a dev/staging server with seeded test accounts`,
    ).toHaveCount(0);

    // Each role card is clickable and signs in (supabase.auth.signInWithPassword
    // with the shared TEST_PASSWORD). Click the card by its unique email text.
    await page.getByText(account.email, { exact: true }).click();

    // On success the page calls router.push('/') → wait until we've left /auth/*.
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/"), { timeout: 30_000 });

    await page.context().storageState({ path: path.join(AUTH_DIR, `${persona}.json`) });
  });
}
