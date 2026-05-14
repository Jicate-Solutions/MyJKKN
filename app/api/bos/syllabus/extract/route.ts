import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseSyllabusText,
  parseSyllabusSheetsWithWarnings,
  summarise,
} from '@/lib/utils/bos/syllabus-parser';

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
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 10 MB' }, { status: 413 });
    }

    const lowerName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
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
    } else if (lowerName.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      const sheets: Record<string, string[][]> = {};
      for (const name of workbook.SheetNames) {
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
          header: 1, defval: '', raw: false,
        });
        sheets[name] = rawRows.map((row) =>
          (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '').trim()),
        );
      }

      const { data: parsed, warnings } = parseSyllabusSheetsWithWarnings(sheets);
      return NextResponse.json({ data: parsed, summary: summarise(parsed), warnings });
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
    return NextResponse.json({
      data: parsed,
      summary: summarise(parsed),
      warnings: [],
    });
  } catch (error) {
    console.error('Syllabus extraction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract' },
      { status: 500 },
    );
  }
}
