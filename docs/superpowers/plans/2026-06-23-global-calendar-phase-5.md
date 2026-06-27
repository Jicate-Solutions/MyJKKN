# Global Calendar Module — Phase 5 (Google Calendar ICS Feed) Plan

> Final phase. Builds on Phases 1-4 (branch `feat/global-calendar-phase-1`). One-way MyJKKN → Google via a per-user secret ICS subscription URL.

**Goal:** Each user can subscribe their personal Google Calendar to a private `/api/calendar/feed/<token>.ics` URL that renders their scoped calendar (holidays/events/meetings/reservations — NOT person-level leave).

## Decisions (confirmed)
- **Token model:** new `calendar_feed_tokens` table (rotate/revoke/audit; opt-in — no URL until generated).
- **Feed scope:** EXCLUDE person-level leave (`kind='leave'`) — the URL is a bearer secret exported to Google.
- **Resolver approach:** refactor `fn_calendar_items` → core `fn_calendar_items_for_user(p_user_id, …)` + thin `auth.uid()` wrapper (single source of truth). The ICS path calls the core with `p_user_id` resolved from the token and `p_kinds` excluding `'leave'`.

## Global Constraints
Inherit Phases 1-4. The ICS endpoint is PUBLIC (token-authed, no session) → MUST be registered in `proxy.ts` (`PUBLIC_PATH_PREFIXES`). `fn_calendar_ics` is the ONE function intentionally granted to `anon` (gated entirely by the token). Refactor of the live resolver is load-bearing → verify by CALLING both wrapper and core.

---

## Task 1 — DB: token table + resolver refactor + feed functions (controller-applied)
Migration `20260623140000_calendar_ics_feed.sql`:
1. **`calendar_feed_tokens`** (id, user_id→profiles, token text UNIQUE, is_active bool default true, created_at, revoked_at, last_accessed_at). Index `(user_id) WHERE is_active`. RLS: SELECT/ALL where `user_id = auth.uid()` OR is_super_admin(); REVOKE anon.
2. **`fn_calendar_items_for_user(p_user_id uuid, p_institution_ids uuid[], p_start date, p_end date, p_feeds text[], p_kinds text[])`** — the existing 10-branch body with `auth.uid()` → `p_user_id` and `user_has_permission('calendar.people_leave.view')` → `user_has_permission(p_user_id, 'calendar.people_leave.view')`. SECURITY DEFINER. REVOKE anon / GRANT authenticated.
3. **`fn_calendar_items(p_institution_ids, p_start, p_end, p_feeds, p_kinds)`** — thin wrapper: `RETURN QUERY SELECT * FROM fn_calendar_items_for_user(auth.uid(), …)`. Same signature/return as today (no caller breakage). REVOKE anon / GRANT authenticated.
4. **`fn_calendar_generate_feed_token()`** RETURNS text — revoke caller's active tokens, insert a new `replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')` token for `auth.uid()`, return it. SECURITY DEFINER, GRANT authenticated.
5. **`fn_calendar_revoke_feed_token()`** RETURNS void — set caller's active tokens is_active=false, revoked_at=now(). GRANT authenticated.
6. **`fn_calendar_ics(p_token text, p_start date, p_end date)`** RETURNS TABLE(same 17 cols) — resolve `user_id` from an active token (else RETURN empty), bump `last_accessed_at`, then `RETURN QUERY SELECT * FROM fn_calendar_items_for_user(v_uid, NULL, p_start, p_end, NULL, ARRAY['holiday','event','meeting','reservation'])` (excludes leave). SECURITY DEFINER. **GRANT EXECUTE to anon, authenticated** (token IS the auth).
Verify by CALLING fn_calendar_items (wrapper) + fn_calendar_items_for_user(some uid) + fn_calendar_ics('bad-token',…)=0 rows. Mirror deferred.

## Task 2 — ICS builder + public API route (implementer)
- `lib/calendar/ics.ts`: `buildIcs(items: CalendarItem[], calName: string): string` — emit `BEGIN:VCALENDAR … VERSION:2.0 PRODID:… X-WR-CALNAME` + one `VEVENT` per item (UID=item_id@myjkkn, DTSTAMP, DTSTART/DTEND — all-day → `;VALUE=DATE` with `yyyymmdd`; timed → UTC `yyyymmddThhmmssZ`, SUMMARY=title (+ institution_name), DESCRIPTION=category, escape `,;\\\n`). CRLF line endings.
- `app/api/calendar/feed/[token]/route.ts`: GET handler, PUBLIC. Use a Supabase client (anon key, server) to `.rpc('fn_calendar_ics', { p_token, p_start: <today-90d>, p_end: <today+365d> })`; build ICS; return `new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=3600' } })`. Token from `params.token` (strip a trailing `.ics`). No session needed.
- `proxy.ts`: add `'/api/calendar/feed/'` to `PUBLIC_PATH_PREFIXES` (read the file; insert next to other public API prefixes).

## Task 3 — Token service + hooks (implementer)
- `CalendarService`: `getMyFeedToken()` (select active token for current user), `generateFeedToken()` (`.rpc('fn_calendar_generate_feed_token')`), `revokeFeedToken()` (`.rpc('fn_calendar_revoke_feed_token')`).
- Hooks: `useMyFeedToken`, `useGenerateFeedToken`, `useRevokeFeedToken` (invalidate the feed-token query).

## Task 4 — "Subscribe" UI (implementer)
- A card on `/calendar` (e.g. a "Subscribe to Google Calendar" button/section): if a token exists, show the full feed URL (`${origin}/api/calendar/feed/${token}.ics`) + Copy + Rotate + Revoke; else a "Generate feed URL" button. Brief instructions ("Add to Google Calendar → Other calendars → From URL"). Available to any `calendar.view` user.

## Task 5 — Final verification
Call fn_calendar_ics with a real generated token (rows, leave excluded); curl the public route (valid ICS, reachable without a session — proxy allow-list); gen:routes/check:menus. Whole-branch review of Phase-5 commits (focus: public-endpoint security, token gating, leave exclusion, resolver-refactor preserves all callers).
