'use client';

import { format } from 'date-fns';
import { CalendarIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FacilitatorReportFilters } from '@/types/attendance';

interface Department { id: string; name: string; }

interface Props {
  filters: FacilitatorReportFilters;
  departments: Department[];
  onFiltersChange: (filters: FacilitatorReportFilters) => void;
  onFacilitatorSearch: (query: string) => void;
  facilitatorSearchQuery: string;
}

export function FacilitatorFilters({
  filters,
  departments,
  onFiltersChange,
  onFacilitatorSearch,
  facilitatorSearchQuery,
}: Props) {
  const setFilter = <K extends keyof FacilitatorReportFilters>(
    key: K,
    value: FacilitatorReportFilters[K]
  ) => onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">

      {/* Date range — two date pickers side by side */}
      <div className="space-y-1 min-w-0 sm:min-w-[220px]">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Date Range
        </Label>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn('flex-1 justify-start text-left font-normal', !filters.dateFrom && 'text-muted-foreground')}
              >
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {filters.dateFrom ? format(new Date(filters.dateFrom), 'MMM d, yyyy') : 'Start'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                onSelect={(d) => d && setFilter('dateFrom', format(d, 'yyyy-MM-dd'))}
                disabled={(d) => d > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn('flex-1 justify-start text-left font-normal', !filters.dateTo && 'text-muted-foreground')}
              >
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {filters.dateTo ? format(new Date(filters.dateTo), 'MMM d, yyyy') : 'End'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                onSelect={(d) => d && setFilter('dateTo', format(d, 'yyyy-MM-dd'))}
                disabled={(d) => d > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Department */}
      <div className="space-y-1 min-w-0 sm:min-w-[180px] sm:max-w-[240px] flex-1">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Department
        </Label>
        <Select
          value={filters.departmentId ?? 'all'}
          onValueChange={(v) => setFilter('departmentId', v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-full h-9">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search */}
      <div className="space-y-1 min-w-0 sm:min-w-[180px] flex-1">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Search Facilitator
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Name or designation..."
            value={facilitatorSearchQuery}
            onChange={(e) => onFacilitatorSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

    </div>
  );
}
