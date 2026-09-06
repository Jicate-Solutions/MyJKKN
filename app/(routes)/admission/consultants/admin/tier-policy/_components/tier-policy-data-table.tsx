'use client';

// ============================================================================
// Consultant Tier Policy Data Table — Director-facing tier ladder editor.
// Created: 2026-05-13.
//
// Renders consultant_tier_policy rows as a sortable table grouped by scope
// (global rules first, then per-institution overrides). Super-admin only
// (page-level guard already enforces this; RLS double-checks at the DB).
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
  listTiers,
  deleteTier,
  upsertTier,
  type ConsultantTierPolicyRow,
} from '@/lib/services/admission/consultant-tier-policy-service';

import { EditTierDialog } from './edit-tier-dialog';

export function TierPolicyDataTable() {
  const [rows, setRows] = useState<ConsultantTierPolicyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ConsultantTierPolicyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ConsultantTierPolicyRow | null>(null);
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
      const data = await listTiers();
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

  // Sort: global rows first (by display_order), then institution overrides
  // (grouped by institution_id, then display_order).
  const sorted = useMemo(() => {
    if (!rows) return null;
    return [...rows].sort((a, b) => {
      if (a.scope_type !== b.scope_type) {
        return a.scope_type === 'global' ? -1 : 1;
      }
      if (a.scope_id !== b.scope_id) {
        return (a.scope_id ?? '').localeCompare(b.scope_id ?? '');
      }
      return a.display_order - b.display_order;
    });
  }, [rows]);

  const handleToggleActive = async (row: ConsultantTierPolicyRow) => {
    setTogglingId(row.id);
    try {
      await upsertTier(
        { id: row.id, is_active: !row.is_active },
        // updated_by is set server-side by RLS-checked auth.uid() context; the
        // service layer needs a string but RLS will overwrite it with the real
        // auth user. We pass the existing updated_by or 'system' as a placeholder.
        row.updated_by ?? 'system',
      );
      toast.success(`Tier ${row.tier_name} ${row.is_active ? 'deactivated' : 'activated'}`);
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
      await deleteTier(deleting.id);
      toast.success(`Tier ${deleting.tier_name} removed`);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div>
          <h2 className="text-lg font-semibold">Tier Ladder</h2>
          <p className="text-xs text-muted-foreground">
            {sorted
              ? `${sorted.length} tier${sorted.length === 1 ? '' : 's'} configured`
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
                <TableHead className="text-right">Min Conv.</TableHead>
                <TableHead className="text-right">Max Conv.</TableHead>
                <TableHead>Next Tier</TableHead>
                <TableHead>Badge</TableHead>
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
                  <TableCell className="font-medium capitalize">
                    {row.tier_name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.scope_type === 'global'
                      ? 'All colleges'
                      : `Override: ${
                          row.scope_id
                            ? institutionNameById[row.scope_id] ?? 'Unknown college'
                            : 'Unknown'
                        }`}
                  </TableCell>
                  <TableCell className="text-center">{row.display_order}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.min_conversions}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.max_conversions ?? '∞'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground capitalize">
                    {row.next_tier ?? <span className="italic">terminal</span>}
                  </TableCell>
                  <TableCell>
                    {row.badge_color ? (
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-4 w-4 rounded border border-border"
                          style={{ backgroundColor: row.badge_color }}
                        />
                        <code className="text-xs text-muted-foreground">
                          {row.badge_color}
                        </code>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
                          aria-label={`Actions for tier ${row.tier_name}`}
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
            <AlertDialogTitle>Remove this tier?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  This will permanently remove the{' '}
                  <strong className="capitalize">{deleting.tier_name}</strong>{' '}
                  tier
                  {deleting.scope_type === 'institution' && deleting.scope_id
                    ? ` override for ${
                        institutionNameById[deleting.scope_id] ?? 'this college'
                      }`
                    : ' from the global ladder'}
                  . Consultants currently in this tier will resolve to the nearest
                  remaining tier on their next read.
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
