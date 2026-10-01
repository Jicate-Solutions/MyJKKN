/**
 * HR Biometric enrolment mapping service.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
 *
 * Writes go through the caller's own client so RLS enforces staff.edit plus
 * the caller's module scope — no service-role shortcut. A user who may only
 * edit their own institution's staff will be refused here, loudly.
 *
 * Follows the HR module convention (static class, SupabaseClient first arg).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BiometricMappingSave } from '@/types/hr-biometric';

export class BiometricMappingService {
  /**
   * Replace the enrolment mapping for one machine.
   *
   * Validate first, then write (2026-10-01): duplicates in the request and
   * people the caller cannot see are refused before anything is written, and
   * only people whose code actually changes are written, so an unchanged
   * person is never touched. Each write is checked: a refusal (or a write that
   * row-level security silently matched to no row) stops the save with that
   * person's name in the error. The writes are separate statements, so a
   * refusal part-way can still leave earlier writes saved; the error says so.
   *
   * Clearing happens BEFORE assigning, deliberately: the unique index is on
   * (machine, normalised code), so reassigning a code between two staff members
   * in one save would collide if the old holder still held it.
   *
   * Returns the number of staff whose code was written.
   */
  static async saveMappings(
    supabase: SupabaseClient,
    { institutionId, assignments }: BiometricMappingSave,
  ): Promise<number> {
    const wanted = assignments.filter((a) => a.staffId) as Array<{ code: string; staffId: string }>;
    const wantedIds = new Set(wanted.map((a) => a.staffId));

    // ── validate ────────────────────────────────────────────────────────────
    if (wantedIds.size !== wanted.length) {
      throw new Error('The same person is given more than one code. Nothing was saved.');
    }
    const byCode = new Map<string, string>();
    for (const a of wanted) {
      const key = a.code.trim();
      if (byCode.has(key)) {
        throw new Error(`Code ${key} is given to two people. Nothing was saved.`);
      }
      byCode.set(key, a.staffId);
    }

    type Row = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      biometric_id: string | null;
      biometric_institution_id: string | null;
    };
    const cols = 'id, first_name, last_name, biometric_id, biometric_institution_id';

    const { data: current, error: curErr } = await supabase
      .from('staff')
      .select(cols)
      .eq('biometric_institution_id', institutionId);
    if (curErr) throw curErr;

    const people = new Map<string, Row>();
    if (wantedIds.size > 0) {
      const { data: found, error: foundErr } = await supabase
        .from('staff')
        .select(cols)
        .in('id', Array.from(wantedIds));
      if (foundErr) throw foundErr;
      for (const r of (found ?? []) as Row[]) people.set(r.id, r);
      const missing = Array.from(wantedIds).filter((id) => !people.has(id));
      if (missing.length > 0) {
        throw new Error(
          `${missing.length} of the people in this save could not be found. Nothing was saved.`,
        );
      }
    }

    const nameOf = (r: Row | undefined) =>
      `${r?.first_name ?? ''} ${r?.last_name ?? ''}`.trim() || 'a team member';
    const toClear = ((current ?? []) as Row[]).filter((r) => !wantedIds.has(r.id));
    const toSet = wanted.filter((a) => {
      const r = people.get(a.staffId)!;
      return !(r.biometric_institution_id === institutionId && r.biometric_id === a.code);
    });

    // ── write ───────────────────────────────────────────────────────────────
    let written = 0;
    const write = async (row: Row, values: Record<string, string | null>) => {
      const { data, error } = await supabase
        .from('staff')
        .update(values)
        .eq('id', row.id)
        .select('id');
      if (error || !data || data.length === 0) {
        const reason = error?.message ?? 'you cannot change this person\'s record';
        const saved = written > 0 ? ` ${written} earlier change(s) were saved.` : ' Nothing was saved.';
        throw new Error(`Could not save the code for ${nameOf(row)}: ${reason}.${saved}`);
      }
      written += 1;
    };

    for (const r of toClear) {
      await write(r, { biometric_id: null, biometric_institution_id: null });
    }
    for (const a of toSet) {
      await write(people.get(a.staffId)!, { biometric_id: a.code, biometric_institution_id: institutionId });
    }

    return toSet.length;
  }

  /** Everyone currently enrolled on one machine. */
  static async listForMachine(supabase: SupabaseClient, institutionId: string) {
    const { data, error } = await supabase
      .from('staff')
      .select('id, staff_id, first_name, last_name, institution_id, biometric_id')
      .eq('biometric_institution_id', institutionId)
      .not('biometric_id', 'is', null)
      .order('biometric_id', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
}
