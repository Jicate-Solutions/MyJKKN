'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import type { AdmissionLead } from '@/types/admission';
import { DataTableRowActions } from './row-actions';

// Application-relevant funnel stages (subset of all funnel stages)
export const APPLICATION_STAGES = [
  { value: 'application_started', label: 'Application Started' },
  { value: 'application_submitted', label: 'Application Submitted' },
  { value: 'documents_pending', label: 'Documents Pending' },
  { value: 'documents_verified', label: 'Documents Verified' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interview_completed', label: 'Interview Completed' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'withdrew', label: 'Withdrew' }
];

export function getStageColor(stage: string | null): string {
  const colors: Record<string, string> = {
    application_started: 'bg-pink-100 text-pink-800',
    application_submitted: 'bg-rose-100 text-rose-800',
    documents_pending: 'bg-orange-100 text-orange-800',
    documents_verified: 'bg-amber-100 text-amber-800',
    interview_scheduled: 'bg-yellow-100 text-yellow-800',
    interview_completed: 'bg-lime-100 text-lime-800',
    offer_sent: 'bg-green-100 text-green-800',
    offer_accepted: 'bg-emerald-100 text-emerald-800',
    enrolled: 'bg-cyan-100 text-cyan-800',
    withdrew: 'bg-red-100 text-red-800'
  };
  return colors[stage || 'application_started'] || 'bg-gray-100 text-gray-800';
}

export function getStageLabel(stage: string | null): string {
  const found = APPLICATION_STAGES.find((s) => s.value === stage);
  return found ? found.label : stage?.replace(/_/g, ' ') || 'Unknown';
}

export const columns: ColumnDef<AdmissionLead>[] = [
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
      const lead = row.original;
      return (
        <Link
          href={`/admission/leads/${lead.id}`}
          className="hover:text-primary font-medium"
        >
          {lead.application_number || '-'}
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
      const lead = row.original;
      return (
        <div className="flex flex-col">
          <Link
            href={`/admission/leads/${lead.id}`}
            className="hover:text-primary font-medium"
          >
            {lead.full_name || '-'}
          </Link>
          {(lead.email || lead.phone) && (
            <span className="text-sm text-muted-foreground">
              {lead.email || lead.phone}
            </span>
          )}
        </div>
      );
    },
    size: 250,
    minSize: 180
  },
  {
    accessorKey: 'funnel_stage',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Stage" />
    ),
    cell: ({ row }) => {
      const stage = row.getValue('funnel_stage') as string | null;
      return (
        <Badge className={getStageColor(stage)} variant="secondary">
          {getStageLabel(stage)}
        </Badge>
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
    accessorKey: 'source',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Source" />
    ),
    cell: ({ row }) => {
      const source = row.getValue('source') as string | null;
      return (
        <span className="text-sm text-muted-foreground">
          {source?.replace(/_/g, ' ') || '-'}
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
