// app/api/parent-portal/profile/[id]/route.ts
// ADMIN ONLY - These endpoints are for staff/admin management of parent profiles
// Parents use dashboard and other authenticated endpoints for their own data

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateParentProfileSchema } from '@/lib/validations/parent-portal';
import { validateCSRFFromRequest } from '@/lib/utils/csrf';
import { z } from 'zod';

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

    // TODO: Add role-based authorization check
    // For now, any authenticated user can view profiles (should restrict to admin/staff)

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

    // TODO: Add role-based authorization check
    // For now, any authenticated user can update profiles (should restrict to admin/staff)

    const body = await request.json();
    const validated = updateParentProfileSchema.parse(body);

    const { data, error } = await supabase
      .from('parent_profiles')
      .update(validated)
      .eq('id', id)
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

    // TODO: Add role-based authorization check
    // For now, any authenticated user can delete profiles (should restrict to admin/staff)

    const { error } = await supabase
      .from('parent_profiles')
      .delete()
      .eq('id', id);

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
