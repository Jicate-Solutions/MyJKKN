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
 *   The Physical Director files for the whole squad; each participating
 *   college's Principal approves THEIR OWN learners (D6). A mixed-college squad
 *   is allowed, so one request can be waiting on several Principals and is
 *   approved only when every one of them has said yes.
 *
 * WHAT THIS PAGE SHOWS YOU, AND WHAT IT DOES NOT
 *   The queue comes from fn_health_tournament_my_approvals(), which returns the
 *   approval rows YOU may decide — your college's, and no other's. The squad
 *   roster comes from fn_health_tournament_visible_squad(), which returns YOUR
 *   college's learners only. Neither is a client-side filter: an earlier
 *   version of this page listed every college's request because RLS carried no
 *   institution predicate, and a Principal of one college could read, reject
 *   and delete another college's request.
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
import type {
  TournamentCollegeApproval,
  TournamentPermissionRecord,
  TournamentVisibleSquadMember,
} from '@/lib/services/health/health-sports-service';
import {
  FailureNotice,
  NoAccessNotice,
  RequestCard,
} from '../_components/tournament-permission-ui';
import { DecideDialog } from './_components/decide-dialog';

const APPROVE_KEY = 'health.sports.approve';

type Queue = 'awaiting' | 'approved' | 'rejected' | 'cancelled';

/** One row in the inbox: the request, plus THIS approver's own college decision. */
interface InboxItem {
  permission: TournamentPermissionRecord;
  mine: TournamentCollegeApproval;
  squad: TournamentVisibleSquadMember[];
}

export default function TournamentApprovalsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();

  const [queue, setQueue] = useState<Queue>('awaiting');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [pending, setPendingCount] = useState<number | null>(null);
  const [decide, setDecide] = useState<{
    item: InboxItem;
    decision: 'approved' | 'rejected';
  } | null>(null);

  const gatesLoading = authLoading || permsLoading;
  const mayApprove = isSuperAdmin || can(APPROVE_KEY);

  const load = useCallback(async (which: Queue) => {
    setLoading(true);
    setLoadError(null);
    try {
      // The database decides which colleges are mine — see the header note.
      const mine = await HealthSportsService.getMyCollegeApprovals();

      // D10: a called-off trip belongs in its own tab, never in the queue of
      // things still awaiting a decision.
      const wanted = mine.filter((a) => {
        const isCancelled = Boolean(a.cancelled_at);
        if (which === 'cancelled') return isCancelled;
        if (isCancelled) return false;
        return which === 'awaiting' ? a.status === 'pending' : a.status === which;
      });

      const permissions = await HealthSportsService.getPermissionsByIds(
        Array.from(new Set(wanted.map((a) => a.permission_id)))
      );
      const byId = new Map(permissions.map((p) => [p.id, p]));

      const rows: InboxItem[] = [];
      for (const a of wanted) {
        const permission = byId.get(a.permission_id);
        if (!permission) continue;
        rows.push({
          permission,
          mine: a,
          squad: await HealthSportsService.getVisibleSquad(a.permission_id),
        });
      }
      setItems(rows);
      setPendingCount(
        mine.filter((a) => a.status === 'pending' && !a.cancelled_at).length
      );
    } catch (err) {
      setItems([]);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (gatesLoading || !mayApprove) return;
    void load(queue);
  }, [gatesLoading, mayApprove, queue, load]);

  function handleDecided(approvalId: string) {
    setItems((prev) => prev.filter((r) => r.mine.approval_id !== approvalId));
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
                      The Physical Director files one request per squad. You decide for
                      your own college&apos;s learners; a squad from several colleges
                      travels only once every Principal has approved.
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
                <TabsTrigger value="cancelled">Called off</TabsTrigger>
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
                ) : items.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                      <Inbox className="h-8 w-8 text-slate-200" />
                      <p className="text-sm text-slate-500">
                        {queue === 'awaiting'
                          ? 'Nothing is waiting on you'
                          : queue === 'cancelled'
                            ? 'No trips were called off'
                            : `No ${queue} requests`}
                      </p>
                      <p className="max-w-sm text-xs text-slate-400">
                        {queue === 'awaiting'
                          ? 'Requests appear here the moment the Physical Director files one that includes your college.'
                          : queue === 'cancelled'
                            ? 'A trip called off after approval is kept here as evidence and counts for nothing in participation.'
                            : 'Decisions you record will be listed here with your note.'}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  items.map((item) => (
                    <RequestCard
                      key={item.mine.approval_id}
                      perm={item.permission}
                      squad={item.squad}
                      squadScoped
                      approvals={[item.mine]}
                      actions={
                        queue === 'awaiting' && profile?.id ? (
                          <>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => setDecide({ item, decision: 'approved' })}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              Approve for my college
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => setDecide({ item, decision: 'rejected' })}
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
          request={decide?.item.permission ?? null}
          approval={decide?.item.mine ?? null}
          decision={decide?.decision ?? 'approved'}
          onClose={() => setDecide(null)}
          onDecided={handleDecided}
        />
      ) : null}
    </ContentLayout>
  );
}
