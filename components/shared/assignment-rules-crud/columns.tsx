// ============================================================================
// columns.tsx — backward-compat shim.
//
// The TanStack-table column definitions previously lived here (~190 LOC).
// They were removed as part of the 2026-05-08 policy-shell refactor that
// migrated assignment-rules to the CascadeStepList substrate.
//
// This file is preserved as a thin re-export of `getRuleTypeIcon` because
// /admin/counselors/rule-types/page.tsx (PR #757) imports the icon helper
// directly from this path. New code should import from the package barrel
// (`@/components/shared/assignment-rules-crud`) instead of this file.
// ============================================================================

export { getRuleTypeIcon } from './icon';
