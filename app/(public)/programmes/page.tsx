// app/(public)/programmes/page.tsx
//
// PUBLIC catalogue — "Programmes at JKKN". Director decision 2026-08-13:
// "Build the page now, ready and waiting."
//
// Every other public door on this estate opens onto ONE thing you must already
// know the web address of — a booking page, an application form, an event
// registration link. This is the page that answers "what is on offer?" for
// somebody who has never been sent a link.
//
// Server component. Reads via PublicProgrammeService, the single gatekeeper
// deciding what is public (default closed — see that file). No login, no
// session, no cookies.
//
// It reads with the ANON key, NOT the service-role key. app/(public)/meet uses
// service-role because it resolves host data across tables anon cannot read;
// this page needs exactly the rows the anon RLS policy already exposes, so the
// weaker key keeps that policy a live database-side gate instead of a
// decoration, and keeps a service-role credential off an unauthenticated route.
//
// 🛑 IT SHIPS EMPTY AND THAT IS CORRECT. JKKN has no public programme today;
// the first one will be the forthcoming paid programme sold to companies.
// School of Influence is deliberately NOT here — it is for JKKN learners and
// senior learners only. So the empty state below is not an error path, it is
// the day-one state, and it is written to read as deliberate.
//
// Pattern + aesthetic: app/(public)/meet/page.tsx (evergreen on cream,
// DM Serif headlines, cards that show only what is safe to show).

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import {
  PublicProgrammeService,
  type PublicProgramme,
} from '@/lib/services/programmes/public-programme-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Programmes · JKKN',
  description:
    'Programmes at JKKN Institutions that are open to people outside the institution — what they are, who they are for, and how to apply.',
};

/** Renders the apply link as a Next link for in-app paths, a plain anchor otherwise. */
function ApplyLink({ href, name }: { href: string; name: string }) {
  const label = `Apply — ${name}`;
  const className =
    'mt-3 inline-flex items-center rounded-md bg-[#0E4D34] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90';

  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className} aria-label={label}>
        Apply
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label={label}
    >
      Apply
    </a>
  );
}

function ProgrammeCard({ programme }: { programme: PublicProgramme }) {
  return (
    <article className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-4">
      <h3 className="text-sm font-semibold text-[#1C2B24]">{programme.name}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[#1C2B24]/70">{programme.summary}</p>

      <dl className="mt-3 space-y-1 text-xs text-[#1C2B24]/65">
        <div className="flex gap-1.5">
          <dt className="font-semibold text-[#0E4D34]/70">Cost</dt>
          <dd>{programme.priceLabel}</dd>
        </div>
        {programme.dateLabel && (
          <div className="flex gap-1.5">
            <dt className="font-semibold text-[#0E4D34]/70">When</dt>
            <dd>{programme.dateLabel}</dd>
          </div>
        )}
      </dl>

      {programme.applyUrl ? (
        <ApplyLink href={programme.applyUrl} name={programme.name} />
      ) : (
        <p className="mt-3 text-xs text-[#1C2B24]/50">
          Applications are not open yet.
        </p>
      )}
    </article>
  );
}

/**
 * Read the catalogue, or return an empty one.
 *
 * A missing or rotated key must not throw inside the server component — that
 * would hand an anonymous visitor a 500 instead of the page. Every failure path
 * lands on the same empty catalogue the service already fails closed to.
 */
async function loadCatalogue(): Promise<PublicProgramme[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error(
      '[public-programmes] Supabase URL or anon key is not configured — rendering an empty catalogue.',
    );
    return [];
  }

  try {
    return await PublicProgrammeService.listPublished(createClient(url, anonKey));
  } catch (err) {
    console.error(
      '[public-programmes] catalogue could not be loaded:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export default async function PublicProgrammesPage() {
  const programmes = await loadCatalogue();

  // Group by who each one is for — the first question a reader is actually
  // asking. Order within a group is already set by the service.
  const byAudience = new Map<string, PublicProgramme[]>();
  for (const programme of programmes) {
    const list = byAudience.get(programme.audience) ?? [];
    list.push(programme);
    byAudience.set(programme.audience, list);
  }

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
            Programmes
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[#1C2B24]/65">
            Everything JKKN currently offers to people outside the institution —
            what it is, who it is for, what it costs, and how to apply.
          </p>
        </header>

        {programmes.length === 0 ? (
          <section className="rounded-lg border border-[#0E4D34]/20 bg-white px-5 py-6">
            <h2
              className="text-lg text-[#0E4D34]"
              style={{ fontFamily: 'var(--font-dm-serif-display), serif' }}
            >
              Nothing is open right now
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#1C2B24]/70">
              This is the page where every JKKN programme open to the public is
              announced. When one opens, it appears here first — with its dates,
              its cost, and a way to apply.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#1C2B24]/70">
              If you would rather not wait, book a short conversation with
              someone at JKKN and ask what is coming.
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
            {[...byAudience.entries()].map(([audience, list]) => (
              <section key={audience} className="mb-10">
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#0E4D34]/70">
                  {audience}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((programme) => (
                    <ProgrammeCard key={programme.id} programme={programme} />
                  ))}
                </div>
              </section>
            ))}

            <p className="mt-2 text-xs text-[#1C2B24]/60">
              Not sure which one fits?{' '}
              <Link href="/meet" className="font-semibold text-[#0E4D34] underline">
                Book a short conversation
              </Link>{' '}
              and ask.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
