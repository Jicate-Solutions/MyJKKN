import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import ExcelJS from 'exceljs';
import { Parser } from 'json2csv';

import { Database } from '@/types/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const exportFormat = searchParams.get('format') || 'csv';
    const includeAll = searchParams.get('includeAll') === 'true';
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const searchTerm = searchParams.get('search') || '';

    // Validate export format
    if (!['csv', 'xlsx', 'json'].includes(exportFormat)) {
      return NextResponse.json(
        { error: 'Invalid export format' },
        { status: 400 }
      );
    }

    // Create Supabase server client
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          }
        }
      }
    );

    // Check if user is authenticated
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build query to fetch courses with related entities
    let query = supabase.from('courses').select(`
        *,
        institutions(name)
      `);

    // Apply status filter if not including inactive
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    // Apply search term if provided
    if (searchTerm) {
      query = query.or(
        `course_code.ilike.%${searchTerm}%,course_name.ilike.%${searchTerm}%`
      );
    }

    // Apply pagination unless includeAll is true
    if (!includeAll) {
      query = query.limit(100);
    }

    // Fetch the data
    const { data: courses, error } = await query;

    if (error) {
      console.error('Database query error:', error);
      return NextResponse.json(
        { error: `Failed to fetch courses: ${error.message}` },
        { status: 500 }
      );
    }

    if (!courses || courses.length === 0) {
      return NextResponse.json(
        { error: 'No courses found matching your criteria' },
        { status: 404 }
      );
    }

    // Format the data for export
    const formattedData = courses.map((course) => {
      return {
        id: course.id,
        courseCode: course.course_code,
        courseName: course.course_name,
        institutionName: course.institutions?.name || '',
        isActive: course.is_active ? 'Yes' : 'No',
        createdAt: course.created_at
          ? new Date(course.created_at).toLocaleString()
          : '',
        updatedAt: course.updated_at
          ? new Date(course.updated_at).toLocaleString()
          : ''
      };
    });

    // Generate filename with current date
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `courses-export-${dateStr}.${
      exportFormat === 'xlsx' ? 'xlsx' : exportFormat
    }`;

    // Return data in requested format
    if (exportFormat === 'json') {
      return NextResponse.json(formattedData, {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'application/json'
        }
      });
    } else if (exportFormat === 'xlsx') {
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Courses');

      // Add title row
      worksheet.addRow(['Courses Export']).font = {
        bold: true,
        size: 16
      };

      // Add date row
      worksheet.addRow([`Generated on: ${new Date().toLocaleString()}`]);

      // Add empty row
      worksheet.addRow([]);

      // Define columns
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 36 },
        { header: 'Course Code', key: 'courseCode', width: 15 },
        { header: 'Course Name', key: 'courseName', width: 30 },
        { header: 'Institution', key: 'institutionName', width: 25 },
        { header: 'Active', key: 'isActive', width: 10 },
        { header: 'Created At', key: 'createdAt', width: 20 },
        { header: 'Updated At', key: 'updatedAt', width: 20 }
      ];

      // Style header row
      worksheet.getRow(4).font = { bold: true };
      worksheet.getRow(4).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add the data
      formattedData.forEach((item) => {
        worksheet.addRow(item);
      });

      // Generate Excel buffer
      const buffer = await workbook.xlsx.writeBuffer();

      return new NextResponse(buffer, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } else {
      // CSV export
      const parser = new Parser({
        fields: [
          { label: 'ID', value: 'id' },
          { label: 'Course Code', value: 'courseCode' },
          { label: 'Course Name', value: 'courseName' },
          { label: 'Institution', value: 'institutionName' },
          { label: 'Active', value: 'isActive' },
          { label: 'Created At', value: 'createdAt' },
          { label: 'Updated At', value: 'updatedAt' }
        ]
      });

      const csv = parser.parse(formattedData);

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Internal server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
