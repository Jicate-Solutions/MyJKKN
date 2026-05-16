// ============================================================================
// Policy Shell — Director-grade config UI substrate.
// Created: 2026-05-07. See docs/architecture/policy-page-pattern.md.
//
// Three primitives covering the three shapes config pages cluster into:
//   - CascadeStepList (Shape A: ordered, scope-precedence)
//   - SettingsPanel   (Shape B: unordered key-value)
//   - LookupTable     (Shape C: FROM → TO mapping)
//
// All three compose inside PolicyPageShell (provides super_admin gate +
// ContentLayout + plain-English explainer banner). Form dialogs render via
// the schema-driven PolicyFormShell.
// ============================================================================

export { PolicyPageShell } from './PolicyPageShell';
export { PolicyFormShell } from './PolicyFormShell';
export { CascadeStepList } from './CascadeStepList';
export { SettingsPanel } from './SettingsPanel';
export { LookupTable } from './LookupTable';

export type {
  // Field schema
  FieldKind,
  FieldSchema,
  EnumOption,
  // Shape A
  CascadeConfig,
  CascadeStepView,
  // Shape B
  SettingsConfig,
  SettingsField,
  // Shape C
  LookupConfig,
  LookupColumn,
  // Shared
  PolicyHandlers,
  PolicyPermission,
} from './types';
