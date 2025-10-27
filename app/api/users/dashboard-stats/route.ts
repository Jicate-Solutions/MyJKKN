import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/auth';
import { UserDashboardStats, UserDashboardFilters } from '@/types/users';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
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

    // Check if user is admin
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !['super_admin', 'administrator', 'faculty'].includes(profile?.role || '')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse query parameters
    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institution_id');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const roles = url.searchParams.get('roles')?.split(',') || [];
    const status = url.searchParams.get('status') as
      | 'active'
      | 'inactive'
      | 'all';

    // If user is faculty, restrict to their institution
    const targetInstitutionId =
      profile.role === 'faculty' ? profile.institution_id : institutionId;

    // Build filters
    const filters: UserDashboardFilters = {
      institutionId: targetInstitutionId || undefined,
      roles: roles.length > 0 ? roles : undefined,
      status: status || 'all',
      dateRange:
        dateFrom && dateTo
          ? {
              from: new Date(dateFrom),
              to: new Date(dateTo)
            }
          : undefined
    };

    // Calculate date ranges for trends
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get all users data with pagination to handle more than 1000 users
    // Fixed: 2025-10-27 - Supabase has a default limit of 1000 rows, need pagination

    let allUsers: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    // Build base query function to avoid duplication
    const buildQuery = () => {
      let query = supabase.from('profiles').select(`
        id,
        email,
        full_name,
        role,
        is_active,
        profile_completed,
        created_at,
        updated_at,
        last_login,
        institution_id,
        institutions!inner(id, name, counselling_code)
      `);

      // Apply institution filter
      if (targetInstitutionId) {
        query = query.eq('institution_id', targetInstitutionId);
      }

      // Apply role filter
      if (filters.roles && filters.roles.length > 0) {
        query = query.in('role', filters.roles);
      }

      return query;
    };

    // Fetch all users in batches
    while (hasMore) {
      const { data: batch, error: usersError } = await buildQuery()
        .range(from, from + batchSize - 1);

      if (usersError) {
        console.error('Error fetching users batch:', usersError);
        throw usersError;
      }

      if (batch && batch.length > 0) {
        allUsers = allUsers.concat(batch);
        from += batchSize;

        // If we got less than batchSize, we've fetched all users
        if (batch.length < batchSize) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    console.log(`[dashboard-stats] Fetched ${allUsers.length} total users`);

    const usersError = null; // No error if we got here

    // Get all institutions for percentage calculations
    const { data: institutions, error: institutionsError } = await supabase
      .from('institutions')
      .select('id, name, counselling_code');

    if (institutionsError) {
      console.error('Error fetching institutions:', institutionsError);
    }

    // Get all available roles
    const { data: customRoles, error: rolesError } = await supabase
      .from('custom_roles')
      .select('role_key, role_name');

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
    }

    // Create role display name mapping
    const roleDisplayNames: Record<string, string> = {
      super_admin: 'Super Admin',
      administrator: 'Administrator',
      faculty: 'Faculty',
      student: 'Student',
      staff: 'Staff',
      guest: 'Guest'
    };

    // Add custom roles to mapping
    customRoles?.forEach((role) => {
      roleDisplayNames[role.role_key] = role.role_name;
    });

    const users = allUsers || [];
    const totalUsers = users.length;

    // Filter users by status
    const filteredUsers =
      filters.status === 'all'
        ? users
        : users.filter((user) =>
            filters.status === 'active' ? user.is_active : !user.is_active
          );

    // Calculate overview stats
    const activeUsers = filteredUsers.filter((user) => user.is_active).length;
    const inactiveUsers = filteredUsers.filter(
      (user) => !user.is_active
    ).length;

    const thisMonthUsers = filteredUsers.filter(
      (user) => new Date(user.created_at) >= thirtyDaysAgo
    ).length;

    const lastMonthUsers = filteredUsers.filter(
      (user) =>
        new Date(user.created_at) >= sixtyDaysAgo &&
        new Date(user.created_at) < thirtyDaysAgo
    ).length;

    const growthRate =
      lastMonthUsers > 0
        ? ((thisMonthUsers - lastMonthUsers) / lastMonthUsers) * 100
        : thisMonthUsers > 0
        ? 100
        : 0;

    const completeProfiles = filteredUsers.filter(
      (user) => user.profile_completed
    ).length;
    const profileCompletionRate =
      totalUsers > 0 ? (completeProfiles / totalUsers) * 100 : 0;

    const usersWithin7Days = filteredUsers.filter(
      (user) => user.last_login && new Date(user.last_login) >= sevenDaysAgo
    ).length;

    const usersWithin30Days = filteredUsers.filter(
      (user) => user.last_login && new Date(user.last_login) >= thirtyDaysAgo
    ).length;

    const neverLoggedIn = filteredUsers.filter(
      (user) => !user.last_login
    ).length;

    // Calculate role distribution
    const roleStats: Record<
      string,
      { total: number; active: number; inactive: number }
    > = {};

    filteredUsers.forEach((user) => {
      if (!roleStats[user.role]) {
        roleStats[user.role] = { total: 0, active: 0, inactive: 0 };
      }
      roleStats[user.role].total++;
      if (user.is_active) {
        roleStats[user.role].active++;
      } else {
        roleStats[user.role].inactive++;
      }
    });

    const roleDistribution = Object.entries(roleStats).map(([role, stats]) => ({
      role,
      roleDisplayName: roleDisplayNames[role] || role,
      count: stats.total,
      percentage: totalUsers > 0 ? (stats.total / totalUsers) * 100 : 0,
      activeCount: stats.active,
      inactiveCount: stats.inactive
    }));

    // Calculate institution stats
    const institutionStats: Record<
      string,
      {
        users: any[];
        byRole: Record<string, number>;
      }
    > = {};

    filteredUsers.forEach((user) => {
      const instId = user.institution_id || 'no_institution';
      if (!institutionStats[instId]) {
        institutionStats[instId] = { users: [], byRole: {} };
      }
      institutionStats[instId].users.push(user);

      if (!institutionStats[instId].byRole[user.role]) {
        institutionStats[instId].byRole[user.role] = 0;
      }
      institutionStats[instId].byRole[user.role]++;
    });

    const institutionStatsArray = Object.entries(institutionStats)
      .map(([instId, stats]) => {
        const institution = institutions?.find((i) => i.id === instId);
        const activeCount = stats.users.filter((u) => u.is_active).length;

        return {
          id: instId,
          name:
            institution?.name ||
            (instId === 'no_institution'
              ? 'No Institution'
              : 'Unknown Institution'),
          counsellingCode: institution?.counselling_code || '',
          totalUsers: stats.users.length,
          activeUsers: activeCount,
          byRole: stats.byRole,
          percentage:
            totalUsers > 0 ? (stats.users.length / totalUsers) * 100 : 0,
          lastActivity: stats.users
            .filter((u) => u.last_login)
            .sort(
              (a, b) =>
                new Date(b.last_login).getTime() -
                new Date(a.last_login).getTime()
            )[0]?.last_login
        };
      })
      .sort((a, b) => b.totalUsers - a.totalUsers);

    // Calculate registration trends (last 30 days)
    const registrationTrends = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      const dayUsers = filteredUsers.filter((user) => {
        const userDate = new Date(user.created_at).toISOString().split('T')[0];
        return userDate === dateStr;
      });

      const byRole: Record<string, number> = {};
      dayUsers.forEach((user) => {
        byRole[user.role] = (byRole[user.role] || 0) + 1;
      });

      // Calculate cumulative count
      const cumulativeUsers = filteredUsers.filter(
        (user) => new Date(user.created_at) <= date
      ).length;

      registrationTrends.push({
        date: dateStr,
        count: dayUsers.length,
        cumulative: cumulativeUsers,
        byRole
      });
    }

    // Activity metrics based on real login data
    const dailyActiveUsers = filteredUsers.filter(
      (user) =>
        user.last_login &&
        new Date(user.last_login) >=
          new Date(now.getTime() - 24 * 60 * 60 * 1000)
    ).length;

    const activityMetrics = {
      dailyActiveUsers,
      weeklyActiveUsers: usersWithin7Days,
      monthlyActiveUsers: usersWithin30Days,
      averageSessionDuration: 0, // Would need session tracking implementation
      loginFrequency: {
        daily: dailyActiveUsers,
        weekly: usersWithin7Days - dailyActiveUsers,
        monthly: usersWithin30Days - usersWithin7Days,
        rarely: neverLoggedIn
      }
    };

    // Calculate geographic distribution from actual institution data
    const geographicDistribution = institutionStatsArray.map((inst) => ({
      state: 'Tamil Nadu', // Would come from institution location data
      district: inst.name.split(' ')[0] || 'Unknown', // Extract from institution name
      userCount: inst.totalUsers,
      percentage: totalUsers > 0 ? (inst.totalUsers / totalUsers) * 100 : 0
    }));

    // Security metrics based on real data
    const recentPasswordChanges = filteredUsers.filter((user) => {
      // Users updated in last 30 days (likely password changes)
      return new Date(user.updated_at) >= thirtyDaysAgo;
    }).length;

    const securityMetrics = {
      accountsWithRecentPasswordChanges: recentPasswordChanges,
      suspendedAccounts: inactiveUsers,
      accountsRequiringAttention: filteredUsers.filter(
        (user) => !user.profile_completed || !user.last_login
      ).length,
      twoFactorEnabled: 0 // Not implemented yet
    };

    // Status transitions (mock data - would need audit log)
    const statusTransitions: any[] = [];

    // Top users
    const mostActiveUsers = filteredUsers
      .filter((user) => user.last_login)
      .sort(
        (a, b) =>
          new Date(b.last_login || 0).getTime() -
          new Date(a.last_login || 0).getTime()
      )
      .slice(0, 10)
      .map((user) => ({
        id: user.id,
        name: user.full_name || 'Unknown',
        email: user.email,
        role: user.role,
        institution: user.institutions?.[0]?.name,
        lastLogin: user.last_login || ''
      }));

    const recentRegistrations = filteredUsers
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 10)
      .map((user) => ({
        id: user.id,
        name: user.full_name || 'Unknown',
        email: user.email,
        role: user.role,
        institution: user.institutions?.[0]?.name,
        registeredAt: user.created_at
      }));

    // Build response
    const dashboardStats: UserDashboardStats = {
      overview: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        newUsersThisMonth: thisMonthUsers,
        newUsersLastMonth: lastMonthUsers,
        growthRate,
        profileCompletionRate,
        completeProfiles,
        incompleteProfiles: totalUsers - completeProfiles,
        lastLoginWithin7Days: usersWithin7Days,
        lastLoginWithin30Days: usersWithin30Days,
        neverLoggedIn
      },
      roleDistribution,
      institutionStats: institutionStatsArray,
      registrationTrends,
      activityMetrics,
      geographicDistribution,
      securityMetrics,
      statusTransitions,
      topUsers: {
        mostActiveUsers,
        recentRegistrations
      }
    };

    return NextResponse.json(dashboardStats);
  } catch (error) {
    console.error('Error in GET /api/users/dashboard-stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
