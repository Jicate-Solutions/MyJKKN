# scripts/

Developer utilities for MyJKKN. Not shipped to production.

## `local-auth.sh` — one-command local dev login

Log any MyJKKN user into `http://localhost:3000` without going through the
Google OAuth flow. Uses Supabase admin `generate_link` → `/auth/dev-login`
client-side token exchange.

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
   Add `http://localhost:3000/auth/dev-login` to the allow-list.

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
   # Next.js serves at http://localhost:3000
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
| Browser stays on Supabase `/auth/v1/verify` | Supabase allow-list missing `http://localhost:3000/auth/dev-login` |
| Dev-login says "disabled" | Set `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` in `.env.local` and restart `npm run dev` |
| `curl: (43) bad argument` | Old script bug; pull latest |
