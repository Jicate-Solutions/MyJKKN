import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { parse } from 'json2csv';

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

    // Check authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'csv';
    const includeAll = url.searchParams.get('includeAll') === 'true';
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    // Start building the query - include join with institutions to get institution name
    let query = supabase.from('degrees').select(`
        *,
        institutions:institution_id(id, name)
      `);

    // Apply filters
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    // If not exporting all, limit to a reasonable number
    if (!includeAll) {
      query = query.limit(500);
    }

    // Execute the query
    const { data: degrees, error } = await query;

    if (error) {
      console.error('Error fetching degrees:', error);
      return NextResponse.json(
        { error: 'Failed to fetch degrees', message: error.message },
        { status: 500 }
      );
    }

    if (!degrees || degrees.length === 0) {
      return NextResponse.json(
        { error: 'No degrees found to export' },
        { status: 404 }
      );
    }

    // Process data for export - create a flat structure with institution name
    const exportableData = degrees.map((degree) => ({
      id: degree.id,
      institution_id: degree.institution_id,
      institution_name: degree.institutions?.name || '',
      degree_id: degree.degree_id || '',
      degree_name: degree.degree_name || '',
      degree_type: degree.degree_type || '',
      is_active: degree.is_active,
      created_by: degree.created_by || '',
      created_at: degree.created_at || '',
      updated_at: degree.updated_at || ''
    }));

    // Format and return the data according to the requested format
    switch (format) {
      case 'xlsx': {
        // Create and format Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Degrees');

        // Define columns
        worksheet.columns = [
          { header: 'ID', key: 'id', width: 40 },
          { header: 'Institution ID', key: 'institution_id', width: 40 },
          { header: 'Institution Name', key: 'institution_name', width: 30 },
          { header: 'Degree ID', key: 'degree_id', width: 15 },
          { header: 'Degree Name', key: 'degree_name', width: 30 },
          { header: 'Degree Type', key: 'degree_type', width: 15 },
          { header: 'Is Active', key: 'is_active', width: 10 },
          { header: 'Created By', key: 'created_by', width: 40 },
          { header: 'Created At', key: 'created_at', width: 30 },
          { header: 'Updated At', key: 'updated_at', width: 30 }
        ];

        // Add formatting to headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };

        // Add data rows
        exportableData.forEach((degree) => {
          worksheet.addRow(degree);
        });

        // Generate Excel file
        const buffer = await workbook.xlsx.writeBuffer();

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename=degrees-export-${
              new Date().toISOString().split('T')[0]
            }.xlsx`
          }
        });
      }

      case 'json': {
        return new NextResponse(JSON.stringify(exportableData, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename=degrees-export-${
              new Date().toISOString().split('T')[0]
            }.json`
          }
        });
      }

      case 'csv':
      default: {
        // Use json2csv to convert data to CSV
        const fields = [
          'id',
          'institution_id',
          'institution_name',
          'degree_id',
          'degree_name',
          'degree_type',
          'is_active',
          'created_by',
          'created_at',
          'updated_at'
        ];

        const csv = parse(exportableData, { fields });

        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename=degrees-export-${
              new Date().toISOString().split('T')[0]
            }.csv`
          }
        });
      }
    }
  } catch (error) {
    console.error('Error exporting degrees:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to export degrees', message: errorMessage },
      { status: 500 }
    );
  }
}
