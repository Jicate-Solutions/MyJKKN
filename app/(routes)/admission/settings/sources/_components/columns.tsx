'use client';

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Globe, Building2, Users, Activity, UserCheck, UserX } from 'lucide-react';
import type { SourceMaster } from '@/lib/services/admission/source-master-service';
import { SourceRowActions } from './row-actions';

export const columns: ColumnDef<SourceMaster>[] = [
  {
    accessorKey: 'label',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
    cell: ({ row }) => {
      const s = row.original;
      return (
        <Link
          href={`/admission/settings/sources/${s.id}`}
          className="flex flex-col gap-0.5 hover:underline"
        >
          <span className="font-medium">{s.label}</span>
          <span className="text-xs text-muted-foreground font-mono">{s.key}</span>
        </Link>
      );
    },
  },
  {
    accessorKey: 'enum_value',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Routes To" />,
    cell: ({ row }) => (
      <Badge variant="outline" className="font-mono text-xs">
        {row.original.enum_value}
      </Badge>
    ),
  },
  {
    id: 'scope',
    header: 'Scope',
    cell: ({ row }) => {
      const isGlobal = row.original.institution_id === null;
      return (
        <Badge variant={isGlobal ? 'secondary' : 'default'} className="gap-1">
          {isGlobal ? <Globe className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
          {isGlobal ? 'Global' : 'Institution'}
        </Badge>
      );
    },
  },
  {
    id: 'origin',
    header: 'Origin',
    cell: ({ row }) =>
      row.original.is_system ? (
        <Badge variant="outline" className="text-blue-600 border-blue-200">System</Badge>
      ) : (
        <Badge variant="outline" className="text-purple-600 border-purple-200">Custom</Badge>
      ),
  },
  {
    accessorKey: 'counselor_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Counselors" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{row.original.counselor_count ?? 0}</span>
      </div>
    ),
  },
  {
    accessorKey: 'lead_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total Leads" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium tabular-nums">{(row.original.lead_count ?? 0).toLocaleString()}</span>
      </div>
    ),
  },
  {
    accessorKey: 'assigned_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Assigned" />,
    cell: ({ row }) => {
      const total = row.original.lead_count ?? 0;
      const assigned = row.original.assigned_count ?? 0;
      const pct = total > 0 ? Math.round((assigned / total) * 100) : 0;
      return (
        <div className="flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5 text-green-600" />
          <span className="font-medium tabular-nums text-green-700">
            {assigned.toLocaleString()}
          </span>
          {total > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              ({pct}%)
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'unassigned_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Unassigned" />,
    cell: ({ row }) => {
      const total = row.original.lead_count ?? 0;
      const unassigned = row.original.unassigned_count ?? 0;
      const pct = total > 0 ? Math.round((unassigned / total) * 100) : 0;
      const isHighBacklog = unassigned > 0 && pct >= 25;
      return (
        <div className="flex items-center gap-1.5">
          <UserX className={`h-3.5 w-3.5 ${unassigned > 0 ? 'text-orange-600' : 'text-muted-foreground'}`} />
          <span className={`font-medium tabular-nums ${isHighBacklog ? 'text-orange-700' : unassigned > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
            {unassigned.toLocaleString()}
          </span>
          {total > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              ({pct}%)
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
          Active
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Inactive
        </Badge>
      ),
  },
  {
    id: 'actions',
    cell: ({ row }) => <SourceRowActions source={row.original} />,
  },
];
