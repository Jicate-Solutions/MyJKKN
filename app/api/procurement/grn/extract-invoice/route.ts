import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/utils/parent-admin-auth';
import { extractInvoiceFromPdf, type ExtractItem } from '@/lib/procurement/invoice-pdf-extract';

export const runtime = 'nodejs';
export const maxDuration = 60; // Claude PDF read can take a few seconds

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * POST /api/procurement/grn/extract-invoice  (multipart/form-data)
 * Fields: file (PDF), items (JSON array of { id, item_name } — the PO's line items)
 * Returns { header, lines, matched, unmatched } — invoice header + per-line qty/price/
 * batch/expiry read by Claude and matched to the PO's items. The client pre-fills these
 * into the (editable) goods-receipt form for review — never auto-committed.
 */
export async function POST(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'PDF exceeds the 15 MB limit.' }, { status: 400 });
  if (file.type !== 'application/pdf')
    return NextResponse.json({ error: 'Invoice reading supports PDF files only.' }, { status: 400 });

  let items: ExtractItem[];
  try {
    const parsed = JSON.parse(String(form.get('items') ?? '[]'));
    items = Array.isArray(parsed)
      ? parsed
          .filter((i) => i && typeof i.id === 'string' && typeof i.item_name === 'string')
          .map((i) => ({ id: i.id, item_name: i.item_name }))
      : [];
  } catch {
    return NextResponse.json({ error: 'Invalid items payload.' }, { status: 400 });
  }
  if (items.length === 0)
    return NextResponse.json({ error: 'No PO items to match against.' }, { status: 400 });

  try {
    const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const result = await extractInvoiceFromPdf(pdfBase64, items);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[procurement grn extract-invoice] error:', err);
    const message =
      err instanceof Error && err.message.includes('API key')
        ? 'AI invoice reading is not configured on the server.'
        : 'Could not read the invoice. Enter the details manually.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
