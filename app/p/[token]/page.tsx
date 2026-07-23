// app/p/[token]/page.tsx
//
// PUBLIC, no-login Wellness Program page (Health — PR4).
//
// A patient / visitor scans a QR → lands here → sees the program's daily
// awareness content. There is NO auth wrapper and NO health-consent gate: the
// unguessable public_token is the only key, and nothing personal is shown or
// collected. Only non-sensitive program + day fields are read (service role,
// since health_programs has no anon RLS policy by design).
//
// A small client component (ViewTracker) fires one fire-and-forget POST to the
// track API on mount so the visit is logged as an anonymous fact.
//
// Pattern: app/(public)/m/[token]/page.tsx — public, force-dynamic, robots
// noindex, service-role read scoped to a narrow column set, notFound() on miss.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { ViewTracker } from './_components/view-tracker';
import { toYouTubeEmbed } from '@/lib/health/youtube';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/;

interface ProgramDay {
  day_number: number;
  title: string;
  summary: string | null;
  video_url: string | null;
  publish_date: string | null;
}

interface ProgramRow {
  title: string;
  theme: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  days: ProgramDay[];
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Wellness Program · JKKN',
    description: 'Scan. Learn. Live. A short daily wellness awareness series.',
    robots: { index: false, follow: false },
  };
}

async function loadProgram(token: string): Promise<ProgramRow | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from('health_programs')
    .select(
      `title, theme, description, start_date, end_date, status,
       days:health_program_days (
         day_number, title, summary, video_url, publish_date
       )`,
    )
    .eq('public_token', token)
    .maybeSingle();

  if (error || !data) return null;

  const program = data as unknown as ProgramRow;

  // Archived programs stop serving (links are not forever).
  if (program.status === 'archived') return null;

  program.days = (program.days ?? []).sort((a, b) => a.day_number - b.day_number);
  return program;
}

function formatRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const s = new Date(start).toLocaleDateString('en-IN', opts);
  if (!end) return s;
  const e = new Date(end).toLocaleDateString('en-IN', opts);
  return `${s} – ${e}`;
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr.slice(0, 10) === today;
}

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicProgramPage({ params }: PageProps) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const program = await loadProgram(token);
  if (!program) notFound();

  const range = formatRange(program.start_date, program.end_date);

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white text-slate-900">
      <ViewTracker token={token} />

      {/* Header */}
      <header className="mx-auto max-w-2xl px-5 pt-10 pb-6 text-center">
        {program.theme && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-700">
            {program.theme}
          </p>
        )}
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
          {program.title}
        </h1>
        {range && (
          <p className="mt-2 text-sm text-slate-500">{range}</p>
        )}
        {program.description && (
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-600">
            {program.description}
          </p>
        )}
      </header>

      {/* Days */}
      <section className="mx-auto max-w-2xl px-5 pb-16">
        <ul className="space-y-5">
          {program.days.map((day) => {
            const embed = toYouTubeEmbed(day.video_url);
            const today = isToday(day.publish_date);
            return (
              <li
                key={day.day_number}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                  today ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 px-5 pt-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                    {day.day_number}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{day.title}</h2>
                    {today && (
                      <span className="text-xs font-medium text-emerald-700">Today</span>
                    )}
                  </div>
                </div>

                {day.summary && (
                  <p className="px-5 pt-2 text-sm leading-relaxed text-slate-600">
                    {day.summary}
                  </p>
                )}

                <div className="px-5 pb-5 pt-4">
                  {embed ? (
                    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                      <iframe
                        src={embed}
                        title={day.title}
                        className="h-full w-full"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : day.video_url ? (
                    <a
                      href={day.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Watch the video
                    </a>
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                      Coming soon
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-10 text-center text-xs text-slate-400">
          Scan. Learn. Live. · JKKN Institutions
        </p>
      </section>
    </main>
  );
}
