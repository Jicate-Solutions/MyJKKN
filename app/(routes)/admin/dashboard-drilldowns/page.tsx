'use client';

// =====================================================================
// /admin/dashboard-drilldowns — Director's zero-deploy drill-down config
// =====================================================================
// Per spec §3.0.1 (group-dashboard-clickable-drill-downs-spec.md):
// clones the `/admin/nav-config` Approach-4 pattern: code defaults from
// the codebase, DB overrides via `platform_policies` rows under the
// `dashboard.drilldown.*` prefix. 60s cache, fail-soft to defaults if
// the policy fetch fails.
//
// Standing rule (CLAUDE.md feedback_policy_decisions_must_be_config_rows):
// every threshold / mapping / feature flag = a row. This page is the
// editor surface for the drill-down family.
//
// Permission: super_admin only writes; admins can view (matches the
// nav-config / telephony-policies / retention-policies pages exactly).
//
// ⚠️ B.3 RUNTIME DEPENDENCY: this page uses local stub
// `_components/drilldown-defaults.ts` until B.1 lands. After B.1 merges,
// swap every import of `./drilldown-defaults` for
// `@/lib/policies/dashboard-drilldown-keys` (one mechanical search +
// replace). See PR body for the swap checklist.
// =====================================================================

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  Database,
  MousePointerClick,
  RotateCcw,
  Save,
  Timer,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import { usePermissions } from '@/hooks/use-permissions';

import { DrilldownPolicyTable } from './_components/drilldown-policy-table';
import { DrilldownPolicyEditor } from './_components/drilldown-policy-editor';
import {
  DEFAULT_PERFORMANCE_BUDGET_MS,
  type DrilldownMetric,
} from './_components/drilldown-defaults';
import {
  PERFORMANCE_BUDGET_KEY,
  useDrilldownPolicies,
  useResetDrilldownField,
  useUpsertDrilldownField,
} from './_components/drilldown-policy-service';

// ---------------------------------------------------------------------------
// Page wrapper — gated by PermissionGuard. Matches nav-config exactly.
// ---------------------------------------------------------------------------
export default function DashboardDrilldownsPage() {
  return (
    <PermissionGuard module="users" action="manage">
      <ContentLayout title="Dashboard Drilldown Configuration">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'Dashboard Drilldowns' },
          ]}
        />
        <DashboardDrilldownsContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
function DashboardDrilldownsContent() {
  const { isSuperAdmin } = usePermissions();
  const { data, isLoading, error } = useDrilldownPolicies();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<DrilldownMetric | null>(
    null,
  );

  const editingRow =
    data?.rows.find((r) => r.metric === editingMetric) ?? null;

  function openEditor(metric: DrilldownMetric) {
    setEditingMetric(metric);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingMetric(null);
  }

  if (isLoading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Per spec §3.0.1 + §6 fail-soft: even if the policy fetch errored,
  // render the defaults and surface a non-blocking warning. The service
  // already returns the all-defaults state on read failure, so reaching
  // this branch means the React Query layer threw — show the alert and
  // let the user retry.
  if (error || !data) {
    return (
      <div className="mt-6 space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load drill-down overrides</AlertTitle>
          <AlertDescription>
            {error?.message ?? 'Unknown error'}. The dashboard will use
            code-default drill-downs until this is fixed.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Compass className="h-4 w-4" />
        <AlertTitle>How drill-downs work</AlertTitle>
        <AlertDescription>
          Each clickable element on the Group Dashboard has a code default
          (destination URL, columns, action buttons per role, empty-state
          copy). Overrides land in <code>platform_policies</code> under the{' '}
          <code>dashboard.drilldown.*</code> prefix. Tweak a destination,
          re-map columns, toggle a button — no PR, no deploy.
        </AlertDescription>
      </Alert>

      <PerformanceBudgetCard
        budgetMs={data.performanceBudgetMs}
        isOverride={data.performanceBudgetOverridden}
        rowId={data.performanceBudgetRowId}
        updatedAt={data.performanceBudgetUpdatedAt}
        canEdit={isSuperAdmin}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MousePointerClick className="h-5 w-5" />
            Drill-down policies
          </CardTitle>
          <CardDescription>
            One row per clickable metric. Click <strong>Edit</strong> to
            override destination URL, columns, action buttons (per role),
            empty-state copy, or to disable the drill-down entirely.{' '}
            {data.rows.filter((r) => r.overriddenFields.size > 0).length}{' '}
            of {data.rows.length} metrics have overrides today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DrilldownPolicyTable
            rows={data.rows}
            canEdit={isSuperAdmin}
            onEdit={openEditor}
          />

          {!isSuperAdmin && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You can view drill-down policies but only{' '}
                <strong>super_admin</strong> can edit them.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <DrilldownPolicyEditor
        open={editorOpen}
        row={editingRow}
        canEdit={isSuperAdmin}
        onClose={closeEditor}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Performance budget editor (single global key, separate from per-metric rows)
// ---------------------------------------------------------------------------
interface PerformanceBudgetCardProps {
  budgetMs: number;
  isOverride: boolean;
  rowId: string | null;
  updatedAt: string | null;
  canEdit: boolean;
}

function PerformanceBudgetCard({
  budgetMs,
  isOverride,
  rowId,
  updatedAt,
  canEdit,
}: PerformanceBudgetCardProps) {
  const upsertMutation = useUpsertDrilldownField();
  const resetMutation = useResetDrilldownField();
  const [draft, setDraft] = useState<string>(String(budgetMs));

  // Re-sync local input when the server value changes (e.g. after save
  // or reset). Only triggers when the budgetMs prop actually changes.
  useEffect(() => {
    setDraft(String(budgetMs));
  }, [budgetMs]);

  async function save() {
    const v = Number.parseInt(draft, 10);
    if (!Number.isFinite(v) || v <= 0) {
      toast.error('Budget must be a positive integer (milliseconds).');
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        policyKey: PERFORMANCE_BUDGET_KEY,
        value: v,
      });
      toast.success(`Performance budget updated to ${v}ms.`);
    } catch (e) {
      toast.error(
        `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function resetToDefault() {
    if (!rowId) return;
    try {
      await resetMutation.mutateAsync(rowId);
      setDraft(String(DEFAULT_PERFORMANCE_BUDGET_MS));
      toast.success('Performance budget reset to default.');
    } catch (e) {
      toast.error(
        `Reset failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const dirty = String(budgetMs) !== draft;
  const saving = upsertMutation.isPending || resetMutation.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Performance budget
          </CardTitle>
          <CardDescription>
            Spec §3.7 — meeting-velocity threshold for drill-down loads.
            Default: {DEFAULT_PERFORMANCE_BUDGET_MS}ms.
          </CardDescription>
        </div>
        {isOverride ? (
          <Badge variant="default">override active</Badge>
        ) : (
          <Badge variant="secondary">default</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="grid gap-1.5 max-w-xs">
            <Label htmlFor="dd-budget">Budget (milliseconds)</Label>
            <Input
              id="dd-budget"
              type="number"
              min="100"
              step="100"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!canEdit || saving}
            />
          </div>
          <Button
            size="sm"
            onClick={save}
            disabled={!canEdit || saving || !dirty}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToDefault}
            disabled={!canEdit || saving || !isOverride || rowId === null}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>
        {updatedAt && (
          <p className="text-xs text-muted-foreground">
            <Database className="inline h-3 w-3 mr-1" />
            Last updated: {format(new Date(updatedAt), 'MMM d, HH:mm')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

