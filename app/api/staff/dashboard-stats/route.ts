import { NextRequest, NextResponse } from 'next/server';
import { StaffService } from '@/lib/services/staff/staff-service';
import { StaffDashboardFilters } from '@/types/staff';

export async function POST(request: NextRequest) {
  try {
    const filters: StaffDashboardFilters = await request.json();

    // Get dashboard statistics
    const stats = await StaffService.getDashboardStats(filters);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching staff dashboard stats:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Get default dashboard statistics (no filters)
    const stats = await StaffService.getDashboardStats();

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching staff dashboard stats:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
