'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Shuffle,
  GraduationCap,
  MapPin,
  Target,
  Building,
  Activity,
  Settings,
} from 'lucide-react';
import type { AssignmentRule } from '@/lib/services/admission/assignment-rules-service';
import { DataTableRowActions } from './row-actions';

export function getRuleTypeIcon(type?: string) {
  switch (type) {
    case 'program':
      return <GraduationCap className="h-4 w-4 text-blue-500" />;
    case 'round_robin':
      return <Shuffle className="h-4 w-4 text-purple-500" />;
    case 'location':
      return <MapPin className="h-4 w-4 text-green-500" />;
    case 'score':
      return <Target className="h-4 w-4 text-red-500" />;
    case 'source':
      return <Building className="h-4 w-4 text-orange-500" />;
    case 'workload':
      return <Activity className="h-4 w-4 text-yellow-500" />;
    default:
      return <Settings className="h-4 w-4 text-gray-500" />;
  }
}

export function getColumns(
  handleRowDeselection: ((rowId: string) => void) | null | undefined,
  onRefetch?: () => void
): ColumnDef<AssignmentRule>[] {
  return [
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
      enableHiding: false,
    },
    {
      accessorKey: 'priority',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Priority" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono">
          #{row.getValue('priority')}
        </Badge>
      ),
      size: 90,
      minSize: 70,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Rule Name" />
      ),
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <div>
            <p className="font-medium">{rule.name}</p>
            {rule.description && (
              <p className="text-sm text-muted-foreground">{rule.description}</p>
            )}
          </div>
        );
      },
      size: 280,
      minSize: 200,
    },
    {
      id: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => {
        const rule = row.original;
        const type = rule.type;
        return (
          <div className="flex items-center gap-2">
            {getRuleTypeIcon(type)}
            <span className="capitalize text-sm">
              {(type || 'custom').replace(/_/g, ' ')}
            </span>
          </div>
        );
      },
      enableSorting: false,
      size: 150,
      minSize: 120,
    },
    {
      accessorKey: 'is_active',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const isActive = row.getValue('is_active') as boolean;
        return (
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? (
              <Play className="h-3 w-3 mr-1" />
            ) : (
              <Pause className="h-3 w-3 mr-1" />
            )}
            {isActive ? 'Active' : 'Paused'}
          </Badge>
        );
      },
      size: 110,
      minSize: 90,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => {
        const date = row.getValue('created_at') as string;
        return (
          <span className="text-sm text-muted-foreground">
            {date ? new Date(date).toLocaleDateString() : '-'}
          </span>
        );
      },
      size: 120,
      minSize: 100,
    },
    {
      id: 'actions',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Actions" />
      ),
      cell: ({ row }) => (
        <DataTableRowActions row={row} onRefetch={onRefetch} />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 80,
      minSize: 60,
    },
  ];
}
