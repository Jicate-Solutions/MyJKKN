'use client';

// Columns for the learner leave types data-table.
// Bespoke (not shared) — copied/adapted from campus-living's hostel leave
// types columns, extended with category/residency/sponsor/affects-attendance.

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Paperclip, UserCheck, CalendarCheck } from 'lucide-react';
import { RESIDENCY_LABELS, type LearnerLeaveType } from '@/types/learner-leave-types';
import { LeaveTypeActiveSwitch } from './leave-type-active-switch';
import { LeaveTypeRowActions } from './row-actions';

export const createColumns = (canManage: boolean): ColumnDef<LearnerLeaveType>[] => {
  const columns: ColumnDef<LearnerLeaveType>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: row.original.color_code }}
          />
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{row.original.code}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.category === 'onduty' ? 'On-Duty' : 'Leave'}</Badge>
      ),
    },
    {
      accessorKey: 'residency',
      header: 'Residency',
      cell: ({ row }) => <Badge variant="secondary">{RESIDENCY_LABELS[row.original.residency]}</Badge>,
    },
    {
      accessorKey: 'max_duration_days',
      header: 'Max Days',
      cell: ({ row }) => {
        const days = row.original.max_duration_days;
        return (
          <span className="text-sm">
            {days == null ? 'No limit' : `${days} ${days === 1 ? 'day' : 'days'}`}
          </span>
        );
      },
    },
    {
      accessorKey: 'advance_notice_hours',
      header: 'Notice',
      cell: ({ row }) => <span className="text-sm">{row.original.advance_notice_hours}h</span>,
    },
    {
      id: 'requires_attachment',
      header: 'Attachment',
      cell: ({ row }) =>
        row.original.requires_attachment ? (
          <Paperclip className="h-4 w-4 text-muted-foreground" aria-label="Attachment required" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'sponsor',
      header: 'Sponsor',
      cell: ({ row }) =>
        row.original.requires_sponsor_approval ? (
          <span
            title={row.original.sponsor_role_hint ?? undefined}
            className="inline-flex items-center gap-1 text-xs"
          >
            <UserCheck className="h-4 w-4 text-muted-foreground" />
            Required
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'affects_attendance',
      header: 'Attendance',
      cell: ({ row }) =>
        row.original.affects_attendance ? (
          <CalendarCheck className="h-4 w-4 text-muted-foreground" aria-label="Affects attendance" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'is_active',
      header: 'Active',
      cell: ({ row }) => <LeaveTypeActiveSwitch leaveType={row.original} disabled={!canManage} />,
    },
  ];

  if (canManage) {
    columns.push({
      id: 'actions',
      header: '',
      cell: ({ row }) => <LeaveTypeRowActions leaveType={row.original} />,
    });
  }

  return columns;
};
