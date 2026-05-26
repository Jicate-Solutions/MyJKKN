'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export interface FilterState {
  searchText: string;
  actionType: 'all' | 'create' | 'update' | 'delete';
  school: string;
}

interface AuditLogFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  schoolOptions: Array<{ value: string; label: string }>;
}

export default function AuditLogFilters({
  filters,
  onFilterChange,
  schoolOptions,
}: AuditLogFiltersProps) {
  function handleReset() {
    onFilterChange({
      searchText: '',
      actionType: 'all',
      school: '',
    });
  }

  const activeFilters = [
    filters.searchText && 'search',
    filters.actionType !== 'all' && filters.actionType,
    filters.school && 'school',
  ].filter(Boolean);

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Search</label>
          <Input
            placeholder="Search school name or user..."
            value={filters.searchText}
            onChange={(e) =>
              onFilterChange({ ...filters, searchText: e.target.value })
            }
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Action Type</label>
          <Select value={filters.actionType} onValueChange={(v: any) =>
            onFilterChange({ ...filters, actionType: v })
          }>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">School</label>
          <Select value={filters.school} onValueChange={(v) =>
            onFilterChange({ ...filters, school: v })
          }>
            <SelectTrigger>
              <SelectValue placeholder="All schools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Schools</SelectItem>
              {schoolOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
        >
          <X className="h-4 w-4 mr-1" />
          Clear Filters
        </Button>
        <span className="text-xs text-muted-foreground">
          Filters applied: {activeFilters.length > 0 ? activeFilters.join(', ') : 'none'}
        </span>
      </div>
    </div>
  );
}
