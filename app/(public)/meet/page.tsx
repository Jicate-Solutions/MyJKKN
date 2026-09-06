// app/(public)/meet/page.tsx
//
// PUBLIC directory — "Book a meeting at JKKN" (Universal Booking U4, D3/D6/D7).
//
// Two kinds of cards:
//   * People — Learning Facilitators / staff who opted in (D1) and pass the D20
//     gate (active Google connection). Card shows name + designation +
//     department + college + headline ONLY (D6 — no contact data).
//   * College funnels — the routed admission lines (engineering-admission …)
//     so counselors stay behind least-loaded routing (D7 composition).
//
// Server component, service-role read via PublicHostService (the single D20
// gatekeeper). Pattern: app/(public)/book/[slug]/page.tsx aesthetic
// (evergreen + cream, DM Serif headlines).

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { PublicHostService } from '@/lib/services/meetings/public-host-service';
import { BookingTrackingScripts } from '@/lib/services/analytics/booking-pixel-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Book a meeting · JKKN',
  description:
    'Book a meeting with Learning Facilitators and staff across JKKN Institutions.',
};

export default async function MeetDirectoryPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { people, funnels } = await PublicHostService.listDirectory(supabase);

  // Group people by college for scannability.
  const byInstitution = new Map<string, typeof people>();
  for (const p of people) {
    const key = p.institutionName ?? 'JKKN Institutions';
    const list = byInstitution.get(key) ?? [];
    list.push(p);
    byInstitution.set(key, list);
  }

  return (
    <div
      className="min-h-screen bg-[#FAF7F0] text-[#1C2B24]"
      style={{ fontFamily: 'var(--font-ibm-plex-sans), sans-serif' }}
    >
      {/* GA4 + Meta Pixel base scripts — env-gated, self-disables when ids unset. */}
      <BookingTrackingScripts />
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
            Book a meeting
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[#1C2B24]/65">
            Talk to our people directly — pick a person or an admission line,
            choose a time that works for you, and you&apos;re booked.
          </p>
        </header>

        {/* ── Admission funnels (counselor pool, least-loaded routing) ──── */}
        {funnels.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#0E4D34]/70">
              Admission counseling
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {funnels.map((f) => (
                <Link
                  key={f.slug}
                  href={`/book/${f.slug}`}
                  className="group rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-3.5 transition-colors hover:border-[#0E4D34]/50"
                >
                  <p className="text-sm font-semibold group-hover:text-[#0E4D34]">
                    {f.displayName}
                  </p>
                  <p className="mt-0.5 text-xs text-[#1C2B24]/60">
                    {f.institutionName ?? 'JKKN'} · next available counselor
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── People ─────────────────────────────────────────────────────── */}
        {people.length === 0 && funnels.length === 0 && (
          <div className="rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-6 text-sm text-[#1C2B24]/65">
            No booking pages are live yet. Please check back soon.
          </div>
        )}

        {[...byInstitution.entries()].map(([institution, hosts]) => (
          <section key={institution} className="mb-10">
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#0E4D34]/70">
              {institution}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {hosts.map((h) => (
                <Link
                  key={h.handle}
                  href={`/meet/${h.handle}`}
                  className="group flex items-start gap-3 rounded-lg border border-[#0E4D34]/20 bg-white px-4 py-3.5 transition-colors hover:border-[#0E4D34]/50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- external avatar URLs, plain img keeps it simple */}
                  {h.avatarUrl ? (
                    <img
                      src={h.avatarUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0E4D34]/10 text-sm font-semibold text-[#0E4D34]"
                    >
                      {h.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold group-hover:text-[#0E4D34]">
                      {h.name}
                    </p>
                    <p className="truncate text-xs text-[#1C2B24]/60">
                      {[h.designation, h.departmentName].filter(Boolean).join(' · ') ||
                        'JKKN Staff'}
                    </p>
                    {h.headline && (
                      <p className="mt-1 line-clamp-2 text-xs text-[#1C2B24]/70">
                        {h.headline}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
