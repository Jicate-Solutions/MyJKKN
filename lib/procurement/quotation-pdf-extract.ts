// lib/procurement/quotation-pdf-extract.ts
//
// AI extraction of vendor quotation prices from a PDF (PRD step 5, "read the PDF").
// Claude reads the PDF natively (base64 document block — no OCR/pdf-parse) and returns
// one {rfq_item_id, item_name, unit_price} per line via a FORCED tool call, matching
// the proven structured-output pattern in lib/attention-bar/anthropic-client.ts.
//
// The model does the fuzzy item→line matching (it is far better at "Clove Tray, Auto"
// == "AUTO CLOVE TRAY" than a string compare); our code only VALIDATES that a returned
// rfq_item_id is one we actually sent. Extracted prices are handed to the UI for human
// review before saving — a misread never silently becomes a purchase order.

import Anthropic from '@anthropic-ai/sdk';

export interface ExtractItem {
  id: string;
  item_name: string;
}

export interface ExtractedLine {
  rfq_item_id: string | null;
  item_name: string;
  unit_price: number;
  manufacturer: string | null;
  quality_grade: string | null;
  concentration: string | null;
  other_specs: string | null;
}

export interface ExtractedSpec {
  manufacturer: string | null;
  quality_grade: string | null;
  concentration: string | null;
  other_specs: string | null;
}

export interface PdfExtractResult {
  /** rfq_item_id -> unit_price (only confidently-matched lines) */
  prices: Record<string, number>;
  /** rfq_item_id -> spec fields read off the PDF (only confidently-matched lines) */
  specs: Record<string, ExtractedSpec>;
  /** every line the model returned, for preview */
  lines: ExtractedLine[];
  matched: number;
  /** line names the model couldn't tie to an RFQ item */
  unmatched: string[];
}

/** Resolve the Anthropic key — attention-bar uses ANTHROPIC_API_KEY; repo .env has CLAUDE_API_KEY. */
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'No Anthropic API key set (ANTHROPIC_API_KEY or CLAUDE_API_KEY) — cannot extract quotation PDF.'
    );
  }
  return new Anthropic({ apiKey });
}

const RECORD_TOOL: Anthropic.Tool = {
  name: 'record_quotation',
  description: 'Record the unit prices extracted from the vendor quotation, one entry per line item.',
  input_schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        description: 'One entry per line item found on the quotation.',
        items: {
          type: 'object',
          properties: {
            rfq_item_id: {
              type: 'string',
              description:
                'The id of the requested item this line matches (from the provided list). Empty string if the line matches none of them.',
            },
            item_name: {
              type: 'string',
              description: 'The line item name exactly as written on the quotation.',
            },
            unit_price: {
              type: 'number',
              description:
                'The UNIT price as a plain number (no currency symbol/commas). If only a line total is shown, divide by the quantity.',
            },
            manufacturer: {
              type: 'string',
              description: 'Manufacturer/brand offered for this line, if stated on the quotation. Omit if not shown.',
            },
            quality_grade: {
              type: 'string',
              description: 'Quality/grade offered for this line, if stated. Omit if not shown.',
            },
            concentration: {
              type: 'string',
              description: 'Concentration/purity offered for this line (chemical items), if stated. Omit if not shown.',
            },
            other_specs: {
              type: 'string',
              description: 'Any other product-specific detail printed for this line that does not fit the fields above. Omit if none.',
            },
          },
          required: ['rfq_item_id', 'item_name', 'unit_price'],
        },
      },
    },
    required: ['lines'],
  },
};

/**
 * Extract vendor unit prices from a quotation PDF and match them to the RFQ's items.
 * `pdfBase64` is the raw PDF bytes, base64-encoded, no data: prefix, no newlines.
 */
export async function extractQuotationFromPdf(
  pdfBase64: string,
  items: ExtractItem[],
  client: Anthropic = getClient(),
  model = 'claude-opus-4-8'
): Promise<PdfExtractResult> {
  const itemList = items.map((i) => `${i.id} — ${i.item_name}`).join('\n');

  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    tools: [RECORD_TOOL],
    tool_choice: { type: 'tool', name: 'record_quotation' },
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
              'Extract each line item and its UNIT price from this vendor quotation. ' +
              'For each line, set rfq_item_id to the id of the requested item it matches ' +
              '(match by meaning, not exact spelling), or "" if it matches none. ' +
              'Return unit_price as a plain number. Also capture manufacturer, quality_grade, ' +
              'concentration, and other_specs when the quotation states them for that line — ' +
              'leave them out when not shown, do not guess.\n\nRequested items (id — name):\n' +
              itemList,
          },
        ],
      },
    ],
  });

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_quotation'
  );
  const rawLines = (block?.input as { lines?: unknown } | undefined)?.lines;
  const arr = Array.isArray(rawLines) ? rawLines : [];

  const validIds = new Set(items.map((i) => i.id));
  const prices: Record<string, number> = {};
  const specs: Record<string, ExtractedSpec> = {};
  const lines: ExtractedLine[] = [];
  const unmatched: string[] = [];

  const asSpecString = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s || null;
  };

  for (const row of arr as Array<Record<string, unknown>>) {
    const price = Number(row?.unit_price);
    if (!(price > 0)) continue;
    const name = String(row?.item_name ?? '').trim();
    const idRaw = String(row?.rfq_item_id ?? '').trim();
    const id = validIds.has(idRaw) ? idRaw : null; // validate model output against what we sent
    const spec: ExtractedSpec = {
      manufacturer: asSpecString(row?.manufacturer),
      quality_grade: asSpecString(row?.quality_grade),
      concentration: asSpecString(row?.concentration),
      other_specs: asSpecString(row?.other_specs),
    };

    if (id) {
      prices[id] = price;
      specs[id] = spec;
    } else if (name) {
      unmatched.push(name);
    }
    lines.push({ rfq_item_id: id, item_name: name, unit_price: price, ...spec });
  }

  return { prices, specs, lines, matched: Object.keys(prices).length, unmatched };
}
