import { BaseService } from '@/lib/services/base-service';
import type {
  BillingAuditBill,
  BillingAuditFilters,
  BillingAuditRow,
  BillingAuditSummary
} from '@/types/campus-living-billing-audit';

// ============================================================================
// CAMPUS LIVING — BILLING AUDIT SERVICE
// ============================================================================
// Thin wrapper over two SECURITY DEFINER RPCs (migration 20260922120000).
// Permission gating (campus_living.billing_audit.view), institution scoping
// and every judgement — band, expectation, findings — happen in Postgres; this
// layer marshals params and strips the RPC's out_ column prefix.
//
// The out_ prefix exists because a RETURNS TABLE column named institution_id
// collides with the real column and raises 42702 in this schema.
// ============================================================================

interface RawAuditRow {
  out_learner_id: string;
  out_roll_number: string | null;
  out_register_number: string | null;
  out_full_name: string;
  out_gender: string | null;
  out_institution_id: string;
  out_institution_name: string | null;
  out_program_name: string | null;
  out_year_of_study: number | null;
  out_semester_name: string | null;
  out_lifecycle_status: string;
  out_is_allocated: boolean;
  out_block_id: string | null;
  out_block_name: string | null;
  out_room_number: string | null;
  out_bed_number: string | null;
  out_seated_category_name: string | null;
  out_tagged_category_id: string | null;
  out_tagged_category_name: string | null;
  out_mess_category_name: string | null;
  out_band_fee: number | string | null;
  out_entitled_category_name: string | null;
  out_band_status: string;
  out_expected_room_fee: number | string | null;
  out_expected_mess_fee: number | string | null;
  out_expected_upgrade_fee: number | string | null;
  out_category_room_rate: number | string | null;
  out_category_mess_rate: number | string | null;
  out_room_billed: number | string | null;
  out_room_paid: number | string | null;
  out_room_status: string | null;
  out_room_due_date: string | null;
  out_mess_billed: number | string | null;
  out_mess_paid: number | string | null;
  out_mess_status: string | null;
  out_mess_due_date: string | null;
  out_upgrade_billed: number | string | null;
  out_upgrade_paid: number | string | null;
  out_upgrade_status: string | null;
  out_upgrade_due_date: string | null;
  out_total_billed: number | string;
  out_total_paid: number | string;
  out_total_outstanding: number | string;
  out_overdue_amount: number | string;
  out_overdue_count: number;
  out_findings: string[] | null;
  out_bills: unknown;
  out_target_academic_year_name: string | null;
  out_total_count: number | string;
}

/** numeric arrives as a string over PostgREST. A NULL must STAY null — for
 *  an expectation column, Number(null) = 0 would read as "expects zero" and
 *  flag every unbilled learner as a mismatch in the UI. */
const money = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const moneyOrZero = (v: number | string | null | undefined): number =>
  v == null ? 0 : Number(v);

export class BillingAuditService extends BaseService {
  /** Empty selections become null so the RPC falls back to the caller's full
   *  accessible scope. Uses ?? rather than || — undefined must never be passed
   *  through as a real parameter value, and '' would flow through as a real
   *  uuid parameter and match zero rows. */
  static baseParams(filters: BillingAuditFilters) {
    return {
      p_institution_ids:
        filters.institution_ids && filters.institution_ids.length > 0
          ? filters.institution_ids
          : null,
      // Null is meaningful, not merely "unset": the RPC resolves each
      // institution's current academic year by date. Do NOT default this to a
      // year client-side — the page spans institutions whose current year can
      // differ.
      p_academic_year_id: filters.academic_year_id || null,
      p_block_id: filters.block_id || null,
      p_room_category_id: filters.room_category_id || null,
      p_program_id: filters.program_id || null,
      p_gender: filters.gender || null,
      p_allocated_only: filters.allocated_only ?? false
    };
  }

  static parseBills(raw: unknown): BillingAuditBill[] {
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? (JSON.parse(raw) as unknown[])
        : [];
    return (list as Array<Record<string, unknown>>).map((b) => ({
      bill_id: String(b.bill_id),
      class: b.class as BillingAuditBill['class'],
      category_name: String(b.category_name ?? ''),
      description: (b.description as string | null) ?? null,
      year_name: (b.year_name as string | null) ?? null,
      amount: moneyOrZero(b.amount as number | string | null),
      paid: moneyOrZero(b.paid as number | string | null),
      pending: moneyOrZero(b.pending as number | string | null),
      status: String(b.status ?? ''),
      due_date: (b.due_date as string | null) ?? null,
      is_overdue: b.is_overdue === true
    }));
  }

  static mapRow(r: RawAuditRow): BillingAuditRow {
    return {
      learner_id: r.out_learner_id,
      roll_number: r.out_roll_number,
      register_number: r.out_register_number,
      full_name: r.out_full_name,
      gender: r.out_gender,
      institution_id: r.out_institution_id,
      institution_name: r.out_institution_name,
      program_name: r.out_program_name,
      year_of_study: r.out_year_of_study ?? null,
      semester_name: r.out_semester_name,
      lifecycle_status: r.out_lifecycle_status,
      is_allocated: r.out_is_allocated === true,
      block_id: r.out_block_id,
      block_name: r.out_block_name,
      room_number: r.out_room_number,
      bed_number: r.out_bed_number,
      seated_category_name: r.out_seated_category_name,
      tagged_category_id: r.out_tagged_category_id,
      tagged_category_name: r.out_tagged_category_name,
      mess_category_name: r.out_mess_category_name,
      band_fee: money(r.out_band_fee),
      entitled_category_name: r.out_entitled_category_name,
      band_status: r.out_band_status as BillingAuditRow['band_status'],
      expected_room_fee: money(r.out_expected_room_fee),
      expected_mess_fee: money(r.out_expected_mess_fee),
      expected_upgrade_fee: money(r.out_expected_upgrade_fee),
      category_room_rate: money(r.out_category_room_rate),
      category_mess_rate: money(r.out_category_mess_rate),
      room_billed: money(r.out_room_billed),
      room_paid: money(r.out_room_paid),
      room_status: r.out_room_status as BillingAuditRow['room_status'],
      room_due_date: r.out_room_due_date,
      mess_billed: money(r.out_mess_billed),
      mess_paid: money(r.out_mess_paid),
      mess_status: r.out_mess_status as BillingAuditRow['mess_status'],
      mess_due_date: r.out_mess_due_date,
      upgrade_billed: money(r.out_upgrade_billed),
      upgrade_paid: money(r.out_upgrade_paid),
      upgrade_status: r.out_upgrade_status as BillingAuditRow['upgrade_status'],
      upgrade_due_date: r.out_upgrade_due_date,
      total_billed: moneyOrZero(r.out_total_billed),
      total_paid: moneyOrZero(r.out_total_paid),
      total_outstanding: moneyOrZero(r.out_total_outstanding),
      overdue_amount: moneyOrZero(r.out_overdue_amount),
      overdue_count: Number(r.out_overdue_count ?? 0),
      findings: (r.out_findings ?? []) as BillingAuditRow['findings'],
      bills: this.parseBills(r.out_bills),
      target_academic_year_name: r.out_target_academic_year_name,
      total_count: Number(r.out_total_count ?? 0)
    };
  }

  static async getSummary(filters: BillingAuditFilters = {}): Promise<BillingAuditSummary> {
    const raw = await this.executeDashboardRPC<BillingAuditSummary>(
      'get_cl_billing_audit_summary',
      this.baseParams(filters)
    );
    // jsonb numerics come back as JS numbers already; only the shape needs
    // defaulting so an empty scope renders zero cards, not a crash.
    return {
      kpis: raw?.kpis ?? ({} as BillingAuditSummary['kpis']),
      by_finding: raw?.by_finding ?? [],
      by_institution: raw?.by_institution ?? [],
      by_block: raw?.by_block ?? [],
      by_room_category: raw?.by_room_category ?? [],
      by_bill_status: raw?.by_bill_status ?? [],
      by_bill_class: raw?.by_bill_class ?? [],
      overdue_aging: raw?.overdue_aging ?? [],
      due_soon: raw?.due_soon ?? [],
      target_years: raw?.target_years ?? []
    };
  }

  static async getLearners(
    filters: BillingAuditFilters = {}
  ): Promise<{ rows: BillingAuditRow[]; total: number }> {
    const raw = await this.executeDashboardRPC<RawAuditRow[]>(
      'get_cl_billing_audit_learners',
      {
        ...this.baseParams(filters),
        p_finding: filters.finding ?? 'all',
        p_search: filters.search || null,
        p_page: filters.page ?? 1,
        p_page_size: filters.page_size ?? 50,
        // Sorting runs in Postgres against a whitelist — ordering only the
        // fetched page would show the top of page one, not the real maximum.
        p_sort_by: filters.sort_by || null,
        p_sort_dir: filters.sort_dir ?? 'asc'
      }
    );

    const rows = (raw ?? []).map((r) => this.mapRow(r));
    // total_count is a window function — identical on every row, absent when
    // the page is empty.
    return { rows, total: rows.length > 0 ? rows[0].total_count : 0 };
  }
}
