'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ArrowRightLeft, Building2, GitBranch, GraduationCap } from 'lucide-react';
import type { LateralEntryApplication } from '@/lib/services/admission/lateral-entry-service';
import { format } from 'date-fns';

export const APPLICATION_STATUS_OPTIONS = [
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'documents_pending', label: 'Documents Pending' },
];

export const APPLICATION_TYPE_OPTIONS = [
  { value: 'lateral_entry', label: 'Lateral Entry' },
  { value: 'branch_transfer', label: 'Branch Transfer' },
];

export function getApplicationStatusColor(status: string): string {
  const colors: Record<string, string> = {
    approved: 'bg-green-100 text-green-800',
    under_review: 'bg-blue-100 text-blue-800',
    documents_pending: 'bg-yellow-100 text-yellow-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getEligibilityStatusColor(status: string): string {
  const colors: Record<string, string> = {
    eligible: 'bg-green-100 text-green-800',
    pending_verification: 'bg-yellow-100 text-yellow-800',
    not_eligible: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'lateral_entry':
      return <ArrowRightLeft className="h-4 w-4 text-blue-500" />;
    case 'branch_transfer':
      return <GitBranch className="h-4 w-4 text-purple-500" />;
    default:
      return <GraduationCap className="h-4 w-4 text-gray-500" />;
  }
}

export const columns: ColumnDef<LateralEntryApplication>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'application_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Application #" />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-sm font-medium">
        {row.getValue('application_number')}
      </span>
    ),
  },
  {
    accessorKey: 'student_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Student Name" />
    ),
    cell: ({ row }) => {
      const email = row.original.email;
      return (
        <div className="flex flex-col">
          <span className="font-medium">{row.getValue('student_name')}</span>
          <span className="text-xs text-muted-foreground">{email}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'application_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type: string = row.getValue('application_type');
      const label =
        APPLICATION_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
      return (
        <div className="flex items-center gap-2">
          <TypeIcon type={type} />
          <span className="text-sm">{label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'applied_program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applied Program" />
    ),
    cell: ({ row }) => {
      const program: string | null = row.getValue('applied_program_name');
      return (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{program ?? '—'}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'eligibility_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Eligibility" />
    ),
    cell: ({ row }) => {
      const status: string = row.getValue('eligibility_status');
      return (
        <Badge className={getEligibilityStatusColor(status)}>
          {status.replace(/_/g, ' ')}
        </Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'application_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status: string = row.getValue('application_status');
      const label =
        APPLICATION_STATUS_OPTIONS.find((o) => o.value === status)?.label ??
        status;
      return (
        <Badge className={getApplicationStatusColor(status)}>{label}</Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'documents_uploaded',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Docs" />
    ),
    cell: ({ row }) => {
      const uploaded: boolean = row.getValue('documents_uploaded');
      return uploaded ? (
        <Badge className="bg-green-100 text-green-800">Uploaded</Badge>
      ) : (
        <Badge className="bg-yellow-100 text-yellow-800 flex items-center gap-1 w-fit">
          <AlertCircle className="h-3 w-3" />
          Pending
        </Badge>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applied On" />
    ),
    cell: ({ row }) => {
      const date: string = row.getValue('created_at');
      return (
        <span className="text-sm text-muted-foreground">
          {format(new Date(date), 'dd MMM yyyy')}
        </span>
      );
    },
  },
];
