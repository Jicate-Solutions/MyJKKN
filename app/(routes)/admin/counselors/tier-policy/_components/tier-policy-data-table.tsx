'use client';

// ============================================================================
// Tier Policy Data Table — Director-facing cascade view.
// Created: 2026-05-06. Rewritten 2026-05-07 for plain-English UX (Director ask:
// "any tom dick and harry should be able to understand").
//
// Renders the tier policy as a vertical cascade of numbered steps with
// "↓ if no match" arrows between them — visually expressing the order in
// which the system tries to find a counselor for a new lead.
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
      const msg = err instanceof Error ? err.message : 'Failed to load rules';
      toast.error(msg);
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Director-facing sort: global rules first (in step order), then any
  // institution-specific overrides (also in step order).
  const sortedPolicies = useMemo(() => {
    if (!policies) return null;
    return [...policies].sort((a, b) => {
      if (a.scope_type !== b.scope_type) {
        return a.scope_type === 'global' ? -1 : 1;
      }
      return a.tier_order - b.tier_order;
    });
  }, [policies]);

  const handleToggleActive = async (
    policy: CounselorTierPolicy,
    next: boolean,
  ) => {
    setTogglingId(policy.id);
    try {
      await TierPolicyService.toggleActive(policy.id, next);
      toast.success(`Step ${policy.tier_order} ${next ? 'turned on' : 'turned off'}`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update';
      toast.error(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingPolicy) return;
    try {
      await TierPolicyService.deleteTierPolicy(deletingPolicy.id);
      toast.success('Step removed');
      setDeletingPolicy(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete';
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
    <div className="space-y-6">
      {/* Plain-English explainer — replaces engineering jargon banner. */}
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <h3 className="mb-2 text-sm font-semibold">How lead assignment works</h3>
        <p className="text-sm text-muted-foreground">
          When a new lead comes in, MyJKKN tries to assign a counselor in the
          order shown below. If <strong>Step 1</strong> finds no one, the
          system moves to <strong>Step 2</strong>, then <strong>Step 3</strong>,
          and so on. The first match wins.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Steps below the &ldquo;Applies to all colleges&rdquo; section are the
          default rules. You can also add college-specific overrides — these
          replace the default steps for that one college only.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Assignment Steps</h2>
          <p className="text-xs text-muted-foreground">
            {sortedPolicies
              ? `${sortedPolicies.length} step${sortedPolicies.length === 1 ? '' : 's'} configured`
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
            Add Step
          </Button>
        </div>
      </div>

      {loading || sortedPolicies === null ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : sortedPolicies.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm font-medium">No assignment steps yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click <strong>Add Step</strong> above to create your first
            assignment rule.
          </p>
        </div>
      ) : (
        <CascadeView
          policies={sortedPolicies}
          institutionNameById={institutionNameById}
          togglingId={togglingId}
          onToggle={handleToggleActive}
          onEdit={handleEdit}
          onDelete={(p) => setDeletingPolicy(p)}
        />
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
            <AlertDialogTitle>Remove this step?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPolicy && (
                <>
                  This will remove <strong>Step {deletingPolicy.tier_order}</strong>
                  {deletingPolicy.scope_type === 'institution'
                    ? ` for ${institutionNameById[deletingPolicy.institution_id ?? ''] ?? 'this college'}`
                    : ' from the default rules'}
                  . The system will skip this step when looking for a counselor.
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

// ----------------------------------------------------------------------------
// CascadeView — vertical sequence of step cards with "↓ if no match" arrows.
// Groups by scope (global cards first, then any institution-specific blocks).
// ----------------------------------------------------------------------------
interface CascadeViewProps {
  policies: CounselorTierPolicy[];
  institutionNameById: Record<string, string>;
  togglingId: string | null;
  onToggle: (p: CounselorTierPolicy, next: boolean) => void;
  onEdit: (p: CounselorTierPolicy) => void;
  onDelete: (p: CounselorTierPolicy) => void;
}

function CascadeView({
  policies,
  institutionNameById,
  togglingId,
  onToggle,
  onEdit,
  onDelete,
}: CascadeViewProps) {
  const globalRules = policies.filter((p) => p.scope_type === 'global');
  const institutionRules = policies.filter(
    (p) => p.scope_type === 'institution',
  );

  // Group institution-specific overrides by institution_id so each college
  // gets its own labelled cascade block.
  const byInstitution = useMemo(() => {
    const map: Record<string, CounselorTierPolicy[]> = {};
    for (const r of institutionRules) {
      const key = r.institution_id ?? '__unknown';
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return map;
  }, [institutionRules]);

  return (
    <div className="space-y-8">
      {globalRules.length > 0 && (
        <CascadeBlock
          title="Default rules — applies to all colleges"
          policies={globalRules}
          institutionNameById={institutionNameById}
          togglingId={togglingId}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}

      {Object.entries(byInstitution).map(([instId, rules]) => (
        <CascadeBlock
          key={instId}
          title={`Override — just for ${institutionNameById[instId] ?? 'one college'}`}
          policies={rules}
          institutionNameById={institutionNameById}
          togglingId={togglingId}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// CascadeBlock — one labelled cascade (e.g. "Default rules" or
// "Override for X College"). Renders step cards with arrows between them.
// ----------------------------------------------------------------------------
interface CascadeBlockProps {
  title: string;
  policies: CounselorTierPolicy[];
  institutionNameById: Record<string, string>;
  togglingId: string | null;
  onToggle: (p: CounselorTierPolicy, next: boolean) => void;
  onEdit: (p: CounselorTierPolicy) => void;
  onDelete: (p: CounselorTierPolicy) => void;
}

function CascadeBlock({
  title,
  policies,
  institutionNameById,
  togglingId,
  onToggle,
  onEdit,
  onDelete,
}: CascadeBlockProps) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-2">
        {policies.map((p, idx) => (
          <div key={p.id}>
            <StepCard
              policy={p}
              institutionNameById={institutionNameById}
              isToggling={togglingId === p.id}
              onToggle={(next) => onToggle(p, next)}
              onEdit={() => onEdit(p)}
              onDelete={() => onDelete(p)}
            />
            {idx < policies.length - 1 && (
              <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                <ArrowDown className="mr-1 h-3 w-3" />
                if no match
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// StepCard — one rule rendered as a numbered, plain-English card.
// ----------------------------------------------------------------------------
interface StepCardProps {
  policy: CounselorTierPolicy;
  institutionNameById: Record<string, string>;
  isToggling: boolean;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function StepCard({
  policy,
  institutionNameById,
  isToggling,
  onToggle,
  onEdit,
  onDelete,
}: StepCardProps) {
  const strategyLabel = TierPolicyService.formatTierStrategy(policy.tier_strategy);
  const strategyHint = TierPolicyService.explainTierStrategy(policy.tier_strategy);
  const scopeLabel = TierPolicyService.formatScope(
    policy.scope_type,
    policy.institution_id ? institutionNameById[policy.institution_id] : null,
  );
  const onDutyLabel = TierPolicyService.formatOnDuty(policy.on_duty_required);

  return (
    <div
      className={`rounded-lg border p-4 transition-opacity ${
        policy.is_active
          ? 'border-border bg-card'
          : 'border-dashed border-border bg-muted/30 opacity-60'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
          {policy.tier_order}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-base font-semibold">
                  Step {policy.tier_order}: {strategyLabel}
                </h4>
                {!policy.is_active && (
                  <Badge variant="outline" className="text-xs">
                    Turned off
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {strategyHint}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{scopeLabel}</span>
                <span>•</span>
                <span>{onDutyLabel}</span>
              </div>
              {policy.description && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  Note: {policy.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id={`toggle-${policy.id}`}
                  checked={policy.is_active}
                  disabled={isToggling}
                  onCheckedChange={onToggle}
                  aria-label={`Turn step ${policy.tier_order} on or off`}
                />
                <label
                  htmlFor={`toggle-${policy.id}`}
                  className="cursor-pointer text-xs text-muted-foreground"
                >
                  {policy.is_active ? 'On' : 'Off'}
                </label>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onEdit}
                  aria-label={`Edit step ${policy.tier_order}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onDelete}
                  aria-label={`Remove step ${policy.tier_order}`}
                >
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
