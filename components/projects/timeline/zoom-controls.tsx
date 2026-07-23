'use client';

/**
 * Zoom controls (Decision F2.1) — switch the Gantt between day / week / month.
 *
 * Pattern: shadcn ToggleGroup (single-select). Controlled by the parent so the
 * zoom can be lifted into URL state later without touching this component.
 */

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { TimelineZoom } from './timeline-scale';

const ZOOM_OPTIONS: { value: TimelineZoom; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

interface ZoomControlsProps {
  value: TimelineZoom;
  onChange: (zoom: TimelineZoom) => void;
}

export function ZoomControls({ value, onChange }: ZoomControlsProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        // ToggleGroup emits '' when the active item is re-clicked; ignore that
        // so a zoom level can never be cleared.
        if (v) onChange(v as TimelineZoom);
      }}
      aria-label="Timeline zoom level"
      variant="outline"
      size="sm"
    >
      {ZOOM_OPTIONS.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} aria-label={opt.label}>
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
