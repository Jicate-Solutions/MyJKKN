// ============================================================================
// Policy Shell Types — schema definitions for Director-grade config UIs.
// Created: 2026-05-07. See docs/architecture/policy-page-pattern.md.
//
// Three shapes covered:
//   A. CascadeConfig  — ordered, scope-precedence (tier-policy, rule-types)
//   B. SettingsConfig — unordered key-value (routing-config, alert-thresholds)
//   C. LookupConfig   — FROM→TO mapping (landing-pages, nav-config)
//
// Pages declare a config object of one of these shapes; the corresponding
// primitive renders Director-grade UX automatically. Field-level metadata
// (englishLabel, englishHint, consequenceText) lives in the schema, not in
// the JSX, so labels stay consistent across table, form, and any future
// audit log surface.
// ============================================================================

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Field schema (used by PolicyFormShell across all 3 shapes)
// ---------------------------------------------------------------------------

/** Field input kinds the form shell knows how to render. */
export type FieldKind =
  | 'text'
  | 'number'
  | 'textarea'
  | 'toggle'
  | 'enum'
  | 'enum-with-hint'
  | 'scope-with-institution'
  | 'url';

/** One option in an enum / enum-with-hint field. */
export interface EnumOption {
  value: string;
  /** Plain English label shown to Director. */
  label: string;
  /** Optional one-line hint shown below the label or in description text. */
  hint?: string;
}

/** Generic field schema. The form shell renders a field per entry. */
export interface FieldSchema {
  /** DB column / payload key the form binds to. */
  name: string;
  /** Plain English label shown above the input. NEVER the raw column name. */
  englishLabel: string;
  /** Optional plain English hint shown below the input ("If you change this..."). */
  englishHint?: string;
  /** Optional consequence text, surfaces what happens when the value changes. */
  consequenceText?: string;
  kind: FieldKind;
  /** For number fields. */
  min?: number;
  max?: number;
  step?: number;
  /** For enum / enum-with-hint fields. */
  options?: ReadonlyArray<EnumOption>;
  /** Conditional visibility — receives current form values, returns true to show. */
  visibleWhen?: (values: Record<string, unknown>) => boolean;
  /** For scope-with-institution: institution dropdown source. Provided at render time. */
  institutionsKey?: 'institutions';
  /** Whether the field is required at submit. */
  required?: boolean;
  /** Optional placeholder. */
  placeholder?: string;
  /**
   * Optional disabled flag. Pages compute this dynamically when building the
   * schema for a particular form-open (e.g. "rule_type_key disabled when
   * editing a system row"). The shell respects it but doesn't compute it.
   */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Shape A — CascadeConfig (ordered, scope-precedence)
// ---------------------------------------------------------------------------

/** What gets rendered inside a single step card in the cascade view. */
export interface CascadeStepView {
  /** "Step 1: Match by college AND lead source" */
  title: string;
  /** Multi-line plain English explanation of what this step does. */
  explanation: string;
  /** Inline meta lines shown below the explanation ("Applies to all colleges", "Only counselors clocked in today"). */
  metaLines: string[];
  isActive: boolean;
  /** Optional inline note (the row's description, if any). */
  note?: string | null;
}

/**
 * Configuration for a Shape-A page (cascade of ordered steps with scope precedence).
 * Generic over the row type so callers get type-safe renderStep / handlers.
 */
export interface CascadeConfig<TRow> {
  /** Page header title shown to Director. */
  title: string;
  /** Plain English explainer rendered above the cascade. */
  explainer: ReactNode;
  /** Field on the row that determines step ORDER (e.g. 'tier_order', 'sort_order'). */
  orderBy: keyof TRow;
  /**
   * Field on the row that determines GROUPING (e.g. 'scope_type'). When two rows share
   * the same group value, they appear in the same cascade block. Set to null to render
   * everything as one flat cascade.
   */
  groupBy: keyof TRow | null;
  /**
   * Returns the section title for a group (e.g. "Default rules — applies to all colleges").
   * Receives the group value and the rows in that group.
   */
  groupTitleFor: (groupValue: unknown, rows: TRow[]) => string;
  /** Per-row map to the step card view. */
  renderStep: (row: TRow) => CascadeStepView;
  /**
   * Form schema used by the create/edit dialog. Receives the row being edited
   * (null when creating) so pages can compute disabled/visibility flags
   * dynamically (e.g. "lock the key field when editing a system row").
   */
  formSchema: (editingRow: TRow | null) => ReadonlyArray<FieldSchema>;
  /** Plain English label for the "add new" button. */
  addLabel: string;
  /** Plain English message shown when no rows exist. */
  emptyMessage: string;
  /** Plain English label used in delete confirmation: "Remove this {entityNoun}?" */
  entityNoun: string;
}

// ---------------------------------------------------------------------------
// Shape B — SettingsConfig (unordered key-value)
// ---------------------------------------------------------------------------

/** One settings row in a Shape-B page. */
export interface SettingsField {
  /** DB key / payload key. */
  dbKey: string;
  /** Plain English label. */
  label: string;
  /** Plain English explanation of WHAT this setting does. */
  explanation: string;
  /** Plain English consequence text — what happens when this value changes. */
  consequenceText: string;
  /** Input kind (subset of FieldKind for settings panels). */
  input:
    | { type: 'number'; min?: number; max?: number; step?: number; unit?: string }
    | { type: 'text'; placeholder?: string }
    | { type: 'toggle' }
    | { type: 'enum'; options: ReadonlyArray<EnumOption> };
  /** Optional grouping for visually clustering related settings. */
  group?: string;
}

export interface SettingsConfig {
  /** Page header title. */
  title: string;
  /** Plain English explainer rendered above the panel. */
  explainer: ReactNode;
  /** Settings rendered top-to-bottom. */
  fields: ReadonlyArray<SettingsField>;
  /** Save button label (default: "Save changes"). */
  saveLabel?: string;
}

// ---------------------------------------------------------------------------
// Shape C — LookupConfig (FROM → TO mapping)
// ---------------------------------------------------------------------------

/** Column descriptor for a lookup table. */
export interface LookupColumn<TRow> {
  /** Plain English column header. */
  header: string;
  /** Cell value derived from the row. Returns ReactNode so cells can be styled. */
  cell: (row: TRow) => ReactNode;
  /** Optional column width hint (Tailwind class, e.g. "w-40"). */
  widthClass?: string;
}

export interface LookupConfig<TRow> {
  /** Page header title. */
  title: string;
  /** Plain English explainer rendered above the table. */
  explainer: ReactNode;
  /** Columns rendered left-to-right. */
  columns: ReadonlyArray<LookupColumn<TRow>>;
  /**
   * Per-row plain English consequence hint shown below the row in compact text
   * (e.g. "Leads landing on this URL go to the institution dashboard."). Optional —
   * pages without per-row consequences can omit this.
   */
  rowHint?: (row: TRow) => string | null;
  /**
   * Form schema used by create/edit dialog (pages that support editing).
   * Receives the row being edited (null when creating) so pages can compute
   * disabled/visibility flags dynamically.
   */
  formSchema?: (editingRow: TRow | null) => ReadonlyArray<FieldSchema>;
  /** "Add new" button label. */
  addLabel?: string;
  /** Empty state message. */
  emptyMessage: string;
  /** Entity noun for delete confirmation. */
  entityNoun: string;
  /**
   * Per-row protection predicate. Returns null if the row IS deletable, or a
   * plain-English tooltip string explaining why it CANNOT be deleted (e.g.
   * "System type — deactivate instead of delete."). The shell renders a
   * disabled trash button with the tooltip in that case.
   */
  canDelete?: (row: TRow) => string | null;
  /** Optional dialog body text shown when confirming a delete. Receives the row. */
  deleteConfirmText?: (row: TRow) => string;
}

// ---------------------------------------------------------------------------
// Shared handler types
// ---------------------------------------------------------------------------

/** Handler for create/edit/delete/toggle. Pages plug their service calls in here. */
export interface PolicyHandlers<TRow> {
  /** Returns updated row list. Called after successful mutate. */
  onLoad: () => Promise<TRow[]>;
  /** Save (create or update). Receives the form values; returns the saved row. */
  onSave: (values: Record<string, unknown>, editingRow: TRow | null) => Promise<TRow>;
  /** Delete a row. */
  onDelete?: (row: TRow) => Promise<void>;
  /** Toggle a boolean field on a row (active/enabled). */
  onToggle?: (row: TRow, fieldName: keyof TRow, next: boolean) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Permission gate
// ---------------------------------------------------------------------------

/** Which permission level can edit this policy page. */
export type PolicyPermission = 'super_admin' | 'admin_or_super_admin';
