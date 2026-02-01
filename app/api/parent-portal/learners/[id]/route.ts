// app/api/parent-portal/learners/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

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
      throw error;
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const body = await request.json();

    // Allowed updates: is_primary, verified_at, verified_by
    const updates: Record<string, unknown> = {};
    if (body.is_primary !== undefined) updates.is_primary = body.is_primary;
    if (body.verified_by) {
      updates.verified_at = new Date().toISOString();
      updates.verified_by = body.verified_by;
    }

    const { data, error } = await supabase
      .from('parent_learner_links')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Link not found' }, { status: 404 });
      }
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('parent_learner_links')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[parent-portal/learners/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to unlink learner' },
      { status: 500 }
    );
  }
}
