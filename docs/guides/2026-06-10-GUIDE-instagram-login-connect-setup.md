# Instagram Business Login — Setup & Connect Guide (Track 3)

**Date:** 2026-06-10
**Audience:** Director / Meta app admin
**Code:** PR `feat/instagram-login-connect` (dormant until Step 1–2 below are done)

## What this is

The ~53 department Instagram accounts have **no linked Facebook Page**, so the
existing system-token pipeline can only read their *public* metrics
(`business_discovery`: followers, posts, likes, comments). **Instagram Business
Login** is the only per-account route to their *private* insights — reach,
profile views, accounts engaged, total interactions, follower demographics —
without creating a Facebook Page.

How it works: each account owner opens a connect link → approves on
Instagram → MyJKKN receives a per-account 60-day token (auto-refreshed daily
by cron) → the new `ig-login-insights-poll` cron reads full insights hourly
via `graph.instagram.com`.

## Step 1 — Meta app configuration (~15 min, one time)

On the **JKKN Institutions** app (`437028995095541`) at
[developers.facebook.com](https://developers.facebook.com/apps/437028995095541):

1. **Add product:** App Dashboard → *Add product* → **Instagram** → set up
   **API with Instagram Login** ("Business Login for Instagram").
2. **Business Login settings:** under Instagram → *API setup with Instagram
   login* → *Set up Instagram business login*, add the OAuth **redirect URI**
   (must match exactly):

   ```
   https://www.jkkn.ai/api/social/instagram/connect/callback
   ```

3. **Copy the credentials** shown on that product page — note these are the
   **Instagram App ID** and **Instagram App Secret** (different values from
   the Meta App ID/secret).

## Step 2 — Vercel environment variables

Add to the `my-jkkn` Vercel project (Production):

| Variable | Value |
|---|---|
| `INSTAGRAM_APP_ID` | Instagram App ID from Step 1.3 |
| `INSTAGRAM_APP_SECRET` | Instagram App Secret from Step 1.3 |

> ⚠️ Env-var-only changes do not trigger a deploy. After adding the vars,
> redeploy (deploy hook or a trigger commit) so they take effect.
> Until these are set, every connect surface answers
> `503 Instagram Login not configured` — the code is safely dormant.

## Step 3 — App testers (until App Review clears)

`instagram_business_manage_insights` needs **Advanced Access** (Meta App
Review — multi-week, ties into the already-pending review). Until approved,
the connect flow works **only for accounts added as testers**:

- App Dashboard → Roles → **Instagram Testers** → add the department
  account's Instagram handle → the department accepts the invite in
  Instagram (*Settings → Apps and websites → Tester invites*).

Pick 1–2 pilot accounts (e.g. `@jkkn_periodontics`) to prove the loop
end-to-end before App Review completes.

## Step 4 — Connecting an account (admin flow)

On **`/admission/social/departments`** (relocated from `/admin/social/departments` by PR #1307), each row now has an **IG Login** column:

- **Connect now** — use when this browser/phone is logged into that
  department's Instagram account; it goes straight to the approval screen.
- **Copy connect link** (copy icon) — copies a 24-hour shareable authorize
  link. Send it (WhatsApp) to the staffer who runs the account; they open it
  on their phone, approve, and see a "connected — close this tab" page.
- **Connected** badge + unlink icon appear once authorized. **Expired /
  Error** badges show a *Reconnect* button when a token lapses.

After connecting, the account's `metrics_source` flips to `instagram_login`:
the hourly `ig-login-insights-poll` (at :37) takes over with full insights,
and the public-only `business_discovery` poll skips it automatically.
Disconnecting hands the account back to `business_discovery`.

## Step 5 — App Review (the multi-week gate)

Request **Advanced Access** for `instagram_business_basic` and
`instagram_business_manage_insights` in the app's App Review submission
(same submission as the pending Facebook-side review). Until then, insights
return data only for tester accounts — be aware the full 53-account payoff
is gated on this approval.

## Verification (after Steps 1–2)

```bash
# Cron skips cleanly until config lands / connections exist:
curl -s https://www.jkkn.ai/api/cron/ig-login-insights-poll \
  -H "Authorization: Bearer $CRON_SECRET"

# After a pilot connect: expect polled=1, account_metrics=1
# and a fresh row in ig_account_metrics with reach/profile_views non-null
# (tester accounts only, until App Review).
```

## Related

- `supabase/migrations/20260610213000_ig_account_connections.sql` — token
  store (tokens are service-role-only via column-level grants; admins see
  status, never tokens).
- `lib/instagram/login-client.ts` — OAuth + `graph.instagram.com` client.
- Tracks recap: Track 1 `business_discovery` (live, public metrics) ·
  Track 2 Facebook Pages (Director's plan, zero code — Page-link then flip
  `metrics_source` to `graph`) · Track 3 this guide (full insights, no Page).
