/**
 * Launch Debug Filters Component
 * Filter LTI launches by date, tool, institution, and launch type
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
import { X } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface Tool {
  id: string;
  name: string;
}

interface Institution {
  id: string;
  name: string;
}

interface LaunchDebugFiltersProps {
  tools: Tool[];
  institutions: Institution[];
  currentFilters: {
    startDate?: string;
    endDate?: string;
    toolId?: string;
    institutionId?: string;
    userId?: string;
    launchType?: string;
  };
}

export function LaunchDebugFilters({
  tools,
  institutions,
  currentFilters
}: LaunchDebugFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Default dates
  const defaultEndDate = format(new Date(), 'yyyy-MM-dd');
  const defaultStartDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');

  const startDate = currentFilters.startDate || defaultStartDate;
  const endDate = currentFilters.endDate || defaultEndDate;
  const toolId = currentFilters.toolId || 'all';
  const institutionId = currentFilters.institutionId || 'all';
  const launchType = currentFilters.launchType || 'all';
  const userId = currentFilters.userId || '';

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
    (currentFilters.institutionId && currentFilters.institutionId !== 'all') ||
    (currentFilters.launchType && currentFilters.launchType !== 'all') ||
    currentFilters.userId;

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

      {/* Tool, Institution, Launch Type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tool">Tool</Label>
          <Select
            value={toolId}
            onValueChange={(value) => updateFilter('toolId', value)}
          >
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
          <Label htmlFor="institution">Institution</Label>
          <Select
            value={institutionId}
            onValueChange={(value) => updateFilter('institutionId', value)}
          >
            <SelectTrigger id="institution">
              <SelectValue placeholder="Select institution" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="launchType">Launch Type</Label>
          <Select
            value={launchType}
            onValueChange={(value) => updateFilter('launchType', value)}
          >
            <SelectTrigger id="launchType">
              <SelectValue placeholder="Select launch type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="assignment">Assignment</SelectItem>
              <SelectItem value="resource">Resource</SelectItem>
              <SelectItem value="deep_link">Deep Link</SelectItem>
              <SelectItem value="content_selection">Content Selection</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* User ID Search (for advanced debugging) */}
      <div className="space-y-2">
        <Label htmlFor="userId">User ID (for debugging)</Label>
        <Input
          id="userId"
          type="text"
          placeholder="Enter user UUID..."
          value={userId}
          onChange={(e) => updateFilter('userId', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Enter a specific user UUID to view their launches
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-2" />
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}
