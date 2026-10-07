// __tests__/events/event-date-filter.test.ts
//
// BUG-006221 (COO): "PROVIDE SEARCH OPTION by Date and Month also" on /events.
// An event matches a chosen day or month when the days it RUNS overlap it, in
// India time. Expected instants are literal UTC strings (IST is +05:30), so the
// runner's own timezone cannot change the answer.

import { describe, it, expect } from 'vitest';
import {
  eventDateFilterRange,
  eventDaySpan,
  eventOverlapsRange,
  filterEventsByDate,
  formatFilterMonth,
  monthDayRange,
} from '@/app/(routes)/events/_components/event-date-filter';

describe('monthDayRange', () => {
  it('covers the whole month, leap years included', () => {
    expect(monthDayRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthDayRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthDayRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('eventDateFilterRange', () => {
  it('is null with no filter or malformed URL values', () => {
    expect(eventDateFilterRange({})).toBeNull();
    expect(eventDateFilterRange({ month: '2026-13', date: '2026-02-30' })).toBeNull();
    expect(eventDateFilterRange({ month: 'october', date: '' })).toBeNull();
  });
  it('a date alone is a one-day range', () => {
    expect(eventDateFilterRange({ date: '2026-10-07' })).toEqual({ from: '2026-10-07', to: '2026-10-07' });
  });
  it('month and date together intersect (a date outside the month matches nothing)', () => {
    expect(eventDateFilterRange({ month: '2026-10', date: '2026-10-07' })).toEqual({
      from: '2026-10-07',
      to: '2026-10-07',
    });
    const r = eventDateFilterRange({ month: '2026-10', date: '2026-11-02' })!;
    expect(eventOverlapsRange({ event_date: '2026-11-02' }, r)).toBe(false);
    expect(eventOverlapsRange({ event_date: '2026-10-15' }, r)).toBe(false);
  });
});

describe('eventDaySpan (IST days)', () => {
  it('uses event_date as the first day and end_date only when later (multi-day)', () => {
    expect(
      eventDaySpan({
        event_date: '2026-10-30',
        start_date: '2026-10-30T04:00:00.000Z',
        end_date: '2026-11-01T11:30:00.000Z',
      })
    ).toEqual({ from: '2026-10-30', to: '2026-11-01' });
  });
  it('a start_date at 00:30 IST is that IST day, not the previous UTC day', () => {
    // 2026-09-30T19:00Z = 1 Oct 00:30 IST
    expect(eventDaySpan({ start_date: '2026-09-30T19:00:00.000Z', end_date: null })).toEqual({
      from: '2026-10-01',
      to: '2026-10-01',
    });
  });
  it('an end_date before event_date does not shrink the event (stale run window)', () => {
    expect(eventDaySpan({ event_date: '2026-10-06', end_date: '2026-09-30T09:30:00.000Z' })).toEqual({
      from: '2026-10-06',
      to: '2026-10-06',
    });
  });
  it('null when the event carries no date at all', () => {
    expect(eventDaySpan({ event_date: null, start_date: null, end_date: null })).toBeNull();
  });
});

describe('filterEventsByDate', () => {
  const crossesMonthEnd = {
    id: 'fest',
    event_date: '2026-10-30',
    start_date: '2026-10-30T04:00:00.000Z',
    end_date: '2026-11-01T11:30:00.000Z',
  };
  const midOctober = { id: 'quiz', event_date: '2026-10-15', start_date: null, end_date: null };
  // 31 Oct 23:00 IST = 31 Oct 17:30Z; 1 Nov 00:30 IST = 31 Oct 19:00Z.
  const lateOnLastDay = { id: 'late', event_date: null, start_date: '2026-10-31T17:30:00.000Z', end_date: null };
  const novemberInIst = { id: 'early', event_date: null, start_date: '2026-10-31T19:00:00.000Z', end_date: null };
  const undated = { id: 'tbd', event_date: null, start_date: null, end_date: null };
  const rows = [crossesMonthEnd, midOctober, lateOnLastDay, novemberInIst, undated];
  const ids = (r: { id: string }[]) => r.map((e) => e.id);

  it('no filter returns every row, undated included', () => {
    expect(ids(filterEventsByDate(rows, {}))).toEqual(['fest', 'quiz', 'late', 'early', 'tbd']);
  });
  it('October: a multi-day event spilling into November counts; 1 Nov 00:30 IST does not', () => {
    expect(ids(filterEventsByDate(rows, { month: '2026-10' }))).toEqual(['fest', 'quiz', 'late']);
  });
  it('November: the month-crossing event and the 00:30 IST start count', () => {
    expect(ids(filterEventsByDate(rows, { month: '2026-11' }))).toEqual(['fest', 'early']);
  });
  it('a single date inside a multi-day event matches it', () => {
    expect(ids(filterEventsByDate(rows, { date: '2026-10-31' }))).toEqual(['fest', 'late']);
    expect(ids(filterEventsByDate(rows, { date: '2026-11-01' }))).toEqual(['fest', 'early']);
  });
});

describe('formatFilterMonth', () => {
  it('reads like the bug asked for', () => {
    expect(formatFilterMonth('2026-10')).toBe('October 2026');
  });
});
