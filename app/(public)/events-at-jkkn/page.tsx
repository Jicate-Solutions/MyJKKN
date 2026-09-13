// app/(public)/events-at-jkkn/page.tsx
//
// PUBLIC events listing — the page that answers "what is on at JKKN?" for
// somebody who was never sent a link.
//
// WHY IT EXISTS. Twenty-one events are already readable by a logged-out visitor
// and nothing linked to any of them: the only way to reach
// /p/event/[id]/register was for a member of staff to paste a UUID. This is the
// index that was missing. It opens no new door — every card points at a
// registration page that was already public.
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
// Server component. Reads through PublicEventsService with the ANON key — the
// single gatekeeper, and the reason `events_public_read` stays a live
// database-side gate instead of a decoration. No login, no session, no cookies,
// and no service-role credential on an unauthenticated route.
//
// Pattern + aesthetic: app/(public)/programmes/page.tsx (evergreen on cream,
// DM Serif headlines, cards that show only what is safe to show).

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { PublicEventsService, type PublicEvent } from '@/lib/services/events/public-events-service';

export const dynamic = 'force-dynamic';

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
 */
async function loadEvents(): Promise<PublicEvent[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('[public-events] Supabase URL or anon key is not configured — rendering an empty listing.');
    return [];
  }

  try {
    return await PublicEventsService.listPublic(createClient(url, anonKey));
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
        event.registerNote && <p className="mt-3 text-xs text-[#1C2B24]/50">{event.registerNote}</p>
      )}
    </article>
  );
}

export default async function PublicEventsPage() {
  const events = await loadEvents();
  // The service already ordered these: still to come first, soonest first, then
  // the archive newest first.
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
          <p className="mt-2 max-w-xl text-sm text-[#1C2B24]/65">
            Lectures, ceremonies, tournaments and cultural days across the JKKN campus — what is
            coming up, where it is, and how to register.
          </p>
        </header>

        {events.length === 0 ? (
          <section className="rounded-lg border border-[#0E4D34]/20 bg-white px-5 py-6">
            <h2
              className="text-lg text-[#0E4D34]"
              style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
            >
              Nothing is listed right now
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#1C2B24]/70">
              This is where every JKKN event open to visitors is announced. When one is published it
              appears here, with its dates, where to find it, and a way to register.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#1C2B24]/70">
              If you would rather not wait, book a short conversation with someone at JKKN and ask
              what is coming.
            </p>
            <Link
              href="/meet"
              className="mt-4 inline-flex items-center rounded-md bg-[#0E4D34] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              Talk to someone at JKKN
            </Link>
          </section>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#0E4D34]/70">
                Coming up
              </h2>
              {upcoming.length === 0 ? (
                <p className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-4 text-sm leading-relaxed text-[#1C2B24]/70">
                  Nothing is scheduled at the moment. What JKKN has held recently is below — the next
                  one will appear here as soon as it is published.
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
          </>
        )}

        <p className="mt-2 text-xs text-[#1C2B24]/60">
          Looking for something longer than a day?{' '}
          <Link href="/programmes" className="font-semibold text-[#0E4D34] underline">
            See the programmes on offer
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
