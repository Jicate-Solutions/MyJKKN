'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle, Mail, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';

export const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'enrolled', label: 'Enrolled' },
];

export function getStatusColor(status: string | null): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    submitted: 'bg-blue-100 text-blue-800',
    under_review: 'bg-orange-100 text-orange-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    enrolled: 'bg-[#0b6d41] text-white',
  };
  return colors[status || 'draft'] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string | null): string {
  const found = STATUS_OPTIONS.find((s) => s.value === status);
  return found ? found.label : (status?.replace(/_/g, ' ') ?? 'Draft');
}

function getStatusIcon(status: string | null) {
  switch (status) {
    case 'approved':
    case 'enrolled':
      return <CheckCircle className="h-3.5 w-3.5 text-green-600" />;
    case 'rejected':
      return <AlertCircle className="h-3.5 w-3.5 text-red-600" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-yellow-600" />;
  }
}

export interface ApplicationStatusRow {
  id: string;
  institution_id: string;
  lead_id: string;
  program_id: string | null;
  academic_year: string | null;
  application_number: string | null;
  status: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  reviewer_id: string | null;
  review_notes: string | null;
  rejection_reason: string | null;
  admission_leads?: {
    full_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

export const columns: ColumnDef<ApplicationStatusRow>[] = [
  {
    accessorKey: 'application_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Application ID" />
    ),
    cell: ({ row }) => {
      const appNum = row.getValue('application_number') as string | null;
      return (
        <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
          {appNum ?? row.original.id.slice(0, 12)}
        </code>
      );
    },
    size: 180,
    minSize: 140,
  },
  {
    id: 'lead_name',
    accessorFn: (row) => row.admission_leads?.full_name ?? 'Unknown',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applicant" />
    ),
    cell: ({ row }) => {
      const lead = row.original.admission_leads;
      const name = lead?.full_name ?? 'Unknown';
      const email = lead?.email;
      const phone = lead?.phone;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{name}</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {email}
              </span>
            )}
            {phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {phone}
              </span>
            )}
          </div>
        </div>
      );
    },
    size: 260,
    minSize: 180,
  },
  {
    accessorKey: 'program_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Program" />
    ),
    cell: ({ row }) => {
      const programId = row.getValue('program_id') as string | null;
      return (
        <span className="text-sm text-muted-foreground">
          {programId ? programId.slice(0, 8) + '...' : '—'}
        </span>
      );
    },
    size: 140,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue('status') as string | null;
      return (
        <div className="flex items-center gap-1.5">
          {getStatusIcon(status)}
          <Badge className={getStatusColor(status)} variant="secondary">
            {getStatusLabel(status)}
          </Badge>
        </div>
      );
    },
    size: 150,
  },
  {
    accessorKey: 'submitted_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Submitted" />
    ),
    cell: ({ row }) => {
      const date = row.getValue('submitted_at') as string | null;
      return (
        <span className="text-sm text-muted-foreground">
          {date ? format(new Date(date), 'MMM dd, yyyy') : '—'}
        </span>
      );
    },
    size: 130,
  },
  {
    accessorKey: 'academic_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Academic Year" />
    ),
    cell: ({ row }) => {
      const year = row.getValue('academic_year') as string | null;
      return (
        <span className="text-sm text-muted-foreground">{year ?? '—'}</span>
      );
    },
    size: 130,
  },
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actions" />
    ),
    cell: ({ row }) => <DataTableRowActions row={row} />,
    size: 80,
    enableSorting: false,
    enableHiding: false,
  },
];
