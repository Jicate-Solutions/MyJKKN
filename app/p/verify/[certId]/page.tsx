// app/p/verify/[certId]/page.tsx
// PUBLIC no-login certificate verification (Events Platform Promotion PR6, Director decision #6).
// Lives OUTSIDE the (routes) auth group, so no login is required. Reads ONLY the safe, server-gated
// fn_verify_event_certificate RPC (explicitly GRANTed to anon) via the anon client. The "winners-photo
// split" is enforced INSIDE that RPC — a participant's photo never reaches this page, so there is no
// client-side photo gate to bypass.
// Created: 2026-06-23 (Events Platform Promotion PR6).

import type { Metadata } from 'next';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import { Award, BadgeCheck, Calendar, MapPin, ShieldCheck, XCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface VerificationRow {
  valid: boolean;
  certificate_id: string | null;
  participant_name: string | null;
  award_tier: string | null;
  rank_overall: number | null;
  event_name: string | null;
  event_date: string | null;
  venue: string | null;
  category: string | null;
  finish_time: string | null;
  generated_at: string | null;
  photo_url: string | null;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Verify Certificate · JKKN',
    description: 'Verify the authenticity of a JKKN event certificate.',
    robots: { index: false, follow: false },
  };
}

async function loadVerification(certId: string): Promise<VerificationRow | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.rpc('fn_verify_event_certificate', {
    p_cert_id: certId,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as VerificationRow) ?? null;
}

const TIER_META: Record<string, { label: string; ring: string; text: string; bg: string }> = {
  gold: { label: 'Gold · 1st Place', ring: 'ring-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50' },
  silver: { label: 'Silver · 2nd Place', ring: 'ring-gray-400', text: 'text-gray-700', bg: 'bg-gray-50' },
  bronze: { label: 'Bronze · 3rd Place', ring: 'ring-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  participant: { label: 'Participant', ring: 'ring-emerald-300', text: 'text-emerald-700', bg: 'bg-emerald-50' },
};

function fmtDate(d: string | null): string {
  return d
    ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
}

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ certId: string }>;
}) {
  const { certId } = await params;
  const decoded = decodeURIComponent(certId);
  const result = await loadVerification(decoded);

  if (!result || !result.valid) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <XCircle className="mx-auto mb-3 h-12 w-12 text-red-400" />
        <h1 className="text-xl font-semibold">Certificate not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn&apos;t verify a certificate with ID{' '}
          <span className="font-mono">{decoded}</span>. It may be invalid or revoked.
        </p>
      </main>
    );
  }

  const tier = result.award_tier ?? 'participant';
  const meta = TIER_META[tier] ?? TIER_META.participant;
  const isWinner = tier === 'gold' || tier === 'silver' || tier === 'bronze';

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        {/* Verified banner */}
        <div className="flex items-center gap-2 bg-emerald-600 px-5 py-2.5 text-white">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-sm font-medium">Verified Certificate</span>
        </div>

        <div className="p-6 text-center">
          {/* Photo — present ONLY for winners (server-gated by the RPC) */}
          {isWinner && result.photo_url && (
            <div className={`mx-auto mb-4 h-24 w-24 overflow-hidden rounded-full ring-4 ${meta.ring}`}>
              <Image
                src={result.photo_url}
                alt={result.participant_name ?? 'Participant'}
                width={96}
                height={96}
                className="h-full w-full object-cover"
                unoptimized
              />
            </div>
          )}

          {/* Award tier badge */}
          <div
            className={`mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${meta.bg} ${meta.text}`}
          >
            <Award className="h-3.5 w-3.5" />
            {meta.label}
          </div>

          <h1 className="text-2xl font-bold leading-tight">{result.participant_name ?? '—'}</h1>

          {result.event_name && (
            <p className="mt-1 text-sm text-muted-foreground">{result.event_name}</p>
          )}

          {/* Meta rows */}
          <div className="mt-5 space-y-2 text-left text-sm">
            {result.category && (
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium">{result.category}</span>
              </div>
            )}
            {result.rank_overall != null && (
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">Overall Rank</span>
                <span className="font-medium tabular-nums">#{result.rank_overall}</span>
              </div>
            )}
            {result.finish_time && (
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">Finish Time</span>
                <span className="font-mono font-medium">{result.finish_time}</span>
              </div>
            )}
            {result.event_date && (
              <div className="flex items-center justify-between border-b pb-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> Date
                </span>
                <span className="font-medium">{fmtDate(result.event_date)}</span>
              </div>
            )}
            {result.venue && (
              <div className="flex items-center justify-between border-b pb-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> Venue
                </span>
                <span className="font-medium">{result.venue}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1 text-muted-foreground">
                <BadgeCheck className="h-3.5 w-3.5" /> Certificate ID
              </span>
              <span className="font-mono text-xs">{result.certificate_id}</span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        JKKN Institutions · Issued {fmtDate(result.generated_at)}
      </p>
    </main>
  );
}
