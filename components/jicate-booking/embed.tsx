'use client';

import { useEffect } from 'react';
import Cal, { getCalApi } from '@calcom/embed-react';

// SSO posture (v1): first-visit users see Cal.com login inside the iframe. Acceptable for v1.
// v2 path (recommended): subdomain cookie sharing + custom NextAuth provider on jicate-booking.
// See specs/cal-com-embed-sso.md (PR #668, merged 2026-05-03) for the full evaluation —
// rejected $299-$2499/mo Cal.com Platform; recommended ~1d implementation, zero recurring spend.

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
  // Compute the calLink (path relative to origin) based on mode.
  // getCalApi() preloads the embed JS so it's ready before the <Cal> component renders.
  let calLink: string;

  if (mode === 'event-types') {
    calLink = 'event-types';
  } else if (mode === 'availability') {
    calLink = 'availability';
  } else {
    // mode === 'booking'
    if (uid) {
      calLink = `booking/${uid}`;
    } else if (orgSlug && eventTypeSlug) {
      calLink = `${orgSlug}/${eventTypeSlug}`;
    } else {
      throw new Error(
        '[JicateBookingEmbed] mode="booking" requires either `uid` or both `orgSlug` + `eventTypeSlug`.'
      );
    }
  }

  useEffect(() => {
    (async () => {
      const cal = await getCalApi();
      cal('ui', {
        styles: { branding: { brandColor: '#1e40af' } },
        hideEventTypeDetails: false,
        layout: 'month_view',
      });
    })();
  }, []);

  return (
    <Cal
      calLink={calLink}
      calOrigin={CALCOM_ORIGIN}
      style={{
        width: '100%',
        height: `${height}px`,
        border: 0,
        borderRadius: '0.5rem',
      }}
    />
  );
}

export default JicateBookingEmbed;
