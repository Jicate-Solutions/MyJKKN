// __tests__/events/event-run-window.test.ts
//
// The edit dialog saved its own "Runs from / Runs until" inputs, so moving an
// event's date or hours left start_date / end_date on the old values — the
// divergence scripts/ci/check-event-time-consistency.mjs reports every night.
// deriveRunWindow makes the clock fields (what the event page shows) decide the
// run window. Expected values are literal UTC strings: IST is +05:30, so the
// runner's own timezone cannot change the answer.

import { describe, it, expect } from 'vitest';
import { deriveRunWindow } from '@/app/(routes)/events/_components/event-run-window';

describe('deriveRunWindow', () => {
  it('single-day event created on another day: start follows event_date, not the stale run window (RANGOLI shape)', () => {
    // Row as the dialog loads it: clock says 6 Oct 09:30–11:30, run window
    // still says 30 Sep 15:00 → 6 Oct 08:30.
    const w = deriveRunWindow({
      event_date: '2026-10-06',
      start_time: '09:30:00',
      end_time: '11:30:00',
      start_date: '2026-09-30T15:00',
      end_date: '2026-10-06T08:30',
    });
    expect(w.start_date).toBe('2026-10-06T04:00:00.000Z'); // 09:30 IST
    expect(w.end_date).toBe('2026-10-06T06:00:00.000Z'); // 11:30 IST
  });

  it('an edit that changes only start_time moves start_date with it', () => {
    // Was 10:00–15:00 on 1 Oct in both shapes; organiser changes start to 11:15.
    const w = deriveRunWindow({
      event_date: '2026-10-01',
      start_time: '11:15',
      end_time: '15:00:00',
      start_date: '2026-10-01T10:00',
      end_date: '2026-10-01T15:00',
    });
    expect(w.start_date).toBe('2026-10-01T05:45:00.000Z'); // 11:15 IST
    expect(w.end_date).toBe('2026-10-01T09:30:00.000Z'); // 15:00 IST
  });

  it('multi-day event keeps its later last day; only the time of day follows end_time', () => {
    const w = deriveRunWindow({
      event_date: '2026-08-10',
      start_time: '09:45',
      end_time: '15:45',
      start_date: '2026-08-10T09:45',
      end_date: '2026-08-11T13:00',
    });
    expect(w.start_date).toBe('2026-08-10T04:15:00.000Z'); // 10 Aug 09:45 IST
    expect(w.end_date).toBe('2026-08-11T10:15:00.000Z'); // 11 Aug 15:45 IST
  });

  it('an end day earlier than event_date is not a multi-day event: end lands on event_date', () => {
    const w = deriveRunWindow({
      event_date: '2026-10-06',
      start_time: '14:30',
      end_time: '15:30',
      start_date: '2026-10-01T15:30',
      end_date: '2026-10-01T16:00',
    });
    expect(w.start_date).toBe('2026-10-06T09:00:00.000Z');
    expect(w.end_date).toBe('2026-10-06T10:00:00.000Z');
  });

  it('with no clock fields the typed run window is kept (older rows stay editable)', () => {
    const w = deriveRunWindow({
      event_date: '',
      start_time: '',
      end_time: '',
      start_date: '2026-08-04T10:00',
      end_date: '2026-08-04T12:00',
    });
    expect(w.start_date).toBe('2026-08-04T04:30:00.000Z');
    expect(w.end_date).toBe('2026-08-04T06:30:00.000Z');
  });
});
