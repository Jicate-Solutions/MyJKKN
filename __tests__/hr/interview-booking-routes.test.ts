// The three public routes behind the shared interview booking link (#3):
//   /api/public/interview-booking/book, /slots and /callback.
//
// What these pin is ORDER: every refusal must come before createBooking, so a
// refused request never leaves a meeting in the Director's calendar (#12). And
// the one place staff differ (#1): no rate limit, and the candidate typed in is
// booked — never the staff member's own session.
//
// The service rules themselves are tested in interview-booking-service.test.ts;
// here they are mocked, and the route's branching is the subject.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  resolveInterviewHost: vi.fn(),
  getBookablePost: vi.fn(),
  resolveCandidateChoice: vi.fn(),
  recordInterviewBooking: vi.fn(),
  createCallbackRequest: vi.fn(),
  loadActiveStaffBooker: vi.fn(),
  createBooking: vi.fn(),
  listSlots: vi.fn(),
  identityResolve: vi.fn(),
  bookingRow: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/lib/services/meetings/public-host-service', () => ({ PublicHostService: {} }));
vi.mock('@/lib/services/hr/interview-booking-service', async (orig) => ({
  ...(await orig<typeof import('@/lib/services/hr/interview-booking-service')>()),
  resolveInterviewHost: (...a: unknown[]) => m.resolveInterviewHost(...a),
  getBookablePost: (...a: unknown[]) => m.getBookablePost(...a),
  resolveCandidateChoice: (...a: unknown[]) => m.resolveCandidateChoice(...a),
  recordInterviewBooking: (...a: unknown[]) => m.recordInterviewBooking(...a),
  createCallbackRequest: (...a: unknown[]) => m.createCallbackRequest(...a),
}));
vi.mock('@/app/api/public/interview-booking/book/active-staff', () => ({
  loadActiveStaffBooker: (...a: unknown[]) => m.loadActiveStaffBooker(...a),
  getSignedInUserId: async () => null,
}));
vi.mock('@/lib/services/meetings/native-scheduling-service', () => ({
  NativeSchedulingService: {
    createBooking: (...a: unknown[]) => m.createBooking(...a),
    listSlots: (...a: unknown[]) => m.listSlots(...a),
  },
}));
vi.mock('@/lib/services/meetings/booking-identity-service', () => ({
  BookingIdentityService: { resolve: (...a: unknown[]) => m.identityResolve(...a) },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => m.bookingRow;
    return chain;
  },
}));

import { POST as book } from '@/app/api/public/interview-booking/book/route';
import { POST as slots } from '@/app/api/public/interview-booking/slots/route';
import { POST as callback } from '@/app/api/public/interview-booking/callback/route';
import {
  INTERVIEW_LINK_SOURCE,
  INTERVIEW_LINK_STAFF_SOURCE,
} from '@/lib/services/hr/interview-booking-service';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const HOST = {
  host: { hostProfileId: 'host-1', name: 'The Director', handle: 'director', meetingTypes: [] },
  meetingType: { id: 'mt-1', slug: 'interview', title: 'Interview', durationMin: 30, locationMode: 'online' },
};
const POST_ROW = {
  id: JOB_ID,
  title: 'Accountant',
  role_category: 'non_teaching',
  institution_id: 'inst-1',
  hr_organization_id: 'org-1',
  status: 'open',
};
const OFFICE_BOOKER = { profileId: 'staff-9', name: 'Office Person' };
const FUTURE = new Date(Date.now() + 3 * 86_400_000).toISOString();

let ipSeq = 0;
function req(url: string, body: unknown, ip = `10.1.0.${++ipSeq}`) {
  return new Request(`https://jkkn.ai${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  }) as never;
}
const bookReq = (body: Record<string, unknown>, ip?: string) =>
  req('/api/public/interview-booking/book', body, ip);

const VALID = {
  jobId: JOB_ID,
  start: FUTURE,
  name: 'Priya R',
  email: 'priya@example.com',
  phone: '9876543210',
  currentJob: 'Accounts assistant, Erode',
  payExpectation: '₹45,000 a month',
  whyThisRole: 'I want to grow into institutional finance work.',
};

beforeEach(() => {
  for (const fn of Object.values(m)) if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset();
  m.resolveInterviewHost.mockResolvedValue(HOST);
  m.getBookablePost.mockResolvedValue(POST_ROW);
  m.resolveCandidateChoice.mockResolvedValue({ ok: true, choice: { kind: 'new' } });
  m.recordInterviewBooking.mockResolvedValue({
    success: true, candidateId: 'c-1', interviewId: 'i-1', round: 1, createdCandidate: true,
  });
  m.createCallbackRequest.mockResolvedValue({ success: true, id: 'cb-1' });
  m.loadActiveStaffBooker.mockResolvedValue(null);
  m.identityResolve.mockResolvedValue({ kind: 'guest' });
  m.createBooking.mockResolvedValue({
    success: true, uid: 'uid-1', start: FUTURE, end: FUTURE, hostName: 'The Director', venueStatus: null,
  });
  m.bookingRow = {
    data: { id: 'bk-1', end_time: FUTURE, video_url: 'https://meet.google.com/abc-defg-hij' },
    error: null,
  };
});

describe('book — nothing is booked on a refusal', () => {
  it('a honeypot hit answers success and writes nothing', async () => {
    const res = await book(bookReq({ ...VALID, honeypot: 'http://spam' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, uid: null });
    expect(m.createBooking).not.toHaveBeenCalled();
    expect(m.recordInterviewBooking).not.toHaveBeenCalled();
    expect(m.resolveCandidateChoice).not.toHaveBeenCalled();
  });

  it('needs_choice (#7) returns the server labels and books nothing', async () => {
    const matches = [{ id: 'c-7', label: 'P. — applied for Accountant' }];
    m.resolveCandidateChoice.mockResolvedValue({ ok: false, reason: 'needs_choice', matches });
    const res = await book(bookReq(VALID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'needs_choice', matches });
    expect(m.createBooking).not.toHaveBeenCalled();
  });

  it('invalid_choice books nothing', async () => {
    m.resolveCandidateChoice.mockResolvedValue({ ok: false, reason: 'invalid_choice' });
    const res = await book(
      bookReq({ ...VALID, candidateChoice: { kind: 'existing', candidateId: 'someone-else' } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_choice');
    expect(m.resolveCandidateChoice).toHaveBeenCalledWith(expect.anything(), 'priya@example.com', {
      kind: 'existing',
      candidateId: 'someone-else',
    });
    expect(m.createBooking).not.toHaveBeenCalled();
  });

  it('a closed post answers post_closed and books nothing', async () => {
    m.getBookablePost.mockResolvedValue(null);
    const res = await book(bookReq(VALID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('post_closed');
    expect(m.identityResolve).not.toHaveBeenCalled();
    expect(m.createBooking).not.toHaveBeenCalled();
  });

  it('login_required answers 403 with a sign-in link back here and books nothing', async () => {
    m.identityResolve.mockResolvedValue({ kind: 'login_required', reason: 'account_exists' });
    const res = await book(bookReq(VALID));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'login_required',
      reason: 'account_exists',
      loginUrl: '/auth/login?redirectedFrom=%2Fbook-interview',
    });
    expect(m.resolveCandidateChoice).not.toHaveBeenCalled();
    expect(m.createBooking).not.toHaveBeenCalled();
  });

  it('the link not being open answers not_open and books nothing', async () => {
    m.resolveInterviewHost.mockResolvedValue(null);
    const res = await book(bookReq(VALID));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_open');
    expect(m.createBooking).not.toHaveBeenCalled();
  });

  it('refuses a why-this-role under 20 characters (after trimming) and books nothing', async () => {
    const res = await book(bookReq({ ...VALID, whyThisRole: '   too short          ' }));
    expect(res.status).toBe(400);
    expect(m.createBooking).not.toHaveBeenCalled();
  });

  it('refuses a missing phone and a non-uuid post', async () => {
    expect((await book(bookReq({ ...VALID, phone: '  ' }))).status).toBe(400);
    expect((await book(bookReq({ ...VALID, jobId: 'abc' }))).status).toBe(400);
    expect(m.createBooking).not.toHaveBeenCalled();
  });
});

describe('book — who is booked, and on whose behalf', () => {
  it('a guest books with the link source, the typed details, and the host as creator', async () => {
    const res = await book(bookReq(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      uid: 'uid-1',
      start: FUTURE,
      hostName: 'The Director',
      videoUrl: 'https://meet.google.com/abc-defg-hij',
    });
    const input = m.createBooking.mock.calls[0][1];
    expect(input).toMatchObject({
      meetingTypeId: 'mt-1',
      start: FUTURE,
      attendeeName: 'Priya R',
      attendeeEmail: 'priya@example.com',
      attendeePhone: '9876543210',
      attendeeProfileId: null,
      source: INTERVIEW_LINK_SOURCE,
    });
    // answers.note feeds the Google Calendar title and body.
    expect(input.answers).toEqual({
      note: 'Interview — Accountant',
      post: 'Accountant',
      current_job: 'Accounts assistant, Erode',
      pay_expectation: '₹45,000 a month',
      why_this_role: 'I want to grow into institutional finance work.',
    });
    const recorded = m.recordInterviewBooking.mock.calls[0][1];
    expect(recorded).toMatchObject({
      booking: { id: 'bk-1', start: FUTURE, end: FUTURE, videoUrl: 'https://meet.google.com/abc-defg-hij' },
      hostProfileId: 'host-1',
      createdBy: 'host-1',
      person: { name: 'Priya R', email: 'priya@example.com', phone: '9876543210' },
      choice: { kind: 'new' },
    });
  });

  it('a signed-in non-staff booker is booked as their account, and asked about THAT email', async () => {
    m.identityResolve.mockResolvedValue({
      kind: 'authenticated', profileId: 'p-5', name: 'Account Name', email: 'account@example.com',
    });
    await book(bookReq(VALID));
    expect(m.resolveCandidateChoice.mock.calls[0][1]).toBe('account@example.com');
    expect(m.createBooking.mock.calls[0][1]).toMatchObject({
      attendeeName: 'Account Name',
      attendeeEmail: 'account@example.com',
      attendeeProfileId: 'p-5',
      source: INTERVIEW_LINK_SOURCE,
    });
  });

  it('a team member booking for a candidate (#1): no rate limit, no identity lookup, the candidate is booked, the team member is creator', async () => {
    m.loadActiveStaffBooker.mockResolvedValue(OFFICE_BOOKER);
    const ip = '10.9.9.9';
    for (let i = 0; i < 8; i++) {
      const res = await book(bookReq(VALID, ip));
      expect(res.status).toBe(200);
    }
    expect(m.identityResolve).not.toHaveBeenCalled();
    expect(m.createBooking.mock.calls[0][1]).toMatchObject({
      attendeeName: 'Priya R',
      attendeeEmail: 'priya@example.com',
      attendeeProfileId: null,
      source: INTERVIEW_LINK_STAFF_SOURCE,
    });
    expect(m.recordInterviewBooking.mock.calls[0][1]).toMatchObject({
      hostProfileId: 'host-1',
      createdBy: 'staff-9',
    });
  });

  it('everyone else keeps the /meet limit: the sixth attempt in an hour from one IP is refused', async () => {
    const ip = '10.8.8.8';
    for (let i = 0; i < 5; i++) expect((await book(bookReq(VALID, ip))).status).toBe(200);
    const sixth = await book(bookReq(VALID, ip));
    expect(sixth.status).toBe(429);
    expect(m.createBooking).toHaveBeenCalledTimes(5);
  });
});

describe('book — after createBooking', () => {
  it('maps a taken slot to slot_taken', async () => {
    m.createBooking.mockResolvedValue({ success: false, error: 'SLOT_TAKEN' });
    const res = await book(bookReq(VALID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('slot_taken');
    expect(m.recordInterviewBooking).not.toHaveBeenCalled();
  });

  it('a failed interview record still answers success and logs the booking uid (#16)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.recordInterviewBooking.mockResolvedValue({ success: false, error: 'interview insert failed: x' });
    const res = await book(bookReq(VALID));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(log.mock.calls.some((c) => String(c[0]).includes('uid-1'))).toBe(true);
    log.mockRestore();
  });

  it('a THROWN record failure also still answers success', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.recordInterviewBooking.mockRejectedValue(new Error('boom'));
    const res = await book(bookReq(VALID));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(log.mock.calls.some((c) => String(c[0]).includes('uid-1'))).toBe(true);
    log.mockRestore();
  });
});

describe('slots', () => {
  it('answers not_open when the host setting resolves to nothing', async () => {
    m.resolveInterviewHost.mockResolvedValue(null);
    const res = await slots(req('/api/public/interview-booking/slots', {}));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_open');
    expect(m.listSlots).not.toHaveBeenCalled();
  });

  it('reads 14 days for the configured type and never asks for the host’s whole day', async () => {
    m.listSlots.mockResolvedValue({ days: { '2026-09-27': [{ start: FUTURE }] }, durationMin: 30, kind: 'solo' });
    const res = await slots(req('/api/public/interview-booking/slots', {}));
    expect(res.status).toBe(200);
    expect(m.listSlots).toHaveBeenCalledWith(expect.anything(), 'mt-1', { days: 14 });
    const json = await res.json();
    expect(json.days['2026-09-27']).toHaveLength(1);
    expect(json.meetingTypeId).toBe('mt-1');
  });
});

describe('callback (#14)', () => {
  const CB = { jobId: JOB_ID, name: 'Priya R', phone: '9876543210', email: 'priya@example.com' };

  it('refuses a closed post and writes nothing', async () => {
    m.getBookablePost.mockResolvedValue(null);
    const res = await callback(req('/api/public/interview-booking/callback', CB));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('post_closed');
    expect(m.createCallbackRequest).not.toHaveBeenCalled();
  });

  it('a honeypot hit writes nothing', async () => {
    const res = await callback(req('/api/public/interview-booking/callback', { ...CB, honeypot: 'x' }));
    expect(res.status).toBe(200);
    expect(m.createCallbackRequest).not.toHaveBeenCalled();
  });

  it('records the request against the post re-read from the server', async () => {
    const res = await callback(req('/api/public/interview-booking/callback', CB));
    expect(res.status).toBe(200);
    expect(m.createCallbackRequest).toHaveBeenCalledWith(expect.anything(), {
      post: { id: JOB_ID, title: 'Accountant', institution_id: 'inst-1' },
      name: 'Priya R',
      phone: '9876543210',
      email: 'priya@example.com',
    });
  });

  it('requires a phone number', async () => {
    const res = await callback(req('/api/public/interview-booking/callback', { ...CB, phone: '' }));
    expect(res.status).toBe(400);
    expect(m.createCallbackRequest).not.toHaveBeenCalled();
  });
});
