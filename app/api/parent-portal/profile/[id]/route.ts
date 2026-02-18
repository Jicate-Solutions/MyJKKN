// app/api/parent-portal/profile/[id]/route.ts
// ADMIN ONLY - These endpoints are for staff/admin management of parent profiles
// Parents use dashboard and other authenticated endpoints for their own data

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateParentProfileSchema } from '@/lib/validations/parent-portal';
import { validateCSRFFromRequest } from '@/lib/utils/csrf';
import { z } from 'zod';

// Roles permitted to manage parent profiles via admin endpoints
const ADMIN_ROLES = ['super_admin', 'admin', 'administrator', 'institution_admin', 'principal'];

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * ADMIN: Get a specific parent profile by ID
 * Requires: Authenticated staff user with appropriate permissions
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid profile ID format' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check authentication - must be authenticated staff user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required. This endpoint is for staff/admin only.' },
        { status: 401 }
      );
    }

    // Role-based authorization: only admin/staff can manage parent profiles
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    const isAdmin = userProfile?.is_super_admin || ADMIN_ROLES.includes(userProfile?.role);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden. Only administrators can access this endpoint.' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('parent_profiles')
      .select(
        `
        *,
        institution:institutions(id, name, logo_url)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Parent profile not found' },
          { status: 404 }
        );
      }
      console.error('[parent-portal/profile/[id]] Database error:', error);
      throw error;
    }

    // Prevent cross-institution access for non-super-admin users
    if (!userProfile?.is_super_admin && userProfile?.role !== 'super_admin' &&
        data.institution_id && userProfile?.institution_id !== data.institution_id) {
      return NextResponse.json(
        { error: 'Forbidden. You can only access profiles within your institution.' },
        { status: 403 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[parent-portal/profile/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parent profile' },
      { status: 500 }
    );
  }
}

/**
 * ADMIN: Update a parent profile
 * Requires: Authenticated staff user with appropriate permissions + CSRF token
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid profile ID format' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check authentication - must be authenticated staff user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required. This endpoint is for staff/admin only.' },
        { status: 401 }
      );
    }

    // Validate CSRF token for state-changing operation
    const isValidCSRF = await validateCSRFFromRequest(request);

    if (!isValidCSRF) {
      return NextResponse.json(
        { error: 'Invalid CSRF token. Please refresh and try again.' },
        { status: 403 }
      );
    }

    // Role-based authorization: only admin/staff can manage parent profiles
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    const isAdmin = userProfile?.is_super_admin || ADMIN_ROLES.includes(userProfile?.role);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden. Only administrators can update parent profiles.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = updateParentProfileSchema.parse(body);

    // For non-super-admin, scope update to their own institution
    let query = supabase
      .from('parent_profiles')
      .update(validated)
      .eq('id', id);

    if (!userProfile?.is_super_admin && userProfile?.role !== 'super_admin' && userProfile?.institution_id) {
      query = query.eq('institution_id', userProfile.institution_id);
    }

    const { data, error } = await query
      .select(
        `
        *,
        institution:institutions(id, name, logo_url)
      `
      )
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Parent profile not found' },
          { status: 404 }
        );
      }
      console.error('[parent-portal/profile/[id]] Update error:', error);
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/profile/[id]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update parent profile' },
      { status: 500 }
    );
  }
}

/**
 * ADMIN: Delete a parent profile
 * Requires: Authenticated staff user with appropriate permissions + CSRF token
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid profile ID format' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check authentication - must be authenticated staff user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required. This endpoint is for staff/admin only.' },
        { status: 401 }
      );
    }

    // Validate CSRF token for state-changing operation
    const isValidCSRF = await validateCSRFFromRequest(request);

    if (!isValidCSRF) {
      return NextResponse.json(
        { error: 'Invalid CSRF token. Please refresh and try again.' },
        { status: 403 }
      );
    }

    // Role-based authorization: only admin/staff can manage parent profiles
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    const isAdmin = userProfile?.is_super_admin || ADMIN_ROLES.includes(userProfile?.role);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden. Only administrators can delete parent profiles.' },
        { status: 403 }
      );
    }

    // For non-super-admin, scope delete to their own institution
    let deleteQuery = supabase
      .from('parent_profiles')
      .delete()
      .eq('id', id);

    if (!userProfile?.is_super_admin && userProfile?.role !== 'super_admin' && userProfile?.institution_id) {
      deleteQuery = deleteQuery.eq('institution_id', userProfile.institution_id);
    }

    const { error } = await deleteQuery;

    if (error) {
      console.error('[parent-portal/profile/[id]] Delete error:', error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[parent-portal/profile/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete parent profile' },
      { status: 500 }
    );
  }
}
