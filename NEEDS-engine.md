# NEEDS — Universal Booking transactional engine

Follow-ups, runtime config, and decisions for the booking engine
(`feat/meet-booking-engine-video-pay`). None of these block the PR from merging —
every new path degrades gracefully when its dependency is absent.

## Runtime config the Director / IT must supply (all env-gated, inert until set)

- **Zoom (per-host `video_provider='zoom'`)** — `ZOOM_ACCOUNT_ID`,
  `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` (Server-to-Server OAuth app). Until set,
  `isZoomConfigured()` is false → online bookings for a Zoom-preferring host get
  no video link (the booking still succeeds). A host also needs
  `meeting_host_integration_prefs.provider_host_identity` = their Zoom user email
  (else the meeting is created under the token's own `'me'` user).
- **Teams (per-host `video_provider='teams'`)** — `MS_GRAPH_TENANT_ID`,
  `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_ORGANIZER_USER_ID`
  (Graph app-only). Until set, no Teams link (booking still succeeds).
- **Razorpay deposits** — `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (the COMMON
  platform account; the booking service reads env only, not the per-institution
  vault). Until set, `isRazorpayBookingConfigured()` is false → a meeting type
  with `requires_deposit=true` is offered as a FREE booking (the slots route
  reports `requiresDeposit:false`, the widget skips Checkout). No dead-end.
- **Conversion pixels (optional)** — `NEXT_PUBLIC_GA4_MEASUREMENT_ID`,
  `NEXT_PUBLIC_META_PIXEL_ID`. The widget now mounts `<BookingTrackingScripts />`
  (self-disables when both unset) and fires `generate_lead` (GA4) / `Schedule`
  (Meta) on a confirmed booking. No pixel ⇒ silent no-op.

## Decisions made (no Director input needed, but flagged for awareness)

1. **Group-capacity constraint = `seat_index` in the gist key (NOT skip-group).**
   The migration adds `meeting_bookings.seat_index smallint DEFAULT 0` and
   reshapes `mb_no_double_booking` to `(host, seat_index, tstzrange) WHERE
   status='confirmed'`. Solo/collective/round_robin stay at seat 0 (unchanged
   1-per-host-per-slot guard); group bookings claim seat = current confirmed
   count, so distinct seats coexist but the SAME seat still races at the DB
   (two requests that read the same count collide → 23P01 → SLOT_TAKEN; no
   over-selling). Rationale in the migration header. The partial skip-group
   alternative was rejected because it removes the DB-level race guard for group
   seats entirely.

2. **Deposit verify-then-confirm, two-step book route.** A deposit type's widget
   POSTs `{mode:'order'}` → route creates a Razorpay order → widget opens
   Checkout → on success POSTs `{razorpayOrderId,razorpayPaymentId,
   razorpaySignature}` → route verifies the HMAC server-side BEFORE
   `createBooking` (which stamps `payment_status='paid'`, stores
   `payment_order_id`/`payment_id`). An unverified/absent payment on a deposit
   type returns 402 and creates no booking.

3. **Conversion pixel fires inline via the existing `getBookingPixelConfig()`.**
   The booking-pixel-service exports config + a `<BookingTrackingScripts />`
   loader but NO conversion-firing helper. Rather than add an export to a
   non-owned file, the widget (owned) gates on `getBookingPixelConfig()` and
   calls `window.gtag`/`window.fbq` directly. If a shared
   `trackBookingConversion()` helper is later added to booking-pixel-service,
   the widget's `fireBookingConversion()` can be swapped to call it.

4. **(A) schema already existed — migration adds nothing for video links.**
   `meeting_types.location_mode/location_text`, `meeting_bookings.video_url`,
   and `meeting_host_integration_prefs` were laid by prior waves (20260612090000,
   20260619000200). The original task framing ("meeting_types has NO location
   column; add location_mode + location_value") was stale — I used the existing
   `location_text`, did NOT add a `location_value`, and the book path now branches
   the existing `video_url` by the host's provider pref.

## Open questions for the Director (non-blocking)

- **Refund on cancel for paid bookings?** A deposit is captured at booking time
  (`payment_capture=1`). Cancelling a paid booking does NOT auto-refund today —
  the cancel path is unchanged. If deposits should be refundable on cancel, that
  needs a Razorpay refund call + a `refunded` payment_status (not built here).
- **Per-institution Razorpay account?** Deposits use the COMMON env account. If
  a host's institution should receive the deposit into its own account, route
  through the per-institution credential vault (`resolve-credentials.ts`) — a
  larger change, deferred per the razorpay-booking-service header.

## No new permission keys / nav / shared-registry edits

This work extends the host-owned `/meetings/manage` editor and the public
`/meet/[handle]` surface. No `lib/constants/permissions.ts`,
`lib/sidebarMenuLink.ts`, `vercel.json`, `types/supabase.ts`, or route-manifest
changes were needed.
