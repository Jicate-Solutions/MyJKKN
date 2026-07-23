// POST /api/cdc/exports/flex — agent ζ Sprint 7b

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateFlexExport } from '@/lib/services/cdc/export-service';
import type { FlexExportRequest, FlexTable } from '@/types/cdc/exports';

const ALLOWED_TABLES: FlexTable[] = [
  'cdc_placements',
  'cdc_drives',
  'cdc_training_enrollments',
];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as FlexExportRequest;
    const { table, columns, dateFrom, dateTo, format = 'csv' } = body;

    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json(
        { error: `table must be one of: ${ALLOWED_TABLES.join(', ')}` },
        { status: 400 }
      );
    }
    if (!Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json({ error: 'columns array is required' }, { status: 400 });
    }
    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 });
    }
    if (!['csv', 'xlsx'].includes(format)) {
      return NextResponse.json({ error: 'format must be csv or xlsx' }, { status: 400 });
    }

    const { data, filename, mime } = await generateFlexExport(body);

    const headers: Record<string, string> = {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'x-filename': filename,
    };

    if (Buffer.isBuffer(data)) {
      return new NextResponse(data, { status: 200, headers });
    }
    return new NextResponse(data as string, { status: 200, headers });
  } catch (e) {
    console.error('[cdc/exports/flex] error', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
