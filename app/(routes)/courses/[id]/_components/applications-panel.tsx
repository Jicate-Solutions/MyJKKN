'use client';

// Course Events — the Applications tab body (Phase 4).
//
// Uses the shared advanced DataTable, like every other list surface in this app
// (the /courses list, events, organizations). It runs in fetchDataFn mode: the
// table owns page/search/sort imperatively and calls
// CourseApplicationService.listPaged, rather than a React Query hook feeding a
// static array.
//
// THE CONSEQUENCE OF fetchDataFn MODE, and it bites every table that uses it:
// the table registers no React Query entry, so invalidateQueries after a
// mutation does not refresh it. useDataTableRefreshOnInvalidate covers
// invalidations raised elsewhere, and a page-local `tick` covers our own
// mutations — both are folded into refetchKey. Approve and reject bump the
// tick, or the decided row would sit there looking pending until a reload.
//
// The counts feeding the status filter stay a SEPARATE, UNFILTERED query on
// purpose: facet counts derived from already-filtered rows report the filter
// back to itself — "Pending 3" while Pending is selected, "Pending 0" while
// Approved is — which has bitten this codebase before.

import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, BadgeCheck, Mail, Phone, User, Wallet } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { DataTable } from '@/components/data-table/data-table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useDataTableRefreshOnInvalidate } from '@/hooks/use-data-table-refresh';
import { queryKeys } from '@/lib/query/query-keys';
import { CourseApplicationService } from '@/lib/services/courses/course-application-service';
import {
  useCourseApplicationCounts,
  useRejectCourseApplication,
} from '@/hooks/courses/use-course-applications';
import { usePermissions } from '@/hooks/use-permissions';
import { ApproveApplicationDialog } from './approve-application-dialog';
import { ResendCredentialsDialog } from './resend-credentials-dialog';
import { getApplicationColumns } from './application-columns';
import {
  COURSE_APPLICANT_TYPES,
  COURSE_APPLICATION_STATUSES,
  type CourseApplication,
  type CourseApplicationStatus,
} from '@/types/courses';

const ALL = 'all';

const STATUS_LABEL: Record<CourseApplicationStatus, string> = {
  pending: 'Pending',
  shortlisted: 'Shortlisted',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
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
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
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

/** Shown in their own labelled rows at the top of the sheet, so repeating them
 *  in the answers list is noise. */
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
  const extraAnswers = Object.entries(answers).filter(([k]) => !IDENTITY_ANSWER_KEYS.has(k));

  return (
    <Sheet open={Boolean(application)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {application && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {application.applicant_name}
                <Badge variant="outline" className="text-[10px] font-semibold">
                  {STATUS_LABEL[application.status as CourseApplicationStatus] ??
                    application.status}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                Applied {formatWhen(application.created_at)} ·{' '}
                {APPLICANT_TYPE_LABEL[application.applicant_type] ?? application.applicant_type}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Fact icon={User} label="Name" value={application.applicant_name} />
                <Fact icon={Phone} label="Phone" value={application.applicant_phone} />
                <Fact icon={Mail} label="Email" value={application.applicant_email} />
              </div>

              {/* Provisioned identity and fee position. Only an approved
                  application has either, so the whole block is conditional —
                  showing "JKKN ID: —" on a pending row invites the reader to
                  wonder whether one failed to issue. */}
              {application.enrollment && (
                <div className="space-y-3 rounded-md border bg-muted/40 p-3">
                  <div className="flex items-start gap-2.5">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">JKKN ID</p>
                      <p className="break-words font-mono text-sm font-semibold">
                        {application.profile?.jkkn_identities?.[0]?.jkkn_id ?? 'Not issued'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 border-t pt-3">
                    <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">Fees</p>
                      <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">Total</p>
                          <p className="truncate font-medium">
                            {inr.format(Number(application.enrollment.total_payable ?? 0))}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">Paid</p>
                          <p className="truncate font-medium text-emerald-700 dark:text-emerald-400">
                            {inr.format(Number(application.enrollment.total_paid ?? 0))}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">Balance</p>
                          <p className="truncate font-bold">
                            {inr.format(Number(application.enrollment.balance ?? 0))}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Enrolment {application.enrollment.enrollment_number ?? '—'}
                        {application.enrollment.status ? ` · ${application.enrollment.status}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
                  NULL, so this application cannot become an enrollment without
                  one chosen at decision time. Say so rather than letting it
                  surface as a 23502 later. */}
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
                      <div
                        key={key}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 px-3 py-2"
                      >
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

  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [selected, setSelected] = useState<CourseApplication | null>(null);
  const [approving, setApproving] = useState<CourseApplication | null>(null);
  const [resending, setResending] = useState<CourseApplication | null>(null);

  // Bumped by our OWN mutations — see the file banner.
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const refetchKey = useDataTableRefreshOnInvalidate(queryKeys.courseApplications.lists());
  const reject = useRejectCourseApplication();
  const { data: counts } = useCourseApplicationCounts(courseEventId);

  const columns = useMemo(
    () =>
      getApplicationColumns({
        canDecide,
        onView: setSelected,
        onApprove: setApproving,
        onReject: (a) => reject.mutate({ applicationId: a.id }, { onSuccess: bump }),
        onResend: setResending,
        isRejecting: reject.isPending,
      }),
    [canDecide, reject, bump],
  );

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      sort_by: string;
      sort_order: string;
    }) => {
      const { data, metadata } = await CourseApplicationService.listPaged(courseEventId, {
        status: statusFilter !== ALL ? (statusFilter as CourseApplicationStatus) : undefined,
        applicant_type: typeFilter !== ALL ? (typeFilter as never) : undefined,
        search: params.search,
        page: params.page,
        limit: params.limit,
        sortBy: params.sort_by,
        sortDirection: params.sort_order === 'asc' ? 'asc' : 'desc',
      });

      return {
        success: true,
        data,
        pagination: {
          page: metadata.page,
          limit: metadata.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total,
        },
      };
    },
    [courseEventId, statusFilter, typeFilter],
  );

  const renderToolbar = () => (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="h-8 w-[160px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>
            All statuses{counts ? ` (${counts.total})` : ''}
          </SelectItem>
          {COURSE_APPLICATION_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
              {counts ? ` (${counts[s]})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="h-8 w-[130px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {COURSE_APPLICANT_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {APPLICANT_TYPE_LABEL[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

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
      <div className="space-y-4">
        {/* Why the casts: DataTable constrains TData to ExportableData, a FLAT
            record of primitives. CourseApplication carries nested form/package/
            enrollment objects, so it cannot satisfy that constraint — the same
            wall the /courses list hits. Cast at this one boundary rather than
            loosen the shared generic. */}
        <DataTable
          fetchDataFn={fetchData as never}
          getColumns={() => columns as never}
          idField="id"
          exportConfig={{
            entityName: 'course-applications',
            columnMapping: {
              applicant_name: 'Applicant',
              applicant_phone: 'Phone',
              applicant_email: 'Email',
              status: 'Status',
              applicant_type: 'Type',
              form: 'Form',
              package: 'Package',
              jkkn_id: 'JKKN ID',
              total_payable: 'Fee total',
              total_paid: 'Paid',
              balance: 'Balance',
              created_at: 'Applied',
            },
            columnWidths: [
              { wch: 26 }, { wch: 16 }, { wch: 28 }, { wch: 14 },
              { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 14 },
              { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
            ],
            headers: [
              'applicant_name', 'applicant_phone', 'applicant_email', 'status',
              'applicant_type', 'form', 'package', 'jkkn_id',
              'total_payable', 'total_paid', 'balance', 'created_at',
            ],
            // form/package are nested {id,name} objects — a {...row} spread would
            // drag them into the sheet instead of a flat value. Flatten explicitly.
            transformFunction: ((row: CourseApplication) => ({
              applicant_name: row.applicant_name,
              applicant_phone: row.applicant_phone,
              applicant_email: row.applicant_email ?? '',
              status: row.status,
              applicant_type: row.applicant_type,
              form: row.form?.name ?? '',
              package: row.package?.name ?? '',
              jkkn_id: row.profile?.jkkn_identities?.[0]?.jkkn_id ?? '',
              // Blank, not 0, for an application with no enrolment: a zero in a
              // fee column reads as "nothing owed" when the truth is "not yet
              // approved".
              total_payable: row.enrollment ? Number(row.enrollment.total_payable ?? 0) : '',
              total_paid: row.enrollment ? Number(row.enrollment.total_paid ?? 0) : '',
              balance: row.enrollment ? Number(row.enrollment.balance ?? 0) : '',
              created_at: row.created_at ?? '',
            })) as never,
          }}
          config={{
            enableUrlState: true,
            enableDateFilter: false,
            enableExport: true,
            enableRowSelection: false,
            enableSearch: true,
            enableColumnFilters: false,
            enableColumnVisibility: true,
            enableColumnResizing: true,
            columnResizingTableId: 'course-applications-table',
          }}
          renderToolbarContent={renderToolbar}
          refetchKey={refetchKey + tick}
        />

        <ApplicationSheet application={selected} onClose={() => setSelected(null)} />

        <ApproveApplicationDialog
          application={approving}
          courseEventId={courseEventId}
          onClose={() => {
            setApproving(null);
            // The approved row must stop offering Approve/Reject, and its
            // enrollment now exists for the Resend action.
            bump();
          }}
        />

        <ResendCredentialsDialog application={resending} onClose={() => setResending(null)} />
      </div>
    </PermissionGuard>
  );
}
