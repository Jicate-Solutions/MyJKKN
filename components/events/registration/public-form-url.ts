// components/events/registration/public-form-url.ts
//
// THE public registration URL for one form. One implementation, deliberately.
//
// This existed twice — once in registration-forms-panel.tsx and once in
// event-form-cards.tsx — and BOTH hardcoded /p/tournament/. Fixing the panel's
// copy left the cards' copy still handing out a dead link on every general
// event, because /p/tournament/[id]/register filters on
// event_type = 'sports_tournament' and rejects anything else. A duplicated URL
// builder is a duplicated bug; there is now one.

export type EventFormVariant = 'tournament' | 'general';

/**
 * Absolute so it can be pasted anywhere, and so the QR encodes something a
 * phone camera can actually open.
 *
 * Returns a path-only URL during SSR (no window). Callers render it in the
 * browser — the panel, the cards and the share dialog are all client
 * components — so an origin is always present in practice.
 */
export function publicFormUrl(
  eventId: string,
  slug: string,
  variant: EventFormVariant
): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const base = variant === 'tournament' ? 'tournament' : 'event';
  return `${origin}/p/${base}/${eventId}/register?form=${encodeURIComponent(slug)}`;
}
