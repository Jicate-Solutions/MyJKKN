// __tests__/meetings/interview-change-cutoff-reschedule.test.ts
//
// #11 on the attendee reschedule surfaces: an interview-link booking cannot be
// moved by the candidate inside its last two hours (policy-driven window), in
// either route mode or on the page. Ordinary meetings keep today's behaviour,
// and a wrong token learns nothing — the cutoff never runs before the gate.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  booking: null as Record<string, unknown> | null,
  cutoffMin: 120,
  listSlots: vi.fn(),
  rescheduleBooking: vi.fn(),
  getChangeCutoffMin: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'meeting_bookings') return { data: h.booking, error: null };
            if (table === 'meeting_types') {
              return { data: { title: 'Interview', location_mode: 'video', min_notice_min: 60 }, error: null };
            }
            if (table === 'profiles') return { data: { full_name: 'Host', email: 'h@x' }, error: null };
            return { data: null, error: null };
          },
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/services/meetings/native-scheduling-service', () => ({
  NativeSchedulingService: {
    listSlots: h.listSlots,
    rescheduleBooking: h.rescheduleBooking,
  },
}));

vi.mock('@/lib/services/hr/interview-booking-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/hr/interview-booking-service')>();
  return { ...actual, getChangeCutoffMin: h.getChangeCutoffMin };
});

import { POST } from '@/app/api/public/booking/reschedule/[uid]/route';
import ReschedulePage from '@/app/(public)/book/reschedule/[uid]/page';
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
    location_mode_override: null,
    mode_switch_request_status: null,
    source,
  };
}

let ipSeq = 0;
function post(body: Record<string, unknown>) {
  // A fresh IP per call so the route's 20/h in-memory limit never trips.
  const req = new Request('http://localhost/api/public/booking/reschedule/u1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${++ipSeq}` },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any, { params: Promise.resolve({ uid: 'u1' }) });
}

async function pageState(token: string) {
  const el = await ReschedulePage({
    params: Promise.resolve({ uid: 'u1' }),
    searchParams: Promise.resolve({ token }),
  });
  return el.props as { initialState: string; tooCloseMessage: string; meetingTitle: string };
}

beforeEach(() => {
  h.booking = null;
  h.cutoffMin = 120;
  h.getChangeCutoffMin.mockReset().mockImplementation(async () => h.cutoffMin);
  h.listSlots.mockReset().mockResolvedValue({ days: { '2026-09-30': [{ start: minutesFromNow(3000) }] }, durationMin: 30 });
  h.rescheduleBooking.mockReset().mockImplementation(async (_db, uid, _auth, start) => ({ success: true, uid, start }));
});

describe('reschedule route — interview-link booking', () => {
  it('3 hours out: slots are listed and the move goes through', async () => {
    h.booking = makeBooking('interview-link', 180);

    const list = await post({ token: TOKEN });
    expect(list.status).toBe(200);
    expect((await list.json()).days).toBeTruthy();

    const newStart = minutesFromNow(3000);
    const move = await post({ token: TOKEN, start: newStart });
    expect(move.status).toBe(200);
    expect(await move.json()).toMatchObject({ success: true, start: newStart });
    expect(h.rescheduleBooking).toHaveBeenCalledTimes(1);
  });

  it('90 minutes out: listing is refused with too_close and no slots are read', async () => {
    h.booking = makeBooking('interview-link', 90);
    const res = await post({ token: TOKEN });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'too_close', message: CHANGE_CUTOFF_MESSAGE });
    expect(h.listSlots).not.toHaveBeenCalled();
  });

  it('90 minutes out: the move is refused with too_close and nothing is rescheduled', async () => {
    h.booking = makeBooking('interview-link', 90);
    const res = await post({ token: TOKEN, start: minutesFromNow(3000) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'too_close', message: CHANGE_CUTOFF_MESSAGE });
    expect(h.rescheduleBooking).not.toHaveBeenCalled();
  });

  it('staff-made interview booking follows the same rule (#1, #11)', async () => {
    h.booking = makeBooking('interview-link-staff', 90);
    const res = await post({ token: TOKEN });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('too_close');
  });

  it('the window follows the policy: 30 minutes lets a 60-minutes-out interview move', async () => {
    h.cutoffMin = 30;
    h.booking = makeBooking('interview-link', 60);
    const list = await post({ token: TOKEN });
    expect(list.status).toBe(200);
    const move = await post({ token: TOKEN, start: minutesFromNow(3000) });
    expect(move.status).toBe(200);
    expect(h.rescheduleBooking).toHaveBeenCalledTimes(1);
  });
});

describe('reschedule route — ordinary meetings are untouched', () => {
  for (const source of ['meet-page', 'direct', 'host-direct']) {
    it(`source '${source}' 90 minutes out is NOT refused, and the policy is never read`, async () => {
      h.booking = makeBooking(source, 90);
      const list = await post({ token: TOKEN });
      expect(list.status).toBe(200);
      const move = await post({ token: TOKEN, start: minutesFromNow(3000) });
      expect(move.status).toBe(200);
      expect(h.rescheduleBooking).toHaveBeenCalledTimes(1);
      expect(h.getChangeCutoffMin).not.toHaveBeenCalled();
    });
  }
});

describe('reschedule route — token gate first', () => {
  it('a wrong token on an interview inside the window gets the same 404 and reveals nothing', async () => {
    h.booking = makeBooking('interview-link', 90);
    const res = await post({ token: 'wrong' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Invalid link' });
    expect(h.getChangeCutoffMin).not.toHaveBeenCalled();
  });

  it('an unknown uid gets the same 404', async () => {
    h.booking = null;
    const res = await post({ token: TOKEN, start: minutesFromNow(3000) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Invalid link' });
  });
});

describe('reschedule page', () => {
  it('interview inside the window opens as too-close with the office message', async () => {
    h.booking = makeBooking('interview-link', 90);
    const props = await pageState(TOKEN);
    expect(props.initialState).toBe('too-close');
    expect(props.tooCloseMessage).toBe(CHANGE_CUTOFF_MESSAGE);
  });

  it('interview 3 hours out opens the picker', async () => {
    h.booking = makeBooking('interview-link', 180);
    expect((await pageState(TOKEN)).initialState).toBe('pick');
  });

  it('ordinary meeting 90 minutes out opens the picker', async () => {
    h.booking = makeBooking('meet-page', 90);
    expect((await pageState(TOKEN)).initialState).toBe('pick');
    expect(h.getChangeCutoffMin).not.toHaveBeenCalled();
  });

  it('wrong token is invalid, shows no booking detail, and never reads the cutoff', async () => {
    h.booking = makeBooking('interview-link', 90);
    const props = await pageState('wrong');
    expect(props.initialState).toBe('invalid');
    expect(props.meetingTitle).toBe('');
    expect(h.getChangeCutoffMin).not.toHaveBeenCalled();
  });
});
