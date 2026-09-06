'use client';
// ============================================
// PROFILE COMPLETION DRILL-DOWN — COLUMNS
// ============================================
// Created: 2026-07-30
// Purpose: Column definitions for the Profile Completion tab's DataTable
// ============================================

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import type { IncompleteProfileDetail } from '@/types/learner-dashboard';

/** Badge colour per missing-field label. */
export const MISSING_FIELD_COLORS: Record<string, string> = {
  'College Email': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Academic Year': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Semester: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Section: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

/** Placeholder for a value the profile does not carry. */
function Empty() {
  return <span className='text-muted-foreground italic'>—</span>;
}

/**
 * Sorting is server-side (`manualSorting`), and the API only accepts an
 * allowlist of real `learners_profiles` columns. Columns backed by an embedded
 * join (program / semester / section / year names) therefore opt out of
 * sorting — otherwise the header offers a sort the backend silently ignores.
 */
export const incompleteProfilesColumns: ColumnDef<IncompleteProfileDetail>[] = [
  {
    accessorKey: 'first_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    cell: ({ row }) => (
      <div className='min-w-0'>
        <p className='truncate font-medium'>
          {row.original.first_name} {row.original.last_name}
        </p>
        {(row.original.application_id || row.original.roll_number) && (
          <p className='truncate text-xs text-muted-foreground'>
            {row.original.roll_number || row.original.application_id}
          </p>
        )}
      </div>
    ),
    size: 220,
    minSize: 160,
  },
  {
    accessorKey: 'college_email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='College Email' />
    ),
    cell: ({ row }) =>
      row.original.college_email ? (
        <span className='truncate text-sm'>{row.original.college_email}</span>
      ) : (
        <span className='text-sm italic text-muted-foreground'>Missing</span>
      ),
    size: 240,
    minSize: 160,
  },
  {
    accessorKey: 'program_name',
    header: 'Program',
    cell: ({ row }) =>
      row.original.program_name ? (
        <span className='truncate text-sm'>{row.original.program_name}</span>
      ) : (
        <Empty />
      ),
    enableSorting: false,
    size: 200,
    minSize: 140,
  },
  {
    accessorKey: 'academic_year_name',
    header: 'Academic Year',
    cell: ({ row }) =>
      row.original.academic_year_name ? (
        <span className='text-sm'>{row.original.academic_year_name}</span>
      ) : (
        <Empty />
      ),
    enableSorting: false,
    size: 150,
    minSize: 120,
  },
  {
    accessorKey: 'admission_year_name',
    header: 'Admission Year',
    cell: ({ row }) =>
      row.original.admission_year_name ? (
        <span className='text-sm'>{row.original.admission_year_name}</span>
      ) : (
        <Empty />
      ),
    enableSorting: false,
    size: 150,
    minSize: 120,
  },
  // NOTE: semester_name and section_name are intentionally NOT columns here —
  // they are export-only (see INCOMPLETE_PROFILES_EXPORT_HEADERS below). The
  // exporter includes any header that is not a table column id verbatim, while
  // headers that ARE table columns must also be visible to be exported. Adding
  // them back as columns would put them in the UI; removing them from the
  // headers list would drop them from the spreadsheet.
  {
    accessorKey: 'is_profile_complete',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
    cell: ({ row }) =>
      row.original.is_profile_complete ? (
        <Badge
          variant='secondary'
          className='bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        >
          <CheckCircle2 className='mr-1 h-3 w-3' />
          Complete
        </Badge>
      ) : (
        <Badge
          variant='secondary'
          className='bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
        >
          <XCircle className='mr-1 h-3 w-3' />
          Incomplete
        </Badge>
      ),
    size: 140,
    minSize: 120,
  },
  {
    // Keyed on the flat label so CSV/XLS/PDF export carries the same content
    // the badges show — the exporter can only read primitive cell values.
    accessorKey: 'missing_fields_label',
    header: 'Missing Fields',
    cell: ({ row }) =>
      row.original.missingFields.length > 0 ? (
        <div className='flex flex-wrap gap-1'>
          {row.original.missingFields.map((field) => (
            <Badge
              key={field}
              variant='secondary'
              className={`text-xs ${MISSING_FIELD_COLORS[field] || ''}`}
            >
              {field}
            </Badge>
          ))}
        </div>
      ) : (
        <Empty />
      ),
    enableSorting: false,
    size: 260,
    minSize: 180,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button variant='ghost' size='icon' asChild>
        <Link href={`/learners/profiles/${row.original.id}`} title='View profile'>
          <Eye className='h-4 w-4' />
          <span className='sr-only'>View profile</span>
        </Link>
      </Button>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 60,
    minSize: 60,
  },
];

/**
 * Export column ids -> spreadsheet header labels.
 *
 * Order matters. The exporter emits table-backed headers first (in this array's
 * order), then appends every header that is not a table column. Listing the two
 * export-only fields LAST therefore makes the emitted order match this array
 * exactly, which is what keeps INCOMPLETE_PROFILES_EXPORT_WIDTHS — applied
 * positionally — lined up with the right columns.
 */
export const INCOMPLETE_PROFILES_EXPORT_MAPPING: Record<string, string> = {
  first_name: 'Name',
  college_email: 'College Email',
  program_name: 'Program',
  academic_year_name: 'Academic Year',
  admission_year_name: 'Admission Year',
  is_profile_complete: 'Profile Complete',
  missing_fields_label: 'Missing Fields',
  // Export-only (not rendered in the table UI):
  semester_name: 'Semester',
  section_name: 'Section',
};

export const INCOMPLETE_PROFILES_EXPORT_HEADERS = Object.keys(
  INCOMPLETE_PROFILES_EXPORT_MAPPING
);

export const INCOMPLETE_PROFILES_EXPORT_WIDTHS = [
  { wch: 28 }, // Name
  { wch: 32 }, // College Email
  { wch: 28 }, // Program
  { wch: 16 }, // Academic Year
  { wch: 16 }, // Admission Year
  { wch: 16 }, // Profile Complete
  { wch: 40 }, // Missing Fields
  { wch: 18 }, // Semester
  { wch: 12 }, // Section
];

/**
 * A PDF page fits far fewer columns than a spreadsheet, so the PDF prints a
 * curated subset. Unlike CSV/XLSX these keys bypass column-visibility, which is
 * how semester/section reach the PDF despite not being table columns.
 */
export const INCOMPLETE_PROFILES_PDF_HEADERS = [
  'first_name',
  'college_email',
  'program_name',
  'academic_year_name',
  'semester_name',
  'section_name',
  'missing_fields_label',
];

/**
 * Applied to every exported row across CSV / XLSX / PDF. Renders the booleans
 * and nulls as something a human reading a spreadsheet expects instead of
 * "true" / blank.
 */
export function transformIncompleteProfileForExport(
  row: IncompleteProfileDetail
): Record<string, string | number | boolean | null | undefined> {
  return {
    first_name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    college_email: row.college_email ?? '',
    program_name: row.program_name ?? '',
    academic_year_name: row.academic_year_name ?? '',
    admission_year_name: row.admission_year_name ?? '',
    semester_name: row.semester_name ?? '',
    section_name: row.section_name ?? '',
    is_profile_complete: row.is_profile_complete ? 'Complete' : 'Incomplete',
    missing_fields_label: row.missing_fields_label || '',
  };
}
