// Shared types for the generic Settings-CRUD pattern (master data tables).
//
// What this is for: modules that ship a /settings/<thing>/ page where admins
// manage a value-list (leave types, lead sources, solution types, hostel leave
// types, etc.). Those pages share ~90% of their data-table + row-actions UI
// — only columns, form schema, and entity type differ.
//
// What this is NOT for:
// - Domain-heavy pages with workflows, multi-step dialogs, or non-standard
//   mutations. Copy-paste is still right for those.
// - Lists that don't need bulk delete / row actions / CRUD semantics.
//
// See components/shared/crud-master/SHARED-CRUD-README.md for decision rubric.

import type { ComponentType } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

/**
 * Minimal shape every CRUD-master entity must satisfy.
 * Consumers extend this with their own fields.
 */
export interface CrudEntity {
  id: string;
  is_system?: boolean;
}

/**
 * Result shape for bulk operations — mirrors the academic/HR pattern.
 */
export interface BulkDeleteResult {
  success: string[];
  failed: { id: string; error: string }[];
}

/**
 * Props for the generic CRUD data-table.
 * The table is "dumb" — all data + operations come from the consumer's hook.
 */
export interface CrudDataTableProps<T extends CrudEntity> {
  /** Rows to render. */
  items: T[];
  /** Show skeleton rows while this is true. */
  loading: boolean;
  /** Error message to surface. null when healthy. */
  error: string | null;
  /** Called by Refresh button + Retry-on-error button. */
  onRefresh: () => void | Promise<void>;
  /** Bulk delete operation. Consumer shows toasts on success/failure from result. */
  onBulkDelete: (ids: string[]) => Promise<BulkDeleteResult>;
  /** Column defs. Consumer owns columns because each module's columns differ. */
  columns: ColumnDef<T>[];
  /** Singular label for dialogs ("leave type"). */
  entityLabel: string;
  /** Plural label for dialogs ("leave types"). Defaults to entityLabel + 's'. */
  entityLabelPlural?: string;
  /** Shown when items.length === 0 && !loading. */
  emptyMessage?: string;
  /** Optional: customize row selection ID extraction (default: row.id). */
  getRowId?: (row: T) => string;
}

/**
 * Props for the generic CRUD row-actions dropdown.
 */
export interface CrudRowActionsProps<T extends CrudEntity> {
  /** The entity this row represents. */
  entity: T;
  /** Singular label for dialogs ("leave type"). */
  entityLabel: string;
  /** How to refer to this specific entity in dialogs (e.g. (e) => e.leave_type_name). */
  entityDisplayName: (entity: T) => string;
  /** Delete operation. Consumer wires error handling + toast. */
  onDelete: (id: string) => Promise<void>;
  /** Edit dialog component. Rendered internally when user clicks Edit. */
  EditDialog: ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'edit';
    entity: T;
  }>;
  /**
   * Optional: custom renderer for the View Details dialog body.
   * If omitted, a generic "View dialog has no content beyond the name" placeholder
   * is shown — consumer should provide this for any real use.
   */
  ViewDetailsRenderer?: ComponentType<{ entity: T }>;
  /**
   * Optional: blocks Delete action when returns false (e.g. for is_system rows).
   * Default: (e) => !e.is_system — system rows can't be deleted.
   */
  canDelete?: (entity: T) => boolean;
  /**
   * Optional: text shown in delete confirmation body.
   * Default: 'Existing records referencing this <entityLabel> will not be affected.'
   */
  deleteImpactHint?: string;
}
