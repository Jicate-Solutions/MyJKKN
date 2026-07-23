// lib/sop/download.ts
// Client-side helpers for triggering an SOP export download. The server
// returns a Blob with appropriate Content-Type and Content-Disposition
// headers; we wrap the download in a hidden anchor click so the file
// lands in the user's Downloads folder instead of opening in a new tab.

import { BosSopService } from '@/lib/services/bos/bos-sop-service';

const EXTENSIONS: Record<'pdf' | 'docx' | 'html' | 'markdown' | 'txt', string> = {
  pdf: 'pdf',
  docx: 'doc', // server returns Word-compatible HTML for now; .doc opens in Word
  html: 'html',
  markdown: 'md',
  txt: 'txt',
};

export async function downloadSopExport(
  documentId: string,
  documentTitle: string,
  format: 'pdf' | 'docx' | 'html' | 'markdown' | 'txt'
): Promise<void> {
  const blob = await BosSopService.export(documentId, format);

  // For the PDF format, open the HTML in a new tab and trigger window.print()
  // so the user gets a real PDF via the browser's print dialog.
  if (format === 'pdf') {
    const html = await blob.text();
    const win = window.open('', '_blank');
    if (!win) {
      throw new Error('Pop-up blocked. Allow pop-ups for this site to export PDFs.');
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Wait for fonts/layout, then trigger print.
    setTimeout(() => win.print(), 600);
    return;
  }

  const url = URL.createObjectURL(blob);
  const safeName = documentTitle.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'sop';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.${EXTENSIONS[format]}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke to give the browser time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
