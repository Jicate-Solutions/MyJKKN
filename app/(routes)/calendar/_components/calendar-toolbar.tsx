'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Navigate, type ToolbarProps, type View } from 'react-big-calendar';
import { Button } from '@/components/ui/button';

// Short, friendly labels — "List" reads better than react-big-calendar's "Agenda".
const VIEW_LABELS: Record<string, string> = {
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'List',
};

/**
 * Custom react-big-calendar toolbar.
 *
 * Replaces the default `.rbc-toolbar` (which crams three button groups into a
 * single flex row with sub-44px hit areas) with a responsive layout:
 *  - stacks vertically on phones, single row from `sm` up
 *  - nav buttons are ≥44px tall on mobile (Touch & Interaction rule)
 *  - the view switcher is a full-width segmented control on mobile
 *  - the active view is highlighted with the brand colour (nav-state-active)
 */
export function CalendarToolbar({ label, view, views, onNavigate, onView }: ToolbarProps) {
  // `views` may arrive as an array or an object map depending on configuration.
  const viewList: string[] = Array.isArray(views)
    ? views
    : Object.keys(views).filter((key) => (views as Record<string, boolean>)[key]);

  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {/* Navigation + current period label */}
      <div className="flex items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg border bg-card">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-none sm:h-9 sm:w-9"
            onClick={() => onNavigate(Navigate.PREVIOUS)}
            aria-label="Previous period"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-none border-l sm:h-9 sm:w-9"
            onClick={() => onNavigate(Navigate.NEXT)}
            aria-label="Next period"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 sm:h-9"
          onClick={() => onNavigate(Navigate.TODAY)}
        >
          Today
        </Button>
        <span className="ml-1 min-w-0 truncate text-base font-semibold sm:text-lg">{label}</span>
      </div>

      {/* View switcher — segmented control */}
      <div className="flex w-full items-center gap-1 rounded-lg border bg-card p-1 sm:w-auto">
        {viewList.map((v) => (
          <Button
            key={v}
            type="button"
            variant={view === v ? 'default' : 'ghost'}
            size="sm"
            className="h-9 flex-1 whitespace-nowrap px-3 sm:h-8 sm:flex-none"
            onClick={() => onView(v as View)}
            aria-pressed={view === v}
          >
            {VIEW_LABELS[v] ?? v}
          </Button>
        ))}
      </div>
    </div>
  );
}
