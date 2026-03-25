import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MorningBriefData {
  generatedAt: string;       // ISO timestamp
  institutionId: string | null;
  attendance: {
    date: string;            // 'YYYY-MM-DD'
    totalActiveStudents: number;
    sectionsMarkedToday: number;
    pendingMarkingCount: number;
  };
  billing: {
    totalOutstandingAmount: number;
    overdueCount: number;
    currency: 'INR';
  };
  admissions: {
    pendingApplications: number;
  } | null;
  staff: {
    activeCount: number;
  };
}

// ─── Private helpers ─────────────────────────────────────────────────────────

async function fetchAttendanceSnapshot(
  supabase: SupabaseClient,
  institutionId: string | null,
  today: string
): Promise<MorningBriefData['attendance']> {
  try {
    // Query 1: total active students
    const studentsQuery = supabase
      .from('learners_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (institutionId) {
      studentsQuery.eq('institution_id', institutionId);
    }

    // Query 2: sections with attendance marked today
    const attendanceQuery = supabase
      .from('student_attendance')
      .select('*', { count: 'exact', head: true })
      .eq('attendance_date', today);

    if (institutionId) {
      attendanceQuery.eq('institution_id', institutionId);
    }

    // Run both counts in parallel
    const [
      { count: totalStudents, error: studentsError },
      { count: sectionsMarked, error: attendanceError }
    ] = await Promise.all([studentsQuery, attendanceQuery]);

    if (studentsError) {
      console.warn('[morning-brief] Failed to fetch active students count', studentsError);
    }

    if (attendanceError) {
      console.warn('[morning-brief] Failed to fetch attendance sections count', attendanceError);
    }

    return {
      date: today,
      totalActiveStudents: totalStudents ?? 0,
      sectionsMarkedToday: sectionsMarked ?? 0,
      pendingMarkingCount: 0, // Requires timetable join — not computed here
    };
  } catch (error) {
    console.warn('[morning-brief] Failed to fetch attendance snapshot', error);
    return {
      date: today,
      totalActiveStudents: 0,
      sectionsMarkedToday: 0,
      pendingMarkingCount: 0,
    };
  }
}

async function fetchBillingSnapshot(
  supabase: SupabaseClient,
  institutionId: string | null,
  today: string
): Promise<MorningBriefData['billing']> {
  try {
    // Safety cap: summing balance in JS. For institutions with >5000 outstanding bills,
    // consider a DB RPC function for SUM(balance_amount) instead.
    // Query 1: outstanding balance amounts
    const outstandingQuery = supabase
      .from('billing_student_bills')
      .select('balance_amount')
      .in('status', ['unpaid', 'partial']);

    if (institutionId) {
      outstandingQuery.eq('institution_id', institutionId);
    }

    outstandingQuery.limit(5000); // MVP safety cap — replace with DB RPC for production scale

    // Query 2: overdue bills (due_date < today AND balance > 0)
    const overdueQuery = supabase
      .from('billing_student_bills')
      .select('*', { count: 'exact', head: true })
      .lt('due_date', today)
      .gt('balance_amount', 0)
      .in('status', ['unpaid', 'partial']);

    if (institutionId) {
      overdueQuery.eq('institution_id', institutionId);
    }

    const [
      { data: outstandingData, error: outstandingError },
      { count: overdueCount, error: overdueError }
    ] = await Promise.all([outstandingQuery, overdueQuery]);

    if (outstandingError) {
      console.warn('[morning-brief] Failed to fetch outstanding billing data', outstandingError);
    }

    if (overdueError) {
      console.warn('[morning-brief] Failed to fetch overdue billing count', overdueError);
    }

    const totalOutstandingAmount = (outstandingData ?? []).reduce(
      (sum, row) => sum + (typeof row.balance_amount === 'number' ? row.balance_amount : 0),
      0
    );

    return {
      totalOutstandingAmount,
      overdueCount: overdueCount ?? 0,
      currency: 'INR',
    };
  } catch (error) {
    console.warn('[morning-brief] Failed to fetch billing snapshot', error);
    return {
      totalOutstandingAmount: 0,
      overdueCount: 0,
      currency: 'INR',
    };
  }
}

async function fetchAdmissionsSnapshot(
  supabase: SupabaseClient,
  institutionId: string | null
): Promise<MorningBriefData['admissions']> {
  const admissionsQuery = supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (institutionId) {
    admissionsQuery.eq('institution_id', institutionId);
  }

  const { count: pendingApplications, error } = await admissionsQuery;

  if (error) {
    console.warn('[morning-brief] Failed to fetch admissions snapshot', error);
    throw error; // Let caller handle — will be caught by .catch(() => null)
  }

  return {
    pendingApplications: pendingApplications ?? 0,
  };
}

async function fetchStaffSnapshot(
  supabase: SupabaseClient,
  institutionId: string | null
): Promise<MorningBriefData['staff']> {
  try {
    const staffQuery = supabase
      .from('staff')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (institutionId) {
      staffQuery.eq('institution_id', institutionId);
    }

    const { count: activeStaff, error } = await staffQuery;

    if (error) {
      console.warn('[morning-brief] Failed to fetch staff snapshot', error);
    }

    return {
      activeCount: activeStaff ?? 0,
    };
  } catch (error) {
    console.warn('[morning-brief] Failed to fetch staff snapshot', error);
    return {
      activeCount: 0,
    };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getMorningBrief(
  institutionId: string | null
): Promise<MorningBriefData> {
  const supabase = createServiceRoleClient();
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const generatedAt = new Date().toISOString(); // Captured before queries start, reflects request time

  // Run all queries in parallel — admissions degrades gracefully on error
  const [attendanceResult, billingResult, admissionsResult, staffResult] = await Promise.all([
    fetchAttendanceSnapshot(supabase, institutionId, today),
    fetchBillingSnapshot(supabase, institutionId, today),
    fetchAdmissionsSnapshot(supabase, institutionId).catch(() => null),
    fetchStaffSnapshot(supabase, institutionId),
  ]);

  return {
    generatedAt,
    institutionId,
    attendance: attendanceResult,
    billing: billingResult,
    admissions: admissionsResult,
    staff: staffResult,
  };
}
