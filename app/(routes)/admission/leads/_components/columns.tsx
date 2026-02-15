'use client';

import { ColumnDef, Row } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Flame, Star } from 'lucide-react';
import type { AdmissionLead } from '@/types/admission';
import { DataTableRowActions } from './row-actions';

export const FUNNEL_STAGES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'not_reachable', label: 'Not Reachable' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow_up_scheduled', label: 'Follow-up Scheduled' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'application_started', label: 'Application Started' },
  { value: 'application_submitted', label: 'Application Submitted' },
  { value: 'documents_pending', label: 'Documents Pending' },
  { value: 'documents_verified', label: 'Documents Verified' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interview_completed', label: 'Interview Completed' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'token_paid', label: 'Token Paid' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'offered', label: 'Offered' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrew', label: 'Withdrew' },
  { value: 'expired', label: 'Expired' },
  { value: 'lost', label: 'Lost' },
  { value: 'dormant', label: 'Dormant' }
];

export function getStageColor(stage: string | null): string {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-indigo-100 text-indigo-800',
    not_reachable: 'bg-slate-100 text-slate-800',
    interested: 'bg-sky-100 text-sky-800',
    follow_up_scheduled: 'bg-violet-100 text-violet-800',
    engaged: 'bg-fuchsia-100 text-fuchsia-800',
    qualified: 'bg-purple-100 text-purple-800',
    application_started: 'bg-pink-100 text-pink-800',
    application_submitted: 'bg-rose-100 text-rose-800',
    documents_pending: 'bg-orange-100 text-orange-800',
    documents_verified: 'bg-amber-100 text-amber-800',
    interview_scheduled: 'bg-yellow-100 text-yellow-800',
    interview_completed: 'bg-lime-100 text-lime-800',
    offer_sent: 'bg-green-100 text-green-800',
    offer_accepted: 'bg-emerald-100 text-emerald-800',
    token_paid: 'bg-teal-100 text-teal-800',
    applied: 'bg-violet-100 text-violet-800',
    interviewed: 'bg-rose-100 text-rose-800',
    offered: 'bg-orange-100 text-orange-800',
    enrolled: 'bg-cyan-100 text-cyan-800',
    confirmed: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    withdrew: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800',
    lost: 'bg-gray-100 text-gray-800',
    dormant: 'bg-stone-100 text-stone-800'
  };
  return colors[stage || 'new'] || 'bg-gray-100 text-gray-800';
}

function getStageLabel(stage: string | null): string {
  const found = FUNNEL_STAGES.find((s) => s.value === stage);
  return found ? found.label : stage?.replace(/_/g, ' ') || 'New';
}

function getPriorityBadge(lead: AdmissionLead) {
  if (lead.is_hot_lead) {
    return (
      <Badge variant="destructive" className="gap-1">
        <Flame className="h-3 w-3" />
        Hot
      </Badge>
    );
  }
  if (lead.is_priority) {
    return (
      <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800">
        <Star className="h-3 w-3" />
        Warm
      </Badge>
    );
  }
  return <span className="text-sm text-muted-foreground">Cold</span>;
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
    accessorKey: 'full_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Lead Name" />
    ),
    cell: ({ row }) => {
      const lead = row.original;
      return (
        <Link
          href={`/admission/leads/${lead.id}`}
          className="flex items-center gap-2 hover:text-primary font-medium"
        >
          <span>{lead.full_name || 'Unknown'}</span>
          {lead.is_hot_lead && (
            <Flame className="h-4 w-4 text-orange-500 shrink-0" />
          )}
          {lead.is_priority && !lead.is_hot_lead && (
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
          )}
        </Link>
      );
    },
    size: 250,
    minSize: 180
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Contact" />
    ),
    cell: ({ row }) => {
      const lead = row.original;
      return (
        <div className="flex flex-col">
          {lead.email && <span className="text-sm">{lead.email}</span>}
          {lead.phone && (
            <span className="text-sm text-muted-foreground">{lead.phone}</span>
          )}
        </div>
      );
    }
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
    accessorKey: 'score',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Score" />
    ),
    cell: ({ row }) => {
      const score = row.getValue('score') as number;
      return <span className="font-medium">{score ?? 0}</span>;
    },
    maxSize: 80
  },
  {
    id: 'priority',
    accessorKey: 'is_hot_lead',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Priority" />
    ),
    cell: ({ row }) => getPriorityBadge(row.original),
    maxSize: 100
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
