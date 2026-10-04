// Director, 29 Sep 2026 (#32): opening /meet/<handle>/<interview slug> forwards
// to /book-interview (the candidate questions), even if the type was left
// visible; any other unknown type is still the generic 404.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const nav = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  permanentRedirect: vi.fn(),
}));
vi.mock('next/navigation', () => nav);
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/services/meetings/handle-redirect', () => ({ resolveRetiredHandle: vi.fn() }));
vi.mock('@/lib/services/analytics/booking-pixel-service', () => ({ BookingTrackingScripts: () => null }));
vi.mock('@/app/(public)/meet/[handle]/_components/meet-booking-widget', () => ({ MeetBookingWidget: () => null }));
const setting = vi.hoisted(() => ({ value: { handle: 'omm', type_slug: 'interview' } as unknown }));
vi.mock('@/lib/services/hr/interview-booking-service', () => ({
  readInterviewHostSetting: vi.fn(async () => setting.value),
}));
const host = vi.hoisted(() => ({
  value: { handle: 'omm', name: 'Host', meetingTypes: [{ slug: 'interview', title: 'Interview' }] } as unknown,
}));
vi.mock('@/lib/services/meetings/public-host-service', () => ({
  PublicHostService: { resolveBookableHost: vi.fn(async () => host.value) },
}));

import MeetTypePage from '@/app/(public)/meet/[handle]/[type]/page';

const open = (handle: string, type: string) =>
  MeetTypePage({ params: Promise.resolve({ handle, type }) } as never);

beforeEach(() => {
  setting.value = { handle: 'omm', type_slug: 'interview' };
});

describe('/meet/<handle>/<type> and the interview type', () => {
  it('forwards the interview type to /book-interview, even when it is visible', async () => {
    await expect(open('omm', 'Interview')).rejects.toThrow('REDIRECT /book-interview');
  });

  it('forwards when the type is hidden (not in the host list)', async () => {
    host.value = { handle: 'omm', name: 'Host', meetingTypes: [] };
    await expect(open('omm', 'interview')).rejects.toThrow('REDIRECT /book-interview');
  });

  it('another host with the same slug is not forwarded', async () => {
    host.value = { handle: 'someone', name: 'Other', meetingTypes: [] };
    await expect(open('someone', 'interview')).rejects.toThrow('NOT_FOUND');
  });

  it('no interview setting → an unknown type is still the generic 404', async () => {
    setting.value = null;
    host.value = { handle: 'omm', name: 'Host', meetingTypes: [] };
    await expect(open('omm', 'interview')).rejects.toThrow('NOT_FOUND');
  });
});
