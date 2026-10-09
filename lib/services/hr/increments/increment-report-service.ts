// lib/services/hr/increments/increment-report-service.ts
// ============================================================================
// Gathers the facts the increment engine needs, one college at a time.
// ============================================================================
//
// READ ONLY. Every query below is a SELECT or a STABLE rpc. There is no writer
// in this file and no caller that could turn a proposal into pay. The Director
// ruled on 2026-09-18 that a band is reference only and that no salary moves
// without his per-person approval, so the report stops at a number on a screen.
//
// SCOPING. The college list comes from `fn_hr_orgs_for_institutions()`, which
// already filters on `role_has_institution_access(o.institution_id)` — the
// canonical mechanism, rather than a second access rule invented here. A user
// who can see no college gets an empty college list and an explicit message,
// never a silent redirect. The staff, pay, review and disciplinary reads are
// additionally behind their own RLS. `platform_policies` is NOT: its SELECT
// policy is `auth.uid() IS NOT NULL`, so any signed-in account can read any
// college's policy row. For that read the only limits are the route's
// permission check and the `scope_id IN (<colleges from the scoped list>)`
// filter below — RLS adds nothing there.
//
// WHY THE POLICY IS READ FROM THE TABLE AND NOT VIA fn_get_policy_json.
// `fn_get_policy` falls back to a global row when no institution row exists
// (precedence: user > cohort > institution > role > cohort default > global).
// Seven of the nine colleges have no `hr.allowances_and_increments` row, and
// the whole point of this report is to say so out loud. A resolver that could
// quietly hand those seven somebody else's rules would turn the most important
// finding on the screen into a wrong answer. So the read is an explicit
// `scope_type = 'institution' AND scope_id = <college>`, where a missing row is
// a missing row.
// ============================================================================

import {
  buildCollegeReport,
  compareDates,
  parseIsoDate,
  type CollegeIncrementReport,
  type DecidedDisciplinaryCase,
  type DisciplinaryOutcome,
  type PerformanceReviewFact,
  type PersonPayFacts,
} from '@/lib/hr/increment-engine';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { departmentRate, parseSalarySuggestionRule } from '@/lib/hr/salary-suggestion';
import { chunkIdsForIn } from '@/lib/utils/postgrest-in-chunks';

export const INCREMENT_POLICY_KEY = 'hr.allowances_and_increments' as const;
/**
 * The Director's per-department amounts (#4119). One group-wide row. Read
 * through the server key, because #4111 keeps the rule unreadable to every
 * signed-in account; only the ONE department's amount per person leaves this
 * service, never the rule (Director, 30 Sep 2026: increments use the SAME
 * per-department amounts).
 */
export const DEPARTMENT_AMOUNT_RULE_KEY = 'hr.salary_suggestion_rule' as const;

export interface IncrementReport {
  asOf: string;
  colleges: CollegeIncrementReport[];
  /** Colleges visible to this user that hold no increment rules at all. */
  collegesWithoutRules: string[];
  /** True when the caller can see no college. The screen says so explicitly. */
  noAccessibleColleges: boolean;
}

interface OrgRow {
  institution_id: string;
  hr_organization_id: string;
  organization_name: string | null;
}

/** Narrow a JSONB value that may arrive wrapped as `{ value: {...} }`. */
function unwrapPolicyValue(raw: unknown): unknown {
  if (raw == null) return null;
  if (
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    'value' in (raw as Record<string, unknown>) &&
    typeof (raw as { value?: unknown }).value === 'object' &&
    (raw as { value?: unknown }).value !== null
  ) {
    return (raw as { value: unknown }).value;
  }
  return raw;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function fullName(row: { first_name?: unknown; last_name?: unknown }): string {
  const first = typeof row.first_name === 'string' ? row.first_name.trim() : '';
  const last = typeof row.last_name === 'string' ? row.last_name.trim() : '';
  const joined = `${first} ${last}`.trim();
  return joined === '' ? 'Unnamed team member record' : joined;
}

/** Rows per page. PostgREST cuts a read off at 1000 rows without an error. */
const ROWS_PER_PAGE = 1000;

/**
 * Read EVERY row a filtered query matches: the ids in chunks small enough for
 * the gateway (chunkIdsForIn: ~675 ids in one filter is ~25KB of URL, at the
 * measured ~26KB cliff), each chunk paged until a short page. Any error on any page is returned, never
 * swallowed, so a caller can treat a partial read as a failed one.
 */
async function readAll(
  query: (ids: string[]) => any,
  ids: string[],
  /** A column unique per row, so pages neither overlap nor skip. */
  orderBy = 'id',
): Promise<{ rows: Array<Record<string, any>>; failed: boolean }> {
  const rows: Array<Record<string, any>> = [];
  for (const batch of chunkIdsForIn(ids)) {
    for (let from = 0; ; from += ROWS_PER_PAGE) {
      const { data, error } = await query(batch)
        .order(orderBy, { ascending: true })
        .range(from, from + ROWS_PER_PAGE - 1);
      if (error || !Array.isArray(data)) return { rows, failed: true };
      rows.push(...data);
      if (data.length < ROWS_PER_PAGE) break;
    }
  }
  return { rows, failed: false };
}

/** Today in India (Asia/Kolkata), as YYYY-MM-DD. A UTC date is still yesterday before 05:30. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const DISCIPLINARY_OUTCOMES: DisciplinaryOutcome[] = [
  'warning',
  'suspension',
  'termination',
  'exonerated',
];

export class IncrementReportService {
  /**
   * Build the per-college increment report for whichever colleges this user is
   * allowed to see.
   *
   * `asOf` exists so a caller (and the tests) can ask the question as at a
   * given date. It defaults to today.
   */
  static async build(
    supabase: any,
    options: { asOf?: string } = {},
  ): Promise<IncrementReport> {
    const asOf = options.asOf ?? todayInIndia();
    // An impossible date (2026-02-31) would count NaN months, and NaN passes
    // the window check, so everyone would read as due. Refuse it here too.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || parseIsoDate(asOf) === null) {
      throw new Error(`The report date "${asOf}" is not a real date written as YYYY-MM-DD.`);
    }

    // --- 1. Which colleges may this user see -----------------------------
    const { data: orgRows, error: orgError } = await supabase.rpc(
      'fn_hr_orgs_for_institutions',
    );
    if (orgError) throw new Error(orgError.message);

    const orgs: OrgRow[] = Array.isArray(orgRows) ? orgRows : [];
    // One college can own more than one HR organisation; the report is per
    // college, so collapse to the institution.
    const collegeNames = new Map<string, string>();
    for (const o of orgs) {
      if (!o?.institution_id) continue;
      if (!collegeNames.has(o.institution_id)) {
        collegeNames.set(o.institution_id, o.organization_name ?? 'Unnamed college');
      }
    }
    const institutionIds = [...collegeNames.keys()];

    if (institutionIds.length === 0) {
      return { asOf, colleges: [], collegesWithoutRules: [], noAccessibleColleges: true };
    }

    // Prefer the institution's own name over the HR organisation's label.
    const { data: institutionRows } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', institutionIds);
    for (const row of (institutionRows ?? []) as Array<{ id: string; name: string | null }>) {
      if (row?.id && typeof row.name === 'string' && row.name.trim() !== '') {
        collegeNames.set(row.id, row.name.trim());
      }
    }

    // --- 2. The rules, per college, with NO fallback ---------------------
    // Active rows only. A 'draft_only' row holds no published rules (its value
    // is a placeholder); 'draft_pending' keeps the published rules in `value`.
    // One row per college at most: uq_platform_policies_key_scope.
    const { data: policyRows, error: policyError } = await supabase
      .from('platform_policies')
      .select('scope_id, value, publication_state, updated_at')
      .eq('policy_key', INCREMENT_POLICY_KEY)
      .eq('scope_type', 'institution')
      .eq('is_active', true)
      .in('scope_id', institutionIds);
    if (policyError) throw new Error(policyError.message);

    const policyByCollege = new Map<string, unknown>();
    for (const row of (policyRows ?? []) as Array<{
      scope_id: string;
      value: unknown;
      publication_state?: unknown;
    }>) {
      if (!row?.scope_id || row.publication_state === 'draft_only') continue;
      policyByCollege.set(row.scope_id, unwrapPolicyValue(row.value));
    }

    // --- 2b. The amount, per department (Director, 30 Sep 2026) ----------
    // The published, active, group-wide rule only. The stored object IS the
    // rule (no { value: ... } wrapper), as lib/hr/salary-suggestion.ts reads it.
    const admin: any = createServiceRoleClient();
    // Active and not 'draft_only' (whose value is '{}' until the first
    // publish). Exactly one such row, or no amount is shown for anyone.
    const { data: ruleRows, error: ruleError } = await admin
      .from('platform_policies')
      .select('value, publication_state, is_active')
      .eq('policy_key', DEPARTMENT_AMOUNT_RULE_KEY)
      .eq('scope_type', 'global')
      .eq('is_active', true)
      .is('scope_id', null);
    if (ruleError) throw new Error(ruleError.message);
    const usableRules = ((ruleRows ?? []) as Array<Record<string, unknown>>).filter(
      (r) => r.is_active === true && r.publication_state !== 'draft_only',
    );
    const departmentRule = parseSalarySuggestionRule(
      usableRules.length === 1 ? usableRules[0].value ?? null : null,
    );

    // --- 3. The people ---------------------------------------------------
    // Paged: a cut-off here would drop people from the report silently.
    const staffRead = await readAll(
      (ids) =>
        supabase
          .from('staff')
          .select('id, first_name, last_name, designation, institution_id, department_id, date_of_joining')
          .in('institution_id', ids)
          .eq('is_active', true),
      institutionIds,
    );
    if (staffRead.failed) throw new Error('Could not read the team members of these colleges.');

    const staff = [...staffRead.rows].sort((a, b) =>
      String(a.first_name ?? '').localeCompare(String(b.first_name ?? '')),
    ) as Array<Record<string, unknown>>;
    const staffIds = staff
      .map((s) => (typeof s.id === 'string' ? s.id : null))
      .filter((v): v is string => v !== null);

    if (staffIds.length === 0) {
      return this.assemble({ asOf, collegeNames, policyByCollege, peopleByCollege: new Map() });
    }

    // Whether anyone sees EVERY row of the tables below is Postgres's answer,
    // asked once. An error counts as "cannot see".
    const [{ data: superAdminAnswer, error: superAdminError }, { data: adminAnswer, error: adminError }] =
      await Promise.all([supabase.rpc('is_super_admin'), supabase.rpc('is_admin')]);
    const isSuperAdmin = !superAdminError && superAdminAnswer === true;
    const isAdmin = !adminError && adminAnswer === true;

    // --- 4. Pay in force -------------------------------------------------
    // A failed read marks EVERY person 'unreadable'. Rows dated after the
    // report date are not in force yet. One row in force is the only state
    // that lets the year be counted; none or several is "not decided".
    // (RLS: this route's permission, hr.payroll.salary.view, reads every row.)
    const salaryRead = await readAll(
      (ids) =>
        supabase
          .from('hr_staff_salaries')
          .select('id, staff_id, monthly_gross, effective_from, hr_organization_id')
          .in('staff_id', ids)
          .is('superseded_by', null),
      staffIds,
    );
    const asOfDate = parseIsoDate(asOf)!;

    const salaryByStaff = new Map<
      string,
      Array<{ gross: number | null; effectiveFrom: string | null }>
    >();
    for (const row of salaryRead.rows) {
      const id = typeof row.staff_id === 'string' ? row.staff_id : null;
      if (!id) continue;
      const effectiveFrom = typeof row.effective_from === 'string' ? row.effective_from : null;
      const starts = parseIsoDate(effectiveFrom);
      // Not yet in force on the report date. (An undated row stays: it is
      // reported as unusable, not hidden.)
      if (starts !== null && compareDates(starts, asOfDate) > 0) continue;
      const list = salaryByStaff.get(id) ?? [];
      list.push({ gross: asNumber(row.monthly_gross), effectiveFrom });
      salaryByStaff.set(id, list);
    }

    // --- 5. The latest performance review --------------------------------
    // Newest cycle first, so the first row seen per person is the current one.
    // Readable only when the read succeeds AND the caller sees every review.
    // RLS on hr_performance_reviews (20260617_hr_performance_review_cycles.sql)
    // lets super admins and admins see all; anyone else sees their own and
    // their department's, and answers the rest with zero rows, not an error.
    const reviewRead = await readAll(
      (ids) =>
        supabase
          .from('hr_performance_reviews')
          .select(
            'id, staff_id, status, final_score, final_approved_at, cycle:hr_performance_review_cycles(cycle_year, end_date)',
          )
          .in('staff_id', ids),
      staffIds,
    );
    const reviewRecordReadable = !reviewRead.failed && (isSuperAdmin || isAdmin);

    const reviewByStaff = new Map<string, PerformanceReviewFact>();
    const reviewRank = new Map<string, number>();
    for (const row of reviewRead.rows) {
      const id = typeof row.staff_id === 'string' ? row.staff_id : null;
      if (!id) continue;
      const cycleYear = asNumber(row.cycle?.cycle_year);
      // Rank by cycle year, and prefer a final-approved row within a year.
      const rank = (cycleYear ?? 0) * 10 + (row.status === 'final_approved' ? 1 : 0);
      if ((reviewRank.get(id) ?? -1) >= rank) continue;
      reviewRank.set(id, rank);
      const cycleEnd = typeof row.cycle?.end_date === 'string' ? row.cycle.end_date : null;
      const approvedAt =
        typeof row.final_approved_at === 'string' ? row.final_approved_at : null;
      reviewByStaff.set(id, {
        cycleYear,
        finalScore: asNumber(row.final_score),
        isFinalApproved: row.status === 'final_approved',
        periodEnd: (cycleEnd ?? approvedAt)?.slice(0, 10) ?? null,
      });
    }

    // --- 6. Disciplinary record ------------------------------------------
    // An empty result here means "clean" only when the read could see every
    // case. Two ways it cannot, and both used to read as clean conduct and
    // could show a false "Due":
    //  - the read errors (data comes back null);
    //  - RLS refuses it. RLS answers a refused read with ZERO ROWS, not an
    //    error. On hr_disciplinary_cases only a super admin sees every row;
    //    anyone else (hr_head, who holds this route's permission) sees only
    //    their own (20260623_hr_disciplinary_cases.sql). So for a non-super
    //    admin every other person's empty list is a refusal, not a record.
    // The super-admin question goes to Postgres (`is_super_admin`), and an
    // error there counts as "cannot see". If a wider read policy is ever
    // added, this stays on the safe side: "could not check", never "Due".
    const caseRead = await readAll(
      (ids) =>
        supabase
          .from('hr_disciplinary_cases')
          .select('id, staff_id, case_number, outcome, outcome_date, status, current_stage')
          .in('staff_id', ids),
      staffIds,
    );
    const conductRecordReadable = !caseRead.failed && isSuperAdmin;

    const decidedByStaff = new Map<string, DecidedDisciplinaryCase[]>();
    const openByStaff = new Map<string, number>();
    for (const row of caseRead.rows) {
      const id = typeof row.staff_id === 'string' ? row.staff_id : null;
      if (!id) continue;
      const outcome = row.outcome;
      if (
        typeof outcome === 'string' &&
        DISCIPLINARY_OUTCOMES.includes(outcome as DisciplinaryOutcome)
      ) {
        const list = decidedByStaff.get(id) ?? [];
        list.push({
          outcome: outcome as DisciplinaryOutcome,
          outcomeDate:
            typeof row.outcome_date === 'string' ? row.outcome_date.slice(0, 10) : null,
          caseNumber: typeof row.case_number === 'string' ? row.case_number : null,
        });
        decidedByStaff.set(id, list);
      } else {
        // No outcome yet. An enquiry that is still running may exonerate, so
        // this is counted as undecided rather than ignored.
        openByStaff.set(id, (openByStaff.get(id) ?? 0) + 1);
      }
    }

    // --- 7. The reference scale, where the job title has been sorted -----
    // staff.designation is free text; hr_pay_scales is keyed on
    // designation_id, and the link is hr_staff_details.designation_id, which
    // the designation-mapping screen fills in. An unsorted title has no scale,
    // and that is shown as "not linked" rather than guessed by name.
    // Reference only: a failed read shows "not linked" and never moves a
    // verdict or an amount.
    const detailRead = await readAll(
      (ids) =>
        supabase
          .from('hr_staff_details')
          .select('staff_id, designation_id')
          .in('staff_id', ids),
      staffIds,
      'staff_id',
    );

    const designationByStaff = new Map<string, string>();
    for (const row of detailRead.rows) {
      const id = typeof row.staff_id === 'string' ? row.staff_id : null;
      const designationId =
        typeof row.designation_id === 'string' ? row.designation_id : null;
      if (id && designationId) designationByStaff.set(id, designationId);
    }

    const designationIds = [...new Set(designationByStaff.values())];
    const scaleByDesignation = new Map<string, { basicPay: number | null; gradePay: number | null }>();
    if (designationIds.length > 0) {
      const { data: scaleRows } = await supabase
        .from('hr_pay_scales')
        .select('designation_id, basic_pay, grade_pay')
        .in('designation_id', designationIds)
        .is('superseded_by', null);
      for (const row of (scaleRows ?? []) as Array<Record<string, unknown>>) {
        const did = typeof row.designation_id === 'string' ? row.designation_id : null;
        if (!did || scaleByDesignation.has(did)) continue;
        scaleByDesignation.set(did, {
          basicPay: asNumber(row.basic_pay),
          gradePay: asNumber(row.grade_pay),
        });
      }
    }

    // --- 8. Assemble ------------------------------------------------------
    const peopleByCollege = new Map<string, PersonPayFacts[]>();
    for (const row of staff) {
      const id = typeof row.id === 'string' ? row.id : null;
      const collegeId = typeof row.institution_id === 'string' ? row.institution_id : null;
      if (!id || !collegeId) continue;

      const salaries = salaryByStaff.get(id) ?? [];
      const payRecord: PersonPayFacts['payRecord'] = salaryRead.failed
        ? 'unreadable'
        : salaries.length === 0
          ? 'none'
          : salaries.length === 1
            ? 'one'
            : 'ambiguous';
      const salary = payRecord === 'one' ? salaries[0] : undefined;
      const designationId = designationByStaff.get(id);
      const scale = designationId ? scaleByDesignation.get(designationId) ?? null : null;

      const departmentId = typeof row.department_id === 'string' ? row.department_id : null;
      const facts: PersonPayFacts = {
        staffId: id,
        staffName: fullName(row),
        designation: typeof row.designation === 'string' ? row.designation : null,
        institutionId: collegeId,
        departmentId,
        departmentIncrementAmount: departmentRate(departmentRule, departmentId),
        currentMonthlyGross: salary?.gross ?? null,
        payRecord,
        payEffectiveFrom: salary?.effectiveFrom ?? null,
        dateOfJoining:
          typeof row.date_of_joining === 'string' ? row.date_of_joining.slice(0, 10) : null,
        latestReview: reviewRecordReadable ? reviewByStaff.get(id) ?? null : null,
        reviewRecordReadable,
        decidedDisciplinaryCases: decidedByStaff.get(id) ?? [],
        openUndecidedDisciplinaryCases: openByStaff.get(id) ?? 0,
        conductRecordReadable,
        scale,
      };

      const list = peopleByCollege.get(collegeId) ?? [];
      list.push(facts);
      peopleByCollege.set(collegeId, list);
    }

    return this.assemble({ asOf, collegeNames, policyByCollege, peopleByCollege });
  }

  private static assemble(input: {
    asOf: string;
    collegeNames: Map<string, string>;
    policyByCollege: Map<string, unknown>;
    peopleByCollege: Map<string, PersonPayFacts[]>;
  }): IncrementReport {
    const colleges: CollegeIncrementReport[] = [];
    for (const [institutionId, institutionName] of input.collegeNames) {
      colleges.push(
        buildCollegeReport({
          institutionId,
          institutionName,
          policyValue: input.policyByCollege.get(institutionId) ?? null,
          people: input.peopleByCollege.get(institutionId) ?? [],
          asOf: input.asOf,
        }),
      );
    }

    // Colleges that hold rules first, then the ones that do not — the second
    // group is the finding, so it is listed rather than hidden at the bottom of
    // an alphabetical sort.
    colleges.sort((a, b) => {
      if (a.hasRules !== b.hasRules) return a.hasRules ? -1 : 1;
      return a.institutionName.localeCompare(b.institutionName);
    });

    return {
      asOf: input.asOf,
      colleges,
      collegesWithoutRules: colleges
        .filter((c) => !c.hasRules)
        .map((c) => c.institutionName),
      noAccessibleColleges: false,
    };
  }
}
