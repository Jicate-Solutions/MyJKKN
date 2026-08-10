'use client';

// ============================================================================
// Premium Room — Tier Policy Data Table (Director-facing)
// ============================================================================
// Created: 2026-05-16
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html
//
// Renders hostel_tier_policy rows sorted by sort_order. Global rows first,
// then per-institution overrides. Super-admin / admin write; chief_warden
// write via campus_living.premium.configure_tier (RLS gates).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  listHostelTiers,
  upsertHostelTier,
  deleteHostelTier,
} from '@/lib/services/campus-living/hostel-tier-service';
import type { HostelTierPolicy } from '@/types/campus-living/premium';

import { EditTierDialog } from './edit-tier-dialog';

export function TierPolicyDataTable() {
  const [rows, setRows] = useState<HostelTierPolicy[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<HostelTierPolicy | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<HostelTierPolicy | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { institutions } = useInstitutionsWithAccess();

  const institutionNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const inst of institutions) map[inst.id] = inst.name;
    return map;
  }, [institutions]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listHostelTiers(null);
      setRows(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tier policy';
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Sort: global rows first, then per-institution, both by sort_order.
  const sorted = useMemo(() => {
    if (!rows) return null;
    return [...rows].sort((a, b) => {
      const aGlobal = a.institution_id === null;
      const bGlobal = b.institution_id === null;
      if (aGlobal !== bGlobal) return aGlobal ? -1 : 1;
      if (a.institution_id !== b.institution_id) {
        return (a.institution_id ?? '').localeCompare(b.institution_id ?? '');
      }
      return a.sort_order - b.sort_order;
    });
  }, [rows]);

  const handleToggleActive = async (row: HostelTierPolicy) => {
    setTogglingId(row.id);
    try {
      await upsertHostelTier(
        { id: row.id, is_active: !row.is_active },
        // RLS overwrites updated_by with auth.uid() — placeholder.
        row.updated_by ?? 'system',
      );
      toast.success(`Tier "${row.tier_display_name}" ${row.is_active ? 'deactivated' : 'activated'}`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update tier';
      toast.error(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteHostelTier(deleting.id);
      toast.success(`Tier "${deleting.tier_display_name}" removed`);
      setDeleting(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete tier';
      toast.error(msg);
    }
  };

  const handleEditSaved = async () => {
    setEditing(null);
    setCreating(false);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tier Ladder</h2>
          <p className="text-xs text-muted-foreground">
            {sorted
              ? `${sorted.length} tier row${sorted.length === 1 ? '' : 's'} configured`
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
          <Button size="sm" onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Tier
          </Button>
        </div>
      </div>

      {loading || sorted === null ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm font-medium">No tier rows yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click <strong>Add Tier</strong> to create your first tier row.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-center">Order</TableHead>
                <TableHead className="text-right">Default Uplift %</TableHead>
                <TableHead>Feature Bundle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.is_active ? '' : 'opacity-60'}
                >
                  <TableCell>
                    <div className="font-medium">{row.tier_display_name}</div>
                    <code className="text-xs text-muted-foreground">{row.tier_key}</code>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.institution_id === null
                      ? 'All colleges (default)'
                      : `Override: ${
                          institutionNameById[row.institution_id] ?? 'Unknown college'
                        }`}
                  </TableCell>
                  <TableCell className="text-center">{row.sort_order}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(row.fee_uplift_percentage_default).toFixed(2)}%
                  </TableCell>
                  <TableCell>
                    {row.tier_features.length === 0 ? (
                      <span className="text-xs text-muted-foreground">no features</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.tier_features.map((f) => (
                          <Badge key={f} variant="outline" className="font-normal">
                            {humanFeatureLabel(f)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.is_active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Actions for tier ${row.tier_display_name}`}
                          disabled={togglingId === row.id}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(row)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleActive(row)}>
                          {row.is_active ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleting(row)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EditTierDialog
        open={creating || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreating(false);
          }
        }}
        row={editing}
        institutions={institutions}
        onSaved={handleEditSaved}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this tier row?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  This will permanently remove the{' '}
                  <strong>{deleting.tier_display_name}</strong> tier
                  {deleting.institution_id
                    ? ` override for ${
                        institutionNameById[deleting.institution_id] ?? 'this college'
                      }`
                    : ' from the global ladder'}
                  . Existing allocations linked to this tier_id will keep
                  working (FK is ON DELETE RESTRICT), so removing a tier with
                  active allocations will fail at the database — vacate or
                  re-tier those allocations first.
                </>
              )}
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FEATURE_LABELS: Record<string, string> = {
  pick_block_and_room: 'Pick block + room',
  pick_specific_bed: 'Pick specific bed',
  pick_roommate_with_consent: 'Pick roommate (with consent)',
  extended_curfew_quota: 'Extended curfew quota',
  premium_maintenance_sla: 'Premium maintenance SLA',
};

function humanFeatureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key;
}
