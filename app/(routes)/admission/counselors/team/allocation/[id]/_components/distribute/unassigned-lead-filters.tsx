'use client';

import { Search, Flame } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STAGES = [
  'new',
  'contacted',
  'not_reachable',
  'interested',
  'follow_up_scheduled',
  'engaged',
  'qualified',
];

export interface UnassignedLeadFilterValue {
  stage?: string;
  hot?: boolean;
  search?: string;
}

interface UnassignedLeadFiltersProps {
  value: UnassignedLeadFilterValue;
  onChange: (next: UnassignedLeadFilterValue) => void;
}

export function UnassignedLeadFilters({ value, onChange }: UnassignedLeadFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={value.search ?? ''}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Search name / email / phone"
          className="h-8 pl-8 text-sm"
        />
      </div>

      <Select
        value={value.stage ?? '__all__'}
        onValueChange={(v) => onChange({ ...value, stage: v === '__all__' ? undefined : v })}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="Any stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Any stage</SelectItem>
          {STAGES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted/50">
        <Checkbox
          checked={value.hot ?? false}
          onCheckedChange={(c) => onChange({ ...value, hot: c === true })}
        />
        <Flame className="h-3.5 w-3.5 text-orange-500" />
        <Label className="cursor-pointer">Hot only</Label>
      </label>
    </div>
  );
}
