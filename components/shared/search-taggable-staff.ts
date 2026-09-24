// components/shared/search-taggable-staff.ts
//
// Team-member search for CommentThreadPanel's tag picker, shared by the event
// review thread and the reservation thread. Always scoped to the institution
// that owns the event / booked resource.
//
// Reads the same staff directory the event committee picker uses (any signed-in
// user, institution-scoped server-side). A hit whose member_id equals its staff
// row id has no MyJKKN login (the route falls back to the staff id when
// profile_id is null) — there is no account to notify or to grant the thread
// to, so it is left out rather than offered and refused.

import type { TaggablePerson } from '@/components/shared/comment-thread-panel';

/**
 * How well a hit answers what was typed. The directory matches first name, last
 * name OR institution_email, so a hit can be one the writer cannot explain:
 * typing "omm" returns hodcommunityhealth@ and hodcommerce@, and the picker —
 * which shows designation and department, never the email — looked broken
 * (reported 2026-09-24).
 *
 * Email matching is worth keeping: it is how you find someone whose spelling
 * you do not know. It just must not outrank a real name match, and the reason
 * for an email-only hit has to be visible. Both are fixed here rather than in
 * the shared route, whose ordering the committee picker also depends on.
 */
function rankOf(name: string, email: string | null, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n.startsWith(q)) return 0;
  // Start of any word in the name — "raj" for "MISS. RAJATHI S".
  if (n.split(/[\s.]+/).some((w) => w.startsWith(q))) return 1;
  if (n.includes(q)) return 2;
  // Matched the email alone — kept only when the address was plainly what was
  // being typed (rank 3), dropped as noise otherwise (rank 4).
  return emailIsBeingTyped(email, q) ? 3 : 4;
}

/**
 * Does this email look like the thing being searched for, rather than a word
 * the query happens to sit inside?
 *
 * The server matches institution_email with a bare `ilike %q%`, so a short name
 * fragment collides with ordinary words in role mailboxes: "omm" returned
 * hodc(omm)unityhealth@ and hodc(omm)erce@, whose NAMES contain no "omm" at
 * all, and the list read as broken (reported 2026-09-24, twice).
 *
 * "Contains" is the wrong test; "starts a part of the address" is the right
 * one. The local part is split on the usual separators, so:
 *   "hodcommerce" → hodcommerce@…      kept   (the mailbox itself)
 *   "hod"         → hodcommerce@…      kept   (a real prefix)
 *   "omm"         → hodcommerce@…      DROPPED (mid-word coincidence)
 * A query carrying "@" or "." is an address being typed out, so the whole
 * address is matched directly — that is how ".ac.in" still works.
 */
function emailIsBeingTyped(email: string | null, query: string): boolean {
  const e = (email ?? '').toLowerCase();
  if (!e) return false;
  if (query.includes('@') || query.includes('.')) return e.includes(query);
  const localPart = e.split('@')[0] ?? '';
  return localPart
    .split(/[._\-+]/)
    .some((segment) => segment.startsWith(query));
}

async function search(query: string, institutionId: string | null): Promise<TaggablePerson[]> {
  const params = new URLSearchParams({ role: 'staff', q: query });
  if (institutionId) params.set('institution_id', institutionId);
  const res = await fetch(`/api/events/committees/member-directory?${params.toString()}`);
  if (!res.ok) throw new Error('directory search failed');
  const json = (await res.json()) as {
    results?: {
      id: string;
      member_id: string;
      name: string;
      email?: string | null;
      subtitle?: string;
    }[];
  };

  return (json.results ?? [])
    .filter((h) => h.member_id && h.member_id !== h.id)
    .map((h) => {
      const name = h.name || 'Unnamed';
      const rank = rankOf(name, h.email ?? null, query);
      return {
        id: h.member_id,
        name,
        // On a deliberate email lookup the matching address leads the subtitle,
        // so the hit explains itself.
        subtitle:
          rank === 3 && h.email
            ? [h.email, h.subtitle].filter(Boolean).join(' · ')
            : h.subtitle ?? null,
        rank,
      };
    })
    // Rank 4 is the server's `ilike %q%` landing mid-word inside an address:
    // a hit whose name does not contain the query and whose address was not
    // what anybody typed. It is dropped, so the menu only ever shows people
    // the writer can account for.
    .filter((p) => p.rank <= 3)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map(({ rank: _rank, ...person }) => person);
}

/**
 * Team members of ONE institution only — the only way tag candidates are
 * offered. The server re-checks the institution when the tag is written, so
 * this narrows the list; it is not the gate.
 * Wrap the call in useMemo keyed on the id — a new function every render would
 * re-run the search on every keystroke.
 */
export function makeInstitutionStaffSearch(institutionId: string) {
  return (query: string): Promise<TaggablePerson[]> => search(query, institutionId);
}

/**
 * Everyone who may be tagged on a recruitment candidate, across every
 * institution — and, unlike the two pickers above, read from PROFILES rather
 * than `staff`.
 *
 * That difference is the whole point. A tag targets a profile: the alert goes
 * to profiles.id and the guard trigger admits any active non-learner profile.
 * Searching `staff` asked a different question, and 62 real people — 16
 * faculty, 8 HODs, 5 super admins, the Director among them — have no staff row
 * and could never be offered (production, 2026-09-24). The route this calls
 * searches the same set the trigger admits, so the picker and the database
 * finally agree on who exists.
 */
export function makeRecruitmentPeopleSearch() {
  return async (query: string): Promise<TaggablePerson[]> => {
    const res = await fetch(
      `/api/hr/recruitment/taggable-people?q=${encodeURIComponent(query)}`,
    );
    if (!res.ok) throw new Error('people search failed');
    const json = (await res.json()) as {
      results?: { id: string; name: string; email?: string | null; subtitle?: string | null }[];
    };
    return (json.results ?? [])
      .map((h) => {
        const name = h.name || 'Unnamed';
        const rank = rankOf(name, h.email ?? null, query);
        return {
          id: h.id,
          name,
          subtitle:
            rank === 3 && h.email
              ? [h.email, h.subtitle].filter(Boolean).join(' · ')
              : h.subtitle ?? null,
          rank,
        };
      })
      .filter((p) => p.rank <= 3)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .map(({ rank: _rank, ...person }) => person);
  };
}

/**
 * Institution team members PLUS one named person who may be tagged whatever
 * their college — the person who raised a booking. A cross-college booker is
 * not in the resource's staff directory, so without this they could never be
 * offered even though the server allows the tag
 * (fn_can_be_tagged_on_reservation). Offered first when they match the query,
 * and never duplicated if the directory also returns them.
 */
export function makeInstitutionStaffSearchWith(
  institutionId: string | null | undefined,
  extra: TaggablePerson | null | undefined,
) {
  return async (query: string): Promise<TaggablePerson[]> => {
    const staff = institutionId ? await search(query, institutionId) : [];
    if (!extra) return staff;
    const q = query.trim().toLowerCase();
    const matches =
      q === '' ||
      extra.name.toLowerCase().includes(q) ||
      (extra.subtitle ?? '').toLowerCase().includes(q);
    if (!matches) return staff;
    return [extra, ...staff.filter((p) => p.id !== extra.id)];
  };
}
