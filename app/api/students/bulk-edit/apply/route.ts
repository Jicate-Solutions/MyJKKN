import { NextRequest, NextResponse } from 'next/server';
import { StudentService } from '@/lib/services/student/student-service';
import { BulkEditStudentDto } from '@/types/student';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const body = await request.json();
    const { updates } = body as { updates: BulkEditStudentDto[] };

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { message: 'No updates provided' },
        { status: 400 }
      );
    }

    // Validate all updates have Student ID
    const missingIds = updates.filter((u) => !u.id);
    if (missingIds.length > 0) {
      return NextResponse.json(
        { message: `${missingIds.length} student(s) missing Student ID` },
        { status: 400 }
      );
    }

    // Apply bulk edit
    const result = await StudentService.applyBulkEdit(updates, supabase);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error applying bulk edit:', error);
    return NextResponse.json(
      {
        message: 'Failed to apply bulk edit',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
