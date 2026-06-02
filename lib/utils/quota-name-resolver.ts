// lib/utils/quota-name-resolver.ts
//
// Resolves a human-readable quota label (as typed in bulk-upload Excel files
// or sent to the public API) to the canonical quotas.id (FK). Storage on
// learners_profiles is quota_id only — the legacy `quota` TEXT column is being
// retired — but I/O boundaries stay readable, so every import/external write
// must map a name → quota_id here before persisting.
//
// Matches by exact name, exact code, then a curated abbreviation alias map
// (the same aliases used by the 2026-06-02 data-repair migration). Returns null
// when nothing matches — callers decide whether that's an error or a blank.

const QUOTA_ALIASES: Record<string, string> = {
  // alias (lower-cased, trimmed)  ->  quota code
  gq: 'government',
  govt: 'government',
  government: 'government',
  mq: 'management',
  management: 'management',
  'government 7.5%': 'government_7_5',
  '7.5 quota': 'government_7_5',
  '7.5': 'government_7_5',
  'gq 7.5': 'government_7_5',
  'gq -7.5': 'government_7_5',
  'gq(7.5)': 'government_7_5',
  'qq(7.5)': 'government_7_5',
};

export type QuotaResolver = (raw: string | null | undefined) => string | null;

/**
 * Load the quotas lookup once and return a synchronous name→id resolver.
 * Pass any Supabase client (service-role for server routes, browser for client).
 */
export async function buildQuotaResolver(supabase: any): Promise<QuotaResolver> {
  const { data, error } = await supabase.from('quotas').select('id, code, name');
  if (error) throw error;

  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const q of (data ?? []) as Array<{ id: string; code: string; name: string }>) {
    if (q.code) byCode.set(q.code.trim().toLowerCase(), q.id);
    if (q.name) byName.set(q.name.trim().toLowerCase(), q.id);
  }

  return (raw) => {
    if (raw == null) return null;
    const norm = String(raw).trim().toLowerCase();
    if (!norm) return null;
    // Already a UUID? Trust it (the form path sends quota_id directly).
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(norm)) {
      return norm;
    }
    if (byName.has(norm)) return byName.get(norm)!;
    if (byCode.has(norm)) return byCode.get(norm)!;
    const aliasCode = QUOTA_ALIASES[norm];
    if (aliasCode && byCode.has(aliasCode)) return byCode.get(aliasCode)!;
    return null;
  };
}
