/**
 * Grade Sync Filters Component
 * Filter grade sync records by date, tool, and sync status
 *
 * Created: 2026-01-12
 */

'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Download, X } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface Tool {
  id: string;
  name: string;
}

interface GradeSyncExportRow {
  id: string;
  resource_link_title: string;
  score: number;
  score_maximum: number;
  score_percentage: number;
  graded_at: string;
  received_at: string;
  synced_to_gradebook: boolean;
  sync_error: string | null;
  synced_at: string | null;
  lti_tools: { id: string; name: string; tool_type: string };
  learners_profiles: { first_name: string; last_name: string; roll_number: string };
}

interface GradeSyncFiltersProps {
  tools: Tool[];
  currentFilters: {
    startDate?: string;
    endDate?: string;
    toolId?: string;
    syncStatus?: 'all' | 'synced' | 'pending' | 'failed';
  };
  exportData?: GradeSyncExportRow[];
}

export function GradeSyncFilters({
  tools,
  currentFilters,
  exportData
}: GradeSyncFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Default dates
  const defaultEndDate = format(new Date(), 'yyyy-MM-dd');
  const defaultStartDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');

  const startDate = currentFilters.startDate || defaultStartDate;
  const endDate = currentFilters.endDate || defaultEndDate;
  const toolId = currentFilters.toolId || 'all';
  const syncStatus = currentFilters.syncStatus || 'all';

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value === 'all' || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDateChange = (key: 'startDate' | 'endDate', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push(pathname);
  };

  const hasActiveFilters =
    currentFilters.startDate ||
    currentFilters.endDate ||
    (currentFilters.toolId && currentFilters.toolId !== 'all') ||
    (currentFilters.syncStatus && currentFilters.syncStatus !== 'all');

  const handleExport = () => {
    if (!exportData || exportData.length === 0) {
      alert('No data available to export');
      return;
    }

    const rows = exportData.map((row) => ({
      'Student Name': `${row.learners_profiles.first_name} ${row.learners_profiles.last_name}`,
      'Roll Number': row.learners_profiles.roll_number,
      'Tool': row.lti_tools.name,
      'Resource': row.resource_link_title,
      'Score': row.score,
      'Max Score': row.score_maximum,
      'Percentage': row.score_percentage,
      'Graded At': row.graded_at,
      'Received At': row.received_at,
      'Synced': row.synced_to_gradebook ? 'Yes' : 'No',
      'Synced At': row.synced_at ?? '',
      'Error': row.sync_error ?? ''
    }));

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = String(row[h as keyof typeof row] ?? '');
            return val.includes(',') || val.includes('"')
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          })
          .join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grade-sync-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Date Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => handleDateChange('startDate', e.target.value)}
            max={endDate}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
            min={startDate}
            max={format(new Date(), 'yyyy-MM-dd')}
          />
        </div>
      </div>

      {/* Tool and Status Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tool">Tool</Label>
          <Select value={toolId} onValueChange={(value) => updateFilter('toolId', value)}>
            <SelectTrigger id="tool">
              <SelectValue placeholder="Select tool" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tools</SelectItem>
              {tools.map((tool) => (
                <SelectItem key={tool.id} value={tool.id}>
                  {tool.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="syncStatus">Sync Status</Label>
          <Select
            value={syncStatus}
            onValueChange={(value) => updateFilter('syncStatus', value)}
          >
            <SelectTrigger id="syncStatus">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="synced">Synced</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}
