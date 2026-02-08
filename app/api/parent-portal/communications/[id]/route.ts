// app/api/parent-portal/communications/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import { validateCSRFFromRequest } from '@/lib/utils/csrf';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Get a specific communication
 * Requires: Parent authentication and must be the recipient
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid communication ID format' },
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
      .from('parent_communications')
      .select(
        `
        *,
        sender:users_profiles(id, name, avatar_url),
        learner:learners_profiles(id, name, enrollment_number)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Communication not found' },
          { status: 404 }
        );
      }
      console.error('[parent-portal/communications/[id]] Database error:', error);
      throw error;
    }

    // SECURITY: Verify the authenticated parent is the recipient
    if (data.parent_id !== authenticatedParentId) {
      return NextResponse.json(
        { error: 'You can only view your own communications' },
        { status: 403 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[parent-portal/communications/[id]] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch communication' },
      { status: 500 }
    );
  }
}

/**
 * Update a communication (mark as read)
 * Requires: Parent authentication, must be recipient, and CSRF token
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid communication ID format' },
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

    // First, verify the authenticated parent is the recipient
    const { data: existing, error: fetchError } = await supabase
      .from('parent_communications')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Communication not found' },
          { status: 404 }
        );
      }
      console.error('[parent-portal/communications/[id]] Fetch error:', fetchError);
      throw fetchError;
    }

    // SECURITY: Verify ownership
    if (existing.parent_id !== authenticatedParentId) {
      return NextResponse.json(
        { error: 'You can only update your own communications' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Only allow updating read_at
    const updates: Record<string, unknown> = {};
    if (body.mark_read) {
      updates.read_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('parent_communications')
      .update(updates)
      .eq('id', id)
      .eq('parent_id', authenticatedParentId) // Double-check ownership
      .select()
      .single();

    if (error) {
      console.error('[parent-portal/communications/[id]] Update error:', error);
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[parent-portal/communications/[id]] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update communication' },
      { status: 500 }
    );
  }
}
