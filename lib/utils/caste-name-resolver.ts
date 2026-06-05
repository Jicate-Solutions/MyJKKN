// lib/utils/caste-name-resolver.ts
//
// Resolves a caste label (Excel "Caste" column / API input) to castes.id (FK).
// Storage on learners_profiles is caste_id only — the legacy `caste` TEXT column
// is being retired. Caste names/aliases are AMBIGUOUS (the castes table has
// duplicate names across communities), so resolution is scoped by the learner's
// community_category_id when available. Order: exact name (community-scoped) >
// exact name (globally unique) > alias (community-scoped) > alias (unique).
// Returns null when ambiguous or unmatched (caller leaves caste_id null).

export type CasteResolver = (
  raw: string | null | undefined,
  communityCategoryId?: string | null,
) => string | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function buildCasteResolver(supabase: any): Promise<CasteResolver> {
  const { data, error } = await supabase
    .from('castes')
    .select('id, name, aliases, community_category_id');
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    name: string | null;
    aliases: string[] | null;
    community_category_id: string | null;
  }>;

  return (raw, communityCategoryId) => {
    if (raw == null) return null;
    const norm = String(raw).trim().toLowerCase();
    if (!norm) return null;
    if (UUID_RE.test(norm)) return norm; // form path sends caste_id directly

    const byName = rows.filter((c) => (c.name ?? '').trim().toLowerCase() === norm);
    if (communityCategoryId) {
      const m = byName.find((c) => c.community_category_id === communityCategoryId);
      if (m) return m.id;
    }
    if (byName.length === 1) return byName[0].id;

    const byAlias = rows.filter((c) =>
      (c.aliases ?? []).some((a) => a.trim().toLowerCase() === norm),
    );
    if (communityCategoryId) {
      const m = byAlias.find((c) => c.community_category_id === communityCategoryId);
      if (m) return m.id;
    }
    if (byAlias.length === 1) return byAlias[0].id;

    return null; // ambiguous or unmatched
  };
}
