# Multi-persona test harness

Test role-gated pages of any **Supabase + Next.js** app as **many personas at once**,
without logging in and out of real accounts.

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

# DEFAULT runs BOTH passes: headless first (captures screenshots for autonomous
# UI/UX + bug analysis), THEN visible (you watch the windows). Single-pass:
PERSONA_MODE=headless node scripts/persona-harness/harness.mjs hod:/ai-pulse/lab   # screenshots only
PERSONA_MODE=visible  node scripts/persona-harness/harness.mjs hod:/ai-pulse/lab   # watch only
PERSONA_HOLD=15000    node scripts/persona-harness/harness.mjs hod:/ai-pulse/lab   # linger windows ~15s

# point at a local dev server instead of production
PERSONA_BASE_URL=http://localhost:3104 node scripts/persona-harness/harness.mjs

# dismiss a blocking "Mandatory Acknowledgment" modal (a WRITE on the test
# account — off by default). Note: the modal's read-timer resets on page
# redirects, so target a final URL (e.g. /ai-pulse/lab/<cycleId>) not an index.
PERSONA_DISMISS_MODALS=1 node scripts/persona-harness/harness.mjs hod:/ai-pulse/lab/<cycleId>
```

Output: a JSON array on stdout (`role`, `authed`, `finalUrl`, `deniedAccess`,
`heading`). The **headless pass** writes a PNG per persona to
`.screenshots/persona-<role>-<page-slug>.png` (the page slug keeps two same-role
personas — e.g. learner + champion both on `test.student` — from overwriting each
other); the **visible pass** writes none (you watched it).

## Modes — `PERSONA_MODE`

| Mode | Windows | Screenshots | Use for |
|---|---|---|---|
| **both** (DEFAULT) | visible (2nd pass) | yes (1st pass) | the normal flow — machine captures + analyzes, *then* you watch |
| **headless** | none | yes | CI, batch, autonomous bug/UX analysis, async proof |
| **visible** | visible | none | just watch, no capture |

`both` runs **headless first** (fast, parallel — grabs the screenshots so they can be analyzed for UI/UX issues autonomously) **then visible** (slow — windows you watch). The fast machine-pass preps for the slow human-pass. A screenshot only makes sense for a pass nobody watched, so the visible pass never takes one (and on macOS headed Chrome, `captureScreenshot` is crash-prone anyway). `PERSONA_HEADLESS=1` is a back-compat alias for `PERSONA_MODE=headless`.

## Personas — `personas.json`

The script has **no hardcoded accounts** — it reads `personas.json` (next to this
script) for everything platform-specific:

```json
{
  "baseUrl": "https://www.jkkn.ai",
  "envPath": "../../.env.local",
  "accounts": { "superadmin": "test.superadmin@jkkn.ac.in", "hod": "test.hod@jkkn.ac.in" },
  "defaultSet": [["hod", "/some/page"], ["student", "/other/page"]]
}
```

- **accounts** (required): `role -> test account email`; these roles are what you pass as `role:path`.
- **baseUrl** (required unless `PERSONA_BASE_URL` is set): the app origin.
- **envPath** (optional, default `../../.env.local`): where to read `NEXT_PUBLIC_SUPABASE_URL` + `_ANON_KEY`.
- **defaultSet** (optional): the `role:path` pairs run when you pass no args.

Accounts need a password — set `PERSONA_PASSWORD` in your shell (or add
`"password"` to the config). There is no default; it must match whatever the
`test.*` accounts were actually seeded with (see `scripts/create-test-accounts.ts`).

## Troubleshooting

| Symptom | Cause |
|---|---|
| `PERSONA_PASSWORD is not set` | Exactly that — export it before running. The harness stops here rather than sending an empty password. |
| `Cannot read .../.env.local` | You are in a fresh worktree. Copy or symlink the repo's `.env.local` in, or point `envPath` at one. |
| `signIn <email> on Supabase project <ref> …: Invalid login credentials` | The password you exported does not match what that project's `test.*` accounts hold. Check the `<ref>` in the message is the project you meant. |

`Invalid login credentials` is Supabase's one answer for every password rejection,
so it says nothing about whether the account exists. Before assuming an account is
gone, check `auth.users` for it (`email_confirmed_at`, `banned_until`,
`last_sign_in_at`) — a recent `last_sign_in_at` means the account and its password
are fine and the problem is on this side.

## Use on another Supabase + Next.js app

The script is generic — the cookie name and Supabase project are read from the
target repo's own `.env.local` + `@supabase/ssr` version, so they always match the
app. To add a platform:

1. Copy `harness.mjs` into that repo's `scripts/persona-harness/`.
2. Add a `personas.json` next to it with that app's `baseUrl` + test-account map.
3. Run it.

The **hard dependency is the stack, not the platform**: any `@supabase/ssr` + Next.js
app works; a non-Supabase app does not.

## Requirements

- `.env.local` (or `envPath`) with `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (public values — read at runtime; no secrets committed).
- `puppeteer` + `@supabase/ssr` in the repo's dependencies.
- Seeded `test.*` accounts with the password set in `PERSONA_PASSWORD` and complete profiles.

## Env flags

| Flag | Effect |
|---|---|
| `PERSONA_MODE` | `both` (default) · `headless` · `visible`. `both` = headless screenshots then visible watch. |
| `PERSONA_HOLD` | ms each visible window lingers so you can watch (default 5000) |
| `PERSONA_BASE_URL` | Target origin (overrides `baseUrl` in `personas.json`) |
| `PERSONA_HEADLESS=1` | Back-compat alias for `PERSONA_MODE=headless` (screenshots only, no windows) |
| `PERSONA_DISMISS_MODALS=1` | Acknowledge a blocking mandatory-ack modal (a write) |
| `PERSONA_PASSWORD` | The test-account password (required, no default — must match what the `test.*` accounts were seeded with) |

## Safety notes

- Read-only by default; only `PERSONA_DISMISS_MODALS` performs a write.
- It signs in **real test accounts** on whatever `PERSONA_BASE_URL` points at. For
  write-heavy testing, point it at a local dev server, not production.
- Don't add non-`test.*` (real-user) accounts to `personas.json`.
