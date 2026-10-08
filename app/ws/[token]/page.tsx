// app/ws/[token]/page.tsx
//
// PUBLIC, no-login Wellness Survey page. A visitor opens the shared link / QR,
// enters name + designation + institution + email, answers each scenario with
// an immediate review, and submits once (one submission per email, enforced
// server-side).
//
// Pattern: app/p/[token]/page.tsx — public, force-dynamic, robots noindex,
// service-role read of a narrow column set, notFound() on miss.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

import type { HealthSurvey } from '@/types/health-surveys';
import { SurveyHero } from '@/components/health/survey-banner';
import { PublicSurvey } from './_components/public-survey';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Wellness Survey · JKKN',
    description: 'A short JKKN Health & Wellness survey.',
    robots: { index: false, follow: false },
  };
}

type PublicSurveyRow = Pick<
  HealthSurvey,
  'title' | 'description' | 'status' | 'audience' | 'languages' | 'questions' | 'banner_url'
> & { program: { title: string } | null };

async function loadSurvey(token: string): Promise<PublicSurveyRow | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase
    .from('health_surveys')
    .select('title, description, status, audience, languages, questions, banner_url, program:health_programs(title)')
    .eq('public_token', token)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as PublicSurveyRow;
  // Drafts and surveys not opened to the public are never served.
  if (row.status === 'draft' || !row.audience.includes('public')) return null;
  return row;
}

export default async function PublicSurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  const survey = await loadSurvey(token);
  if (!survey) notFound();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbfa] to-[#eef4f3] px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-[850px] space-y-6">
        <SurveyHero
          bannerUrl={survey.banner_url}
          eyebrow={survey.program?.title !== survey.title ? survey.program?.title : null}
          title={survey.title}
          description={survey.description}
        />
        {survey.status === 'closed' ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            This survey is closed and no longer accepting responses. Thank you for your interest.
          </div>
        ) : (
          <PublicSurvey
            token={token}
            questions={survey.questions}
            languages={survey.languages}
          />
        )}
        <footer className="pb-4 text-center text-xs text-slate-400">JKKN · Health &amp; Wellness</footer>
      </div>
    </main>
  );
}
