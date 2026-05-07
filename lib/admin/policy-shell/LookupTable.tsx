'use client';

// ============================================================================
// LookupTable — Shape C primitive (FROM → TO mapping).
// Created: 2026-05-07.
//
// For pages that map a key/identifier to a target value. Examples:
//   - landing-pages: nav module key → URL
//   - nav-config: route path → display order/icon
//   - retention-policies: table → days-to-retain
//   - dashboard-drilldowns: dashboard card → drill-down URL
//
// Pages declare a LookupConfig<TRow> with English column headers + per-row
// consequence hint text. The shell renders the table + form dialog.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { PolicyFormShell } from './PolicyFormShell';
import type { LookupConfig, PolicyHandlers } from './types';

interface LookupTableProps<TRow extends { id: string }> {
  config: LookupConfig<TRow>;
  handlers: PolicyHandlers<TRow>;
  /** Optional institutions list, passed to the form shell. */
  institutions?: ReadonlyArray<{ id: string; name: string }>;
  /** Initial values used when "Add" is clicked. */
  newRowDefaults?: Record<string, unknown>;
  /** Map a row to form values for editing. Default: copy own enumerable props. */
  rowToFormValues?: (row: TRow) => Record<string, unknown>;
  /** When true, hides the "Add" button (read-mostly tables). */
  readOnly?: boolean;
}

export function LookupTable<TRow extends { id: string }>({
  config,
  handlers,
  institutions,
  newRowDefaults,
  rowToFormValues,
  readOnly,
}: LookupTableProps<TRow>) {
  const [rows, setRows] = useState<TRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<TRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await handlers.onLoad();
      setRows(fresh);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load';
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [handlers]);

  useEffect(() => {
    load();
  }, [load]);

  const handleNew = () => {
    setEditingRow(null);
    setFormOpen(true);
  };

  const handleEdit = (row: TRow) => {
    setEditingRow(row);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingRow || !handlers.onDelete) return;
    try {
      await handlers.onDelete(deletingRow);
      toast.success(`${config.entityNoun} removed`);
      setDeletingRow(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete';
      toast.error(msg);
    }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    await handlers.onSave(values, editingRow);
    toast.success(editingRow ? `${config.entityNoun} updated` : `${config.entityNoun} added`);
    setFormOpen(false);
    setEditingRow(null);
    await load();
  };

  const initialValues: Record<string, unknown> = editingRow
    ? rowToFormValues
      ? rowToFormValues(editingRow)
      : (editingRow as unknown as Record<string, unknown>)
    : (newRowDefaults ?? {});

  const canAdd = !readOnly && config.formSchema && handlers.onSave;
  const canEdit = !readOnly && config.formSchema && handlers.onSave;
  const canDelete = !readOnly && handlers.onDelete;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{config.entityNoun}s</h2>
          <p className="text-xs text-muted-foreground">
            {rows ? `${rows.length} configured` : '—'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canAdd && (
            <Button size="sm" onClick={handleNew} className="gap-2">
              <Plus className="h-4 w-4" />
              {config.addLabel ?? `Add ${config.entityNoun.toLowerCase()}`}
            </Button>
          )}
        </div>
      </div>

      {loading || rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          {config.emptyMessage}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {config.columns.map((col, i) => (
                  <TableHead key={i} className={col.widthClass}>
                    {col.header}
                  </TableHead>
                ))}
                {(canEdit || canDelete) && (
                  <TableHead className="w-24 text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const hint = config.rowHint ? config.rowHint(row) : null;
                return (
                  <RowGroup key={row.id}>
                    <TableRow>
                      {config.columns.map((col, i) => (
                        <TableCell key={i}>{col.cell(row)}</TableCell>
                      ))}
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEdit(row)}
                                aria-label="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <DeleteButton
                                row={row}
                                canDelete={config.canDelete}
                                onClick={() => setDeletingRow(row)}
                              />
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {hint && (
                      <TableRow>
                        <TableCell
                          colSpan={config.columns.length + (canEdit || canDelete ? 1 : 0)}
                          className="bg-muted/20 py-2 text-xs italic text-muted-foreground"
                        >
                          {hint}
                        </TableCell>
                      </TableRow>
                    )}
                  </RowGroup>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {config.formSchema && (
        <PolicyFormShell
          open={formOpen}
          onOpenChange={(v) => {
            setFormOpen(v);
            if (!v) setEditingRow(null);
          }}
          title={editingRow ? `Edit ${config.entityNoun}` : `Add ${config.entityNoun}`}
          fields={config.formSchema(editingRow)}
          initialValues={initialValues}
          institutions={institutions}
          saveLabel={editingRow ? 'Save changes' : `Add ${config.entityNoun.toLowerCase()}`}
          onSubmit={handleSubmit}
        />
      )}

      <AlertDialog
        open={!!deletingRow}
        onOpenChange={(open) => {
          if (!open) setDeletingRow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this {config.entityNoun.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRow && config.deleteConfirmText
                ? config.deleteConfirmText(deletingRow)
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// DeleteButton — respects per-row canDelete predicate. When the predicate
// returns a string, renders disabled with that tooltip; otherwise renders
// the normal trash button.
// ----------------------------------------------------------------------------
interface DeleteButtonProps<TRow> {
  row: TRow;
  canDelete?: (row: TRow) => string | null;
  onClick: () => void;
}

function DeleteButton<TRow>({ row, canDelete, onClick }: DeleteButtonProps<TRow>) {
  const protectionMessage = canDelete ? canDelete(row) : null;

  if (protectionMessage) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                size="icon"
                variant="ghost"
                disabled
                aria-label={protectionMessage}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{protectionMessage}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button size="icon" variant="ghost" onClick={onClick} aria-label="Remove">
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

/**
 * Helper wrapper so we can render two `<TableRow>` per logical row (the data row
 * + the optional hint row underneath) without breaking React keying. React expects
 * a single key per element; <Fragment key=...> here is intentional.
 */
function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
