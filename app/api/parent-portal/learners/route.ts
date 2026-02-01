// app/api/parent-portal/learners/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { linkLearnerSchema } from '@/lib/validations/parent-portal';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('parent_id');

    if (!parentId) {
      return NextResponse.json(
        { error: 'parent_id is required' },
        { status: 400 }
      );
    }

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

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('[parent-portal/learners] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch linked learners' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const validated = linkLearnerSchema.parse(body);

    const { data, error } = await supabase
      .from('parent_learner_links')
      .insert(validated)
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
          { error: 'This learner is already linked to this parent' },
          { status: 409 }
        );
      }
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
