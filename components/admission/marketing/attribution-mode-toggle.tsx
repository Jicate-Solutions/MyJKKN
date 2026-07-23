'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AttributionMode } from '@/types/admission/campaign';

const MODES: { value: AttributionMode; label: string; help: string }[] = [
  {
    value: 'first',
    label: 'First-touch',
    help: 'Credit the campaign that first captured the lead.',
  },
  {
    value: 'last',
    label: 'Last-touch',
    help: 'Credit the most recent campaign before conversion.',
  },
  {
    value: 'any',
    label: 'Any-touch',
    help: 'Every campaign that ever touched the lead counts.',
  },
];

interface Props {
  value: AttributionMode;
  onChange: (mode: AttributionMode) => void;
}

export function AttributionModeToggle({ value, onChange }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(v as AttributionMode)}
        aria-label="Attribution mode"
      >
        {MODES.map(({ value: v, label, help }) => (
          <Tooltip key={v}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={v} aria-label={label}>
                {label}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{help}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  );
}
