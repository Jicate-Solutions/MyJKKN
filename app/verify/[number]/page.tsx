'use client';

/**
 * Public Certificate Verification Page — PDE Phase 1
 * NO AUTH REQUIRED — anyone scanning the QR code can verify.
 * Lives outside (routes) to bypass AdminPanelLayout.
 */

import { use, useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Award,
  GraduationCap,
  Loader2,
  Calendar,
  Target,
  Clock,
} from 'lucide-react';

// ── Types for API response ───────────────────────────────────────────────────

interface CertificateData {
  certificate_number: string;
  certificate_type: string;
  issued_at: string;
  final_score: number | null;
  completion_hours: number | null;
  learner_name?: string;
  course_name?: string;
  finks_profile?: Record<string, number> | null;
  capabilities_demonstrated?: string[] | null;
}

interface VerificationResult {
  valid: boolean;
  data?: CertificateData;
  error?: string;
}

// ── Main Page ────────────────────────────────────────────────────────────────

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
        const res = await fetch(`/api/pde/certificates/verify/${encodeURIComponent(certNumber)}`);
        if (!res.ok) {
          if (res.status === 404) {
            setResult({ valid: false });
          } else {
            throw new Error(`Verification failed: ${res.status}`);
          }
        } else {
          const data = await res.json();
          setResult(data);
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

  const issuedDate = result?.data?.issued_at
    ? new Date(result.data.issued_at).toLocaleDateString('en-IN', {
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
              <p className="text-gray-600">Verifying certificate...</p>
              <p className="text-xs text-gray-400 mt-1 font-mono">{certNumber}</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-red-700">Verification Error</h2>
              <p className="text-sm text-gray-500 mt-2">{error}</p>
            </div>
          ) : result && !result.valid ? (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
              <XCircle className="h-14 w-14 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-red-700">Certificate NOT FOUND</h2>
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
          ) : result?.valid && result.data ? (
            <div className="bg-white rounded-xl shadow-sm border border-[#0b6d41]/20 overflow-hidden">
              {/* Valid Banner */}
              <div className="bg-[#0b6d41] px-6 py-4 flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-white" />
                <div>
                  <h2 className="text-lg font-bold text-white">Certificate VALID</h2>
                  <p className="text-xs text-white/70">Issued by JKKN Institutions</p>
                </div>
              </div>

              {/* Details */}
              <div className="p-6 space-y-5">
                {/* Learner */}
                {result.data.learner_name && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Learner</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {result.data.learner_name}
                    </p>
                  </div>
                )}

                {/* Course */}
                {result.data.course_name && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Course</p>
                    <p className="text-base font-medium text-[#0b6d41]">
                      {result.data.course_name}
                    </p>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {issuedDate && (
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-400">Issued</p>
                        <p className="text-sm font-medium">{issuedDate}</p>
                      </div>
                    </div>
                  )}
                  {result.data.final_score != null && (
                    <div className="flex items-start gap-2">
                      <Target className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-400">Score</p>
                        <p className="text-sm font-medium">{result.data.final_score}%</p>
                      </div>
                    </div>
                  )}
                  {result.data.completion_hours != null && (
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-400">Duration</p>
                        <p className="text-sm font-medium">{result.data.completion_hours} hours</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Award className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-400">Type</p>
                      <p className="text-sm font-medium capitalize">
                        {result.data.certificate_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Certificate number */}
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-400 mb-1">Certificate Number</p>
                  <p className="text-xs font-mono font-medium text-gray-700">
                    {result.data.certificate_number}
                  </p>
                </div>

                {/* Verification timestamp */}
                <p className="text-xs text-gray-400 text-center pt-2">
                  Verified on {verifiedAt}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#0b6d41]/10 px-4 py-3 text-center">
        <p className="text-xs text-gray-400">
          <span className="text-[#0b6d41] font-semibold">JKKN Institutions</span>
          {' '}&mdash; India&apos;s First Human-AI AGI Collab Campus
        </p>
      </footer>
    </div>
  );
}
