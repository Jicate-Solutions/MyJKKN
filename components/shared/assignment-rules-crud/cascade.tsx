'use client';

// ============================================================================
// AssignmentRulesCascade — Director-grade UX for assignment rules.
// Created: 2026-05-08. Migrated to policy-shell substrate (PR #TBD).
//
// Was: 740 LOC of bespoke TanStack table + 320-line JSON-textarea form dialog
// across 5 files (data-table, rule-form-dialog, columns, row-actions, index).
//
// Now: declarative CascadeConfig + CascadeStepList. Each rule renders as a
// numbered step card with plain-English explanation, "↓ if no match" arrows
// between them, and consequence-aware delete confirmations. The substrate
// handles labels, form rendering, toggle, delete confirm, and active gating.
//
// Shape decision: A (CascadeStepList).
// Reasoning: AssignmentRule.priority drives executeRulesForLead() — rules
// evaluate in priority order and the first match wins. The cascade IS the
// data. groupBy=null because rules don't share scope precedence (each
// institution has its own list, scoped by institution_id).
//
// Consumers:
//   - /admission/counselors/team/rules (super-admin picker + cascade)
//   - /admission/settings/assignment-rules (admission.settings.view + cascade)
// ============================================================================

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  CascadeStepList,
  type CascadeConfig,
  type CascadeStepView,
  type FieldSchema,
  type PolicyHandlers,
} from '@/lib/admin/policy-shell';
import {
  AssignmentRulesService,
  type AssignmentRule,
  type AssignmentRuleType,
  type AssignmentCriterion,
  type AssignmentAction,
} from '@/lib/services/admission/assignment-rules-service';
import { useRuleTypes } from '@/hooks/admission';
import { getRuleTypeIcon } from './icon';

// ----------------------------------------------------------------------------
// Plain-English helpers
// ----------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  source: 'lead source',
  interested_programs: 'program interest',
  city: 'city',
  state: 'state',
  score: 'lead score',
  institution_id: 'college',
};

const OPERATOR_PHRASES: Record<string, string> = {
  equals: 'is',
  contains: 'contains',
  greater_than: 'is greater than',
  less_than: 'is less than',
  in: 'is one of',
};

function describeCriterion(c: AssignmentCriterion): string {
  const field = FIELD_LABELS[c.field] ?? c.field;
  const op = OPERATOR_PHRASES[c.operator] ?? c.operator;
  const value = Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '');
  return value === '' ? `${field} ${op} (any)` : `${field} ${op} "${value}"`;
}

function describeAction(action: AssignmentAction | undefined): string {
  if (!action) return 'No action configured.';
  const fallback = action.fallback
    ? action.fallback === 'round_robin'
      ? ' Otherwise round-robin a counselor.'
      : ' Otherwise leave unassigned.'
    : '';
  switch (action.type) {
    case 'round_robin': {
      const n = action.counselor_ids?.length ?? 0;
      return n > 0
        ? `Round-robin among ${n} selected counselor${n === 1 ? '' : 's'}.${fallback}`
        : `Round-robin among all active counselors.${fallback}`;
    }
    case 'assign_to_counselor': {
      const n = action.counselor_ids?.length ?? 0;
      return n > 0
        ? `Assign to one of ${n} selected counselor${n === 1 ? '' : 's'}.${fallback}`
        : `Assign to a configured counselor.${fallback}`;
    }
    case 'assign_to_pool':
      return `Assign to the pool of available counselors.${fallback}`;
    default:
      return `Run the configured action.${fallback}`;
  }
}

function describeRuleType(type: AssignmentRuleType | undefined): string {
  if (!type) return 'Custom rule';
  switch (type) {
    case 'program':
      return 'By program';
    case 'round_robin':
      return 'Round robin';
    case 'location':
      return 'By location';
    case 'score':
      return 'By score';
    case 'source':
      return 'By source';
    case 'workload':
      return 'By counselor workload';
    default:
      return 'Custom rule';
  }
}

// ----------------------------------------------------------------------------
// Cascade-step renderer — maps an AssignmentRule to the policy-shell step view
// ----------------------------------------------------------------------------

function renderStep(rule: AssignmentRule): CascadeStepView {
  const matchPhrase =
    !rule.criteria || rule.criteria.length === 0
      ? 'Matches every new lead.'
      : `Matches when ${rule.criteria.map(describeCriterion).join(' AND ')}.`;

  return {
    title: `Step ${rule.priority}: ${rule.name}`,
    explanation: `${matchPhrase} ${describeAction(rule.action)}`.trim(),
    metaLines: [describeRuleType(rule.type)],
    isActive: rule.is_active,
    note: rule.description ?? null,
  };
}

// ----------------------------------------------------------------------------
// Form schema — schema-driven create/edit dialog. Receives the row being
// edited so we can compute conditional fields (e.g. lock priority on edit
// is NOT required here; left editable per existing behavior).
//
// JSON criteria/action remain textarea-driven for now — the existing form
// flagged "UX polish deferred to follow-up PR" and that scope still applies.
// What we get from policy-shell: plain-English labels, hint text on every
// field, validation, toast errors, consistent dialog visual.
// ----------------------------------------------------------------------------

function buildFormSchema(
  ruleTypeOptions: ReadonlyArray<{ value: string; label: string }>,
): (editing: AssignmentRule | null) => ReadonlyArray<FieldSchema> {
  return () => [
    {
      name: 'name',
      kind: 'text',
      englishLabel: 'Rule name',
      englishHint:
        'A short label that tells you at a glance what this rule does. Counselors do not see this.',
      placeholder: 'e.g. Engineering leads to senior counselors',
      required: true,
    },
    {
      name: 'description',
      kind: 'textarea',
      englishLabel: 'Description (optional)',
      englishHint:
        'A one-line note for future-you or the next admin: why this rule exists, what scenario it solves.',
      placeholder: 'Why does this rule exist?',
    },
    {
      name: 'priority',
      kind: 'number',
      englishLabel: 'Priority (lower number runs first)',
      englishHint:
        'Rules run in this order. The first one whose conditions match wins — so put your most-specific rule at priority 1 and the catch-all last.',
      min: 1,
      step: 1,
      required: true,
    },
    {
      name: 'type',
      kind: 'enum',
      englishLabel: 'Strategy',
      englishHint:
        'How counselors get picked when this rule matches. The list comes from /admin/counselors/rule-types.',
      options: ruleTypeOptions,
      required: true,
    },
    {
      name: 'is_active',
      kind: 'toggle',
      englishLabel: 'Run this rule when new leads come in?',
      englishHint:
        'When off, this rule is paused — it stays in place but is skipped. Turn it back on any time.',
    },
    {
      name: 'criteria_json',
      kind: 'textarea',
      englishLabel: 'Match conditions (JSON)',
      englishHint:
        'When does this rule fire? A JSON array of conditions; ALL must match. Example: [{"field":"source","operator":"equals","value":"website"}]. Empty array = matches every lead (catch-all).',
      placeholder: '[]',
    },
    {
      name: 'action_json',
      kind: 'textarea',
      englishLabel: 'Action when matched (JSON)',
      englishHint:
        'What happens when conditions match. Example: {"type":"round_robin","counselor_ids":["..."],"fallback":"unassigned"}.',
      placeholder: '{"type":"round_robin","fallback":"unassigned"}',
      required: true,
    },
  ];
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------

interface AssignmentRulesCascadeProps {
  /**
   * Institution to scope rules to. When undefined (super_admin / global admin
   * with no picker selection), reads cross-institution; on create the form
   * surfaces a friendly error toast asking the admin to pick an institution.
   */
  institutionId: string | undefined;
}

export function AssignmentRulesCascade({
  institutionId,
}: AssignmentRulesCascadeProps) {
  const { ruleTypes: registryTypes, isError: ruleTypesError } = useRuleTypes();

  // Prefer registry rule-types; fall back to the historical 6 enum values so
  // the picker is never empty even if registry fetch fails.
  const ruleTypeOptions = useMemo(
    () =>
      registryTypes.length > 0
        ? registryTypes.map((rt) => ({
            value: rt.rule_type_key,
            label: rt.display_label,
          }))
        : ([
            { value: 'round_robin', label: 'Round Robin' },
            { value: 'program', label: 'Program' },
            { value: 'location', label: 'Location' },
            { value: 'score', label: 'Score' },
            { value: 'source', label: 'Source' },
            { value: 'workload', label: 'Workload' },
          ] as ReadonlyArray<{ value: string; label: string }>),
    [registryTypes],
  );

  const config: CascadeConfig<AssignmentRule> = useMemo(
    () => ({
      title: 'Assignment Rules',
      explainer: (
        <>
          <h3 className="mb-2 text-sm font-semibold">
            How leads get routed to counselors
          </h3>
          <p>
            When a new lead comes in, MyJKKN walks down the list below in
            priority order. The first rule whose conditions match wins, and
            that rule&apos;s action picks the counselor. If no rule matches,
            the lead stays unassigned for manual triage.
          </p>
          <p className="mt-2">
            Lower priority numbers run first. Put your most specific rule at
            the top and a catch-all (no conditions) at the bottom if you want
            every lead routed.
          </p>
          {ruleTypesError && (
            <p className="mt-2 text-xs text-amber-600">
              Could not load custom rule types from the registry — showing
              built-in defaults only.
            </p>
          )}
        </>
      ),
      orderBy: 'priority' as keyof AssignmentRule,
      groupBy: null, // Rules don't share scope precedence (each institution has its own list).
      groupTitleFor: () => 'Rules in evaluation order',
      renderStep,
      formSchema: buildFormSchema(ruleTypeOptions),
      addLabel: 'New Rule',
      emptyMessage:
        'No assignment rules yet. Click "New Rule" to route incoming leads to counselors automatically.',
      entityNoun: 'Rule',
    }),
    [ruleTypeOptions, ruleTypesError],
  );

  const handlers: PolicyHandlers<AssignmentRule> = useMemo(
    () => ({
      onLoad: () => AssignmentRulesService.getAssignmentRules(institutionId),
      onSave: async (values, editing) => {
        const name = String(values.name ?? '').trim();
        if (!name) throw new Error('Rule name is required.');

        const priorityRaw = values.priority;
        const priority =
          typeof priorityRaw === 'string'
            ? parseInt(priorityRaw, 10)
            : Number(priorityRaw ?? 10);
        if (!Number.isInteger(priority) || priority < 1) {
          throw new Error('Priority must be a whole number 1 or greater.');
        }

        const description = String(values.description ?? '').trim() || undefined;
        const is_active = values.is_active === undefined ? true : Boolean(values.is_active);

        // Parse criteria JSON
        const criteriaText = String(values.criteria_json ?? '[]').trim() || '[]';
        let criteria: AssignmentCriterion[];
        try {
          const parsed = JSON.parse(criteriaText);
          if (!Array.isArray(parsed)) {
            throw new Error('Match conditions must be a JSON array.');
          }
          criteria = parsed as AssignmentCriterion[];
        } catch (err) {
          throw new Error(
            `Match conditions: ${err instanceof Error ? err.message : 'invalid JSON'}.`,
          );
        }

        // Parse action JSON
        const actionText = String(values.action_json ?? '').trim();
        if (!actionText) {
          throw new Error('Action when matched is required.');
        }
        let action: AssignmentAction;
        try {
          const parsed = JSON.parse(actionText);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Action must be a JSON object.');
          }
          action = parsed as AssignmentAction;
        } catch (err) {
          throw new Error(
            `Action when matched: ${err instanceof Error ? err.message : 'invalid JSON'}.`,
          );
        }

        if (editing) {
          return AssignmentRulesService.updateAssignmentRule(editing.id, {
            name,
            description,
            priority,
            is_active,
            criteria,
            action,
          });
        }

        if (!institutionId) {
          throw new Error(
            'Pick an institution before creating a rule. Use the institution picker above.',
          );
        }

        return AssignmentRulesService.createAssignmentRule({
          institution_id: institutionId,
          name,
          description,
          priority,
          is_active,
          criteria,
          action,
        });
      },
      onDelete: (row) => AssignmentRulesService.deleteAssignmentRule(row.id),
      onToggle: async (row, _field, next) => {
        await AssignmentRulesService.toggleRuleStatus(row.id, next);
      },
    }),
    [institutionId],
  );

  // Map a row to form values when editing. JSON fields stringify back so the
  // textarea shows formatted JSON the admin can edit.
  const rowToFormValues = (row: AssignmentRule): Record<string, unknown> => ({
    name: row.name,
    description: row.description ?? '',
    priority: row.priority,
    type: row.type ?? 'round_robin',
    is_active: row.is_active,
    criteria_json: JSON.stringify(row.criteria ?? [], null, 2),
    action_json: JSON.stringify(row.action ?? {}, null, 2),
  });

  const newRowDefaults: Record<string, unknown> = {
    name: '',
    description: '',
    priority: 10,
    type: 'round_robin',
    is_active: true,
    criteria_json: '[]',
    action_json: JSON.stringify({ type: 'round_robin', fallback: 'unassigned' }, null, 2),
  };

  // Hide the "+ New Rule" button when no institution is scoped — matches the
  // legacy AssignmentRulesDataTable behavior (settings page super_admin sees
  // empty institutionId; team page does NOT enter this state because its
  // picker default-resolves to the first accessible institution before mount
  // completes). Avoids a UX dead-end where clicking Add would only error.
  const hideAddButton = !institutionId;

  return (
    <CascadeStepList
      config={config}
      handlers={handlers}
      newRowDefaults={newRowDefaults}
      rowToFormValues={rowToFormValues}
      hideAddButton={hideAddButton}
    />
  );
}

// Backward-compat alias so existing imports don't break during the transition.
// The old export was `AssignmentRulesDataTable`. Keep it pointing at the new
// cascade so consumer pages can keep importing the same name; we'll rename
// the consumers in the same PR for clarity, but this safety net prevents any
// late-discovery import from breaking.
export const AssignmentRulesDataTable = AssignmentRulesCascade;
