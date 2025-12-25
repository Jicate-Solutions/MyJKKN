import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import ExcelJS from 'exceljs';
import { Parser } from 'json2csv';

import { Database } from '@/types/supabase';


export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const exportFormat = searchParams.get('format') || 'csv';
    const includeAll = searchParams.get('includeAll') === 'true';
    const includeInactive = searchParams.get('includeInactive') === 'true';

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

    // Build query to fetch departments
    let query = (supabase as any).from('departments').select(`
        *,
        institutions(name),
        degrees(degree_name)
      `);

    // Apply status filter if not including inactive
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    // Apply pagination unless includeAll is true
    if (!includeAll) {
      query = query.limit(100);
    }

    // Fetch the data
    const { data: departments, error } = await query;

    if (error) {
      console.error('Database query error:', error);
      return NextResponse.json(
        { error: `Failed to fetch departments: ${error.message}` },
        { status: 500 }
      );
    }

    if (!departments || departments.length === 0) {
      return NextResponse.json(
        { error: 'No departments found matching your criteria' },
        { status: 404 }
      );
    }

    // Format the data for export
    const formattedData = departments.map((dept) => {
      return {
        id: dept.id,
        departmentCode: dept.department_code,
        departmentName: dept.department_name,
        institutionName: dept.institutions?.name || '',
        degreeName: dept.degrees?.degree_name || '',
        isActive: dept.is_active ? 'Yes' : 'No',
        createdAt: dept.created_at
          ? new Date(dept.created_at).toLocaleString()
          : '',
        updatedAt: dept.updated_at
          ? new Date(dept.updated_at).toLocaleString()
          : ''
      };
    });

    // Generate filename with current date
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `departments-export-${dateStr}.${
      exportFormat === 'xlsx' ? 'xlsx' : exportFormat
    }`;

    // Return data in requested format
    if (exportFormat === 'json') {
      return NextResponse.json(formattedData, {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } else if (exportFormat === 'xlsx') {
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Departments');

      // Add title row
      worksheet.addRow(['Departments Export']).font = {
        bold: true,
        size: 16
      };

      // Add date row
      worksheet.addRow([`Generated on: ${new Date().toLocaleString()}`]);

      // Add empty row
      worksheet.addRow([]);

      // Define columns
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Department Code', key: 'departmentCode', width: 20 },
        { header: 'Department Name', key: 'departmentName', width: 30 },
        { header: 'Institution', key: 'institutionName', width: 30 },
        { header: 'Degree', key: 'degreeName', width: 20 },
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
          { label: 'Department Code', value: 'departmentCode' },
          { label: 'Department Name', value: 'departmentName' },
          { label: 'Institution', value: 'institutionName' },
          { label: 'Degree', value: 'degreeName' },
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
