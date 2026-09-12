'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import { formatDate, formatInt, formatPct, pctTone, toneClass } from './format';
import type { AttendanceLearnerRow } from '@/types/campus-living/attendance-analytics';

/**
 * Columns for the learner attendance table.
 *
 * COLUMN IDS ARE THE SERVER SORT KEYS. Each accessorKey below matches a value
 * fn_cl_attendance_learners whitelists in p_sort_by (attendance_pct, marks,
 * present, absent, on_leave, longest_absent_run, current_absent_run,
 * full_name, roll_number, block_name, institution_name, room_number,
 * last_present_date). Renaming a column here without updating that whitelist
 * silently falls back to the default sort instead of erroring.
 */
export function getLearnerAttendanceColumns(
  from: string,
  to: string,
): ColumnDef<AttendanceLearnerRow>[] {
  const href = (id: string) =>
    `/campus-living/analytics/attendance/${id}?from=${from}&to=${to}`;

  return [
    {
      accessorKey: 'full_name',
      header: 'Learner',
      cell: ({ row }) => (
        <Link href={href(row.original.learner_id)} className="block hover:underline">
          <div className="font-medium">{row.original.full_name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.program_name ?? '—'}
          </div>
        </Link>
      ),
    },
    {
      accessorKey: 'roll_number',
      header: 'Roll No.',
      cell: ({ row }) => row.original.roll_number ?? '—',
    },
    {
      accessorKey: 'block_name',
      header: 'Block',
      cell: ({ row }) => row.original.block_name ?? '—',
    },
    {
      accessorKey: 'room_number',
      header: 'Room',
      cell: ({ row }) =>
        row.original.room_number ?? (
          <span className="text-xs text-muted-foreground">No bed</span>
        ),
    },
    {
      accessorKey: 'institution_name',
      header: 'Institution',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.institution_name ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'attendance_pct',
      header: 'Rate',
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          <span className={`font-medium ${toneClass(pctTone(row.original.attendance_pct))}`}>
            {formatPct(row.original.attendance_pct)}
          </span>
          {/* The denominator travels with the number — a rate whose basis is
              invisible is how two screens disagree and both look right. */}
          <div className="text-xs text-muted-foreground">
            of {formatInt(row.original.pct_denominator)} counted
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'present',
      header: 'Present',
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{formatInt(row.original.present)}</div>
      ),
    },
    {
      accessorKey: 'absent',
      header: 'Absent',
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{formatInt(row.original.absent)}</div>
      ),
    },
    {
      accessorKey: 'on_leave',
      header: 'Leave',
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{formatInt(row.original.on_leave)}</div>
      ),
    },
    {
      accessorKey: 'longest_absent_run',
      header: 'Longest run',
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {formatInt(row.original.longest_absent_run)}
          {row.original.current_absent_run > 0 && (
            <Badge variant="destructive" className="ml-2 px-1 py-0 text-[10px]">
              {row.original.current_absent_run} ongoing
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'last_present_date',
      header: 'Last present',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.last_present_date)}
        </span>
      ),
    },
    {
      id: 'open',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Link
          href={href(row.original.learner_id)}
          aria-label={`Open ${row.original.full_name}'s attendance`}
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      ),
    },
  ];
}

/**
 * Export schema.
 *
 * Header keys are deliberately DIFFERENT from the column ids above: the shared
 * DataTable drops any export header whose key collides with a hidden table
 * column, so reusing `full_name` etc. would make columns vanish from the export
 * the moment someone hides them in the UI.
 */
export const LEARNER_EXPORT_HEADERS = [
  'learner_name',
  'roll_no',
  'block',
  'room',
  'institution',
  'program',
  'rate_pct',
  'days_counted',
  'present_days',
  'absent_days',
  'leave_days',
  'longest_run',
  'ongoing_run',
  'last_present',
] as const;

export const LEARNER_EXPORT_MAPPING: Record<string, string> = {
  learner_name: 'Learner',
  roll_no: 'Roll No.',
  block: 'Block',
  room: 'Room',
  institution: 'Institution',
  program: 'Program',
  rate_pct: 'Attendance %',
  days_counted: 'Days counted',
  present_days: 'Present',
  absent_days: 'Absent',
  leave_days: 'On leave',
  longest_run: 'Longest absence run (marked days)',
  ongoing_run: 'Ongoing absence run (marked days)',
  last_present: 'Last present',
};

export const LEARNER_EXPORT_WIDTHS = [
  { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 30 }, { wch: 26 },
  { wch: 12 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
  { wch: 28 }, { wch: 28 }, { wch: 14 },
];

/** Flattens a row to the export schema. */
export function learnerExportTransform(row: AttendanceLearnerRow) {
  return {
    learner_name: row.full_name,
    roll_no: row.roll_number ?? '',
    block: row.block_name ?? '',
    room: row.room_number ?? '',
    institution: row.institution_name ?? '',
    program: row.program_name ?? '',
    rate_pct: row.attendance_pct ?? '',
    days_counted: row.pct_denominator,
    present_days: row.present,
    absent_days: row.absent,
    leave_days: row.on_leave,
    longest_run: row.longest_absent_run,
    ongoing_run: row.current_absent_run,
    last_present: row.last_present_date ?? '',
  };
}
