import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Placeholder for server-side authentication check
async function checkAuth() {
  // Implement your actual server-side authentication/authorization logic here
  // For example, using Supabase server client, check for active session and admin role
  // const supabase = createServerClient(...);
  // const { data: { user } } = await supabase.auth.getUser();
  // if (!user) throw new Error('Unauthorized');
  // const { data: profile } = await (supabase as any).from('profiles')...;
  // if (profile?.role !== 'admin') throw new Error('Forbidden');
  return true; // Placeholder
}

export async function GET(request: Request) {
  try {
    // --- Authentication Check ---
    // await checkAuth(); // Uncomment and implement when auth is ready

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch counts in parallel
    const [
      { count: totalUsers, error: usersError },
      { count: totalInstitutions, error: institutionsError },
      { count: totalStudents, error: studentsError },
      // { count: totalApplications, error: applicationsError }, // Add if you have an applications table
      { data: usersByRoleData, error: rolesError }
    ] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('institutions')
        .select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('learners_profiles')
        .select('id', { count: 'exact', head: true }),
      // supabaseAdmin.from('applications').select('id', { count: 'exact', head: true }), // Add if needed
      supabaseAdmin.from('profiles').select('role') // Fetch roles for chart data
    ]);

    // Handle potential errors
    if (usersError)
      throw new Error(`Users count failed: ${usersError.message}`);
    if (institutionsError)
      throw new Error(
        `Institutions count failed: ${institutionsError.message}`
      );
    if (studentsError)
      throw new Error(`Students count failed: ${studentsError.message}`);
    // if (applicationsError) throw new Error(`Applications count failed: ${applicationsError.message}`);
    if (rolesError)
      throw new Error(`Fetching roles failed: ${rolesError.message}`);

    // Process role counts for chart
    const roleCounts = (usersByRoleData || []).reduce(
      (acc: Record<string, number>, user: any) => {
        const role = user.role || 'Unknown';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      },
      {}
    );

    const usersByRoleChartData = Object.entries(roleCounts).map(
      ([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '), // Format role name
        count
      })
    );

    // --- Add more complex queries here if needed ---
    // Example: Fetch students created in the last 7 days for a time-series chart (more complex)
    // const sevenDaysAgo = new Date();
    // sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    // const { data: recentStudents, error: recentError } = await supabaseAdmin
    //   .from('learners_profiles')
    //   .select('created_at')
    //   .gte('created_at', sevenDaysAgo.toISOString());
    // Process recentStudents into daily/weekly counts...
    // -----------------------------------------------

    const metrics = {
      totalUsers: totalUsers ?? 0,
      totalInstitutions: totalInstitutions ?? 0,
      totalStudents: totalStudents ?? 0,
      totalApplications: 0, // Replace with actual count if available
      // Add other calculated metrics
      usersByRole: usersByRoleChartData,
      // Placeholder for other charts/data
      placeholderTimeSeries: [
        { name: 'Mon', value: Math.floor(Math.random() * 1000) },
        { name: 'Tue', value: Math.floor(Math.random() * 1000) },
        { name: 'Wed', value: Math.floor(Math.random() * 1000) },
        { name: 'Thu', value: Math.floor(Math.random() * 1000) },
        { name: 'Fri', value: Math.floor(Math.random() * 1000) },
        { name: 'Sat', value: Math.floor(Math.random() * 1000) },
        { name: 'Sun', value: Math.floor(Math.random() * 1000) }
      ],
      placeholderDonutData: [
        { name: 'Active', value: 75, fill: 'hsl(var(--primary))' },
        { name: 'Inactive', value: 25, fill: 'hsl(var(--muted))' }
      ]
    };

    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('[API_DASHBOARD_METRICS_ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard metrics' },
      { status: 500 }
    );
  }
}
