'use client';

import { useMemo, useState, useCallback } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useCalendarItems } from '@/hooks/calendar/use-calendar';
import type { CalendarItem } from '@/types/calendar';

const localizer = momentLocalizer(moment);

const FEEDS = [
  { key: 'global_entries', label: 'Global' },
  { key: 'academic_holidays', label: 'Academic Holidays' },
  { key: 'hr_public_holidays', label: 'HR Holidays' },
];

interface RBCEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  resource: CalendarItem;
}

export function CalendarView() {
  const { isSuperAdmin } = usePermissions();
  const { institutions } = useInstitutionsWithAccess({ isActive: true, entityType: 'all' });

  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(null); // null = All
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [activeFeeds, setActiveFeeds] = useState<string[]>(FEEDS.map((f) => f.key));

  // visible window (pad a month each side so multi-day items at edges render)
  const { start, end } = useMemo(() => {
    const s = moment(currentDate).startOf('month').subtract(7, 'days').format('YYYY-MM-DD');
    const e = moment(currentDate).endOf('month').add(7, 'days').format('YYYY-MM-DD');
    return { start: s, end: e };
  }, [currentDate]);

  const { data: items = [], isLoading } = useCalendarItems({
    institutionIds: selectedInstitution ? [selectedInstitution] : null,
    start,
    end,
    feeds: activeFeeds.length ? activeFeeds : null,
  });

  const events: RBCEvent[] = useMemo(
    () =>
      items
        .filter((it) => activeFeeds.length === 0 || activeFeeds.includes(feedKeyFor(it)))
        .map((it) => ({
          id: it.item_id,
          title: it.institution_name ? `${it.title} · ${it.institution_name}` : it.title,
          start: new Date(it.start_at),
          end: new Date(it.end_at),
          allDay: it.all_day,
          color: it.color_code || '#6b7280',
          resource: it,
        })),
    [items, activeFeeds]
  );

  const legend = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((it) => {
      if (it.category) m.set(it.category, it.color_code || '#6b7280');
    });
    return Array.from(m.entries());
  }, [items]);

  const eventStyleGetter = useCallback(
    (event: RBCEvent) => ({
      style: { backgroundColor: event.color, color: '#fff', border: 'none', borderRadius: '6px' },
    }),
    []
  );

  const toggleFeed = (key: string) =>
    setActiveFeeds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const showPicker = isSuperAdmin && institutions.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Calendar</h1>
        {showPicker && (
          <div className="max-w-xs">
            <Select
              value={selectedInstitution ?? 'all'}
              onValueChange={(v) => setSelectedInstitution(v === 'all' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Filter by institution..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Institutions</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FEEDS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={activeFeeds.includes(f.key) ? 'default' : 'outline'}
            onClick={() => toggleFeed(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
        <div className="rounded-lg border p-2" style={{ height: 680 }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            view={currentView}
            date={currentDate}
            onNavigate={(d) => setCurrentDate(d)}
            onView={(v) => setCurrentView(v)}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            eventPropGetter={eventStyleGetter}
            popup
            style={{ height: '100%' }}
          />
        </div>
        <aside className="space-y-3">
          <div className="rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-semibold">Legend</h2>
            {legend.length === 0 && <p className="text-xs text-muted-foreground">No items in view.</p>}
            <ul className="space-y-1">
              {legend.map(([name, color]) => (
                <li key={name} className="flex items-center gap-2 text-xs">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                  {name}
                </li>
              ))}
            </ul>
          </div>
          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        </aside>
      </div>
    </div>
  );
}

function feedKeyFor(it: CalendarItem): string {
  if (it.source_module === 'global') return 'global_entries';
  if (it.source_module === 'academic') return 'academic_holidays';
  if (it.source_module === 'hr') return 'hr_public_holidays';
  return it.source_module;
}
