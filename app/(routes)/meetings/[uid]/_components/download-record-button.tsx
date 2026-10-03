'use client';

// app/(routes)/meetings/[uid]/_components/download-record-button.tsx
//
// Download the finished meeting record (PDF).
//
// WHY NOT A PLAIN <a download>. When the route answers 401 (session expired),
// 404 or 500, a bare download link shows only the browser's own "Failed –
// Server problem" and the reason never reaches the person. Fetching first lets
// each outcome say something plain; on success the file is saved as usual.

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FALLBACK_NAME = 'meeting-record.pdf';

/** The filename the route set in Content-Disposition, or a plain default. */
export function filenameFrom(disposition: string | null): string {
  const m = disposition ? /filename="([^"]+)"/i.exec(disposition) : null;
  return m?.[1] ?? FALLBACK_NAME;
}

/** What the person is told for each answer that is not a PDF. */
export function messageForStatus(status: number): string {
  if (status === 401) return 'Please sign in again.';
  if (status === 404) return 'Nothing has been recorded for this meeting yet.';
  return 'Could not make the PDF — try again.';
}

export function DownloadRecordButton({ uid }: { uid: string }) {
  const [pending, startTransition] = useTransition();

  function download() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/record/${encodeURIComponent(uid)}`, {
          credentials: 'same-origin',
        });
        if (!res.ok) {
          toast.error(messageForStatus(res.status));
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filenameFrom(res.headers.get('Content-Disposition'));
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Give the browser a moment to start the save before the link goes.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        toast.error(messageForStatus(500));
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-start"
      onClick={download}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Download className="mr-2 h-4 w-4" aria-hidden />
      )}
      {pending ? 'Preparing the PDF…' : 'Download record (PDF)'}
    </Button>
  );
}
