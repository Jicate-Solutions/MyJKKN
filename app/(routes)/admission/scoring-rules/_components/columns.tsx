'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import type { ScoringRule } from '@/lib/services/admission/scoring-rules-service';
import { DataTableRowActions } from './row-actions';

export const columns: ColumnDef<ScoringRule>[] = [
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
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Rule Name" />
    ),
    cell: ({ row }) => {
      const rule = row.original;
      return (
        <div className="flex flex-col">
          <span className="font-medium">{rule.name}</span>
          {rule.description && (
            <span className="text-sm text-muted-foreground line-clamp-1">
              {rule.description}
            </span>
          )}
        </div>
      );
    },
    size: 280,
    minSize: 180
  },
  {
    id: 'engagement_weight',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Engagement Weight" />
    ),
    cell: ({ row }) => {
      const config = row.original.criteria;
      const weight = config?.engagementWeight ?? 0;
      return (
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${weight}%` }}
            />
          </div>
          <span className="text-sm font-medium">{weight}%</span>
        </div>
      );
    },
    enableSorting: false
  },
  {
    id: 'quality_weight',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Quality Weight" />
    ),
    cell: ({ row }) => {
      const config = row.original.criteria;
      const weight = config?.qualityWeight ?? 0;
      return (
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500"
              style={{ width: `${weight}%` }}
            />
          </div>
          <span className="text-sm font-medium">{weight}%</span>
        </div>
      );
    },
    enableSorting: false
  },
  {
    id: 'criteria_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Criteria" />
    ),
    cell: ({ row }) => {
      const config = row.original.criteria;
      const engagementCount = config?.engagementCriteria?.filter(
        (c) => c.enabled
      ).length ?? 0;
      const qualityCount = config?.qualityCriteria?.filter(
        (c) => c.enabled
      ).length ?? 0;
      return (
        <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
          <span>{engagementCount} engagement</span>
          <span>{qualityCount} quality</span>
        </div>
      );
    },
    enableSorting: false
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge
          variant={isActive ? 'default' : 'outline'}
          className={
            isActive
              ? 'bg-green-100 text-green-800 hover:bg-green-100'
              : 'text-muted-foreground'
          }
        >
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    },
    maxSize: 100
  },
  {
    accessorKey: 'updated_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Last Updated" />
    ),
    cell: ({ row }) => {
      const date = row.getValue('updated_at') as string;
      return (
        <span className="text-sm text-muted-foreground">
          {date ? new Date(date).toLocaleDateString() : '-'}
        </span>
      );
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
