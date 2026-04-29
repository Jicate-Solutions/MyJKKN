'use client';

// =====================================================================
// /admin/retention-policies — Director's zero-deploy retention tweak UI
// =====================================================================
// Standing rule (2026-04-29): every policy decision = config-table row +
// super_admin UI. R-001 — first reference implementation. Tweak `90 → 60`
// from this page in 5 seconds. No PR. No deploy. No round-trip.
//
// Backed by:
//   - Table: public.retention_policies
//   - Helper: public.get_retention_days(text) (SECURITY DEFINER)
//   - Service: lib/services/admin/retention-policies-service.ts
//   - Cron consumer: app/api/cron/duty-log-retention/route.ts
//
// Permission: super_admin manages (write). is_admin can view.
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { Save, RotateCcw, Database, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  useRetentionPolicies,
  useUpdateRetentionPolicy,
  type RetentionPolicy,
} from '@/lib/services/admin/retention-policies-service';
import { usePermissions } from '@/hooks/use-permissions';

export default function RetentionPoliciesPage() {
  return (
    <PermissionGuard module="users" action="manage">
      <ContentLayout title="Retention Policies">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'Retention Policies' },
          ]}
        />
        <RetentionPoliciesContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

function RetentionPoliciesContent() {
  const { isSuperAdmin } = usePermissions();
  const { data: policies, isLoading, error } = useRetentionPolicies();
  const updateMutation = useUpdateRetentionPolicy();

  // Per-row inline-edit drafts. Keyed by table_name. Only fields the user
  // has touched live here — un-edited rows render their server values.
  const [drafts, setDrafts] = useState<
    Record<string, { retention_days?: number; enabled?: boolean }>
  >({});

  // Reset drafts whenever fresh server data arrives (e.g., after a successful
  // save) so the UI shows the canonical state.
  useEffect(() => {
    setDrafts({});
  }, [policies]);

  const dirty = useMemo(() => {
    if (!policies) return false;
    return policies.some((p) => isRowDirty(p, drafts[p.table_name]));
  }, [policies, drafts]);

  if (isLoading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load retention policies</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!policies || policies.length === 0) {
    return (
      <Alert className="mt-6">
        <Database className="h-4 w-4" />
        <AlertTitle>No retention policies configured</AlertTitle>
        <AlertDescription>
          The <code>retention_policies</code> table is empty. Run the
          migration <code>20260429_retention_policies.sql</code> to seed
          the default rows, or insert one manually.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Why-it-matters context for the super_admin */}
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>Zero-deploy retention tweaks</AlertTitle>
        <AlertDescription>
          These are the data-purge cutoffs scheduled cron jobs use. Edit{' '}
          <code>retention_days</code> or toggle <code>enabled</code> here
          and the next cron run picks up the new value &mdash; no deploy,
          no PR, no developer round-trip. When <code>enabled</code> is off,
          the cron falls back to its hardcoded default and skips purging.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Per-table retention</CardTitle>
          <CardDescription>
            One row per cron-managed table.{' '}
            <strong>{policies.length}</strong>{' '}
            {policies.length === 1 ? 'policy' : 'policies'} configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">Table</TableHead>
                <TableHead className="w-[140px]">Retention (days)</TableHead>
                <TableHead className="w-[120px]">Enabled</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[160px]">Last updated</TableHead>
                <TableHead className="w-[140px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((row) => {
                const draft = drafts[row.table_name] ?? {};
                const days = draft.retention_days ?? row.retention_days;
                const enabled = draft.enabled ?? row.enabled;
                const isDirty = isRowDirty(row, draft);
                const canSave = isDirty && days > 0 && isSuperAdmin;

                return (
                  <TableRow key={row.table_name}>
                    <TableCell className="font-mono text-sm">
                      {row.table_name}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={days}
                        disabled={!isSuperAdmin || updateMutation.isPending}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setDrafts((prev) => ({
                            ...prev,
                            [row.table_name]: {
                              ...prev[row.table_name],
                              retention_days: Number.isFinite(next) ? next : 0,
                            },
                          }));
                        }}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={enabled}
                          disabled={!isSuperAdmin || updateMutation.isPending}
                          onCheckedChange={(checked) => {
                            setDrafts((prev) => ({
                              ...prev,
                              [row.table_name]: {
                                ...prev[row.table_name],
                                enabled: checked,
                              },
                            }));
                          }}
                        />
                        <Badge variant={enabled ? 'default' : 'secondary'}>
                          {enabled ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.description}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.updated_at
                        ? format(new Date(row.updated_at), 'MMM d, HH:mm')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!isDirty || updateMutation.isPending}
                          onClick={() => {
                            setDrafts((prev) => {
                              const next = { ...prev };
                              delete next[row.table_name];
                              return next;
                            });
                          }}
                          aria-label="Revert"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canSave || updateMutation.isPending}
                          onClick={() => {
                            const patch: { retention_days?: number; enabled?: boolean } = {};
                            if (
                              draft.retention_days !== undefined &&
                              draft.retention_days !== row.retention_days
                            ) {
                              patch.retention_days = draft.retention_days;
                            }
                            if (
                              draft.enabled !== undefined &&
                              draft.enabled !== row.enabled
                            ) {
                              patch.enabled = draft.enabled;
                            }
                            updateMutation.mutate(
                              { tableName: row.table_name, patch },
                              {
                                onSuccess: () => {
                                  toast.success(
                                    `Retention policy for ${row.table_name} updated.`,
                                  );
                                },
                                onError: (err) => {
                                  toast.error(
                                    `Update failed: ${err.message}`,
                                  );
                                },
                              },
                            );
                          }}
                        >
                          <Save className="h-3.5 w-3.5 mr-1" />
                          Save
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {!isSuperAdmin && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You can view retention policies but only{' '}
                <strong>super_admin</strong> can edit them. Contact the
                Director to request a change.
              </AlertDescription>
            </Alert>
          )}

          {dirty && isSuperAdmin && (
            <p className="mt-4 text-sm text-amber-600">
              You have unsaved changes. Click <strong>Save</strong> on each
              row to persist, or <RotateCcw className="inline h-3 w-3" />{' '}
              to revert.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: has-the-row-changed predicate.
// ---------------------------------------------------------------------------
function isRowDirty(
  row: RetentionPolicy,
  draft: { retention_days?: number; enabled?: boolean } | undefined,
): boolean {
  if (!draft) return false;
  if (
    draft.retention_days !== undefined &&
    draft.retention_days !== row.retention_days
  ) {
    return true;
  }
  if (draft.enabled !== undefined && draft.enabled !== row.enabled) {
    return true;
  }
  return false;
}
