/**
 * BoS call-letter reference numbers.
 *
 *   Ref: JKKNCET/BoS/ECE/2026-2027/01
 *        │        │   │   │         └── per-recipient serial (see below)
 *        │        │   │   └──────────── meeting academic year
 *        │        │   └──────────────── COE board code
 *        │        └──────────────────── convening committee short code
 *        └───────────────────────────── institution ref prefix
 *
 * The serial is NOT the meeting number — it is the recipient's position in the
 * meeting's member list, so every letter for one meeting carries a distinct
 * reference. Ordering follows the member-type catalog (bos_member_types.
 * sort_order), which is how the department maintains precedence: chairman → 01,
 * then faculty members in their own order → 02, 03, …
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BosLetterRefParts {
  /** Institution short code, e.g. "JKKNCET". */
  prefix: string;
  /** Convening body short code, e.g. "BoS", "PAC", "IAB". */
  committeeCode: string;
  /** COE board code, e.g. "ECE". Omitted from the ref when absent. */
  boardCode?: string | null;
  /** Meeting academic year, e.g. "2026-2027". Omitted when absent. */
  academicYear?: string | null;
  /** Per-recipient serial; rendered zero-padded to two digits. */
  serial?: number | null;
}

/** Join the parts, dropping any empty segment so no "//" ever appears. */
export function buildBosLetterRef(parts: BosLetterRefParts): string {
  const serial = parts.serial != null && parts.serial > 0 ? String(parts.serial).padStart(2, '0') : '';
  return [
    parts.prefix?.trim(),
    parts.committeeCode?.trim(),
    parts.boardCode?.trim(),
    parts.academicYear?.trim(),
    serial,
  ]
    .filter((s) => !!s)
    .join('/');
}

/**
 * Fallback committee short code by body-type catalog code. Used when the
 * meeting has no bos_committees row (plain Board of Studies meetings, and the
 * council bodies which live on meeting_type instead of a committee row).
 */
const BODY_TYPE_SHORT_CODE: Record<string, string> = {
  BOS: 'BoS',
  DFPC: 'DFPC',
  PAC: 'PAC',
  PAIC: 'PAIC',
  IAB: 'IAB',
  DAB: 'DAB',
  CDC: 'CDC',
  AC: 'AC',
  GB: 'GB',
};

/**
 * Resolve the short code that goes in the ref's second segment:
 * the convening committee's own short_code when it has one, else the catalog
 * code for the meeting's body type, else "BoS".
 */
export async function resolveBosCommitteeShortCode(
  supabase: SupabaseClient,
  opts: { committeeId?: string | null; bodyTypeCode?: string | null },
): Promise<string> {
  if (opts.committeeId) {
    const { data } = await supabase
      .from('bos_committees')
      .select('short_code, name')
      .eq('id', opts.committeeId)
      .maybeSingle();
    const code = (data as { short_code?: string | null } | null)?.short_code?.trim();
    if (code) return code;
  }
  const byType = opts.bodyTypeCode
    ? BODY_TYPE_SHORT_CODE[opts.bodyTypeCode.trim().toUpperCase()]
    : undefined;
  return byType ?? 'BoS';
}

/**
 * Serial number per member for one meeting, keyed by bos_members.id.
 *
 * Ordering, in priority order:
 *   1. chairman first — a hard guard, because a freshly-seeded
 *      bos_member_types set can leave every sort_order at 0
 *   2. bos_member_types.sort_order (the catalog's own precedence)
 *   3. bos_members.sort_order  — the department's order inside one type
 *   4. created_at, then name — stable tie-break so two runs never disagree
 *
 * The committee scoping mirrors the Members tab exactly: when the meeting has a
 * convening committee we number only that committee's members, but if that
 * filter is empty (legacy compositions with unassigned members) we fall back to
 * the whole composition — otherwise the tab would list members the ref numbers
 * know nothing about.
 */
export async function resolveBosMemberSerials(
  supabase: SupabaseClient,
  opts: { compositionId: string; committeeId?: string | null },
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('bos_members')
    .select(
      'id, display_name, sort_order, created_at, committee_id, member_type, member_type_rec:bos_member_types ( sort_order, base_type )',
    )
    .eq('composition_id', opts.compositionId)
    .eq('is_active', true);

  if (error || !data) {
    console.warn('[bos/call-letter-ref] member serial lookup failed:', error?.message);
    return new Map();
  }

  type Row = {
    id: string;
    display_name: string | null;
    sort_order: number | null;
    created_at: string | null;
    committee_id: string | null;
    member_type: string | null;
    member_type_rec: { sort_order?: number | null; base_type?: string | null } | null;
  };

  const rows = data as unknown as Row[];
  const scoped = opts.committeeId
    ? rows.filter((r) => r.committee_id === opts.committeeId)
    : rows;
  const list = scoped.length > 0 ? scoped : rows;

  const isChairman = (r: Row) =>
    r.member_type_rec?.base_type === 'chairman' ||
    /chairman|chairperson/i.test(r.member_type ?? '');

  const sorted = [...list].sort((a, b) => {
    const chair = Number(isChairman(b)) - Number(isChairman(a));
    if (chair !== 0) return chair;
    // Unmapped member types (member_type_id NULL on legacy rows) sort last
    // rather than ahead of the catalog's first entry.
    const ta = a.member_type_rec?.sort_order ?? 9999;
    const tb = b.member_type_rec?.sort_order ?? 9999;
    if (ta !== tb) return ta - tb;
    const ma = a.sort_order ?? 0;
    const mb = b.sort_order ?? 0;
    if (ma !== mb) return ma - mb;
    const ca = a.created_at ?? '';
    const cb = b.created_at ?? '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return (a.display_name ?? '').localeCompare(b.display_name ?? '');
  });

  return new Map(sorted.map((r, i) => [r.id, i + 1]));
}
