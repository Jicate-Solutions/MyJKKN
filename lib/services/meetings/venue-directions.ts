// lib/services/meetings/venue-directions.ts
//
// One place that turns a Resource Management room row into a single,
// visitor-facing "directions" line. Used by every surface that shows an
// in-person meeting's venue: the public booking page, the Google Calendar
// event location, and the confirmation email (venue-from-resource PR1).
//
// The resources fields are FREE-FORM human labels, not bare codes
// (building_number = "B Block" / "Multi Disciplinary Block", floor_number =
// "Second Floor", block_number = "2" OR "Main Office", room_number = "M244").
// So we only add a "Block "/"Floor "/"Room " prefix when the value is a bare
// number — never when it already reads as a label — to avoid garbled output
// like "Floor Second Floor" or "Block Main Office".

export interface VenueResourceFields {
  name?: string | null;
  building_number?: string | null;
  block_number?: string | null;
  floor_number?: string | null;
  room_number?: string | null;
  location_notes?: string | null;
}

/** Prefix `label` only when `value` is a bare number; otherwise use it verbatim. */
function labelled(value: string | null | undefined, label: string): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return /^\d+$/.test(v) ? `${label} ${v}` : v;
}

/** Room codes ("M244") read better as "Room M244"; skip if already self-labelled. */
function labelledRoom(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return /room/i.test(v) ? v : `Room ${v}`;
}

/**
 * Build a one-line directions string from a room row, e.g.
 *   "Board Room · B Block, Block 2, Ground floor"
 *   "Accident & emergency care · Multi Disciplinary Block, Block 2, Second Floor, Room M244"
 *   "Brain Storm Room · Main Office, First Floor · Main Administration"
 * Returns null when there is nothing useful to show.
 */
export function formatVenueDirections(r: VenueResourceFields | null | undefined): string | null {
  if (!r) return null;

  const name = (r.name ?? '').trim();
  const place = [
    (r.building_number ?? '').trim() || null, // building/block name — verbatim
    labelled(r.block_number, 'Block'),
    labelled(r.floor_number, 'Floor'),
    labelledRoom(r.room_number),
  ]
    .filter((p): p is string => Boolean(p))
    .join(', ');
  const notes = (r.location_notes ?? '').trim();

  const line = [name, place || null, notes || null]
    .filter((p): p is string => Boolean(p))
    .join(' · ');

  return line || null;
}
