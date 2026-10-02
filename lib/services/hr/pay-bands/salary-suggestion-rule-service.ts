// lib/services/hr/pay-bands/salary-suggestion-rule-service.ts
// ============================================================================
// The Director's salary suggestion rule — read and saved on the SERVER.
// ============================================================================
//
// The rule is the `hr.salary_suggestion_rule` policy in platform_policies:
// ONE group-wide row (scope_type 'global', scope_id NULL) holding an amount
// per year at JKKN for each department (the Director's ruling of 29 Sep 2026:
// "the Director fills every department on one settings page; empty = no
// suggestion"). It holds rupee amounts, so the page never reads it from the
// browser (PR #4111 locks the key at the database).
//
// Called only from /api/hr/payroll/salary-suggestion-rule, with the CALLER's
// session client, so the table's own policies still apply: #4111 lets only
// admins read a group-wide pay row and only super admins write one, and this
// PR's migration (20270512090000, section 4) refuses every write to this key
// unless the caller is on the Director list (fn_is_the_director(), #4121).
//
// DRAFT → PUBLISH, with a mandatory reason, logged to hr_policy_audit_log —
// the same lifecycle as the other HR policy editors (PolicyEditorShell). Two
// differences, both because this key starts with NO rows:
//   - the first save CREATES the row. A first "Save draft" stores the rule in
//     draft_value with value '{}' and publication_state 'draft_only', so the
//     suggestion keeps reading "not set" until it is published;
//   - a failed audit insert is REPORTED, not swallowed.
// ============================================================================

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SalarySuggestionRule } from '@/lib/hr/salary-suggestion';
import { ruleForStorage } from '@/lib/hr/salary-suggestion-rule-form';

export const SALARY_SUGGESTION_RULE_KEY = 'hr.salary_suggestion_rule' as const;
export const POLICIES_TABLE = 'platform_policies' as const;
export const AUDIT_LOG_TABLE = 'hr_policy_audit_log' as const;
/** Is PR #4111's protection of this key live? See 20270512090000, section 3. */
export const RULE_LOCK_RPC = 'fn_hr_salary_rule_lock_present' as const;
/** Is the caller on the Director list? #4121's function (20270520090000). */
export const DIRECTOR_RPC = 'fn_is_the_director' as const;

export interface RuleDepartment {
  id: string;
  name: string;
  institutionId: string;
  institutionName: string;
}

export interface RuleRow {
  id: string;
  value: unknown;
  draftValue: unknown;
  publicationState: string;
  updatedAt: string | null;
}

export interface RuleListResponse {
  /** Every active department at a college in the HR module, college by college. */
  departments: RuleDepartment[];
  /** The one group-wide row, or null before the first save. */
  row: RuleRow | null;
}

export interface SaveRuleInput {
  publish: boolean;
  rule: unknown;
  reason: string;
  userId: string;
}

export interface SaveRuleResult {
  row: RuleRow;
  /** Set when the change saved but its audit row could not be written. */
  auditError: string | null;
}

export class RuleInputError extends Error {}

const ROW_COLUMNS = 'id, scope_type, scope_id, value, draft_value, publication_state, updated_at';

interface RawRow {
  id: string;
  scope_type: string;
  scope_id: string | null;
  value: unknown;
  draft_value: unknown;
  publication_state: string | null;
  updated_at: string | null;
}

function shape(r: RawRow): RuleRow {
  return {
    id: r.id,
    value: r.value,
    draftValue: r.draft_value,
    publicationState: r.publication_state ?? 'published',
    updatedAt: r.updated_at,
  };
}

async function listInstitutions(supabase: SupabaseClient): Promise<Array<{ id: string; name: string }>> {
  // Only institutions that are IN the HR module, as the other HR policy editors
  // offer them. The !inner embed is the intended row-drop here.
  const { data, error } = await supabase
    .from('institutions')
    .select('id, name, hr_organizations!inner(included_in_hr)')
    .eq('hr_organizations.included_in_hr', true)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(`Failed to load colleges: ${error.message}`);
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string }> = [];
  for (const r of (data ?? []) as Array<{ id: string; name: string }>) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.name });
  }
  return out;
}

async function listDepartments(supabase: SupabaseClient): Promise<RuleDepartment[]> {
  const colleges = await listInstitutions(supabase);
  if (colleges.length === 0) return [];
  const collegeName = new Map(colleges.map((c) => [c.id, c.name]));
  const { data, error } = await supabase
    .from('departments')
    .select('id, department_name, institution_id')
    .in('institution_id', colleges.map((c) => c.id))
    .eq('is_active', true)
    .order('department_name', { ascending: true });
  if (error) throw new Error(`Failed to load departments: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; department_name: string; institution_id: string }>)
    .map((d) => ({
      id: d.id.toLowerCase(),
      name: d.department_name,
      institutionId: d.institution_id,
      institutionName: collegeName.get(d.institution_id) ?? '',
    }))
    .sort((a, b) => a.institutionName.localeCompare(b.institutionName) || a.name.localeCompare(b.name));
}

async function findRow(supabase: SupabaseClient): Promise<RawRow | null> {
  const { data, error } = await supabase
    .from(POLICIES_TABLE)
    .select(ROW_COLUMNS)
    .eq('policy_key', SALARY_SUGGESTION_RULE_KEY)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the rule: ${error.message}`);
  return (data as RawRow | null) ?? null;
}

export const SalarySuggestionRuleService = {
  /**
   * True only when #4111's restrictive read policies cover this key, so a saved
   * rule (or draft) is not readable by every signed-in account. Throws when
   * the check itself fails: the caller must refuse, never assume.
   */
  async lockPresent(supabase: SupabaseClient): Promise<boolean> {
    const { data, error } = await supabase.rpc(RULE_LOCK_RPC);
    if (error) throw new Error(`Could not check pay-policy protection: ${error.message}`);
    return data === true;
  },

  /**
   * True only when the caller is on the Director list (strictly `true`).
   * Throws when the check itself fails — for example before #4121 is applied —
   * and the caller must then refuse, never assume.
   */
  async isTheDirector(supabase: SupabaseClient): Promise<boolean> {
    const { data, error } = await supabase.rpc(DIRECTOR_RPC);
    if (error) throw new Error(`Could not check the Director list: ${error.message}`);
    return data === true;
  },

  async list(supabase: SupabaseClient): Promise<RuleListResponse> {
    const [departments, row] = await Promise.all([listDepartments(supabase), findRow(supabase)]);
    return { departments, row: row ? shape(row) : null };
  },

  async save(supabase: SupabaseClient, input: SaveRuleInput): Promise<SaveRuleResult> {
    const reason = input.reason.trim();
    if (reason.length < 5) throw new RuleInputError('Give a reason of at least 5 characters.');

    const rule: SalarySuggestionRule = ruleForStorage(input.rule);
    const known = new Set((await listDepartments(supabase)).map((d) => d.id));
    const unknown = Object.keys(rule.per_year_by_department ?? {}).filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new RuleInputError(
        `${unknown.length === 1 ? 'One amount is' : `${unknown.length} amounts are`} for a department that is not an active department of a college in the HR module. Nothing was saved.`
      );
    }

    const existing = await findRow(supabase);
    const now = new Date().toISOString();
    let saved: RawRow;
    if (existing) {
      const payload: Record<string, unknown> = input.publish
        ? { value: rule, draft_value: null, publication_state: 'published' }
        : {
            draft_value: rule,
            publication_state: existing.publication_state === 'draft_only' ? 'draft_only' : 'draft_pending',
          };
      const { data, error } = await supabase
        .from(POLICIES_TABLE)
        .update({ ...payload, updated_by: input.userId, updated_at: now } as never)
        .eq('id', existing.id)
        .select(ROW_COLUMNS)
        .single();
      if (error) throw new Error(`Failed to save the rule: ${error.message}`);
      saved = data as RawRow;
    } else {
      const { data, error } = await supabase
        .from(POLICIES_TABLE)
        .insert({
          policy_key: SALARY_SUGGESTION_RULE_KEY,
          scope_type: 'global',
          scope_id: null,
          // A first draft is not in force: '{}' reads "not set" until published.
          value: input.publish ? rule : {},
          draft_value: input.publish ? null : rule,
          publication_state: input.publish ? 'published' : 'draft_only',
          classification: 'major',
          data_type: 'object',
          description:
            "The Director's rule for suggesting a revised salary: rupees per year at JKKN for each department (years before JKKN count at half). Reference only; it changes nobody's pay.",
          updated_by: input.userId,
        } as never)
        .select(ROW_COLUMNS)
        .single();
      if (error) throw new Error(`Failed to save the rule: ${error.message}`);
      saved = data as RawRow;
    }

    const { error: auditErr } = await supabase.from(AUDIT_LOG_TABLE).insert({
      policy_id: saved.id,
      policy_key: SALARY_SUGGESTION_RULE_KEY,
      scope_type: 'global',
      scope_id: null,
      action: input.publish ? 'publish' : 'edit_draft',
      old_value: existing ? (existing.value ?? null) : null,
      new_value: rule,
      reason,
      edited_by: input.userId,
    } as never);

    return { row: shape(saved), auditError: auditErr ? auditErr.message : null };
  },
};
