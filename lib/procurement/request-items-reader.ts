// lib/procurement/request-items-reader.ts
//
// Reads a file a requester shares — an Excel/CSV sheet, a PDF, a photo of a
// handwritten list, a Word document or plain text — into clean request lines
// (item, specification, quantity, unit, reason) with Claude.
//
// Spreadsheets, Word and text are turned into text first (the model reads a
// sheet far more reliably as CSV than as a rendered image); PDFs and images go
// to the model as they are. Model and spend are governed from /admin/ai-models
// under the procurement document-reading feature key, and every call lands in
// ai_model_usage via recordChatCall.

import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { recordChatCall, resolveChatModel } from '@/lib/services/platform/ai-clients/chat';
import { anthropicApiKey } from '@/lib/services/platform/ai-clients/api-key';
import { QUOTATION_EXTRACT_API_FEATURE } from '@/lib/procurement/quotation-pdf-direct';

export interface ReadRequestLine {
  item_name: string;
  spec: string | null;
  quantity: number;
  unit: string | null;
  reason: string | null;
}

export interface ReadRequestResult {
  lines: ReadRequestLine[];
  /** Anything the model could not use (totals, headings, unreadable rows), in plain words. */
  note: string | null;
}

export const MAX_REQUEST_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type FileKind = 'pdf' | 'image' | 'sheet' | 'word' | 'text';

export function kindOf(name: string, mime: string): FileKind | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (IMAGE_TYPES.has(mime) || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) return 'sheet';
  if (ext === 'docx') return 'word';
  if (['txt', 'text', 'md'].includes(ext) || mime.startsWith('text/')) return 'text';
  return null;
}

/** Every sheet of a workbook as CSV, each under its sheet name. */
function sheetToText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return wb.SheetNames.map((n) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false }).trim();
    return csv ? `### Sheet: ${n}\n${csv}` : '';
  })
    .filter(Boolean)
    .join('\n\n');
}

const RECORD_TOOL: Anthropic.Tool = {
  name: 'record_request_items',
  description: 'Record every item the person wants to buy, as listed in the shared file.',
  input_schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        description: 'One entry per item to buy, in the order the file lists them.',
        items: {
          type: 'object',
          properties: {
            item_name: {
              type: 'string',
              description:
                'The product itself, short and plain, as a store would call it ("Nitrile gloves", "A4 paper"). ' +
                'Put size/brand/grade/model in spec, not here. Fix obvious spelling mistakes.',
            },
            spec: {
              type: 'string',
              description: 'Size, brand, model, grade, concentration, pack size or colour, if given. Omit if none.',
            },
            quantity: {
              type: 'number',
              description:
                'How many are wanted, as a plain number. Use 1 only when the file gives no quantity. ' +
                'When a pack size is given ("Ammonium chloride 500 g × 2"), count PACKS: quantity 2, and "500 g" goes in spec.',
            },
            unit: {
              type: 'string',
              description:
                'The unit the quantity is counted in (Nos, Box, Pkt, Bottle, Ream…), if given. Omit if none. ' +
                'Never g/ml when the quantity counts packs — "500 g" is the pack, not the unit.',
            },
            reason: {
              type: 'string',
              description: 'Why it is needed / purpose / remarks, if the file says. Omit if not stated.',
            },
          },
          required: ['item_name', 'quantity'],
        },
      },
      note: {
        type: 'string',
        description:
          'One short plain sentence about anything left out or unclear (e.g. "Row 7 was unreadable", ' +
          '"Skipped the total row"). Omit when everything was read cleanly.',
      },
    },
    required: ['lines'],
  },
};

const INSTRUCTIONS =
  'This file is a list of things a college department wants the store to buy. ' +
  'Record every item to buy with its quantity. Read tables row by row; for a handwritten or photographed list ' +
  'read each line carefully. Skip headings, serial numbers, totals, prices, signatures, addresses and page furniture ' +
  '— they are not items. Merge a line that only continues the previous item\'s description into that item. ' +
  'If the same item appears twice with the same specification, keep both lines as written. ' +
  'Never invent items or quantities that are not in the file.';

// Small models sometimes fill an absent field with a placeholder instead of omitting it.
const PLACEHOLDER = /^(<?\s*(unknown|n\/?a|na|none|null|nil|-|not (stated|specified|given|mentioned))\s*>?|-+|—|\?+)$/i;
const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && !PLACEHOLDER.test(s) ? s : null;
};

export async function readRequestItems(file: { name: string; mime: string; bytes: Buffer }): Promise<ReadRequestResult> {
  const kind = kindOf(file.name, file.mime);
  if (!kind) {
    throw new Error('This file type cannot be read. Use Excel, CSV, PDF, Word (.docx), a photo, or a text file.');
  }
  const apiKey = anthropicApiKey();
  if (!apiKey) throw new Error('AI reading is not available right now — please add the items by hand.');

  let content: Anthropic.ContentBlockParam[];
  if (kind === 'pdf') {
    content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.bytes.toString('base64') } },
      { type: 'text', text: INSTRUCTIONS },
    ];
  } else if (kind === 'image') {
    const mediaType = (IMAGE_TYPES.has(file.mime) ? file.mime : 'image/jpeg') as
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp'
      | 'image/gif';
    content = [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: file.bytes.toString('base64') } },
      { type: 'text', text: INSTRUCTIONS },
    ];
  } else {
    const text =
      kind === 'sheet'
        ? sheetToText(file.bytes)
        : kind === 'word'
          ? (await mammoth.extractRawText({ buffer: file.bytes })).value
          : file.bytes.toString('utf8');
    if (!text.trim()) throw new Error('The file is empty — nothing to read.');
    if (text.length > MAX_TEXT_CHARS) {
      throw new Error('The file is too long to read in one go — split it into smaller lists.');
    }
    content = [{ type: 'text', text: `${INSTRUCTIONS}\n\nFile "${file.name}":\n\n${text}` }];
  }

  const client = new Anthropic({ apiKey });
  const { model_id: modelId } = await resolveChatModel(QUOTATION_EXTRACT_API_FEATURE);
  const startedAt = Date.now();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: modelId,
      max_tokens: 8192,
      tools: [RECORD_TOOL],
      tool_choice: { type: 'tool', name: RECORD_TOOL.name },
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    await recordChatCall(QUOTATION_EXTRACT_API_FEATURE, 'anthropic', modelId, startedAt, null, err);
    throw err;
  }
  await recordChatCall(QUOTATION_EXTRACT_API_FEATURE, 'anthropic', modelId, startedAt, message);

  if (message.stop_reason === 'max_tokens') {
    // A cut-off tool call silently drops the last lines — say so instead.
    throw new Error('The list is too long to read in one go — split it into smaller files.');
  }

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === RECORD_TOOL.name
  );
  const input = (block?.input ?? {}) as { lines?: unknown; note?: unknown };
  const rows = Array.isArray(input.lines) ? (input.lines as Array<Record<string, unknown>>) : [];

  const lines: ReadRequestLine[] = [];
  for (const r of rows) {
    const name = clean(r?.item_name);
    if (!name) continue;
    const qty = Number(r?.quantity);
    lines.push({
      item_name: name,
      spec: clean(r?.spec),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: clean(r?.unit),
      reason: clean(r?.reason),
    });
  }
  return { lines, note: clean(input.note) };
}
