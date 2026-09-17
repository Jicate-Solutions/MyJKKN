// components/shared/search-taggable-staff.ts
//
// Team-member search for CommentThreadPanel's tag picker, shared by the event
// review thread and the reservation thread. Module scope so its identity is
// stable — the picker's search effect depends on it, and a fresh function every
// render would re-run the search on every keystroke of the comment box.
//
// Reads the same staff directory the event committee picker uses (any signed-in
// user, institution-scoped server-side). A hit whose member_id equals its staff
// row id has no MyJKKN login (the route falls back to the staff id when
// profile_id is null) — there is no account to notify or to grant the thread
// to, so it is left out rather than offered and refused.

import type { TaggablePerson } from '@/components/shared/comment-thread-panel';

export async function searchTaggableStaff(query: string): Promise<TaggablePerson[]> {
  const params = new URLSearchParams({ role: 'staff', q: query });
  const res = await fetch(`/api/events/committees/member-directory?${params.toString()}`);
  if (!res.ok) throw new Error('directory search failed');
  const json = (await res.json()) as {
    results?: { id: string; member_id: string; name: string; subtitle?: string }[];
  };
  return (json.results ?? [])
    .filter((h) => h.member_id && h.member_id !== h.id)
    .map((h) => ({ id: h.member_id, name: h.name || 'Unnamed', subtitle: h.subtitle ?? null }));
}
