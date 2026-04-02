'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { RotateCcw, Search } from 'lucide-react';
import type { VACCourseFilters } from '@/types/vac';

interface CourseFiltersProps {
  filters: VACCourseFilters;
  onFilterChange: (filters: VACCourseFilters) => void;
}

const TRACKS = [
  { value: 'AI-1', label: 'AI-1' },
  { value: 'AI-2', label: 'AI-2' },
  { value: 'AI-3', label: 'AI-3' },
  { value: 'AI-4', label: 'AI-4' },
  { value: 'H-1', label: 'H-1' },
  { value: 'H-2', label: 'H-2' },
  { value: 'general', label: 'General' },
];

const NSQF_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'fee', label: 'Fee' },
  { value: 'duration_hours', label: 'Duration' },
  { value: 'created_at', label: 'Newest' },
];

const DEFAULT_FILTERS: VACCourseFilters = {
  search: '',
  track: undefined,
  course_category: undefined,
  fee_min: 0,
  fee_max: 5000,
  nsqf_level: undefined,
  sortBy: 'name',
  sortOrder: 'asc',
};

export function CourseFilters({ filters, onFilterChange }: CourseFiltersProps) {
  const update = (partial: Partial<VACCourseFilters>) => {
    onFilterChange({ ...filters, ...partial, page: 1 });
  };

  const handleReset = () => {
    onFilterChange({ ...DEFAULT_FILTERS, institution_id: filters.institution_id });
  };

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Search</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={filters.search || ''}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-8"
          />
        </div>
      </div>

      {/* Track */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Track</Label>
        <Select
          value={filters.track || 'all'}
          onValueChange={(v) => update({ track: v === 'all' ? undefined : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Tracks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tracks</SelectItem>
            {TRACKS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Category</Label>
        <RadioGroup
          value={filters.course_category || 'all'}
          onValueChange={(v) =>
            update({ course_category: v === 'all' ? undefined : (v as 'add_on' | 'value_add') })
          }
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="cat-all" />
            <Label htmlFor="cat-all" className="text-sm font-normal cursor-pointer">All</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="add_on" id="cat-add-on" />
            <Label htmlFor="cat-add-on" className="text-sm font-normal cursor-pointer">Add-on</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="value_add" id="cat-value-add" />
            <Label htmlFor="cat-value-add" className="text-sm font-normal cursor-pointer">Value Added</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Fee Range */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Fee Range: ₹{filters.fee_min ?? 0} — ₹{filters.fee_max ?? 5000}
        </Label>
        <Slider
          min={0}
          max={5000}
          step={100}
          value={[filters.fee_min ?? 0, filters.fee_max ?? 5000]}
          onValueChange={([min, max]) => update({ fee_min: min, fee_max: max })}
          className="py-2"
        />
      </div>

      {/* NSQF Level */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">NSQF Level</Label>
        <Select
          value={filters.nsqf_level?.toString() || 'all'}
          onValueChange={(v) => update({ nsqf_level: v === 'all' ? undefined : Number(v) })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Level</SelectItem>
            {NSQF_LEVELS.map((l) => (
              <SelectItem key={l} value={l.toString()}>
                Level {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sort By */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Sort By</Label>
        <Select
          value={filters.sortBy || 'name'}
          onValueChange={(v) => update({ sortBy: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reset */}
      <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
        <RotateCcw className="mr-2 h-3.5 w-3.5" />
        Reset Filters
      </Button>
    </div>
  );
}
