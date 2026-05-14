import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildSyllabusTemplate } from '@/lib/utils/bos/syllabus-xlsx';

<<<<<<< Updated upstream
export const runtime = 'nodejs';

/**
 * GET /api/bos/syllabus/template — empty multi-sheet XLSX with example rows.
 */
=======
/**
 * GET /api/bos/syllabus/template
 *
 * Returns an empty multi-sheet XLSX template with example rows for users to
 * fill in. The same sheet layout is used by the import (extract) endpoint
 * so users can round-trip: download → edit → import.
 */
export const runtime = 'nodejs';

>>>>>>> Stashed changes
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const buffer = await buildSyllabusTemplate();
<<<<<<< Updated upstream
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="syllabus-template.xlsx"',
=======

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          'attachment; filename="syllabus-template.xlsx"',
>>>>>>> Stashed changes
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Template download error:', error);
<<<<<<< Updated upstream
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
=======
    return NextResponse.json(
      { error: 'Failed to generate template' },
      { status: 500 },
    );
>>>>>>> Stashed changes
  }
}
