import { BaseService } from '@/lib/services/base-service';
import {
  normaliseJkknId,
  type TallyBook,
  type TallyLedgerMapping,
  type TallyModeLedgers
} from './collection-tally';

const PAGE = 1000;
const CHUNK = 500;

/**
 * Reads and writes the Tally export setup behind the Collection report's
 * "Tally XML" download (migration 20271009090000): the payment-mode → ledger
 * settings and the MyJKKN ID → learner ledger mapping, both per institution
 * and book. Neither table is in types/supabase.ts yet, hence the untyped
 * client BaseService already hands out.
 */
export class TallySetupService extends BaseService {
  static async getModeLedgers(institutionId: string, book: TallyBook): Promise<TallyModeLedgers> {
    const { data, error } = await this.supabase
      .from('billing_tally_settings')
      .select('mode_ledgers')
      .eq('institution_id', institutionId)
      .eq('book', book)
      .maybeSingle();
    if (error) throw error;
    return (data?.mode_ledgers as TallyModeLedgers) ?? {};
  }

  static async saveModeLedgers(
    institutionId: string,
    book: TallyBook,
    modeLedgers: TallyModeLedgers
  ): Promise<void> {
    const cleaned: TallyModeLedgers = {};
    for (const [mode, name] of Object.entries(modeLedgers)) {
      if (name && name.trim()) cleaned[mode] = name.trim();
    }
    const { error } = await this.supabase
      .from('billing_tally_settings')
      .upsert(
        { institution_id: institutionId, book, mode_ledgers: cleaned },
        { onConflict: 'institution_id,book' }
      );
    if (error) throw error;
  }

  /** Whole mapping, keyed by normaliseJkknId(). Paged: an institution can hold
   *  more learners than PostgREST's 1000-row page. */
  static async getLedgerMap(institutionId: string, book: TallyBook): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.supabase
        .from('billing_tally_learner_ledgers')
        .select('jkkn_id, tally_ledger_name')
        .eq('institution_id', institutionId)
        .eq('book', book)
        .order('jkkn_id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data as TallyLedgerMapping[]) ?? [];
      for (const r of rows) map.set(normaliseJkknId(r.jkkn_id), r.tally_ledger_name);
      if (rows.length < PAGE) break;
    }
    return map;
  }

  /** Adds new learners and replaces the ledger name of ones already mapped.
   *  IDs are stored trimmed and upper-cased so the unique key cannot hold the
   *  same learner twice under different casing. */
  static async upsertLedgers(
    institutionId: string,
    book: TallyBook,
    entries: TallyLedgerMapping[]
  ): Promise<void> {
    for (let i = 0; i < entries.length; i += CHUNK) {
      const batch = entries.slice(i, i + CHUNK).map((e) => ({
        institution_id: institutionId,
        book,
        jkkn_id: normaliseJkknId(e.jkkn_id),
        tally_ledger_name: e.tally_ledger_name.trim()
      }));
      const { error } = await this.supabase
        .from('billing_tally_learner_ledgers')
        .upsert(batch, { onConflict: 'institution_id,book,jkkn_id' });
      if (error) throw error;
    }
  }
}
