import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthSession, createServerSupabaseClient } from '@/lib/supabase/server';
import { ServiceTypeService } from '@/lib/services/service-requests/service-type-service';
import { createServiceTypeSchema, type CreateServiceTypeDto } from '@/types/service-request';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('is_active');

    const filters: { is_active?: boolean; userRoleKeys?: string[]; isSuperAdmin?: boolean } = {};
    if (isActive !== null) {
      filters.is_active = isActive === 'true';
    }

    // Resolve the requesting user's roles so we can filter service types
    // by allowed_roles. Superadmins bypass the filter entirely.
    const supabase = await createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
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

    const types = await ServiceTypeService.getServiceTypes(filters);
    return NextResponse.json(types);
  } catch (error) {
    console.error('[service-requests/types] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
