import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  hasAnyBosPermission,
  isBosReadAllObserver,
  BOS_LOOKUP_VIEW_KEYS,
} from '@/lib/utils/bos/bos-access';
import { intersectBosScope } from '@/lib/utils/bos/institution-scope';
import { resolvePoPsoTarget } from '@/lib/utils/bos/po-pso-access';

interface DepartmentOption {
  id: string;
  institution_id: string;
  department_code: string;
  department_name: string;
}

interface ProgrammeOption {
  id: string;
  institution_id: string;
  department_id: string | null;
  program_code: string;
  program_name: string;
}

/**
 * GET /api/bos/po-pso/context?institutionsId=<uuid>
 *
 * The Institution → Department → Programme filter chain for /bos/po-pso.
 * Returns the institution's departments and programmes (CAS-expanded), and
 * the HOD lock: when the caller heads departments at this institution and is
 * neither super-admin nor principal nor a read-all observer, the lists are
 * restricted to those departments and `hod.locked` is true so the UI
 * pre-selects and disables the Department picker.
 *
 * institutionsId may be a MyJKKN UUID or a COE UUID (super-admin picker).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const requestedId = request.nextUrl.searchParams.get('institutionsId');
    if (!requestedId) {
      return NextResponse.json({ error: 'institutionsId is required' }, { status: 400 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const hasView = await hasAnyBosPermission(user.id, BOS_LOOKUP_VIEW_KEYS);
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const seeAll = scope.isSuperAdmin || canReadAllBos;

    const db = createServiceRoleClient();
    const target = await resolvePoPsoTarget(db, requestedId);
    if (!target) {
      return NextResponse.json({
        data: { institution_ids: [], departments: [], programmes: [], hod: { locked: false, department_ids: [] } },
      });
    }

    if (!seeAll) {
      const allowed = await intersectBosScope(supabase, scope, target.ids);
      const memberAllowed = target.ids.some((id) => scope.institutionsOf.has(id));
      if (allowed.length === 0 && !memberAllowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const [deptRes, progRes] = await Promise.all([
      db
        .from('departments')
        .select('id, institution_id, department_code, department_name')
        .in('institution_id', target.ids)
        .order('department_order', { ascending: true })
        .order('department_name', { ascending: true }),
      db
        .from('programs')
        .select('id, institution_id, department_id, program_id, program_name, display_name')
        .in('institution_id', target.ids)
        .eq('is_active', true)
        .order('program_order', { ascending: true, nullsFirst: false })
        .order('program_name', { ascending: true }),
    ]);
    if (deptRes.error) throw deptRes.error;
    if (progRes.error) throw progRes.error;

    let departments = (deptRes.data ?? []) as DepartmentOption[];
    let programmes = ((progRes.data ?? []) as Array<{
      id: string; institution_id: string; department_id: string | null;
      program_id: string; program_name: string; display_name: string | null;
    }>).map((p) => ({
      id: p.id,
      institution_id: p.institution_id,
      department_id: p.department_id,
      program_code: p.program_id,
      program_name: p.display_name || p.program_name,
    })) as ProgrammeOption[];

    // HOD lock — only when the HOD is not otherwise entitled to the whole
    // institution (super-admin / principal / observer / board member).
    const hodDeptsHere = departments.filter((d) => scope.hodDepartmentIds.has(d.id)).map((d) => d.id);
    const wholeInstitution =
      seeAll ||
      (scope.isPrincipal && target.ids.some((id) => scope.allInstitutionIds.includes(id))) ||
      target.ids.some((id) => scope.institutionsOf.has(id));
    const locked = hodDeptsHere.length > 0 && !wholeInstitution;

    if (locked) {
      const keep = new Set(hodDeptsHere);
      departments = departments.filter((d) => keep.has(d.id));
      programmes = programmes.filter((p) => p.department_id && keep.has(p.department_id));
    }

    return NextResponse.json({
      data: {
        institution_ids: target.ids,
        departments,
        programmes,
        hod: { locked, department_ids: hodDeptsHere },
      },
    });
  } catch (error) {
    console.error('[GET /api/bos/po-pso/context]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
