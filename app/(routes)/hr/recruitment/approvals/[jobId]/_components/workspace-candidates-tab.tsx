'use client';

/**
 * Candidates tab — the job's entire pipeline in one list.
 *
 * Screening rows come from hr_job_applications; once promoted, the row shows
 * the linked hr_recruitment_candidates record with its frozen approval chain.
 * Screening actions (review / shortlist / reject / promote) reuse the same
 * mutations as the Jobs page, so both surfaces stay cache-consistent.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertCircle, AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, Clock,
  ClipboardCheck, Eye, FileText, Inbox, Loader2, Mail, Phone, Settings, Star,
  Trash2, UserPlus, XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  useJobApplications,
  useCandidatesForJob,
  useReviewApplication,
  usePromoteApplication,
  useApproveCandidate,
  useRejectCandidate,
  useInterviews,
  usePurgeRejectedApplicant,
  useJobApprovalFlow,
} from '@/hooks/hr/use-recruitment';
import { Input } from '@/components/ui/input';
import { useCompleteInterview, useMarkNoShow } from '@/hooks/hr/use-recruitment-interviews';
import { usePermissions } from '@/hooks/use-permissions';
import { useAlumniSignalBulk } from '@/hooks/hr/use-alumni-signal-bulk';
import { AlumniSignalLine } from '../../../_components/alumni-signal-line';
import { StepInterviewDialog } from './step-interview-dialog';
import { OnboardToStaffDialog } from './onboard-to-staff-dialog';
import {
  OnboardingChecklistDialog,
  getOnboardingSteps,
} from './onboarding-checklist-dialog';
import { useStartOnboarding } from '@/hooks/hr/use-recruitment';
import {
  CANDIDATE_STATUS_LABELS,
  INTERVIEW_MODE_LABELS,
  type HRJobApplication,
  type HRRecruitmentCandidate,
  type HRRecruitmentInterview,
} from '@/types/hr-recruitment';
import {
  CHIP_ORDER,
  STAGE_META,
  applicationStage,
  candidateStage,
  stageMeta,
  type StageKey,
} from './stage-model';

// ---- Unified stage model -------------------------------------------------------------
// StageKey, STAGE_META and the two status mappers live in ./stage-model so the
// mapping can be unit-tested without mounting this tab.

interface UnifiedRow {
  key: string;
  name: string;
  email: string;
  phone: string | null;
  qualification: string | null;
  experienceMonths: number | null;
  resumeUrl: string | null;
  submittedAt: string;
  stage: StageKey;
  app: HRJobApplication | null;
  candidate: HRRecruitmentCandidate | null;
}

const fmtExp = (months: number | null) => {
  if (months === null) return null;
  if (months <= 0) return 'Fresher';
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  if (yrs === 0) return `${rem} mo`;
  return rem === 0 ? `${yrs} yr` : `${yrs} yr ${rem} mo`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

// ---- Component -----------------------------------------------------------------------

export function WorkspaceCandidatesTab({ jobId }: { jobId: string }) {
  const { data: appsData, isLoading: appsLoading, error: appsError } =
    useJobApplications({ job_id: jobId, pageSize: 100 });
  const { data: candidates, isLoading: candLoading, error: candError } =
    useCandidatesForJob(jobId);
  // The chain applicants will enter on promotion. Fetched once for the job and
  // passed down, so every pre-promotion row can show the configured route —
  // rows only get their own (frozen) chain once a candidate record exists.
  const { data: flowPreview } = useJobApprovalFlow(jobId);
  // Step-interview gating: one fetch of all this job's sittings, mapped by id.
  const { data: interviewsData } = useInterviews({ job_id: jobId, pageSize: 100 });
  const interviewById = useMemo(
    () => new Map((interviewsData?.data ?? []).map((iv) => [iv.id, iv] as const)),
    [interviewsData],
  );

  const isLoading = appsLoading || candLoading;
  const error = appsError ?? candError;

  const [chip, setChip] = useState<StageKey | 'all'>('all');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClientSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Merge: every application is a row; promoted ones carry their pipeline candidate.
  // Candidates with no surviving application row (edge) still get a row.
  const rows = useMemo<UnifiedRow[]>(() => {
    const apps = appsData?.data ?? [];
    const cands = candidates ?? [];
    const candById = new Map(cands.map((c) => [c.id, c] as const));
    const linkedCandidateIds = new Set<string>();

    const merged: UnifiedRow[] = apps.map((a) => {
      const cand = a.promoted_candidate_id ? candById.get(a.promoted_candidate_id) ?? null : null;
      if (cand) linkedCandidateIds.add(cand.id);
      return {
        key: `app-${a.id}`,
        name: `${a.first_name} ${a.last_name}`.trim(),
        email: a.email,
        phone: a.phone,
        qualification: a.qualification,
        experienceMonths: a.experience_months,
        resumeUrl: a.resume_url,
        submittedAt: a.submitted_at,
        // No cast here: application statuses are NOT a subset of StageKey
        // ('promoted' has no StageKey), so this must go through the mapper.
        stage: cand ? candidateStage(cand.status) : applicationStage(a.status),
        app: a,
        candidate: cand,
      };
    });

    for (const c of cands) {
      if (linkedCandidateIds.has(c.id)) continue;
      merged.push({
        key: `cand-${c.id}`,
        name: c.name,
        email: c.email,
        phone: c.phone ?? null,
        qualification: null,
        experienceMonths: null,
        resumeUrl: c.cvviz_url ?? null,
        submittedAt: c.submitted_at,
        stage: candidateStage(c.status),
        app: null,
        candidate: c,
      });
    }

    return merged.sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
  }, [appsData, candidates]);

  const counts = useMemo(() => {
    const c = new Map<StageKey | 'all', number>([['all', rows.length]]);
    for (const r of rows) c.set(r.stage, (c.get(r.stage) ?? 0) + 1);
    return c;
  }, [rows]);

  const visible = chip === 'all' ? rows : rows.filter((r) => r.stage === chip);

  // T8.5 — JKKN history badges, one bulk fetch for all visible emails.
  const { data: alumniMap } = useAlumniSignalBulk(rows.map((r) => r.email));

  return (
    <div className="space-y-3">
      {/* Quick-filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {CHIP_ORDER.map((key) => {
          const count = counts.get(key) ?? 0;
          if (key !== 'all' && count === 0) return null;
          const active = chip === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setChip(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors cursor-pointer ${
                active
                  ? 'border-primary bg-primary text-primary-foreground font-medium'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
              }`}
            >
              {key === 'all' ? 'All Candidates' : STAGE_META[key].label}
              <span className={`tabular-nums font-semibold ${active ? '' : 'text-foreground'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <div className="h-9 w-9 rounded-full bg-muted/60 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-44 rounded bg-muted/60 animate-pulse" />
                  <div className="h-3 w-72 rounded bg-muted/40 animate-pulse" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && visible.length === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-2 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">
              {chip === 'all' ? 'No candidates yet' : `No ${STAGE_META[chip as StageKey].label.toLowerCase()} candidates`}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {chip === 'all'
                ? 'Applications submitted from the careers page or the Apply flow will appear here.'
                : 'Try another filter.'}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && visible.length > 0 && (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {visible.map((row) => {
              const stepIvId = row.candidate?.approval_chain?.[row.candidate.current_step]?.interview_id;
              return (
                <CandidateRow
                  key={row.key}
                  row={row}
                  userId={userId}
                  stepInterview={stepIvId ? interviewById.get(stepIvId) ?? null : null}
                  alumniSignal={alumniMap ? alumniMap[row.email.toLowerCase().trim()] : null}
                  flowPreview={flowPreview}
                />
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Row + actions -------------------------------------------------------------------

type FlowPreview = ReturnType<typeof useJobApprovalFlow>['data'];

function CandidateRow({
  row, userId, stepInterview, alumniSignal, flowPreview,
}: {
  row: UnifiedRow;
  userId: string | null;
  stepInterview: HRRecruitmentInterview | null;
  alumniSignal: Parameters<typeof AlumniSignalLine>[0]['signal'];
  flowPreview: FlowPreview;
}) {
  const { app, candidate } = row;
  // Defence in depth: a bad stage must not take the whole page down.
  const meta = stageMeta(row.stage);
  const exp = fmtExp(row.experienceMonths);

  return (
    <div className="p-4 space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Avatar + identity stay together; actions drop below on mobile */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {/* Avatar */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {initials(row.name)}
          </div>

          {/* Identity + profile */}
          <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Promoted rows own a candidacy; screening rows only have the
                application, which has its own detail page. Either way the name
                is a link — an unclickable name reads as a broken row. */}
            {candidate || app ? (
              <Link
                href={
                  candidate
                    ? `/hr/recruitment/candidates/${candidate.id}`
                    : `/hr/recruitment/applications/${app!.id}`
                }
                className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
              >
                {row.name}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-foreground">{row.name}</span>
            )}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.badge}`}>
              {meta.label}
            </Badge>
            {candidate?.is_emergency && (
              <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-300 text-[10px] px-1.5 py-0 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Urgent
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 min-w-0">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{row.email}</span>
            </span>
            {row.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {row.phone}
              </span>
            )}
            {exp && <span>{exp}</span>}
            {row.qualification && <span className="truncate">{row.qualification}</span>}
            <span title={new Date(row.submittedAt).toLocaleString()}>
              Applied {fmtDate(row.submittedAt)}
            </span>
          </div>

          {row.resumeUrl && (
            <a
              href={row.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <FileText className="h-3 w-3" />
              Resume
            </a>
          )}

          <AlumniSignalLine signal={alumniSignal} />

          {/* Frozen chain once promoted; the configured route before that. */}
          {candidate ? (
            <ApprovalChainCascade candidate={candidate} userId={userId} />
          ) : (
            <PlannedApprovalChain preview={flowPreview} stage={row.stage} />
          )}

          {/* Step-interview chip — visible to every viewer, actions live on the right */}
          {stepInterview && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${
                stepInterview.status === 'completed'
                  ? 'text-green-700 dark:text-green-300 border-green-500/40 bg-green-50 dark:bg-green-900/20'
                  : stepInterview.status === 'scheduled'
                  ? 'text-blue-700 dark:text-blue-300 border-blue-500/40 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-muted-foreground border-muted bg-muted/30'
              }`}>
                <CalendarClock className="h-3 w-3" />
                Interview {stepInterview.status.replace('_', ' ')}
              </span>
              <span className="text-muted-foreground">
                {new Date(stepInterview.scheduled_at).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
                {' · '}{INTERVIEW_MODE_LABELS[stepInterview.mode]}
                {stepInterview.location_or_link ? ` · ${stepInterview.location_or_link}` : ''}
              </span>
            </p>
          )}

          {app?.review_notes && (
            <p className="text-xs text-muted-foreground italic">
              Screening note: &ldquo;{app.review_notes}&rdquo;
            </p>
          )}
          </div>
        </div>

        {/* Actions — full width on mobile, fixed column on sm+ */}
        <RowActions row={row} userId={userId} stepInterview={stepInterview} />
      </div>
    </div>
  );
}

/**
 * The approval route an applicant will enter when promoted.
 *
 * Shown from the moment someone applies. Until Promote there is no candidate
 * record and therefore no frozen chain, which used to leave this area blank and
 * read as "the approval flow isn't configured" even when it was.
 *
 * Styled flat and dashed on purpose: these steps are NOT in flight. A strip
 * that looked like the live cascade would imply approvals had already started.
 */
function PlannedApprovalChain({
  preview, stage,
}: { preview: FlowPreview; stage: StageKey }) {
  // A screening rejection ends the journey — don't advertise a route nobody walks.
  if (stage === 'rejected' || stage === 'closed') return null;
  if (!preview) return null;

  if (preview.reason !== 'ok') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/50 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs font-medium">
          <AlertTriangle className="h-3 w-3" />
          {preview.reason === 'no_flows'
            ? 'No approval flow configured for this organisation'
            : 'No approval flow routes this role category'}
        </span>
        <Link
          href="/hr/admin/recruitment-approval-flows"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Settings className="h-3 w-3" />
          Configure flow
        </Link>
      </div>
    );
  }

  if (preview.steps.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Approval checklist on promotion &middot;{' '}
        <span className="tabular-nums font-medium text-foreground">{preview.steps.length}</span>{' '}
        {preview.steps.length === 1 ? 'step' : 'steps'}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {preview.steps.map((step, idx) => (
          <span
            key={`planned-step-${idx}`}
            className="inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/40 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            title={`Step ${idx + 1}: ${step.approver_role}${
              step.step_type === 'final' ? ' (final approval)' : ''
            }${step.interview_required ? ' — interview required' : ''}`}
          >
            <span className="tabular-nums opacity-60">{idx + 1}</span>
            {step.approver_role}
            {step.interview_required && <CalendarClock className="h-3 w-3 opacity-70" />}
            {step.step_type === 'final' && <CheckCircle2 className="h-3 w-3 opacity-70" />}
          </span>
        ))}
      </div>
    </div>
  );
}

function ApprovalChainCascade({
  candidate, userId,
}: { candidate: HRRecruitmentCandidate; userId: string | null }) {
  const chain = candidate.approval_chain ?? [];
  const isPending = candidate.status === 'submitted' || candidate.status === 'pending_approval';

  if (chain.length === 0) {
    if (!isPending) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/50 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs font-medium">
          <AlertTriangle className="h-3 w-3" />
          Approval chain not configured — director must backfill
        </span>
        <Link
          href="/hr/admin/recruitment-maintenance"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Settings className="h-3 w-3" />
          Open maintenance
        </Link>
      </div>
    );
  }

  const currentStep = chain[candidate.current_step];
  const awaitingMe =
    isPending && !!userId && currentStep?.approver_user_id === userId;

  return (
    <div className="space-y-1">
      {isPending && (
        <p className="text-xs text-muted-foreground">
          Step {candidate.current_step + 1} of {chain.length} &middot; waiting on{' '}
          <span className="font-medium text-foreground">{currentStep?.approver_role ?? '—'}</span>
          {awaitingMe && (
            <Badge className="ml-1.5 text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
              Awaiting you
            </Badge>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {chain.map((step, idx) => {
          const isApproved = step.status === 'approved';
          const isRejected = step.status === 'rejected';
          const isCurrent = idx === candidate.current_step && !isApproved && !isRejected && isPending;
          const Icon = isApproved ? CheckCircle2 : isCurrent ? Loader2 : isRejected ? AlertCircle : Clock;
          const cls = isApproved
            ? 'text-green-700 dark:text-green-300 border-green-500/40 bg-green-50 dark:bg-green-900/20'
            : isRejected
            ? 'text-red-700 dark:text-red-300 border-red-500/40 bg-red-50 dark:bg-red-900/20'
            : isCurrent
            ? 'text-blue-700 dark:text-blue-300 border-blue-500/40 bg-blue-50 dark:bg-blue-900/20'
            : 'text-muted-foreground border-muted bg-muted/30';
          return (
            <span
              key={`${candidate.id}-step-${idx}`}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${cls}`}
              title={
                step.overridden
                  ? `Step ${idx + 1}: ${step.approver_role} — ${step.status} (overridden; originally for ${step.intended_approver_role ?? step.approver_role})`
                  : `Step ${idx + 1}: ${step.approver_role} — ${step.status}`
              }
            >
              <Icon className={`h-3 w-3 ${isCurrent ? 'animate-spin' : ''}`} />
              {step.approver_role}
              {step.overridden && <span className="ml-0.5 opacity-70">⚑</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function RowActions({
  row, userId, stepInterview,
}: {
  row: UnifiedRow;
  userId: string | null;
  stepInterview: HRRecruitmentInterview | null;
}) {
  const { app, candidate } = row;
  const queryClient = useQueryClient();

  const review = useReviewApplication();
  const promote = usePromoteApplication();
  const approve = useApproveCandidate();
  const rejectCandidate = useRejectCandidate();
  const completeInterview = useCompleteInterview();
  const markNoShow = useMarkNoShow();
  const purge = usePurgeRejectedApplicant();

  // Dialog state
  const [rejectAppOpen, setRejectAppOpen] = useState(false);
  const [rejectAppNotes, setRejectAppNotes] = useState('');
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteEmergency, setPromoteEmergency] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveComment, setApproveComment] = useState('');
  const [rejectCandOpen, setRejectCandOpen] = useState(false);
  const [rejectCandReason, setRejectCandReason] = useState('');
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeSummary, setOutcomeSummary] = useState('');
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState('');

  // ---- Screening actions (application not yet promoted) ----
  const screening = app && !candidate;
  const canShortlist = screening && (app.status === 'pending' || app.status === 'reviewed');
  const canMarkReviewed = screening && app.status === 'pending';
  const canPromote = screening && app.status === 'shortlisted';
  const canRejectApp = screening && app.status !== 'rejected';

  // ---- Pipeline actions (promoted candidate awaiting approval) ----
  const isPendingApproval =
    !!candidate && (candidate.status === 'submitted' || candidate.status === 'pending_approval');
  const chain = candidate?.approval_chain ?? [];
  const chainConfigured = chain.length > 0;
  const currentStep = candidate ? chain[candidate.current_step] : undefined;
  // Override detection (mirrors the server gate in RecruitmentService.approveCandidate):
  // the current step is "mine" if pinned to me, or role-only and I hold that role_key.
  const { permissions, isSuperAdmin, userRoles } = usePermissions();
  const myRoleKeys = useMemo(
    () => new Set((userRoles ?? []).map((r) => (r.role_key ?? '').toLowerCase())),
    [userRoles],
  );
  const isMyStep =
    !!currentStep &&
    (currentStep.approver_user_id
      ? currentStep.approver_user_id === userId
      : !!currentStep.approver_role &&
        myRoleKeys.has(currentStep.approver_role.toLowerCase()));
  const canOverrideStep =
    isSuperAdmin || permissions['hr.recruitment.approve.override'] === true;
  // True when the actor is acting on someone else's step via override.
  const isOverrideAction = isPendingApproval && !isMyStep && canOverrideStep;
  // Legacy chains have no step_type — the last step acts as final.
  const isFinalStep =
    !!candidate &&
    (currentStep?.step_type === 'final' ||
      (currentStep?.step_type === undefined && candidate.current_step === chain.length - 1));
  const decisionLabel = isFinalStep ? 'Final Approve' : 'Mark Reviewed';

  // Interview is OPTIONAL (2026-07-16): interview_required only drives the
  // optional "Schedule Interview" / "Record Outcome" affordances below — it no
  // longer blocks approval. The only hard gate left is a configured chain.
  const needsInterview = isPendingApproval && currentStep?.interview_required === true;
  const interviewCompleted = stepInterview?.status === 'completed';
  const interviewLive = stepInterview?.status === 'scheduled';
  const decisionBlocked = !chainConfigured;
  const decisionBlockedReason = !chainConfigured
    ? 'Approval chain not configured — backfill first'
    : undefined;

  // ---- Onboarding stage (finally approved → checklist → staff) ----
  // 2026-07-06 flow: final approval does NOT create staff. The onboarding
  // checklist (dynamically assigned per role/user) must be started and fully
  // completed first — only then does "Onboard to Staff" unlock (server
  // enforces the same gate).
  const startOnboarding = useStartOnboarding();
  const [checklistOpen, setChecklistOpen] = useState(false);
  const isPostApproval =
    !!candidate &&
    ['approved', 'package_fixed', 'offer_issued'].includes(candidate.status) &&
    !(candidate.role_specific_details as Record<string, unknown> | null)?.staff_record_id;
  const onboardingSteps = candidate ? getOnboardingSteps(candidate) : null;
  const onboardingStarted = !!onboardingSteps && onboardingSteps.length > 0;
  const onboardingDone = onboardingStarted
    ? onboardingSteps.filter((s) => s.completed).length
    : 0;
  const checklistComplete =
    onboardingStarted && onboardingDone === (onboardingSteps?.length ?? 0);
  const canOnboard = isPostApproval && checklistComplete;

  const handleStartOnboarding = () => {
    if (!candidate) return;
    startOnboarding.mutate(candidate.id, {
      onSuccess: () => {
        toast.success('Onboarding checklist started');
        setChecklistOpen(true);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleOutcome = (kind: 'completed' | 'no_show') => {
    if (!stepInterview) return;
    const mutation = kind === 'completed' ? completeInterview : markNoShow;
    mutation.mutate(
      { id: stepInterview.id, outcome_summary: outcomeSummary.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(kind === 'completed' ? 'Interview marked completed' : 'Marked as no-show');
          queryClient.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
          setOutcomeOpen(false);
          setOutcomeSummary('');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleReview = (status: 'reviewed' | 'shortlisted' | 'rejected', notes?: string) => {
    if (!app) return;
    review.mutate(
      { id: app.id, status, review_notes: notes ?? null },
      {
        onSuccess: () => {
          toast.success(
            status === 'shortlisted' ? `${row.name} shortlisted`
            : status === 'rejected' ? `${row.name} rejected`
            : 'Marked as reviewed'
          );
          setRejectAppOpen(false);
          setRejectAppNotes('');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handlePromote = () => {
    if (!app) return;
    promote.mutate(
      { id: app.id, is_emergency: promoteEmergency },
      {
        onSuccess: () => {
          toast.success(`${row.name} moved to the approval pipeline`);
          setPromoteOpen(false);
          setPromoteEmergency(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleApprove = async () => {
    if (!candidate) return;
    if (isOverrideAction && !approveComment.trim()) {
      toast.error("A comment is required to override another approver's step.");
      return;
    }
    try {
      await approve.mutateAsync({ id: candidate.id, comment: approveComment.trim() || undefined });
      toast.success('Candidate approved');
      setApproveOpen(false);
      setApproveComment('');
    } catch (err) {
      const message = (err as Error).message ?? '';
      // BUG-003310 / BUG-003302 — chain already finished elsewhere / stale cache.
      if (message.includes('already been fully approved') || message.includes('Approval chain exhausted')) {
        toast.info('This candidate is no longer pending — refreshing the list.');
        queryClient.invalidateQueries({ queryKey: ['hr-recruitment-job-candidates'] });
        queryClient.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
        setApproveOpen(false);
        setApproveComment('');
        return;
      }
      toast.error(message);
    }
  };

  const handleRejectCandidate = async () => {
    if (!candidate || !rejectCandReason.trim()) return;
    try {
      await rejectCandidate.mutateAsync({ id: candidate.id, reason: rejectCandReason.trim() });
      toast.success('Candidate rejected');
      setRejectCandOpen(false);
      setRejectCandReason('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ---- Permanent delete (super admin, rejected rows only) ----
  // Covers both rejections: a screening-rejected application and a candidate
  // rejected inside the pipeline. The server follows the link between them, so
  // sending either id erases the whole person. Server re-checks both conditions.
  const canPurge = isSuperAdmin && row.stage === 'rejected';
  const purgeArmed = purgeConfirm.trim().toUpperCase() === 'DELETE';

  const handlePurge = async () => {
    if (!purgeArmed) return;
    try {
      const result = await purge.mutateAsync(
        app ? { applicationId: app.id } : { candidateId: candidate!.id },
      );
      toast.success(`${row.name} permanently deleted`, {
        description:
          result.resumes_failed > 0
            ? 'All records removed, but the resume could not be deleted from Drive — it has been logged for cleanup.'
            : 'Application, candidacy and resume have been erased.',
      });
      setPurgeOpen(false);
      setPurgeConfirm('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-1 shrink-0 w-full sm:w-auto sm:min-w-[130px]">
      {/* Screening stage */}
      {canShortlist && (
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start gap-1.5"
          disabled={review.isPending}
          onClick={() => handleReview('shortlisted')}
        >
          <Star className="h-3.5 w-3.5" />
          Shortlist
        </Button>
      )}
      {canPromote && (
        <Button
          size="sm"
          className="w-full justify-start gap-1.5"
          onClick={() => setPromoteOpen(true)}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Promote
        </Button>
      )}
      {canMarkReviewed && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start gap-1.5 text-muted-foreground"
          disabled={review.isPending}
          onClick={() => handleReview('reviewed')}
        >
          <Eye className="h-3.5 w-3.5" />
          Mark reviewed
        </Button>
      )}
      {canRejectApp && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start gap-1.5 text-red-600 dark:text-red-400 hover:text-red-700"
          onClick={() => setRejectAppOpen(true)}
        >
          <XCircle className="h-3.5 w-3.5" />
          Reject
        </Button>
      )}

      {/* Approval stage */}
      {isPendingApproval && (
        <>
          {/* Interview-required steps: schedule / outcome actions come first */}
          {needsInterview && !interviewLive && !interviewCompleted && (
            <Button
              size="sm"
              className="w-full justify-start gap-1.5"
              onClick={() => setInterviewOpen(true)}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Schedule Interview
            </Button>
          )}
          {needsInterview && interviewLive && (
            <>
              <Button
                size="sm"
                className="w-full justify-start gap-1.5"
                onClick={() => setOutcomeOpen(true)}
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Record Outcome
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start gap-1.5"
                onClick={() => setInterviewOpen(true)}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Reschedule
              </Button>
            </>
          )}
          <Button
            size="sm"
            className="w-full"
            variant="default"
            disabled={decisionBlocked}
            title={decisionBlockedReason}
            onClick={() => setApproveOpen(true)}
          >
            {decisionLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setRejectCandOpen(true)}
          >
            Reject
          </Button>
        </>
      )}

      {/* Finally approved → onboarding checklist → staff */}
      {isPostApproval && !onboardingStarted && (
        <Button
          size="sm"
          className="w-full justify-start gap-1.5"
          disabled={startOnboarding.isPending}
          onClick={handleStartOnboarding}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          {startOnboarding.isPending ? 'Starting…' : 'Start Onboarding'}
        </Button>
      )}
      {isPostApproval && onboardingStarted && (
        <Button
          size="sm"
          variant={checklistComplete ? 'outline' : 'default'}
          className="w-full justify-start gap-1.5"
          onClick={() => setChecklistOpen(true)}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Checklist{' '}
          <span className="tabular-nums">
            {onboardingDone}/{onboardingSteps?.length ?? 0}
          </span>
        </Button>
      )}
      {isPostApproval && (
        <Button
          size="sm"
          className="w-full justify-start gap-1.5"
          variant={canOnboard ? 'default' : 'outline'}
          disabled={!canOnboard}
          title={
            canOnboard
              ? undefined
              : !onboardingStarted
              ? 'Start onboarding and complete the checklist first'
              : `Complete the onboarding checklist first (${onboardingDone}/${onboardingSteps?.length ?? 0} done)`
          }
          onClick={() => setOnboardOpen(true)}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Onboard to Staff
        </Button>
      )}

      {/* Rejected → super admin may erase the person entirely */}
      {canPurge && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start gap-1.5 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
          onClick={() => { setPurgeConfirm(''); setPurgeOpen(true); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Permanently
        </Button>
      )}

      {(candidate || app) && (
        <Link
          href={
            candidate
              ? `/hr/recruitment/candidates/${candidate.id}`
              : `/hr/recruitment/applications/${app!.id}`
          }
          className="text-xs text-primary hover:underline text-center pt-0.5"
        >
          View detail
        </Link>
      )}

      {/* Reject application dialog */}
      <Dialog open={rejectAppOpen} onOpenChange={(o) => { if (!o) setRejectAppOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              {row.name} will be marked rejected at the screening stage.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`reject-notes-${row.key}`}>Notes (optional)</Label>
            <Textarea
              id={`reject-notes-${row.key}`}
              value={rejectAppNotes}
              onChange={(e) => setRejectAppNotes(e.target.value)}
              rows={3}
              placeholder="Reason for rejection…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectAppOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={review.isPending}
              onClick={() => handleReview('rejected', rejectAppNotes.trim() || undefined)}
            >
              {review.isPending ? 'Rejecting…' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote dialog */}
      <Dialog open={promoteOpen} onOpenChange={(o) => { if (!o) setPromoteOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote to Approval Pipeline</DialogTitle>
            <DialogDescription>
              Creates the candidacy with a frozen approval chain built from the job&rsquo;s role
              category. This cannot be undone from the screening list.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={promoteEmergency}
              onCheckedChange={(v) => setPromoteEmergency(v === true)}
            />
            Mark as urgent (emergency hire)
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteOpen(false)}>Cancel</Button>
            <Button disabled={promote.isPending} onClick={handlePromote}>
              {promote.isPending ? 'Promoting…' : 'Confirm Promote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review / final-approve / override dialog */}
      <Dialog open={approveOpen} onOpenChange={(o) => { if (!o) setApproveOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isOverrideAction
                ? 'Override Approval'
                : isFinalStep ? 'Final Approval' : 'Mark as Reviewed'}
            </DialogTitle>
            <DialogDescription>
              {isOverrideAction
                ? `You are acting on the step for ${currentStep?.approver_role ?? 'another approver'} on behalf of ${row.name}'s chain. This is recorded as an override.`
                : isFinalStep
                ? `Grants the final approval for ${row.name} — the candidate can then be onboarded to Staff.`
                : `Records your review of ${row.name} and forwards the candidacy to the next approver.`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`approve-comment-${row.key}`}>
              {isOverrideAction
                ? 'Reason for override (required)'
                : isFinalStep ? 'Comment (optional)' : 'Review notes (optional)'}
            </Label>
            <Textarea
              id={`approve-comment-${row.key}`}
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              rows={2}
              placeholder={
                isOverrideAction
                  ? 'Explain why you are approving on their behalf…'
                  : isFinalStep ? 'Final remarks…' : 'Any notes for the next approver…'
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button
              disabled={approve.isPending || (isOverrideAction && !approveComment.trim())}
              onClick={handleApprove}
            >
              {approve.isPending
                ? 'Saving…'
                : isOverrideAction
                ? 'Confirm Override'
                : isFinalStep ? 'Confirm Final Approval' : 'Confirm Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record interview outcome dialog */}
      <Dialog open={outcomeOpen} onOpenChange={(o) => { if (!o) setOutcomeOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Interview Outcome</DialogTitle>
            <DialogDescription>
              {row.name}
              {stepInterview
                ? ` — ${new Date(stepInterview.scheduled_at).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}`
                : ''}
              . Completing the interview unlocks &ldquo;{decisionLabel}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`outcome-summary-${row.key}`}>Outcome summary (optional)</Label>
            <Textarea
              id={`outcome-summary-${row.key}`}
              value={outcomeSummary}
              onChange={(e) => setOutcomeSummary(e.target.value)}
              rows={3}
              placeholder="How did the interview go?"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={completeInterview.isPending || markNoShow.isPending}
              onClick={() => handleOutcome('no_show')}
            >
              {markNoShow.isPending ? 'Saving…' : 'Candidate No-show'}
            </Button>
            <Button
              disabled={completeInterview.isPending || markNoShow.isPending}
              onClick={() => handleOutcome('completed')}
            >
              {completeInterview.isPending ? 'Saving…' : 'Mark Completed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule / reschedule step interview */}
      {candidate && (
        <StepInterviewDialog
          open={interviewOpen}
          onOpenChange={setInterviewOpen}
          candidate={candidate}
          isReschedule={interviewLive}
        />
      )}

      {/* Onboarding checklist */}
      {candidate && isPostApproval && (
        <OnboardingChecklistDialog
          open={checklistOpen}
          onOpenChange={setChecklistOpen}
          candidate={candidate}
          userId={userId}
        />
      )}

      {/* Onboard to staff (unlocked only when the checklist is complete) */}
      {candidate && canOnboard && (
        <OnboardToStaffDialog
          open={onboardOpen}
          onOpenChange={setOnboardOpen}
          candidate={candidate}
          application={app}
          jobTitle={null}
          institutionId={candidate.institution_id}
        />
      )}

      {/* Reject candidate dialog */}
      <Dialog open={rejectCandOpen} onOpenChange={(o) => { if (!o) setRejectCandOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Candidate</DialogTitle>
            <DialogDescription>
              Rejects the candidacy. The submitter will be notified.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`reject-reason-${row.key}`}>
              Rejection Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id={`reject-reason-${row.key}`}
              value={rejectCandReason}
              onChange={(e) => setRejectCandReason(e.target.value)}
              rows={3}
              required
              placeholder="Explain why this candidate is being rejected…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectCandOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectCandReason.trim() || rejectCandidate.isPending}
              onClick={handleRejectCandidate}
            >
              {rejectCandidate.isPending ? 'Rejecting…' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete — irreversible, so it asks for a typed confirmation */}
      <Dialog open={purgeOpen} onOpenChange={(o) => { if (!o) { setPurgeOpen(false); setPurgeConfirm(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete {row.name} permanently
            </DialogTitle>
            <DialogDescription>
              This erases every record of this person. It cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="block font-medium">The following will be destroyed:</span>
              <ul className="mt-1 list-disc pl-4 space-y-0.5 text-xs">
                <li>Application details — name, email, phone, qualification, experience</li>
                {candidate && <li>Candidacy and its full approval history</li>}
                {candidate && <li>Interviews, scorecards, salary packages and comments</li>}
                {row.resumeUrl && <li>The resume file in Google Drive</li>}
              </ul>
            </AlertDescription>
          </Alert>

          <div className="space-y-1.5">
            <Label htmlFor={`purge-confirm-${row.key}`}>
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id={`purge-confirm-${row.key}`}
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPurgeOpen(false); setPurgeConfirm(''); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!purgeArmed || purge.isPending}
              onClick={handlePurge}
            >
              {purge.isPending ? 'Deleting…' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
