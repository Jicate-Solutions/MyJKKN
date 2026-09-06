'use client';

/**
 * JkknQrDialog — shows a person's permanent JKKN ID as a QR code, with a
 * PNG download.
 *
 * The payload is the PLAIN JKKN ID (e.g. "348295-7") — exactly what the
 * printed ID card carries (lib/id-cards/render-data.ts, pickQrValue), so a
 * QR downloaded here and a QR on plastic scan identically everywhere.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface JkknQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The permanent JKKN ID, e.g. "348295-7". */
  jkknId: string;
  /** Person's display name, for the dialog header and the file name. */
  personName?: string;
}

export function JkknQrDialog({ open, onOpenChange, jkknId, personName }: JkknQrDialogProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !jkknId) return;
    let cancelled = false;
    // Same settings as the ID-card engine (render-data.ts makeQrDataUrl),
    // scaled up for on-screen presentation and print-quality download.
    QRCode.toDataURL(jkknId, { errorCorrectionLevel: 'M', margin: 2, width: 480 })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [open, jkknId]);

  const fileName = `jkkn-id-${jkknId.replace(/[^0-9]/g, '')}${
    personName ? `-${personName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''
  }.png`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{personName ?? 'JKKN ID'}</DialogTitle>
          <DialogDescription>
            Permanent JKKN ID. Scanning this QR anywhere in MyJKKN identifies this person.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image adds nothing
            <img src={dataUrl} alt={`QR code for JKKN ID ${jkknId}`} className="h-56 w-56 rounded-md border bg-white p-2" />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-md border text-sm text-muted-foreground">
              Generating…
            </div>
          )}
          <div className="font-mono text-2xl tracking-widest">{jkknId}</div>
          <Button asChild variant="outline" disabled={!dataUrl}>
            <a href={dataUrl ?? '#'} download={fileName}>
              <Download className="mr-1 h-4 w-4" />
              Download PNG
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
