'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RotateCcw, Search } from 'lucide-react';
import type { VACCourseFilters } from '@/types/vac';

const TRACKS = [
  { value: 'AI-1', label: 'AI-1' },
  { value: 'AI-2', label: 'AI-2' },
  { value: 'AI-3', label: 'AI-3' },
  { value: 'AI-4', label: 'AI-4' },
  { value: 'H-1', label: 'H-1' },
  { value: 'H-2', label: 'H-2' },
  { value: 'general', label: 'General' },
];

const CATEGORIES = [
  { value: 'add_on', label: 'Add-On' },
  { value: 'value_add', label: 'Value-Add' },
];

interface VACCourseFiltersProps {
  filters: VACCourseFilters;
  onFilterChange: (filters: Partial<VACCourseFilters>) => void;
}

export function VACCourseFiltersBar({ filters, onFilterChange }: VACCourseFiltersProps) {
  const handleReset = () => {
    onFilterChange({
      track: undefined,
      course_category: undefined,
      is_active: undefined,
      search: undefined,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search courses..."
          value={filters.search ?? ''}
          onChange={(e) => onFilterChange({ search: e.target.value || undefined })}
          className="pl-9"
        />
      </div>

      <Select
        value={filters.track ?? '__all__'}
        onValueChange={(v) => onFilterChange({ track: v === '__all__' ? undefined : v })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Track" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Tracks</SelectItem>
          {TRACKS.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.course_category ?? '__all__'}
        onValueChange={(v) =>
          onFilterChange({
            course_category: v === '__all__' ? undefined : (v as 'add_on' | 'value_add'),
          })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Categories</SelectItem>
          {CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.is_active === undefined ? '__all__' : filters.is_active ? 'active' : 'inactive'}
        onValueChange={(v) =>
          onFilterChange({
            is_active: v === '__all__' ? undefined : v === 'active',
          })
        }
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="ghost" size="sm" onClick={handleReset}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        Reset
      </Button>
    </div>
  );
}
