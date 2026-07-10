// lib/procurement/invoice-pdf-extract.ts
//
// AI extraction of a vendor INVOICE against a Purchase Order (final procurement phase).
// Claude reads the invoice PDF natively (base64 document block — no OCR) and returns, per
// line, the matching po_item_id + quantity + unit price + batch number + expiry date via a
// FORCED tool call. Same structured-output pattern as quotation-pdf-extract.ts and
// lib/attention-bar/anthropic-client.ts.
//
// The model does the fuzzy invoice-line -> PO-item matching (it is far better at it than a
// string compare); our code only VALIDATES that a returned po_item_id is one we sent. The
// extracted values pre-fill the (editable) goods-receipt form for human review before the
// store admin confirms and posts to inventory — nothing is auto-committed.

import Anthropic from '@anthropic-ai/sdk';

export interface ExtractItem {
  id: string;
  item_name: string;
}

export interface ExtractedInvoiceLine {
  po_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  batch_number: string | null;
  expiry_date: string | null; // ISO YYYY-MM-DD
  manufacturing_date: string | null; // ISO YYYY-MM-DD
}

export interface InvoiceHeader {
  invoice_number: string | null;
  invoice_date: string | null; // ISO YYYY-MM-DD
  invoice_total: number | null;
}

export interface InvoiceExtractResult {
  header: InvoiceHeader;
  lines: ExtractedInvoiceLine[];
  matched: number;
  /** invoice line names the model couldn't tie to a PO item */
  unmatched: string[];
}

/** Resolve the Anthropic key — attention-bar uses ANTHROPIC_API_KEY; repo .env has CLAUDE_API_KEY. */
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'No Anthropic API key set (ANTHROPIC_API_KEY or CLAUDE_API_KEY) — cannot read invoice PDF.'
    );
  }
  return new Anthropic({ apiKey });
}

const RECORD_TOOL: Anthropic.Tool = {
  name: 'record_invoice',
  description: 'Record the vendor invoice header and its line items (one entry per line).',
  input_schema: {
    type: 'object',
    properties: {
      invoice_number: { type: 'string', description: 'The vendor invoice number/reference. Empty string if not shown.' },
      invoice_date: { type: 'string', description: 'Invoice date as ISO YYYY-MM-DD. Empty string if not shown.' },
      invoice_total: { type: 'number', description: 'The invoice grand total as a plain number. 0 if not shown.' },
      lines: {
        type: 'array',
        description: 'One entry per invoice line item.',
        items: {
          type: 'object',
          properties: {
            po_item_id: {
              type: 'string',
              description:
                'The id of the PO item this line matches (from the provided list). Empty string if it matches none.',
            },
            item_name: { type: 'string', description: 'The line item name exactly as written on the invoice.' },
            quantity: {
              type: 'number',
              description: 'The invoiced quantity as a plain number.',
            },
            unit_price: {
              type: 'number',
              description: 'The per-unit price as a plain number (no currency symbol/commas). If only a line total is shown, divide by quantity.',
            },
            batch_number: { type: 'string', description: 'Batch/lot number for the line. Empty string if not on the invoice.' },
            expiry_date: { type: 'string', description: 'Expiry date as ISO YYYY-MM-DD. Empty string if not on the invoice.' },
            manufacturing_date: { type: 'string', description: 'Manufacturing date as ISO YYYY-MM-DD. Empty string if not on the invoice.' },
          },
          required: ['po_item_id', 'item_name', 'quantity', 'unit_price', 'batch_number', 'expiry_date', 'manufacturing_date'],
        },
      },
    },
    required: ['lines'],
  },
};

const cleanStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
};
const cleanNum = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Read a vendor invoice PDF and match its lines to the PO's items.
 * `pdfBase64` is the raw PDF bytes, base64-encoded (no data: prefix, no newlines).
 */
export async function extractInvoiceFromPdf(
  pdfBase64: string,
  items: ExtractItem[],
  client: Anthropic = getClient(),
  model = 'claude-opus-4-8'
): Promise<InvoiceExtractResult> {
  const itemList = items.map((i) => `${i.id} — ${i.item_name}`).join('\n');

  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    tools: [RECORD_TOOL],
    tool_choice: { type: 'tool', name: 'record_invoice' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          {
            type: 'text',
            text:
              'Read this vendor invoice. Capture the invoice header (number, date, grand total) and each ' +
              'line item. For each line, set po_item_id to the id of the PO item it matches (match by ' +
              'meaning, not exact spelling), or "" if none. Include batch number and expiry date when the ' +
              'invoice shows them per line. Return numbers plainly.\n\nPurchase-order items (id — name):\n' +
              itemList,
          },
        ],
      },
    ],
  });

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_invoice'
  );
  const input = (block?.input ?? {}) as Record<string, unknown>;
  const rawLines = Array.isArray(input.lines) ? input.lines : [];

  const validIds = new Set(items.map((i) => i.id));
  const lines: ExtractedInvoiceLine[] = [];
  const unmatched: string[] = [];
  let matched = 0;

  for (const row of rawLines as Array<Record<string, unknown>>) {
    const quantity = cleanNum(row?.quantity);
    if (quantity == null) continue; // skip zero/blank-qty rows
    const name = cleanStr(row?.item_name) ?? '';
    const idRaw = String(row?.po_item_id ?? '').trim();
    const po_item_id = validIds.has(idRaw) ? idRaw : null; // validate against what we sent

    if (po_item_id) matched += 1;
    else if (name) unmatched.push(name);

    lines.push({
      po_item_id,
      item_name: name,
      quantity,
      unit_price: cleanNum(row?.unit_price) ?? 0,
      batch_number: cleanStr(row?.batch_number),
      expiry_date: cleanStr(row?.expiry_date),
      manufacturing_date: cleanStr(row?.manufacturing_date),
    });
  }

  return {
    header: {
      invoice_number: cleanStr(input.invoice_number),
      invoice_date: cleanStr(input.invoice_date),
      invoice_total: cleanNum(input.invoice_total),
    },
    lines,
    matched,
    unmatched,
  };
}
