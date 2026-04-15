'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { cn } from '@/lib/utils';

export interface BlockSelectorProps {
  institutionId: string;
  value: string;
  onValueChange: (value: string) => void;
  includeAll?: boolean;
  className?: string;
}

/**
 * Block selector dropdown — lists hostel blocks for the given institution.
 *
 * - Defaults to including a pseudo-option "all" labeled "All Blocks".
 * - While blocks are loading, renders a disabled trigger with a
 *   placeholder so the layout doesn't shift.
 * - Options are rendered as `{block.name} · {capitalize(block.hostel_type)}`.
 */
export function BlockSelector({
  institutionId,
  value,
  onValueChange,
  includeAll = true,
  className,
}: BlockSelectorProps) {
  const { data, isLoading } = useHostelBlocks(institutionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: Array<any> = data?.data ?? [];

  const capitalize = (s: string | null | undefined) => {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const triggerClass = cn('w-full sm:w-[200px]', className);

  if (isLoading) {
    return (
      <Select value={value} onValueChange={onValueChange} disabled>
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder="Loading blocks…" />
        </SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value="all">All Blocks</SelectItem>}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={triggerClass}>
        <SelectValue placeholder="Block" />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">All Blocks</SelectItem>}
        {blocks.map((block) => {
          const hostelType = capitalize(block.hostel_type);
          return (
            <SelectItem key={block.id} value={block.id}>
              {block.name}
              {hostelType ? ` · ${hostelType}` : ''}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
