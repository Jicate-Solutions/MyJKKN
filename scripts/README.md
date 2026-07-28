# scripts/

Developer utilities for MyJKKN. Not shipped to production.

## `local-auth.sh` — one-command local dev login

Log any MyJKKN user into `http://localhost:3104` (default; overridable via
`LOCAL_DEV_PORT` env var) without going through the Google OAuth flow.
Uses Supabase admin `generate_link` → `/auth/dev-login` client-side token
exchange.

**Why port 3104 not 3000:** port 3000 is the default for every Next.js
and React starter — directors juggling multiple dev servers routinely hit
collisions. MyJKKN's `npm run dev` is pinned to 3104 in `package.json` and
this script expects 3104 by default. Override via `LOCAL_DEV_PORT=3000
scripts/local-auth.sh ...` if you specifically want 3000 for one-off reasons.

### Usage

```bash
# Default: director@jkkn.ac.in, lands on /
scripts/local-auth.sh

# Specify email + target page
scripts/local-auth.sh director@jkkn.ac.in /events/propose
scripts/local-auth.sh counselor@jkkn.ac.in /admission
scripts/local-auth.sh faculty@jkkn.ac.in /academic/attendance
```

The script:
1. Reads `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`
2. Calls Supabase `admin/generate_link` for the given email
3. Rewrites the magic-link's `redirect_to` to include `?next=<target>`
4. Opens the link in your default browser
5. `/auth/dev-login` exchanges the token client-side, sets session cookies, redirects to `?next`

### One-time setup (first time only)

All three below are **required** for `local-auth.sh` to work. Do them once.

1. **Supabase dashboard → Authentication → URL Configuration → Redirect URLs:**
   Add `http://localhost:3104/auth/dev-login` to the allow-list.

2. **`.env.local` additions:**
   ```
   NEXT_PUBLIC_ENABLE_DEV_LOGIN=true
   ```
   Also confirm existing keys are present:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

3. **Dev server running:**
   ```bash
   npm run dev
   # Next.js serves at http://localhost:3104
   ```

Then test:
```bash
scripts/local-auth.sh director@jkkn.ac.in /events/propose
```

### How it's different from `/auth/callback`

| Route | Handles | Used by |
|---|---|---|
| `/auth/callback` | PKCE `?code=...` | Google OAuth (production Sign-In-with-Google flow) |
| `/auth/dev-login` | Hash fragment `#access_token=...` AND `?token_hash=...` | Magic-link flow from `admin.generate_link` (this script) |

Both set Supabase session cookies and keep RLS working the same way. The
difference is purely how the token is delivered from Supabase to the browser.

### Security

`/auth/dev-login` is gated behind `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true`. In
production (where the env var is unset/false), the page displays "disabled"
and no auth exchange happens. Defense-in-depth: `admin.generate_link` requires
a service-role key, so token possession already implies insider access — but
we keep the route neutered in prod anyway.

### Troubleshooting

| Symptom | Fix |
|---|---|
| "No token found in URL" on dev-login page | Magic link expired (default 1h) — rerun `scripts/local-auth.sh` |
| "Cannot find module 'urllib.parse'" | Your python3 is very old; upgrade to 3.6+ |
| Browser stays on Supabase `/auth/v1/verify` | Supabase allow-list missing `http://localhost:3104/auth/dev-login` |
| Dev-login says "disabled" | Set `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` in `.env.local` and restart `npm run dev` |
| `curl: (43) bad argument` | Old script bug; pull latest |

---

## `check-migration-applied.py` — the deploy migration gate

Deploy ships **code**. It does **not** apply migrations. So a merged PR can put
code live that expects schema which was never applied to production, and the
page 500s. This is the gate that makes that gap impossible to ship silently —
it is what `/deploy-myjkkn` Step 1.6 invokes.

### Usage

```bash
# One or many migration files. Read-only: it never writes to the database.
python3 scripts/check-migration-applied.py supabase/migrations/2026*_my_change.sql
```

| Exit | Meaning |
|---|---|
| `0` | Every declared object was verified present in production |
| `1` | Operational error (no token, unreadable file, query failed) |
| `2` | **GAP** — at least one declared object is missing from production |
| `3` | **NOT CHECKABLE** — the file declares nothing this gate can verify |

Credentials come from the environment, never from the source: `SUPABASE_PROJECT_REF`,
and `SUPABASE_ACCESS_TOKEN` or `SUPABASE_ACCESS_TOKEN_FILE` (default
`~/.supabase/access-token`). The token is handed to curl on stdin, so it never
appears in `ps` output and is never printed.

### What it checks

It parses the migration for the objects it *declares* — tables, added columns,
functions (name **and** arity, so a new overload is not satisfied by the old
one), constraints, types, enum values, indexes, views, materialized views,
policies (including ones created inside `DO $$ … EXECUTE $$` blocks), triggers
and storage buckets — then asks live production, in one round-trip, whether each
exists. For a `CHECK` constraint it also asserts every string literal the
migration declares actually appears in `pg_get_constraintdef`, so a
drop-and-re-add that widens a vocabulary cannot pass on name alone.

**Why introspection and not `supabase_migrations.schema_migrations`:** SQL here
is applied through the Supabase Management API, which does not write the
migration ledger — only `supabase db push` does. The ledger lies. Catalog
introspection is ground truth regardless of *how* the SQL was applied.

### The REVOKE/GRANT-only case

A privilege-only migration creates no objects at all, so a pure object-existence
check passes it while verifying literally nothing — and those are the most
security-critical files we ship. Two behaviours cover it:

- **Literal** `GRANT`/`REVOKE` statements are parsed and the real privilege state
  is verified with `has_function_privilege()` / `has_table_privilege()`. `PUBLIC`
  is read straight off the ACL, because `has_*_privilege()` rejects the
  pseudo-role and silently skipping it would hide the exact
  `REVOKE … FROM anon` -but-not- `FROM PUBLIC` trap these migrations exist to close.
- **Dynamic** privilege changes — `EXECUTE format('REVOKE … %s', sig)` inside a
  `DO` block — carry no static signature, so the gate exits `3` with an explicit
  *"NOT CHECKABLE BY OBJECT EXISTENCE — verify grants manually"* message and a
  ready-to-paste query. It does not report PASS.

### Known limits (read before trusting a green run)

- **`CREATE OR REPLACE FUNCTION` is verified by name and arity, not by body.**
  A stale replace that reverts a live function's logic still passes. For a
  SECDEF function that gates money or access, cross-check
  `md5(pg_get_functiondef(oid))` before and after applying.
- **Each file is judged in isolation, not as a net of history.** Running it over
  an old migration whose column a later migration dropped correctly reports
  MISSING. Run it on the migrations in the PR being deployed.
- **Pass the migration files as separate arguments, not concatenated into one
  temp file.** The script already reports per file. Concatenating a PR whose
  first migration adds a column and whose second drops it makes the added column
  look absent, which is a false GAP. (`/deploy-myjkkn` Step 1.6 currently
  concatenates — worth changing there.)
- **Data-only migrations** (`INSERT`/`UPDATE`/`DELETE`) declare no schema, so they
  exit `3`. That is deliberate — verify the rows by hand.
- Exit `3` is non-zero on purpose. A gate that cannot fail is not a gate.
