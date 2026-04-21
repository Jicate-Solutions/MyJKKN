export const dynamic = 'force-dynamic';

import { NextResponse , connection } from 'next/server';
import { z } from 'zod';
import { getAuthSession, createServerSupabaseClient } from '@/lib/supabase/server';
import { ServiceTypeService } from '@/lib/services/service-requests/service-type-service';
import { createServiceTypeSchema, type CreateServiceTypeDto } from '@/types/service-request';

export async function GET(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('is_active');

    const filters: Parameters<typeof ServiceTypeService.getServiceTypes>[0] = {};
    if (isActive !== null) {
      filters.is_active = isActive === 'true';
    }

    // Resolve the caller and decide which read mode to use.
    //
    // Three mutually exclusive modes:
    //   1. Super admin — see everything.
    //   2. Manager/catalog mode — caller holds service_requests.types.view.
    //      Used by the /service-requests/types page. Skips the
    //      allowed_roles filter (managers must see every type in their
    //      institution regardless of submitter eligibility) and scopes
    //      results to the caller's institution.
    //   3. Requester mode — caller is submitting a request. Applies the
    //      allowed_roles filter so they only see types they're eligible
    //      to submit. When `scope=user` is passed, further narrows to
    //      the caller's org context (degree/department/program).
    const supabase = await createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id, department_id')
      .eq('id', session.user.id)
      .single();

    const isSuperAdmin =
      profile?.is_super_admin === true || profile?.role === 'super_admin';

    const scopeParam = searchParams.get('scope');
    const isExplicitRequesterMode = scopeParam === 'user';

    if (isSuperAdmin) {
      filters.isSuperAdmin = true;
    } else if (isExplicitRequesterMode) {
      // Explicit requester flow — apply allowed_roles + user org scope
      const roleKeys = new Set<string>();
      if (profile?.role) roleKeys.add(profile.role);

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('custom_roles(role_key)')
        .eq('user_id', session.user.id);

      if (userRoles) {
        for (const ur of userRoles as any[]) {
          const key = ur.custom_roles?.role_key;
          if (key) roleKeys.add(key);
        }
      }

      filters.userRoleKeys = [...roleKeys];

      if (profile) {
        const userScope: {
          institution_id?: string;
          degree_id?: string;
          department_id?: string;
          program_id?: string;
        } = {};
        if (profile.institution_id) userScope.institution_id = profile.institution_id;
        if (profile.department_id) userScope.department_id = profile.department_id;

        // For students, resolve degree_id and program_id from learner_profiles
        if (profile.role === 'student') {
          const { data: learner, error: learnerError } = await supabase
            .from('learner_profiles')
            .select('degree_id, program_id')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (learnerError) {
            console.warn('[service-requests/types] Failed to fetch learner profile for scope:', learnerError.message);
          } else if (learner) {
            if (learner.degree_id) userScope.degree_id = learner.degree_id;
            if (learner.program_id) userScope.program_id = learner.program_id;
          }
        }

        // For faculty/staff, resolve degree_id from department's parent
        if (profile.department_id && !userScope.degree_id) {
          const { data: dept } = await supabase
            .from('departments')
            .select('degree_id')
            .eq('id', profile.department_id)
            .maybeSingle();

          if (dept?.degree_id) userScope.degree_id = dept.degree_id;
        }

        filters.userScope = userScope;
      }
    } else {
      // Default path: manager if they carry service_requests.types.view,
      // otherwise fall back to requester-style allowed_roles filtering
      // (preserves old behavior for legacy callers hitting this endpoint
      // without scope=user).
      const { data: canManageCatalog } = await supabase.rpc('user_has_permission', {
        permission_name: 'service_requests.types.view',
      });

      if (canManageCatalog === true) {
        filters.isManagerMode = true;
        if (profile?.institution_id) {
          filters.managerInstitutionId = profile.institution_id;
        }
      } else {
        const roleKeys = new Set<string>();
        if (profile?.role) roleKeys.add(profile.role);

        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('custom_roles(role_key)')
          .eq('user_id', session.user.id);

        if (userRoles) {
          for (const ur of userRoles as any[]) {
            const key = ur.custom_roles?.role_key;
            if (key) roleKeys.add(key);
          }
        }

        filters.userRoleKeys = [...roleKeys];
      }
    }

    const types = await ServiceTypeService.getServiceTypes(filters);
    return NextResponse.json(types);
  } catch (error) {
    console.error('[service-requests/types] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const validated = createServiceTypeSchema.parse(json) as CreateServiceTypeDto;

    const serviceType = await ServiceTypeService.createServiceType(
      validated,
      session.user.id
    );

    return NextResponse.json(serviceType, { status: 201 });
  } catch (error) {
    console.error('[service-requests/types] POST error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('duplicate')) {
      return NextResponse.json({ error: 'A service type with this slug already exists' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
