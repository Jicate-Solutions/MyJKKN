'use client';

import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  Eye,
  Download,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Checkbox } from '@/components/ui/checkbox';
import type { AttendanceConsolidationReport } from '@/types/attendance';

interface ColumnsContext {
  onDelete: (reportId: string) => void;
  onRegenerate: (report: AttendanceConsolidationReport) => void;
  isDeleting: boolean;
  isRegenerating: boolean;
  isSuperAdmin: boolean;
}

export const getColumns = (context: ColumnsContext): ColumnDef<AttendanceConsolidationReport>[] => {
  const { onDelete, onRegenerate, isDeleting, isRegenerating, isSuperAdmin } = context;

  const columns: ColumnDef<AttendanceConsolidationReport>[] = [
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
      size: 40,
      minSize: 40,
      maxSize: 40,
    },
    {
      accessorKey: 'reportName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Report Name" />
      ),
      cell: ({ row }) => {
        const report = row.original;
        return (
          <div className="flex flex-col gap-1">
            <Link
              href={`/academic/attendance/consolidation/${report.id}`}
              className="font-medium hover:underline line-clamp-1"
            >
              {report.reportName}
            </Link>
            {report.reportDescription && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {report.reportDescription}
              </p>
            )}
          </div>
        );
      },
      size: 250,
      minSize: 150,
      maxSize: 400,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
          completed: 'default',
          processing: 'secondary',
          pending: 'outline',
          failed: 'destructive',
        };

        const icons: Record<string, React.ReactNode> = {
          completed: <CheckCircle2 className="h-3 w-3 mr-1" />,
          processing: <Loader2 className="h-3 w-3 mr-1 animate-spin" />,
          pending: <Clock className="h-3 w-3 mr-1" />,
          failed: <XCircle className="h-3 w-3 mr-1" />,
        };

        return (
          <Badge variant={variants[status] || 'outline'} className="capitalize">
            {icons[status]}
            {status}
          </Badge>
        );
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
      size: 120,
      minSize: 100,
      maxSize: 150,
    },
    {
      accessorKey: 'format',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Format" />
      ),
      cell: ({ row }) => {
        const format = row.getValue('format') as string;
        return (
          <Badge variant="outline" className="uppercase font-mono">
            {format}
          </Badge>
        );
      },
      size: 80,
      minSize: 70,
      maxSize: 100,
    },
    {
      accessorKey: 'reportParams.groupBy',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Group By" />
      ),
      cell: ({ row }) => {
        const groupBy = row.original.reportParams.groupBy;
        return (
          <Badge variant="secondary" className="capitalize">
            {groupBy}
          </Badge>
        );
      },
      size: 100,
      minSize: 80,
      maxSize: 120,
    },
    {
      accessorKey: 'reportParams.dateFrom',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date Range" />
      ),
      cell: ({ row }) => {
        const { dateFrom, dateTo } = row.original.reportParams;
        return (
          <div className="text-xs">
            <div>{dateFrom}</div>
            <div className="text-muted-foreground">to {dateTo}</div>
          </div>
        );
      },
      size: 140,
      minSize: 120,
      maxSize: 180,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Generated At" />
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue('createdAt'));
        return (
          <div className="text-xs">
            <div>{format(date, 'PPP')}</div>
            <div className="text-muted-foreground">{format(date, 'p')}</div>
          </div>
        );
      },
      size: 150,
      minSize: 130,
      maxSize: 180,
    },
  ];

  // Add institution column only for super admin
  if (isSuperAdmin) {
    columns.splice(2, 0, {
      accessorKey: 'institution.name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Institution" />
      ),
      cell: ({ row }) => {
        const institution = row.original.institution;
        return (
          <div className="text-sm font-medium line-clamp-1">
            {institution?.name || 'N/A'}
          </div>
        );
      },
      size: 200,
      minSize: 150,
      maxSize: 300,
    });
  }

  // Actions column
  columns.push({
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      const report = row.original;

      return (
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem asChild disabled={report.status !== 'completed'}>
                <Link href={`/academic/attendance/consolidation/${report.id}`}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Link>
              </DropdownMenuItem>

              {report.status === 'completed' && report.fileUrl && (
                <DropdownMenuItem asChild>
                  <a href={report.fileUrl} download target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </a>
                </DropdownMenuItem>
              )}

              {(report.status === 'failed' || report.status === 'completed') && (
                <DropdownMenuItem
                  onClick={() => onRegenerate(report)}
                  disabled={isRegenerating}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
                  Regenerate
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => onDelete(report.id)}
                disabled={isDeleting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
    size: 80,
    minSize: 80,
    maxSize: 80,
  });

  return columns;
};
