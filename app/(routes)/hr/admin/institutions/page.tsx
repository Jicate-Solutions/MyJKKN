'use client';

// /hr/admin/institutions — which institutions are part of the HR module.
//
// The SECOND axis of HR inclusion. The first is employment_categories
// .included_in_hr, set at /staff/category, which filters staff by CATEGORY.
// This one excludes whole institutions. They are ANDed: a staff member is in HR
// only if their category AND their institution are.
//
// SUPER-ADMIN ONLY, matching hr_organizations_admin_list and
// hr_organization_set_included, which both check is_super_admin() themselves.
// Gated on profile.is_super_admin rather than a permission key: a new key would
// need a catalog entry and role grants or this page renders empty for everyone,
// and public.is_super_admin() reads ONLY profiles.is_super_admin — it does not
// accept role = 'super_admin', so widening the client check would offer controls
// the server refuses.

import { useState } from 'react';
import { AlertCircle, Building2, Info } from 'lucide-react';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useHROrganizationsAdmin,
  useSetHROrganizationIncluded,
} from '@/hooks/hr/use-hr-organizations';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/utils';
import type { HROrganizationAdminRow } from '@/types/hr-organizations';

export default function HRInstitutionsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const isSuperAdmin = profile?.is_super_admin === true;

  const { data, isLoading, error } = useHROrganizationsAdmin(isSuperAdmin);
  const [pending, setPending] = useState<HROrganizationAdminRow | null>(null);

  return (
    <ContentLayout title="Institutions in HR">
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administration' },
          { label: 'HR', href: '/hr/admin' },
          { label: 'Institutions' },
        ]}
      />

      {!authLoading && !isSuperAdmin ? (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Switching an institution in or out of the HR module is restricted to
            super administrators.
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              HR module inclusion
            </CardTitle>
            <CardDescription>
              Excluding an institution removes its staff from every HR screen and
              turns off HR self-service for them — they can no longer apply for
              leave or see their attendance. Nothing is deleted: balances,
              attendance and applications are kept and hidden, and switching it
              back on restores everything exactly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{getErrorMessage(error)}</AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Institution</TableHead>
                      <TableHead className="text-right">Staff</TableHead>
                      <TableHead className="text-right">In HR by category</TableHead>
                      <TableHead className="text-right">Pending requests</TableHead>
                      <TableHead>Last change</TableHead>
                      <TableHead className="text-right">In HR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data ?? []).map((r) => (
                      <TableRow key={r.hr_organization_id}>
                        <TableCell className="font-medium">
                          {r.institution_name}
                          {!r.included_in_hr && (
                            <Badge variant="outline" className="ml-2 font-normal">
                              excluded
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.total_staff}
                        </TableCell>
                        {/* The category axis, shown beside the institution one so
                            it is obvious why an included institution can still
                            contribute fewer people than it employs. */}
                        <TableCell className="text-right tabular-nums">
                          {r.hr_staff}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.pending_requests > 0 ? r.pending_requests : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.changed_at
                            ? `${r.changed_at.slice(0, 10)}${
                                r.changed_by_name ? ` · ${r.changed_by_name}` : ''
                              }`
                            : '—'}
                          {r.reason && (
                            <div className="italic">{r.reason}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={r.included_in_hr}
                            onCheckedChange={() => setPending(r)}
                            aria-label={`Toggle ${r.institution_name} in HR`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {pending && (
        <ConfirmToggle
          key={pending.hr_organization_id}
          row={pending}
          onDone={() => setPending(null)}
        />
      )}
    </ContentLayout>
  );
}

/**
 * Confirmation with the consequence spelled out.
 *
 * The switch does not write directly: excluding an institution changes what 23
 * RLS policies return, and the count of leave requests that become unreachable
 * is only knowable before the fact. A reason is mandatory, as with every other
 * adjustment in this module.
 */
function ConfirmToggle({
  row, onDone,
}: {
  row: HROrganizationAdminRow;
  onDone: () => void;
}) {
  const mutation = useSetHROrganizationIncluded();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const next = !row.included_in_hr;
  const busy = mutation.isPending;

  const submit = () => {
    setError(null);
    if (reason.trim() === '') {
      setError('A reason is required — it is what makes this change auditable.');
      return;
    }
    mutation.mutate(
      {
        hr_organization_id: row.hr_organization_id,
        included: next,
        reason: reason.trim(),
      },
      {
        onSuccess: (res) => {
          const frozen = Number(res?.frozen_pending ?? 0);
          toast.success(
            next
              ? `${row.institution_name} is back in the HR module.`
              : `${row.institution_name} removed from HR${
                  frozen > 0 ? ` — ${frozen} pending request(s) frozen` : ''
                }.`
          );
          onDone();
        },
        onError: (err) => setError(getErrorMessage(err)),
      }
    );
  };

  return (
    <Card className="mt-4 border-amber-500/50">
      <CardHeader>
        <CardTitle className="text-base">
          {next ? 'Include' : 'Exclude'} {row.institution_name}?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {next ? (
              <>
                Its <strong>{row.hr_staff}</strong> HR-eligible staff reappear on
                every HR screen and regain HR self-service. Any data hidden while
                it was excluded comes back untouched.
              </>
            ) : (
              <>
                Its <strong>{row.hr_staff}</strong> HR-eligible staff disappear
                from every HR screen and lose HR self-service — no applying for
                leave, no attendance page.
                {row.pending_requests > 0 && (
                  <>
                    {' '}
                    <strong>{row.pending_requests}</strong> pending leave
                    request(s) will be frozen: kept, but not visible or
                    actionable until this is switched back on.
                  </>
                )}
              </>
            )}
          </AlertDescription>
        </Alert>

        <div>
          <Label htmlFor="inst-reason" className="text-xs">Reason</Label>
          <Textarea
            id="inst-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Not an employing entity — staff are payrolled by Main Office"
            className="mt-1"
            rows={2}
            disabled={busy}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={next ? 'default' : 'destructive'}
            onClick={submit}
            disabled={busy || reason.trim() === ''}
          >
            {busy ? 'Saving…' : next ? 'Include in HR' : 'Exclude from HR'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
