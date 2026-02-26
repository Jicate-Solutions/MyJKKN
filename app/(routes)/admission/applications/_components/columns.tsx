'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import type { AdmissionApplication } from '@/types/admission';
import { DataTableRowActions } from './row-actions';

export const APPLICATION_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'documents_pending', label: 'Documents Pending' },
  { value: 'documents_verified', label: 'Documents Verified' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'withdrawn', label: 'Withdrawn' }
];

export function getStatusColor(status: string | null): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    submitted: 'bg-blue-100 text-blue-800',
    under_review: 'bg-purple-100 text-purple-800',
    documents_pending: 'bg-orange-100 text-orange-800',
    documents_verified: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    offer_sent: 'bg-teal-100 text-teal-800',
    offer_accepted: 'bg-emerald-100 text-emerald-800',
    enrolled: 'bg-cyan-100 text-cyan-800',
    withdrawn: 'bg-slate-100 text-slate-800'
  };
  return colors[status || 'draft'] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string | null): string {
  const found = APPLICATION_STATUSES.find((s) => s.value === status);
  return found ? found.label : status?.replace(/_/g, ' ') || 'Draft';
}

function getStatusIcon(status: string | null) {
  switch (status) {
    case 'approved':
    case 'enrolled':
    case 'offer_accepted':
    case 'documents_verified':
      return <CheckCircle className="h-3.5 w-3.5 text-green-600" />;
    case 'rejected':
    case 'withdrawn':
      return <AlertCircle className="h-3.5 w-3.5 text-red-600" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-yellow-600" />;
  }
}

export const columns: ColumnDef<AdmissionApplication>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    maxSize: 50,
    enableSorting: false,
    enableHiding: false
  },
  {
    accessorKey: 'application_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Application ID" />
    ),
    cell: ({ row }) => {
      const app = row.original;
      return (
        <Link
          href={`/admission/applications/${app.id}`}
          className="hover:text-primary font-medium"
        >
          {app.application_number || app.id.slice(0, 8)}
        </Link>
      );
    },
    size: 180,
    minSize: 140
  },
  {
    accessorKey: 'full_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applicant" />
    ),
    cell: ({ row }) => {
      const app = row.original;
      const name = app.full_name || (app as any).form_data?.full_name || '-';
      const email = app.email || (app as any).form_data?.email;
      const phone = app.phone || (app as any).form_data?.phone;
      return (
        <div className="flex flex-col">
          <Link
            href={`/admission/applications/${app.id}`}
            className="hover:text-primary font-medium"
          >
            {name}
          </Link>
          {(email || phone) && (
            <span className="text-sm text-muted-foreground">
              {email || phone}
            </span>
          )}
        </div>
      );
    },
    size: 250,
    minSize: 180
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
    }
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
          {programId ? programId.slice(0, 8) + '...' : '-'}
        </span>
      );
    }
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
          {date ? new Date(date).toLocaleDateString() : '-'}
        </span>
      );
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return date ? new Date(date).toLocaleDateString() : '-';
    }
  },
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actions" />
    ),
    cell: ({ row }) => <DataTableRowActions row={row} />
  }
];
