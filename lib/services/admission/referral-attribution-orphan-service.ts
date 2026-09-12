import { createClientSupabaseClient } from '@/lib/supabase/client';

// Referral attribution orphans — powers the admission "Attribution Orphans"
// review screen. consultant_lead_attributions says "this agency brought
// someone"; 168 of its 1,856 rows (production, 2026-09-12) do not say who.
// Rule 4 of the referral spec says such rows are never skipped silently and
// never deleted, so they get a screen instead.
//
// This is the mirror image of referral-linking-service.ts: there the learner is
// known and the referrer is not; here the referrer is known and the learner is
// not. That service can link, because a learner + an agency is enough to record
// who is owed. This one deliberately cannot: with no learner there is nothing to
// attach a link to. It reads and nothing else.
//
// The RPC is new (not yet in the generated Database types), so the call is cast
// `(supabase as any).rpc(...)` — the same pattern the rest of the admission
// services use for post-generation functions.

/** Why a row has no learner. Computed in SQL, never re-derived here. */
export type ReferralAttributionOrphanReason =
  /** The linked lead DOES carry a learner — the link was just never copied across. Recoverable. */
  | 'lead_has_learner'
  /** The lead exists and has no learner of its own: this enquiry never became an admission. */
  | 'lead_not_converted'
  /** admission_id is set but matches no lead row. */
  | 'lead_missing'
  /** The attribution carries no admission_id at all. */
  | 'no_admission_id';

export interface ReferralAttributionOrphan {
  attribution_id: string;
  reason: ReferralAttributionOrphanReason;
  consultant_id: string | null;
  consultant_name: string | null;
  /** When the attribution was recorded. */
  created_at: string | null;
  referral_source: string | null;
  admission_id: string | null;
  // Lead-side identity, so a reviewer can recognise the person without opening
  // a second screen. Across the 168: all 168 carry a name and a phone, 146 a
  // parent phone, 11 an application number, 7 an email.
  lead_name: string | null;
  lead_phone: string | null;
  lead_alt_phone: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  lead_email: string | null;
  application_number: string | null;
  institution_name: string | null;
  program_name: string | null;
  lead_created_at: string | null;
  /** Who typed the lead in. When nobody else can say who this is, they might. */
  recorded_by_name: string | null;
}

export class ReferralAttributionOrphanService {
  /**
   * Every attribution with no learner, each carrying the reason it is stuck.
   * Backed by fn_referral_attribution_orphans, which returns a JSON array
   * already ordered: recoverable rows first, then newest first.
   *
   * Read-only. There is no companion write method on purpose — acting on these
   * rows is a separate decision the Director has not taken.
   */
  static async listOrphans(): Promise<ReferralAttributionOrphan[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_referral_attribution_orphans');
    if (error) throw new Error(error.message);
    return (data as ReferralAttributionOrphan[]) ?? [];
  }
}
