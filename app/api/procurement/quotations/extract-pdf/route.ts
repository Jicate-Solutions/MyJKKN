import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/utils/parent-admin-auth';
import { extractQuotationFromPdf, type ExtractItem } from '@/lib/procurement/quotation-pdf-extract';

export const runtime = 'nodejs';
export const maxDuration = 60; // Claude PDF read can take a few seconds

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * POST /api/procurement/quotations/extract-pdf  (multipart/form-data)
 * Fields: file (PDF), items (JSON array of { id, item_name })
 * Returns { prices, lines, matched, unmatched } — vendor unit prices read from the
 * PDF by Claude and matched to the RFQ's items. The client fills these into the
 * (editable) price fields for human review before saving — never auto-committed.
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
    return NextResponse.json({ error: 'AI extraction supports PDF files only.' }, { status: 400 });

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
    return NextResponse.json({ error: 'No RFQ items to match against.' }, { status: 400 });

  try {
    const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const result = await extractQuotationFromPdf(pdfBase64, items);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[procurement quotation extract-pdf] error:', err);
    const message =
      err instanceof Error && err.message.includes('API key')
        ? 'AI extraction is not configured on the server.'
        : 'Could not read the PDF. Enter prices manually or use the template.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
