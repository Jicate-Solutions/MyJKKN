export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { ExportService } from '@/lib/services/hr/recruitment-need/export-service';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const format = url.searchParams.get('format') ?? 'xlsx';
    const institution_id = url.searchParams.get('institution_id') ?? undefined;
    const financial_year = url.searchParams.get('financial_year') ?? undefined;

    const rows = await ExportService.getExportData(supabase, { institution_id, financial_year });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No signal data found for the given scope' }, { status: 404 });
    }

    const title = `HR Recruitment Need Signals${financial_year ? ` — FY ${financial_year}` : ''}`;

    if (format === 'pdf') {
      const html = ExportService.generatePrintableHtml(rows, title);
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'inline; filename="recruitment-signals.html"',
        },
      });
    }

    const buffer = await ExportService.generateXlsx(rows);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="recruitment-signals-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
