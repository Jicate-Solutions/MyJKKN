'use client';

import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface CollectionCategoryFilterProps {
  options: { category: string; receipts: number }[];
  /** Picked fee categories; empty means every category. '' is Uncategorised. */
  selected: string[];
  onChange: (next: string[]) => void;
}

const labelOf = (category: string) => category || 'Uncategorised';

export function CollectionCategoryFilter({
  options,
  selected,
  onChange
}: CollectionCategoryFilterProps) {
  // A pick stays listed (and so un-pickable) after a date change leaves it
  // with no receipts; otherwise it would filter everything out invisibly.
  const listed = [
    ...options,
    ...selected
      .filter((s) => !options.some((o) => o.category === s))
      .map((category) => ({ category, receipts: 0 }))
  ];

  const triggerLabel =
    selected.length === 0
      ? 'All Categories'
      : selected.length === 1
        ? labelOf(selected[0])
        : `${selected.length} categories`;

  const toggle = (category: string, on: boolean) =>
    onChange(on ? [...selected, category] : selected.filter((c) => c !== category));

  return (
    <div className='space-y-1.5 sm:w-56'>
      <Label className='text-xs'>Fee Category</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant='outline' className='w-full justify-between font-normal'>
            <span className='truncate'>{triggerLabel}</span>
            <ChevronDown className='h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-72 p-0' align='start'>
          <div className='flex items-center justify-between border-b px-3 py-2'>
            <span className='text-xs text-muted-foreground'>
              {selected.length === 0 ? 'Showing all categories' : `${selected.length} selected`}
            </span>
            <Button
              variant='ghost'
              size='sm'
              className='h-auto px-2 py-1 text-xs'
              disabled={selected.length === 0}
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          </div>
          <div className='max-h-64 space-y-1 overflow-y-auto p-2'>
            {listed.length === 0 && (
              <p className='px-1 py-2 text-sm text-muted-foreground'>No categories in this range.</p>
            )}
            {listed.map((o) => (
              <label
                key={o.category || 'uncategorised'}
                className='flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted'
              >
                <Checkbox
                  checked={selected.includes(o.category)}
                  onCheckedChange={(c) => toggle(o.category, c === true)}
                />
                <span className='flex-1'>{labelOf(o.category)}</span>
                <span className='text-xs text-muted-foreground'>{o.receipts}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
