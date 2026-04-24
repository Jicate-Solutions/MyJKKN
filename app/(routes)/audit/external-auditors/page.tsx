'use client';

// External Auditor (Time-Boxed) admin UI.
// Sprint 02 pulled forward for Aassaan mock peer-team visit (Aug 2026).
// Lists current external auditors + Add / Extend / Revoke actions.
// Permission: super_admin or audit.external_auditor.manage.

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, ShieldCheck, Clock, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useExternalAuditors,
  useExtendExternalAuditor,
  useRevokeExternalAuditor,
} from '@/hooks/audit/use-external-auditors';
import { AddExternalAuditorDialog } from './_components/add-external-auditor-dialog';
import toast from 'react-hot-toast';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: 'active' | 'expired' | 'revoked') {
  if (status === 'active') return <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>;
  if (status === 'expired') return <Badge variant="secondary">Expired</Badge>;
  return <Badge variant="destructive">Revoked</Badge>;
}

// Nav coverage — discoverable from the Audit Workflow sidebar entry.
// An "Auditors" tile will be added to /audit/dashboard in a follow-up sweep PR.
export const navMeta = {
  invokedFrom: '/audit/dashboard',
};

export default function ExternalAuditorsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const canManage =
    isSuperAdmin ||
    permissions['audit.external_auditor.manage'] === true ||
    profile?.role === 'registrar';

  const { data: rows = [], isLoading, error, refetch } = useExternalAuditors();
  const extendMutation = useExtendExternalAuditor();
  const revokeMutation = useRevokeExternalAuditor();

  const [addOpen, setAddOpen] = useState(false);

  const handleExtend = async (userId: string) => {
    try {
      await extendMutation.mutateAsync({ userId, extendDays: 7 });
      toast.success('Extended by 7 days');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to extend');
    }
  };

  const handleRevoke = async (userId: string, email: string) => {
    if (!confirm(`Revoke external auditor access for ${email}? This cannot be undone.`)) return;
    try {
      await revokeMutation.mutateAsync(userId);
      toast.success('Access revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    }
  };

  if (authLoading) {
    return (
      <ContentLayout title="External Auditors">
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      </ContentLayout>
    );
  }

  if (!canManage) {
    return (
      <ContentLayout title="External Auditors">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access denied</AlertTitle>
          <AlertDescription>
            This page requires super-admin or <code>audit.external_auditor.manage</code> permission.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="External Auditors">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> External Auditors (Time-Boxed)
              </CardTitle>
              <CardDescription className="mt-1">
                Read-only audit access for external peer-team auditors. Access auto-expires at the
                configured timestamp; revoke is immediate.
              </CardDescription>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add External Auditor
            </Button>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Failed to load auditors</AlertTitle>
                <AlertDescription>
                  {error instanceof Error ? error.message : 'Unknown error'}
                  <Button variant="link" className="p-0 h-auto ml-2" onClick={() => refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Institutions</TableHead>
                    <TableHead>Granted</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                        Loading auditors…
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No external auditors assigned. Click <strong>Add External Auditor</strong> to
                        create the first time-boxed grant.
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading &&
                    rows.map((row) => (
                      <TableRow key={row.user_id}>
                        <TableCell className="font-medium">
                          <div>{row.email}</div>
                          {row.is_pre_registered && (
                            <div className="text-xs text-muted-foreground">Pre-registered</div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="text-sm line-clamp-2">
                            {row.institution_names.length > 0
                              ? row.institution_names.join(', ')
                              : '—'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.institution_ids.length} institution(s)
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(row.granted_at)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(row.expires_at)}
                        </TableCell>
                        <TableCell>{statusBadge(row.status)}</TableCell>
                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExtend(row.user_id)}
                            disabled={extendMutation.isPending || row.status === 'revoked'}
                          >
                            <Clock className="h-3.5 w-3.5 mr-1" /> +7 days
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevoke(row.user_id, row.email)}
                            disabled={revokeMutation.isPending || row.status === 'revoked'}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Substrate note</AlertTitle>
          <AlertDescription className="text-sm">
            Time-box enforcement depends on <code>user_institution_access.expires_at</code>. If
            that column is not yet on production, revoke still works (via <code>is_active=false</code>
            ) but auto-expiry is not honored. Add the column via a one-line migration before
            relying on the timestamp.
          </AlertDescription>
        </Alert>
      </div>

      <AddExternalAuditorDialog open={addOpen} onOpenChange={setAddOpen} />
    </ContentLayout>
  );
}
