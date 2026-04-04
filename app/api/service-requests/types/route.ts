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

    // Resolve the requesting user's roles so we can filter service types
    // by allowed_roles. Superadmins bypass the filter entirely.
    const supabase = await createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id, department_id')
      .eq('id', session.user.id)
      .single();

    const isSuperAdmin =
      profile?.is_super_admin === true || profile?.role === 'super_admin';

    if (isSuperAdmin) {
      filters.isSuperAdmin = true;
    } else {
      // Collect the primary role from profiles + all additional roles from user_roles
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

    // Build user scope context for filtering scoped service types.
    // Non-admin users get types filtered by their org membership.
    const scopeParam = searchParams.get('scope');
    if (scopeParam === 'user' && profile && !isSuperAdmin) {
      const userScope: { institution_id?: string; degree_id?: string; department_id?: string; program_id?: string } = {};
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
