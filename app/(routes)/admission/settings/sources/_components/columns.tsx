'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Globe } from 'lucide-react';
import type { SourceSummary } from '@/lib/services/admission/source-tracking-service';

export const columns: ColumnDef<SourceSummary>[] = [
  {
    accessorKey: 'source',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Source" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="font-medium">{row.getValue('source')}</span>
      </div>
    ),
  },
  {
    accessorKey: 'leads',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Leads" />
    ),
    cell: ({ row }) => {
      const leads = row.getValue<number>('leads');
      return <span className="font-medium">{leads.toLocaleString()}</span>;
    },
  },
  {
    accessorKey: 'conversions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Conversions" />
    ),
    cell: ({ row }) => {
      const conversions = row.getValue<number>('conversions');
      return <span>{conversions.toLocaleString()}</span>;
    },
  },
  {
    accessorKey: 'conversionRate',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Conv. Rate" />
    ),
    cell: ({ row }) => {
      const rate = row.getValue<number>('conversionRate');
      const colorClass =
        rate >= 15
          ? 'text-green-600 font-medium'
          : rate >= 10
          ? 'text-yellow-600'
          : 'text-red-600';
      return <span className={colorClass}>{rate.toFixed(1)}%</span>;
    },
  },
];
