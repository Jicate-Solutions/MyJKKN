// lib/procurement/quotation-pdf-direct.ts
//
// PAID fallback for reading a vendor quotation PDF. The normal path is the ₹0
// Max lane (an ai_jobs row served by the office AI machine). When no runner picks
// the job up within a few seconds, /api/procurement/quotations/extract-pdf/direct
// reads the same PDF here with the Claude API so the person gets prices on
// screen instead of waiting on a notification.
//
// Model and spend are governed from /admin/ai-models under their OWN feature key
// (not procurement.quotation_extract, which belongs to the ₹0 lane) — the row is
// set to Claude Haiku 4.5, the lowest-priced current model that reads PDFs.
// Every call lands in ai_model_usage via recordChatCall.
//
// Restored from the pre-2026-07-28 extractor (git 26605e47f^), returning the
// same line shape the ₹0 runner returns so the page applies either one alike.

import Anthropic from '@anthropic-ai/sdk';
import { recordChatCall, resolveChatModel } from '@/lib/services/platform/ai-clients/chat';
import { anthropicApiKey } from '@/lib/services/platform/ai-clients/api-key';
import { namesShareAWord } from '@/lib/procurement/item-name-match';

export const QUOTATION_EXTRACT_API_FEATURE = 'procurement.quotation_extract_api';

export interface DirectExtractItem {
  id: string;
  item_name: string;
}

export interface DirectExtractedLine {
  rfq_item_id: string | null;
  item_name: string;
  unit_price: number;
  /** The match to rfq_item_id is a guess a person must confirm. */
  uncertain: boolean;
  manufacturer: string | null;
  quality_grade: string | null;
  concentration: string | null;
  other_specs: string | null;
}

/** The seller as printed on the quotation letterhead. */
export interface DirectExtractedVendor {
  name: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact_person: string | null;
}

/**
 * Same line shape as the ₹0 runner's job result, plus the quotation header.
 * `version: 2` marks results that carry the header — earlier cached reads
 * don't, so the route re-reads rather than reusing them.
 */
export interface DirectExtractResult {
  version: 3;
  lines: DirectExtractedLine[];
  unmatched_note: string | null;
  vendor: DirectExtractedVendor | null;
  quote_number: string | null;
  delivery_days: number | null;
  payment_terms: string | null;
}

// 3: lines carry `uncertain` from a same/similar/none match grade. Readings saved
// at 2 are re-read instead of reused, so an old over-confident match never returns.
export const EXTRACT_RESULT_VERSION = 3;

/** Either key name works (see ai-clients/api-key.ts). */
export const directExtractApiKey = anthropicApiKey;

const RECORD_TOOL: Anthropic.Tool = {
  name: 'record_quotation',
  description: "Record a vendor quotation: the seller's details, the header terms, and the unit price of each line item.",
  input_schema: {
    type: 'object',
    properties: {
      vendor: {
        type: 'object',
        description:
          'The SELLER who issued this quotation (letterhead/header/footer) — never the buyer, ' +
          'who is the college/institution it is addressed to. Omit fields that are not printed.',
        properties: {
          name: { type: 'string', description: 'Business name of the seller.' },
          gstin: { type: 'string', description: "The seller's 15-character GSTIN, if printed." },
          phone: { type: 'string', description: "The seller's phone/mobile number." },
          email: { type: 'string', description: "The seller's email address." },
          address: { type: 'string', description: "The seller's address, on one line." },
          contact_person: { type: 'string', description: 'Name of the person who signed or is named as contact.' },
        },
      },
      quote_number: { type: 'string', description: 'The quotation/reference number, if printed.' },
      delivery_days: {
        type: 'integer',
        description: 'Delivery period in days, if stated (convert weeks to days). Omit if not stated.',
      },
      payment_terms: { type: 'string', description: 'Payment terms as written (e.g. "50% advance"), if stated.' },
      lines: {
        type: 'array',
        description: 'One entry per line item found on the quotation.',
        items: {
          type: 'object',
          properties: {
            rfq_item_id: {
              type: 'string',
              description:
                'The id of the requested item this line is for (from the provided list). Empty string if it is for none of them.',
            },
            match: {
              type: 'string',
              enum: ['same', 'similar', 'none'],
              description:
                '"same" = clearly the same kind of product as the requested item (a different brand or model of it is fine). ' +
                '"similar" = plausibly it, but you are not sure. "none" = a different kind of product, or no requested item fits. ' +
                'Never pick an item just because it is the only one requested.',
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
              description:
                'Any other product-specific detail printed for this line that does not fit the fields above. Omit if none.',
            },
          },
          required: ['rfq_item_id', 'match', 'item_name', 'unit_price'],
        },
      },
    },
    required: ['lines'],
  },
};

// Small models sometimes fill an absent field with a placeholder instead of
// omitting it. Those must read as "not printed", never land in a form.
const PLACEHOLDER = /^(<?\s*(unknown|n\/?a|na|none|null|nil|not (stated|specified|mentioned|available|provided|shown))\s*>?|-+|—|\?+)$/i;

const asSpec = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && !PLACEHOLDER.test(s) ? s : null;
};

/**
 * Read unit prices off a quotation PDF and match them to the RFQ's items.
 * `pdfBase64` is the raw PDF bytes, base64-encoded, no data: prefix.
 */
export async function extractQuotationDirect(
  pdfBase64: string,
  items: DirectExtractItem[],
): Promise<DirectExtractResult> {
  const apiKey = directExtractApiKey();
  if (!apiKey) throw new Error('No Claude API key is configured for direct PDF reading.');
  const client = new Anthropic({ apiKey });

  const { model_id: modelId } = await resolveChatModel(QUOTATION_EXTRACT_API_FEATURE);
  const itemList = items.map((i) => `${i.id} — ${i.item_name}`).join('\n');

  const startedAt = Date.now();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: modelId,
      max_tokens: 8192,
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
                "Record this vendor quotation: the seller's details, quotation number, delivery period " +
                'and payment terms from the header, and each line item with its UNIT price. ' +
                'For each line, decide which requested item it is FOR, by meaning (spelling and brand may differ): ' +
                'it must be the same kind of product — a PoE injector is not a keyboard, a switch is not a camera. ' +
                'Grade it: match "same", "similar" (unsure) or "none". When it is "none", set rfq_item_id to "". ' +
                'A quotation often lists things nobody asked for; leave those unmatched rather than forcing a fit. ' +
                'Return unit_price as a plain number. Also capture manufacturer, quality_grade, ' +
                'concentration, and other_specs when the quotation states them for that line — ' +
                'leave them out when not shown, do not guess.\n\nRequested items (id — name):\n' +
                itemList,
            },
          ],
        },
      ],
    });
  } catch (err) {
    await recordChatCall(QUOTATION_EXTRACT_API_FEATURE, 'anthropic', modelId, startedAt, null, err);
    throw err;
  }
  await recordChatCall(QUOTATION_EXTRACT_API_FEATURE, 'anthropic', modelId, startedAt, message);

  if (message.stop_reason === 'max_tokens') {
    // A cut-off tool call is partial JSON — some lines silently missing. Better to
    // say so than to fill half a quotation.
    throw new Error('The quotation has more lines than one read can hold — please enter the prices manually.');
  }

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_quotation',
  );
  const rawLines = (block?.input as { lines?: unknown } | undefined)?.lines;
  const rows = Array.isArray(rawLines) ? (rawLines as Array<Record<string, unknown>>) : [];

  // Never trust an id the model invents: keep only ids we actually sent.
  const validIds = new Set(items.map((i) => i.id));
  const lines: DirectExtractedLine[] = [];
  const unmatched: string[] = [];

  for (const row of rows) {
    const price = Number(row?.unit_price);
    if (!(price > 0)) continue;
    const name = String(row?.item_name ?? '').trim();
    const idRaw = String(row?.rfq_item_id ?? '').trim();
    const grade = String(row?.match ?? '').trim();
    const id = validIds.has(idRaw) && grade !== 'none' ? idRaw : null;
    if (!id && name) unmatched.push(name);
    const requested = id ? items.find((i) => i.id === id)?.item_name ?? '' : '';
    lines.push({
      rfq_item_id: id,
      item_name: name,
      unit_price: price,
      // A person confirms anything the model was unsure of, and anything whose
      // name shares no word with what was asked for — whatever the model said.
      uncertain: !!id && (grade !== 'same' || !namesShareAWord(requested, name)),
      manufacturer: asSpec(row?.manufacturer),
      quality_grade: asSpec(row?.quality_grade),
      concentration: asSpec(row?.concentration),
      other_specs: asSpec(row?.other_specs),
    });
  }

  const input = (block?.input ?? {}) as Record<string, unknown>;
  const v = (input.vendor ?? {}) as Record<string, unknown>;
  const vendor: DirectExtractedVendor = {
    name: asSpec(v.name),
    gstin: asSpec(v.gstin),
    phone: asSpec(v.phone),
    email: asSpec(v.email),
    address: asSpec(v.address),
    contact_person: asSpec(v.contact_person),
  };
  const days = Number(input.delivery_days);

  return {
    version: EXTRACT_RESULT_VERSION,
    vendor: Object.values(vendor).some(Boolean) ? vendor : null,
    quote_number: asSpec(input.quote_number),
    delivery_days: Number.isInteger(days) && days > 0 ? days : null,
    payment_terms: asSpec(input.payment_terms),
    lines,
    unmatched_note: unmatched.length
      ? `Not matched to any requested item: ${unmatched.join(', ')}`
      : null,
  };
}
