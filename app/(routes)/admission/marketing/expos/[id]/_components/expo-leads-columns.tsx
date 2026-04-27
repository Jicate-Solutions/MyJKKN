'use client';

// ════════════════════════════════════════════════════════════════════════════
// Column definitions for the leads tab on the expo detail page.
// Uses the advanced DataTable contract from components/data-table.
// ════════════════════════════════════════════════════════════════════════════

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { SourceBadge } from '@/app/(routes)/admission/leads/_components/source-badge';
import type { AdmissionLead } from '@/types/admission';

function getStageColor(stage: string | null | undefined): string {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-cyan-100 text-cyan-800',
    interested: 'bg-emerald-100 text-emerald-800',
    follow_up_scheduled: 'bg-yellow-100 text-yellow-800',
    qualified: 'bg-purple-100 text-purple-800',
    applied: 'bg-indigo-100 text-indigo-800',
    enrolled: 'bg-green-100 text-green-800',
    lost: 'bg-red-100 text-red-800',
    dormant: 'bg-gray-100 text-gray-800',
  };
  return colors[stage ?? ''] || 'bg-gray-100 text-gray-800';
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getExpoLeadsColumns(): ColumnDef<AdmissionLead>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
      minSize: 40,
      maxSize: 40,
    },
    {
      accessorKey: 'full_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const lead = row.original;
        const name = lead.full_name || `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() || '—';
        return (
          <div className="flex flex-col">
            <Link
              href={`/admission/leads/${lead.id}`}
              className="font-medium text-primary hover:underline"
            >
              {name}
            </Link>
            {lead.email && (
              <span className="text-xs text-muted-foreground truncate">
                {lead.email}
              </span>
            )}
          </div>
        );
      },
      size: 220,
    },
    {
      accessorKey: 'phone',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <div className="flex flex-col">
            <span className="text-sm">{lead.phone || '—'}</span>
            {lead.alternate_phone && (
              <span className="text-xs text-muted-foreground">alt: {lead.alternate_phone}</span>
            )}
          </div>
        );
      },
      size: 160,
    },
    {
      accessorKey: 'parent_name',
      header: 'Parent',
      enableSorting: false,
      cell: ({ row }) => {
        const lead = row.original;
        if (!lead.parent_name && !lead.parent_phone) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-col">
            <span className="text-sm">{lead.parent_name || '—'}</span>
            {lead.parent_phone && (
              <span className="text-xs text-muted-foreground">{lead.parent_phone}</span>
            )}
          </div>
        );
      },
      size: 180,
    },
    {
      accessorKey: 'funnel_stage',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stage" />,
      cell: ({ row }) => {
        const stage = row.original.funnel_stage || 'new';
        return (
          <Badge className={`text-xs capitalize ${getStageColor(stage)}`}>
            {stage.replace(/_/g, ' ')}
          </Badge>
        );
      },
      size: 140,
    },
    {
      accessorKey: 'source',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      cell: ({ row }) => <SourceBadge source={row.original.source as any} />,
      size: 110,
    },
    {
      id: 'counselor_name',
      header: 'Counselor',
      enableSorting: false,
      cell: ({ row }) => {
        const counselor = (row.original as any).counselor;
        return counselor?.name ? (
          <span className="text-sm">{counselor.name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">Unassigned</span>
        );
      },
      size: 160,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Captured" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.original.created_at)}
        </span>
      ),
      size: 160,
    },
  ];
}
