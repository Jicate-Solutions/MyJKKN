'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ExternalLink, AlertTriangle, ArrowRight, GraduationCap, Users, Lightbulb, Bug, Briefcase, Calendar, CheckCircle2, Circle, ClipboardCheck, Mail, Phone, Clock, IndianRupee, Building2, AlertCircle, Loader2, Pencil } from 'lucide-react';
import {
  useCandidate,
  usePackages,
  useProposePackage,
  useApprovePackage,
  useCounterPackage,
  useWithdrawCandidate,
  useUpdateCandidateStatus,
  useApproveCandidate,
  useRejectCandidate,
  useUpdateStepComment,
} from '@/hooks/hr/use-recruitment';
import { useAlumniSignal } from '@/hooks/hr/use-alumni-signal';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { CandidateDiscussionThread } from '../../_components/candidate-discussion-thread';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  CANDIDATE_STATUS_LABELS,
  ROLE_CATEGORY_LABELS,
  MONTHLY_SALARY_BAND_LABELS,
  type CandidateStatus,
  type HRRecruitmentCandidatePackage,
} from '@/types/hr-recruitment';
import { toast } from 'sonner';

// Status colour map (matches my/page.tsx)
const STATUS_COLORS: Record<CandidateStatus, string> = {
  submitted:        'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  pending_approval: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  approved:         'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  package_fixed:    'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  offer_issued:     'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  joined:           'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200',
  rejected:         'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
  withdrawn:        'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
  offer_rescinded:  'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
  no_show:          'bg-orange-100 text-orange-900 dark:bg-orange-900/20 dark:text-orange-200',
};

const PACKAGE_STATUS_COLORS: Record<HRRecruitmentCandidatePackage['status'], string> = {
  proposed: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  approved:  'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  countered: 'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  rejected:  'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
};

// Salary is optional on a package — show the fallback when it wasn't decided yet.
function formatSalary(amount: number | null | undefined, fallback = '—'): string {
  if (amount === null || amount === undefined) return fallback;
  return `₹${amount.toLocaleString('en-IN')}`;
}

// Two-letter initials for the sidebar avatar.
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

// Minimal/neutral status accent — a left border on the identity card and a
// small dot on the status pill, driven by the candidate's status.
const STATUS_ACCENT: Record<CandidateStatus, string> = {
  submitted:        'border-l-yellow-400',
  pending_approval: 'border-l-yellow-400',
  approved:         'border-l-green-500',
  package_fixed:    'border-l-blue-500',
  offer_issued:     'border-l-blue-500',
  joined:           'border-l-emerald-500',
  rejected:         'border-l-red-500',
  withdrawn:        'border-l-gray-400',
  offer_rescinded:  'border-l-gray-400',
  no_show:          'border-l-orange-500',
};
const STATUS_DOT: Record<CandidateStatus, string> = {
  submitted:        'bg-yellow-500',
  pending_approval: 'bg-yellow-500',
  approved:         'bg-green-500',
  package_fixed:    'bg-blue-500',
  offer_issued:     'bg-blue-500',
  joined:           'bg-emerald-500',
  rejected:         'bg-red-500',
  withdrawn:        'bg-gray-400',
  offer_rescinded:  'bg-gray-400',
  no_show:          'bg-orange-500',
};

export default function CandidateDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const { data: candidate, isLoading } = useCandidate(id);
  const { data: alumniSignal } = useAlumniSignal(id);
  const { data: packages = [] } = usePackages(id);
  const propose = useProposePackage();
  const approvePackage = useApprovePackage();
  const counterPackage = useCounterPackage();
  const withdraw = useWithdrawCandidate();
  const updateStatus = useUpdateCandidateStatus();
  const approve = useApproveCandidate();
  const rejectCand = useRejectCandidate();
  const { permissions, isSuperAdmin, userRoles } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();
  const institutionName = useMemo(
    () => institutions.find((i) => i.id === candidate?.institution_id)?.name,
    [institutions, candidate?.institution_id],
  );

  // ζ FINDING #5 (PR #943) — Onboarding read-side rendering + (this PR, κ) toggle wiring.
  // role_specific_details.onboarding_steps is populated by
  // /api/hr/recruitment/candidates/[id]/onboarding/start (POST).
  // Editors (super_admin / hr_officer / hr_head / director_jkkn) can now toggle
  // individual steps via POST /onboarding/complete-step; others see read-only.
  const { profile } = useAuth();
  const qc = useQueryClient();
  const canEditOnboarding = useMemo(() => {
    if (!profile) return false;
    if (profile.is_super_admin === true) return true;
    const roles = profile.user_roles ?? [];
    return roles.some(
      (r) =>
        r.role_key === 'hr_officer' ||
        r.role_key === 'hr_head' ||
        r.role_key === 'director_jkkn'
    );
  }, [profile]);
  // Index of the step currently being toggled (so we can disable that row only).
  const [togglingStepIndex, setTogglingStepIndex] = useState<number | null>(null);

  // Approval-chain override context (mirrors the workspace + pending list):
  // the current step is "mine" if pinned to me, or role-only and I hold that
  // role_key. Anyone else who holds hr.recruitment.approve.override (or is
  // super-admin) can act as an OVERRIDE.
  const myRoleKeys = useMemo(
    () => new Set((userRoles ?? []).map((r) => (r.role_key ?? '').toLowerCase())),
    [userRoles],
  );
  const [stepApproveOpen, setStepApproveOpen] = useState(false);
  const [stepApproveComment, setStepApproveComment] = useState('');
  const [stepRejectOpen, setStepRejectOpen] = useState(false);
  const [stepRejectReason, setStepRejectReason] = useState('');
  // Edit a decided step's review comment.
  const updateStepComment = useUpdateStepComment();
  const [editStepIndex, setEditStepIndex] = useState<number | null>(null);
  const [editStepComment, setEditStepComment] = useState('');

  // POST the toggle, then invalidate the candidate cache so the section re-renders.
  const toggleOnboardingStep = async (stepIndex: number, nextCompleted: boolean) => {
    setTogglingStepIndex(stepIndex);
    try {
      const res = await fetch(
        `/api/hr/recruitment/candidates/${id}/onboarding/complete-step`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step_index: stepIndex, completed: nextCompleted }),
        }
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(errBody.error || `Failed to update step (HTTP ${res.status})`);
        return;
      }
      toast.success(nextCompleted ? 'Step marked complete' : 'Step reopened');
      await qc.invalidateQueries({ queryKey: ['hr-recruitment-candidate', id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setTogglingStepIndex(null);
    }
  };

  // Salary breakdown is captured as 5 typed number fields (Basic / HRA / DA /
  // Special / Other) instead of a raw JSON textarea. On submit we fold the
  // non-zero fields into a Record<string, number> for the existing API.
  type SalaryBreakdown = {
    basic: string;
    hra: string;
    da: string;
    special: string;
    other: string;
  };
  const EMPTY_BREAKDOWN: SalaryBreakdown = { basic: '', hra: '', da: '', special: '', other: '' };
  const BREAKDOWN_FIELDS: Array<{ key: keyof SalaryBreakdown; label: string }> = [
    { key: 'basic',   label: 'Basic' },
    { key: 'hra',     label: 'HRA' },
    { key: 'da',      label: 'DA' },
    { key: 'special', label: 'Special Allowance' },
    { key: 'other',   label: 'Other' },
  ];
  const breakdownToJson = (b: SalaryBreakdown): Record<string, number> | null => {
    const out: Record<string, number> = {};
    for (const { key } of BREAKDOWN_FIELDS) {
      const raw = b[key].trim();
      if (!raw) continue;
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0) out[key] = n;
    }
    return Object.keys(out).length > 0 ? out : null;
  };

  // Propose package dialog
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeSalary, setProposeCtc] = useState('');
  const [proposeBreakdown, setProposeBreakdown] = useState<SalaryBreakdown>(EMPTY_BREAKDOWN);
  const [proposeIsCounter, setProposeIsCounter] = useState(false);
  const [proposeParentId, setProposeParentId] = useState('');
  const [proposeNotes, setProposeNotes] = useState('');

  const onPropose = async (e: React.FormEvent) => {
    e.preventDefault();
    // Salary is optional — blank means "not decided yet" and is stored as NULL.
    const rawSalary = proposeSalary.trim();
    const monthlySalary = rawSalary ? parseFloat(rawSalary) : null;
    if (monthlySalary !== null && (isNaN(monthlySalary) || monthlySalary <= 0)) {
      toast.error('Enter a valid Monthly Salary, or leave it blank');
      return;
    }

    const breakdown = breakdownToJson(proposeBreakdown);

    try {
      await propose.mutateAsync({
        candidate_id: id,
        hr_organization_id: candidate?.hr_organization_id ?? null,
        proposed_monthly_salary: monthlySalary,
        proposed_monthly_salary_breakdown: breakdown,
        is_counter_offer: proposeIsCounter,
        parent_package_id: proposeIsCounter && proposeParentId ? proposeParentId : null,
        notes: proposeNotes.trim() || null,
        proposed_by: '', // server fills
      });
      toast.success('Package proposed');
      setProposeOpen(false);
      setProposeCtc('');
      setProposeBreakdown(EMPTY_BREAKDOWN);
      setProposeIsCounter(false);
      setProposeParentId('');
      setProposeNotes('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Counter offer dialog
  const [counterPackageId, setCounterPackageId] = useState<string | null>(null);
  const [counterCtc, setCounterCtc] = useState('');
  const [counterBreakdown, setCounterBreakdown] = useState<SalaryBreakdown>(EMPTY_BREAKDOWN);
  const [counterNotes, setCounterNotes] = useState('');

  const onCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterPackageId) return;
    // Salary is optional — blank means "not decided yet" and is stored as NULL.
    const rawSalary = counterCtc.trim();
    const monthlySalary = rawSalary ? parseFloat(rawSalary) : null;
    if (monthlySalary !== null && (isNaN(monthlySalary) || monthlySalary <= 0)) {
      toast.error('Enter a valid Monthly Salary, or leave it blank');
      return;
    }

    const breakdown = breakdownToJson(counterBreakdown);

    try {
      await counterPackage.mutateAsync({
        candidateId: id,
        packageId: counterPackageId,
        proposed_monthly_salary: monthlySalary,
        proposed_monthly_salary_breakdown: breakdown,
        notes: counterNotes.trim() || null,
        hr_organization_id: candidate?.hr_organization_id ?? null,
      });
      toast.success('Counter offer submitted');
      setCounterPackageId(null);
      setCounterCtc('');
      setCounterBreakdown(EMPTY_BREAKDOWN);
      setCounterNotes('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Withdraw
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');

  const onWithdraw = async () => {
    try {
      await withdraw.mutateAsync({ id, reason: withdrawReason.trim() || undefined });
      toast.success('Candidate withdrawn');
      setWithdrawOpen(false);
      setWithdrawReason('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Mark joined
  const onMarkJoined = async () => {
    try {
      await updateStatus.mutateAsync({ id, status: 'joined' });
      toast.success('Marked as joined');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="Loading…">
        <div className="mt-6 space-y-3 max-w-3xl">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-md p-4">
              <div className="space-y-2">
                <div className="h-5 w-56 rounded bg-muted/60 animate-pulse" />
                <div className="h-4 w-80 rounded bg-muted/40 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </ContentLayout>
    );
  }

  if (!candidate) {
    return (
      <ContentLayout title="Not Found">
        <p className="text-sm text-muted-foreground mt-6">Candidate not found.</p>
      </ContentLayout>
    );
  }

  const approvalChain = candidate.approval_chain ?? [];
  const canWithdraw = ['submitted', 'pending_approval'].includes(candidate.status);
  const canMarkJoined = ['offer_issued', 'approved'].includes(candidate.status);

  // Current-step approval action context.
  const currentStep = approvalChain[candidate.current_step];
  const isPendingApproval = ['submitted', 'pending_approval'].includes(candidate.status);
  const isMyStep =
    !!currentStep &&
    (currentStep.approver_user_id
      ? currentStep.approver_user_id === profile?.id
      : !!currentStep.approver_role &&
        myRoleKeys.has(currentStep.approver_role.toLowerCase()));
  const canOverrideStep =
    isSuperAdmin || permissions['hr.recruitment.approve.override'] === true;
  const isStepOverride = isPendingApproval && !isMyStep && canOverrideStep;
  // Legacy chains have no step_type — the last step acts as final.
  const isFinalStep =
    currentStep?.step_type === 'final' ||
    (currentStep?.step_type === undefined && candidate.current_step === approvalChain.length - 1);
  const stepDecisionLabel = isFinalStep ? 'Final Approve' : 'Mark Reviewed';

  const handleStepApprove = async () => {
    if (isStepOverride && !stepApproveComment.trim()) {
      toast.error("A comment is required to override another approver's step.");
      return;
    }
    try {
      await approve.mutateAsync({ id, comment: stepApproveComment.trim() || undefined });
      toast.success(isFinalStep ? 'Candidate approved' : 'Step reviewed');
      setStepApproveOpen(false);
      setStepApproveComment('');
    } catch (err) {
      const m = (err as Error).message ?? '';
      if (m.includes('already been fully approved') || m.includes('Approval chain exhausted')) {
        toast.info('This candidate is no longer pending — refreshing.');
        setStepApproveOpen(false);
        setStepApproveComment('');
        return;
      }
      toast.error(m);
    }
  };

  const handleStepReject = async () => {
    if (!stepRejectReason.trim()) return;
    try {
      await rejectCand.mutateAsync({ id, reason: stepRejectReason.trim() });
      toast.success('Candidate rejected');
      setStepRejectOpen(false);
      setStepRejectReason('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // A decided step's comment is editable by its author, super-admin, or an
  // override-key holder (server re-checks the same rule).
  const canEditStepComment = (step: (typeof approvalChain)[number]) =>
    (step.status === 'approved' || step.status === 'rejected') &&
    (step.decided_by === profile?.id ||
      isSuperAdmin ||
      permissions['hr.recruitment.approve.override'] === true);

  const openEditStepComment = (idx: number, current: string) => {
    setEditStepIndex(idx);
    setEditStepComment(current);
  };

  const handleSaveStepComment = async () => {
    if (editStepIndex === null) return;
    try {
      await updateStepComment.mutateAsync({
        id,
        stepIndex: editStepIndex,
        comment: editStepComment.trim(),
      });
      toast.success('Comment updated');
      setEditStepIndex(null);
      setEditStepComment('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <ContentLayout title="Candidate Detail">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{candidate.name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 grid gap-4 items-start lg:grid-cols-[320px_minmax(0,1fr)]">

        {/* ============ SIDEBAR — identity, facts, primary actions ============ */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <Card className={`border-l-4 ${STATUS_ACCENT[candidate.status]}`}>
            <CardContent className="p-4 space-y-3">
              {/* Avatar + name */}
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-base font-semibold">
                  {initials(candidate.name)}
                </div>
                <div className="min-w-0">
                  <h1 className="text-base font-semibold leading-tight">{candidate.name}</h1>
                  <p className="text-xs text-muted-foreground truncate">{candidate.role_title}</p>
                </div>
              </div>

              {/* Status + category */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${STATUS_COLORS[candidate.status]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[candidate.status]}`} />
                  {CANDIDATE_STATUS_LABELS[candidate.status]}
                </span>
                <span className="text-xs text-muted-foreground">{ROLE_CATEGORY_LABELS[candidate.role_category]}</span>
              </div>

              {/* Flags */}
              {(candidate.is_emergency || candidate.is_internal_transfer) && (
                <div className="flex flex-wrap gap-1.5">
                  {candidate.is_emergency && (
                    <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-300 flex items-center gap-1 text-[10px]">
                      <AlertTriangle className="h-3 w-3" /> Urgent
                    </Badge>
                  )}
                  {candidate.is_internal_transfer && (
                    <Badge variant="outline" className="border-blue-500 text-blue-700 dark:text-blue-300 text-[10px]">
                      Internal Transfer
                    </Badge>
                  )}
                </div>
              )}

              <div className="border-t border-border" />

              {/* Key facts */}
              <dl className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">Email</span>
                  <span className="ml-auto font-medium truncate max-w-[170px]" title={candidate.email}>{candidate.email}</span>
                </div>
                {candidate.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">Phone</span>
                    <span className="ml-auto font-medium">{candidate.phone}</span>
                  </div>
                )}
                {candidate.proposed_monthly_salary_band && (
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">Salary Band</span>
                    <span className="ml-auto font-medium text-right">{MONTHLY_SALARY_BAND_LABELS[candidate.proposed_monthly_salary_band]}</span>
                  </div>
                )}
                {candidate.expected_joining_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">Expected Joining</span>
                    <span className="ml-auto font-medium">{candidate.expected_joining_date}</span>
                  </div>
                )}
                {candidate.actual_joining_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">Actual Joining</span>
                    <span className="ml-auto font-medium">{candidate.actual_joining_date}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">Submitted</span>
                  <span className="ml-auto font-medium">{new Date(candidate.submitted_at ?? candidate.created_at).toLocaleDateString()}</span>
                </div>
                {candidate.institution_id && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">Institution</span>
                    <span
                      className="ml-auto font-medium truncate max-w-[170px] text-right"
                      title={institutionName ?? candidate.institution_id}
                    >
                      {institutionName ?? '—'}
                    </span>
                  </div>
                )}
              </dl>

              {candidate.cvviz_url && (
                <a
                  href={candidate.cvviz_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium text-primary hover:bg-muted/50 transition-colors"
                >
                  View CVViz Profile <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {candidate.rejection_reason && (
                <div className="text-xs text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded p-2">
                  <span className="font-medium">Rejected:</span> {candidate.rejection_reason}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Primary actions */}
          {(canWithdraw || canMarkJoined) && (
            <div className="flex flex-col gap-2">
              {canMarkJoined && (
                <Button className="w-full" onClick={onMarkJoined} disabled={updateStatus.isPending}>
                  <ArrowRight className="h-4 w-4 mr-1" />
                  {updateStatus.isPending ? 'Updating…' : 'Mark as Joined'}
                </Button>
              )}
              {canWithdraw && (
                <Button variant="outline" className="w-full" onClick={() => setWithdrawOpen(true)} disabled={withdraw.isPending}>
                  Withdraw Candidate
                </Button>
              )}
            </div>
          )}
        </aside>

        {/* ============ MAIN COLUMN — workflow ============ */}
        <div className="space-y-4 min-w-0">

        {/* 2. JKKN History panel — R4.3 Alumni Signals */}
        {alumniSignal && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                JKKN History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {/* Academic record — only when graduation_year is real (>0).
                    For staff-only matches the service returns 0 here. */}
                {alumniSignal.graduation_year > 0 && (
                  <li className="flex items-start gap-2">
                    <GraduationCap className="h-4 w-4 mt-0.5 shrink-0 text-indigo-500" />
                    <span>
                      {[
                        alumniSignal.course_name,
                        String(alumniSignal.graduation_year),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                )}

                {/* T8.5 — Staff tenure (former / current JKKN staff) */}
                {alumniSignal.staff_tenure && (
                  <li className="flex items-start gap-2">
                    <Briefcase className="h-4 w-4 mt-0.5 shrink-0 text-cyan-600" />
                    <span>
                      {alumniSignal.staff_tenure.still_active
                        ? 'Current JKKN Staff'
                        : 'Former JKKN Staff'}
                      {alumniSignal.staff_tenure.years > 0 && (
                        <> &mdash; {alumniSignal.staff_tenure.years} year
                          {alumniSignal.staff_tenure.years === 1 ? '' : 's'}</>
                      )}
                      {alumniSignal.staff_tenure.designation && (
                        <> &middot; {alumniSignal.staff_tenure.designation}</>
                      )}
                    </span>
                  </li>
                )}

                {/* Learners Council role */}
                {alumniSignal.council_role && (
                  <li className="flex items-start gap-2">
                    <Users className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />
                    <span>
                      Learners Council &mdash;{' '}
                      {alumniSignal.council_role.position_title},{' '}
                      {alumniSignal.council_role.term_name}
                    </span>
                  </li>
                )}

                {/* T8.5 — LC committees served */}
                {alumniSignal.lc_committee_count !== undefined && (
                  <li className="flex items-start gap-2">
                    <Users className="h-4 w-4 mt-0.5 shrink-0 text-fuchsia-500" />
                    <span>
                      LC Committees &mdash;{' '}
                      {alumniSignal.lc_committee_count}{' '}
                      {alumniSignal.lc_committee_count === 1 ? 'committee' : 'committees'}
                    </span>
                  </li>
                )}

                {/* T8.5 — LC events attended */}
                {alumniSignal.lc_events_attended !== undefined && (
                  <li className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-0.5 shrink-0 text-teal-500" />
                    <span>
                      LC Events &mdash;{' '}
                      {alumniSignal.lc_events_attended}{' '}
                      {alumniSignal.lc_events_attended === 1 ? 'event' : 'events'}
                    </span>
                  </li>
                )}

                {/* Solutions Hub contributions */}
                {alumniSignal.sh_contributions !== undefined && (
                  <li className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                    <span>
                      Solutions Hub &mdash;{' '}
                      {alumniSignal.sh_contributions}{' '}
                      {alumniSignal.sh_contributions === 1
                        ? 'contribution'
                        : 'contributions'}
                    </span>
                  </li>
                )}

                {/* Bug reports filed */}
                {alumniSignal.bug_reports_filed !== undefined && (
                  <li className="flex items-start gap-2">
                    <Bug className="h-4 w-4 mt-0.5 shrink-0 text-rose-500" />
                    <span>
                      Bug Reports &mdash;{' '}
                      {alumniSignal.bug_reports_filed} filed
                    </span>
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* 3. Approval chain timeline (renumbered from 2) */}
        {approvalChain.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Approval Chain</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative ml-2 space-y-4">
                {approvalChain.map((step, idx) => {
                  const isActive = idx === candidate.current_step;
                  const isCurrentPending = isActive && step.status === 'pending';
                  const StepIcon =
                    step.status === 'approved' ? CheckCircle2 :
                    step.status === 'rejected' ? AlertCircle :
                    isCurrentPending ? Loader2 : Circle;
                  const iconColor =
                    step.status === 'approved' ? 'text-green-500' :
                    step.status === 'rejected' ? 'text-red-500' :
                    isCurrentPending ? 'text-yellow-500' : 'text-muted-foreground/40';

                  return (
                    <li key={idx} className="flex items-start gap-3 text-sm">
                      {/* Vertical connector */}
                      <div className="relative flex flex-col items-center">
                        <StepIcon className={`h-4 w-4 mt-0.5 shrink-0 ${iconColor} ${isCurrentPending ? 'animate-spin' : ''}`} />
                        {idx < approvalChain.length - 1 && (
                          <span className="w-px flex-1 bg-border mt-1.5 min-h-[1.25rem]" />
                        )}
                      </div>
                      <div className={`flex-1 pb-2 ${isCurrentPending ? '-mx-2 rounded-md bg-yellow-50/60 px-2 py-1.5 dark:bg-yellow-900/10' : ''}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">Step {step.step_order ?? idx + 1}:</span>
                          <span>{step.approver_role}</span>
                          <span className="text-xs text-muted-foreground">({step.status})</span>
                          {isActive && step.status === 'pending' && (
                            <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700 dark:text-yellow-300">
                              Current
                            </Badge>
                          )}
                        </div>
                        {step.decided_at && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(step.decided_at).toLocaleString()}
                          </p>
                        )}
                        {(step as any).comment ? (
                          <div className="mt-0.5 flex items-start gap-1.5">
                            <p className="flex-1 text-xs text-muted-foreground italic">
                              &ldquo;{(step as any).comment}&rdquo;
                              {(step as any).edited_at && (
                                <span className="ml-1 not-italic opacity-60">(edited)</span>
                              )}
                            </p>
                            {canEditStepComment(step) && (
                              <button
                                type="button"
                                onClick={() => openEditStepComment(idx, (step as any).comment ?? '')}
                                className="shrink-0 text-muted-foreground hover:text-foreground"
                                aria-label="Edit comment"
                                title="Edit comment"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          canEditStepComment(step) && (
                            <button
                              type="button"
                              onClick={() => openEditStepComment(idx, '')}
                              className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-3 w-3" /> Add note
                            </button>
                          )
                        )}
                        {/* Actions on the current pending step */}
                        {isActive && step.status === 'pending' && isPendingApproval && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => setStepApproveOpen(true)}>
                              {isStepOverride ? `Override — ${stepDecisionLabel}` : stepDecisionLabel}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setStepRejectOpen(true)}>
                              Reject
                            </Button>
                            {isStepOverride && (
                              <span className="text-xs text-muted-foreground">
                                Acting on {step.approver_role}&rsquo;s step
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* 4. Onboarding progress (ζ FINDING #5) — only for joined candidates with stamped steps */}
        {candidate.status === 'joined' && Array.isArray((candidate.role_specific_details as Record<string, unknown> | undefined)?.onboarding_steps) && ((candidate.role_specific_details as Record<string, unknown>).onboarding_steps as unknown[]).length > 0 && (() => {
          const details = (candidate.role_specific_details ?? {}) as Record<string, unknown>;
          const steps = details.onboarding_steps as Array<{
            index: number;
            step: string;
            completed: boolean;
            completed_at: string | null;
            completed_by: string | null;
          }>;
          const checklistName = (details.onboarding_checklist_name as string | undefined) ?? null;
          const startedAt = (details.onboarding_started_at as string | undefined) ?? null;
          const completedCount = steps.filter((s) => s.completed).length;
          const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

          return (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                      Onboarding Progress
                    </CardTitle>
                    {checklistName && (
                      <p className="text-xs text-muted-foreground mt-0.5">{checklistName}</p>
                    )}
                    {startedAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Started {new Date(startedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {completedCount} / {steps.length} done · {progressPct}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                <ol className="space-y-2">
                  {steps.map((s) => {
                    const isToggling = togglingStepIndex === s.index;
                    const IconEl = s.completed ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Completed" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Pending" />
                    );
                    return (
                      <li
                        key={s.index}
                        className={`flex items-start gap-2 text-sm border rounded px-2 py-1.5 ${s.completed ? 'bg-emerald-50/40 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/40' : ''}`}
                      >
                        {canEditOnboarding ? (
                          <button
                            type="button"
                            onClick={() => toggleOnboardingStep(s.index, !s.completed)}
                            disabled={isToggling}
                            aria-label={s.completed ? `Mark "${s.step}" pending` : `Mark "${s.step}" complete`}
                            aria-pressed={s.completed}
                            className="mt-0.5 shrink-0 rounded-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {IconEl}
                          </button>
                        ) : (
                          <span className="mt-0.5">{IconEl}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground font-mono">{s.index + 1}.</span>
                            <span className={s.completed ? 'line-through text-muted-foreground' : ''}>{s.step}</span>
                          </div>
                          {s.completed && s.completed_at && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Completed {new Date(s.completed_at).toLocaleString()}
                              {s.completed_by && (
                                <> &middot; <span className="font-mono">{s.completed_by.slice(0, 8)}…</span></>
                              )}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {canEditOnboarding && (
                  <p className="text-xs text-muted-foreground mt-3 italic">
                    Click the circle on the left of any step to toggle its completion.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* 5. Package negotiation history */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">Salary Negotiation</CardTitle>
              <Button size="sm" onClick={() => setProposeOpen(true)}>
                Propose Package
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No packages proposed yet.{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => setProposeOpen(true)}>
                  Propose one &rarr;
                </button>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-1 pr-3 font-medium">Proposed Monthly Salary</th>
                      <th className="text-left py-1 pr-3 font-medium">Proposed By</th>
                      <th className="text-left py-1 pr-3 font-medium">Type</th>
                      <th className="text-left py-1 pr-3 font-medium">Status</th>
                      <th className="text-left py-1 pr-3 font-medium">Approved At</th>
                      <th className="text-left py-1 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map((pkg) => (
                      <tr key={pkg.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-3 font-medium">{formatSalary(pkg.proposed_monthly_salary)}</td>
                        <td className="py-2 pr-3 font-mono text-xs max-w-[120px] truncate">{pkg.proposed_by}</td>
                        <td className="py-2 pr-3">
                          {pkg.is_counter_offer ? (
                            <Badge variant="outline" className="text-xs">Counter</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Initial</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PACKAGE_STATUS_COLORS[pkg.status]}`}>
                            {pkg.status.charAt(0).toUpperCase() + pkg.status.slice(1)}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {pkg.approved_at ? new Date(pkg.approved_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2">
                          {pkg.status === 'proposed' && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline"
                                onClick={() => approvePackage.mutate({ candidateId: id, packageId: pkg.id })}
                                disabled={approvePackage.isPending}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setCounterPackageId(pkg.id);
                                  setCounterCtc('');
                                  setCounterBreakdown(EMPTY_BREAKDOWN);
                                  setCounterNotes('');
                                }}
                              >
                                Counter
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 6. Discussion thread */}
        <CandidateDiscussionThread candidateId={id} />
        </div>{/* end main column */}
      </div>{/* end two-column grid */}

      {/* Propose package dialog */}
      <Dialog open={proposeOpen} onOpenChange={setProposeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose Monthly Salary Package</DialogTitle>
          </DialogHeader>
          <form onSubmit={onPropose} className="space-y-3">
            <div>
              <Label htmlFor="proposeSalary">
                Monthly Salary (₹){' '}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="proposeSalary"
                type="number"
                value={proposeSalary}
                onChange={(e) => setProposeCtc(e.target.value)}
                placeholder="e.g. 50000"
                min="1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank if the figure isn&apos;t decided yet.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Salary Breakdown (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Split the monthly salary into components. Leave a row blank or
                zero to skip it.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {BREAKDOWN_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <Label htmlFor={`proposeBreakdown_${key}`} className="text-xs font-normal text-muted-foreground">
                      {label}
                    </Label>
                    <Input
                      id={`proposeBreakdown_${key}`}
                      type="number"
                      min="0"
                      value={proposeBreakdown[key]}
                      onChange={(e) =>
                        setProposeBreakdown((b) => ({ ...b, [key]: e.target.value }))
                      }
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="proposeNotes">Notes</Label>
              <Textarea
                id="proposeNotes"
                value={proposeNotes}
                onChange={(e) => setProposeNotes(e.target.value)}
                rows={2}
                placeholder="Any additional notes…"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="proposeIsCounter"
                type="checkbox"
                checked={proposeIsCounter}
                onChange={(e) => setProposeIsCounter(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="proposeIsCounter" className="text-sm font-normal cursor-pointer">
                This is a counter offer
              </Label>
            </div>
            {proposeIsCounter && packages.length > 0 && (
              <div>
                <Label htmlFor="proposeParentId">Counter to which package?</Label>
                <select
                  id="proposeParentId"
                  value={proposeParentId}
                  onChange={(e) => setProposeParentId(e.target.value)}
                  className="w-full border rounded-md h-10 px-3 bg-background mt-1"
                >
                  <option value="">Select parent package…</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {formatSalary(pkg.proposed_monthly_salary, 'Amount not set')} — {pkg.status}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProposeOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={propose.isPending}>
                {propose.isPending ? 'Proposing…' : 'Propose Package'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Counter offer dialog */}
      <Dialog open={!!counterPackageId} onOpenChange={(open) => { if (!open) setCounterPackageId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Counter Offer</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCounter} className="space-y-3">
            <div>
              <Label htmlFor="counterCtc">
                Counter Monthly Salary Amount (₹){' '}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="counterCtc"
                type="number"
                value={counterCtc}
                onChange={(e) => setCounterCtc(e.target.value)}
                placeholder="e.g. 45000"
                min="1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank if the figure isn&apos;t decided yet.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Salary Breakdown (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Split the counter-offer monthly salary into components. Leave a
                row blank or zero to skip it.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {BREAKDOWN_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <Label htmlFor={`counterBreakdown_${key}`} className="text-xs font-normal text-muted-foreground">
                      {label}
                    </Label>
                    <Input
                      id={`counterBreakdown_${key}`}
                      type="number"
                      min="0"
                      value={counterBreakdown[key]}
                      onChange={(e) =>
                        setCounterBreakdown((b) => ({ ...b, [key]: e.target.value }))
                      }
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="counterNotes">Notes</Label>
              <Textarea
                id="counterNotes"
                value={counterNotes}
                onChange={(e) => setCounterNotes(e.target.value)}
                rows={2}
                placeholder="Reason for counter offer…"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCounterPackageId(null)}>Cancel</Button>
              <Button type="submit" disabled={counterPackage.isPending}>
                {counterPackage.isPending ? 'Submitting…' : 'Submit Counter Offer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Withdraw dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will remove the candidacy from the active approval queue.
            </p>
            <div>
              <Label htmlFor="withdrawReason">Reason (optional)</Label>
              <Textarea
                id="withdrawReason"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                rows={2}
                placeholder="Why are you withdrawing this candidate?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={onWithdraw}
              disabled={withdraw.isPending}
            >
              {withdraw.isPending ? 'Withdrawing…' : 'Confirm Withdraw'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step approve / review / override dialog */}
      <Dialog open={stepApproveOpen} onOpenChange={(o) => { if (!o) setStepApproveOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isStepOverride ? 'Override Approval' : isFinalStep ? 'Final Approval' : 'Mark as Reviewed'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {isStepOverride && (
              <p className="text-sm text-muted-foreground">
                You are acting on the {currentStep?.approver_role} step on behalf of the assigned approver.
                This is recorded as an override.
              </p>
            )}
            <Label htmlFor="step-approve-comment">
              {isStepOverride
                ? 'Reason for override (required)'
                : isFinalStep ? 'Comment (optional)' : 'Review notes (optional)'}
            </Label>
            <Textarea
              id="step-approve-comment"
              value={stepApproveComment}
              onChange={(e) => setStepApproveComment(e.target.value)}
              rows={2}
              placeholder={
                isStepOverride
                  ? 'Explain why you are approving on their behalf…'
                  : isFinalStep ? 'Final remarks…' : 'Any notes for the next approver…'
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStepApproveOpen(false)}>Cancel</Button>
            <Button
              disabled={approve.isPending || (isStepOverride && !stepApproveComment.trim())}
              onClick={handleStepApprove}
            >
              {approve.isPending
                ? 'Saving…'
                : isStepOverride ? 'Confirm Override' : isFinalStep ? 'Confirm Final Approval' : 'Confirm Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step reject dialog */}
      <Dialog open={stepRejectOpen} onOpenChange={(o) => { if (!o) setStepRejectOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This rejects the candidate and ends the approval chain.
            </p>
            <Label htmlFor="step-reject-reason">Reason (required)</Label>
            <Textarea
              id="step-reject-reason"
              value={stepRejectReason}
              onChange={(e) => setStepRejectReason(e.target.value)}
              rows={2}
              placeholder="Why is this candidate being rejected…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStepRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!stepRejectReason.trim() || rejectCand.isPending}
              onClick={handleStepReject}
            >
              {rejectCand.isPending ? 'Rejecting…' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit step comment dialog */}
      <Dialog open={editStepIndex !== null} onOpenChange={(o) => { if (!o) setEditStepIndex(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit review comment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-step-comment">Comment</Label>
            <Textarea
              id="edit-step-comment"
              value={editStepComment}
              onChange={(e) => setEditStepComment(e.target.value)}
              rows={3}
              placeholder="Update this step's review comment…"
            />
            <p className="text-xs text-muted-foreground">
              The change is recorded (edited by / at) on the approval step.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStepIndex(null)}>Cancel</Button>
            <Button disabled={updateStepComment.isPending} onClick={handleSaveStepComment}>
              {updateStepComment.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
