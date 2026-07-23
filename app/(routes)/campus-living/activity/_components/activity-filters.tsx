'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { CampusLivingEventType } from '@/types/campus-living/activity-feed';

export type EventTypeFilter = CampusLivingEventType | 'all';

export interface ActivityFiltersValue {
  event_type: EventTypeFilter;
  block_id: string;
  date_from: string;
  date_to: string;
}

export const ACTIVITY_FILTERS_DEFAULT: ActivityFiltersValue = {
  event_type: 'all',
  block_id: 'all',
  date_from: '',
  date_to: '',
};

const EVENT_TYPE_OPTIONS: Array<{ value: EventTypeFilter; label: string }> = [
  { value: 'all', label: 'All event types' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'leave', label: 'Leave' },
  { value: 'gate_pass', label: 'Gate Pass' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'incident', label: 'Incident' },
];

interface ActivityFiltersProps {
  value: ActivityFiltersValue;
  onChange: (next: ActivityFiltersValue) => void;
  blocks: Array<{ id: string; name: string }>;
}

export function ActivityFilters({
  value,
  onChange,
  blocks,
}: ActivityFiltersProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <div className="space-y-1.5">
        <Label htmlFor="filter-event-type" className="text-xs">
          Event type
        </Label>
        <Select
          value={value.event_type}
          onValueChange={(v) =>
            onChange({ ...value, event_type: v as EventTypeFilter })
          }
        >
          <SelectTrigger id="filter-event-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-block" className="text-xs">
          Block
        </Label>
        <Select
          value={value.block_id}
          onValueChange={(v) => onChange({ ...value, block_id: v })}
        >
          <SelectTrigger id="filter-block">
            <SelectValue placeholder="All Blocks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Blocks</SelectItem>
            {blocks.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-date-from" className="text-xs">
          From
        </Label>
        <Input
          id="filter-date-from"
          type="date"
          value={value.date_from}
          onChange={(e) => onChange({ ...value, date_from: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-date-to" className="text-xs">
          To
        </Label>
        <Input
          id="filter-date-to"
          type="date"
          value={value.date_to}
          onChange={(e) => onChange({ ...value, date_to: e.target.value })}
        />
      </div>
    </div>
  );
}
