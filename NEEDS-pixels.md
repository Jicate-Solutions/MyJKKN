# NEEDS — Meet conversion pixels

Branch: `feat/meet-conversion-pixels`
Scope: mount `<BookingTrackingScripts />` (GA4 + Meta Pixel base scripts) on the two
public booking surfaces. Env-gated and inert until ids are provisioned.

## Env ids to provision in Vercel (PUBLIC, not secrets)

The pixels stay disabled (component renders `null`) until BOTH/either of these
`NEXT_PUBLIC_*` ids are set in the Vercel project env. They are intended for the
browser bundle — pixel ids are public identifiers, not secrets:

- `NEXT_PUBLIC_GA4_MEASUREMENT_ID` — GA4 Measurement ID, format `G-XXXXXXXXXX`.
- `NEXT_PUBLIC_META_PIXEL_ID` — Meta (Facebook) Pixel id, numeric string.

Once either is set and the app is redeployed, the base page scripts (GA4
`page_view`, Meta `PageView`) fire automatically on the public booking surfaces.
Until then, shipping this is safe and inert.

## Files touched (this agent's scope only)

- `app/(public)/meet/[handle]/page.tsx` — per-host booking page. Server Component;
  mounted `<BookingTrackingScripts />` inside a fragment alongside the booking widget.
- `app/(public)/meet/page.tsx` — public directory. Server Component; mounted near the
  top of the page tree.

## Out of scope (handled elsewhere)

- The booking-success **conversion event** is fired by a sibling agent inside
  `app/(public)/meet/[handle]/_components/meet-booking-widget.tsx` — NOT touched here.
- Authenticated `/meetings/*` admin pages intentionally get NO base pixel (internal
  staff traffic must not be tracked as conversions).
