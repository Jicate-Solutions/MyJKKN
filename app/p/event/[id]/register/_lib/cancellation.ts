// Public event registration page — what it asks the database for, and how it
// reads a cancellation without depending on a migration having been applied.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Code ships before migrations here. A deploy can land minutes or days before an
// operator applies `20261204113700_events_cancellation_reason_and_stamp.sql`.
//
// PostgREST fails an ENTIRE select when one named column is missing —
// `{"code":"42703","message":"column events.cancellation_reason does not
// exist"}`, HTTP 400, no rows. So naming `cancellation_reason` / `cancelled_at`
// in this page's main select would, on today's production schema, return no row
// for EVERY event and turn the public registration page into "Registration not
// available" for all 55 of them. Verified read-only against production
// 2026-09-13: the three columns do not exist, and no event is in `cancelled`.
//
// The main select therefore names only columns that exist today, and the two
// cancellation columns are fetched in a SECOND, best-effort query that is only
// ever run for an event already reading `status = 'cancelled'` — a state
// production cannot currently reach. Before the migration: nothing changes.
// After it: the reason and the date appear.

/**
 * Columns the registration page needs to decide whether it can take a
 * registration. Unchanged from before the cancellation work — deliberately.
 *
 * DO NOT ADD `cancellation_reason`, `cancelled_at` or `cancelled_by` HERE.
 * They are not on production yet, and one missing column fails the whole
 * select (42703), which would break public registration for every event.
 * `__tests__/events/public-register-cancellation.test.ts` fails if they are
 * added back.
 */
export const PUBLIC_EVENT_COLUMNS =
  'id, name, event_type, status, event_date, start_date, venue, venue_text, ' +
  'registration_open_date, registration_close_date, max_registrations';

export interface CancellationDetails {
  reason: string | null;
  cancelledAt: string | null;
}

/** Nothing known — what a pre-migration schema yields, and a safe render. */
export const NO_CANCELLATION_DETAILS: CancellationDetails = {
  reason: null,
  cancelledAt: null,
};

/**
 * The reason and the date, IF the columns exist.
 *
 * Any error at all — the columns missing (42703), the row gone, RLS — degrades
 * to nulls rather than throwing, and the page falls back to "The organiser has
 * not recorded a reason." A cancelled event still says it is cancelled; only the
 * detail is missing. That is the correct trade: the status is the part the
 * reader must not be denied.
 *
 * Typed against the minimum shape it uses so it can be called with the page's
 * supabase-js client and exercised in a test with a stub.
 */
export async function fetchCancellationDetails(
  client: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string
        ) => {
          maybeSingle: () => Promise<{
            data: { cancellation_reason?: string | null; cancelled_at?: string | null } | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  },
  eventId: string
): Promise<CancellationDetails> {
  try {
    const { data, error } = await client
      .from('events')
      .select('cancellation_reason, cancelled_at')
      .eq('id', eventId)
      .maybeSingle();

    if (error || !data) return NO_CANCELLATION_DETAILS;

    const reason = typeof data.cancellation_reason === 'string' ? data.cancellation_reason.trim() : '';

    return {
      reason: reason || null,
      cancelledAt: data.cancelled_at ?? null,
    };
  } catch {
    return NO_CANCELLATION_DETAILS;
  }
}

/** "13 September 2026", or null when there is no date to show. */
export function formatCancelledOn(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
