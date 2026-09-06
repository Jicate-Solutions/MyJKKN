'use client';

// ============================================================================
// Consultant Commission Trigger Config — Director-facing data table.
// Created: 2026-05-13.
//
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
//
// Renders every trigger row from consultant_commission_trigger_config with a
// big visible toggle for the master "Creates commission?" switch — the most
// load-bearing decision per row. Toggling an auto-trigger row to ON activates
// it in production, so the row card surfaces a clear warning before the
// switch flips.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, RefreshCw } from 'lucide-react';

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
import {
  listTriggerConfigs,
  setActive,
  setCreatesCommission,
  type ConsultantCommissionTriggerRow,
} from '@/lib/services/admission/consultant-commission-trigger-service';

import { EditTriggerDialog } from './edit-trigger-dialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSourceEntity(entity: string): string {
  switch (entity) {
    case 'admission_lead':
      return 'Lead';
    case 'learners_profile':
      return 'Learner';
    case 'manual':
      return 'Manual entry';
    default:
      return entity;
  }
}

function formatTransition(row: ConsultantCommissionTriggerRow): string {
  if (row.source_entity === 'manual') {
    return 'When staff manually creates a commission row';
  }
  const from = row.source_status_from ?? 'any prior status';
  return `When ${formatSourceEntity(row.source_entity).toLowerCase()} moves from ${from} → ${row.source_status_to}`;
}

function formatAutoApprove(row: ConsultantCommissionTriggerRow): string {
  if (row.auto_approve_below_amount === null) {
    return 'Always needs manual approval';
  }
  return `Auto-approve below ₹${row.auto_approve_below_amount.toLocaleString('en-IN')}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TriggerConfigDataTable() {
  const [rows, setRows] = useState<ConsultantCommissionTriggerRow[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] =
    useState<ConsultantCommissionTriggerRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmingToggle, setConfirmingToggle] = useState<{
    row: ConsultantCommissionTriggerRow;
    next: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTriggerConfigs();
      setRows(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load triggers';
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Director-facing sort: active first, then by source_entity, then trigger_key.
  const sortedRows = useMemo(() => {
    if (!rows) return null;
    return [...rows].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      if (a.source_entity !== b.source_entity)
        return a.source_entity.localeCompare(b.source_entity);
      return a.trigger_key.localeCompare(b.trigger_key);
    });
  }, [rows]);

  // Toggling creates_commission on an auto-trigger row activates production
  // behavior — confirm before flipping. The manual row is always allowed.
  const requestToggleCreates = (
    row: ConsultantCommissionTriggerRow,
    next: boolean,
  ) => {
    if (row.source_entity === 'manual' || !next) {
      // Manual row toggle OR turning OFF an auto-trigger: no confirm needed.
      void doToggleCreates(row, next);
      return;
    }
    setConfirmingToggle({ row, next });
  };

  const doToggleCreates = async (
    row: ConsultantCommissionTriggerRow,
    next: boolean,
  ) => {
    setTogglingId(row.id);
    try {
      await setCreatesCommission(row.id, next);
      toast.success(
        `${row.display_label} ${next ? 'will now auto-create commissions' : 'will no longer auto-create commissions'}`,
      );
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update';
      toast.error(msg);
    } finally {
      setTogglingId(null);
      setConfirmingToggle(null);
    }
  };

  const handleToggleActive = async (
    row: ConsultantCommissionTriggerRow,
    next: boolean,
  ) => {
    setTogglingId(row.id);
    try {
      await setActive(row.id, next);
      toast.success(`${row.display_label} ${next ? 'enabled' : 'disabled'}`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update';
      toast.error(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const handleNew = () => {
    setEditingRow(null);
    setFormOpen(true);
  };

  const handleEdit = (row: ConsultantCommissionTriggerRow) => {
    setEditingRow(row);
    setFormOpen(true);
  };

  const handleFormSaved = async () => {
    setFormOpen(false);
    setEditingRow(null);
    await load();
  };

  return (
    <div className="space-y-6">
      {/* Plain-English explainer at the top of the page. */}
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <h3 className="mb-2 text-sm font-semibold">
          How consultant commission triggers work
        </h3>
        <p className="text-sm text-muted-foreground">
          These rules govern <strong>when a commission row is created
          automatically</strong> for a consultant. Today, only the{' '}
          <strong>Manual entry</strong> row is on — that means a commission row
          is only recorded when staff explicitly creates one (no automatic
          trigger fires).
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Toggling an auto-trigger row{' '}
          <strong>&ldquo;Creates commission?&rdquo;</strong> to{' '}
          <strong>ON</strong> will cause a commission row to be created in
          production every time the matching status transition happens. Each
          row also controls the default TDS percentage, the auto-approve
          threshold below which commissions skip manual approval, and the
          clawback grace window.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div>
          <h2 className="text-lg font-semibold">Trigger Rules</h2>
          <p className="text-xs text-muted-foreground">
            {sortedRows
              ? `${sortedRows.length} rule${sortedRows.length === 1 ? '' : 's'} configured`
              : '—'}
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
            Add Trigger
          </Button>
        </div>
      </div>

      {loading || sortedRows === null ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm font-medium">No trigger rules configured</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click <strong>Add Trigger</strong> above to define when commissions
            are created.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedRows.map((row) => (
            <TriggerCard
              key={row.id}
              row={row}
              isToggling={togglingId === row.id}
              onToggleCreates={(next) => requestToggleCreates(row, next)}
              onToggleActive={(next) => handleToggleActive(row, next)}
              onEdit={() => handleEdit(row)}
            />
          ))}
        </div>
      )}

      <EditTriggerDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingRow(null);
        }}
        row={editingRow}
        onSaved={handleFormSaved}
      />

      <AlertDialog
        open={!!confirmingToggle}
        onOpenChange={(open) => {
          if (!open) setConfirmingToggle(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Turn ON auto-commission creation?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmingToggle && (
                <>
                  This will <strong>activate</strong> the{' '}
                  <strong>{confirmingToggle.row.display_label}</strong> trigger
                  in production. From now on, MyJKKN will automatically create
                  a consultant commission row every time{' '}
                  <em>{formatTransition(confirmingToggle.row).toLowerCase()}</em>.
                  Existing commission rows are not affected.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmingToggle) {
                  void doToggleCreates(
                    confirmingToggle.row,
                    confirmingToggle.next,
                  );
                }
              }}
            >
              Yes, turn it on
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TriggerCard — one row from consultant_commission_trigger_config.
// ---------------------------------------------------------------------------

interface TriggerCardProps {
  row: ConsultantCommissionTriggerRow;
  isToggling: boolean;
  onToggleCreates: (next: boolean) => void;
  onToggleActive: (next: boolean) => void;
  onEdit: () => void;
}

function TriggerCard({
  row,
  isToggling,
  onToggleCreates,
  onToggleActive,
  onEdit,
}: TriggerCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 transition-opacity ${
        row.is_active
          ? 'border-border bg-card'
          : 'border-dashed border-border bg-muted/30 opacity-60'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold">{row.display_label}</h4>
            <Badge variant="outline" className="text-xs">
              {formatSourceEntity(row.source_entity)}
            </Badge>
            {row.creates_commission ? (
              <Badge className="bg-emerald-600 text-xs text-white hover:bg-emerald-600">
                Auto-creates commissions
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Off — no auto-creation
              </Badge>
            )}
            {!row.is_active && (
              <Badge variant="outline" className="text-xs">
                Disabled
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatTransition(row)}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              TDS: <strong>{Number(row.tds_rate_percent).toFixed(2)}%</strong>
            </span>
            <span>•</span>
            <span>{formatAutoApprove(row)}</span>
            <span>•</span>
            <span>Clawback grace: {row.clawback_grace_days} days</span>
            <span>•</span>
            <span className="font-mono text-[10px]">{row.trigger_key}</span>
          </div>
          {row.notes && (
            <p className="mt-2 text-xs italic text-muted-foreground">
              Note: {row.notes}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Switch
              id={`creates-${row.id}`}
              checked={row.creates_commission}
              disabled={isToggling}
              onCheckedChange={onToggleCreates}
              aria-label={`Toggle creates commission for ${row.display_label}`}
            />
            <label
              htmlFor={`creates-${row.id}`}
              className="cursor-pointer text-xs text-muted-foreground"
            >
              {row.creates_commission ? 'Creates commission' : 'No-op'}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`active-${row.id}`}
              checked={row.is_active}
              disabled={isToggling}
              onCheckedChange={onToggleActive}
              aria-label={`Toggle enabled for ${row.display_label}`}
            />
            <label
              htmlFor={`active-${row.id}`}
              className="cursor-pointer text-xs text-muted-foreground"
            >
              {row.is_active ? 'Enabled' : 'Disabled'}
            </label>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onEdit}
            aria-label={`Edit ${row.display_label}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
