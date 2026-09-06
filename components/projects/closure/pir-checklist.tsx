'use client';

/**
 * PirChecklist — visual checklist UI for PIR review items.
 *
 * Renders a list of ChecklistItems with checkboxes.  Calls onChange with the
 * updated array so the parent form can persist to checklist JSONB.
 * Read-only when isFinalized is true.
 */

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ChecklistItem } from './types';

interface PirChecklistProps {
  items: ChecklistItem[];
  isFinalized?: boolean;
  onChange: (items: ChecklistItem[]) => void;
}

export function PirChecklist({ items, isFinalized = false, onChange }: PirChecklistProps) {
  function toggle(id: string) {
    if (isFinalized) return;
    onChange(items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
  }

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {checkedCount} / {items.length} items complete
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <Checkbox
              id={`pir-${item.id}`}
              checked={item.checked}
              onCheckedChange={() => toggle(item.id)}
              disabled={isFinalized}
              aria-label={item.label}
            />
            <Label
              htmlFor={`pir-${item.id}`}
              className={cn(
                'cursor-pointer text-sm leading-snug',
                item.checked && 'line-through text-muted-foreground',
                isFinalized && 'cursor-default'
              )}
            >
              {item.label}
            </Label>
          </li>
        ))}
      </ul>
    </div>
  );
}
