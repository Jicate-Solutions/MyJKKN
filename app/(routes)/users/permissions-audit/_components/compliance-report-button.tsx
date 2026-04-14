'use client';

// app/(routes)/users/permissions-audit/_components/compliance-report-button.tsx
// ============================================================================
// Dashboard header button that downloads the Permissions Compliance Report
// PDF. Super-admin only (visibility is already gated by the parent
// dashboard's auth check; this also re-guards with aria + state).
//
// The fetch uses an AbortController with a 30s timeout because the PDF
// generation does one aggregate DB sweep + react-pdf render — usually <3s,
// but we allow headroom (Vercel cap is 10s for edge, 60s for node).
// ============================================================================

import { useState } from 'react';
import { Download, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ComplianceReportButton() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(
        `/api/users/permissions-audit/compliance-report?_t=${Date.now()}`,
        {
          method: 'GET',
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        let msg = 'Failed to generate compliance report';
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          // Non-JSON error — keep the generic message
        }
        setError(msg);
        return;
      }

      // Extract filename from Content-Disposition if present
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ||
        `MyJKKN-Permissions-Compliance-${new Date().toISOString().slice(0, 10)}.pdf`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Free the blob URL after the browser has had a chance to read it.
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (err) {
      const msg =
        (err as any)?.name === 'AbortError'
          ? 'The report took too long to generate — Please try again.'
          : err instanceof Error
            ? err.message
            : 'Unexpected error generating the compliance report';
      console.error('[ComplianceReportButton] Download failed:', err);
      setError(msg);
    } finally {
      clearTimeout(timeoutId);
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={downloading}
        className="gap-2"
        aria-label="Download compliance report as PDF"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FileText className="h-4 w-4" aria-hidden />
        )}
        <span className="hidden sm:inline">
          {downloading ? 'Generating PDF…' : 'Download Compliance Report'}
        </span>
        <span className="sm:hidden">
          {downloading ? 'Generating…' : 'Report'}
        </span>
        {!downloading && <Download className="h-3.5 w-3.5 opacity-60" aria-hidden />}
      </Button>
      {error && (
        <span
          className="text-xs text-red-600 max-w-[260px] text-right"
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}
