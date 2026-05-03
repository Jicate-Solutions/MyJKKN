/**
 * Auto-generate a receipt PDF and upload to Supabase Storage.
 *
 * Reuses the same formatReceiptText() monospace layout as receipt-modal.tsx
 * and uploads to the 'ims-receipts' bucket under {store_id}/{YYYY-MM}/{sale_id}.pdf.
 *
 * This is a fire-and-forget utility — failures are logged but never block
 * the sale flow.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { formatReceiptText } from './ims-receipt';
import type { ImsReceiptData } from '@/types/ims/receipt';

const BUCKET = 'ims-receipts';

/**
 * Generate a receipt PDF blob from receipt data using jsPDF.
 * Mirrors the logic in receipt-modal.tsx handlePDF.
 */
async function generateReceiptPdfBlob(data: ImsReceiptData): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: [80, 200] });

  doc.setFont('Courier', 'normal');
  doc.setFontSize(9);

  const rawText = formatReceiptText(data);
  // Replace chars outside jsPDF Courier's Latin-1 (CP1252) range before rendering:
  //   ─ (U+2500) → '-'  (box-drawing not in CP1252, jsPDF renders as %)
  //   ₹ (U+20B9) → 'Rs' (rupee sign not in CP1252, jsPDF renders as ¹)
  const text = rawText.replace(/─/g, '-').replace(/₹/g, 'Rs');
  // Use split('\n') — NOT splitTextToSize — to preserve monospace column alignment.
  // splitTextToSize word-wraps at spaces, breaking padded columns like "Name   Qty  Amt"
  // and causing qty/amount values to disappear from the rendered PDF.
  const lines = text.split('\n');
  let y = 5;

  for (const line of lines) {
    if (y > 195) {
      doc.addPage([80, 200]);
      y = 5;
    }
    doc.text(line, 3, y);
    y += 4;
  }

  return doc.output('blob');
}

/**
 * Build the storage path for a receipt PDF.
 * Convention: {store_id}/{YYYY-MM}/{sale_id}.pdf
 */
function buildStoragePath(saleId: string, storeId: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${storeId}/${yyyy}-${mm}/${saleId}.pdf`;
}

/**
 * Generate a receipt PDF and upload it to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 *
 * Also updates the ims_sales row with receipt_pdf_url.
 */
export async function generateAndUploadReceiptPdf(
  receiptData: ImsReceiptData,
  saleId: string,
  storeId: string
): Promise<string | null> {
  try {
    const supabase = createClientSupabaseClient();

    // Generate PDF blob
    const pdfBlob = await generateReceiptPdfBlob(receiptData);

    // Upload to storage
    const path = buildStoragePath(saleId, storeId);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[ims-receipt-pdf] Upload failed:', uploadError);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData?.publicUrl || null;

    // Save URL to sale record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (publicUrl) {
      await (supabase as any)
        .from('ims_sales')
        .update({ receipt_pdf_url: publicUrl })
        .eq('id', saleId);
    }

    return publicUrl;
  } catch (error) {
    console.error('[ims-receipt-pdf] Error generating/uploading PDF:', error);
    return null;
  }
}
