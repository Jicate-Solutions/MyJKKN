'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import { Loader2 } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useCalendarItems } from '@/hooks/calendar/use-calendar';
import {
  useCoeCalendarItems,
  useExamScheduleItems,
} from '@/hooks/calendar/use-coe-calendar-feeds';
import {
  COE_CALENDAR_FEED,
  EXAM_SCHEDULE_FEED,
  type CalendarItem,
} from '@/types/calendar';
import { CalendarToolbar } from './calendar-toolbar';
import { EventDetailDialog } from './event-detail-dialog';

const localizer = momentLocalizer(moment);

// Week/Day grids default to scrolling at the top (12 AM). Open them at 8 AM so
// daytime events are visible without scrolling. Static — evaluated once.
const SCROLL_TO_TIME = new Date(1970, 0, 1, 8, 0, 0);

const BASE_FEEDS = [
  { key: 'global_entries', label: 'Global' },
  { key: 'academic_holidays', label: 'Academic Holidays' },
  { key: 'hr_public_holidays', label: 'HR Holidays' },
  { key: 'events', label: 'Events' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'reservations', label: 'Reservations' },
];

const LEAVE_FEEDS = [
  { key: 'staff_leave', label: 'Staff Leave' },
  { key: 'student_leave', label: 'Student Leave' },
];

// The two COE-backed chips. They behave exactly like the feeds above — on by
// default, click to toggle, colour-coded in the legend — but their rows arrive
// over HTTP from the COE app instead of the fn_calendar_items RPC, so they are
// fetched separately and concatenated. See hooks/calendar/use-coe-calendar-feeds.
const COE_CALENDAR_CHIP = { key: COE_CALENDAR_FEED, label: 'COE Calendar' };
const EXAM_SCHEDULE_CHIP = { key: EXAM_SCHEDULE_FEED, label: 'Exam Schedule' };

/** Keys the RPC knows nothing about — stripped before it is called. */
const COE_FEED_KEYS: readonly string[] = [COE_CALENDAR_FEED, EXAM_SCHEDULE_FEED];

interface RBCEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  cancelled: boolean;
  resource: CalendarItem;
}

export function CalendarView() {
  const { isSuperAdmin, canAccess } = usePermissions();
  const canViewPeopleLeave = isSuperAdmin || canAccess('calendar.people_leave', 'view');
  // COE Calendar is staff-only (granted to every role except learners); the Exam
  // Schedule chip is open to anyone who can open this page. The API routes
  // enforce the same split — this only decides whether the chip is drawn.
  const canViewCoeCalendar = isSuperAdmin || canAccess('calendar.coe_calendar', 'view');

  const feeds = useMemo(
    () => [
      ...BASE_FEEDS,
      ...(canViewPeopleLeave ? LEAVE_FEEDS : []),
      ...(canViewCoeCalendar ? [COE_CALENDAR_CHIP] : []),
      EXAM_SCHEDULE_CHIP,
    ],
    [canViewPeopleLeave, canViewCoeCalendar]
  );

  const { institutions } = useInstitutionsWithAccess({ isActive: true, entityType: 'all' });

  // Phone-sized screens: the 7-column month grid is unreadable, so we default to
  // the Agenda (list) view and drop Week from the switcher.
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(null); // null = All
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);

  const availableViews = useMemo<View[]>(
    () =>
      isMobile
        ? [Views.AGENDA, Views.DAY, Views.MONTH]
        : [Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA],
    [isMobile]
  );

  // On crossing the breakpoint, pick a layout that suits the new size:
  // shrink the cramped month/week grid down to the list view on mobile, and
  // restore month when there's room again. Day stays Day either way.
  useEffect(() => {
    setCurrentView((prev) => {
      if (isMobile) return prev === Views.MONTH || prev === Views.WEEK ? Views.AGENDA : prev;
      return prev === Views.AGENDA ? Views.MONTH : prev;
    });
  }, [isMobile]);

  // Guard the transient render before the effect above syncs state, so the
  // Calendar never receives a `view` that isn't in `availableViews`.
  const view = availableViews.includes(currentView) ? currentView : availableViews[0];

  // Week/Day are narrow-column time grids — give them the full content width by
  // dropping the legend aside (Month keeps it; it has far more to colour-code).
  const isTimeGrid = view === Views.WEEK || view === Views.DAY;

  // Both COE keys start active regardless of permission: the chip and the fetch
  // are gated separately, so an inert key for a user who can't see COE Calendar
  // costs nothing — and it means the chip is already ON the moment the async
  // permission check resolves, instead of rendering unselected.
  const [activeFeeds, setActiveFeeds] = useState<string[]>(() => [
    ...(canViewPeopleLeave
      ? [...BASE_FEEDS, ...LEAVE_FEEDS]
      : BASE_FEEDS
    ).map((f) => f.key),
    ...COE_FEED_KEYS,
  ]);

  // visible window (pad a month each side so multi-day items at edges render)
  const { start, end } = useMemo(() => {
    const s = moment(currentDate).startOf('month').subtract(7, 'days').format('YYYY-MM-DD');
    const e = moment(currentDate).endOf('month').add(7, 'days').format('YYYY-MM-DD');
    return { start: s, end: e };
  }, [currentDate]);

  // The RPC has no branch for the COE keys, so they are stripped before the call
  // rather than passed through as no-op values.
  const rpcFeeds = useMemo(
    () => activeFeeds.filter((k) => !COE_FEED_KEYS.includes(k)),
    [activeFeeds]
  );

  // `feeds: null` means "no filter" to the RPC, which is the right reading when
  // literally every chip is off (the pre-existing "nothing selected = show all"
  // behaviour) but the wrong one when only the COE chips are on — there it would
  // return every local row and leak them into the legend, which is built from
  // the unfiltered item list. Skipping the query is the honest answer.
  const rpcEnabled = rpcFeeds.length > 0 || activeFeeds.length === 0;

  const { data: rpcItems = [], isLoading: isLoadingRpc } = useCalendarItems(
    {
      institutionIds: selectedInstitution ? [selectedInstitution] : null,
      start,
      end,
      feeds: rpcFeeds.length ? rpcFeeds : null,
    },
    rpcEnabled
  );

  const coeQuery = useMemo(
    () => ({
      institutionIds: selectedInstitution ? [selectedInstitution] : null,
      start,
      end,
    }),
    [selectedInstitution, start, end]
  );

  // Toggling a chip off disables its query outright — no request is made at all,
  // which matters more here than for the RPC feeds because each of these is a
  // round-trip to a second application.
  const { data: coeCalendarItems = [], isLoading: isLoadingCoe } = useCoeCalendarItems(
    coeQuery,
    canViewCoeCalendar && activeFeeds.includes(COE_CALENDAR_FEED)
  );

  const { data: examScheduleItems = [], isLoading: isLoadingExams } = useExamScheduleItems(
    coeQuery,
    activeFeeds.includes(EXAM_SCHEDULE_FEED)
  );

  // One homogeneous list from here down — the grid, legend and detail dialog
  // cannot tell which source a row came from.
  const items = useMemo(
    () => [...rpcItems, ...coeCalendarItems, ...examScheduleItems],
    [rpcItems, coeCalendarItems, examScheduleItems]
  );

  const isLoading = isLoadingRpc || isLoadingCoe || isLoadingExams;

  const events: RBCEvent[] = useMemo(
    () =>
      items
        .filter((it) => activeFeeds.length === 0 || activeFeeds.includes(feedKeyFor(it)))
        .map((it) => {
          const base =
            it.kind === 'leave'
              ? `${it.person_name ?? 'Someone'} · On Leave`
              : it.institution_name
              ? `${it.title} · ${it.institution_name}`
              : it.title;
          // Cancelled meetings stay on the grid instead of vanishing, so the
          // word rides in the title as well as the styling: strike-through is
          // invisible to a screen reader, and the Agenda list renders plain
          // rows where a colour shift alone reads as noise.
          const cancelled = isCancelled(it);
          return {
            id: it.item_id,
            title: cancelled ? `Cancelled · ${base}` : base,
            start: it.all_day ? allDayLocalDate(it.start_at, 'start') : new Date(it.start_at),
            end: it.all_day ? allDayLocalDate(it.end_at, 'end') : new Date(it.end_at),
            allDay: it.all_day,
            color: it.color_code || '#6b7280',
            cancelled,
            resource: it,
          };
        }),
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
      style: event.cancelled
        ? {
            backgroundColor: '#9ca3af',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            textDecoration: 'line-through',
            opacity: 0.75,
          }
        : { backgroundColor: event.color, color: '#fff', border: 'none', borderRadius: '6px' },
    }),
    []
  );

  const handleSelectEvent = useCallback((event: RBCEvent) => setSelectedItem(event.resource), []);

  const toggleFeed = (key: string) =>
    setActiveFeeds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const showPicker = isSuperAdmin && institutions.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">Calendar</h1>
        {showPicker && (
          <div className="w-full sm:w-64">
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
        {feeds.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={activeFeeds.includes(f.key) ? 'default' : 'outline'}
            onClick={() => toggleFeed(f.key)}
            aria-pressed={activeFeeds.includes(f.key)}
            className="h-9 sm:h-8"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Compact legend chips above the calendar so colour meanings are visible
          without scrolling past a tall grid. Shown on mobile for every view, and
          on desktop too for Week/Day (whose aside legend is dropped for width). */}
      <CalendarLegend legend={legend} layout="chips" className={isTimeGrid ? '' : 'lg:hidden'} />

      <div className={`grid grid-cols-1 gap-4 ${isTimeGrid ? '' : 'lg:grid-cols-[minmax(0,1fr)_220px]'}`}>
        <div className="relative h-[calc(100dvh-13rem)] min-h-[480px] rounded-xl border bg-card p-2 sm:p-3 lg:h-[760px]">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            view={view}
            date={currentDate}
            onNavigate={(d) => setCurrentDate(d)}
            onView={(v) => setCurrentView(v)}
            views={availableViews}
            components={{ toolbar: CalendarToolbar }}
            eventPropGetter={eventStyleGetter}
            onSelectEvent={handleSelectEvent}
            scrollToTime={SCROLL_TO_TIME}
            popup
            style={{ height: '100%' }}
          />
          {isLoading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/50">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        {!isTimeGrid && (
          <aside className="hidden space-y-3 lg:block">
            <div className="rounded-xl border bg-card p-3">
              <h2 className="mb-2 text-sm font-semibold">Legend</h2>
              <CalendarLegend legend={legend} layout="list" />
            </div>
          </aside>
        )}
      </div>

      <EventDetailDialog item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

function CalendarLegend({
  legend,
  layout,
  className,
}: {
  legend: [string, string][];
  layout: 'list' | 'chips';
  className?: string;
}) {
  if (layout === 'chips') {
    if (legend.length === 0) return null;
    return (
      <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
        {legend.map(([name, color]) => (
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            {name}
          </span>
        ))}
      </div>
    );
  }

  if (legend.length === 0) {
    return <p className="text-xs text-muted-foreground">No items in this range.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {legend.map(([name, color]) => (
        <li key={name} className="flex items-center gap-2 text-xs">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate">{name}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * All-day items are stored UTC-anchored: 00:00:00Z on the start date through
 * 23:59:59.999Z on the end date. `new Date(iso)` re-anchors them to the
 * viewer's zone, which east of UTC pushes the end past midnight (IST +5:30 →
 * 05:29 the NEXT day). RBC's month grid spans `ceil(end,'day')`, so that extra
 * 5½ hours paints a whole extra column — a 15 Aug holiday renders 15–16 Aug.
 * West of UTC the start slips backwards the same way. Rebuilding the same
 * calendar Y-M-D in local time makes the grid show exactly the authored days in
 * every timezone. Timed items keep `new Date()` — those SHOULD shift to local.
 */
function allDayLocalDate(iso: string, edge: 'start' | 'end'): Date {
  const m = moment.utc(iso);
  return edge === 'end'
    ? new Date(m.year(), m.month(), m.date(), 23, 59, 59, 999)
    : new Date(m.year(), m.month(), m.date());
}

/**
 * The resolver carries the booking's own status in `meta.status`. Until now the
 * calendar never saw a cancelled booking — the SQL filtered them out — so this
 * only ever fires for meeting feeds. It is written against `meta` rather than a
 * feed check so any future source that reports a cancelled status gets the same
 * treatment for free.
 */
function isCancelled(it: CalendarItem): boolean {
  const status = it.meta?.status;
  return typeof status === 'string' && status.toLowerCase() === 'cancelled';
}

function feedKeyFor(it: CalendarItem): string {
  if (it.source_module === 'global') return 'global_entries';
  if (it.source_module === 'academic') return 'academic_holidays';
  if (it.source_module === 'hr') return 'hr_public_holidays';
  if (it.source_module === 'hr_leave') return 'staff_leave';
  if (it.source_module === 'academic_leave') return 'student_leave';
  if (it.source_module === 'events' || it.source_module === 'lc_event' || it.source_module === 'startup_event') return 'events';
  if (it.source_module === 'bos_meeting' || it.source_module === 'meeting_booking') return 'meetings';
  if (it.source_module === 'reservation') return 'reservations';
  // The COE proxies already stamp source_module with the feed key, so these two
  // would fall through correctly anyway — named here so the mapping is explicit.
  if (it.source_module === COE_CALENDAR_FEED) return COE_CALENDAR_FEED;
  if (it.source_module === EXAM_SCHEDULE_FEED) return EXAM_SCHEDULE_FEED;
  return it.source_module;
}
