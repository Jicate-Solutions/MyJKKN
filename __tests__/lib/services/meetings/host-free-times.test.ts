/**
 * nextFreeTimes (lib/services/meetings/host-free-times.ts): the free times the
 * booking door offers after a clash (Director, 9 Oct 2026).
 *   - on the half hour, after the asked-for time, skipping busy meetings;
 *   - only 07:00–22:00 India time (the host any-time rule), so a late ask
 *     rolls to the next morning;
 *   - busy times that cannot be verified offer nothing (fails closed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hostBusy = vi.fn();
vi.mock('@/lib/services/meetings/native-scheduling-service', () => ({
  NativeSchedulingService: { hostBusy: (...a: unknown[]) => hostBusy(...a) },
}));
vi.mock('@/lib/services/meetings/host-scheduling-service', () => ({ CAMPUS_TZ: 'Asia/Kolkata' }));

import { nextFreeTimes } from '@/lib/services/meetings/host-free-times';

const NOW = new Date('2026-10-09T03:30:00.000Z'); // 09:00 India time
const db = {} as never;

beforeEach(() => {
  hostBusy.mockReset();
  hostBusy.mockResolvedValue([]);
});

describe('nextFreeTimes', () => {
  it('skips a busy meeting (and its 5-minute gap) and returns the next three half-hour starts', async () => {
    // busy 10:00–11:00 India time
    hostBusy.mockResolvedValue([{ start: '2026-10-09T04:30:00.000Z', end: '2026-10-09T05:30:00.000Z' }]);
    const times = await nextFreeTimes(db, 'host-1', {
      afterIso: '2026-10-09T04:30:00.000Z', // asked for 10:00
      durationMin: 30,
      now: NOW,
    });
    // 11:00 would sit right against the meeting; the booking guard's 5-minute
    // gap makes 11:30 the first time that can really be booked.
    expect(times).toEqual([
      '2026-10-09T06:00:00.000Z', // 11:30
      '2026-10-09T06:30:00.000Z', // 12:00
      '2026-10-09T07:00:00.000Z', // 12:30
    ]);
    expect(hostBusy).toHaveBeenCalledWith(db, 'host-1', '2026-10-09T04:30:00.000Z', '2026-10-16T04:30:00.000Z');
  });

  it('keeps the booking guard\'s 5-minute gap after a busy meeting (no suggestion it would refuse)', async () => {
    // busy 10:00–10:30 India time; asked for 10:00
    hostBusy.mockResolvedValue([{ start: '2026-10-09T04:30:00.000Z', end: '2026-10-09T05:00:00.000Z' }]);
    const times = await nextFreeTimes(db, 'host-1', { afterIso: '2026-10-09T04:30:00.000Z', durationMin: 30, count: 1, now: NOW });
    // 10:30 would touch the meeting; the first offer is 11:00
    expect(times).toEqual(['2026-10-09T05:30:00.000Z']);
  });

  it('a meeting that would run past 22:00 rolls to 07:00 the next day', async () => {
    const times = await nextFreeTimes(db, 'host-1', {
      afterIso: '2026-10-09T16:00:00.000Z', // 21:30 India time
      durationMin: 60,
      count: 1,
      now: NOW,
    });
    expect(times).toEqual(['2026-10-10T01:30:00.000Z']); // 07:00 on 10 Oct
  });

  it('the meeting being moved does not block its own time', async () => {
    // busy 10:00–10:30 is the meeting itself
    const own = { start: '2026-10-09T04:30:00.000Z', end: '2026-10-09T05:00:00.000Z' };
    hostBusy.mockResolvedValue([own]);
    // the same meeting appears twice: the booking row and its Google event
    hostBusy.mockResolvedValue([own, { ...own }]);
    const times = await nextFreeTimes(db, 'host-1', { afterIso: '2026-10-09T04:30:00.000Z', durationMin: 30, count: 2, now: NOW, ignore: own });
    // its own current start (10:00) is not offered as a "new" time, but the
    // time right after it is free — both copies of its block were dropped
    expect(times).toEqual(['2026-10-09T05:00:00.000Z', '2026-10-09T05:30:00.000Z']);
  });

  it('never offers a time before now', async () => {
    const times = await nextFreeTimes(db, 'host-1', {
      afterIso: '2026-10-08T04:30:00.000Z', // yesterday
      durationMin: 30,
      count: 1,
      now: NOW,
    });
    expect(times).toEqual(['2026-10-09T03:30:00.000Z']); // 09:00 today
  });

  it('offers nothing when busy times cannot be verified', async () => {
    // hostBusy fails closed by returning the whole range as busy
    hostBusy.mockImplementation(async (_db, _h, from: string, to: string) => [{ start: from, end: to }]);
    const times = await nextFreeTimes(db, 'host-1', { afterIso: '2026-10-09T04:30:00.000Z', durationMin: 30, now: NOW });
    expect(times).toEqual([]);
  });
});
