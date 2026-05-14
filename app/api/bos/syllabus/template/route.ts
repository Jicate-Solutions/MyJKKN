import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildSyllabusTemplate } from '@/lib/utils/bos/syllabus-xlsx';

export const runtime = 'nodejs';

/**
 * GET /api/bos/syllabus/template — empty multi-sheet XLSX with example rows.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const buffer = await buildSyllabusTemplate();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="syllabus-template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Template download error:', error);
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
  }
}
