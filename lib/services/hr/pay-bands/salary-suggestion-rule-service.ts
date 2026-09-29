// lib/services/hr/pay-bands/salary-suggestion-rule-service.ts
// ============================================================================
// The Director's salary suggestion rule — read and saved on the SERVER.
// ============================================================================
//
// The rule is the `hr.salary_suggestion_rule` policy in platform_policies: one
// row per college (scope_type 'institution') and one group-wide row
// (scope_type 'global', scope_id NULL) that applies to every college without
// its own. It holds rupee amounts, so the editor never reads it from the
// browser (PR #4111 locks the key at the database; its guard test fails a
// client file that names the key and reads the table).
//
// Called only from /api/hr/payroll/salary-suggestion-rule, which admits super
// admins only, with the CALLER's session client: the table's own write policy
// (is_super_admin() OR is_admin()) and hr_policy_audit_log's insert policy
// (is_super_admin()) still apply.
//
// DRAFT → PUBLISH, with a mandatory reason, logged to hr_policy_audit_log —
// the same lifecycle as the other HR policy editors (PolicyEditorShell). Two
// differences, both because this key starts with NO rows:
//   - the first save CREATES the row. A first "Save draft" stores the rule in
//     draft_value with value '{}' and publication_state 'draft_only', so the
//     suggestion keeps reading "rule not set" until it is published;
//   - a failed audit insert is REPORTED, not swallowed.
// ============================================================================

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SalarySuggestionRule } from '@/lib/hr/salary-suggestion';
import { ruleForStorage } from '@/lib/hr/salary-suggestion-rule-form';

export const SALARY_SUGGESTION_RULE_KEY = 'hr.salary_suggestion_rule' as const;
export const POLICIES_TABLE = 'platform_policies' as const;
export const AUDIT_LOG_TABLE = 'hr_policy_audit_log' as const;

export interface RuleInstitution {
  id: string;
  name: string;
}

export interface RuleRow {
  id: string;
  scopeType: 'global' | 'institution';
  scopeId: string | null;
  value: unknown;
  draftValue: unknown;
  publicationState: string;
  updatedAt: string | null;
}

export interface RuleListResponse {
  institutions: RuleInstitution[];
  rows: RuleRow[];
}

export interface SaveRuleInput {
  /** null = group-wide. */
  scopeId: string | null;
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
    scopeType: r.scope_type === 'global' ? 'global' : 'institution',
    scopeId: r.scope_id,
    value: r.value,
    draftValue: r.draft_value,
    publicationState: r.publication_state ?? 'published',
    updatedAt: r.updated_at,
  };
}

async function listInstitutions(supabase: SupabaseClient): Promise<RuleInstitution[]> {
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
  const out: RuleInstitution[] = [];
  for (const r of (data ?? []) as Array<{ id: string; name: string }>) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.name });
  }
  return out;
}

async function listRows(supabase: SupabaseClient): Promise<RuleRow[]> {
  const { data, error } = await supabase
    .from(POLICIES_TABLE)
    .select(ROW_COLUMNS)
    .eq('policy_key', SALARY_SUGGESTION_RULE_KEY);
  if (error) throw new Error(`Failed to load the rule: ${error.message}`);
  return ((data ?? []) as RawRow[])
    .filter((r) => r.scope_type === 'global' || r.scope_type === 'institution')
    .map(shape);
}

export const SalarySuggestionRuleService = {
  async list(supabase: SupabaseClient): Promise<RuleListResponse> {
    const [institutions, rows] = await Promise.all([listInstitutions(supabase), listRows(supabase)]);
    return { institutions, rows };
  },

  async save(supabase: SupabaseClient, input: SaveRuleInput): Promise<SaveRuleResult> {
    const reason = input.reason.trim();
    if (reason.length < 5) throw new RuleInputError('Give a reason of at least 5 characters.');

    if (input.scopeId !== null) {
      const institutions = await listInstitutions(supabase);
      if (!institutions.some((i) => i.id === input.scopeId)) {
        throw new RuleInputError('That college is not in the HR module.');
      }
    }

    const rule: SalarySuggestionRule = ruleForStorage(input.rule);
    const scopeType = input.scopeId === null ? 'global' : 'institution';

    let find = supabase
      .from(POLICIES_TABLE)
      .select(ROW_COLUMNS)
      .eq('policy_key', SALARY_SUGGESTION_RULE_KEY)
      .eq('scope_type', scopeType);
    find = input.scopeId === null ? find.is('scope_id', null) : find.eq('scope_id', input.scopeId);
    const { data: existing, error: findErr } = await find.maybeSingle();
    if (findErr) throw new Error(`Failed to load the rule: ${findErr.message}`);

    const now = new Date().toISOString();
    let saved: RawRow;
    if (existing) {
      const payload: Record<string, unknown> = input.publish
        ? { value: rule, draft_value: null, publication_state: 'published' }
        : {
            draft_value: rule,
            publication_state:
              (existing as RawRow).publication_state === 'draft_only' ? 'draft_only' : 'draft_pending',
          };
      const { data, error } = await supabase
        .from(POLICIES_TABLE)
        .update({ ...payload, updated_by: input.userId, updated_at: now } as never)
        .eq('id', (existing as RawRow).id)
        .select(ROW_COLUMNS)
        .single();
      if (error) throw new Error(`Failed to save the rule: ${error.message}`);
      saved = data as RawRow;
    } else {
      const { data, error } = await supabase
        .from(POLICIES_TABLE)
        .insert({
          policy_key: SALARY_SUGGESTION_RULE_KEY,
          scope_type: scopeType,
          scope_id: input.scopeId,
          // A first draft is not in force: '{}' reads "rule not set" until published.
          value: input.publish ? rule : {},
          draft_value: input.publish ? null : rule,
          publication_state: input.publish ? 'published' : 'draft_only',
          classification: 'major',
          data_type: 'object',
          description:
            "The Director's rule for suggesting a revised salary: rupees per year at JKKN, per year before JKKN, and extras. Reference only; it changes nobody's pay.",
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
      scope_type: scopeType,
      scope_id: input.scopeId,
      action: input.publish ? 'publish' : 'edit_draft',
      old_value: existing ? ((existing as RawRow).value ?? null) : null,
      new_value: rule,
      reason,
      edited_by: input.userId,
    } as never);

    return { row: shape(saved), auditError: auditErr ? auditErr.message : null };
  },
};
