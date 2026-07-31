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

/** Signed-link lifetime. Long enough to survive a WhatsApp/email round trip. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Mint a time-limited link to a stored receipt.
 *
 * The ims-receipts bucket was `public = true` with a bucket-wide anon SELECT
 * policy, which meant anyone could enumerate and download every customer's
 * receipt — name, medicines purchased, amounts, cashier, store GSTIN. The bucket
 * is private as of 20260730130000_ims_pos_anon_lockdown.sql, so links have to be
 * signed. RLS on the object still applies, so this only succeeds for a caller who
 * can reach the owning store.
 */
export async function getReceiptSignedUrl(path: string): Promise<string | null> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error) {
      console.error('[ims-receipt-pdf] Signed URL failed:', error);
      return null;
    }
    return data?.signedUrl || null;
  } catch (error) {
    console.error('[ims-receipt-pdf] Error signing receipt URL:', error);
    return null;
  }
}

/**
 * Generate a receipt PDF and upload it to Supabase Storage.
 * Returns the storage PATH on success, or null on failure.
 *
 * Also stamps that path onto ims_sales.receipt_pdf_url.
 *
 * NOTE ON WHAT IS STORED: this used to persist a getPublicUrl() link, which only
 * worked because the bucket was world-readable. A signed URL cannot be stored in
 * its place — it expires, so the column would fill with links that are dead by
 * the time anyone opens them. The stable identifier is the path; call
 * getReceiptSignedUrl() to turn it into a link at the moment of sharing.
 *
 * Safe to change: receipt_pdf_url is written here and read nowhere in the app
 * (checked across app/, components/, lib/, hooks/) — it is an archival pointer.
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

    // Save the storage path to the sale record
    await (supabase as any)
      .from('ims_sales')
      .update({ receipt_pdf_url: path })
      .eq('id', saleId);

    return path;
  } catch (error) {
    console.error('[ims-receipt-pdf] Error generating/uploading PDF:', error);
    return null;
  }
}
