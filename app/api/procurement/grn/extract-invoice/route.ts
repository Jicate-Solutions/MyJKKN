import { NextRequest, NextResponse } from 'next/server';
import { requireProcurement, PROC_GRN_CREATE } from '@/lib/utils/procurement-auth';

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
 *
 * REQUEST CONTRACT (multipart) — what the client already sends today:
 *   file          File    the invoice PDF, ≤ 15 MB
 *   items         JSON    Array<{ id, item_name }> — the PO lines to match against
 *   expectations  JSON    the receiver's declared expectations for THIS invoice:
 *                           { tolerance_pct, require_batch_expiry,
 *                             max_invoice_age_days, watch_for }
 *
 * `expectations` is parsed and normalised here so the shape is fixed now rather than
 * invented later. When the Max-lane arm lands it should reach the model as reviewer
 * intent — `watch_for` verbatim in the prompt ("the receiver asks you to watch for: …"),
 * `require_batch_expiry` as an instruction to hunt harder for per-line batch/expiry, and
 * `tolerance_pct` / `max_invoice_age_days` as the bar for anything it reports back as
 * suspect. The deterministic comparison against these values already runs app-side in
 * lib/services/procurement/three-way-match.ts, so the model is never the enforcer.
 */

const MAX_WATCH_FOR = 1000;

interface Expectations {
  tolerance_pct: number | null;
  require_batch_expiry: boolean;
  max_invoice_age_days: number | null;
  watch_for: string | null;
}

/** Clamp whatever the client sent into the documented shape. Never throws. */
function parseExpectations(raw: FormDataEntryValue | null): Expectations {
  const empty: Expectations = {
    tolerance_pct: null,
    require_batch_expiry: false,
    max_invoice_age_days: null,
    watch_for: null,
  };
  if (typeof raw !== 'string' || !raw.trim()) return empty;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== 'object') return empty;

  const pct = Number(parsed.tolerance_pct);
  const days = Number(parsed.max_invoice_age_days);
  return {
    tolerance_pct: Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : null,
    require_batch_expiry: parsed.require_batch_expiry === true,
    max_invoice_age_days: Number.isFinite(days) && days > 0 ? Math.floor(days) : null,
    watch_for:
      typeof parsed.watch_for === 'string' && parsed.watch_for.trim()
        ? parsed.watch_for.trim().slice(0, MAX_WATCH_FOR)
        : null,
  };
}
export async function POST(req: NextRequest) {
  const user = await requireProcurement(PROC_GRN_CREATE);
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

  // Parsed (not yet consumed) so a malformed `expectations` fails here rather than inside a
  // future runner, and so the normalisation lives with the contract it documents.
  void parseExpectations(form.get('expectations'));

  // 503 deliberately: the existing client already throws on a non-OK response
  // and toasts `error`, so this needs no UI change to degrade cleanly.
  return NextResponse.json(
    {
      error:
        'AI invoice reading is not built yet — please enter the invoice details manually.',
      unavailable: true,
    },
    { status: 503 },
  );
}
