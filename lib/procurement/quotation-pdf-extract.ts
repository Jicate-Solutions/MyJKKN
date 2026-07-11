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
import { recordChatCall, resolveChatModel } from '@/lib/services/platform/ai-clients/chat';

// ai_model_config feature key — model governed from /admin/ai-models, spend in ai_model_usage.
const FEATURE_KEY = 'procurement.quotation_extract';

export interface ExtractItem {
  id: string;
  item_name: string;
}

export interface ExtractedLine {
  rfq_item_id: string | null;
  item_name: string;
  unit_price: number;
}

export interface PdfExtractResult {
  /** rfq_item_id -> unit_price (only confidently-matched lines) */
  prices: Record<string, number>;
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
  model?: string
): Promise<PdfExtractResult> {
  const itemList = items.map((i) => `${i.id} — ${i.item_name}`).join('\n');

  // An explicitly passed model (tests) bypasses config resolution.
  //
  // Contracts relied on here (lib/services/platform/ai-clients/chat.ts — same
  // unguarded shape as claudeChatForFeature itself): resolveChatModel ALWAYS
  // returns an object with an ANTHROPIC provider/model (non-anthropic config
  // rows degrade to an anthropic fallback with a warn — hence the literal
  // 'anthropic' passed to recordChatCall), and recordChatCall/recordUsage are
  // internally non-throwing — a ledger write failure can never fail a
  // completed (already paid) extraction, nor mask the original API error in
  // the catch path. (Deep-review round-1 findings 1-4 dispositioned on PR #1967.)
  const modelId = model ?? (await resolveChatModel(FEATURE_KEY)).model_id;

  const startedAt = Date.now();
  const message = await client.messages.create({
    model: modelId,
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
              'Return unit_price as a plain number.\n\nRequested items (id — name):\n' +
              itemList,
          },
        ],
      },
    ],
  }).catch(async (err: unknown) => {
    await recordChatCall(FEATURE_KEY, 'anthropic', modelId, startedAt, null, err);
    throw err;
  });

  await recordChatCall(FEATURE_KEY, 'anthropic', modelId, startedAt, message);

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_quotation'
  );
  const rawLines = (block?.input as { lines?: unknown } | undefined)?.lines;
  const arr = Array.isArray(rawLines) ? rawLines : [];

  const validIds = new Set(items.map((i) => i.id));
  const prices: Record<string, number> = {};
  const lines: ExtractedLine[] = [];
  const unmatched: string[] = [];

  for (const row of arr as Array<Record<string, unknown>>) {
    const price = Number(row?.unit_price);
    if (!(price > 0)) continue;
    const name = String(row?.item_name ?? '').trim();
    const idRaw = String(row?.rfq_item_id ?? '').trim();
    const id = validIds.has(idRaw) ? idRaw : null; // validate model output against what we sent

    if (id) prices[id] = price;
    else if (name) unmatched.push(name);
    lines.push({ rfq_item_id: id, item_name: name, unit_price: price });
  }

  return { prices, lines, matched: Object.keys(prices).length, unmatched };
}
