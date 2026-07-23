'use client';

/**
 * QrLabelSheet — A4 printable QR label sheet, 24 labels per page (4 × 6 grid).
 *
 * Wave 1.5 PR-2 (HR adapter). Mounted by the resource detail page when the
 * `?print-label=1` query string is present so a director can hit "Print
 * sticker" and get a sheet of identical labels for one resource. Each label
 * carries the QR (encoded with qr_code_token), the resource code, and a
 * truncated resource name.
 *
 * Layout choices:
 *   - A4: 210 mm × 297 mm portrait, 10 mm margin all sides.
 *   - Usable area: 190 mm × 277 mm.
 *   - Cells: 4 columns × 6 rows = 24 labels. Each label is ~47 mm × ~46 mm.
 *   - Generic stationery (DIY scissors) compatible — no special label paper.
 *
 * The print-only CSS at the top of the component forces single-page output,
 * disables app chrome, and prevents page-breaks inside any label cell.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { qrCodeService } from '@/lib/services/resource-management/qr-code-service';

export interface QrLabelSheetProps {
  /** Opaque qr_code_token used as the QR payload. */
  token: string;
  /** Resource asset_code / resource_code printed under the QR. */
  resourceCode?: string | null;
  /** Resource display name; truncated to 32 chars to fit the label width. */
  resourceName: string;
  /** Number of identical labels to fill on the sheet. Defaults to 24 (full page). */
  copies?: number;
  /** Show a print button above the sheet. Defaults to true. */
  showPrintButton?: boolean;
}

const LABEL_COUNT_DEFAULT = 24; // 4 × 6 = full A4 page

const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

export function QrLabelSheet({
  token,
  resourceCode,
  resourceName,
  copies = LABEL_COUNT_DEFAULT,
  showPrintButton = true,
}: QrLabelSheetProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError('No QR token provided');
      return;
    }
    qrCodeService
      .renderQrPngDataUrlForToken(token)
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
          setError(null);
        }
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || 'Render failed');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const safeCount = Math.max(1, Math.min(copies, 24));
  const labels = Array.from({ length: safeCount });
  const displayName = truncate(resourceName, 32);

  return (
    <>
      {/* Print-mode CSS: scoped via the .qr-label-sheet-root container. */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body * {
            visibility: hidden;
          }
          .qr-label-sheet-root,
          .qr-label-sheet-root * {
            visibility: visible;
          }
          .qr-label-sheet-root {
            position: absolute;
            inset: 0;
            margin: 0;
            padding: 0;
          }
          .qr-label-sheet-print-button {
            display: none !important;
          }
          .qr-label-cell {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
        .qr-label-sheet-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(6, 1fr);
          gap: 2mm;
          width: 190mm;
          height: 277mm;
          margin: 0 auto;
        }
        .qr-label-cell {
          border: 1px dashed #d4d4d8;
          padding: 2mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1mm;
          background: white;
        }
        .qr-label-img {
          width: 32mm;
          height: 32mm;
          object-fit: contain;
        }
        .qr-label-code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 8pt;
          line-height: 1;
          color: #18181b;
        }
        .qr-label-name {
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          font-size: 7pt;
          line-height: 1.1;
          color: #52525b;
          text-align: center;
          max-width: 100%;
          word-break: break-word;
        }
      `}</style>

      {showPrintButton && (
        <div className="qr-label-sheet-print-button mb-4 flex justify-end">
          <Button
            onClick={() => window.print()}
            disabled={!qrDataUrl}
            data-testid="qr-label-print-btn"
          >
            <Printer className="mr-2 h-4 w-4" />
            Print sheet
          </Button>
        </div>
      )}

      <div
        className="qr-label-sheet-root bg-zinc-50 p-4"
        data-testid="qr-label-sheet"
      >
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : !qrDataUrl ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Rendering QR…
          </div>
        ) : (
          <div className="qr-label-sheet-grid">
            {labels.map((_, idx) => (
              <div
                key={idx}
                className="qr-label-cell"
                data-testid="qr-label-cell"
              >
                <img
                  src={qrDataUrl}
                  alt={`QR for ${displayName}`}
                  className="qr-label-img"
                />
                {resourceCode && (
                  <div className="qr-label-code">{resourceCode}</div>
                )}
                <div className="qr-label-name">{displayName}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
