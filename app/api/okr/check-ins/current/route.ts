// app/api/okr/check-ins/current/route.ts
// Get or create current week's check-in

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Helper to get current week info
function getCurrentWeek(): { weekNumber: number; year: number; startDate: Date; endDate: Date } {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    weekNumber,
    year: now.getFullYear(),
    startDate: monday,
    endDate: sunday
  };
}

export async function GET(request: NextRequest) {
  try {
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

    const { weekNumber, year, startDate, endDate } = getCurrentWeek();

    // Try to get existing check-in
    let { data: checkIn, error } = await (supabase as any)
      .from('okr_check_ins')
      .select(`
        *,
        kr_updates:okr_kr_updates(
          *,
          key_result:okr_key_results(id, title, unit, current_value, target_value)
        )
      `)
      .eq('user_id', user.id)
      .eq('week_number', weekNumber)
      .eq('year', year)
      .single();

    // If not found, create one
    if (error && error.code === 'PGRST116') {
      const { data: newCheckIn, error: createError } = await (supabase as any)
        .from('okr_check_ins')
        .insert([{
          user_id: user.id,
          week_number: weekNumber,
          year: year,
          week_start_date: startDate.toISOString(),
          due_date: endDate.toISOString(),
          status: 'pending',
          is_completed: false,
          is_overdue: false
        }])
        .select()
        .single();

      if (createError) throw createError;
      checkIn = newCheckIn;
    } else if (error) {
      throw error;
    }

    // Get user's objectives and key results for the check-in form
    const { data: objectives } = await (supabase as any)
      .from('okr_objectives')
      .select(`
        id, title, status, overall_progress,
        key_results:okr_key_results(
          id, title, current_value, target_value, start_value,
          unit, status, progress_percentage, data_source
        )
      `)
      .eq('owner_id', user.id)
      .eq('status', 'active');

    return NextResponse.json({
      data: {
        checkIn,
        objectives: objectives || [],
        weekInfo: {
          weekNumber,
          year,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      }
    });

  } catch (error) {
    console.error('[OKR Current Check-in API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Submit current check-in
export async function POST(request: NextRequest) {
  try {
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
    const { check_in_id, updates, overall_notes, blockers } = body;

    if (!check_in_id) {
      return NextResponse.json(
        { error: 'check_in_id is required' },
        { status: 400 }
      );
    }

    // Verify check-in belongs to user
    const { data: checkIn, error: checkInError } = await (supabase as any)
      .from('okr_check_ins')
      .select('id, user_id, is_completed')
      .eq('id', check_in_id)
      .single();

    if (checkInError || !checkIn) {
      return NextResponse.json(
        { error: 'Check-in not found' },
        { status: 404 }
      );
    }

    if (checkIn.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only submit your own check-ins' },
        { status: 403 }
      );
    }

    if (checkIn.is_completed) {
      return NextResponse.json(
        { error: 'This check-in has already been submitted' },
        { status: 400 }
      );
    }

    // Process key result updates
    if (updates && Array.isArray(updates)) {
      for (const update of updates) {
        if (!update.key_result_id || update.new_value === undefined) continue;

        // Get current key result
        const { data: kr } = await (supabase as any)
          .from('okr_key_results')
          .select('current_value, start_value, target_value, objective_id')
          .eq('id', update.key_result_id)
          .single();

        if (!kr) continue;

        // Create update record
        await (supabase as any)
          .from('okr_kr_updates')
          .insert({
            key_result_id: update.key_result_id,
            check_in_id: check_in_id,
            previous_value: kr.current_value,
            new_value: update.new_value,
            notes: update.notes,
            updated_by: user.id
          });

        // Calculate progress
        const range = kr.target_value - kr.start_value;
        let progressPercentage = 0;
        let status = 'not_started';

        if (range !== 0) {
          progressPercentage = Math.min(100, Math.max(0,
            Math.round(((update.new_value - kr.start_value) / range) * 100)
          ));
        }

        // Determine status based on progress
        if (progressPercentage >= 100) {
          status = 'completed';
        } else if (progressPercentage >= 70) {
          status = 'on_track';
        } else if (progressPercentage >= 40) {
          status = 'at_risk';
        } else if (progressPercentage > 0) {
          status = 'behind';
        }

        // Update key result
        await (supabase as any)
          .from('okr_key_results')
          .update({
            current_value: update.new_value,
            progress_percentage: progressPercentage,
            status: status,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.key_result_id);

        // Recalculate objective progress
        const { data: allKRs } = await (supabase as any)
          .from('okr_key_results')
          .select('progress_percentage')
          .eq('objective_id', kr.objective_id);

        if (allKRs && allKRs.length > 0) {
          const avgProgress = Math.round(
            allKRs.reduce((sum: number, k: any) => sum + (k.progress_percentage || 0), 0) / allKRs.length
          );
          await (supabase as any)
            .from('okr_objectives')
            .update({ overall_progress: avgProgress, updated_at: new Date().toISOString() })
            .eq('id', kr.objective_id);
        }
      }
    }

    // Mark check-in as completed
    const { data: updatedCheckIn, error: updateError } = await (supabase as any)
      .from('okr_check_ins')
      .update({
        is_completed: true,
        status: 'completed',
        completed_at: new Date().toISOString(),
        overall_notes: overall_notes,
        blockers: blockers,
        updated_at: new Date().toISOString()
      })
      .eq('id', check_in_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update user compliance status
    await (supabase as any)
      .from('okr_user_status')
      .upsert({
        user_id: user.id,
        last_check_in_date: new Date().toISOString(),
        consecutive_completed: (supabase as any).sql`consecutive_completed + 1`,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    return NextResponse.json({
      data: updatedCheckIn,
      message: 'Check-in submitted successfully'
    });

  } catch (error) {
    console.error('[OKR Submit Check-in API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
