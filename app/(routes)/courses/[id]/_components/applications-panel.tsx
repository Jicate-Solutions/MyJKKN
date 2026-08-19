'use client';

// Course Events — the Applications tab body (Phase 4).
//
// Everything a public application collects, plus the two decisions. Until this
// existed the only way to see who had applied was to query course_applications
// directly — the public surface was live and writing rows nobody in the console
// could read.
//
// Approve does NOT live here as a status write. It goes through
// fn_course_approve_application, which provisions a profile, a JKKN identity,
// the Course Participant role, an enrollment and the whole instalment bill
// schedule in one transaction. A button that only moved `status` would satisfy
// course_applications_decision_chk, show the applicant as approved, and leave
// them with no identity, no enrollment and no bill — constraint-clean silent
// corruption. Approve therefore opens a dialog that collects the email and the
// package the RPC needs, and shows the credentials it returns.
//
// Reject is only offered on a pending or shortlisted row. An approved
// application has a person and bills behind it, and the reject RPC refuses it
// outright — unwinding that is a withdrawal, not a rejection.
//
// A plain list, not a DataTable — same reasoning as the Packages, Sessions and
// Forms tabs.

import { useState } from 'react';
import {
  AlertCircle, BadgeCheck, Inbox, Mail, Phone, Search, User, X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { getErrorMessage } from '@/lib/utils';
import {
  useCourseApplicationCounts,
  useCourseApplications,
  useRejectCourseApplication,
} from '@/hooks/courses/use-course-applications';
import { usePermissions } from '@/hooks/use-permissions';
import { ApproveApplicationDialog } from './approve-application-dialog';
import {
  COURSE_APPLICATION_STATUSES,
  type CourseApplication,
  type CourseApplicationStatus,
} from '@/types/courses';

const STATUS_LABEL: Record<CourseApplicationStatus, string> = {
  pending: 'Pending',
  shortlisted: 'Shortlisted',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const STATUS_VARIANT: Record<CourseApplicationStatus, string> = {
  pending: 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400',
  shortlisted: 'border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400',
  approved: 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400',
  rejected: 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-400',
  withdrawn: 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400',
};

const APPLICANT_TYPE_LABEL: Record<string, string> = {
  learner: 'Learner',
  staff: 'Staff',
  external: 'External',
};

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const formatWhen = (value: string | null | undefined) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

/** custom_fields is schema-less jsonb, so a value can be anything the form's
 *  field type produced — a checkbox gives a boolean, a multiselect an array. */
const renderAnswer = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

/** The identity keys are shown in their own labelled rows at the top of the
 *  sheet, so repeating them in the answers list is noise. */
const IDENTITY_ANSWER_KEYS = new Set(['full_name', 'name', 'phone', 'mobile', 'email']);

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium">
          {value || <span className="font-normal text-muted-foreground">Not given</span>}
        </p>
      </div>
    </div>
  );
}

function ApplicationSheet({
  application,
  onClose,
}: {
  application: CourseApplication | null;
  onClose: () => void;
}) {
  const answers = (application?.custom_fields ?? {}) as Record<string, unknown>;
  const extraAnswers = Object.entries(answers).filter(
    ([k]) => !IDENTITY_ANSWER_KEYS.has(k),
  );

  return (
    <Sheet open={Boolean(application)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {application && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {application.applicant_name}
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold ${
                    STATUS_VARIANT[application.status as CourseApplicationStatus] ?? ''
                  }`}
                >
                  {STATUS_LABEL[application.status as CourseApplicationStatus] ??
                    application.status}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                Applied {formatWhen(application.created_at)} ·{' '}
                {APPLICANT_TYPE_LABEL[application.applicant_type] ??
                  application.applicant_type}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Fact icon={User} label="Name" value={application.applicant_name} />
                <Fact icon={Phone} label="Phone" value={application.applicant_phone} />
                <Fact icon={Mail} label="Email" value={application.applicant_email} />
              </div>

              <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Form</p>
                  <p className="break-words text-sm font-medium">
                    {application.form?.name ?? '—'}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Package chosen</p>
                  <p className="break-words text-sm font-medium">
                    {application.package
                      ? `${application.package.name} · ${inr.format(
                          Number(application.package.total_amount ?? 0),
                        )}`
                      : 'None'}
                  </p>
                </div>
              </div>

              {/* package_id is nullable but course_enrollments.package_id is NOT
                  NULL, so an application with no package cannot become an
                  enrollment without one being chosen at decision time. Say so
                  here rather than letting it surface as a 23502 later. */}
              {!application.package && (
                <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                  <p className="text-amber-900 dark:text-amber-200">
                    No package was chosen. One will have to be picked when this
                    application is approved — an enrollment cannot exist without a
                    package to price it.
                  </p>
                </div>
              )}

              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-semibold">Answers</p>
                {extraAnswers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This form asked nothing beyond the applicant&apos;s contact details.
                  </p>
                ) : (
                  <dl className="divide-y rounded-md border text-sm">
                    {extraAnswers.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 px-3 py-2">
                        <dt className="min-w-0 break-words font-mono text-xs text-muted-foreground">
                          {key}
                        </dt>
                        <dd className="min-w-0 break-words">{renderAnswer(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              {application.decided_at && (
                <div className="space-y-1 border-t pt-4 text-sm">
                  <p className="text-xs text-muted-foreground">Decision</p>
                  <p>
                    {STATUS_LABEL[application.status as CourseApplicationStatus]} on{' '}
                    {formatWhen(application.decided_at)}
                    {application.decided_by_profile?.full_name
                      ? ` by ${application.decided_by_profile.full_name}`
                      : ''}
                  </p>
                  {application.decision_note && (
                    <p className="whitespace-pre-line text-muted-foreground">
                      {application.decision_note}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ApplicationsPanel({ courseEventId }: { courseEventId: string }) {
  const { canAccess } = usePermissions();
  const canDecide = canAccess('courses', 'applications.decide');

  const [status, setStatus] = useState<CourseApplicationStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CourseApplication | null>(null);
  const [approving, setApproving] = useState<CourseApplication | null>(null);
  const reject = useRejectCourseApplication();

  const filters = {
    ...(status === 'all' ? {} : { status }),
    ...(search.trim() ? { search: search.trim() } : {}),
  };

  const { data, isLoading, isError, error } = useCourseApplications(courseEventId, filters);
  const { data: counts } = useCourseApplicationCounts(courseEventId);

  const list = data ?? [];

  return (
    <PermissionGuard
      module="courses"
      action="applications.view"
      fallback={
        <p className="py-8 text-center text-sm text-muted-foreground">
          You don&apos;t have permission to view applications for this course.
        </p>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone or email"
              className="pl-8"
            />
          </div>

          {/* Counts come from the UNFILTERED query, so selecting a status never
              rewrites the numbers beside the other statuses. */}
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant={status === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatus('all')}
            >
              All {counts ? `(${counts.total})` : ''}
            </Button>
            {COURSE_APPLICATION_STATUSES.map((s) => (
              <Button
                key={s}
                variant={status === s ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatus(s)}
              >
                {STATUS_LABEL[s]} {counts ? `(${counts[s]})` : ''}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-destructive">
              {getErrorMessage(error)}
            </CardContent>
          </Card>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {counts?.total
                  ? 'No applications match this filter.'
                  : 'Nobody has applied to this course yet.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {list.map((a) => {
              const s = a.status as CourseApplicationStatus;
              return (
                <Card
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(a)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(a);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{a.applicant_name}</h3>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold ${STATUS_VARIANT[s] ?? ''}`}
                        >
                          {STATUS_LABEL[s] ?? a.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {APPLICANT_TYPE_LABEL[a.applicant_type] ?? a.applicant_type}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5" />
                          {a.applicant_phone}
                        </span>
                        {a.applicant_email && (
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            {a.applicant_email}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{formatWhen(a.created_at)}</p>
                        <p className="mt-0.5">
                          {a.package
                            ? `${a.package.name} · ${inr.format(Number(a.package.total_amount ?? 0))}`
                            : 'No package chosen'}
                        </p>
                      </div>

                      {/* Only an undecided application can be decided. An
                          approved one has a person, an enrollment and bills
                          behind it — unwinding that is a withdrawal, which the
                          reject RPC refuses outright. */}
                      {canDecide && (s === 'pending' || s === 'shortlisted') && (
                        <div
                          className="flex gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" onClick={() => setApproving(a)}>
                            <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reject.isPending}
                            onClick={() => reject.mutate({ applicationId: a.id })}
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <ApplicationSheet application={selected} onClose={() => setSelected(null)} />

        <ApproveApplicationDialog
          application={approving}
          courseEventId={courseEventId}
          onClose={() => setApproving(null)}
        />
      </div>
    </PermissionGuard>
  );
}
