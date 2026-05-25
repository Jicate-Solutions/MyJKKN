'use client';

/**
 * useCalendarEvents — thin React-layer aggregator hook for /campus-living/calendar.
 *
 * PURE COMPOSITION. Consumes existing hooks:
 *   - useHostelLeaveRequests          (leaves)
 *   - useGatePasses                   (gate passes)
 *   - useHostelMaintenanceRequests    (maintenance windows)
 *   - useMessMenus                    (mess menu cycles)
 *   - useHostelIncidents              (optional: incidents)
 *
 * Maps each row into a `CalendarEvent` and concatenates. De-dupes by composite
 * id. No new tables, no new services, no DB calls of its own.
 */

import { useMemo } from 'react';
import { useHostelLeaveRequests } from '@/hooks/campus-living/use-hostel-leave';
import { useGatePasses } from '@/hooks/campus-living/use-gate-passes';
import { useHostelMaintenanceRequests } from '@/hooks/campus-living/use-hostel-maintenance';
import { useMessMenus } from '@/hooks/campus-living/use-mess-menus';
import { useHostelIncidents } from '@/hooks/campus-living/use-hostel-incidents';
import type {
  HostelLeaveRequest,
  HostelGatePass,
  HostelMaintenanceRequest,
  MessMenu,
  HostelIncident,
} from '@/types/campus-living';
import type { CalendarEvent } from '@/types/campus-living/calendar';

/**
 * Build the ISO date (YYYY-MM-DD) for a given day-of-week offset from a
 * week-start anchor. Used to project mess menus (which carry `day_of_week`
 * 0-6 + `week_start_date`) onto an absolute date.
 */
function projectMessMenuDate(menu: MessMenu): string | null {
  if (!menu.week_start_date) return null;
  // week_start_date is a YYYY-MM-DD string. day_of_week: 0=Mon..6=Sun
  // We keep semantics consistent with whatever the source uses by adding
  // day_of_week days to week_start_date.
  const start = new Date(`${menu.week_start_date}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const offsetDays = Number.isFinite(menu.day_of_week) ? menu.day_of_week : 0;
  start.setUTCDate(start.getUTCDate() + offsetDays);
  return start.toISOString().slice(0, 10);
}

function mapLeave(row: HostelLeaveRequest): CalendarEvent {
  return {
    id: `leave:${row.id}`,
    source: 'leave',
    sourceId: row.id,
    title: `Leave: ${row.leave_type ?? 'leave'}`,
    subtitle: row.destination || row.reason || undefined,
    start: row.from_date,
    end: row.to_date || row.from_date,
    status: row.status,
    variant: row.leave_type,
  };
}

function mapGatePass(row: HostelGatePass): CalendarEvent {
  // Gate passes are timestamped — use out_time or created_at as start,
  // expected_return as end. Fall back to created_at for both if missing.
  const start =
    row.out_time ||
    row.created_at ||
    row.expected_return ||
    new Date().toISOString();
  const end = row.expected_return || row.actual_return || start;
  return {
    id: `gate-pass:${row.id}`,
    source: 'gate-pass',
    sourceId: row.id,
    title: `Gate pass: ${row.pass_type ?? ''}`.trim(),
    subtitle: row.destination || row.pass_number || undefined,
    start,
    end,
    status: row.status,
    variant: row.pass_type,
  };
}

function mapMaintenance(row: HostelMaintenanceRequest): CalendarEvent {
  // Maintenance "window" = created_at → sla_deadline (or resolved_at if done).
  const start = row.created_at || row.sla_deadline;
  const end = row.resolved_at || row.sla_deadline || start;
  return {
    id: `maintenance:${row.id}`,
    source: 'maintenance',
    sourceId: row.id,
    title: row.title || `Maintenance ${row.request_number ?? ''}`.trim(),
    subtitle: row.category ? `${row.category}` : undefined,
    start,
    end,
    status: row.status,
    variant: row.priority,
  };
}

function mapMessMenu(row: MessMenu): CalendarEvent | null {
  const date = projectMessMenuDate(row);
  if (!date) return null;
  const title = row.is_special_day
    ? `Mess: ${row.special_day_name ?? row.meal_type}`
    : `Mess: ${row.meal_type}`;
  const subtitle = (row.items ?? []).slice(0, 3).join(', ') || undefined;
  return {
    id: `mess:${row.id}`,
    source: 'mess',
    sourceId: row.id,
    title,
    subtitle,
    start: date,
    end: date,
    status: row.status,
    variant: row.meal_type,
  };
}

function mapIncident(row: HostelIncident): CalendarEvent {
  const start = row.incident_date || row.reported_at || row.created_at || new Date().toISOString();
  return {
    id: `incident:${row.id}`,
    source: 'incident',
    sourceId: row.id,
    title: `Incident: ${row.incident_type ?? ''}`.trim() || 'Incident',
    subtitle: row.title || row.location || undefined,
    start,
    end: row.closed_at || start,
    status: row.status,
    variant: row.severity,
  };
}

export interface UseCalendarEventsResult {
  events: CalendarEvent[];
  isLoading: boolean;
  isError: boolean;
  errors: Array<{ source: string; error: unknown }>;
  /** Per-source counts after mapping (before any client filter). */
  counts: Record<string, number>;
}

/**
 * Extract a row array from a react-query result whose `data` may either be:
 *   - a plain `T[]` (legacy / some hooks), OR
 *   - a paginated wrapper `{ data: T[], count: number }` (all current
 *     campus-living services return this shape).
 *
 * Returns `[]` for any other value (undefined, null, error states, malformed).
 * This is what was missing in PR #1050 and caused the
 * `.forEach is not a function` crash on /campus-living/calendar.
 */
function extractRows<T>(queryData: unknown): T[] {
  if (Array.isArray(queryData)) return queryData as T[];
  if (
    queryData &&
    typeof queryData === 'object' &&
    'data' in queryData &&
    Array.isArray((queryData as { data: unknown }).data)
  ) {
    return (queryData as { data: T[] }).data;
  }
  return [];
}

/**
 * Aggregator hook. Pass the institution_id from `useAuth().profile.institution_id`.
 *
 * Returns a flat, de-duplicated array of CalendarEvents. Filtering by source
 * happens in the consuming component (cheap — usually <500 rows).
 */
export function useCalendarEvents(institutionId: string | undefined): UseCalendarEventsResult {
  const leaves = useHostelLeaveRequests(institutionId);
  const passes = useGatePasses(institutionId);
  const maintenance = useHostelMaintenanceRequests(institutionId);
  const menus = useMessMenus(institutionId);
  const incidents = useHostelIncidents(institutionId);

  const events = useMemo<CalendarEvent[]>(() => {
    const out: CalendarEvent[] = [];
    const seen = new Set<string>();
    const push = (e: CalendarEvent | null) => {
      if (!e) return;
      if (seen.has(e.id)) return;
      seen.add(e.id);
      out.push(e);
    };

    extractRows<HostelLeaveRequest>(leaves.data).forEach((row) => push(mapLeave(row)));
    extractRows<HostelGatePass>(passes.data).forEach((row) => push(mapGatePass(row)));
    extractRows<HostelMaintenanceRequest>(maintenance.data).forEach((row) =>
      push(mapMaintenance(row)),
    );
    extractRows<MessMenu>(menus.data).forEach((row) => push(mapMessMenu(row)));
    extractRows<HostelIncident>(incidents.data).forEach((row) => push(mapIncident(row)));

    return out;
  }, [leaves.data, passes.data, maintenance.data, menus.data, incidents.data]);

  const counts = useMemo(() => {
    return events.reduce<Record<string, number>>((acc, e) => {
      acc[e.source] = (acc[e.source] ?? 0) + 1;
      return acc;
    }, {});
  }, [events]);

  const isLoading =
    leaves.isLoading ||
    passes.isLoading ||
    maintenance.isLoading ||
    menus.isLoading ||
    incidents.isLoading;

  const errors = [
    leaves.error ? { source: 'leave', error: leaves.error } : null,
    passes.error ? { source: 'gate-pass', error: passes.error } : null,
    maintenance.error ? { source: 'maintenance', error: maintenance.error } : null,
    menus.error ? { source: 'mess', error: menus.error } : null,
    incidents.error ? { source: 'incident', error: incidents.error } : null,
  ].filter(Boolean) as Array<{ source: string; error: unknown }>;

  return {
    events,
    isLoading,
    isError: errors.length > 0,
    errors,
    counts,
  };
}
