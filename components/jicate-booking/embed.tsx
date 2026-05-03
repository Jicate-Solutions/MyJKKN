'use client';

// SSO posture (v1): first-visit users see Cal.com login inside the iframe. Acceptable for v1.
// v2 path (recommended): subdomain cookie sharing + custom NextAuth provider on jicate-booking.
// See specs/cal-com-embed-sso.md (PR #668, merged 2026-05-03) for the full evaluation —
// rejected $299-$2499/mo Cal.com Platform; recommended ~1d implementation, zero recurring spend.

// Why a plain <iframe> instead of @calcom/embed-react:
// - @calcom/embed-react's getCalApi() loader defaults to fetching embed.js from app.cal.com,
//   not our self-hosted jicate-booking origin. That cross-script handshake fails:
//   "iframe doesn't exist. createIframe must be called before doInIframe" (caught 2026-05-03 in
//   prod via console inspection of /meetings/manage). Setting calOrigin on <Cal> is necessary
//   but not sufficient — embedJsUrl must also override, and even then the SDK's race conditions
//   are flaky for full-page embeds.
// - We don't need any SDK features: no floating widget, no postMessage UI customization, no
//   programmatic open/close. Just render the page in an iframe.
// - Plain <iframe> is bulletproof, smaller bundle, no cross-origin script-loader dependency.

const CALCOM_ORIGIN = 'https://jicate-booking.vercel.app';

export type JicateBookingEmbedMode = 'event-types' | 'availability' | 'booking';

interface JicateBookingEmbedProps {
  mode: JicateBookingEmbedMode;
  /** Required when mode === 'booking' — the Cal.com Booking.uid */
  uid?: string;
  /** Optional iframe height; defaults to 800px */
  height?: number;
  /** Optional Cal.com event-type slug for booking mode (e.g., 'engg-counseling') */
  eventTypeSlug?: string;
  /** Optional org slug for booking mode (e.g., 'jkkn-instituions') */
  orgSlug?: string;
}

/**
 * JicateBookingEmbed — renders the jicate-booking Cal.com instance inline within MyJKKN.
 *
 * Usage examples:
 *   // Show host-side event-types management (requires Cal.com login inside iframe on first visit)
 *   <JicateBookingEmbed mode="event-types" />
 *
 *   // Show host-side availability management
 *   <JicateBookingEmbed mode="availability" height={600} />
 *
 *   // Public booking flow via org + event-type slug
 *   <JicateBookingEmbed mode="booking" orgSlug="jkkn-instituions" eventTypeSlug="engg-counseling" />
 *
 *   // View a specific booking by UID
 *   <JicateBookingEmbed mode="booking" uid="abc123" />
 */
export function JicateBookingEmbed({
  mode,
  uid,
  height = 800,
  eventTypeSlug,
  orgSlug,
}: JicateBookingEmbedProps) {
  let path: string;

  if (mode === 'event-types') {
    path = '/event-types';
  } else if (mode === 'availability') {
    path = '/availability';
  } else {
    // mode === 'booking'
    if (uid) {
      path = `/booking/${uid}`;
    } else if (orgSlug && eventTypeSlug) {
      path = `/${orgSlug}/${eventTypeSlug}`;
    } else {
      throw new Error(
        '[JicateBookingEmbed] mode="booking" requires either `uid` or both `orgSlug` + `eventTypeSlug`.'
      );
    }
  }

  const src = `${CALCOM_ORIGIN}${path}`;

  return (
    <iframe
      src={src}
      title={`jicate-booking — ${mode}`}
      style={{
        width: '100%',
        height: `${height}px`,
        border: 0,
        borderRadius: '0.5rem',
        display: 'block',
      }}
      // Allow features Cal.com may need (camera/mic for video bookings, clipboard for copy-link).
      allow="clipboard-write; clipboard-read; camera; microphone; fullscreen"
      // referrerpolicy: send origin so jicate-booking knows MyJKKN is the parent (useful for
      // future SSO bridging per specs/cal-com-embed-sso.md).
      referrerPolicy="origin"
    />
  );
}

export default JicateBookingEmbed;
