'use client';

// =============================================================================
// /rcltp/teacher/remedial-plans — Remedial reading plans (Senior Learner console)
// =============================================================================
// Gives Senior Learners their learning-studio time back: instead of hand-writing
// a remedial plan for every at-risk reader, AI drafts one and the Senior Learner
// reviews, edits, and APPROVES it here. At-risk learners come from
// fn_rcltp_at_risk_learners (same logic as the principal dashboard's atRisk, but
// gated on rcltp.review so a reviewer can see who needs a plan). Approving is the
// ONLY path to status='approved' (fn_rcltp_remedial_plan_approve).
//
// Gated to rcltp.review. Access failures are surfaced explicitly (rule #27).
// Scores stay provisional + aggregate — no per-child band is shown to learners.
// English only (Nattraja CBSE).
// =============================================================================

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Lock,
  Sparkles,
  Loader2,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { RcltpRemedialPlanClientService } from '@/lib/services/rcltp/remedial-plan-client-service';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RemedialPlanReviewDialog } from './_components/remedial-plan-review-dialog';
import type { RcltpAtRiskRow, RcltpRemedialPlan } from '@/types/rcltp';

export const navMeta = {
  label: 'RCLTP Remedial Plans',
  icon: 'FileText',
} as const;

function reasonBadge(reason: RcltpAtRiskRow['reason']) {
  if (reason === 'low_band') {
    return <Badge variant='destructive'>Low band</Badge>;
  }
  if (reason === 'regression') {
    return (
      <Badge variant='outline' className='border-amber-500 text-amber-600 dark:text-amber-400'>
        Regression
      </Badge>
    );
  }
  return <Badge variant='secondary'>Flagged</Badge>;
}

export default function RcltpRemedialPlansPage() {
  const { can, isSuperAdmin, isLoading: permsLoading, userProfile } = usePermissions();
  const institutionId = userProfile?.institution_id ?? undefined;
  const queryClient = useQueryClient();

  // Mirrors the rcltp_remedial_plans_select RLS policy, which admits
  // rcltp.review OR rcltp.report.view_all OR rcltp.config.manage. The guard
  // previously accepted only the first, so holders of the other two could read
  // these rows in the database but were turned away by the page.
  const allowed =
    isSuperAdmin ||
    can('rcltp.review') ||
    can('rcltp.report.view_all') ||
    can('rcltp.config.manage');

  const atRiskQueryKey = ['rcltp', 'at-risk', institutionId];
  const { data: atRiskData, isLoading: dashLoading } = useQuery<RcltpAtRiskRow[]>({
    queryKey: atRiskQueryKey,
    queryFn: () => RcltpRemedialPlanClientService.listAtRisk(institutionId as string),
    enabled: Boolean(allowed && institutionId),
  });

  const plansQueryKey = ['rcltp', 'remedial-plans', institutionId];
  const { data: plans, isLoading: plansLoading } = useQuery<RcltpRemedialPlan[]>({
    queryKey: plansQueryKey,
    queryFn: () => RcltpRemedialPlanClientService.listForInstitution(institutionId as string),
    enabled: Boolean(allowed && institutionId),
  });

  const [requesting, setRequesting] = useState<string | null>(null);
  const [reviewPlan, setReviewPlan] = useState<RcltpRemedialPlan | null>(null);
  const [reviewName, setReviewName] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);

  // learnerId → latest non-archived plan (approved/draft beat a stale queued).
  const planByLearner = useMemo(() => {
    const rank: Record<string, number> = { approved: 3, draft: 2, queued: 1, archived: 0 };
    const m = new Map<string, RcltpRemedialPlan>();
    for (const p of plans ?? []) {
      const cur = m.get(p.learner_id);
      if (!cur || (rank[p.status] ?? 0) > (rank[cur.status] ?? 0)) m.set(p.learner_id, p);
    }
    return m;
  }, [plans]);

  const atRisk = atRiskData ?? [];

  async function handleRequest(learnerId: string) {
    setRequesting(learnerId);
    try {
      const r = await RcltpRemedialPlanClientService.requestDraft(learnerId);
      toast.success(
        r.inFlight
          ? 'A draft is already being prepared for this learner.'
          : 'Draft requested — it will appear here shortly.',
      );
      await queryClient.invalidateQueries({ queryKey: plansQueryKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not request a draft.');
    } finally {
      setRequesting(null);
    }
  }

  function openReview(plan: RcltpRemedialPlan, name: string) {
    setReviewPlan(plan);
    setReviewName(name);
    setReviewOpen(true);
  }

  // ── access gate ────────────────────────────────────────────────────────────
  if (permsLoading) {
    return (
      <ContentLayout title='Remedial Plans'>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-64' />
          <Skeleton className='h-40 w-full' />
        </div>
      </ContentLayout>
    );
  }

  if (!allowed) {
    return (
      <ContentLayout title='Remedial Plans'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to remedial plans</AlertTitle>
          <AlertDescription>
            Reviewing and approving remedial reading plans requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>rcltp.review</code>{' '}
            permission, which is granted per role under{' '}
            <strong>Users &rarr; Role Management &rarr; RCLTP</strong>. Only a super
            administrator can change role permissions, so ask whoever manages roles
            for your institution to add it to your role.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const loading = dashLoading || plansLoading;

  return (
    <ContentLayout title='Remedial Plans'>
      <div className='space-y-6'>
        <div>
          <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground'>
            <Sparkles className='h-5 w-5 text-primary' aria-hidden='true' />
            Remedial reading plans
          </h1>
          <p className='mt-1 max-w-2xl text-sm text-muted-foreground'>
            At-risk readers are flagged from their latest reading cycle. Request an
            AI-drafted remedial plan, then review, edit, and approve it — your
            approved version is what counts. Bands stay provisional and are never
            shown to learners.
          </p>
        </div>

        {!institutionId && (
          <Alert>
            <AlertTriangle className='h-4 w-4' aria-hidden='true' />
            <AlertTitle>No institution on your profile</AlertTitle>
            <AlertDescription>
              We can’t load at-risk learners because your profile has no institution
              assigned. Contact your administrator.
            </AlertDescription>
          </Alert>
        )}

        {loading && institutionId && (
          <div className='space-y-3'>
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-20 w-full' />
          </div>
        )}

        {!loading && institutionId && atRisk.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>No at-risk readers right now</CardTitle>
              <CardDescription>
                When a learner is flagged (lowest band, or a drop from their previous
                cycle) they’ll appear here for a remedial plan.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!loading && atRisk.length > 0 && (
          <div className='space-y-3'>
            {atRisk.map((row) => {
              const plan = planByLearner.get(row.learnerId);
              const status = plan?.status;
              return (
                <Card key={row.learnerId}>
                  <CardContent className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-medium text-foreground'>{row.name || 'Learner'}</span>
                        {reasonBadge(row.reason)}
                        {status === 'approved' && (
                          <Badge className='bg-primary text-primary-foreground'>
                            <CheckCircle2 className='mr-1 h-3 w-3' aria-hidden='true' /> Approved
                          </Badge>
                        )}
                        {status === 'queued' && (
                          <Badge variant='secondary'>
                            <Clock className='mr-1 h-3 w-3' aria-hidden='true' /> Preparing…
                          </Badge>
                        )}
                        {status === 'draft' && (
                          <Badge variant='outline' className='border-primary text-primary'>
                            <FileText className='mr-1 h-3 w-3' aria-hidden='true' /> Draft ready
                          </Badge>
                        )}
                      </div>
                      {row.roll && (
                        <p className='mt-0.5 text-xs text-muted-foreground'>Roll {row.roll}</p>
                      )}
                    </div>

                    <div className='shrink-0'>
                      {!plan && (
                        <Button
                          size='sm'
                          onClick={() => handleRequest(row.learnerId)}
                          disabled={requesting === row.learnerId}
                        >
                          {requesting === row.learnerId ? (
                            <>
                              <Loader2 className='mr-1.5 h-4 w-4 animate-spin' aria-hidden='true' />
                              Requesting…
                            </>
                          ) : (
                            <>
                              <Sparkles className='mr-1.5 h-4 w-4' aria-hidden='true' /> Draft plan
                            </>
                          )}
                        </Button>
                      )}
                      {status === 'queued' && (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => queryClient.invalidateQueries({ queryKey: plansQueryKey })}
                        >
                          <Clock className='mr-1.5 h-4 w-4' aria-hidden='true' /> Check for draft
                        </Button>
                      )}
                      {status === 'draft' && plan && (
                        <Button size='sm' onClick={() => openReview(plan, row.name)}>
                          <FileText className='mr-1.5 h-4 w-4' aria-hidden='true' /> Review draft
                        </Button>
                      )}
                      {status === 'approved' && plan && (
                        <Button size='sm' variant='outline' onClick={() => openReview(plan, row.name)}>
                          View
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className='border-t pt-4 text-xs text-muted-foreground'>
          AI drafts the plan; you are the authority — nothing is approved until you
          approve it. RCLTP v1 is English-only.
        </p>
      </div>

      <RemedialPlanReviewDialog
        plan={reviewPlan}
        learnerName={reviewName}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onApproved={() => queryClient.invalidateQueries({ queryKey: plansQueryKey })}
      />
    </ContentLayout>
  );
}
