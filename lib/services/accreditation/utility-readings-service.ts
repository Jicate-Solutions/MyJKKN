// lib/services/accreditation/utility-readings-service.ts
// ============================================================================
// The monthly utility meter register — sustainability_meter_readings.
// One row per institution ("campus") × calendar month × stream. The nightly
// 'sustainability-naac-evidence' refresh aggregates these into
// sustainability_naac_evidence and emits NAAC 10.2 (water & waste) + 10.3
// (progressing towards net zero) — a campus with no readings emits NOTHING,
// never a fabricated zero. So this register is the switch that lights
// Attribute 10 up, and it needs a named person per campus entering numbers
// once a month.
//
// Permission scope: reads need 'accreditation.sustainability_readings.view',
// writes need '...manage' — both enforced by RLS; the page mirrors them for UX.
// Modeled on lib/services/hr/sanctioned-posts-service.ts.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

export type UtilityStream =
  | 'electricity_kwh'
  | 'water_kl'
  | 'waste_kg'
  | 'solar_kwh_generated';

export interface UtilityReadingRow {
  id: string;
  institution_id: string;
  period_month: string; // 'YYYY-MM-01'
  stream: UtilityStream;
  reading_value: number;
  is_estimated: boolean;
  notes: string | null;
  recorded_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface UtilityReadingInput {
  institution_id: string;
  period_month: string;
  stream: UtilityStream;
  reading_value: number;
  is_estimated?: boolean;
  notes?: string | null;
}

/** Display metadata per stream, in entry order. Module constant — never an
 *  inline literal handed to a hook (that loops the fetch forever). */
export const STREAM_META: Record<
  UtilityStream,
  { label: string; unit: string; hint: string }
> = {
  electricity_kwh: {
    label: 'Electricity',
    unit: 'kWh',
    hint: 'Units billed for the whole month, off the EB bill or the main meter.',
  },
  water_kl: {
    label: 'Water',
    unit: 'kL',
    hint: 'Kilolitres drawn for the month (1 kL = 1,000 litres).',
  },
  waste_kg: {
    label: 'Waste',
    unit: 'kg',
    hint: 'Total solid waste handed over for the month.',
  },
  solar_kwh_generated: {
    label: 'Solar generated',
    unit: 'kWh',
    hint: 'Units your rooftop solar produced. Leave blank if there is no solar.',
  },
};

export const UTILITY_STREAMS = Object.keys(STREAM_META) as UtilityStream[];

/** First day of the month, `YYYY-MM-01`, from a Date. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** 'July 2026' from a 'YYYY-MM-01' key. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

/** The month immediately before `key`. */
export function priorMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, (m ?? 1) - 2, 1));
}

/**
 * The month picker's options: the last COMPLETED month first (that is what a
 * person actually has a bill for), then 17 months back. Never a future month —
 * you cannot read a meter for a month that has not finished.
 */
export function monthOptions(count = 18): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

/** Default selection — the last completed month. */
export function defaultMonth(): string {
  return monthOptions(1)[0];
}

/** Percent change from `prior` to `current`, or null when not computable. */
export function deltaPct(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return Math.round(((current - prior) * 1000) / prior) / 10;
}

export class UtilityReadingsService {
  private static supabase = createClientSupabaseClient();

  /** Readings for exactly two months (the selected one and the one before it). */
  static async listForMonthPair(
    institutionId: string,
    month: string
  ): Promise<UtilityReadingRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('sustainability_meter_readings')
      .select('*')
      .eq('institution_id', institutionId)
      .in('period_month', [month, priorMonth(month)]);
    if (error) throw error;
    return (data ?? []) as UtilityReadingRow[];
  }

  /** Every month this campus has reported, newest first — drives the "you are
   *  missing N months" banner and the "no reading" honesty. */
  static async reportedMonths(institutionId: string): Promise<string[]> {
    const { data, error } = await (this.supabase as any)
      .from('sustainability_meter_readings')
      .select('period_month')
      .eq('institution_id', institutionId)
      .order('period_month', { ascending: false });
    if (error) throw error;
    const seen = new Set<string>();
    for (const r of (data ?? []) as { period_month: string }[]) seen.add(r.period_month);
    return [...seen];
  }

  /**
   * Save the whole month in one go. Streams left blank are DELETED rather than
   * stored as 0 — "we did not read the water meter" and "we used no water" are
   * different facts, and only the first one is usually true.
   * (institution_id, period_month, stream) is a plain-column UNIQUE, so this
   * is a safe upsert target.
   */
  static async saveMonth(
    institutionId: string,
    month: string,
    values: Partial<Record<UtilityStream, { value: number | null; isEstimated: boolean }>>,
    notes: string | null
  ): Promise<void> {
    const toUpsert: UtilityReadingInput[] = [];
    const toClear: UtilityStream[] = [];

    for (const stream of UTILITY_STREAMS) {
      const entry = values[stream];
      if (!entry || entry.value == null || Number.isNaN(entry.value)) {
        toClear.push(stream);
        continue;
      }
      toUpsert.push({
        institution_id: institutionId,
        period_month: month,
        stream,
        reading_value: entry.value,
        is_estimated: entry.isEstimated,
        notes,
      });
    }

    if (toUpsert.length > 0) {
      const { error } = await (this.supabase as any)
        .from('sustainability_meter_readings')
        .upsert(toUpsert, { onConflict: 'institution_id,period_month,stream' });
      if (error) throw error;
    }

    if (toClear.length > 0) {
      const { error } = await (this.supabase as any)
        .from('sustainability_meter_readings')
        .delete()
        .eq('institution_id', institutionId)
        .eq('period_month', month)
        .in('stream', toClear);
      if (error) throw error;
    }
  }
}
