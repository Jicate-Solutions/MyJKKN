// app/api/okr/key-results/[id]/route.ts
// Internal API for single Key Result operations

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
      .from('okr_key_results')
      .select(`
        *,
        objective:okr_objectives!objective_id(
          id, title, owner_id, status,
          owner:profiles!owner_id(id, full_name, email)
        ),
        updates:okr_kr_updates(
          id, previous_value, new_value, notes, created_at,
          updated_by:profiles!updated_by(id, full_name)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Key result not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({ data });

  } catch (error) {
    console.error('[OKR Key Result API] Error:', error);
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

    // Get existing key result
    const { data: existing, error: existingError } = await (supabase as any)
      .from('okr_key_results')
      .select(`
        *,
        objective:okr_objectives!objective_id(id, owner_id)
      `)
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: 'Key result not found' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    const allowedFields = [
      'title', 'description', 'current_value', 'target_value', 'start_value',
      'unit', 'status', 'deadline', 'data_source', 'data_source_config', 'order_index'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // If current_value changed, create update record and recalculate progress
    if (body.current_value !== undefined && body.current_value !== existing.current_value) {
      // Create update record
      await (supabase as any)
        .from('okr_kr_updates')
        .insert({
          key_result_id: id,
          check_in_id: body.check_in_id,
          previous_value: existing.current_value,
          new_value: body.current_value,
          notes: body.update_notes,
          updated_by: user.id
        });

      // Calculate progress percentage
      const range = existing.target_value - existing.start_value;
      if (range !== 0) {
        const progress = ((body.current_value - existing.start_value) / range) * 100;
        updateData.progress_percentage = Math.min(100, Math.max(0, Math.round(progress)));
      }

      // Auto-update status based on progress
      const progress = updateData.progress_percentage || 0;
      if (progress >= 100) {
        updateData.status = 'completed';
      } else if (progress >= 70) {
        updateData.status = 'on_track';
      } else if (progress >= 40) {
        updateData.status = 'at_risk';
      } else if (progress > 0) {
        updateData.status = 'behind';
      }
    }

    const { data, error } = await (supabase as any)
      .from('okr_key_results')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        objective:okr_objectives!objective_id(id, title)
      `)
      .single();

    if (error) throw error;

    // Recalculate objective progress
    await recalculateObjectiveProgress(supabase, existing.objective_id);

    return NextResponse.json({ data });

  } catch (error) {
    console.error('[OKR Key Result API] Update error:', error);
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

    // Get key result to find objective
    const { data: keyResult } = await (supabase as any)
      .from('okr_key_results')
      .select('objective_id')
      .eq('id', id)
      .single();

    if (!keyResult) {
      return NextResponse.json(
        { error: 'Key result not found' },
        { status: 404 }
      );
    }

    const { error } = await (supabase as any)
      .from('okr_key_results')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Recalculate objective progress after deletion
    await recalculateObjectiveProgress(supabase, keyResult.objective_id);

    return NextResponse.json({ message: 'Key result deleted successfully' });

  } catch (error) {
    console.error('[OKR Key Result API] Delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to recalculate objective progress
async function recalculateObjectiveProgress(supabase: any, objectiveId: string) {
  const { data: keyResults } = await supabase
    .from('okr_key_results')
    .select('progress_percentage')
    .eq('objective_id', objectiveId);

  if (keyResults && keyResults.length > 0) {
    const avgProgress = Math.round(
      keyResults.reduce((sum: number, kr: any) => sum + (kr.progress_percentage || 0), 0) / keyResults.length
    );

    await supabase
      .from('okr_objectives')
      .update({ overall_progress: avgProgress, updated_at: new Date().toISOString() })
      .eq('id', objectiveId);
  }
}
