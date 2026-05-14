import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseSyllabusText,
  parseSyllabusSheetsWithWarnings,
  summarise,
} from '@/lib/utils/bos/syllabus-parser';

<<<<<<< Updated upstream
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/bos/syllabus/extract — accept a PDF/DOCX/XLSX file and return
 * the parsed structure ready to merge into the syllabus form. No data is
 * persisted.
 */
export async function POST(request: NextRequest) {
  try {
=======
/**
 * POST /api/bos/syllabus/extract
 *
 * Accept a PDF, DOCX, or XLSX syllabus document and return the parsed
 * structure ready to merge into the syllabus form. No data is persisted.
 *
 * Request:  multipart/form-data { file: File }
 * Response: { data: ParsedSyllabus, summary: ParseSummary }
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    // Authenticate — extraction is gated behind a signed-in BOS user
>>>>>>> Stashed changes
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
<<<<<<< Updated upstream
=======

>>>>>>> Stashed changes
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 10 MB' }, { status: 413 });
    }

    const lowerName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
<<<<<<< Updated upstream
    let text = '';

    if (lowerName.endsWith('.pdf')) {
      // pdf-parse is CJS — `.default` is unreliable under Next bundler, so
      // resolve the callable from either shape. /lib path skips the package
      // index.js test harness that throws ENOENT in node_modules.
      const mod: any = await import('pdf-parse/lib/pdf-parse.js').catch(
        () => import('pdf-parse'),
      );
      const pdfParse = mod.default ?? mod;
      const result = await pdfParse(buffer);
      text = result.text;
=======

    let text = '';

    if (lowerName.endsWith('.pdf')) {
      // pdf-parse v2 exposes a class API; convert Buffer → Uint8Array since
      // the parser expects raw byte data, not a Node Buffer wrapper.
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({
        data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      });
      try {
        const result = await parser.getText();
        text = result.text;
      } finally {
        await parser.destroy();
      }
>>>>>>> Stashed changes
    } else if (lowerName.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
<<<<<<< Updated upstream
=======
      // Multi-sheet aware path: convert each sheet to a 2D string matrix and
      // dispatch by sheet name. parseSyllabusSheets internally falls back to
      // the text parser when no sheet names match the expected sections.
>>>>>>> Stashed changes
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      const sheets: Record<string, string[][]> = {};
      for (const name of workbook.SheetNames) {
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
<<<<<<< Updated upstream
          header: 1, defval: '', raw: false,
=======
          header: 1,
          defval: '',
          raw: false,
>>>>>>> Stashed changes
        });
        sheets[name] = rawRows.map((row) =>
          (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '').trim()),
        );
      }

      const { data: parsed, warnings } = parseSyllabusSheetsWithWarnings(sheets);
<<<<<<< Updated upstream
      return NextResponse.json({ data: parsed, summary: summarise(parsed), warnings });
=======
      return NextResponse.json({
        data: parsed,
        summary: summarise(parsed),
        warnings,
      });
>>>>>>> Stashed changes
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Use PDF, DOCX, or XLSX.' },
        { status: 415 },
      );
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: 'Could not extract any text from the document' },
        { status: 422 },
      );
    }

    const parsed = parseSyllabusText(text);
<<<<<<< Updated upstream
    return NextResponse.json({
      data: parsed,
      summary: summarise(parsed),
      warnings: [],
=======

    return NextResponse.json({
      data: parsed,
      summary: summarise(parsed),
      warnings: [], // text-based parsing doesn't track per-row warnings yet
>>>>>>> Stashed changes
    });
  } catch (error) {
    console.error('Syllabus extraction error:', error);
    return NextResponse.json(
<<<<<<< Updated upstream
      { error: error instanceof Error ? error.message : 'Failed to extract' },
=======
      { error: error instanceof Error ? error.message : 'Failed to extract syllabus data' },
>>>>>>> Stashed changes
      { status: 500 },
    );
  }
}
