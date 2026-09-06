'use client';

// Download the receipt for one paid instalment.
//
// Client-side by necessity: jsPDF's doc.save() needs `document`, so the PDF is
// built in the browser from data the server component already fetched. No route
// and no round trip — the receipt contains nothing the page did not already
// have on screen.

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { CourseReceiptData } from '@/lib/utils/courses/course-receipt-pdf';

export function DownloadReceiptButton({ receipt }: { receipt: CourseReceiptData }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Imported on demand: jsPDF and jspdf-autotable are a large dependency and
      // most visits to this page never download anything. Loading them eagerly
      // would tax every participant to serve the few who click.
      const { downloadCourseReceiptPdf } = await import('@/lib/utils/courses/course-receipt-pdf');
      downloadCourseReceiptPdf(receipt);
    } catch {
      toast.error('Could not prepare the receipt. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={download}
      disabled={busy}
      className="w-full sm:w-auto"
    >
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="mr-1.5 h-3.5 w-3.5" />
      )}
      Receipt
    </Button>
  );
}
