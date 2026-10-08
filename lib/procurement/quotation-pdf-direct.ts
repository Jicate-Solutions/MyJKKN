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

export const QUOTATION_EXTRACT_API_FEATURE = 'procurement.quotation_extract_api';

import {
  EXTRACT_RESULT_VERSION,
  RECORD_TOOL,
  buildExtractPrompt,
  normalizeExtraction,
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
 * Read unit prices off a quotation PDF and match them to the RFQ's items.
 * `pdfBase64` is the raw PDF bytes, base64-encoded, no data: prefix.
 */
export async function extractQuotationDirect(
  pdfBase64: string,
  items: DirectExtractItem[],
): Promise<DirectExtractResult> {
  // The model now and then returns an empty tool call for a clearly priced PDF; one more
  // read almost always gets it, and an empty reading is never useful to a person.
  const first = await extractQuotationOnce(pdfBase64, items);
  return first.lines.length ? first : extractQuotationOnce(pdfBase64, items);
}

async function extractQuotationOnce(
  pdfBase64: string,
  items: DirectExtractItem[],
): Promise<DirectExtractResult> {
  const apiKey = directExtractApiKey();
  if (!apiKey) throw new Error('No Claude API key is configured for direct PDF reading.');
  const client = new Anthropic({ apiKey });

  const { model_id: modelId } = await resolveChatModel(QUOTATION_EXTRACT_API_FEATURE);

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
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            { type: 'text', text: buildExtractPrompt(items) },
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
  return normalizeExtraction(block?.input, items);
}
