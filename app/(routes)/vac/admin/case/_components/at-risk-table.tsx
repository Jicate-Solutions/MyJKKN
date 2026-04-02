'use client';

import { useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, type DataFetchParams, type DataFetchResult } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { useAtRiskLearners } from '@/hooks/vac/use-case';
import type { AtRiskLearner, CASERiskLevel } from '@/types/case';
import { format } from 'date-fns';

interface AtRiskTableProps {
  institutionId: string;
}

const RISK_COLORS: Record<CASERiskLevel, string> = {
  on_track: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  at_risk: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  overdue: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function AtRiskTable({ institutionId }: AtRiskTableProps) {
  const { data: learners, isLoading } = useAtRiskLearners(institutionId);

  const getColumns = useCallback(
    (_handleRowDeselection: ((rowId: string) => void) | null | undefined): ColumnDef<AtRiskLearner, unknown>[] => [
      {
        accessorKey: 'user_name',
        header: 'Name',
        size: 180,
      },
      {
        accessorKey: 'user_email',
        header: 'Email',
        size: 200,
      },
      {
        accessorKey: 'programme_name',
        header: 'Programme',
        size: 180,
      },
      {
        accessorKey: 'current_semester',
        header: 'Semester',
        size: 80,
        cell: ({ row }) => <span className="text-sm">Sem {row.original.current_semester}</span>,
      },
      {
        accessorKey: 'tracks_completed',
        header: 'Done',
        size: 60,
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.tracks_completed}</span>,
      },
      {
        accessorKey: 'tracks_remaining',
        header: 'Remaining',
        size: 80,
        cell: ({ row }) => <span className="text-sm">{row.original.tracks_remaining}</span>,
      },
      {
        accessorKey: 'risk_level',
        header: 'Risk Level',
        size: 100,
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={`capitalize ${RISK_COLORS[row.original.risk_level] ?? ''}`}
          >
            {row.original.risk_level.replace('_', ' ')}
          </Badge>
        ),
      },
      {
        accessorKey: 'last_alert_sent_at',
        header: 'Last Alert',
        size: 120,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.last_alert_sent_at
              ? format(new Date(row.original.last_alert_sent_at), 'dd MMM yyyy')
              : 'Never'}
          </span>
        ),
      },
    ],
    []
  );

  // Wrap the query data in the DataTable fetch format
  const fetchDataFn = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<AtRiskLearner>> => {
      // Data comes from the hook; we do client-side paging for this small dataset
      const allData = learners ?? [];
      const filtered = params.search
        ? allData.filter(
            (l) =>
              l.user_name?.toLowerCase().includes(params.search.toLowerCase()) ||
              l.user_email?.toLowerCase().includes(params.search.toLowerCase())
          )
        : allData;

      const start = (params.page - 1) * params.limit;
      const paged = filtered.slice(start, start + params.limit);

      return {
        success: true,
        data: paged,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.ceil(filtered.length / params.limit),
          total_items: filtered.length,
        },
      };
    },
    [learners]
  );

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading at-risk learners...</div>;
  }

  return (
    <DataTable<AtRiskLearner, unknown>
      getColumns={getColumns}
      fetchDataFn={fetchDataFn}
      idField="user_id"
      config={{
        enableSearch: true,
        enableColumnResizing: true,
      }}
    />
  );
}
