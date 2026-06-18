# NEEDS — wiring for the booking integration scaffolds

These scaffolds are **new, standalone, env-gated** modules. They do nothing on
their own until something calls them. This file lists the wiring another agent /
PR must do (this PR intentionally does NOT touch the public booking page, the
book route, `permissions.ts`, `sidebarMenuLink.ts`, `vercel.json`,
`types/supabase.ts`, or any route-manifest).

## 1. Pixels on the public booking page
- **Wire `BookingTrackingScripts` into `app/(routes)/meet/[handle]/page.tsx`**
  (or the public booking layout). Import from
  `@/lib/services/analytics/booking-pixel-service` and render it once near the
  top of the page. It self-disables (renders null) when neither
  `NEXT_PUBLIC_GA4_MEASUREMENT_ID` nor `NEXT_PUBLIC_META_PIXEL_ID` is set, so it
  is safe to mount unconditionally.
  - Note: the file is `booking-pixel-service.tsx` (NOT `.ts`) — it contains JSX,
    which TypeScript only compiles in `.tsx`. The pure helper
    `getBookingPixelConfig()` is exported from the same file.
- Optional: fire a conversion event on the confirmation page — GA4
  `generate_lead` / Meta `Schedule` — with a stable event id for dedup.

## 2. Video link in the book route
- **In the book route (`app/api/.../book/route.ts` or the booking server
  action), when a meeting type's `location_mode = 'online'`, mint a join URL
  and store it on `meeting_bookings.video_url`.** Provider selection (once the
  config migration below is applied) reads
  `meeting_host_integration_prefs.video_provider`:
  - `google` → existing `GoogleCalendarService.createEvent({ withMeet: true })`
  - `zoom`   → `createZoomMeeting({ topic, startIso, durationMin, hostEmail })`
    from `@/lib/services/integrations/zoom-service`
  - `teams`  → `createTeamsMeeting({ topic, startIso, durationMin })`
    from `@/lib/services/integrations/teams-service`
  - Each returns `null` when its provider is unconfigured or the API fails —
    treat `null` as "no video link this time" and fall back (never block the
    booking on a link failure).

## 3. Paid meeting types (Razorpay)
- **In the book route, when a meeting type requires a deposit, call
  `createBookingOrder({ amountPaise, receipt: 'booking-<id>', notes })`** from
  `@/lib/services/integrations/razorpay-booking-service`, hand the returned
  `{ orderId, amountPaise, keyId }` to Razorpay Checkout on the client, then on
  the success callback call `verifyBookingPayment({ orderId, paymentId,
  signature })` server-side before confirming the booking.
  - `keyId` returned by `createBookingOrder` is the public checkout key (safe
    for the browser). The secret never leaves the server.
  - Decision needed (Director): booking deposits use the **common env** Razorpay
    account (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`), not the per-institution
    vault. If per-institution settlement is wanted for bookings, switch the
    service to `resolveRazorpayCredentials()`.

## 4. Per-host integration prefs migration (NOT applied)
- `supabase/migrations/20260619000200_meeting_integration_config.sql` adds
  `meeting_host_integration_prefs` + `fn_set_meeting_integration_pref`. **DO NOT
  apply blindly** — review, then apply via Supabase MCP, then run
  `NOTIFY pgrst, 'reload schema';` (already in the migration). After applying,
  regenerate `types/supabase.ts` so the new table is typed (this PR did not
  touch that file).
- A host-settings UI to call `fn_set_meeting_integration_pref('zoom', '<zoom
  host email>')` is not built here.

## 5. Env vars to provision (Vercel) — all empty today, modules inert until set
| Module | Vars |
|---|---|
| Zoom | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` (Server-to-Server OAuth app) |
| Teams | `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_ORGANIZER_USER_ID` (Entra app + Teams app-access-policy + service account — see `specs/ai-pulse-graph-attendance-integration-2026-06-18.md` IT checklist) |
| Razorpay (booking) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (reuses the existing billing env account) |
| Pixels | `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `NEXT_PUBLIC_META_PIXEL_ID` (public, not secrets) |

> Length-check each var after provisioning (a Vercel var can exist but be empty
> — see the "env var exists ≠ has a value" memory).
