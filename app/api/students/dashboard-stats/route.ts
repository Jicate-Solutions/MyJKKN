import { NextRequest, NextResponse } from 'next/server';
import { StudentService } from '@/lib/services/student/student-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filters from query parameters
    const filters = {
      dateRange: searchParams.get('dateRange')
        ? JSON.parse(searchParams.get('dateRange')!)
        : undefined,
      institutionId: searchParams.get('institutionId') || undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      programId: searchParams.get('programId') || undefined,
      status: searchParams.get('status')?.split(',') || undefined
    };

    const stats = await StudentService.getDashboardStats(filters);

    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    console.error('Error fetching student dashboard stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}
