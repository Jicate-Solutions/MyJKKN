'use client';

/**
 * Leave/OnDuty Approvals Table Columns
 *
 * Column definitions for the approvals data table with:
 * - Learner information
 * - Application details (dates, category, type)
 * - Institution/Section info for super admin
 * - Status badges
 * - Actions (Approve/Reject)
 */

import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  Calendar,
  User,
  Building2,
  GraduationCap,
  FileText,
  Clock,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Eye,
  BookOpen,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { LeaveOndutyApproval } from '@/types/leave-onduty';

// Type for super admin view (applications)
export type ApprovalTableRow = any; // Will be LeaveOndutyApplication from super admin query

interface ActionsProps {
  row: ApprovalTableRow;
  onViewDetails: (row: ApprovalTableRow) => void;
  onApprove: (row: ApprovalTableRow) => void;
  onReject: (row: ApprovalTableRow) => void;
  currentUserId?: string;
  isSuperAdmin?: boolean;
}

function Actions({ row, onViewDetails, onApprove, onReject, currentUserId, isSuperAdmin }: ActionsProps) {
  // Only show Approve/Reject when the current user still has a pending step
  // on this application. A user who has already acted sees only View Details,
  // which prevents the "not authorized" error loop from clicking Approve twice.
  // Super admin always sees actions for override/support.
  const approvals = (row?.approvals ?? []) as Array<{ approver_id?: string; status?: string }>;
  const hasMyPendingStep = !!currentUserId && approvals.some(
    (a) => a.approver_id === currentUserId && a.status === 'pending'
  );
  const showApproveReject = isSuperAdmin || hasMyPendingStep;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onViewDetails(row)}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        {showApproveReject && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onApprove(row)}>
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
              Approve
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReject(row)}>
              <XCircle className="mr-2 h-4 w-4 text-red-600" />
              Reject
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Category badge colors
const getCategoryColor = (category: string) => {
  switch (category) {
    case 'leave':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
    case 'onduty':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
};

export const createColumns = (
  isSuperAdmin: boolean,
  onViewDetails: (row: ApprovalTableRow) => void,
  onApprove: (row: ApprovalTableRow) => void,
  onReject: (row: ApprovalTableRow) => void,
  currentUserId?: string
): ColumnDef<ApprovalTableRow>[] => {
  const columns: ColumnDef<ApprovalTableRow>[] = [
    // Select Column
    {
      id: 'select',
      header: ({ table }) => (
        <div className="flex items-center justify-center w-full">
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value: boolean) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center w-full">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      size: 80,
      minSize: 60,
      maxSize: 120,
      enableSorting: false,
      enableHiding: false,
    },

    // Application Date
    {
      accessorKey: 'application_date',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Applied On" />
      ),
      size: 140,
      minSize: 120,
      maxSize: 160,
      cell: ({ row }) => {
        const date = row.getValue('application_date') as string;
        try {
          const dateObj = new Date(date);
          return (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{format(dateObj, 'MMM dd, yyyy')}</div>
                <div className="text-xs text-muted-foreground">
                  {format(dateObj, 'EEEE')}
                </div>
              </div>
            </div>
          );
        } catch {
          return <span className="text-sm">{date}</span>;
        }
      },
      enableSorting: true,
    },

    // Learner Info
    {
      id: 'learner_info',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Learner" />
      ),
      size: 220,
      minSize: 200,
      maxSize: 280,
      cell: ({ row }) => {
        const learner = row.original.learners_profiles || row.original.learner;
        if (!learner) return <span className="text-muted-foreground">Unknown</span>;

        return (
          <button
            type="button"
            onClick={() => onViewDetails(row.original)}
            className="flex items-center gap-2 w-full text-left hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium underline-offset-2 hover:underline">
                {learner.first_name} {learner.last_name}
              </div>
              <div className="text-xs text-muted-foreground">
                {learner.roll_number || learner.register_number || 'No ID'}
              </div>
            </div>
          </button>
        );
      },
      enableSorting: false,
    },

    // Category & Sub-category
    {
      id: 'category_type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Category & Type" />
      ),
      size: 180,
      minSize: 160,
      maxSize: 220,
      cell: ({ row }) => {
        const category = row.original.category;
        const subCategory = row.original.sub_category;

        return (
          <div className="space-y-1">
            <Badge className={getCategoryColor(category)}>
              {category === 'leave' ? 'Leave' : 'On-Duty'}
            </Badge>
            <div className="text-xs text-muted-foreground capitalize">
              {subCategory.replace('_', ' ')}
            </div>
          </div>
        );
      },
      enableSorting: false,
    },

    // Date Range
    {
      id: 'date_range',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Period" />
      ),
      size: 200,
      minSize: 180,
      maxSize: 240,
      cell: ({ row }) => {
        const startDate = row.original.start_date;
        const endDate = row.original.end_date;
        const periodType = row.original.period_type;

        try {
          const start = new Date(startDate);
          const end = new Date(endDate);
          const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd');

          return (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium text-sm">
                  {sameDay
                    ? format(start, 'MMM dd, yyyy')
                    : `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`}
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {periodType === 'fullday'
                    ? 'Full Day'
                    : periodType === 'forenoon'
                    ? 'Forenoon'
                    : periodType === 'afternoon'
                    ? 'Afternoon'
                    : 'Period-wise'}
                </div>
              </div>
            </div>
          );
        } catch {
          return <span className="text-sm">{startDate} - {endDate}</span>;
        }
      },
      enableSorting: false,
    },
  ];

  // Academic Details Column
  if (isSuperAdmin) {
    // Super Admin: Show Institution, Department & Semester
    columns.push({
      id: 'institution_dept_semester',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Institution, Dept & Semester" />
      ),
      size: 280,
      minSize: 250,
      maxSize: 320,
      cell: ({ row }) => {
        const institution = row.original.institutions || row.original.institution;
        const department = row.original.departments || row.original.department;
        const semester = row.original.semesters || row.original.semester;
        const section = row.original.sections || row.original.section;
        const degree = section?.degrees || section?.degree;

        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium">
                {institution?.name || 'Unknown Institution'}
              </span>
            </div>
            {degree && (
              <div className="flex items-center gap-1.5">
                <GraduationCap className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {degree.degree_name || 'Unknown Degree'}
                </span>
              </div>
            )}
            {department && (
              <div className="flex items-center gap-1.5">
                <BookOpen className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {department.department_name || 'Unknown Dept'}
                </span>
              </div>
            )}
            {semester && (
              <div className="flex items-center gap-1.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {semester.semester_name || 'Unknown Semester'}
                </span>
              </div>
            )}
          </div>
        );
      },
      enableSorting: false,
    });
  } else {
    // Regular Approver: Show Degree, Department, Semester & Section
    columns.push({
      id: 'academic_details',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Degree, Dept, Sem & Section" />
      ),
      size: 280,
      minSize: 250,
      maxSize: 320,
      cell: ({ row }) => {
        const section = row.original.sections || row.original.section;
        const degree = section?.degrees || section?.degree;
        const department = row.original.departments || row.original.department;
        const semester = row.original.semesters || row.original.semester;

        return (
          <div className="space-y-1">
            {degree && (
              <div className="flex items-center gap-1.5">
                <GraduationCap className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium">
                  {degree.degree_name}
                  {degree.degree_id && <span className="ml-1">({degree.degree_id})</span>}
                </span>
              </div>
            )}
            {department && (
              <div className="flex items-center gap-1.5">
                <BookOpen className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {department.department_name}
                </span>
              </div>
            )}
            {semester && (
              <div className="flex items-center gap-1.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {semester.semester_name}
                  {section && <span className="ml-1">• Sec {section.section_name}</span>}
                </span>
              </div>
            )}
          </div>
        );
      },
      enableSorting: false,
    });
  }

  // Status — shows application-level status, the logged-in user's OWN step
  // status, and the role of the next pending approver. This lets the HOD
  // see at a glance that they've approved their step while the application
  // is still waiting on the Principal, without having to open the details dialog.
  columns.push({
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    size: 170,
    minSize: 150,
    maxSize: 220,
    cell: ({ row }) => {
      const appStatus = row.getValue('status') as string;
      const approvals = ((row.original as any)?.approvals ?? []) as Array<{
        approver_id?: string;
        status?: string;
        step_order?: number;
        approver_role?: string;
      }>;

      const myStep = currentUserId
        ? approvals.find((a) => a.approver_id === currentUserId)
        : undefined;
      const nextPending = [...approvals]
        .sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0))
        .find((a) => a.status === 'pending');

      const appBadge = (
        <Badge
          variant="secondary"
          className={
            appStatus === 'approved'
              ? 'text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : appStatus === 'rejected'
              ? 'text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'text-xs'
          }
        >
          {appStatus === 'pending' ? 'Pending' : appStatus}
        </Badge>
      );

      return (
        <div className="flex flex-col gap-1">
          {appBadge}
          {myStep && (
            <div className="text-[11px] text-muted-foreground">
              You:{' '}
              <span
                className={
                  myStep.status === 'approved'
                    ? 'font-medium text-green-700 dark:text-green-400'
                    : myStep.status === 'rejected'
                    ? 'font-medium text-red-700 dark:text-red-400'
                    : myStep.status === 'forwarded'
                    ? 'font-medium text-blue-700 dark:text-blue-400'
                    : 'font-medium text-amber-700 dark:text-amber-400'
                }
              >
                {myStep.status}
              </span>
            </div>
          )}
          {appStatus === 'pending' && nextPending && nextPending.approver_id !== currentUserId && (
            <div className="text-[11px] text-muted-foreground">
              Waiting: <span className="font-medium capitalize">{nextPending.approver_role}</span>
            </div>
          )}
        </div>
      );
    },
    enableSorting: false,
  });

  // Actions
  columns.push({
    id: 'actions',
    header: 'Actions',
    size: 80,
    minSize: 60,
    maxSize: 100,
    cell: ({ row }) => (
      <Actions
        row={row.original}
        onViewDetails={onViewDetails}
        onApprove={onApprove}
        onReject={onReject}
        currentUserId={currentUserId}
        isSuperAdmin={isSuperAdmin}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  });

  return columns;
};
