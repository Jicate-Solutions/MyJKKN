'use client';
// ============================================
// ROLES TAB — EMPLOYEE NAME LIST
// ============================================
// Created: 2026-09-25
// Name + institution email per employee, narrowed by the role picked on the
// Roles tab. The rows are already in memory (the dashboard's single staff
// read), so paging / search / sort run client-side inside fetchData.
// ============================================

import { useCallback } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  type DataFetchParams,
  type DataFetchResult,
} from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import type { StaffRoleMember } from '@/types/staff';

function Empty() {
  return <span className='text-muted-foreground italic'>—</span>;
}

const roleMemberColumns: ColumnDef<StaffRoleMember>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    cell: ({ row }) => (
      <Link
        href={`/staff/list/${row.original.id}`}
        className='font-medium hover:underline'
      >
        {row.original.name}
      </Link>
    ),
    size: 220,
    minSize: 160,
  },
  {
    accessorKey: 'staffId',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Staff ID' />,
    cell: ({ row }) =>
      row.original.staffId ? (
        <span className='font-mono text-sm'>{row.original.staffId}</span>
      ) : (
        <Empty />
      ),
    size: 130,
  },
  {
    accessorKey: 'institutionEmail',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution Email' />
    ),
    cell: ({ row }) =>
      row.original.institutionEmail ? (
        <span className='text-sm'>{row.original.institutionEmail}</span>
      ) : (
        <Empty />
      ),
    size: 260,
  },
  {
    accessorKey: 'roleName',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Role' />,
    cell: ({ row }) => <Badge variant='outline'>{row.original.roleName}</Badge>,
    size: 160,
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
    accessorKey: 'institutionName',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Institution' />,
    cell: ({ row }) => (
      <div className='min-w-0'>
        {row.original.institutionName ? (
          <span className='text-sm'>{row.original.institutionName}</span>
        ) : (
          <Empty />
        )}
        {row.original.departmentName && (
          <p className='truncate text-xs text-muted-foreground'>
            {row.original.departmentName}
          </p>
        )}
      </div>
    ),
    size: 240,
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.isActive ? (
        <Badge
          variant='secondary'
          className='bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        >
          Active
        </Badge>
      ) : (
        <Badge
          variant='secondary'
          className='bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300'
        >
          Inactive
        </Badge>
      ),
    size: 100,
  },
];

/** Keys are DATA keys, values are the spreadsheet headers. */
const ROLE_MEMBERS_EXPORT_MAPPING: Record<string, string> = {
  name: 'Name',
  staffId: 'Staff ID',
  institutionEmail: 'Institution Email',
  roleName: 'Role',
  designation: 'Designation',
  institutionName: 'Institution',
  departmentName: 'Department',
  isActive: 'Status',
};

const ROLE_MEMBERS_EXPORT_HEADERS = Object.keys(ROLE_MEMBERS_EXPORT_MAPPING);

/** Positional — same order as the mapping's keys. */
const ROLE_MEMBERS_EXPORT_WIDTHS = [
  { wch: 30 },
  { wch: 14 },
  { wch: 34 },
  { wch: 22 },
  { wch: 26 },
  { wch: 32 },
  { wch: 26 },
  { wch: 10 },
];

function transformRoleMemberForExport(
  row: StaffRoleMember
): Record<string, string | number | boolean | null | undefined> {
  return {
    name: row.name,
    staffId: row.staffId ?? '',
    institutionEmail: row.institutionEmail ?? '',
    roleName: row.roleName,
    designation: row.designation ?? '',
    institutionName: row.institutionName ?? '',
    departmentName: row.departmentName ?? '',
    isActive: row.isActive ? 'Active' : 'Inactive',
  };
}

const SORTABLE_KEYS = new Set<keyof StaffRoleMember>([
  'name',
  'staffId',
  'institutionEmail',
  'roleName',
  'designation',
  'institutionName',
]);

interface RoleMembersTableProps {
  members: StaffRoleMember[];
  /** Human label for the current role scope, printed on the PDF. */
  scopeLabel: string;
}

export function RoleMembersTable({ members, scopeLabel }: RoleMembersTableProps) {
  // `members` is in the dep array, so a new role selection or dashboard filter
  // changes this callback's identity and the DataTable refetches.
  const fetchData = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<StaffRoleMember>> => {
      const q = (params.search || '').trim().toLowerCase();
      let rows = q
        ? members.filter((m) =>
            [m.name, m.institutionEmail, m.staffId, m.designation]
              .some((v) => v && v.toLowerCase().includes(q))
          )
        : members;

      const sortKey = params.sort_by as keyof StaffRoleMember;
      if (sortKey && SORTABLE_KEYS.has(sortKey)) {
        const dir = params.sort_order === 'desc' ? -1 : 1;
        rows = [...rows].sort(
          (a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')) * dir
        );
      }

      const limit = params.limit || 10;
      const page = params.page || 1;
      const start = (page - 1) * limit;

      return {
        success: true,
        data: rows.slice(start, start + limit),
        pagination: {
          page,
          limit,
          total_pages: Math.max(1, Math.ceil(rows.length / limit)),
          total_items: rows.length,
        },
      };
    },
    [members]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as any}
      getColumns={() => roleMemberColumns as any}
      idField='id'
      exportConfig={{
        entityName: 'employees-by-role',
        columnMapping: ROLE_MEMBERS_EXPORT_MAPPING,
        columnWidths: ROLE_MEMBERS_EXPORT_WIDTHS,
        headers: ROLE_MEMBERS_EXPORT_HEADERS,
        transformFunction: transformRoleMemberForExport as any,
        pdf: {
          headers: ['name', 'staffId', 'institutionEmail', 'roleName', 'institutionName'],
          title: 'Employees by Role',
          subtitle: scopeLabel,
          orientation: 'landscape',
        },
      }}
      config={{
        // The dashboard tab selection already owns the query string.
        enableUrlState: false,
        enableRowSelection: false,
        enableDateFilter: false,
        enableColumnFilters: false,
        enableSearch: true,
        enableExport: true,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        enableDataSummary: true,
        searchPlaceholder: 'Search name, email, staff ID, designation…',
        columnResizingTableId: 'staff-role-members-table',
        size: 'sm',
      }}
    />
  );
}
