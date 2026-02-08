// app/api/parent-portal/communications/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import {
  createCommunicationSchema,
  communicationFiltersSchema,
} from '@/lib/validations/parent-portal';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    // Validate session - REQUIRED for all protected routes
    const parentId = await ParentSessionService.getCurrentParentId();

    if (!parentId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const filters = communicationFiltersSchema.parse({
      institution_id: searchParams.get('institution_id') || undefined,
      parent_id: parentId, // Force authenticated parent's ID
      learner_id: searchParams.get('learner_id') || undefined,
      type: searchParams.get('type') || undefined,
      priority: searchParams.get('priority') || undefined,
      is_read: searchParams.get('is_read')
        ? searchParams.get('is_read') === 'true'
        : undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : 20,
    });

    const { page, limit } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('parent_communications')
      .select(
        `
        *,
        sender:users_profiles(id, name, avatar_url),
        learner:learners_profiles(id, name, enrollment_number)
      `,
        { count: 'exact' }
      );

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    if (filters.parent_id) {
      query = query.eq('parent_id', filters.parent_id);
    }

    if (filters.learner_id) {
      query = query.eq('learner_id', filters.learner_id);
    }

    if (filters.type) {
      query = query.eq('type', filters.type);
    }

    if (filters.priority) {
      query = query.eq('priority', filters.priority);
    }

    if (filters.is_read !== undefined) {
      if (filters.is_read) {
        query = query.not('read_at', 'is', null);
      } else {
        query = query.is('read_at', null);
      }
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

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
    console.error('[parent-portal/communications] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch communications' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate session for creating communications (admin only typically)
    const parentId = await ParentSessionService.getCurrentParentId();

    if (!parentId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate CSRF token for state-changing operation
    const { validateCSRFFromRequest } = await import('@/lib/utils/csrf');
    const isValidCSRF = await validateCSRFFromRequest(request);

    if (!isValidCSRF) {
      return NextResponse.json(
        { error: 'Invalid CSRF token. Please refresh and try again.' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const body = await request.json();

    const validated = createCommunicationSchema.parse(body);

    const { data, error } = await supabase
      .from('parent_communications')
      .insert(validated)
      .select(
        `
        *,
        sender:users_profiles(id, name, avatar_url)
      `
      )
      .single();

    if (error) {
      console.error('[parent-portal/communications] Insert error:', error);
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/communications] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create communication' },
      { status: 500 }
    );
  }
}
