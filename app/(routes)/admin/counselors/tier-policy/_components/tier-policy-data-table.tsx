'use client';

// ============================================================================
// Tier Policy Data Table — admin CRUD for counselor_tier_policy table.
// Created: 2026-05-06.
// Lean by design: list + create + edit + toggle-active + delete. No bulk ops,
// no inline reorder (tier_order is part of the unique key — change via edit).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  TierPolicyService,
  type CounselorTierPolicy,
} from '@/lib/services/admission/tier-policy-service';

import { TierPolicyFormDialog } from './tier-policy-form-dialog';

export function TierPolicyDataTable() {
  const [policies, setPolicies] = useState<CounselorTierPolicy[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] =
    useState<CounselorTierPolicy | null>(null);
  const [deletingPolicy, setDeletingPolicy] =
    useState<CounselorTierPolicy | null>(null);
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
      const rows = await TierPolicyService.getTierPolicies();
      setPolicies(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load policies';
      toast.error(msg);
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleActive = async (
    policy: CounselorTierPolicy,
    next: boolean,
  ) => {
    setTogglingId(policy.id);
    try {
      await TierPolicyService.toggleActive(policy.id, next);
      toast.success(`Tier ${policy.tier_order} ${next ? 'enabled' : 'disabled'}`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Toggle failed';
      toast.error(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingPolicy) return;
    try {
      await TierPolicyService.deleteTierPolicy(deletingPolicy.id);
      toast.success('Tier policy deleted');
      setDeletingPolicy(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      toast.error(msg);
    }
  };

  const handleNew = () => {
    setEditingPolicy(null);
    setFormOpen(true);
  };

  const handleEdit = (policy: CounselorTierPolicy) => {
    setEditingPolicy(policy);
    setFormOpen(true);
  };

  const handleFormSaved = async () => {
    setFormOpen(false);
    setEditingPolicy(null);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Tier ordering drives fn_auto_assign_counselor_v2&apos;s fallback chain.
        Global rows form the platform default; institution rows override per
        institution. Director&apos;s standing rule (2026-04-29): policy
        decisions live as config rows, not code constants.
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Tier Rules</h2>
          <p className="text-xs text-muted-foreground">
            {policies ? `${policies.length} row${policies.length === 1 ? '' : 's'}` : '—'}
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
            New Tier Rule
          </Button>
        </div>
      </div>

      {loading || policies === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No tier policies yet. Run the migration{' '}
          <code className="rounded bg-muted px-1">
            20260510200001_create_counselor_tier_policy.sql
          </code>{' '}
          to seed the 4 global defaults, or click &ldquo;New Tier Rule&rdquo; to
          create one manually.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Order</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead className="w-28">On Duty?</TableHead>
                <TableHead className="w-24">Active</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">{p.tier_order}</TableCell>
                  <TableCell>
                    <Badge variant={p.scope_type === 'global' ? 'default' : 'secondary'}>
                      {p.scope_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.institution_id
                      ? institutionNameById[p.institution_id] ?? (
                          <span className="text-muted-foreground font-mono text-xs">
                            {p.institution_id.slice(0, 8)}…
                          </span>
                        )
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span title={p.description ?? ''}>
                      {TierPolicyService.formatTierStrategy(p.tier_strategy)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.on_duty_required ? (
                      <Badge variant="outline">Required</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={p.is_active}
                      disabled={togglingId === p.id}
                      onCheckedChange={(v) => handleToggleActive(p, v)}
                      aria-label={`Toggle tier ${p.tier_order} active`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(p)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeletingPolicy(p)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TierPolicyFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingPolicy(null);
        }}
        policy={editingPolicy}
        institutions={institutions}
        onSaved={handleFormSaved}
      />

      <AlertDialog
        open={!!deletingPolicy}
        onOpenChange={(open) => {
          if (!open) setDeletingPolicy(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tier policy?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPolicy && (
                <>
                  Removes tier {deletingPolicy.tier_order} ({deletingPolicy.scope_type}
                  {deletingPolicy.institution_id ? ` / ${institutionNameById[deletingPolicy.institution_id] ?? deletingPolicy.institution_id}` : ''}).
                  This frees up the (scope, institution, tier_order) slot.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
