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
// never a silent redirect. Every table read is additionally behind its own RLS.
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
  type CollegeIncrementReport,
  type DecidedDisciplinaryCase,
  type DisciplinaryOutcome,
  type PerformanceReviewFact,
  type PersonPayFacts,
} from '@/lib/hr/increment-engine';

export const INCREMENT_POLICY_KEY = 'hr.allowances_and_increments' as const;

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
  return joined === '' ? 'Unnamed staff record' : joined;
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
    const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);

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
    const { data: policyRows, error: policyError } = await supabase
      .from('platform_policies')
      .select('scope_id, value, updated_at')
      .eq('policy_key', INCREMENT_POLICY_KEY)
      .eq('scope_type', 'institution')
      .in('scope_id', institutionIds);
    if (policyError) throw new Error(policyError.message);

    const policyByCollege = new Map<string, unknown>();
    for (const row of (policyRows ?? []) as Array<{ scope_id: string; value: unknown }>) {
      if (row?.scope_id) policyByCollege.set(row.scope_id, unwrapPolicyValue(row.value));
    }

    // --- 3. The people ---------------------------------------------------
    const { data: staffRows, error: staffError } = await supabase
      .from('staff')
      .select('id, first_name, last_name, designation, institution_id, date_of_joining')
      .in('institution_id', institutionIds)
      .eq('is_active', true)
      .order('first_name', { ascending: true });
    if (staffError) throw new Error(staffError.message);

    const staff = (staffRows ?? []) as Array<Record<string, unknown>>;
    const staffIds = staff
      .map((s) => (typeof s.id === 'string' ? s.id : null))
      .filter((v): v is string => v !== null);

    if (staffIds.length === 0) {
      return this.assemble({ asOf, collegeNames, policyByCollege, peopleByCollege: new Map() });
    }

    // --- 4. Pay in force -------------------------------------------------
    const { data: salaryRows } = await supabase
      .from('hr_staff_salaries')
      .select('staff_id, monthly_gross, effective_from, hr_organization_id')
      .in('staff_id', staffIds)
      .is('superseded_by', null);

    const salaryByStaff = new Map<string, { gross: number | null; effectiveFrom: string | null }>();
    for (const row of (salaryRows ?? []) as Array<Record<string, unknown>>) {
      const id = typeof row.staff_id === 'string' ? row.staff_id : null;
      if (!id) continue;
      salaryByStaff.set(id, {
        gross: asNumber(row.monthly_gross),
        effectiveFrom: typeof row.effective_from === 'string' ? row.effective_from : null,
      });
    }

    // --- 5. The latest performance review --------------------------------
    // Newest cycle first, so the first row seen per person is the current one.
    const { data: reviewRows } = await supabase
      .from('hr_performance_reviews')
      .select(
        'staff_id, status, final_score, final_approved_at, cycle:hr_performance_review_cycles(cycle_year, end_date)',
      )
      .in('staff_id', staffIds);

    const reviewByStaff = new Map<string, PerformanceReviewFact>();
    const reviewRank = new Map<string, number>();
    for (const row of (reviewRows ?? []) as Array<Record<string, any>>) {
      const id = typeof row.staff_id === 'string' ? row.staff_id : null;
      if (!id) continue;
      const cycleYear = asNumber(row.cycle?.cycle_year);
      // Rank by cycle year, and prefer a final-approved row within a year.
      const rank = (cycleYear ?? 0) * 10 + (row.status === 'final_approved' ? 1 : 0);
      if ((reviewRank.get(id) ?? -1) >= rank) continue;
      reviewRank.set(id, rank);
      reviewByStaff.set(id, {
        cycleYear,
        finalScore: asNumber(row.final_score),
        isFinalApproved: row.status === 'final_approved',
      });
    }

    // --- 6. Disciplinary record ------------------------------------------
    const { data: caseRows } = await supabase
      .from('hr_disciplinary_cases')
      .select('staff_id, case_number, outcome, outcome_date, status, current_stage')
      .in('staff_id', staffIds);

    const decidedByStaff = new Map<string, DecidedDisciplinaryCase[]>();
    const openByStaff = new Map<string, number>();
    for (const row of (caseRows ?? []) as Array<Record<string, unknown>>) {
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
    const { data: detailRows } = await supabase
      .from('hr_staff_details')
      .select('staff_id, designation_id')
      .in('staff_id', staffIds);

    const designationByStaff = new Map<string, string>();
    for (const row of (detailRows ?? []) as Array<Record<string, unknown>>) {
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

      const salary = salaryByStaff.get(id);
      const designationId = designationByStaff.get(id);
      const scale = designationId ? scaleByDesignation.get(designationId) ?? null : null;

      const facts: PersonPayFacts = {
        staffId: id,
        staffName: fullName(row),
        designation: typeof row.designation === 'string' ? row.designation : null,
        institutionId: collegeId,
        currentMonthlyGross: salary?.gross ?? null,
        payEffectiveFrom: salary?.effectiveFrom ?? null,
        dateOfJoining:
          typeof row.date_of_joining === 'string' ? row.date_of_joining.slice(0, 10) : null,
        latestReview: reviewByStaff.get(id) ?? null,
        decidedDisciplinaryCases: decidedByStaff.get(id) ?? [],
        openUndecidedDisciplinaryCases: openByStaff.get(id) ?? 0,
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
