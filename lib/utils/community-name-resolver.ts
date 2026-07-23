// lib/utils/community-name-resolver.ts
//
// Resolves a community label (Excel "Community" column / API input) to the
// canonical community_categories.id (FK). Storage on learners_profiles is
// community_category_id only — the legacy `community` TEXT column is being
// retired — so every import/external write maps a name/code → id here.
//
// Community codes are clean (SC, BC, MBC, SC-A, OC, …); match by code first,
// then name. Returns null when nothing matches (caller decides error vs blank).

export type CommunityResolver = (raw: string | null | undefined) => string | null;

export async function buildCommunityResolver(supabase: any): Promise<CommunityResolver> {
  const { data, error } = await supabase.from('community_categories').select('id, code, name');
  if (error) throw error;

  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of (data ?? []) as Array<{ id: string; code: string; name: string }>) {
    if (c.code) byCode.set(c.code.trim().toLowerCase(), c.id);
    if (c.name) byName.set(c.name.trim().toLowerCase(), c.id);
  }

  return (raw) => {
    if (raw == null) return null;
    const norm = String(raw).trim().toLowerCase();
    if (!norm) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(norm)) {
      return norm; // already a UUID (form path sends community_category_id directly)
    }
    if (byCode.has(norm)) return byCode.get(norm)!;
    if (byName.has(norm)) return byName.get(norm)!;
    return null;
  };
}
