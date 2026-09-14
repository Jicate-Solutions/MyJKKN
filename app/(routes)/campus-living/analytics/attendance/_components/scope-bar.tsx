'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BlockSelector } from '@/components/campus-living/block-selector';

export const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
];

/** period → {from,to} as YYYY-MM-DD. */
export function periodToRange(period: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (period === '7d') from.setDate(to.getDate() - 7);
  else if (period === '90d') from.setDate(to.getDate() - 90);
  else from.setDate(to.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * Period + block scope bar.
 *
 * The block picker is new: the previous page took a period only, even though
 * the underlying query has always accepted a block. With attendance marked in
 * three blocks and absent from three others, "which block" is the first
 * question anyone asks of this page.
 */
export function AttendanceScopeBar({
  institutionId,
  period,
  onPeriodChange,
  from,
  to,
  onFromChange,
  onToChange,
  blockId,
  onBlockChange,
}: {
  institutionId: string;
  period: string;
  onPeriodChange: (v: string) => void;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  blockId: string;
  onBlockChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Period</Label>
        <Select value={period} onValueChange={onPeriodChange}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {period === 'custom' && (
        <>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => onFromChange(e.target.value)}
              className="w-full sm:w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => onToChange(e.target.value)}
              className="w-full sm:w-[160px]"
            />
          </div>
        </>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Block</Label>
        <BlockSelector institutionId={institutionId} value={blockId} onValueChange={onBlockChange} />
      </div>
    </div>
  );
}
