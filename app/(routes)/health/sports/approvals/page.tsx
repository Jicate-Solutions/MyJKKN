'use client';

/**
 * Tournament Permission Approvals — the Principal's inbox.
 *
 * Route: /health/sports/approvals
 * Gate:  health.sports.approve (MENU_PERMISSIONS + the RLS policy on
 *        health_tournament_permissions read the same key)
 *
 * WHY THIS PAGE EXISTS
 *   HealthSportsService.approvePermissionStep() shipped 2026-04-13 with no
 *   caller anywhere in the app, so health_tournament_permissions had never held
 *   a row and off-campus tournament permission was still circulated on paper.
 *   This is the approver half; the filing half is /health/sports/squad-requests.
 *
 * APPROVAL PATH (Director-locked 2026-07-30)
 *   Two parties. The Physical Director files for the whole squad; the Principal
 *   approves. step3_principal_* is THE approval step — steps 1, 2 and 4 have no
 *   approver and render as "Not required", never as pending and never as
 *   approved-by-nobody.
 *
 * On missing permission this page renders a named explanation. It does NOT
 * redirect to a dashboard (CLAUDE.md #27): a silent bounce is indistinguishable
 * from a broken link and cannot be diagnosed from the first click.
 */

import { useCallback, useEffect, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarCheck, CheckCircle2, XCircle, Inbox } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { HealthSportsService } from '@/lib/services/health/health-sports-service';
import type { TournamentPermissionRecord } from '@/lib/services/health/health-sports-service';
import {
  FailureNotice,
  NoAccessNotice,
  RequestCard,
} from '../_components/tournament-permission-ui';
import { DecideDialog } from './_components/decide-dialog';

const APPROVE_KEY = 'health.sports.approve';

type Queue = 'awaiting' | 'approved' | 'rejected';

export default function TournamentApprovalsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();

  const [queue, setQueue] = useState<Queue>('awaiting');
  const [rows, setRows] = useState<TournamentPermissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [pending, setPendingCount] = useState<number | null>(null);
  const [decide, setDecide] = useState<{
    request: TournamentPermissionRecord;
    decision: 'approved' | 'rejected';
  } | null>(null);

  const gatesLoading = authLoading || permsLoading;
  const mayApprove = isSuperAdmin || can(APPROVE_KEY);

  const load = useCallback(
    async (which: Queue) => {
      setLoading(true);
      setLoadError(null);
      try {
        const data =
          which === 'awaiting'
            ? await HealthSportsService.getPermissionsAwaitingApproval()
            : await HealthSportsService.getDecidedPermissions(which);
        setRows(data);
        if (which === 'awaiting') setPendingCount(data.length);
      } catch (err) {
        setRows([]);
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (gatesLoading || !mayApprove) return;
    void load(queue);
  }, [gatesLoading, mayApprove, queue, load]);

  function handleDecided(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setPendingCount((c) => (c === null ? c : Math.max(0, c - 1)));
  }

  return (
    <ContentLayout title="Tournament Permission Approvals">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Sports', href: '/health/sports' },
          { label: 'Tournament Permissions' },
        ]}
      />

      <div className="mt-4 space-y-4">
        {gatesLoading ? (
          <>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </>
        ) : !mayApprove ? (
          <NoAccessNotice
            permissionKey={APPROVE_KEY}
            purpose="Deciding tournament permission requests"
          />
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-2.5">
                  <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Off-campus tournament permission
                    </p>
                    <p className="text-xs text-slate-500">
                      The Physical Director files one request per squad. You are the
                      only approver — there is no step after yours.
                    </p>
                  </div>
                </div>
                {pending !== null ? (
                  <Badge className="border-amber-200 bg-amber-100 text-xs text-amber-800 hover:bg-amber-100">
                    {pending} awaiting your decision
                  </Badge>
                ) : null}
              </CardContent>
            </Card>

            <Tabs value={queue} onValueChange={(v) => setQueue(v as Queue)}>
              <TabsList>
                <TabsTrigger value="awaiting">Awaiting decision</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>

              <TabsContent value={queue} className="mt-4 space-y-3">
                {loadError ? (
                  <FailureNotice
                    heading="The request list could not be loaded"
                    err={loadError}
                    onRetry={() => void load(queue)}
                  />
                ) : loading ? (
                  <>
                    <Skeleton className="h-56 w-full rounded-xl" />
                    <Skeleton className="h-56 w-full rounded-xl" />
                  </>
                ) : rows.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                      <Inbox className="h-8 w-8 text-slate-200" />
                      <p className="text-sm text-slate-500">
                        {queue === 'awaiting'
                          ? 'Nothing is waiting on you'
                          : `No ${queue} requests`}
                      </p>
                      <p className="max-w-sm text-xs text-slate-400">
                        {queue === 'awaiting'
                          ? 'Requests appear here the moment the Physical Director files one for a squad.'
                          : 'Decisions you record will be listed here with your note.'}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  rows.map((perm) => (
                    <RequestCard
                      key={perm.id}
                      perm={perm}
                      actions={
                        queue === 'awaiting' && profile?.id ? (
                          <>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() =>
                                setDecide({ request: perm, decision: 'approved' })
                              }
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() =>
                                setDecide({ request: perm, decision: 'rejected' })
                              }
                            >
                              <XCircle className="mr-1.5 h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </>
                        ) : undefined
                      }
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {profile?.id ? (
        <DecideDialog
          request={decide?.request ?? null}
          decision={decide?.decision ?? 'approved'}
          approverProfileId={profile.id}
          onClose={() => setDecide(null)}
          onDecided={handleDecided}
        />
      ) : null}
    </ContentLayout>
  );
}
