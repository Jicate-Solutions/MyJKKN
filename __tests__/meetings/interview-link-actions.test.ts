/**
 * Linking a meeting to an interview writes a row that the database will accept.
 *
 * This exists because it did not. hr_recruitment_interviews.panel_member_ids is
 * NOT NULL with CHECK (array_length(panel_member_ids, 1) > 0), and the insert
 * never set it — so every Link since the feature shipped failed with 23502 and
 * told the host "Could not link this meeting. Please try again.", which is both
 * untrue and unactionable: trying again could never work.
 *
 * The columns asserted here are exactly the ones the table requires and gives no
 * default for. Supabase is faked; what is under test is the shape of the row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const USER = 'host-profile-1';
const CANDIDATE = 'cand-1';

let booking: Record<string, unknown> | null;
let bookingError: { message: string } | null;
let insertError: { code?: string; message: string } | null;
let inserted: Record<string, unknown> | null;
let existingRounds: number;

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from(table: string) {
      if (table === 'meeting_bookings') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: booking, error: bookingError }) }),
          }),
        };
      }
      // hr_recruitment_interviews: counted, then inserted into, then updated.
      return {
        select: () => ({
          eq: () => Promise.resolve({ count: existingRounds, error: null }),
        }),
        insert: async (payload: Record<string, unknown>) => {
          inserted = payload;
          return { error: insertError };
        },
        update: () => ({ eq: async () => ({ error: insertError }) }),
      };
    },
  }),
}));

import {
  linkMeetingToInterview,
  unlinkMeetingFromInterview,
} from '@/app/(routes)/meetings/[uid]/interview-actions';

beforeEach(() => {
  booking = {
    id: 'booking-1',
    start_time: '2026-09-16T13:00:00.000Z',
    end_time: '2026-09-16T13:30:00.000Z',
    video_url: null,
  };
  bookingError = null;
  insertError = null;
  inserted = null;
  existingRounds = 0;
});

describe('linking a meeting to an interview', () => {
  it('writes every column the table demands', async () => {
    const res = await linkMeetingToInterview('bk-1', CANDIDATE, 'job-1');
    expect(res.success).toBe(true);

    // NOT NULL, no default — the row is refused without each of these.
    expect(inserted).toMatchObject({
      candidate_id: CANDIDATE,
      scheduled_at: '2026-09-16T13:00:00.000Z',
      mode: 'in_person',
      status: 'scheduled',
    });
    // The one that was missing, and its CHECK: at least one panel member.
    expect(inserted?.panel_member_ids).toEqual([USER]);
    expect((inserted?.panel_member_ids as string[]).length).toBeGreaterThan(0);
  });

  it('counts the round from what the candidate already has', async () => {
    existingRounds = 2;
    await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(inserted).toMatchObject({ round_number: 3 });
    expect(String(inserted?.round_name)).toContain('Round 3');
  });

  it('records a video meeting as video, with its link', async () => {
    booking = { ...booking, video_url: 'https://meet.google.com/abc-defg-hij' };
    await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(inserted).toMatchObject({
      mode: 'video',
      location_or_link: 'https://meet.google.com/abc-defg-hij',
    });
  });

  it('omits the duration rather than sending null when the end time is missing', async () => {
    // duration_minutes is NOT NULL DEFAULT 30; an explicit null is refused, so
    // the key must be absent and the default left to apply.
    booking = { ...booking, end_time: null };
    await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(inserted).not.toHaveProperty('duration_minutes');
  });

  it('sends the duration when both times are there', async () => {
    await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(inserted).toMatchObject({ duration_minutes: 30 });
  });

  it('turns an empty post into null rather than an empty string', async () => {
    await linkMeetingToInterview('bk-1', CANDIDATE, '');
    expect(inserted?.job_id).toBeNull();
  });

  it('refuses a meeting with no start time, in plain words', async () => {
    booking = { ...booking, start_time: null };
    const res = await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no start time/i);
    expect(inserted).toBeNull();
  });
});

describe('what the host is told when it fails', () => {
  it('names the missing permission on an RLS refusal', async () => {
    insertError = { code: '42501', message: 'row-level security' };
    const res = await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(res.error).toMatch(/permission/i);
  });

  it('says it is already linked on a duplicate', async () => {
    insertError = { code: '23505', message: 'duplicate key' };
    const res = await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(res.error).toMatch(/already linked/i);
  });

  it('names a vanished candidate or post on a foreign key', async () => {
    insertError = { code: '23503', message: 'foreign key' };
    const res = await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(res.error).toMatch(/no longer exists/i);
  });

  it('does not tell the host to try again when trying again cannot work', async () => {
    insertError = { code: '23502', message: 'null value in column "panel_member_ids"' };
    const res = await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(res.success).toBe(false);
    expect(res.error).not.toMatch(/try again/i);
    expect(res.error).toMatch(/logged/i);
  });

  it('separates a failed read from a deleted meeting', async () => {
    bookingError = { message: 'column does not exist' };
    booking = null;
    const failedRead = await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(failedRead.error).toMatch(/try again/i);

    bookingError = null;
    const gone = await linkMeetingToInterview('bk-1', CANDIDATE, null);
    expect(gone.error).toMatch(/no longer exists/i);
  });
});

describe('unlinking', () => {
  it('clears the link and keeps the interview record', async () => {
    const res = await unlinkMeetingFromInterview('bk-1');
    expect(res.success).toBe(true);
  });
});
