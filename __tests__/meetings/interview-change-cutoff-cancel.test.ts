// __tests__/meetings/interview-change-cutoff-cancel.test.ts
//
// #11 on the attendee cancel surfaces: an interview-link booking cannot be
// cancelled by the candidate inside its last two hours (the team lead reads
// "after that they contact the office" as covering any change). The action
// re-checks on the server; ordinary meetings keep today's behaviour; a wrong
// token learns nothing.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  booking: null as Record<string, unknown> | null,
  cutoffMin: 120,
  cancelBooking: vi.fn(),
  getChangeCutoffMin: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'meeting_bookings') return { data: h.booking, error: null };
            if (table === 'meeting_types') return { data: { title: 'Interview', cancellation_policy: null }, error: null };
            if (table === 'profiles') return { data: { full_name: 'Host', email: 'h@x' }, error: null };
            return { data: null, error: null };
          },
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/services/meetings/native-scheduling-service', () => ({
  NativeSchedulingService: { cancelBooking: h.cancelBooking },
}));

vi.mock('@/lib/services/hr/interview-booking-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/hr/interview-booking-service')>();
  return { ...actual, getChangeCutoffMin: h.getChangeCutoffMin };
});

import { cancelAsAttendee } from '@/app/(public)/book/cancel/[uid]/actions';
import CancelPage from '@/app/(public)/book/cancel/[uid]/page';
import { CHANGE_CUTOFF_MESSAGE } from '@/lib/services/hr/interview-booking-service';

const TOKEN = 'tok-123';
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function makeBooking(source: string, startInMin: number) {
  return {
    cancel_token: TOKEN,
    status: 'confirmed',
    meeting_type_id: 'mt-1',
    host_profile_id: 'host-1',
    start_time: minutesFromNow(startInMin),
    source,
  };
}

async function pageState(token: string) {
  const el = await CancelPage({
    params: Promise.resolve({ uid: 'u1' }),
    searchParams: Promise.resolve({ token }),
  });
  return el.props as { initialState: string; tooCloseMessage: string; meetingTitle: string };
}

beforeEach(() => {
  h.booking = null;
  h.cutoffMin = 120;
  h.getChangeCutoffMin.mockReset().mockImplementation(async () => h.cutoffMin);
  // Mirrors the service: it checks the token itself.
  h.cancelBooking.mockReset().mockImplementation(async (_db, _uid, auth: { cancelToken: string }) =>
    auth.cancelToken === TOKEN ? { success: true } : { success: false, error: 'FORBIDDEN' },
  );
});

describe('cancelAsAttendee — interview-link booking', () => {
  it('90 minutes out: refused with the office message and cancelBooking is never called', async () => {
    h.booking = makeBooking('interview-link', 90);
    const res = await cancelAsAttendee('u1', TOKEN, 'cannot make it');
    expect(res).toEqual({ success: false, error: CHANGE_CUTOFF_MESSAGE, tooClose: true });
    expect(h.cancelBooking).not.toHaveBeenCalled();
  });

  it('staff-made interview booking follows the same rule (#1, #11)', async () => {
    h.booking = makeBooking('interview-link-staff', 90);
    const res = await cancelAsAttendee('u1', TOKEN);
    expect(res.success).toBe(false);
    expect(h.cancelBooking).not.toHaveBeenCalled();
  });

  it('3 hours out: cancelled as before', async () => {
    h.booking = makeBooking('interview-link', 180);
    const res = await cancelAsAttendee('u1', TOKEN);
    expect(res).toEqual({ success: true });
    expect(h.cancelBooking).toHaveBeenCalledTimes(1);
  });

  it('the window follows the policy: 30 minutes lets a 60-minutes-out interview be cancelled', async () => {
    h.cutoffMin = 30;
    h.booking = makeBooking('interview-link', 60);
    const res = await cancelAsAttendee('u1', TOKEN);
    expect(res).toEqual({ success: true });
    expect(h.cancelBooking).toHaveBeenCalledTimes(1);
  });

  it('a wrong token inside the window gets the old "not valid" answer, not the cutoff message', async () => {
    h.booking = makeBooking('interview-link', 90);
    const res = await cancelAsAttendee('u1', 'wrong');
    expect(res).toEqual({ success: false, error: 'This cancellation link is not valid.' });
    expect(h.getChangeCutoffMin).not.toHaveBeenCalled();
  });
});

describe('cancelAsAttendee — ordinary meetings are untouched', () => {
  for (const source of ['meet-page', 'direct', 'host-direct']) {
    it(`source '${source}' 90 minutes out is cancelled, and the policy is never read`, async () => {
      h.booking = makeBooking(source, 90);
      const res = await cancelAsAttendee('u1', TOKEN);
      expect(res).toEqual({ success: true });
      expect(h.cancelBooking).toHaveBeenCalledTimes(1);
      expect(h.getChangeCutoffMin).not.toHaveBeenCalled();
    });
  }
});

describe('cancel page', () => {
  it('interview inside the window opens as too-close, not the cancel form', async () => {
    h.booking = makeBooking('interview-link', 90);
    const props = await pageState(TOKEN);
    expect(props.initialState).toBe('too-close');
    expect(props.tooCloseMessage).toBe(CHANGE_CUTOFF_MESSAGE);
  });

  it('interview 3 hours out opens the cancel form', async () => {
    h.booking = makeBooking('interview-link', 180);
    expect((await pageState(TOKEN)).initialState).toBe('confirm');
  });

  it('ordinary meeting 90 minutes out opens the cancel form', async () => {
    h.booking = makeBooking('direct', 90);
    expect((await pageState(TOKEN)).initialState).toBe('confirm');
  });

  it('an interview that has already started reads as past, not too-close', async () => {
    h.booking = makeBooking('interview-link', -10);
    expect((await pageState(TOKEN)).initialState).toBe('past');
  });

  it('wrong token is invalid, shows no booking detail, and never reads the cutoff', async () => {
    h.booking = makeBooking('interview-link', 90);
    const props = await pageState('wrong');
    expect(props.initialState).toBe('invalid');
    expect(props.meetingTitle).toBe('');
    expect(h.getChangeCutoffMin).not.toHaveBeenCalled();
  });
});
