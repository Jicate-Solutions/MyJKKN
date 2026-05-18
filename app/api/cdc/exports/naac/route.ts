// POST /api/cdc/exports/naac — agent ζ Sprint 7b

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateNaacExport } from '@/lib/services/cdc/export-service';
import type { ExportFormat } from '@/types/cdc/exports';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { cycle, format = 'csv' } = body as { cycle?: string; format?: ExportFormat };

    if (!cycle || !/^\d{4}-\d{2}$/.test(cycle)) {
      return NextResponse.json(
        { error: 'cycle is required (format: YYYY-YY, e.g. 2024-25)' },
        { status: 400 }
      );
    }
    if (!['csv', 'xlsx'].includes(format)) {
      return NextResponse.json({ error: 'format must be csv or xlsx' }, { status: 400 });
    }

    const { data, filename, mime } = await generateNaacExport(cycle, format);

    const body_: Buffer | string = data;
    const headers: Record<string, string> = {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'x-filename': filename,
    };

    if (Buffer.isBuffer(body_)) {
      return new NextResponse(body_, { status: 200, headers });
    }
    return new NextResponse(body_ as string, { status: 200, headers });
  } catch (e) {
    console.error('[cdc/exports/naac] error', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
