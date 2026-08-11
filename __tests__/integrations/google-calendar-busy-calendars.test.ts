/**
 * Which calendars count as "busy" — the rule behind the multi-calendar fix.
 *
 * WHY THESE ASSERT WHAT THEY DO
 *   Before 2026-08-04 the slot engine asked Google about `primary` only, so a
 *   meeting on any second calendar was invisible and the host was offered to a
 *   stranger as free. Widening that has an equal and opposite danger: count too
 *   many calendars and a shared department calendar marks the host busy for
 *   every colleague's meeting, quietly killing their booking page.
 *
 *   So half of these tests prove we now see MORE, and half prove we do not see
 *   too much. Both directions are failure modes; only one of them looks broken.
 */

import { describe, it, expect } from 'vitest';
// Imported from the dependency-free module on purpose: pulling it from
// google-calendar-service would drag in the email layer, which demands a live
// API key at module load and would make this suite fail for reasons that have
// nothing to do with the rule under test.
import {
  selectBusyCalendarIds,
  FREEBUSY_MAX_CALENDARS,
  type GoogleCalendarListEntry,
} from '@/lib/services/integrations/google-busy-calendars';

const primary: GoogleCalendarListEntry = {
  id: 'me@jkkn.ac.in',
  primary: true,
  accessRole: 'owner',
  selected: true,
  summary: 'me@jkkn.ac.in',
};

describe('what we now catch that we used to miss', () => {
  it('includes a second calendar the host owns — the actual bug', () => {
    const { ids } = selectBusyCalendarIds([
      primary,
      { id: 'office@group.calendar.google.com', accessRole: 'owner', selected: true, summary: 'Office' },
    ]);
    expect(ids).toContain('office@group.calendar.google.com');
    expect(ids).toHaveLength(2);
  });

  it('always puts primary first, and never drops it', () => {
    const { ids } = selectBusyCalendarIds([
      { id: 'office@group.calendar.google.com', accessRole: 'owner', selected: true },
      primary,
    ]);
    expect(ids[0]).toBe('me@jkkn.ac.in');
  });

  it('falls back to the literal "primary" alias when Google flags none', () => {
    // Never narrow to zero calendars: that would report everyone free, always.
    const { ids } = selectBusyCalendarIds([
      { id: 'office@group.calendar.google.com', accessRole: 'owner', selected: true },
    ]);
    expect(ids[0]).toBe('primary');
  });

  it('handles an empty list without collapsing to nothing', () => {
    expect(selectBusyCalendarIds([]).ids).toEqual(['primary']);
  });
});

describe('what we deliberately still ignore', () => {
  it('ignores a shared calendar the host can only write to', () => {
    // Department calendars usually grant 'writer'. Counting them would mark the
    // host busy for every colleague's meeting and kill their booking page.
    const { ids } = selectBusyCalendarIds([
      primary,
      { id: 'dept@group.calendar.google.com', accessRole: 'writer', selected: true, summary: 'Pharmacy Dept' },
    ]);
    expect(ids).not.toContain('dept@group.calendar.google.com');
  });

  it('ignores subscribed holiday calendars', () => {
    // These come back as 'reader'. Counting one would mark every host busy for a
    // whole national holiday and silently close their page for the day.
    const { ids } = selectBusyCalendarIds([
      primary,
      { id: 'en.indian#holiday@group.v.calendar.google.com', accessRole: 'reader', selected: true },
    ]);
    expect(ids).toEqual(['me@jkkn.ac.in']);
  });

  it('ignores a calendar the host has unticked in Google', () => {
    // Google's own "show this calendar" checkbox IS the setting — reusing it
    // means there is no second preference screen to drift out of sync.
    const { ids } = selectBusyCalendarIds([
      primary,
      { id: 'personal@gmail.com', accessRole: 'owner', selected: false, summary: 'Personal' },
    ]);
    expect(ids).not.toContain('personal@gmail.com');
  });

  it('treats an absent `selected` as shown', () => {
    // Google omits the field rather than sending false; absent must not mean off.
    const { ids } = selectBusyCalendarIds([
      primary,
      { id: 'office@group.calendar.google.com', accessRole: 'owner' },
    ]);
    expect(ids).toContain('office@group.calendar.google.com');
  });

  it('skips malformed rows instead of throwing', () => {
    const { ids } = selectBusyCalendarIds([
      primary,
      { id: '', accessRole: 'owner' },
      undefined as unknown as GoogleCalendarListEntry,
    ]);
    expect(ids).toEqual(['me@jkkn.ac.in']);
  });
});

describe('no silent caps', () => {
  it('reports how many calendars it had to drop', () => {
    const many: GoogleCalendarListEntry[] = [primary];
    for (let i = 0; i < FREEBUSY_MAX_CALENDARS + 7; i++) {
      many.push({ id: `cal-${i}@group.calendar.google.com`, accessRole: 'owner', selected: true });
    }
    const { ids, truncated } = selectBusyCalendarIds(many);
    expect(ids).toHaveLength(FREEBUSY_MAX_CALENDARS);
    // A dropped calendar is one the engine will treat as free, so the count must
    // reach a log line rather than vanish.
    expect(truncated).toBe(8);
  });

  it('reports nothing truncated in the normal case', () => {
    expect(selectBusyCalendarIds([primary]).truncated).toBe(0);
  });

  it('de-duplicates a calendar listed twice', () => {
    const { ids } = selectBusyCalendarIds([primary, primary]);
    expect(ids).toEqual(['me@jkkn.ac.in']);
  });
});
