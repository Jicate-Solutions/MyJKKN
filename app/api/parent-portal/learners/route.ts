// app/api/parent-portal/learners/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import { linkLearnerSchema } from '@/lib/validations/parent-portal';
import { validateCSRFFromRequest } from '@/lib/utils/csrf';
import { z } from 'zod';

/**
 * Get linked learners for the authenticated parent
 * Requires: Parent authentication
 */
export async function GET(request: NextRequest) {
  try {
    // CRITICAL FIX: Validate parent session - was missing!
    const authenticatedParentId = await ParentSessionService.getCurrentParentId();

    if (!authenticatedParentId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const requestedParentId = searchParams.get('parent_id');

    // SECURITY: Only allow parents to see their own linked learners
    // If parent_id is provided, it must match the authenticated parent
    if (requestedParentId && requestedParentId !== authenticatedParentId) {
      return NextResponse.json(
        { error: 'You can only view your own linked learners' },
        { status: 403 }
      );
    }

    // Use authenticated parent ID, not query parameter
    const parentId = authenticatedParentId;

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
        )
      `
      )
      .eq('parent_id', parentId)
      .order('is_primary', { ascending: false });

    if (error) {
      console.error('[parent-portal/learners] Database error:', error);
      throw error;
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('[parent-portal/learners] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch linked learners' },
      { status: 500 }
    );
  }
}

/**
 * Link a learner to the authenticated parent
 * Requires: Parent authentication + CSRF token
 */
export async function POST(request: NextRequest) {
  try {
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

    const supabase = await createClient();
    const body = await request.json();

    const validated = linkLearnerSchema.parse(body);

    // SECURITY: Force the authenticated parent ID, ignore body.parent_id
    // This prevents a parent from linking learners to other parents' accounts
    const secureData = {
      ...validated,
      parent_id: authenticatedParentId,
    };

    const { data, error } = await supabase
      .from('parent_learner_links')
      .insert(secureData)
      .select(
        `
        *,
        learner:learners_profiles(
          id, name, enrollment_number, photo_url,
          program:programs(id, name, code),
          section:sections(id, name)
        )
      `
      )
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This learner is already linked to your account' },
          { status: 409 }
        );
      }
      console.error('[parent-portal/learners] Insert error:', error);
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/learners] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to link learner' },
      { status: 500 }
    );
  }
}
