// app/(public)/events-at-jkkn/page.tsx
//
// PUBLIC events listing — the page that answers "what is on at JKKN?" for
// somebody who was never sent a link.
//
// WHAT IT LISTS (Director's ruling, 2026-09-13). Only events whose
// `visibility` column says `public`. Two of the 21 anon-readable events qualify
// today; the other 19 are `institution` or `all_jkkn` audiences that happen to
// sit behind an anon-readable policy. So this page is nearly empty, on purpose:
// "public" has to mean somebody chose it. The empty and near-empty states below
// are written for a real visitor who finds nothing open — they say so plainly
// and never suggest the page is broken.
//
// WHY IT EXISTS. Every public event was reachable only by a member of staff
// pasting a UUID: nothing linked to /p/event/[id]/register from anywhere. This
// is the index that was missing. It opens no new door — every card points at a
// registration page that was already public, and only when that page will
// actually accept somebody (see the service's door check).
//
// WHY NOT '/events'. app/(routes)/events is the authenticated module and owns
// that path; two pages resolving to /events is a build error, not a choice. The
// same trap is documented against '/course/' and '/learn/' in proxy.ts. The name
// here is spelled out instead, which is also what a visitor searches for.
//
// REACHABLE ONLY BECAUSE proxy.ts ALLOW-LISTS IT. Being inside the (public)
// route group is not what makes a page reachable — PUBLIC_PATHS_SET is, and
// '/verify/' and '/r/' each shipped 307ing to login by omitting it. '/programmes'
// carries that warning in proxy.ts; this entry sits beside it.
//
// FOUND, NOT JUST BUILT. app/sitemap.ts lists this path explicitly (the route
// manifest it derives from walks app/(routes) only, so no (public) page is in
// sitemap.xml unless it is named there), and the sign-in page links to it,
// because '/' sends a logged-out visitor to /auth/login and that is where a
// person who is not part of JKKN yet actually lands.
//
// Server component, revalidated every 5 minutes. The listing read runs with the
// ANON key — the reason `events_public_read` stays a live database-side gate
// rather than a decoration. No login, no session, no cookies.
//
// Pattern + aesthetic: app/(public)/programmes/page.tsx (evergreen on cream,
// DM Serif headlines, cards that show only what is safe to show).

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { PublicEventsService, type PublicEvent } from '@/lib/services/events/public-events-service';

/**
 * Five minutes of cache, rather than force-dynamic.
 *
 * This route takes no session and no search params: every anonymous visitor
 * gets byte-identical HTML, so a database round trip per hit bought nothing and
 * handed anybody with a URL a way to make the database work. An events listing
 * that is five minutes stale is not wrong; a public page that re-queries on
 * every crawl is.
 */
export const revalidate = 300;

const TITLE = 'Events at JKKN';
const DESCRIPTION =
  'Events at JKKN Institutions that anyone may attend — what is coming up, where it is, and how to register.';

// Indexing is ALLOWED here, as it is on the public course landing page and for
// the same reason. A registration link is a working surface that happens to need
// no login and stays noindex; this page is a destination, and being findable is
// the entire point of building it.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/events-at-jkkn' },
  openGraph: {
    type: 'website',
    siteName: 'MyJKKN',
    title: TITLE,
    description: DESCRIPTION,
    url: '/events-at-jkkn',
    images: [{ url: '/icons/icon-512x512.png', width: 512, height: 512, alt: 'JKKN Institutions' }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/icons/icon-512x512.png'],
  },
};

/**
 * Read the listing, or return an empty one.
 *
 * A missing or rotated key must not throw inside the server component — that
 * would hand an anonymous visitor a 500 instead of the page. Every failure path
 * lands on the same empty listing the service already fails closed to.
 *
 * Two clients, two jobs. The ANON client reads what is listed, so RLS decides
 * that and not this file. The service-role client answers one question and
 * renders nothing of its own: "may this event take a registration right now?"
 * — asked of tables anon cannot read, and answered with a set of ids. Without
 * it no card offers a button, which is the honest outcome when the answer is
 * unknown.
 */
async function loadEvents(): Promise<PublicEvent[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    console.error('[public-events] Supabase URL or anon key is not configured — rendering an empty listing.');
    return [];
  }

  try {
    const anon = createClient(url, anonKey);
    const admin = serviceKey ? createClient(url, serviceKey) : null;
    return await PublicEventsService.listPublic(anon, admin);
  } catch (err) {
    console.error('[public-events] listing could not be loaded:', err instanceof Error ? err.message : err);
    return [];
  }
}

function EventCard({ event }: { event: PublicEvent }) {
  return (
    <article className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-4">
      <h3 className="text-sm font-semibold leading-snug text-[#1C2B24]">{event.name}</h3>

      {event.summary && (
        <p className="mt-1.5 text-xs leading-relaxed text-[#1C2B24]/70">{event.summary}</p>
      )}

      {event.isOnNow && (
        <p className="mt-2 inline-flex items-center rounded-full bg-[#0E4D34]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0E4D34]">
          Happening now
        </p>
      )}

      <dl className="mt-3 space-y-1 text-xs text-[#1C2B24]/65">
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-semibold text-[#0E4D34]/70">When</dt>
          <dd>{event.whenLabel ?? 'Dates to be announced'}</dd>
        </div>
        {event.whereLabel && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-semibold text-[#0E4D34]/70">Where</dt>
            <dd>{event.whereLabel}</dd>
          </div>
        )}
      </dl>

      {event.registerHref ? (
        <Link
          href={event.registerHref}
          aria-label={`Register — ${event.name}`}
          className="mt-3 inline-flex items-center rounded-md bg-[#0E4D34] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Register
        </Link>
      ) : (
        // Full-strength ink, not a tint. This line carries the one caveat on the
        // card — when registration opens, or that it has closed — and it was the
        // least readable text on it at 50% opacity.
        event.registerNote && (
          <p className="mt-3 text-xs font-medium text-[#1C2B24]">{event.registerNote}</p>
        )
      )}
    </article>
  );
}

/**
 * Nothing is open. This is the ordinary state of this page, not an error: only
 * events somebody marked public appear here, and most of the time nobody has.
 * So it says that in plain words, offers the two things a visitor can actually
 * do, and never implies something is broken.
 */
function NothingOpen() {
  return (
    <section className="rounded-lg border border-[#0E4D34]/20 bg-white px-5 py-6">
      <h2
        className="text-lg text-[#0E4D34]"
        style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
      >
        Nothing is open to visitors right now
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#1C2B24]/80">
        JKKN runs events most weeks, and many of them are for our own learners and team members.
        This page lists only the ones anyone may attend — so it is often empty, and that is normal.
        When the next one is opened to visitors it appears here, with its dates, where to find it,
        and how to register.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[#1C2B24]/80">
        Worth checking back, or ask us directly what is coming.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/meet"
          className="inline-flex items-center rounded-md bg-[#0E4D34] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Talk to someone at JKKN
        </Link>
        <Link
          href="/programmes"
          className="inline-flex items-center rounded-md border border-[#0E4D34]/30 px-3.5 py-2 text-xs font-semibold text-[#0E4D34] transition-colors hover:bg-[#0E4D34]/5"
        >
          See the programmes on offer
        </Link>
      </div>
    </section>
  );
}

export default async function PublicEventsPage() {
  const events = await loadEvents();
  // The service already ordered these: what is on now or still to come first,
  // soonest first, then the archive newest first.
  const upcoming = events.filter((event) => !event.isPast);
  const past = events.filter((event) => event.isPast);

  return (
    <div
      className="min-h-screen bg-[#FAF7F0] text-[#1C2B24]"
      style={{ fontFamily: 'var(--font-ibm-plex-sans), sans-serif' }}
    >
      <div className="h-2 w-full bg-[#0E4D34]" />
      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-10">
        <header className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0E4D34]/70">
            JKKN Institutions
          </p>
          <h1
            className="mt-1 text-[2.2rem] leading-tight text-[#0E4D34]"
            style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
          >
            Events
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[#1C2B24]/80">
            Lectures, ceremonies, tournaments and cultural days at JKKN that are open to visitors —
            what is coming up, where it is, and how to register. Events held only for our own
            learners and team members are not listed here.
          </p>
        </header>

        {upcoming.length === 0 && past.length === 0 ? (
          <NothingOpen />
        ) : (
          <>
            <section className="mb-10">
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#0E4D34]/70">
                Coming up
              </h2>
              {upcoming.length === 0 ? (
                <p className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-4 text-sm leading-relaxed text-[#1C2B24]/80">
                  Nothing is open to visitors at the moment — that is normal, not a fault. What JKKN
                  has held recently is below, and the next one open to visitors will appear here.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcoming.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#0E4D34]/70">
                  Recently at JKKN
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {past.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </section>
            )}

            <p className="mt-2 text-xs text-[#1C2B24]/75">
              Looking for something longer than a day?{' '}
              <Link href="/programmes" className="font-semibold text-[#0E4D34] underline">
                See the programmes on offer
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
