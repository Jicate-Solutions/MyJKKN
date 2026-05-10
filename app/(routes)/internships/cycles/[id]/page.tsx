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

type LifecycleAction = 'activate' | 'close' | 'archive' | null;

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/;

interface DraftForm {
  name: string;
  institution_id: string;
  academic_year: string;
  start_date: string;
  end_date: string;
  total_seats: string;
  notes: string;
}

function fromCycle(cycle: InternshipCycle): DraftForm {
  return {
    name: cycle.name,
    institution_id: cycle.institution_id,
    academic_year: cycle.academic_year,
    start_date: cycle.start_date,
    end_date: cycle.end_date,
    total_seats: cycle.total_seats != null ? String(cycle.total_seats) : '',
    notes: cycle.notes ?? '',
  };
}

function validate(form: DraftForm): Partial<Record<keyof DraftForm, string>> {
  const errors: Partial<Record<keyof DraftForm, string>> = {};
  if (!form.name.trim()) errors.name = 'Cycle name is required.';
  if (!form.institution_id) errors.institution_id = 'College is required.';
  if (!form.academic_year.trim()) errors.academic_year = 'Academic year is required.';
  else if (!ACADEMIC_YEAR_PATTERN.test(form.academic_year.trim()))
    errors.academic_year = 'Use YYYY-YYYY format.';
  if (!form.start_date) errors.start_date = 'Start date is required.';
  if (!form.end_date) errors.end_date = 'End date is required.';
  if (form.start_date && form.end_date && form.end_date <= form.start_date)
    errors.end_date = 'End date must be after start date.';
  if (form.total_seats.trim()) {
    const n = Number(form.total_seats.trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0)
      errors.total_seats = 'Seats must be a positive whole number.';
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
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data: cycle, isLoading, error, refetch } = useCycle(id);
  const updateCycle = useUpdateCycle();
  const collegeNameMap = useCollegeNameMap();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [touched, setTouched] = useState<Record<keyof DraftForm, boolean>>({
    name: false,
    institution_id: false,
    academic_year: false,
    start_date: false,
    end_date: false,
    total_seats: false,
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

  const isDraft = cycle.status === 'draft';
  const isOpen = cycle.status === 'open';
  const isClosed = cycle.status === 'closed';
  const isArchived = cycle.status === 'archived';

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
      name: false,
      institution_id: false,
      academic_year: false,
      start_date: false,
      end_date: false,
      total_seats: false,
      notes: false,
    });
  };

  const saveEdit = () => {
    setTouched({
      name: true,
      institution_id: true,
      academic_year: true,
      start_date: true,
      end_date: true,
      total_seats: true,
      notes: true,
    });
    if (hasErrors || !form) return;

    const totalSeats = form.total_seats.trim()
      ? parseInt(form.total_seats.trim(), 10)
      : null;

    updateCycle.mutate(
      {
        id: cycle.id,
        updates: {
          name: form.name.trim(),
          institution_id: form.institution_id,
          academic_year: form.academic_year.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          total_seats: totalSeats,
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
    <ContentLayout title={cycle.name}>
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
          <BreadcrumbPage className="line-clamp-1 max-w-[40ch]">{cycle.name}</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarRange className="h-6 w-6 flex-shrink-0 text-orange-600" />
            <h1 className="truncate text-2xl font-semibold">{cycle.name}</h1>
            <CycleStatusBadge status={cycle.status} />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {collegeName ?? cycle.institution_id} · {cycle.academic_year}
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
                onClick={() => setPendingAction('activate')}
                disabled={isMutating}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <PlayCircle className="h-4 w-4" />
                Activate
              </Button>
            </>
          )}

          {isOpen && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingAction('close')}
              disabled={isMutating}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              Close cycle
            </Button>
          )}

          {isClosed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingAction('archive')}
              disabled={isMutating}
              className="gap-1.5"
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Locked-after-activation banner */}
      {!isDraft && (
        <Alert className="mb-4 border-blue-200 bg-blue-50 text-blue-900">
          <Lock className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">Structural fields locked</AlertTitle>
          <AlertDescription className="text-sm leading-snug">
            This cycle has been activated. Approval chain, posting type, fee threshold, and
            geofence are now read-only. Threshold tweaks (logbook deadline, attendance flag %)
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

      {isArchived && (
        <Alert className="mb-4 border-zinc-200 bg-zinc-50 text-zinc-700">
          <Archive className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">Archived</AlertTitle>
          <AlertDescription className="text-sm leading-snug">
            This cycle has been archived and no longer accepts changes.
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
                  <FormField label="Name" required error={touched.name ? errors.name : undefined}>
                    <Input
                      value={form.name}
                      onChange={(e) => update('name', e.target.value)}
                      onBlur={() => markTouched('name')}
                      disabled={isMutating}
                    />
                  </FormField>
                  <FormField
                    label="College"
                    required
                    error={touched.institution_id ? errors.institution_id : undefined}
                  >
                    <CollegeSelect
                      value={form.institution_id}
                      onChange={(v) => {
                        update('institution_id', v);
                        markTouched('institution_id');
                      }}
                      triggerClassName="w-full"
                      disabled={isMutating}
                    />
                  </FormField>
                </FieldRow>

                <FieldRow>
                  <FormField
                    label="Academic year"
                    required
                    error={touched.academic_year ? errors.academic_year : undefined}
                  >
                    <Input
                      value={form.academic_year}
                      placeholder="2026-2027"
                      onChange={(e) => update('academic_year', e.target.value)}
                      onBlur={() => markTouched('academic_year')}
                      disabled={isMutating}
                    />
                  </FormField>
                  <FormField
                    label="Total seats"
                    error={touched.total_seats ? errors.total_seats : undefined}
                  >
                    <Input
                      type="number"
                      min={1}
                      value={form.total_seats}
                      onChange={(e) => update('total_seats', e.target.value)}
                      onBlur={() => markTouched('total_seats')}
                      placeholder="Optional"
                      disabled={isMutating}
                    />
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
                  label="Academic year"
                  value={cycle.academic_year}
                />
                <SummaryRow icon={CalendarRange} label="Start date" value={formatDate(cycle.start_date)} />
                <SummaryRow icon={CalendarRange} label="End date" value={formatDate(cycle.end_date)} />
                <SummaryRow
                  icon={Users2}
                  label="Total seats"
                  value={cycle.total_seats != null ? cycle.total_seats.toLocaleString('en-IN') : 'Not set'}
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
                <span className="font-medium text-foreground">{cycle.name}</span>
              </p>
              <p>{config.body}</p>
              {action === 'activate' && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-amber-900">
                        Activation locks the following until close:
                      </p>
                      <ul className="ml-1 list-disc pl-4 text-sm text-amber-900/90">
                        <li>Approval chain</li>
                        <li>Posting type (internal vs external)</li>
                        <li>Fee compliance threshold</li>
                        <li>Geofence (GPS strict mode)</li>
                      </ul>
                      <p className="mt-1.5 text-xs text-amber-900/80">
                        Threshold tweaks (logbook deadline, attendance flag %) remain editable
                        via <span className="font-mono">/admin/internship-policy</span> after
                        activation.
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
  if (action === 'activate') {
    return {
      title: 'Activate this cycle?',
      body: 'Once activated, this cycle moves to "Open" and learners assigned to it can begin posting allocation. Structural policy fields will lock.',
      icon: PlayCircle,
      iconClass: 'text-emerald-600',
      nextStatus: 'open',
      confirmLabel: 'Activate cycle',
      confirmClass: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500',
    };
  }
  if (action === 'close') {
    return {
      title: 'Close this cycle?',
      body: 'Closing this cycle stops new posting allocations. In-flight assignments are unaffected, but new assignments cannot be created until the cycle is reopened or replaced.',
      icon: CheckCircle2,
      iconClass: 'text-blue-600',
      nextStatus: 'closed',
      confirmLabel: 'Close cycle',
      confirmClass: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    };
  }
  return {
    title: 'Archive this cycle?',
    body: 'Archived cycles are hidden from the default lists but remain referenced by historical assignments and audit records.',
    icon: Archive,
    iconClass: 'text-zinc-600',
    nextStatus: 'archived',
    confirmLabel: 'Archive cycle',
    confirmClass: 'bg-zinc-700 text-white hover:bg-zinc-800 focus:ring-zinc-500',
  };
}
