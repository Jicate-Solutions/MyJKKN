'use client';

// =====================================================================
// /admin/landing-pages — Director's zero-deploy landing-redirect editor
// =====================================================================
// Standing rule (2026-04-29): every policy decision = config-table row +
// super_admin UI. This page is the UI for `nav.<module>.default_landing`
// keys in `platform_policies`.
//
// Edits take effect on the next page navigation — no deploy needed.
// Server-side consumers (e.g. /admin/page.tsx, /admin/lti/page.tsx,
// /admin/pde/page.tsx) read the same rows via fn_get_policy_text.
//
// Sister PR (Agent J) ships the migration that seeds the 3 nav.* rows
// and rewrites the consumer redirects. Until that lands this page shows
// an empty state.
//
// Backed by:
//   - Table: public.platform_policies
//   - Helper: public.fn_get_policy_text(text, text, uuid)
//   - Service: lib/services/admin/landing-page-policies-service.ts
//
// Permission: super_admin / admin only (PermissionGuard)
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  Database,
  RotateCcw,
  Save,
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
  useLandingPagePolicies,
  useUpdateLandingPagePolicy,
  type LandingPagePolicy,
} from '@/lib/services/admin/landing-page-policies-service';
import { usePermissions } from '@/hooks/use-permissions';

// ---------------------------------------------------------------------------
// Page wrapper — gated by PermissionGuard (super_admin / admin only).
// ---------------------------------------------------------------------------
export default function LandingPagesPolicyPage() {
  return (
    <PermissionGuard module="users" action="manage">
      <ContentLayout title="Landing Page Policies">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'Landing Page Policies' },
          ]}
        />
        <LandingPagesPolicyContent />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Content — list + per-row inline-edit, mirrors retention-policies.
// ---------------------------------------------------------------------------
function LandingPagesPolicyContent() {
  const { isSuperAdmin } = usePermissions();
  const { data: policies, isLoading, error } = useLandingPagePolicies();
  const updateMutation = useUpdateLandingPagePolicy();

  // Per-row inline-edit drafts. Keyed by id. Only fields the user has
  // touched live here — un-edited rows render their server values.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Reset drafts whenever fresh server data arrives so the UI shows the
  // canonical state after a successful save.
  useEffect(() => {
    setDrafts({});
  }, [policies]);

  const dirty = useMemo(() => {
    if (!policies) return false;
    return policies.some(
      (p) => drafts[p.id] !== undefined && drafts[p.id] !== p.value,
    );
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
        <AlertTitle>Failed to load landing-page policies</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  // Empty state — Agent J's seed migration hasn't landed yet, OR no
  // global nav.*.default_landing rows have been inserted.
  if (!policies || policies.length === 0) {
    return (
      <div className="mt-6 space-y-6">
        <Alert>
          <Compass className="h-4 w-4" />
          <AlertTitle>Zero-deploy landing-redirect tweaks</AlertTitle>
          <AlertDescription>
            Edit which sub-page each module&apos;s root URL redirects to.
            Edits take effect on the next page navigation — no deploy
            needed.
          </AlertDescription>
        </Alert>

        <Alert>
          <Database className="h-4 w-4" />
          <AlertTitle>No landing-page policies seeded yet</AlertTitle>
          <AlertDescription>
            No rows match{' '}
            <code>policy_key LIKE &apos;nav.%.default_landing&apos;</code>{' '}
            at <code>scope_type = &apos;global&apos;</code>. The sister PR
            seeds the initial three rows (<code>nav.admin</code>,{' '}
            <code>nav.lti</code>, <code>nav.pde</code>) and rewrites the
            consumer redirects. Once it merges, this page lists each row
            for inline editing.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Why-it-matters context for the super_admin */}
      <Alert>
        <Compass className="h-4 w-4" />
        <AlertTitle>Zero-deploy landing-redirect tweaks</AlertTitle>
        <AlertDescription>
          Edit which sub-page each module&apos;s root URL redirects to.
          Edits take effect on the next page navigation — no deploy needed.
          Server-side redirects read the same rows via{' '}
          <code>fn_get_policy_text</code>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Per-module landing pages</CardTitle>
          <CardDescription>
            One row per module-root URL. <strong>{policies.length}</strong>{' '}
            {policies.length === 1 ? 'policy' : 'policies'} configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">Policy key</TableHead>
                <TableHead className="w-[280px]">Landing path</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[160px]">Last updated</TableHead>
                <TableHead className="w-[140px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((row) => {
                const draftVal = drafts[row.id];
                const value = draftVal ?? row.value;
                const isDirty = draftVal !== undefined && draftVal !== row.value;
                const looksValid = value.trim().startsWith('/');
                const canSave = isDirty && looksValid && isSuperAdmin;

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">
                      {row.policy_key}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={value}
                        placeholder="/module/sub-page"
                        disabled={!isSuperAdmin || updateMutation.isPending}
                        onChange={(e) => {
                          const next = e.target.value;
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: next,
                          }));
                        }}
                        className="font-mono text-sm w-full"
                        aria-invalid={isDirty && !looksValid}
                      />
                      {isDirty && !looksValid && (
                        <p className="text-xs text-destructive mt-1">
                          Must start with <code>/</code>
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.description ?? (
                        <span className="text-muted-foreground/50 italic">
                          (no description)
                        </span>
                      )}
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
                              delete next[row.id];
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
                            updateMutation.mutate(
                              { id: row.id, value: value.trim() },
                              {
                                onSuccess: () => {
                                  toast.success(
                                    `${row.policy_key} updated.`,
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
                You can view landing-page policies but only{' '}
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
