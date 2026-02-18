// app/api/parent-portal/profile/route.ts
// ADMIN ONLY - These endpoints are for staff/admin management of parent profiles
// Parents use dashboard and other authenticated endpoints for their own data

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createParentProfileSchema,
  parentProfileFiltersSchema,
} from '@/lib/validations/parent-portal';
import { validateCSRFFromRequest } from '@/lib/utils/csrf';
import { z } from 'zod';

// Roles permitted to manage parent profiles via admin endpoints
const ADMIN_ROLES = ['super_admin', 'admin', 'administrator', 'institution_admin', 'principal'];

/**
 * ADMIN: List parent profiles with filters
 * Requires: Authenticated staff user with appropriate permissions
 */
export async function GET(request: NextRequest) {
  try {
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

    // Role-based authorization: only admin/staff can list parent profiles
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    const isAdmin = userProfile?.is_super_admin || ADMIN_ROLES.includes(userProfile?.role);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden. Only administrators can list parent profiles.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Parse and validate filters
    const filters = parentProfileFiltersSchema.parse({
      institution_id: searchParams.get('institution_id') || undefined,
      search: searchParams.get('search') || undefined,
      is_verified: searchParams.get('is_verified')
        ? searchParams.get('is_verified') === 'true'
        : undefined,
      relationship: searchParams.get('relationship') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
    });

    // Prevent cross-institution access for non-super-admin users
    if (!userProfile?.is_super_admin && userProfile?.role !== 'super_admin') {
      if (filters.institution_id && filters.institution_id !== userProfile?.institution_id) {
        return NextResponse.json(
          { error: 'Forbidden. You can only access profiles within your institution.' },
          { status: 403 }
        );
      }
      // Force institution scope for non-super-admin
      filters.institution_id = userProfile?.institution_id || undefined;
    }

    const { page, limit } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('parent_profiles')
      .select(
        `
        *,
        institution:institutions(id, name, logo_url)
      `,
        { count: 'exact' }
      );

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    // Fix SQL injection - use textSearch or proper escaping
    if (filters.search) {
      // Escape special characters for ILIKE
      const searchTerm = filters.search.replace(/[%_\\]/g, '\\$&');
      query = query.or(
        `name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
      );
    }

    if (filters.is_verified !== undefined) {
      query = query.eq('is_verified', filters.is_verified);
    }

    if (filters.relationship) {
      query = query.eq('relationship', filters.relationship);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[parent-portal/profile] Database error:', error);
      throw error;
    }

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/profile] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parent profiles' },
      { status: 500 }
    );
  }
}

/**
 * ADMIN: Create a new parent profile
 * Requires: Authenticated staff user with appropriate permissions + CSRF token
 */
export async function POST(request: NextRequest) {
  try {
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

    // Role-based authorization: only admin/staff can create parent profiles
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    const isAdmin = userProfile?.is_super_admin || ADMIN_ROLES.includes(userProfile?.role);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden. Only administrators can create parent profiles.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = createParentProfileSchema.parse(body);

    // Prevent non-super-admin from creating profiles in other institutions
    if (!userProfile?.is_super_admin && userProfile?.role !== 'super_admin' &&
        validated.institution_id && userProfile?.institution_id !== validated.institution_id) {
      return NextResponse.json(
        { error: 'Forbidden. You can only create profiles within your institution.' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('parent_profiles')
      .insert(validated)
      .select(
        `
        *,
        institution:institutions(id, name, logo_url)
      `
      )
      .single();

    if (error) {
      console.error('[parent-portal/profile] Insert error:', error);
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/profile] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create parent profile' },
      { status: 500 }
    );
  }
}
