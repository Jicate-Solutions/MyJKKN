// lib/services/cohorts/programme-coordinator-constants.ts
//
// The few plain facts about programmes that BOTH the browser panel and the
// server-side notification route need. Deliberately its own file, with no
// Supabase client and no React, because programme-coordinator-service.ts holds
// the BROWSER client at module scope and must never be imported by a route
// handler.
//
// Nothing here decides access or behaviour. The database RPCs decide who may
// appoint whom; this file only supplies words to put on screen and, where one
// exists, the address of the programme's applications queue.

/**
 * The programme kinds `fn_cohort_coordinators_overview()` returns today
 * (read live from production 2026-08-08: cdc, foundations, mba_associate,
 * school_of_influence, sf100, trainer).
 *
 * A kind that is not listed is NOT an error — it is simply new, and
 * `programmeLabel` turns it into readable words rather than hiding it.
 */
export const PROGRAMME_LABELS: Record<string, string> = {
  cdc: 'Career Development Centre',
  foundations: 'Foundations',
  mba_associate: 'MBA Associates',
  school_of_influence: 'School of Influencer',
  sf100: 'Solve for 100',
  trainer: 'Trainers',
};

/** A programme's name in words. Falls back to the kind, tidied up. */
export function programmeLabel(kind: string): string {
  const known = PROGRAMME_LABELS[kind];
  if (known) return known;
  return kind
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Where a coordinator goes to work through who has applied.
 *
 * Only School of Influence has an applications queue on the platform today
 * (checked across app/(routes) 2026-08-08). The other programmes get a
 * notification with no link rather than a link to a page that does not exist —
 * a dead link in a notification is worse than none.
 */
const PROGRAMME_APPLICATIONS_URL: Record<string, string> = {
  school_of_influence: '/startup-studio/school-of-influence/admin/applications',
};

/**
 * @param eventId The programme's event, when the caller knows it. Carrying it
 *   means the newly appointed coordinator lands ON the queue instead of on a
 *   screen that has to work out which programme they meant — which is where the
 *   coordinator in BUG-005799 / BUG-005800 landed, on a phone, being asked for
 *   a uuid. Omit it and the screen still resolves; passing it is the difference
 *   between one tap and one guess.
 */
export function programmeApplicationsUrl(
  kind: string,
  eventId?: string | null
): string | null {
  const base = PROGRAMME_APPLICATIONS_URL[kind];
  if (!base) return null;
  const id = eventId?.trim();
  return id ? `${base}?event=${encodeURIComponent(id)}` : base;
}
