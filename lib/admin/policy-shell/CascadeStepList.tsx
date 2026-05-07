'use client';

// ============================================================================
// CascadeStepList — Shape A primitive (ordered, scope-precedence).
// Created: 2026-05-07. Generalized from PR #748's tier-policy cascade.
//
// Renders a list of policy rows as numbered step cards stacked vertically with
// "↓ if no match" arrows between them. Optionally groups by scope (e.g., a
// "Default rules" block followed by per-college "Override" blocks). Each row
// gets a title, plain-English explanation, meta lines, and an active toggle
// + edit/delete affordances.
//
// Pages provide a CascadeConfig<TRow> declaratively; the rest is rendered.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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

import { PolicyFormShell } from './PolicyFormShell';
import type { CascadeConfig, PolicyHandlers } from './types';

interface CascadeStepListProps<TRow extends { id: string; is_active?: boolean }> {
  config: CascadeConfig<TRow>;
  handlers: PolicyHandlers<TRow>;
  /** Optional institutions list, passed to the form shell. */
  institutions?: ReadonlyArray<{ id: string; name: string }>;
  /** Initial values used when "Add" is clicked. Pages provide sensible defaults. */
  newRowDefaults: Record<string, unknown>;
  /** Map a row to form values for editing. Default: copy own enumerable props. */
  rowToFormValues?: (row: TRow) => Record<string, unknown>;
  /** Field name that determines is_active (toggle target). Default: 'is_active'. */
  activeFieldName?: keyof TRow;
}

export function CascadeStepList<
  TRow extends { id: string; is_active?: boolean },
>({
  config,
  handlers,
  institutions,
  newRowDefaults,
  rowToFormValues,
  activeFieldName,
}: CascadeStepListProps<TRow>) {
  const [rows, setRows] = useState<TRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<TRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  const sorted = useMemo(() => {
    if (!rows) return null;
    return [...rows].sort((a, b) => {
      const ao = Number(a[config.orderBy]);
      const bo = Number(b[config.orderBy]);
      return ao - bo;
    });
  }, [rows, config.orderBy]);

  const groups = useMemo(() => {
    if (!sorted) return null;
    if (!config.groupBy) {
      return [{ groupValue: null as unknown, rows: sorted }];
    }
    const map = new Map<unknown, TRow[]>();
    for (const r of sorted) {
      const key = r[config.groupBy];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([groupValue, gRows]) => ({
      groupValue,
      rows: gRows,
    }));
  }, [sorted, config.groupBy]);

  const handleToggle = async (row: TRow, next: boolean) => {
    if (!handlers.onToggle) return;
    const fieldName = (activeFieldName ?? 'is_active') as keyof TRow;
    setTogglingId(row.id);
    try {
      await handlers.onToggle(row, fieldName, next);
      toast.success(`${config.entityNoun} ${next ? 'turned on' : 'turned off'}`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update';
      toast.error(msg);
    } finally {
      setTogglingId(null);
    }
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

  const handleNew = () => {
    setEditingRow(null);
    setFormOpen(true);
  };

  const handleEdit = (row: TRow) => {
    setEditingRow(row);
    setFormOpen(true);
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
    : newRowDefaults;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{config.entityNoun}s</h2>
          <p className="text-xs text-muted-foreground">
            {sorted ? `${sorted.length} configured` : '—'}
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
          <Button size="sm" onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" />
            {config.addLabel}
          </Button>
        </div>
      </div>

      {loading || sorted === null ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          {config.emptyMessage}
        </div>
      ) : (
        <div className="space-y-8">
          {groups!.map((group, gIdx) => (
            <CascadeBlock
              key={String(group.groupValue ?? `group-${gIdx}`)}
              title={
                config.groupBy
                  ? config.groupTitleFor(group.groupValue, group.rows)
                  : ''
              }
              showTitle={Boolean(config.groupBy)}
              rows={group.rows}
              renderStep={config.renderStep}
              togglingId={togglingId}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={(row) => setDeletingRow(row)}
            />
          ))}
        </div>
      )}

      <PolicyFormShell
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingRow(null);
        }}
        title={editingRow ? `Edit ${config.entityNoun}` : `Add ${config.entityNoun}`}
        description={editingRow ? undefined : 'Lower-numbered steps are tried first. The first match wins.'}
        fields={config.formSchema(editingRow)}
        initialValues={initialValues}
        institutions={institutions}
        saveLabel={editingRow ? 'Save changes' : `Add ${config.entityNoun.toLowerCase()}`}
        onSubmit={handleSubmit}
      />

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
              The system will skip this when looking for a match.
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
// CascadeBlock — one labelled cascade block (e.g. "Default rules" or "Override
// for X College"). Renders step cards with arrows between.
// ----------------------------------------------------------------------------
interface CascadeBlockProps<TRow extends { id: string }> {
  title: string;
  showTitle: boolean;
  rows: TRow[];
  renderStep: (row: TRow) => import('./types').CascadeStepView;
  togglingId: string | null;
  onToggle: (row: TRow, next: boolean) => void;
  onEdit: (row: TRow) => void;
  onDelete: (row: TRow) => void;
}

function CascadeBlock<TRow extends { id: string }>({
  title,
  showTitle,
  rows,
  renderStep,
  togglingId,
  onToggle,
  onEdit,
  onDelete,
}: CascadeBlockProps<TRow>) {
  return (
    <div>
      {showTitle && (
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const view = renderStep(row);
          return (
            <div key={row.id}>
              <StepCard
                view={view}
                isToggling={togglingId === row.id}
                onToggle={(next) => onToggle(row, next)}
                onEdit={() => onEdit(row)}
                onDelete={() => onDelete(row)}
              />
              {idx < rows.length - 1 && (
                <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                  <ArrowDown className="mr-1 h-3 w-3" />
                  if no match
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// StepCard — single step rendering (number + title + explanation + meta + actions).
// ----------------------------------------------------------------------------
interface StepCardProps {
  view: import('./types').CascadeStepView;
  isToggling: boolean;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function StepCard({ view, isToggling, onToggle, onEdit, onDelete }: StepCardProps) {
  // Extract step number from "Step N: ..." pattern if present, else use bullet.
  const numberMatch = view.title.match(/^Step\s+(\d+)[:.]/i);
  const stepNumber = numberMatch ? numberMatch[1] : '•';

  return (
    <div
      className={`rounded-lg border p-4 transition-opacity ${
        view.isActive
          ? 'border-border bg-card'
          : 'border-dashed border-border bg-muted/30 opacity-60'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
          {stepNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-base font-semibold">{view.title}</h4>
                {!view.isActive && (
                  <Badge variant="outline" className="text-xs">
                    Turned off
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{view.explanation}</p>
              {view.metaLines.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {view.metaLines.map((line, i) => (
                    <span key={i}>
                      {i > 0 && <span className="mr-4">•</span>}
                      {line}
                    </span>
                  ))}
                </div>
              )}
              {view.note && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  Note: {view.note}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={view.isActive}
                  disabled={isToggling}
                  onCheckedChange={onToggle}
                  aria-label="Turn on or off"
                />
                <span className="text-xs text-muted-foreground">
                  {view.isActive ? 'On' : 'Off'}
                </span>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Remove">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
