'use client';

// QR code for a survey's public link — shown in the survey editor with a PNG
// download for posters / slides / WhatsApp. Pattern: admission expos QR page
// (qrcode → data URL).

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function SurveyQr({ url, title }: { url: string; title: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!dataUrl) return null;

  const fileName = `${title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'survey'}_QR.png`;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
      <img src={dataUrl} alt="Survey QR code" className="h-36 w-36" />
      <div className="space-y-2">
        <p className="text-xs text-slate-500">
          Scan to open the survey. Print it or share the image.
        </p>
        <a href={dataUrl} download={fileName}>
          <Button variant="outline" size="sm" className="gap-1">
            <Download className="h-3.5 w-3.5" />
            Download QR (PNG)
          </Button>
        </a>
      </div>
    </div>
  );
}
