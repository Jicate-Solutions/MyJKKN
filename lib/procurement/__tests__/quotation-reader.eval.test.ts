// Reader eval: runs real vendor quotation PDFs through the SAME prompt, schema and parsing the
// app uses (quotation-extract-core.ts) and scores each reading against the quotation's own
// printed numbers (quotation-math.ts). Costs a few paise per PDF, so it only runs on request:
//
//   RUN_READER_EVAL=1 npx vitest run lib/procurement/__tests__/quotation-reader.eval.test.ts
//
// Optional: EVAL_PDF_DIR (default ~/Downloads), EVAL_MODEL, EVAL_OUT (JSON report path).
// Add a PDF by adding a case below; `expect` pins what a person has checked by eye.

import fs from 'fs';
import os from 'os';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  RECORD_TOOL,
  buildExtractPrompt,
  normalizeExtraction,
  type DirectExtractItem,
  type DirectExtractResult,
} from '../quotation-extract-core';
import { checkQuotationMath } from '../quotation-math';

interface Case {
  file: string;
  /** What was requested when this quotation arrived. */
  items?: DirectExtractItem[];
  /** Checked by eye against the PDF. */
  expect?: {
    statedTotal?: number;
    minLines?: number;
    setParts?: number;
    /** A line whose name matches must carry this NET unit price (after discount, before GST). */
    unitPrices?: Array<{ name: RegExp; price: number }>;
  };
}

const COMPUTER: DirectExtractItem[] = [{ id: 'computer', item_name: 'Computer', item_spec: null, quantity: 25, unit_label: 'Nos' }];

const CASES: Case[] = [
  { file: 'JKKN REVISED.pdf', items: COMPUTER, expect: { statedTotal: 21800, minLines: 9, setParts: 9 } },
  { file: 'Jothi i5 6th.pdf', items: COMPUTER },
  { file: 'Jothi.pdf', items: COMPUTER },
  { file: 'MGS i5 6th.pdf', items: COMPUTER },
  { file: 'Deep I5 6TH.pdf', items: COMPUTER },
  { file: 'Infinity Solution.pdf', items: COMPUTER },
  { file: 'Airpath.pdf' },
  { file: 'Amman IT Park.pdf' },
  { file: 'Estimate-EST-433.pdf' },
  { file: 'Estimate-EST-434.pdf' },
  // Prints rate and amount only, GST added per line.
  { file: 'clt chemico.pdf', expect: { minLines: 55, unitPrices: [{ name: /molish/i, price: 135 }] } },
  // Prints MRP 299, discount 55%, net 134.55 — the list price must not be taken.
  { file: 'global clt.pdf', expect: { minLines: 55, unitPrices: [{ name: /molisch/i, price: 134.55 }, { name: /sulphuric acid 98/i, price: 211.5 }] } },
  // Prints MRP 299 × 5 less 38% = 926.90, so the net rate is 185.38.
  { file: 'precision clt.pdf', expect: { minLines: 55, unitPrices: [{ name: /molisch/i, price: 185.38 }] } },
];

/** vitest does not load .env.local into process.env, so read the key from it. */
function apiKey(): string | null {
  const direct = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (direct) return direct;
  try {
    const env = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
    const m = env.match(/^(?:CLAUDE_API_KEY|ANTHROPIC_API_KEY)=(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

/** A dropped connection is not a reading problem: try again before giving up. */
async function createWithRetry(client: Anthropic, params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw last;
}

async function read(client: Anthropic, model: string, pdf: Buffer, items: DirectExtractItem[]): Promise<DirectExtractResult> {
  const message = await createWithRetry(client, {
    model,
    max_tokens: 16384,
    tools: [RECORD_TOOL],
    tool_choice: { type: 'tool', name: 'record_quotation' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          { type: 'text', text: buildExtractPrompt(items) },
        ],
      },
    ],
  });
  if (message.stop_reason === 'max_tokens') throw new Error('reply cut off at max_tokens');
  const block = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_quotation');
  return normalizeExtraction(block?.input, items);
}

describe.skipIf(!process.env.RUN_READER_EVAL)('quotation reader eval', () => {
  it(
    'reads every sample quotation and the numbers add up',
    async () => {
      const key = apiKey();
      expect(key, 'CLAUDE_API_KEY not found').toBeTruthy();
      const client = new Anthropic({ apiKey: key as string });
      const model = process.env.EVAL_MODEL || 'claude-haiku-4-5-20251001';
      const dir = process.env.EVAL_PDF_DIR || path.join(os.homedir(), 'Downloads');

      const report: Array<Record<string, unknown>> = [];
      const failures: string[] = [];

      const only = process.env.EVAL_ONLY ? new RegExp(process.env.EVAL_ONLY, 'i') : null;
      for (const c of CASES) {
        if (only && !only.test(c.file)) continue;
        const file = path.join(dir, c.file);
        if (!fs.existsSync(file)) {
          report.push({ file: c.file, status: 'missing' });
          continue;
        }
        let result: DirectExtractResult;
        try {
          const pdf = fs.readFileSync(file);
          result = await read(client, model, pdf, c.items ?? []);
          // Mirrors extractQuotationDirect: one more read when the first comes back empty.
          if (!result.lines.length) result = await read(client, model, pdf, c.items ?? []);
        } catch (e) {
          report.push({ file: c.file, status: 'error', error: e instanceof Error ? e.message : String(e) });
          failures.push(`${c.file}: could not be read`);
          continue;
        }
        const math = checkQuotationMath(result);
        const forItem = result.lines.filter((l) => l.rfq_item_id);
        report.push({
          file: c.file,
          status: math.issues.length ? 'check' : 'ok',
          vendor: result.vendor?.name ?? null,
          lines: result.lines.length,
          matched_lines: forItem.length,
          lines_sum: math.lines_sum,
          stated_total: result.stated_total,
          total_agrees: math.total_agrees,
          no_total_printed: result.stated_total == null,
          issues: math.issues,
          lines_preview: result.lines.slice(0, 12).map((l) => `${l.item_name} | rate ${l.unit_price} | qty ${l.quantity ?? '-'} | amt ${l.line_total ?? '-'} | ${l.rfq_item_id ? 'matched' : 'unmatched'}`),
        });

        const want = c.expect;
        if (want?.statedTotal != null && result.stated_total !== want.statedTotal) {
          failures.push(`${c.file}: printed total read as ${result.stated_total}, expected ${want.statedTotal}`);
        }
        if (want?.minLines != null && result.lines.length < want.minLines) {
          failures.push(`${c.file}: ${result.lines.length} lines read, expected at least ${want.minLines}`);
        }
        if (want?.setParts != null && forItem.length !== want.setParts) {
          failures.push(`${c.file}: ${forItem.length} parts tagged to the set, expected ${want.setParts}`);
        }
        for (const u of want?.unitPrices ?? []) {
          const hit = result.lines.find((l) => u.name.test(l.item_name));
          if (!hit) failures.push(`${c.file}: no line matching ${u.name}`);
          else if (Math.abs(hit.unit_price - u.price) > 0.011) failures.push(`${c.file}: ${hit.item_name} read at ${hit.unit_price}, expected ${u.price}`);
        }
        if (want?.statedTotal != null && math.total_agrees === false) {
          failures.push(`${c.file}: lines add up to ${math.lines_sum}, printed total ${result.stated_total}`);
        }
      }

      const out = process.env.EVAL_OUT;
      if (out) fs.writeFileSync(out, JSON.stringify({ model, report, failures }, null, 2));
      console.log(JSON.stringify({ model, summary: report.map((r) => ({ file: r.file, status: r.status, lines: r.lines, sum: r.lines_sum, total: r.stated_total, agrees: r.total_agrees })), failures }, null, 1));
      expect(failures).toEqual([]);
    },
    900_000
  );
});
