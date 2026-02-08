// app/api/parent-portal/learners/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import { validateCSRFFromRequest } from '@/lib/utils/csrf';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Get a specific learner link
 * Requires: Parent authentication and must own the link
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid link ID format' },
        { status: 400 }
      );
    }

    // CRITICAL FIX: Validate parent session - was missing!
    const authenticatedParentId = await ParentSessionService.getCurrentParentId();

    if (!authenticatedParentId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Use service role client because parent portal uses custom session auth (not Supabase auth)
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('parent_learner_links')
      .select(
        `
        *,
        learner:learners_profiles(
          id, name, enrollment_number, photo_url,
          program_id, section_id, semester_id,
          program:programs(id, name, code),
          section:sections(id, name),
          semester:semesters(id, name)
        ),
        parent:parent_profiles(id, name, phone, email)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Link not found' }, { status: 404 });
      }
      console.error('[parent-portal/learners/[id]] Database error:', error);
      throw error;
    }

    // SECURITY: Verify the authenticated parent owns this link
    if (data.parent_id !== authenticatedParentId) {
      return NextResponse.json(
        { error: 'You can only view your own learner links' },
        { status: 403 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[parent-portal/learners/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch learner link' },
      { status: 500 }
    );
  }
}

/**
 * Update a learner link
 * Requires: Parent authentication, must own the link, and CSRF token
 * Note: verified_by is for admin use only
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid link ID format' },
        { status: 400 }
      );
    }

    // CRITICAL FIX: Validate parent session - was missing!
    const authenticatedParentId = await ParentSessionService.getCurrentParentId();

    if (!authenticatedParentId) {
      return NextResponse.json(
        { error: 'Authentication required' },
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

    // Use service role client because parent portal uses custom session auth (not Supabase auth)
    const supabase = createServiceRoleClient();

    // First, verify the authenticated parent owns this link
    const { data: existing, error: fetchError } = await supabase
      .from('parent_learner_links')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Link not found' }, { status: 404 });
      }
      console.error('[parent-portal/learners/[id]] Fetch error:', fetchError);
      throw fetchError;
    }

    // SECURITY: Verify ownership
    if (existing.parent_id !== authenticatedParentId) {
      return NextResponse.json(
        { error: 'You can only update your own learner links' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Allowed updates: is_primary only for parents
    // verified_at/verified_by should be done via admin endpoints
    const updates: Record<string, unknown> = {};
    if (body.is_primary !== undefined) {
      updates.is_primary = body.is_primary;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('parent_learner_links')
      .update(updates)
      .eq('id', id)
      .eq('parent_id', authenticatedParentId) // Double-check ownership
      .select()
      .single();

    if (error) {
      console.error('[parent-portal/learners/[id]] Update error:', error);
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[parent-portal/learners/[id]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update learner link' },
      { status: 500 }
    );
  }
}

/**
 * Unlink a learner from parent
 * Requires: Parent authentication, must own the link, and CSRF token
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid link ID format' },
        { status: 400 }
      );
    }

    // CRITICAL FIX: Validate parent session - was missing!
    const authenticatedParentId = await ParentSessionService.getCurrentParentId();

    if (!authenticatedParentId) {
      return NextResponse.json(
        { error: 'Authentication required' },
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

    // Use service role client because parent portal uses custom session auth (not Supabase auth)
    const supabase = createServiceRoleClient();

    // First, verify the authenticated parent owns this link
    const { data: existing, error: fetchError } = await supabase
      .from('parent_learner_links')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Link not found' }, { status: 404 });
      }
      console.error('[parent-portal/learners/[id]] Fetch error:', fetchError);
      throw fetchError;
    }

    // SECURITY: Verify ownership
    if (existing.parent_id !== authenticatedParentId) {
      return NextResponse.json(
        { error: 'You can only unlink your own learner links' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('parent_learner_links')
      .delete()
      .eq('id', id)
      .eq('parent_id', authenticatedParentId); // Double-check ownership

    if (error) {
      console.error('[parent-portal/learners/[id]] Delete error:', error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[parent-portal/learners/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to unlink learner' },
      { status: 500 }
    );
  }
}
