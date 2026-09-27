// app/(public)/book-interview/page.tsx
//
// PUBLIC — the one shared interview booking link (#3). A candidate books a
// hiring conversation themselves, or a member of staff books one for them (#1).
// The form asks the post up front (#2), so the booking, the candidate and the
// interview row are written together instead of joined by hand afterwards.
//
// Being in the (public) route group is NOT what makes this reachable: the
// '/book-interview' entry in proxy.ts's allowlist is.
//
// Whose calendar interviews land in is a policy setting (#12), resolved here
// and again on every API call. When the setting is missing or that page is not
// bookable, the link says so calmly — not a 404, and not an error: the office
// may simply not have switched it on yet.

import type { Metadata } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  listInterviewPosts,
  resolveInterviewHost,
  type InterviewPost,
} from '@/lib/services/hr/interview-booking-service';
import {
  getSignedInUserId,
  loadActiveStaffBooker,
} from '@/app/api/public/interview-booking/book/active-staff';
import {
  InterviewBookingForm,
  type InterviewBookingViewer,
} from './_components/interview-booking-form';
import { BookingClosedNotice } from './_components/booking-closed-notice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Book an interview · JKKN',
  robots: { index: false },
};

/**
 * Who is looking. Staff book FOR a candidate (#1); anyone else signed in books
 * as themselves, which is what the book route does with their session. null =
 * an anonymous visitor.
 */
// Same rule as the book route's EMAIL_RE.
const USABLE_EMAIL = /^[^\s@*%]+@[^\s@*%]+\.[^\s@*%]+$/;

/**
 * A signed-in account with no usable email cannot book as itself: the form
 * hides the email box for a signed-in person, and the book route would refuse
 * the empty address — a dead end with no visible reason (review finding,
 * 2026-09-24). The page says so instead of showing a form that cannot submit.
 */
type PageViewer = InterviewBookingViewer | { kind: 'no_email' };

async function loadViewer(
  serviceDb: SupabaseClient,
): Promise<PageViewer | null> {
  const userId = await getSignedInUserId();
  if (!userId) return null;

  const officeBooker = await loadActiveStaffBooker(serviceDb, userId);
  if (officeBooker) return { kind: 'office', name: officeBooker.name };

  try {
    const ssr = await createServerClient();
    const { data: profile } = await ssr
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle();
    const email = ((profile?.email as string | undefined) ?? '').trim();
    if (!USABLE_EMAIL.test(email)) return { kind: 'no_email' };
    // `||`, not `??`: an EMPTY name must fall through to the email too.
    const name = ((profile?.full_name as string | undefined) ?? '').trim() || email;
    return { kind: 'self', name, email };
  } catch {
    return null;
  }
}

export default async function BookInterviewPage() {
  const serviceDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const interviewHost = await resolveInterviewHost(serviceDb);
  if (!interviewHost) {
    return (
      <BookingClosedNotice message="Interview booking is not open right now. Please contact the office." />
    );
  }

  let posts: InterviewPost[];
  try {
    posts = await listInterviewPosts(serviceDb);
  } catch (err) {
    console.error('[book-interview] listing posts failed', err);
    return (
      <BookingClosedNotice message="Interview booking is not open right now. Please contact the office." />
    );
  }
  if (posts.length === 0) {
    return <BookingClosedNotice message="No posts are open for interviews right now." />;
  }

  const viewer = await loadViewer(serviceDb);
  if (viewer?.kind === 'no_email') {
    return (
      <BookingClosedNotice message="Your MyJKKN account has no email address on it, so this form cannot book for you while you are signed in. Sign out and book as a guest, or ask the office to add your email to your profile." />
    );
  }

  return (
    <InterviewBookingForm
      posts={posts}
      durationMin={interviewHost.meetingType.durationMin}
      locationMode={interviewHost.meetingType.locationMode}
      viewer={viewer}
    />
  );
}
