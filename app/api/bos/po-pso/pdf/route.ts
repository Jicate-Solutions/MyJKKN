export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  hasAnyBosPermission,
  resolveCoeInstitutionCode,
  BOS_LOOKUP_VIEW_KEYS,
} from '@/lib/utils/bos/bos-access';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import {
  canReadProgrammeOutcomes,
  isPoPsoReadAll,
  listOutcomes,
  resolveProgrammeOutcomeTarget,
} from '@/lib/utils/bos/programme-outcomes';
import { buildPoPsoPrintHtml } from '@/lib/utils/bos/po-pso-print-html';
import { renderSyllabusPdf, SyllabusRendererUnavailableError } from '@/lib/pdf/syllabus-pdf';
import type { BosProgrammeOutcome, BosProgrammeSpecificOutcome } from '@/types/bos';

/**
 * GET /api/bos/po-pso/pdf?institutionsId&regulationId&programmeCode[&disposition=inline]
 *
 * Streams the "Programme Outcomes & Programme Specific Outcomes" PDF for one
 * programme + regulation: institution letterhead (the same logo / name /
 * accreditation / address banner as the BoS course-document download, via
 * getInstitutionHeader), programme header, active POs, active PSOs, signature
 * strip. Same rows the /bos/po-pso PO and PSO tabs
 * show (bos_programme_outcomes / bos_programme_specific_outcomes) and the same
 * read authorization as GET /outcomes. The Course – PO/PSO matrix is screen-only.
 */
/** Inline a PNG under /public as a data URI; null when missing (never throws). */
function publicPngDataUri(publicPath: string | null | undefined): string | null {
  if (!publicPath) return null;
  try {
    const rel = publicPath.replace(/^\/+/, '');
    const bytes = readFileSync(join(process.cwd(), 'public', rel));
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch (e) {
    console.warn('[GET /api/bos/po-pso/pdf] logo not found:', publicPath, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const institutionsId = sp.get('institutionsId');
    const regulationId = sp.get('regulationId');
    const programmeCode = sp.get('programmeCode');
    const disposition = sp.get('disposition') === 'inline' ? 'inline' : 'attachment';
    if (!institutionsId || !regulationId || !programmeCode) {
      return NextResponse.json(
        { error: 'institutionsId, regulationId and programmeCode are required' },
        { status: 400 }
      );
    }

    const scope = await resolveBosBoardScope(user.id);
    const hasView = await hasAnyBosPermission(user.id, BOS_LOOKUP_VIEW_KEYS);
    const seeAll = isPoPsoReadAll(scope, hasView);

    const db = createServiceRoleClient();
    const target = await resolveProgrammeOutcomeTarget(
      db,
      { institutionsId, regulationId, programmeCode },
      { preferDepartmentIds: scope.hodDepartmentIds }
    );
    if (!target) return NextResponse.json({ error: 'Unknown institution' }, { status: 404 });

    if (!(await canReadProgrammeOutcomes(supabase, scope, target, seeAll))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Letterhead / header context — each lookup is best-effort: a missing row
    // only drops that line from the document, never the document itself.
    const departmentId = target.programme?.department_id ?? null;
    const [pos, psos, instRes, regRes, deptRes, coeCode] = await Promise.all([
      listOutcomes<BosProgrammeOutcome>(db, target, 'po'),
      listOutcomes<BosProgrammeSpecificOutcome>(db, target, 'pso'),
      db
        .from('institutions')
        .select('name, display_name')
        .eq('id', target.canonicalId)
        .maybeSingle(),
      db
        .from('regulations')
        .select('regulation_code, regulation_year')
        .eq('id', target.regulationId)
        .maybeSingle(),
      departmentId
        ? db.from('departments').select('department_name').eq('id', departmentId).maybeSingle()
        : Promise.resolve({ data: null as { department_name?: string | null } | null }),
      resolveCoeInstitutionCode(target.canonicalId).catch(() => null),
    ]);

    const inst = instRes.data as { name?: string; display_name?: string | null } | null;
    const reg = regRes.data as { regulation_code?: string | null; regulation_year?: string | null } | null;
    const dept = deptRes.data as { department_name?: string | null } | null;
    const institutionName = (inst?.display_name || inst?.name || '').trim();

    // Same branding resolution as the BoS course-document download
    // (row-actions.tsx → getInstitutionHeader(name, COE code)): CET / CAS / AHS
    // get their stationery text + logos, anyone else their own name.
    const header = getInstitutionHeader(institutionName || null, coeCode);

    const html = buildPoPsoPrintHtml({
      letterhead: {
        institution_name: header.institution_name,
        institution_accreditation: header.institution_accreditation,
        institution_address: header.institution_address,
        leftLogo: publicPngDataUri(header.logoImage ?? '/logo.png'),
        rightLogo: publicPngDataUri(header.rightLogoImage),
      },
      institutionName: institutionName || null,
      regulationCode: reg?.regulation_code ?? null,
      regulationYear: reg?.regulation_year != null ? String(reg.regulation_year) : null,
      programmeCode: target.programmeCode,
      programmeName: target.programme?.program_name ?? null,
      departmentName: dept?.department_name ?? null,
      pos: pos.map((r) => ({ code: r.po_code, description: r.description })),
      psos: psos.map((r) => ({ code: r.pso_code, description: r.description })),
    });

    let pdf: Buffer;
    try {
      pdf = await renderSyllabusPdf(html, {
        footerText: [target.programmeCode, target.programme?.program_name, institutionName]
          .filter(Boolean)
          .join(' · '),
      });
    } catch (err) {
      if (err instanceof SyllabusRendererUnavailableError) {
        return NextResponse.json({ error: 'PDF renderer is unavailable, retry shortly' }, { status: 503 });
      }
      throw err;
    }

    const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    const filename = [safe(target.programmeCode), reg?.regulation_code ? safe(reg.regulation_code) : '', 'PO-PSO']
      .filter(Boolean)
      .join('-') + '.pdf';

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.byteLength),
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[GET /api/bos/po-pso/pdf]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
