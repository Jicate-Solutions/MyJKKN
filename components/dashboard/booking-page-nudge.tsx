import 'server-only';

/**
 * BookingPageNudge — dashboard adoption surface for the Universal Booking module.
 *
 * The meetings module is fully built but adoption ≈ 1 page (strategy memo
 * specs/meetings-leverage-strategy-2026-06-19.md: "The machine works; nobody is
 * on it. The problem is not capability. It is distribution."). This card is the
 * supply-side front door: it prompts a staff member to stand up their own
 * /meet/<handle> booking page, and disappears the moment they're fully live.
 *
 * Self-hiding, like LiveMorningBrief / CounselorStaffingAlert: a server
 * component that reads the viewer's own meeting_host_pages + Google-connection
 * state and returns null when there is nothing to nudge. Rendered un-gated by
 * widget-config (mirrors GuideAdoptionMount) — an adoption prompt that removes
 * itself needs no Director toggle.
 *
 * The native scheduling tables aren't in the generated types yet (TS2589 class,
 * see availability/actions.ts), so we read via the untyped-client cast the rest
 * of the module uses. RLS (mhp_host_* / connection host policies) scopes both
 * reads to the signed-in host, so this only ever sees the viewer's own rows.
 */

import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarPlus, ArrowRight, CalendarCheck, CalendarX2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

type NudgeState = 'none' | 'connect' | 'publish' | 'hidden';

interface NudgeCopy {
  Icon: typeof CalendarPlus;
  title: string;
  body: string;
  cta: string;
}

const COPY: Record<NudgeState, NudgeCopy> = {
  // No page row at all — the cold-start prompt.
  none: {
    Icon: CalendarPlus,
    title: 'Set up your booking page',
    body: 'Let people book time with you at jkkn.ai/meet — no more phone tag or WhatsApp threads. It takes about two minutes.',
    cta: 'Set up my page',
  },
  // Page exists but no active Google connection — the D20 gate keeps it private.
  connect: {
    Icon: CalendarPlus,
    title: 'Finish your booking page',
    body: 'Your page is ready. Connect your Google Calendar so it never offers a slot during a class or meeting — then go live.',
    cta: 'Connect Google & go live',
  },
  // Connected, but the host hasn't flipped the page public yet.
  publish: {
    Icon: CalendarCheck,
    title: 'Your booking page isn’t public yet',
    body: 'You’re all set up. Turn your page on so people can book you at jkkn.ai/meet.',
    cta: 'Make my page public',
  },
  // Auto-hidden (e.g. Google token broke) — needs the host to reconnect.
  hidden: {
    Icon: CalendarX2,
    title: 'Your booking page is hidden',
    body: 'Your Google connection needs attention. Reconnect it to make your page bookable again.',
    cta: 'Reconnect & restore',
  },
};

export async function BookingPageNudge() {
  const supabase = (await createClient()) as unknown as SupabaseClient;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Gate on capability, not dashboard persona: only staff who can host (the
  // meetings.view permission) ever see this. This is the host population —
  // it includes staff who collapse to the 'limited' persona (wardens, lab
  // staff, many faculty) and excludes students/parents/guests, regardless of
  // which dashboard they land on. super_admin bypasses the check (→ true).
  const { data: canHost } = await supabase.rpc('user_has_permission', {
    permission_name: 'meetings.view',
  });
  if (canHost !== true) return null;

  const [{ data: page }, { data: conn }] = await Promise.all([
    supabase
      .from('meeting_host_pages')
      .select('handle, is_public, auto_hidden')
      .eq('host_profile_id', user.id)
      .maybeSingle(),
    supabase
      .from('meeting_host_google_connections')
      .select('status')
      .eq('host_profile_id', user.id)
      .maybeSingle(),
  ]);

  const connectionActive = conn?.status === 'active';

  // Fully live — page exists, public, not hidden, Google connected. Nothing to nudge.
  if (page && page.is_public && !page.auto_hidden && connectionActive) {
    return null;
  }

  let state: NudgeState;
  if (!page) state = 'none';
  else if (page.auto_hidden) state = 'hidden';
  else if (!connectionActive) state = 'connect';
  else if (!page.is_public) state = 'publish';
  else return null; // defensive: covered by the live check above

  const { Icon, title, body, cta } = COPY[state];

  return (
    <Link
      href="/meetings/availability"
      data-dashboard-section="booking-page-nudge"
      className="group flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4 rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/80 to-white/40 dark:from-emerald-950/30 dark:to-neutral-900/40 backdrop-blur-sm p-5 transition-colors hover:border-emerald-300 dark:hover:border-emerald-800"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </p>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {body}
        </p>
      </div>
      <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
