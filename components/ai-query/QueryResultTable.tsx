'use client';

/**
 * QueryResultTable
 * Displays query results in a table format
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import type { QueryResultData } from '@/types/ai-query';

interface QueryResultTableProps {
  data: QueryResultData;
  onExport?: () => void;
  onRowClick?: (row: Record<string, unknown>) => void;
}

export function QueryResultTable({
  data,
  onExport,
  onRowClick,
}: QueryResultTableProps) {
  if (!data.columns || !data.rows || data.rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No data available
      </div>
    );
  }

  const formatValue = (value: unknown, type: string): string => {
    if (value === null || value === undefined) return '-';

    switch (type) {
      case 'currency':
        return `₹${Number(value).toLocaleString('en-IN')}`;
      case 'percentage':
        return `${Number(value).toFixed(1)}%`;
      case 'date':
        return new Date(value as string).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      case 'boolean':
        return value ? 'Yes' : 'No';
      default:
        return String(value);
    }
  };

  return (
    <div className="space-y-4">
      {/* Table Header with Export */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {data.metadata.returned_count} of {data.metadata.total_count} results
        </div>
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {data.columns.map((column) => (
                <TableHead key={column.key} style={{ width: column.width }}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                onClick={() => onRowClick?.(row)}
              >
                {data.columns!.map((column) => (
                  <TableCell key={column.key}>
                    {formatValue(row[column.key], column.type)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data.metadata.has_more && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page 1
          </span>
          <Button variant="outline" size="sm">
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default QueryResultTable;
