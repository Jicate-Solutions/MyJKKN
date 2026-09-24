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

async function search(query: string, institutionId: string): Promise<TaggablePerson[]> {
  const params = new URLSearchParams({ role: 'staff', q: query, institution_id: institutionId });
  const res = await fetch(`/api/events/committees/member-directory?${params.toString()}`);
  if (!res.ok) throw new Error('directory search failed');
  const json = (await res.json()) as {
    results?: { id: string; member_id: string; name: string; subtitle?: string }[];
  };
  return (json.results ?? [])
    .filter((h) => h.member_id && h.member_id !== h.id)
    .map((h) => ({ id: h.member_id, name: h.name || 'Unnamed', subtitle: h.subtitle ?? null }));
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
