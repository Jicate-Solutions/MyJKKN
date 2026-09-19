'use client';

// Column definitions for the Applications DataTable.
//
// Mirrors app/(routes)/courses/_components/columns.tsx: DataTableColumnHeader
// for sortable headers, badge pills for the two enums, actions in the last
// column.
//
// SORTING IS OFF on `package` and `contact`. Neither is a real
// course_applications column — package comes from the joined course_packages
// row, contact is a synthetic pair of phone and email — and the service
// forwards sort_by into a real `.order(column)` call, so sorting by either
// would 400 the query. CourseApplicationService.listPaged also allow-lists the
// sortable set, which is the belt to this braces.

import type { ColumnDef } from '@tanstack/react-table';
import { BadgeCheck, KeyRound, Mail, Phone, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { CourseApplication, CourseApplicationStatus } from '@/types/courses';

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

/** Where an approved participant stands on their fees, derived from the
 *  enrolment totals rather than stored — fn_course_recompute_balances keeps
 *  those current, so anything cached here would drift the moment a payment
 *  landed. */
function feeState(en: CourseApplication['enrollment']) {
  if (!en) return null;
  const payable = Number(en.total_payable ?? 0);
  const paid = Number(en.total_paid ?? 0);
  const balance = Number(en.balance ?? 0);
  if (payable <= 0) return { label: 'No fee', tone: 'text-muted-foreground', paid, payable, balance };
  if (balance <= 0) return { label: 'Paid in full', tone: 'text-emerald-700 dark:text-emerald-400', paid, payable, balance };
  if (paid > 0) return { label: 'Part paid', tone: 'text-blue-700 dark:text-blue-400', paid, payable, balance };
  return { label: 'Unpaid', tone: 'text-amber-700 dark:text-amber-400', paid, payable, balance };
}

const renderWhen = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

export interface CourseApplicationColumnOptions {
  canDecide: boolean;
  /** Opens the detail sheet. The shared DataTable exposes no onRowClick, so the
   *  applicant's name carries the affordance rather than the whole row — which
   *  also keeps the action buttons from fighting a row-level handler. */
  onView: (application: CourseApplication) => void;
  onApprove: (application: CourseApplication) => void;
  onReject: (application: CourseApplication) => void;
  onResend: (application: CourseApplication) => void;
  /** True while a reject is in flight, so the row's buttons disable. */
  isRejecting: boolean;
}

export const getApplicationColumns = (
  options: CourseApplicationColumnOptions,
): ColumnDef<CourseApplication>[] => [
  {
    accessorKey: 'applicant_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Applicant" />,
    size: 200,
    cell: ({ row }) => (
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => options.onView(row.original)}
          className="max-w-full truncate text-left font-medium text-primary hover:underline"
        >
          {row.original.applicant_name}
        </button>
        <p className="truncate text-xs text-muted-foreground">
          {row.original.form?.name ?? '—'}
        </p>
      </div>
    ),
  },
  {
    id: 'contact',
    header: 'Contact',
    enableSorting: false,
    size: 210,
    cell: ({ row }) => (
      <div className="min-w-0 space-y-0.5 text-sm">
        <span className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {row.original.applicant_phone}
        </span>
        {row.original.applicant_email ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{row.original.applicant_email}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No email</span>
        )}
      </div>
    ),
  },
  {
    // Not sortable: `jkkn_id` is a PostgREST computed column, not a real
    // course_applications column, and listPaged forwards sort_by into a literal
    // .order(column) call — the same reason `package` and `contact` are off.
    id: 'jkkn_id',
    header: 'JKKN ID',
    enableSorting: false,
    size: 120,
    cell: ({ row }) => {
      const id = row.original.jkkn_id;
      if (!id) {
        // Pending and rejected applicants have no number yet, and that is the
        // normal state rather than a fault — so it reads as absent, not broken.
        return <span className="text-xs text-muted-foreground">Not issued</span>;
      }
      return (
        <span className="flex items-center gap-1.5 font-mono text-sm font-medium">
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
          {id}
        </span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    size: 130,
    cell: ({ row }) => {
      const s = row.original.status as CourseApplicationStatus;
      // decided_by is NULL only for the self-service path — a manual approval
      // always stamps auth.uid(). Same "the system did it" convention as
      // jkkn_identities.issued_by. Worth surfacing: an admin looking at a list
      // of approved rows should be able to tell which ones a human decided.
      const auto = s === 'approved' && !row.original.decided_by;
      return (
        <div className="space-y-0.5">
          <Badge variant="outline" className={`text-[10px] font-semibold ${STATUS_VARIANT[s] ?? ''}`}>
            {STATUS_LABEL[s] ?? row.original.status}
          </Badge>
          {auto && (
            <p className="text-[10px] text-muted-foreground">Auto</p>
          )}
        </div>
      );
    },
  },
  {
    // Where they came from, from the email domain alone — NOT the same question
    // as `applicant_type` next door, which records which identity the row points
    // at and is 'external' for every public application by construction
    // (course_applications_identity_chk needs a profile_id or learner_id that a
    // public applicant does not have yet).
    accessorKey: 'applicant_origin',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Origin" />,
    size: 110,
    cell: ({ row }) => {
      const internal = row.original.applicant_origin === 'internal';
      return (
        <Badge
          variant="outline"
          className={`text-[10px] font-semibold ${
            internal
              ? 'border-indigo-300 text-indigo-700 dark:border-indigo-800 dark:text-indigo-400'
              : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
          }`}
          title={internal ? 'Email address on @jkkn.ac.in' : 'Email address outside JKKN'}
        >
          {internal ? 'Internal' : 'External'}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'applicant_type',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    size: 110,
    cell: ({ row }) => (
      <span className="text-sm">
        {APPLICANT_TYPE_LABEL[row.original.applicant_type] ?? row.original.applicant_type}
      </span>
    ),
  },
  {
    id: 'package',
    header: 'Package',
    enableSorting: false,
    size: 190,
    cell: ({ row }) =>
      row.original.package ? (
        <div className="min-w-0 text-sm">
          <p className="truncate">{row.original.package.name}</p>
          <p className="text-xs text-muted-foreground">
            {inr.format(Number(row.original.package.total_amount ?? 0))}
          </p>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Not chosen</span>
      ),
  },
  {
    id: 'payment',
    header: 'Payment',
    enableSorting: false,
    size: 190,
    cell: ({ row }) => {
      const fee = feeState(row.original.enrollment);
      // Only an APPROVED application has an enrolment, and only an enrolment
      // has fees. Anything else has nothing to report — an em dash beats
      // "Rs. 0 of Rs. 0", which reads as a settled account.
      if (!fee) return <span className="text-sm text-muted-foreground">—</span>;
      return (
        <div className="min-w-0 text-sm">
          <p className={`font-medium ${fee.tone}`}>{fee.label}</p>
          <p className="text-xs text-muted-foreground">
            {inr.format(fee.paid)} of {inr.format(fee.payable)}
            {fee.balance > 0 ? ` · ${inr.format(fee.balance)} due` : ''}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Applied" />,
    size: 170,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{renderWhen(row.original.created_at)}</span>
    ),
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    enableHiding: false,
    size: 210,
    cell: ({ row }) => {
      const a = row.original;
      const s = a.status as CourseApplicationStatus;
      if (!options.canDecide) return null;

      // stopPropagation: the row itself opens the detail sheet, and a click on
      // Approve must not do both.
      const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

      if (s === 'pending' || s === 'shortlisted') {
        return (
          <div className="flex gap-1.5" onClick={stop} onKeyDown={stop}>
            <Button size="sm" onClick={() => options.onApprove(a)}>
              <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={options.isRejecting}
              onClick={() => options.onReject(a)}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        );
      }

      if (s === 'approved' && a.enrollment?.id) {
        // Reissuing sign-in details is only meaningful for an EXTERNAL
        // participant, who holds a JKKN ID and a password minted for this
        // course. A reused learner or team member signs in with their own
        // MyJKKN account, so "resend" would mean resetting THAT password —
        // a takeover of an account that exists for other reasons. The route
        // already refuses it; offering a button that can only ever produce an
        // error is the actual bug, so the row says why instead.
        const external = (a.enrollment.participant_type ?? 'external') === 'external';
        if (!external) {
          return (
            <span className="text-xs text-muted-foreground">
              Signs in with their own MyJKKN account
            </span>
          );
        }
        return (
          <div className="flex gap-1.5" onClick={stop} onKeyDown={stop}>
            <Button size="sm" variant="outline" onClick={() => options.onResend(a)}>
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              Resend login
            </Button>
          </div>
        );
      }

      return null;
    },
  },
];
