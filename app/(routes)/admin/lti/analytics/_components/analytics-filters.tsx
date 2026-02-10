/**
 * Analytics Filters Component
 * Filter analytics by date range, institution, and tool
 *
 * Created: 2026-01-12
 */

'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Download } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface FilterOption {
  id: string;
  name: string;
}

interface AnalyticsExportRow {
  id: string;
  user_id: string;
  tool_id: string;
  myjkkn_role: string;
  launched_at: string;
  institution_id: string;
}

interface AnalyticsFiltersProps {
  institutions: FilterOption[];
  tools: FilterOption[];
  currentFilters: {
    startDate?: string;
    endDate?: string;
    institutionId?: string;
    toolId?: string;
  };
  exportData?: AnalyticsExportRow[];
}

export function AnalyticsFilters({
  institutions,
  tools,
  currentFilters,
  exportData
}: AnalyticsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value === 'all' || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push(pathname);
  };

  const handleExport = () => {
    if (!exportData || exportData.length === 0) {
      alert('No data available to export');
      return;
    }

    const rows = exportData.map((row) => ({
      'Launch ID': row.id,
      'User ID': row.user_id,
      'Tool ID': row.tool_id,
      'Role': row.myjkkn_role,
      'Launched At': row.launched_at,
      'Institution ID': row.institution_id
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
    a.download = `lti-analytics-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = Object.values(currentFilters).some((v) => v);

  // Default date range (last 30 days)
  const defaultEndDate = format(new Date(), 'yyyy-MM-dd');
  const defaultStartDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Start Date */}
        <div>
          <label className="text-sm font-medium mb-2 block">Start Date</label>
          <Input
            type="date"
            value={currentFilters.startDate || defaultStartDate}
            onChange={(e) => updateFilter('startDate', e.target.value)}
          />
        </div>

        {/* End Date */}
        <div>
          <label className="text-sm font-medium mb-2 block">End Date</label>
          <Input
            type="date"
            value={currentFilters.endDate || defaultEndDate}
            onChange={(e) => updateFilter('endDate', e.target.value)}
          />
        </div>

        {/* Institution Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Institution</label>
          <Select
            value={currentFilters.institutionId || 'all'}
            onValueChange={(value) => updateFilter('institutionId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Institutions</SelectItem>
              {institutions.map((institution) => (
                <SelectItem key={institution.id} value={institution.id}>
                  {institution.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tool Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Tool</label>
          <Select
            value={currentFilters.toolId || 'all'}
            onValueChange={(value) => updateFilter('toolId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Tools" />
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
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-2" />
            Clear Filters
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}
