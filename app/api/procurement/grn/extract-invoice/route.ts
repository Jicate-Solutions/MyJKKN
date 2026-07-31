import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/utils/parent-admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 15;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * POST /api/procurement/grn/extract-invoice  (multipart/form-data)
 *
 * AI invoice reading is OFF pending its ₹0 Max-lane arm.
 *
 * This route previously called the PAID Anthropic API directly. That path is
 * removed: procurement PDF reading now runs only on the ₹0 Max lane
 * (Director decision, 2026-07-28 — "delete the paid code"). The quotation side
 * is already migrated; the GRN/invoice side needs its own result contract
 * (invoice header + per-line batch/expiry, richer than the quotation shape) and
 * a matching runner arm — see specs/procurement-pdf-max-lane-2026-07-28.md.
 *
 * Until that lands this returns the same honest outcome the UI already handles:
 * enter the invoice details manually. This removes NO working capability —
 * ai_model_usage shows procurement.invoice_extract was never once invoked in
 * production.
 *
 * The request is still validated so the client keeps its existing error
 * messages for an oversized or non-PDF file.
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

  // 503 deliberately: the existing client already throws on a non-OK response
  // and toasts `error`, so this needs no UI change to degrade cleanly.
  return NextResponse.json(
    {
      error: 'AI invoice reading is unavailable — please enter the invoice details manually.',
      unavailable: true,
    },
    { status: 503 },
  );
}
