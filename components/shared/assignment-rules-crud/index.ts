// ============================================================================
// components/shared/assignment-rules-crud — Director-grade UX for assignment
// rules, migrated to policy-shell substrate (PR #TBD, 2026-05-08).
//
// Was: 740 LOC across 5 files (data-table, rule-form-dialog, columns,
// row-actions, index) backed by TanStack data-table + bespoke JSON dialog.
//
// Now: declarative cascade.tsx + icon.tsx. The substrate (CascadeStepList,
// PolicyFormShell) handles rendering, form, toggle, delete confirm.
//
// Backward-compat exports:
//   - AssignmentRulesDataTable: aliased to AssignmentRulesCascade (same shape)
//   - getRuleTypeIcon: still exported (consumed by /admin/counselors/rule-types)
// ============================================================================

export {
  AssignmentRulesCascade,
  AssignmentRulesDataTable,
} from './cascade';
export { getRuleTypeIcon } from './icon';
