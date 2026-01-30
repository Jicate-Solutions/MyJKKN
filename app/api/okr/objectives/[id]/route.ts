// app/api/okr/objectives/[id]/route.ts
// Internal API for single OKR Objective operations

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await (supabase as any)
      .from('okr_objectives')
      .select(`
        *,
        owner:profiles!owner_id(id, full_name, email, avatar_url, role),
        parent:okr_objectives!parent_objective_id(id, title, status),
        children:okr_objectives!parent_objective_id(id, title, status, overall_progress),
        key_results:okr_key_results(
          id, title, description, current_value, target_value, start_value,
          unit, status, progress_percentage, data_source, data_source_config,
          deadline, order_index
        ),
        institution:institutions!institution_id(id, name, code),
        department:departments!department_id(id, department_name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Objective not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({ data });

  } catch (error) {
    console.error('[OKR Objective API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Get existing objective to check ownership
    const { data: existing, error: existingError } = await (supabase as any)
      .from('okr_objectives')
      .select('id, owner_id, status')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404 }
      );
    }

    // Check permissions - owner or manager can update
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isOwner = existing.owner_id === user.id;
    const isAdmin = ['super_admin', 'administrator'].includes(profile?.role || '');

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to update this objective' },
        { status: 403 }
      );
    }

    // Build update data (only allowed fields)
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    const allowedFields = [
      'title', 'description', 'status', 'cycle_type',
      'start_date', 'end_date', 'overall_progress'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data, error } = await (supabase as any)
      .from('okr_objectives')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        owner:profiles!owner_id(id, full_name, email),
        key_results:okr_key_results(id, title, progress_percentage)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json({ data });

  } catch (error) {
    console.error('[OKR Objective API] Update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!['super_admin', 'administrator'].includes(profile?.role || '')) {
      return NextResponse.json(
        { error: 'Only administrators can delete objectives' },
        { status: 403 }
      );
    }

    // Check if objective has children
    const { data: children } = await (supabase as any)
      .from('okr_objectives')
      .select('id')
      .eq('parent_objective_id', id);

    if (children && children.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete objective with child objectives. Archive it instead.' },
        { status: 400 }
      );
    }

    // Soft delete by archiving
    const { error } = await (supabase as any)
      .from('okr_objectives')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ message: 'Objective archived successfully' });

  } catch (error) {
    console.error('[OKR Objective API] Delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
