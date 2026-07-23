// app/(public)/proof/[token]/page.tsx
//
// PUBLIC verify-link page for a learner-shared Verified Skills Record.
// This is the record's whole argument against a PDF: the page RE-READS the
// record live at every open (fn_vsr_shared_record — SECURITY DEFINER,
// deliberately anon-granted, token-scoped). If the learner cuts the link off,
// or the college sharing dial goes off, the very next open goes dark.
//
// Explicit states (rule #27 — never a silent redirect):
//   * invalid / revoked / expired token → a clear "link not active" panel
//     (indistinguishable on purpose: we never confirm a token once existed).
//   * valid token → the live record; marks render ONLY when they passed the
//     exam-audit provenance check (publicView gate in MarksSection).
//
// Pattern: app/(public)/poll/[slug]/page.tsx (server load via service client).

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { BadgeCheck, ShieldOff } from 'lucide-react';
import {
  AttendanceSection,
  BRAND_GREEN,
  DurableSkillsSection,
  EngagementSection,
  MarksSection,
  RecordHeader,
  SelfClaimsSection,
} from '@/components/proof-record/record-sections';
import { buildProofMarksLayer } from '@/lib/services/proof-record/marks-layer';
import type { ProofMarksLayer, SharedProofRecord } from '@/types/proof-record';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verified Skills Record — JKKN',
  // A learner-shared record is for the people it was handed to, never for
  // search engines.
  robots: { index: false, follow: false },
};

interface VerifyPageProps {
  params: Promise<{ token: string }>;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function loadShared(token: string): Promise<{
  record: SharedProofRecord;
  marks: ProofMarksLayer;
} | null> {
  const supabase = serviceClient();
  const { data, error } = await supabase.rpc('fn_vsr_shared_record', { p_token: token });
  if (error) {
    console.error('[public/verify] load failed:', error.message);
    return null;
  }
  const record = (data ?? null) as SharedProofRecord | null;
  if (!record) return null;

  // Marks overlay needs the learner's internal id — resolved from the token
  // row server-side (the RPC already proved the token valid; this id never
  // reaches the client).
  let marks: ProofMarksLayer = { status: 'unavailable', program_verdict: null, sessions: [] };
  const { data: tokenRow } = await supabase
    .from('vsr_share_tokens')
    .select('learner_id')
    .eq('token', token)
    .maybeSingle();
  if (tokenRow?.learner_id && record.learner.register_number && record.learner.institution_id) {
    try {
      marks = await buildProofMarksLayer({
        learnerId: tokenRow.learner_id,
        registerNumber: record.learner.register_number,
        institutionId: record.learner.institution_id,
      });
    } catch (err) {
      console.error('[public/verify] marks overlay failed:', err);
    }
  }
  return { record, marks };
}

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { token } = await params;
  const loaded = await loadShared(token);

  if (!loaded) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldOff className="h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">This verify-link is not active</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The learner who owns this record controls who can see it. This link
          may have been cut off, may have expired, or may never have existed.
          If you were handed this link for hiring, ask the learner for a fresh
          one — links take seconds to issue.
        </p>
      </main>
    );
  }

  const { record, marks } = loaded;
  const openedAt = new Date();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Live-verification band — the reason this is a link and not a PDF. */}
      <div
        className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-sm text-white"
        style={{ backgroundColor: BRAND_GREEN }}
      >
        <BadgeCheck className="h-5 w-5 shrink-0" aria-hidden />
        <p className="font-semibold">Live record — re-read from JKKN&apos;s systems just now</p>
        <p className="basis-full text-xs text-white/85 sm:basis-auto sm:text-right sm:ml-auto">
          Opened {openedAt.toUTCString()} · served by jkkn.ai
        </p>
      </div>

      <div className="space-y-4">
        <RecordHeader learner={record.learner} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          This record was shared by the learner. Every line is backed by a
          timestamped record inside JKKN&apos;s platform, and this page shows
          the current state — not a snapshot. A printed or saved copy is not a
          JKKN record; only this live page is.
        </p>

        {record.attendance ? <AttendanceSection attendance={record.attendance} /> : null}
        {record.engagement ? <EngagementSection engagement={record.engagement} /> : null}
        <MarksSection marks={marks} publicView />
        <DurableSkillsSection />
        <SelfClaimsSection selfClaims={record.self_claims} />
      </div>

      <footer className="mt-8 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        Link issued {new Date(record.shared.issued_at).toLocaleDateString()} · valid until{' '}
        {new Date(record.shared.expires_at).toLocaleDateString()} unless the learner cuts it off
        earlier. Questions about this record? Contact the JKKN Career Development Centre.
      </footer>
    </main>
  );
}
