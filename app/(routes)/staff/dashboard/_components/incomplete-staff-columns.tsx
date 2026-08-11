'use client';
// ============================================
// INCOMPLETE EMPLOYEE PROFILES — COLUMNS
// ============================================
// Created: 2026-08-10
// Column definitions and export schema for the Profile Analytics drill-down.
// ============================================

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import type { IncompleteStaffDetail } from '@/types/staff';

/** Badge colour per missing-field label, grouped by field family. */
export const MISSING_FIELD_COLORS: Record<string, string> = {
  // Required — warmer, more urgent
  'First Name': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'Last Name': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Email: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Phone: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Designation: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Date of Birth': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Date of Joining': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  // Optional — cooler, less urgent
  'Staff ID': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  'Profile Picture': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  Address: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  State: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  District: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  Pincode: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Institution Email': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Blood Group': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  'Biometric Code': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Biometric Machine': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
};

function Empty() {
  return <span className='text-muted-foreground italic'>—</span>;
}

/**
 * Sorting is server-side (`manualSorting`) against an allowlist of real `staff`
 * columns. Columns backed by an embedded join — department, institution,
 * category, biometric machine — therefore opt out of sorting, so the header
 * never offers an order the API silently ignores.
 */
export const incompleteStaffColumns: ColumnDef<IncompleteStaffDetail>[] = [
  {
    accessorKey: 'first_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    cell: ({ row }) => (
      <div className='min-w-0'>
        <p className='truncate font-medium'>
          {row.original.first_name} {row.original.last_name}
        </p>
        <p className='truncate text-xs text-muted-foreground'>{row.original.email}</p>
        {row.original.staff_id && (
          <p className='truncate text-xs text-muted-foreground'>{row.original.staff_id}</p>
        )}
      </div>
    ),
    size: 240,
    minSize: 160,
  },
  {
    accessorKey: 'designation',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Designation' />,
    cell: ({ row }) =>
      row.original.designation ? (
        <span className='text-sm'>{row.original.designation}</span>
      ) : (
        <Empty />
      ),
    size: 180,
  },
  {
    id: 'department_name',
    accessorKey: 'department_name',
    header: 'Department',
    enableSorting: false,
    cell: ({ row }) => (
      <div className='min-w-0'>
        {row.original.department_name ? (
          <span className='text-sm'>{row.original.department_name}</span>
        ) : (
          <Empty />
        )}
        {row.original.institution_name && (
          <p className='truncate text-xs text-muted-foreground'>
            {row.original.institution_name}
          </p>
        )}
      </div>
    ),
    size: 200,
  },
  {
    id: 'category_name',
    accessorKey: 'category_name',
    header: 'Category',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.category_name ? (
        <span className='text-sm'>{row.original.category_name}</span>
      ) : (
        <Empty />
      ),
    size: 160,
  },
  {
    accessorKey: 'biometric_id',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Biometric' />,
    cell: ({ row }) =>
      row.original.biometric_id ? (
        <div className='min-w-0'>
          <span className='font-mono text-sm'>{row.original.biometric_id}</span>
          {row.original.biometric_machine_name && (
            <p className='truncate text-xs text-muted-foreground'>
              {row.original.biometric_machine_name}
            </p>
          )}
        </div>
      ) : (
        <Empty />
      ),
    size: 160,
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge
          variant='secondary'
          className='bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        >
          <CheckCircle2 className='mr-1 h-3 w-3' />
          Active
        </Badge>
      ) : (
        <Badge
          variant='secondary'
          className='bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300'
        >
          <XCircle className='mr-1 h-3 w-3' />
          Inactive
        </Badge>
      ),
    size: 120,
  },
  {
    id: 'missing_count',
    accessorKey: 'missing_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Missing Fields' />
    ),
    cell: ({ row }) => (
      <div className='flex max-w-[320px] flex-wrap gap-1'>
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
    ),
    size: 340,
    minSize: 200,
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <Button variant='ghost' size='icon' asChild>
        <Link href={`/staff/list/${row.original.id}`} aria-label='View employee'>
          <Eye className='h-4 w-4' />
        </Link>
      </Button>
    ),
    size: 60,
  },
];

/**
 * Keys are DATA keys, values are the spreadsheet headers. Getting this
 * backwards produces a file with the right header row and zero columns of data
 * — and the export still reports success.
 */
export const INCOMPLETE_STAFF_EXPORT_MAPPING: Record<string, string> = {
  first_name: 'Name',
  staff_id: 'Staff ID',
  email: 'Email',
  designation: 'Designation',
  department_name: 'Department',
  institution_name: 'Institution',
  category_name: 'Category',
  biometric_id: 'Biometric Code',
  biometric_machine_name: 'Biometric Machine',
  is_active: 'Status',
  missing_count: 'Missing Count',
  missing_fields_label: 'Missing Fields',
};

export const INCOMPLETE_STAFF_EXPORT_HEADERS = Object.keys(
  INCOMPLETE_STAFF_EXPORT_MAPPING
);

/** Positional — must stay in the same order as the mapping's keys. */
export const INCOMPLETE_STAFF_EXPORT_WIDTHS = [
  { wch: 28 }, // Name
  { wch: 14 }, // Staff ID
  { wch: 32 }, // Email
  { wch: 26 }, // Designation
  { wch: 26 }, // Department
  { wch: 30 }, // Institution
  { wch: 22 }, // Category
  { wch: 16 }, // Biometric Code
  { wch: 26 }, // Biometric Machine
  { wch: 12 }, // Status
  { wch: 14 }, // Missing Count
  { wch: 48 }, // Missing Fields
];

/**
 * A PDF page fits far fewer columns than a spreadsheet, so it prints a curated
 * subset. These keys bypass column visibility, which is how a column hidden in
 * the UI can still reach the PDF.
 */
export const INCOMPLETE_STAFF_PDF_HEADERS = [
  'first_name',
  'staff_id',
  'designation',
  'department_name',
  'missing_fields_label',
];

/** Applied to every exported row across CSV / XLSX / PDF. */
export function transformIncompleteStaffForExport(
  row: IncompleteStaffDetail
): Record<string, string | number | boolean | null | undefined> {
  return {
    first_name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    staff_id: row.staff_id ?? '',
    email: row.email ?? '',
    designation: row.designation ?? '',
    department_name: row.department_name ?? '',
    institution_name: row.institution_name ?? '',
    category_name: row.category_name ?? '',
    biometric_id: row.biometric_id ?? '',
    biometric_machine_name: row.biometric_machine_name ?? '',
    is_active: row.is_active ? 'Active' : 'Inactive',
    missing_count: row.missing_count ?? 0,
    missing_fields_label: (row.missingFields ?? []).join(', '),
  };
}
