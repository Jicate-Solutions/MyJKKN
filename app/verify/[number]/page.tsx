'use client';

/**
 * Public Certificate Verification Page.
 * NO AUTH REQUIRED — anyone scanning the QR code or clicking the LinkedIn
 * "See credential" link can verify. Lives outside (routes) to bypass
 * AdminPanelLayout; allowlisted via proxy.ts PUBLIC_PATH_PREFIXES ('/verify/').
 *
 * Shows exactly three states from the unified verify API:
 *   valid     → green card, name + title + issue date (NO scores/grades)
 *   cancelled → grey card, "This certificate has been cancelled"
 *   not_found → neutral card
 * The public payload never includes scores, hours, competencies or any PII
 * beyond the learner's name (decision 2026-07-06).
 */

import { use, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Ban, GraduationCap, Loader2, Calendar } from 'lucide-react';
import { AddToLinkedInButton } from '@/components/linkedin/add-to-linkedin-button';

// ── Types (mirror lib/services/certificates/verify-resolver.ts) ──────────────

type VerifyStatus = 'valid' | 'cancelled' | 'not_found' | 'error';

interface PublicCertData {
  certificate_number: string;
  certificate_title: string;
  issued_at: string | null;
  learner_name: string | null;
  issuer: string;
}

interface VerificationResult {
  valid: boolean;
  status: VerifyStatus;
  data?: PublicCertData;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CertificateVerifyPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number: certNumber } = use(params);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/certificates/verify/${encodeURIComponent(certNumber)}`
        );
        if (res.status === 404) {
          setResult({ valid: false, status: 'not_found' });
        } else if (!res.ok) {
          throw new Error(`Verification failed: ${res.status}`);
        } else {
          setResult(await res.json());
        }
      } catch (err) {
        console.error('[verify] Certificate verification failed:', err);
        setError('Unable to verify certificate. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, [certNumber]);

  const data = result?.data;
  const issuedDate = data?.issued_at
    ? new Date(data.issued_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const verifiedAt = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isValid = result?.status === 'valid' && !!data;
  const isCancelled = result?.status === 'cancelled';

  return (
    <div className="min-h-screen bg-[#fbfbee] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#0b6d41]/10 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-[#0b6d41]" />
          <div>
            <h1 className="text-lg font-bold text-[#0b6d41]">JKKN Institutions</h1>
            <p className="text-xs text-gray-500">Certificate Verification Portal</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-[#0b6d41] mx-auto mb-4" />
              <p className="text-gray-600">Verifying certificate…</p>
              <p className="text-xs text-gray-400 mt-1 font-mono">{certNumber}</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-red-700">Verification Error</h2>
              <p className="text-sm text-gray-500 mt-2">{error}</p>
            </div>
          ) : isCancelled ? (
            /* ── Cancelled ─────────────────────────────────────────────── */
            <div className="bg-white rounded-xl shadow-sm border border-gray-300 overflow-hidden">
              <div className="bg-gray-600 px-6 py-4 flex items-center gap-3">
                <Ban className="h-8 w-8 text-white" />
                <div>
                  <h2 className="text-lg font-bold text-white">Certificate Cancelled</h2>
                  <p className="text-xs text-white/70">This credential is no longer valid</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">
                  This certificate has been cancelled by {data?.issuer || 'JKKN Institutions'} and
                  is no longer a valid credential. If you believe this is an error, please contact
                  the institution.
                </p>
                {data?.certificate_title && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Certificate</p>
                    <p className="text-base font-medium text-gray-700">{data.certificate_title}</p>
                  </div>
                )}
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-400 mb-1">Certificate Number</p>
                  <p className="text-xs font-mono font-medium text-gray-600">
                    {data?.certificate_number || certNumber}
                  </p>
                </div>
              </div>
            </div>
          ) : isValid && data ? (
            /* ── Valid ─────────────────────────────────────────────────── */
            <div className="bg-white rounded-xl shadow-sm border border-[#0b6d41]/20 overflow-hidden">
              <div className="bg-[#0b6d41] px-6 py-4 flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-white" />
                <div>
                  <h2 className="text-lg font-bold text-white">Certificate Valid</h2>
                  <p className="text-xs text-white/70">Verified by {data.issuer}</p>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Learner */}
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Awarded to</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {data.learner_name || 'Name unavailable'}
                  </p>
                </div>

                {/* Title */}
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Certificate</p>
                  <p className="text-base font-medium text-[#0b6d41]">{data.certificate_title}</p>
                </div>

                {/* Issue date */}
                {issuedDate && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-400">Issued</p>
                      <p className="text-sm font-medium">{issuedDate}</p>
                    </div>
                  </div>
                )}

                {/* Certificate number */}
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-400 mb-1">Certificate Number</p>
                  <p className="text-xs font-mono font-medium text-gray-700">
                    {data.certificate_number}
                  </p>
                </div>

                {/* Add to LinkedIn — pure URL, no API/OAuth */}
                <div className="pt-1">
                  <AddToLinkedInButton
                    className="w-full"
                    cert={{
                      name: data.certificate_title,
                      certId: data.certificate_number,
                      certUrl: `https://www.jkkn.ai/verify/${encodeURIComponent(
                        data.certificate_number
                      )}`,
                      issuedAt: data.issued_at,
                    }}
                  />
                  <p className="text-[11px] text-gray-400 text-center mt-1.5">
                    Showcase this credential on your LinkedIn profile
                  </p>
                </div>

                <p className="text-xs text-gray-400 text-center pt-2">Verified on {verifiedAt}</p>
              </div>
            </div>
          ) : (
            /* ── Not found ─────────────────────────────────────────────── */
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
              <XCircle className="h-14 w-14 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-red-700">Certificate Not Found</h2>
              <p className="text-sm text-gray-500 mt-2">
                No certificate matching this number was found in our records.
              </p>
              <div className="mt-4 bg-red-50 rounded-lg px-4 py-3">
                <p className="text-xs font-mono text-red-600">{certNumber}</p>
              </div>
              <p className="text-xs text-gray-400 mt-4">
                If you believe this is an error, please contact JKKN Institutions.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#0b6d41]/10 px-4 py-3 text-center">
        <p className="text-xs text-gray-400">
          <span className="text-[#0b6d41] font-semibold">JKKN Institutions</span>{' '}
          &mdash; India&apos;s First Human-AI AGI Collab Campus
        </p>
      </footer>
    </div>
  );
}
