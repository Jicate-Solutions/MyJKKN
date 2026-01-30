// app/api/okr/auto-track/route.ts
// Internal API for OKR Auto-tracking Sync (session-based auth)

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Auto-track data source handlers
const autoTrackHandlers: Record<string, (supabase: any, config: any) => Promise<number>> = {
  // Learners module
  'learners.total_active': async (supabase, config) => {
    const { count } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('institution_id', config.institution_id);
    return count || 0;
  },

  'learners.attendance_rate': async (supabase, config) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('daily_attendance')
      .select('is_present')
      .gte('date', thirtyDaysAgo.split('T')[0])
      .eq('institution_id', config.institution_id);

    if (!data || data.length === 0) return 0;
    const present = data.filter((a: any) => a.is_present).length;
    return Math.round((present / data.length) * 100);
  },

  // Academic module
  'academic.courses_active': async (supabase, config) => {
    const { count } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('institution_id', config.institution_id);
    return count || 0;
  },

  // Billing module
  'billing.collection_rate': async (supabase, config) => {
    const { data: bills } = await supabase
      .from('bills')
      .select('total_amount, amount_paid')
      .eq('institution_id', config.institution_id)
      .eq('academic_year_id', config.academic_year_id);

    if (!bills || bills.length === 0) return 0;
    const totalDue = bills.reduce((sum: number, b: any) => sum + (b.total_amount || 0), 0);
    const totalPaid = bills.reduce((sum: number, b: any) => sum + (b.amount_paid || 0), 0);
    return totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
  },

  // Applications module
  'applications.conversion_rate': async (supabase, config) => {
    const { data } = await supabase
      .from('applications')
      .select('status')
      .eq('institution_id', config.institution_id);

    if (!data || data.length === 0) return 0;
    const converted = data.filter((a: any) => a.status === 'enrolled').length;
    return Math.round((converted / data.length) * 100);
  },

  // Staff module
  'staff.retention_rate': async (supabase, config) => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('staff')
      .select('is_active, created_at')
      .eq('institution_id', config.institution_id)
      .gte('created_at', oneYearAgo);

    if (!data || data.length === 0) return 100;
    const retained = data.filter((s: any) => s.is_active).length;
    return Math.round((retained / data.length) * 100);
  }
};

// Get available auto-track sources
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

    // Return available data sources with their metadata
    const availableSources = [
      {
        id: 'learners.total_active',
        module: 'Learners',
        name: 'Total Active Students',
        description: 'Count of currently active students',
        unit: 'count',
        category: 'learners'
      },
      {
        id: 'learners.attendance_rate',
        module: 'Learners',
        name: 'Attendance Rate (30 days)',
        description: 'Average attendance percentage over last 30 days',
        unit: 'percentage',
        category: 'learners'
      },
      {
        id: 'academic.courses_active',
        module: 'Academic',
        name: 'Active Courses',
        description: 'Number of currently active courses',
        unit: 'count',
        category: 'academic'
      },
      {
        id: 'billing.collection_rate',
        module: 'Billing',
        name: 'Fee Collection Rate',
        description: 'Percentage of fees collected vs billed',
        unit: 'percentage',
        category: 'billing'
      },
      {
        id: 'applications.conversion_rate',
        module: 'Applications',
        name: 'Application Conversion Rate',
        description: 'Percentage of applications converted to enrollments',
        unit: 'percentage',
        category: 'applications'
      },
      {
        id: 'staff.retention_rate',
        module: 'Staff',
        name: 'Staff Retention Rate',
        description: 'Percentage of staff retained over past year',
        unit: 'percentage',
        category: 'staff'
      }
    ];

    return NextResponse.json({ data: availableSources });

  } catch (error) {
    console.error('[OKR Auto-track API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Sync auto-tracked key results
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
    const { key_result_id, sync_all } = body;

    // Get user profile for institution context
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    const results: any[] = [];

    if (sync_all) {
      // Sync all auto-tracked key results for this user's objectives
      const { data: keyResults } = await (supabase as any)
        .from('okr_key_results')
        .select(`
          id, data_source, data_source_config, current_value, start_value, target_value,
          objective:okr_objectives!objective_id(owner_id, institution_id)
        `)
        .eq('data_source', 'auto')
        .eq('objective.owner_id', user.id);

      for (const kr of keyResults || []) {
        const result = await syncKeyResult(supabase, kr, profile?.institution_id, user.id);
        if (result) results.push(result);
      }
    } else if (key_result_id) {
      // Sync single key result
      const { data: kr } = await (supabase as any)
        .from('okr_key_results')
        .select(`
          id, data_source, data_source_config, current_value, start_value, target_value,
          objective:okr_objectives!objective_id(owner_id, institution_id)
        `)
        .eq('id', key_result_id)
        .single();

      if (kr && kr.data_source === 'auto') {
        const result = await syncKeyResult(supabase, kr, profile?.institution_id, user.id);
        if (result) results.push(result);
      }
    }

    return NextResponse.json({
      data: results,
      synced_count: results.length,
      message: `Successfully synced ${results.length} key result(s)`
    });

  } catch (error) {
    console.error('[OKR Auto-track API] Sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper to sync a single key result
async function syncKeyResult(
  supabase: any,
  kr: any,
  institutionId: string,
  userId: string
): Promise<any | null> {
  try {
    const sourceId = kr.data_source_config?.source_id;
    const handler = autoTrackHandlers[sourceId];

    if (!handler) {
      console.warn(`[OKR Auto-track] No handler for source: ${sourceId}`);
      return null;
    }

    // Execute the handler to get current value
    const config = {
      institution_id: kr.objective?.institution_id || institutionId,
      ...kr.data_source_config
    };

    const newValue = await handler(supabase, config);
    const previousValue = kr.current_value;

    // Skip if no change
    if (newValue === previousValue) {
      return { id: kr.id, status: 'unchanged', value: newValue };
    }

    // Calculate progress
    const range = kr.target_value - kr.start_value;
    let progressPercentage = 0;
    if (range !== 0) {
      progressPercentage = Math.min(100, Math.max(0,
        Math.round(((newValue - kr.start_value) / range) * 100)
      ));
    }

    // Determine status
    let status = 'not_started';
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
    await supabase
      .from('okr_key_results')
      .update({
        current_value: newValue,
        progress_percentage: progressPercentage,
        status: status,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', kr.id);

    // Create update record
    await supabase
      .from('okr_kr_updates')
      .insert({
        key_result_id: kr.id,
        previous_value: previousValue,
        new_value: newValue,
        notes: 'Auto-synced from system data',
        updated_by: userId,
        is_auto_tracked: true
      });

    return {
      id: kr.id,
      status: 'synced',
      previous_value: previousValue,
      new_value: newValue,
      progress_percentage: progressPercentage
    };

  } catch (error) {
    console.error(`[OKR Auto-track] Sync error for ${kr.id}:`, error);
    return { id: kr.id, status: 'error', error: String(error) };
  }
}
