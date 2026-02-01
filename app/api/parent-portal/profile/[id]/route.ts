// app/api/parent-portal/profile/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateParentProfileSchema } from '@/lib/validations/parent-portal';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('parent_profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[parent-portal/profile/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete parent profile' },
      { status: 500 }
    );
  }
}
