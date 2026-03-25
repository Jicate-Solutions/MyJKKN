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

interface GradeSyncFiltersProps {
  tools: Tool[];
  currentFilters: {
    startDate?: string;
    endDate?: string;
    toolId?: string;
    syncStatus?: 'all' | 'synced' | 'pending' | 'failed';
  };
}

export function GradeSyncFilters({
  tools,
  currentFilters
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
    // TODO: Implement Excel export
    alert('Export functionality coming soon');
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
          Export to Excel
        </Button>
      </div>
    </div>
  );
}
