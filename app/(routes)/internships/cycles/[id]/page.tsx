'use client';

// app/(routes)/internships/cycles/[id]/page.tsx
// Cycle detail + edit + lifecycle transitions (draft → open → closed → archived).
// Per spec Decision #4: activation locks approval_chain, posting_type, fee_threshold,
// and geofence. Threshold tweaks (logbook deadline, attendance flag %) stay editable
// via /admin/internship-policy after activation.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarRange,
  Pencil,
  Save,
  X,
  PlayCircle,
  Lock,
  CheckCircle2,
  Archive,
  AlertTriangle,
  Clock,
  Building2,
  GraduationCap,
  Users2,
  StickyNote,
  RotateCcw,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCycle, useUpdateCycle } from '@/hooks/internships/useCycles';
import type { CycleStatus, InternshipCycle } from '@/lib/services/internships/types';
import { CycleStatusBadge } from '../_components/cycle-status-badge';
import { CollegeSelect, useCollegeNameMap } from '../_components/college-select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../../_components/no-access-alert';

type LifecycleAction = 'submit_approval' | 'approve' | 'cancel' | null;

import type {
  CyclePostingType,
  CycleTemporalMode,
} from '@/lib/services/internships/types';

interface DraftForm {
  cycle_name: string;
  institution_id: string;
  start_date: string;
  end_date: string;
  posting_type: CyclePostingType;
  temporal_mode: CycleTemporalMode;
  fee_compliance_threshold: string;
  escalate_after_hours: string;
  notes: string;
}

function fromCycle(cycle: InternshipCycle): DraftForm {
  return {
    cycle_name: cycle.cycle_name,
    institution_id: cycle.institution_id,
    start_date: cycle.start_date,
    end_date: cycle.end_date,
    posting_type: cycle.posting_type,
    temporal_mode: cycle.temporal_mode,
    fee_compliance_threshold: String(cycle.fee_compliance_threshold ?? 70),
    escalate_after_hours: String(cycle.escalate_after_hours ?? 72),
    notes: cycle.notes ?? '',
  };
}

function validate(form: DraftForm): Partial<Record<keyof DraftForm, string>> {
  const errors: Partial<Record<keyof DraftForm, string>> = {};
  if (!form.cycle_name.trim()) errors.cycle_name = 'Cycle name is required.';
  if (!form.institution_id) errors.institution_id = 'College is required.';
  if (!form.start_date) errors.start_date = 'Start date is required.';
  if (!form.end_date) errors.end_date = 'End date is required.';
  if (form.start_date && form.end_date && form.end_date <= form.start_date)
    errors.end_date = 'End date must be after start date.';

  const threshold = Number(form.fee_compliance_threshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    errors.fee_compliance_threshold = 'Enter a value between 0 and 100.';
  }
  const hours = Number(form.escalate_after_hours);
  if (!Number.isFinite(hours) || !Number.isInteger(hours) || hours < 1) {
    errors.escalate_after_hours = 'Must be a positive whole number.';
  }
  return errors;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CycleDetailPage() {
  return (
    <PermissionGuard module="internship.cycles" action="view" fallback={<NoAccessAlert />}>
      <CycleDetailPageInner />
    </PermissionGuard>
  );
}

function CycleDetailPageInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data: cycle, isLoading, error, refetch } = useCycle(id);
  const updateCycle = useUpdateCycle();
  const collegeNameMap = useCollegeNameMap();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [touched, setTouched] = useState<Record<keyof DraftForm, boolean>>({
    cycle_name: false,
    institution_id: false,
    start_date: false,
    end_date: false,
    posting_type: false,
    temporal_mode: false,
    fee_compliance_threshold: false,
    escalate_after_hours: false,
    notes: false,
  });
  const [pendingAction, setPendingAction] = useState<LifecycleAction>(null);

  // Hydrate the editor whenever the source cycle changes.
  useEffect(() => {
    if (cycle) setForm(fromCycle(cycle));
  }, [cycle]);

  const errors = useMemo(() => (form ? validate(form) : {}), [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const isMutating = updateCycle.isPending;

  if (!id) {
    return (
      <ContentLayout title="Cycle">
        <Alert variant="destructive">
          <AlertTitle>Missing cycle id</AlertTitle>
          <AlertDescription>The URL is missing a cycle identifier.</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (isLoading || !form) {
    return (
      <ContentLayout title="Cycle">
        <DetailSkeleton />
      </ContentLayout>
    );
  }

  if (error || !cycle) {
    return (
      <ContentLayout title="Cycle">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/internships/cycles">Cycles</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbPage>Not found</BreadcrumbPage>
          </BreadcrumbList>
        </Breadcrumb>
        <Alert variant="destructive">
          <AlertTitle>Could not load cycle</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span className="text-sm">
              {error ? (error as Error).message : 'No cycle exists with this id.'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/internships/cycles">Back to cycles</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  // Lifecycle phase derived from live 8-state enum.
  // - editable: only `draft` allows form edits (per Decision #4 hybrid lineage)
  // - in-flight: pending_approval | approved | fee_checking | assignments_ready
  // - active: cycle has started; no structural edits allowed
  // - terminal: completed | cancelled
  const isDraft = cycle.status === 'draft';
  const isInFlight =
    cycle.status === 'pending_approval' ||
    cycle.status === 'approved' ||
    cycle.status === 'fee_checking' ||
    cycle.status === 'assignments_ready';
  const isActive = cycle.status === 'active';
  const isTerminal = cycle.status === 'completed' || cycle.status === 'cancelled';

  const collegeName = collegeNameMap[cycle.institution_id];

  const update = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };
  const markTouched = (key: keyof DraftForm) =>
    setTouched((prev) => ({ ...prev, [key]: true }));

  const cancelEdit = () => {
    setEditing(false);
    setForm(fromCycle(cycle));
    setTouched({
      cycle_name: false,
      institution_id: false,
      start_date: false,
      end_date: false,
      posting_type: false,
      temporal_mode: false,
      fee_compliance_threshold: false,
      escalate_after_hours: false,
      notes: false,
    });
  };

  const saveEdit = () => {
    setTouched({
      cycle_name: true,
      institution_id: true,
      start_date: true,
      end_date: true,
      posting_type: true,
      temporal_mode: true,
      fee_compliance_threshold: true,
      escalate_after_hours: true,
      notes: true,
    });
    if (hasErrors || !form) return;

    updateCycle.mutate(
      {
        id: cycle.id,
        updates: {
          cycle_name: form.cycle_name.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          posting_type: form.posting_type,
          temporal_mode: form.temporal_mode,
          fee_compliance_threshold: Number(form.fee_compliance_threshold) || 70,
          escalate_after_hours: Number(form.escalate_after_hours) || 72,
          notes: form.notes.trim() || null,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  };

  const runLifecycleAction = (next: CycleStatus) => {
    updateCycle.mutate(
      { id: cycle.id, updates: { status: next } },
      { onSuccess: () => setPendingAction(null) }
    );
  };

  return (
    <ContentLayout title={cycle.cycle_name}>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/internships">Internships</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/internships/cycles">Cycles</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage className="line-clamp-1 max-w-[40ch]">{cycle.cycle_name}</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarRange className="h-6 w-6 flex-shrink-0 text-orange-600" />
            <h1 className="truncate text-2xl font-semibold">{cycle.cycle_name}</h1>
            <CycleStatusBadge status={cycle.status} />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {collegeName ?? cycle.institution_id} · {cycle.posting_type} · {cycle.temporal_mode}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/internships/cycles">
              <ArrowLeft className="h-3.5 w-3.5" />
              All cycles
            </Link>
          </Button>

          {/* Lifecycle controls — visible based on current status */}
          {isDraft && !editing && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                onClick={() => setPendingAction('submit_approval')}
                disabled={isMutating}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <PlayCircle className="h-4 w-4" />
                Submit for approval
              </Button>
            </>
          )}

          {cycle.status === 'pending_approval' && (
            <Button
              size="sm"
              onClick={() => setPendingAction('approve')}
              disabled={isMutating}
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve
            </Button>
          )}

          {(isInFlight || isActive) && cycle.status !== 'pending_approval' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingAction('cancel')}
              disabled={isMutating}
              className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              <Archive className="h-4 w-4" />
              Cancel cycle
            </Button>
          )}
        </div>
      </div>

      {/* Locked-after-activation banner */}
      {!isDraft && !isTerminal && (
        <Alert className="mb-4 border-blue-200 bg-blue-50 text-blue-900">
          <Lock className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">Structural fields locked</AlertTitle>
          <AlertDescription className="text-sm leading-snug">
            This cycle has been submitted/approved. Approval chain, posting type, fee threshold,
            and geofence are now read-only. Threshold tweaks (logbook deadline, attendance flag %)
            remain editable via{' '}
            <Link
              className="underline underline-offset-2 hover:no-underline"
              href="/admin/internship-policy"
            >
              /admin/internship-policy
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {isTerminal && (
        <Alert className="mb-4 border-zinc-200 bg-zinc-50 text-zinc-700">
          <Archive className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">
            {cycle.status === 'cancelled' ? 'Cancelled' : 'Completed'}
          </AlertTitle>
          <AlertDescription className="text-sm leading-snug">
            This cycle is in a terminal state and no longer accepts changes.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Summary / edit card — spans 2 columns on lg+ */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Cycle details</CardTitle>
                <CardDescription>
                  {editing
                    ? 'Editing draft. Cancel to discard your changes without saving.'
                    : isDraft
                      ? 'Editable while in draft. Activation will lock structural fields.'
                      : 'Read-only summary. Edit policy thresholds via /admin/internship-policy.'}
                </CardDescription>
              </div>
              {editing && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    disabled={isMutating}
                    className="gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveEdit}
                    disabled={isMutating}
                    className="gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isMutating ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-5">
            {editing ? (
              <div className="space-y-5">
                <FieldRow>
                  <FormField
                    label="Cycle name"
                    required
                    error={touched.cycle_name ? errors.cycle_name : undefined}
                  >
                    <Input
                      value={form.cycle_name}
                      onChange={(e) => update('cycle_name', e.target.value)}
                      onBlur={() => markTouched('cycle_name')}
                      disabled={isMutating}
                    />
                  </FormField>
                  <FormField label="College" required>
                    <Input value={collegeName ?? cycle.institution_id} disabled />
                  </FormField>
                </FieldRow>

                <FieldRow>
                  <FormField
                    label="Start date"
                    required
                    error={touched.start_date ? errors.start_date : undefined}
                  >
                    <Input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => update('start_date', e.target.value)}
                      onBlur={() => markTouched('start_date')}
                      disabled={isMutating}
                    />
                  </FormField>
                  <FormField
                    label="End date"
                    required
                    error={touched.end_date ? errors.end_date : undefined}
                  >
                    <Input
                      type="date"
                      value={form.end_date}
                      onChange={(e) => update('end_date', e.target.value)}
                      onBlur={() => markTouched('end_date')}
                      disabled={isMutating}
                    />
                  </FormField>
                </FieldRow>

                <FieldRow>
                  <FormField label="Posting type">
                    <Input
                      value={form.posting_type}
                      onChange={(e) => update('posting_type', e.target.value as CyclePostingType)}
                      placeholder="standard | community | industrial | research | virtual"
                      disabled={isMutating}
                    />
                  </FormField>
                  <FormField label="Temporal mode">
                    <Input
                      value={form.temporal_mode}
                      onChange={(e) => update('temporal_mode', e.target.value as CycleTemporalMode)}
                      placeholder="fixed | rolling | batch_aligned"
                      disabled={isMutating}
                    />
                  </FormField>
                </FieldRow>

                <FieldRow>
                  <FormField
                    label="Fee compliance threshold (%)"
                    error={touched.fee_compliance_threshold ? errors.fee_compliance_threshold : undefined}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={form.fee_compliance_threshold}
                      onChange={(e) => update('fee_compliance_threshold', e.target.value)}
                      onBlur={() => markTouched('fee_compliance_threshold')}
                      disabled={isMutating}
                    />
                  </FormField>
                  <FormField
                    label="Escalate after (hours)"
                    error={touched.escalate_after_hours ? errors.escalate_after_hours : undefined}
                  >
                    <Input
                      type="number"
                      min={1}
                      value={form.escalate_after_hours}
                      onChange={(e) => update('escalate_after_hours', e.target.value)}
                      onBlur={() => markTouched('escalate_after_hours')}
                      disabled={isMutating}
                    />
                  </FormField>
                </FieldRow>

                <FormField label="Notes">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => update('notes', e.target.value)}
                    rows={3}
                    placeholder="Optional internal notes — visible to coordinators."
                    disabled={isMutating}
                  />
                </FormField>

                {updateCycle.error && (
                  <Alert variant="destructive">
                    <AlertTitle>Save failed</AlertTitle>
                    <AlertDescription>{(updateCycle.error as Error).message}</AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <SummaryRow icon={Building2} label="College" value={collegeName ?? cycle.institution_id} />
                <SummaryRow
                  icon={GraduationCap}
                  label="Posting type"
                  value={<span className="capitalize">{cycle.posting_type}</span>}
                />
                <SummaryRow icon={CalendarRange} label="Start date" value={formatDate(cycle.start_date)} />
                <SummaryRow icon={CalendarRange} label="End date" value={formatDate(cycle.end_date)} />
                <SummaryRow
                  icon={Users2}
                  label="Learners assigned"
                  value={cycle.learners_count.toLocaleString('en-IN')}
                />
                <SummaryRow
                  icon={Users2}
                  label="Sites assigned"
                  value={cycle.sites_count.toLocaleString('en-IN')}
                />
                <SummaryRow
                  icon={GraduationCap}
                  label="Fee compliance threshold"
                  value={`${cycle.fee_compliance_threshold}%`}
                />
                <SummaryRow
                  icon={Clock}
                  label="Escalate after"
                  value={`${cycle.escalate_after_hours} hours`}
                />
                <SummaryRow
                  icon={CalendarRange}
                  label="Temporal mode"
                  value={<span className="capitalize">{cycle.temporal_mode.replace('_', ' ')}</span>}
                />
                <SummaryRow
                  icon={CalendarRange}
                  label="Status"
                  value={<CycleStatusBadge status={cycle.status} />}
                />
                <div className="sm:col-span-2">
                  <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <StickyNote className="h-3.5 w-3.5" />
                    Notes
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm">
                    {cycle.notes ? (
                      cycle.notes
                    ) : (
                      <span className="text-muted-foreground">No notes added.</span>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Audit trail */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-base">
              <Clock className="h-4 w-4" />
              Audit trail
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="space-y-3 pt-4 text-sm">
            <AuditRow label="Created" value={formatTimestamp(cycle.created_at)} />
            <AuditRow label="Last updated" value={formatTimestamp(cycle.updated_at)} />
            {cycle.created_by && (
              <AuditRow
                label="Created by"
                value={
                  <span className="font-mono text-xs text-muted-foreground">
                    {cycle.created_by.slice(0, 8)}…
                  </span>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lifecycle confirmation dialogs */}
      <LifecycleDialog
        action={pendingAction}
        cycle={cycle}
        isPending={isMutating}
        onCancel={() => setPendingAction(null)}
        onConfirm={(next) => runLifecycleAction(next)}
      />
    </ContentLayout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1">
        {label}
        {required && <span aria-hidden className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function AuditRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-sm tabular-nums">{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-72" />
      <Skeleton className="h-10 w-96" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LifecycleDialog({
  action,
  cycle,
  isPending,
  onConfirm,
  onCancel,
}: {
  action: LifecycleAction;
  cycle: InternshipCycle;
  isPending: boolean;
  onConfirm: (next: CycleStatus) => void;
  onCancel: () => void;
}) {
  if (!action) {
    return (
      <AlertDialog open={false} onOpenChange={(open) => !open && onCancel()}>
        <AlertDialogContent />
      </AlertDialog>
    );
  }

  const config = getLifecycleConfig(action);

  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <config.icon className={`h-5 w-5 ${config.iconClass}`} />
            {config.title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 pt-1 text-sm">
              <p>
                <span className="font-medium text-foreground">{cycle.cycle_name}</span>
              </p>
              <p>{config.body}</p>
              {action === 'submit_approval' && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-amber-900">
                        Submitting for approval locks the following:
                      </p>
                      <ul className="ml-1 list-disc pl-4 text-sm text-amber-900/90">
                        <li>Approval chain</li>
                        <li>Posting type</li>
                        <li>Fee compliance threshold</li>
                        <li>Geofence (GPS strict mode)</li>
                      </ul>
                      <p className="mt-1.5 text-xs text-amber-900/80">
                        Threshold tweaks (logbook deadline, attendance flag %) remain editable
                        via <span className="font-mono">/admin/internship-policy</span> after
                        approval.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm(config.nextStatus);
            }}
            disabled={isPending}
            className={config.confirmClass}
          >
            {isPending ? (
              <span className="flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                Working…
              </span>
            ) : (
              config.confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getLifecycleConfig(action: Exclude<LifecycleAction, null>): {
  title: string;
  body: string;
  icon: React.ElementType;
  iconClass: string;
  nextStatus: CycleStatus;
  confirmLabel: string;
  confirmClass: string;
} {
  if (action === 'submit_approval') {
    return {
      title: 'Submit cycle for approval?',
      body: 'Once submitted, this cycle moves to "Pending approval". Structural policy fields will lock pending approver review.',
      icon: PlayCircle,
      iconClass: 'text-emerald-600',
      nextStatus: 'pending_approval',
      confirmLabel: 'Submit for approval',
      confirmClass: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500',
    };
  }
  if (action === 'approve') {
    return {
      title: 'Approve this cycle?',
      body: 'Approval moves the cycle into the fee-checking phase. Once fee compliance verifies, learners become eligible for assignment allocation.',
      icon: CheckCircle2,
      iconClass: 'text-blue-600',
      nextStatus: 'approved',
      confirmLabel: 'Approve cycle',
      confirmClass: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    };
  }
  return {
    title: 'Cancel this cycle?',
    body: 'Cancelling this cycle is a terminal action. Existing assignments retain audit history but no new operations can be performed against this cycle.',
    icon: Archive,
    iconClass: 'text-rose-600',
    nextStatus: 'cancelled',
    confirmLabel: 'Cancel cycle',
    confirmClass: 'bg-rose-700 text-white hover:bg-rose-800 focus:ring-rose-500',
  };
}
