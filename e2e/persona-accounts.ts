/**
 * Per-persona test accounts for the guide-driven E2E auth setup (Workflow 2).
 *
 * Maps each of the guide's 9 CANONICAL personas (the lanes composeGuideBook()
 * emits) to a seeded /auth/test-login account, so e2e/auth.setup.ts can mint a
 * Playwright storageState per persona and the generated nav spec can run its
 * "did a valid <persona> get bounced to login?" assertion AUTHENTICATED.
 *
 * The accounts are the dev-only test users created by
 * scripts/create-test-accounts.ts and surfaced on /auth/test-login (all share
 * TEST_PASSWORD). That page — and therefore this whole flow — is DISABLED when
 * NODE_ENV=production, so run it against a local dev server or a staging deploy
 * whose database has the seeded test accounts, NEVER against production.
 *
 * MAPPING STATUS (the guide's canonical personas are an abstraction over many
 * real app roles, so a 1:1 account does not always exist):
 *   - 5 personas map CLEANLY to a real role account.
 *   - `coordinator` and `external` are APPROXIMATE — the closest available
 *     account, which may not hold every permission the lane spans.
 *   - `unit-lead` and `parent` have NO suitable seeded account today (null) —
 *     their lanes run NAV-ONLY (no authed bounce assertion) until a dedicated
 *     account is seeded. A null entry is fail-safe: auth.setup mints nothing,
 *     and the generated spec (which checks the storageState file exists) simply
 *     skips the authed check for that persona.
 *
 * To tighten an approximate/null entry: seed a dedicated account in
 * scripts/create-test-accounts.ts (+ /auth/test-login) and point the persona at
 * it here.
 */

/** Shared password for every seeded /auth/test-login account. */
export const TEST_PASSWORD = process.env.PERSONA_PASSWORD ?? "";

export interface PersonaAccount {
  /** Seeded test-login email, of the form test.<role>@jkkn.ac.in. */
  email: string;
  /** Why this account stands in for the canonical persona; mark APPROX where imperfect. */
  note?: string;
}

/**
 * Canonical persona → seeded test account, or `null` when no suitable account
 * exists yet. Keys MUST match the canonical persona ids the guide emits
 * (lib/guide/types.ts CANONICAL_PERSONAS).
 */
export const PERSONA_ACCOUNTS: Record<string, PersonaAccount | null> = {
  // ── CLEAN mappings ──────────────────────────────────────────────────────
  learner: { email: "test.student@jkkn.ac.in", note: "open everyday user" },
  facilitator: { email: "test.faculty@jkkn.ac.in", note: "faculty is labelled 'Facilitator' on the test-login page" },
  supervisor: { email: "test.hod@jkkn.ac.in", note: "HOD oversight (principal is the sibling supervisor role)" },
  "module-admin": { email: "test.admin@jkkn.ac.in", note: "administrator" },
  "platform-admin": { email: "test.superadmin@jkkn.ac.in", note: "super_admin" },

  // ── APPROXIMATE — closest available account; confirm with the module owner ──
  coordinator: {
    email: "test.counselor@jkkn.ac.in",
    note: "APPROX: admission counsellor — the coordinator lane also spans academic-coordinator / finance-officer / ai-pulse-incharge, which this account may not fully hold",
  },
  external: { email: "test.guest@jkkn.ac.in", note: "APPROX: guest ≈ partner/visitor" },

  // ── NULL — no suitable seeded account today; lane runs nav-only ────────────
  "unit-lead": null, // FLAG: no account holds champion / warden / storekeeper / chairman permissions
  parent: null, // FLAG: no parent test account is seeded
};
