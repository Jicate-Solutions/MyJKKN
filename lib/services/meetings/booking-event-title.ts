// lib/services/meetings/booking-event-title.ts
//
// One pure function, deliberately alone in its own file.
//
// It used to live in native-scheduling-service.ts, next to its only caller.
// That module reaches Resend, the browser Supabase client and the admission
// ActivityService, and every one of those is constructed at IMPORT time and
// throws without its env — so anything wanting just this string had to boot
// half the application first. The guest-first retitle backfill
// (scripts/retitle-calendar-events-guest-first.ts) is exactly that: a CLI that
// needs the title format and nothing else.
//
// native-scheduling-service.ts re-exports it, so every existing importer is
// unchanged and there is still only ONE definition of what a booking is called.

/**
 * What a booking is called on the host's calendar.
 *
 * THE GUEST'S NAME COMES FIRST, deliberately. It used to read
 * `${meetingType} — ${guest}`, and every one of the Director's one-to-one types
 * is 47-48 characters ("One to One Meeting with Ommsharravana 5 Minutes"), so a
 * phone truncated the line before ever reaching the name. Four back-to-back
 * bookings rendered as four identical rows and the host walked in blind — the
 * information was in the title all along, just past the cut.
 *
 * Format matches what the Director had before this system replaced Calendly:
 *
 *     Nazarkhan K — To discuss regarding the transfer
 *     KTHIRESAN — medical
 *
 * The meeting-type name is dropped when a discussion note exists: between "what
 * kind of slot this was" and "what this person wants", only the second earns the
 * characters. With no note, the type name is the fallback rather than leaving a
 * bare name.
 *
 * `showNote` stays the host's opt-in and is deliberately NOT flipped on for
 * everyone here: the guest is an attendee, so this title lands on THEIR lock
 * screen too, and one host's convenience is not a reason to publish another
 * guest's stated business. Reordering is safe for everybody; disclosing the note
 * is a choice each host makes.
 */
export function bookingEventTitle(opts: {
  attendeeName: string | null | undefined;
  typeTitle: string;
  note?: string | null;
  showNote?: boolean;
}): string {
  const who = (opts.attendeeName ?? '').trim() || 'Guest';
  const note = (opts.note ?? '').trim();
  if (opts.showNote && note) return `${who} — ${note}`;
  return `${who} — ${opts.typeTitle}`;
}
