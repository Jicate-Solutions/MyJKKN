// app/p/tournament/[id]/results/certificate/page.tsx
// PUBLIC no-login participation / winner CERTIFICATE for a tournament participant.
// Lives OUTSIDE the (routes) auth group — no login required. Reads ONLY the
// PII-safe fn_tournament_participant_results RPC (explicitly GRANTed to anon) via
// the anon client, keyed by the participant's 6-char access code (?code=). Ports
// the marathon certificate pattern. Learner terminology.
// Created: 2026-07-26 (Events/Tournament go-live, Section 3).

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { FileText } from 'lucide-react';
import CertificateView from './_components/certificate-view';
import type { ParticipantResults } from '../types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Tournament Certificate · JKKN',
    description: 'Your printable JKKN tournament certificate.',
    robots: { index: false, follow: false },
  };
}

async function loadResults(code: string): Promise<ParticipantResults | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as any;
  const { data, error } = await supabase.rpc('fn_tournament_participant_results', {
    p_code: code,
  });
  if (error || !data) return null;
  return data as ParticipantResults;
}

export default async function ParticipantCertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { id } = await params;
  const { code: codeParam } = await searchParams;
  const code = (codeParam ?? '').trim() || (UUID_RE.test(id) ? id : '');

  const data = code ? await loadResults(code) : null;

  if (!data) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Certificate not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn&apos;t find a tournament entry for that access code. Open the personal link from
          your registration confirmation, or check your 6-character code.
        </p>
      </main>
    );
  }

  return <CertificateView data={data} eventId={id} code={code} />;
}
