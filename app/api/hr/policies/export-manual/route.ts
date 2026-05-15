// =====================================================================
// /api/hr/policies/export-manual
// =====================================================================
// Wave 3 M10 — HR Policy Manual auto-generator endpoint.
// GET ?format=pdf|html|json&institution_id=<uuid>
//
// Responses:
//   format=html  → text/html
//   format=json  → application/json
//   format=pdf   → application/pdf (Content-Disposition: attachment)
//
// Auth: requires authenticated user. RLS on `platform_policies` further
// enforces super_admin / admin only — the underlying read won't return
// rows for unauthorized roles.
// =====================================================================

export const dynamic = 'force-dynamic';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection, type NextRequest } from 'next/server';

import { ManualExporterService } from '@/lib/services/hr/manual-exporter-service';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            /* server-component invocation — set is a no-op */
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            /* server-component invocation */
          }
        },
      },
    }
  );
}

function slugifyName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function GET(request: NextRequest) {
  await connection();

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || 'html').toLowerCase();
  const institutionId = url.searchParams.get('institution_id');

  if (!institutionId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: institution_id' },
      { status: 400 }
    );
  }

  if (!['pdf', 'html', 'json'].includes(format)) {
    return NextResponse.json(
      { error: `Unsupported format: ${format} (allowed: pdf|html|json)` },
      { status: 400 }
    );
  }

  const supabase = await getClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (format === 'html') {
      const html = await ManualExporterService.exportAsHtml(supabase, institutionId);
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'json') {
      const json = await ManualExporterService.exportAsJson(supabase, institutionId);
      return NextResponse.json(json, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // format === 'pdf'
    const bundle = await ManualExporterService.build(supabase, institutionId);
    const pdfBytes = await ManualExporterService.exportAsPdf(supabase, institutionId);
    const filename = `hr-policy-manual-${slugifyName(bundle.institution.name) || 'institution'}.pdf`;
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'Manual export failed', detail: msg },
      { status: 500 }
    );
  }
}
