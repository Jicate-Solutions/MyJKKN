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
import { needsReread, pdfPageCount, readingTrouble } from '@/lib/procurement/quotation-math';

export const QUOTATION_EXTRACT_API_FEATURE = 'procurement.quotation_extract_api';

/**
 * The steadier reader. Measured 2026-10-09 over the reader eval (13 real quotations,
 * several runs): on one-page quotations the configured fast model (Haiku 5.5) was right
 * every time in 3–8 s; on 3–4 page, 60-line quotations it dropped lines, stopped after
 * one line or took a pack size for the quantity in most runs, while Haiku 4.5 (~50–80 s)
 * was right. So a multi-page PDF goes straight to this model, and a one-page reading
 * that fails the quotation's own arithmetic is read again by it.
 */
export const STEADY_READER_MODEL = 'claude-haiku-4-5';

import {
  EXTRACT_RESULT_VERSION,
  RECORD_TOOL,
  SECOND_LOOK_TOOL,
  applySecondLook,
  buildExtractPrompt,
  buildSecondLookPrompt,
  normalizeExtraction,
  openForSecondLook,
  type DirectExtractItem,
  type DirectExtractResult,
} from '@/lib/procurement/quotation-extract-core';

export { EXTRACT_RESULT_VERSION };
export type {
  DirectExtractItem,
  DirectExtractedLine,
  DirectExtractedVendor,
  DirectExtractResult,
} from '@/lib/procurement/quotation-extract-core';

/** Either key name works (see ai-clients/api-key.ts). */
export const directExtractApiKey = anthropicApiKey;

/**
 * What the vendor sent. Quotations arrive as PDFs, as phone photos of a printed
 * quote, and as Excel/CSV sheets (turned into text before they get here).
 */
export type QuotationSource =
  | { kind: 'pdf'; base64: string }
  | { kind: 'image'; base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
  | { kind: 'text'; text: string; fileName: string };

const sourceBlock = (src: QuotationSource): Anthropic.ContentBlockParam =>
  src.kind === 'pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: src.base64 } }
    : src.kind === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: src.mediaType, data: src.base64 } }
      : { type: 'text', text: `The vendor's quotation, from the spreadsheet "${src.fileName}":\n\n${src.text}` };

/**
 * Read unit prices off a quotation and match them to the RFQ's items.
 * A bare string is a base64 PDF (no data: prefix) — the original signature.
 */
export async function extractQuotationDirect(
  source: string | QuotationSource,
  items: DirectExtractItem[],
): Promise<DirectExtractResult> {
  const src: QuotationSource = typeof source === 'string' ? { kind: 'pdf', base64: source } : source;
  const pages = src.kind === 'pdf' ? pdfPageCount(Buffer.from(src.base64, 'base64')) : 0;
  const longPdf = pages >= 2;
  let result = await extractQuotationOnce(src, items, longPdf ? STEADY_READER_MODEL : undefined);
  // A fast reading that is empty or doesn't add up to the quotation's own printed numbers
  // is read again by the steadier model; the reading with less trouble is kept.
  if (!longPdf && needsReread(result, pages)) {
    try {
      const again = await extractQuotationOnce(src, items, STEADY_READER_MODEL);
      if (readingTrouble(again, pages) < readingTrouble(result, pages)) result = again;
    } catch {
      /* keep the first reading — its warnings are shown to the person */
    }
  }
  await secondLook(result, items);
  return result;
}

/**
 * Settle what the first read left open with one short text-only call. Best-effort:
 * if it fails, the first reading stands and a person confirms as before.
 */
async function secondLook(result: DirectExtractResult, items: DirectExtractItem[]): Promise<void> {
  const { openItems, openLines } = openForSecondLook(result, items);
  if (!openItems.length || !openLines.length) return;
  const apiKey = directExtractApiKey();
  if (!apiKey) return;
  const { model_id: modelId } = await resolveChatModel(QUOTATION_EXTRACT_API_FEATURE);
  const startedAt = Date.now();
  try {
    const message = await new Anthropic({ apiKey }).messages.create({
      model: modelId,
      max_tokens: 4096,
      tools: [SECOND_LOOK_TOOL],
      tool_choice: { type: 'tool', name: 'pair_lines' },
      messages: [{ role: 'user', content: buildSecondLookPrompt(openItems, openLines) }],
    });
    await recordChatCall(QUOTATION_EXTRACT_API_FEATURE, 'anthropic', modelId, startedAt, message);
    const block = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'pair_lines',
    );
    applySecondLook(result, items, openLines, block?.input);
  } catch (err) {
    await recordChatCall(QUOTATION_EXTRACT_API_FEATURE, 'anthropic', modelId, startedAt, null, err);
  }
}

async function extractQuotationOnce(
  src: QuotationSource,
  items: DirectExtractItem[],
  /** A model for this one read instead of the configured one (the steady re-read). */
  modelOverride?: string,
): Promise<DirectExtractResult> {
  const apiKey = directExtractApiKey();
  if (!apiKey) throw new Error('No Claude API key is configured for direct PDF reading.');
  const client = new Anthropic({ apiKey });

  const modelId = modelOverride ?? (await resolveChatModel(QUOTATION_EXTRACT_API_FEATURE)).model_id;

  const startedAt = Date.now();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: modelId,
      // Each line now carries quantity, amount and discount too: a 60-line quotation no longer fits 8k.
      max_tokens: 16384,
      tools: [RECORD_TOOL],
      tool_choice: { type: 'tool', name: 'record_quotation' },
      messages: [
        {
          role: 'user',
          content: [sourceBlock(src), { type: 'text', text: buildExtractPrompt(items) }],
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
  return normalizeExtraction(block?.input, items);
}
