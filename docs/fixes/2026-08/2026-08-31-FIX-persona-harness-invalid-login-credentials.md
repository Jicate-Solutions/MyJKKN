# Persona harness: "Invalid login credentials" was a missing env var, not a broken account

**Date:** 2026-08-31
**Area:** `scripts/persona-harness/harness.mjs`
**Severity:** blocks role-gated verification (every agent's "open it as a real user" step)
**Status:** fixed in code — one action still required from the Director (see below)

## Symptom

```
PERSONA_MODE=headless node scripts/persona-harness/harness.mjs superadmin:/meetings/manage
-> { role: superadmin, ok: false, error: "signIn test.superadmin@jkkn.ac.in: Invalid login credentials" }
```

Read literally, that says the super-admin test account is gone, disabled, or had its
password rotated. It said none of those things.

## Root cause

`PERSONA_PASSWORD` is a **required** environment variable with **no default**, and the
harness never checked that it was set.

Commit `388a6d4dc8` (2026-08-24 23:21 IST, *"fix(security): stop shipping the test
super-admin password in the public bundle"*) correctly removed the hardcoded fallback:

```diff
-const PASSWORD = process.env.PERSONA_PASSWORD || CONFIG.password || 'Test@1234';
+const PASSWORD = process.env.PERSONA_PASSWORD || CONFIG.password;
```

`personas.json` carries no `"password"` key, so with the variable unset `PASSWORD`
is `undefined`. `signInWithPassword({ email, password: undefined })` sends no
password, and Supabase answers every password rejection with the same generic
string — `Invalid login credentials` — whether the password was wrong, empty, or
the account never existed. The harness passed that string straight through.

### Reproduced

From a clean `jicate/main` worktree, `PERSONA_PASSWORD` explicitly unset:

```
$ env -u PERSONA_PASSWORD PERSONA_MODE=headless node scripts/persona-harness/harness.mjs superadmin:/meetings/manage
[{ "role": "superadmin", "email": "test.superadmin@jkkn.ac.in", "path": "/meetings/manage",
   "ok": false, "error": "signIn test.superadmin@jkkn.ac.in: Invalid login credentials" }]
```

Byte-identical to the reported failure.

### Why it "worked on 08-25 and broke on 08-31"

Nothing changed between those dates. **Which checkout ran it** changed.

`388a6d4dc8` is on `jicate/main`. The local long-lived working branch
(`feat/campus-living-fee-compute-engine`, ~720 commits diverged) does **not** contain
it and still carries the `|| 'Test@1234'` fallback on line 56. So the harness
succeeds from the local checkout and fails from every worktree cut from production —
which is exactly where agents run it. The `localhost:3107` vs `https://www.jkkn.ai`
difference in the two runs is a coincidence, not the cause; the sign-in never reaches
the target site at all, it goes to Supabase.

## What was ruled out (production, read-only)

Queried via the Supabase Management API against project `kvizhngldtiuufknvehv`:

| Account | confirmed | banned | deleted | `is_active` | `profile_completed` | role | last successful login |
|---|---|---|---|---|---|---|---|
| `test.superadmin@jkkn.ac.in` | yes | no | no | true | true | `super_admin` | **2026-08-30 16:17 UTC** |
| `test.hod@jkkn.ac.in` | yes | no | no | true | true | `hod` | 2026-08-30 03:38 UTC |
| `test.faculty@jkkn.ac.in` | yes | no | no | true | true | `staff_counselor` | 2026-08-30 03:38 UTC |
| `test.staff@jkkn.ac.in` | yes | no | no | true | true | `staff` | 2026-08-30 03:38 UTC |
| `test.student@jkkn.ac.in` | yes | no | no | true | true | `student` | 2026-08-25 02:13 UTC |

All five are `email` (password) identities, all hold an `encrypted_password`.

`auth.audit_log_entries`, last 30 days, all `test.*` accounts: **zero**
`user_updated_password` or `user_modified` events. `test.superadmin` alone shows
**149 successful `login` actions**, the most recent ~14 hours before the reported
failure. The `auth.users.updated_at` bump at 2026-08-31 03:12 that looks like a
password change is a `token_refreshed` + `token_revoked` pair, nothing else.

**The password was not rotated and no account is broken.** The harness was reading
the right project (`kvizhngldtiuufknvehv`, matching `.env.local`) with the right
anon key.

> Note on `profiles.is_super_admin`: it is a generated column (`role = 'super_admin'`),
> not a settable flag — it cannot drift out of step with the role and was never a
> candidate cause.

## Fix applied

`scripts/persona-harness/harness.mjs`:

1. **Fail fast on a missing password.** If `PERSONA_PASSWORD` (and `personas.json`'s
   `password`) are absent, throw before the first network call, naming the variable,
   the Supabase project the harness resolved, and the README. This also stops the
   run firing one failed login per persona at production auth.
2. **Name the project and target in a sign-in failure.** `signIn <email> on Supabase
   project <ref> (target <baseUrl>): <message>` — so a genuine credential mismatch is
   distinguishable from pointing at the wrong project.
3. **Name the missing env file.** A fresh worktree has no `.env.local`; `readFileSync`
   previously surfaced a bare `ENOENT`. It now says what the harness needed and how
   to supply it.

`scripts/persona-harness/README.md` gains a Troubleshooting table mapping each of the
three messages to its cause, and states plainly that `Invalid login credentials` says
nothing about whether an account exists.

## Still required from the Director — one step, ~10 seconds

The harness cannot run without the password, and nobody but you should supply it.
No password is stored in the repo any more, by design.

1. In the shell you run harness commands from:
   `export PERSONA_PASSWORD='<the password the test.* accounts were seeded with>'`
2. To make it permanent for every session, add that same line to `~/.zshrc`
   (`~/.zprofile` also works) and open a new terminal.
3. Sanity check — this must print `ok: true`:
   `PERSONA_MODE=headless node scripts/persona-harness/harness.mjs superadmin:/meetings/manage hod:/ai-pulse/lab`

If step 3 now returns `Invalid login credentials` **with a project ref in the
message**, then and only then is the password itself wrong, and re-seeding is the
next step (`PERSONA_PASSWORD=... npx tsx scripts/create-test-accounts.ts`, which reads
the same variable). Given 149 successful logins in the last 30 days, that is unlikely.

Separately, `388a6d4dc8`'s own note still stands: the literal was public and **should
be rotated**. Rotating it means re-seeding with the new value and exporting the new
value — the code needs no further change.

## Not fixed here (deliberate, out of scope)

- `scripts/persona-harness/two-sided-probe.local.mjs` has the identical unvalidated
  `PERSONA_PASSWORD` and will produce the same misleading error.
- `scripts/persona-harness/person-history-mobile-probe.local.mjs:27` **still contains
  the `Test@1234` literal** — missed by the 08-24 sweep, which listed only `.md`
  files as remaining. It is a local probe script, not shipped in any bundle, but it
  is a credential in the repo and should go the same way as the others.

## Verification

- Reproduced the original error verbatim with `PERSONA_PASSWORD` unset (above).
- After the fix, the same command stops with the actionable message and makes no
  auth request.
- With `.env.local` removed, the new message names the file and the remedy.
- A green end-to-end run (two roles authed on production) was **not** performed: it
  requires handling the account password, which this work was not permitted to do.
  That step is the Director's sanity check above.
