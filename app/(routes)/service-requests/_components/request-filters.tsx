'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type {
  ServiceRequestStatus,
  ServiceRequestPriority,
  ServiceType,
} from '@/types/service-request';

interface RequestFiltersProps {
  filters: {
    service_type_id?: string;
    status?: string;
    priority?: string;
    submitted_from?: string;
    submitted_to?: string;
  };
  onFilterChange: (key: string, value: string | undefined) => void;
  onClear: () => void;
  serviceTypes?: ServiceType[];
}

const STATUS_OPTIONS: { value: ServiceRequestStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'returned', label: 'Returned' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS: { value: ServiceRequestPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function RequestFilters({
  filters,
  onFilterChange,
  onClear,
  serviceTypes,
}: RequestFiltersProps) {
  const hasFilters = Object.values(filters).some((v) => v !== undefined && v !== '');

  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
      {/* Service Type */}
      {serviceTypes && serviceTypes.length > 0 && (
        <div className="space-y-1 w-full sm:w-auto">
          <Label className="text-xs">Service Type</Label>
          <Select
            value={filters.service_type_id || 'all'}
            onValueChange={(v) => onFilterChange('service_type_id', v === 'all' ? undefined : v)}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {serviceTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Status */}
      <div className="space-y-1 w-full sm:w-auto">
        <Label className="text-xs">Status</Label>
        <Select
          value={filters.status || 'all'}
          onValueChange={(v) => onFilterChange('status', v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priority */}
      <div className="space-y-1 w-full sm:w-auto">
        <Label className="text-xs">Priority</Label>
        <Select
          value={filters.priority || 'all'}
          onValueChange={(v) => onFilterChange('priority', v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date From */}
      <div className="space-y-1 w-full sm:w-auto">
        <Label className="text-xs">From</Label>
        <Input
          type="date"
          value={filters.submitted_from || ''}
          onChange={(e) => onFilterChange('submitted_from', e.target.value || undefined)}
          className="w-full sm:w-[160px]"
        />
      </div>

      {/* Date To */}
      <div className="space-y-1 w-full sm:w-auto">
        <Label className="text-xs">To</Label>
        <Input
          type="date"
          value={filters.submitted_to || ''}
          onChange={(e) => onFilterChange('submitted_to', e.target.value || undefined)}
          className="w-full sm:w-[160px]"
        />
      </div>

      {/* Clear */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} className="gap-1">
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
