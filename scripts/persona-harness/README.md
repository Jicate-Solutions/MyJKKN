# Multi-persona test harness

Test role-gated MyJKKN pages as **many personas at once**, without logging in and
out of real accounts.

## Why it exists

MyJKKN is heavily role-gated (super_admin / hod / principal / faculty / student /
…). Verifying "does page X render correctly for role Y" used to mean logging into
a real Google account per role — and Chrome profiles are hard-isolated, so one
browser session can't hold several personas. This harness removes that friction.

## How it works

For each persona it:

1. **Mints a valid session** with the app's *own* auth library
   (`@supabase/ssr` `createServerClient` + `signInWithPassword` against a `test.*`
   account). Because the app's library writes the cookie, the chunked
   `sb-<ref>-auth-token` cookie is byte-correct — no hand-rolled base64.
2. **Injects that session** into an **isolated Puppeteer browser context**
   (separate cookie jar = separate persona).
3. **Drives the live site in parallel** — navigates, screenshots, reports whether
   the page authed / was denied / redirected to `/unauthorized`.

It is **read-only by design**: it navigates and screenshots; it never clicks a
write action. (The one exception is opt-in modal dismissal — see below.)

## Usage

```bash
# default 4-persona proof set (superadmin/hod/faculty/student on AI Pulse pages)
node scripts/persona-harness/harness.mjs

# any role:path pairs, run in parallel
node scripts/persona-harness/harness.mjs hod:/ai-pulse/lab superadmin:/billing student:/dashboard

# DEFAULT opens visible windows you can watch. For an invisible/CI run that also
# captures screenshots:
PERSONA_HEADLESS=1 node scripts/persona-harness/harness.mjs hod:/ai-pulse/lab

# point at a local dev server instead of production
PERSONA_BASE_URL=http://localhost:3104 node scripts/persona-harness/harness.mjs

# dismiss a blocking "Mandatory Acknowledgment" modal (a WRITE on the test
# account — off by default). Note: the modal's read-timer resets on page
# redirects, so target a final URL (e.g. /ai-pulse/lab/<cycleId>) not an index.
PERSONA_DISMISS_MODALS=1 node scripts/persona-harness/harness.mjs hod:/ai-pulse/lab/<cycleId>
```

Output: a JSON array on stdout (`role`, `authed`, `finalUrl`, `deniedAccess`,
`heading`). In **headless** mode it also writes a PNG per persona to
`.screenshots/persona-<role>.png`; in **headed** mode it doesn't (you watched it live).

## Two modes — watch vs. record

These are orthogonal jobs, so the harness does exactly one per mode:

| Mode | Default? | Windows | Screenshots | Use for |
|---|---|---|---|---|
| **Headed** (`PERSONA_HEADLESS` unset) | ✅ | visible | none — *you* are the camera | watching a flow live |
| **Headless** (`PERSONA_HEADLESS=1`) | | invisible | one PNG per persona | CI, batch, async proof |

A screenshot exists to show a human something they didn't watch happen — so capturing one in headed mode is redundant (and, on macOS headed Chrome, crash-prone). Want a saved image? Run headless.

## Personas

Built-in `role -> test account` map (complete-profile accounts only):
`superadmin hod faculty student staff`. Add more in `ROLE_EMAIL` in `harness.mjs`.
All use password `Test@1234` (the dev test-account password).

## Requirements

- `.env.local` at repo root with `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (public values — the harness reads these at runtime; no secrets are committed).
- `puppeteer` + `@supabase/ssr` (already in the repo's dependencies).
- The `test.*` accounts must exist with password `Test@1234` and complete profiles.

## Env flags

| Flag | Effect |
|---|---|
| `PERSONA_BASE_URL` | Target origin (default `https://www.jkkn.ai`) |
| `PERSONA_HEADLESS=1` | Invisible run (CI/batch) **and** captures screenshots. Default is visible windows. |
| `PERSONA_DISMISS_MODALS=1` | Acknowledge a blocking mandatory-ack modal (a write) |
| `PERSONA_PASSWORD` | Override the test-account password (default `Test@1234`) |

## Safety notes

- Read-only by default; only `PERSONA_DISMISS_MODALS` performs a write.
- It signs in **real test accounts** on whatever `PERSONA_BASE_URL` points at. For
  write-heavy testing, point it at a local dev server, not production.
- Don't add non-`test.*` (real-user) accounts to `ROLE_EMAIL`.
