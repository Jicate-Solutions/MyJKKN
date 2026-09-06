export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { StaffService } from '@/lib/services/staff/staff-service';
import { StaffDashboardFilters } from '@/types/staff';

/**
 * Both handlers were unguarded. An unauthenticated caller reached the query,
 * RLS refused it, the throw landed in the catch, and the endpoint answered 500 —
 * so "you are not signed in" was indistinguishable from "the stats are broken".
 * The post-deploy check has read it as a fault every day since 27 Aug.
 *
 * `withAuth` answers 401 before any work happens, which is what the other 423
 * API routes already do.
 */

export const POST = withAuth(
  async (request: NextRequest) => {
    await connection();
    try {
      const filters: StaffDashboardFilters = await request.json();

      // Get dashboard statistics
      const stats = await StaffService.getDashboardStats(filters);

      return NextResponse.json(stats);
    } catch (error) {
      console.error('Error fetching team member dashboard stats:', error);

      return NextResponse.json(
        {
          error: 'Failed to fetch dashboard statistics',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  },
  { requiredPermission: 'read' }
);

export const GET = withAuth(
  async () => {
    await connection();
    try {
      // Get default dashboard statistics (no filters)
      const stats = await StaffService.getDashboardStats();

      return NextResponse.json(stats);
    } catch (error) {
      console.error('Error fetching team member dashboard stats:', error);

      return NextResponse.json(
        {
          error: 'Failed to fetch dashboard statistics',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  },
  { requiredPermission: 'read' }
);
