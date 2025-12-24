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

    // Start building the query
    let query = (supabase as any).from('staff').select(`
      *,
      category:employment_categories(
        id, 
        category_name
      ),
      institution:institutions(
        id, 
        name, 
        counselling_code
      ),
      department:departments(
        id, 
        department_name
      )
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
    const { data: staff, error } = await query;

    if (error) {
      console.error('Error fetching staff:', error);
      return NextResponse.json(
        { error: 'Failed to fetch staff', message: error.message },
        { status: 500 }
      );
    }

    if (!staff || staff.length === 0) {
      return NextResponse.json(
        { error: 'No staff found to export' },
        { status: 404 }
      );
    }

    // Process data for export - match schema from SQL INSERT statement
    const exportableData = staff.map((member) => ({
      id: member.id,
      first_name: member.first_name,
      last_name: member.last_name,
      gender: member.gender || '',
      date_of_birth: member.date_of_birth || '',
      marital_status: member.marital_status || '',
      blood_group: member.blood_group || '',
      email: member.email || '',
      phone: member.phone || '',
      staff_id: member.staff_id || '',
      profile_picture: member.profile_picture || '',
      address: member.address || '',
      state: member.state || '',
      district: member.district || '',
      pincode: member.pincode || '',
      date_of_joining: member.date_of_joining || '',
      designation: member.designation || '',

      // Include both ID and name fields for better usability
      category_id: member.category_id || '',
      institution_id: member.institution_id || '',
      department_id: member.department_id || '',

      // Add name fields for easier re-import
      category_name: member.category?.category_name || '',
      institution_name: member.institution?.name || '',
      department_name: member.department?.department_name || '',

      is_active: member.is_active === true ? 'true' : 'false',
      created_at: member.created_at || '',
      updated_at: member.updated_at || '',
      created_by: member.created_by || '',
      updated_by: member.updated_by || '',
      institution_email: member.institution_email || ''
    }));

    // Format and return the data according to the requested format
    switch (format) {
      case 'xlsx': {
        // Create and format Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Staff');

        // Define columns - match order in SQL INSERT statement
        worksheet.columns = [
          { header: 'ID', key: 'id', width: 40 },
          { header: 'First Name', key: 'first_name', width: 20 },
          { header: 'Last Name', key: 'last_name', width: 20 },
          { header: 'Gender', key: 'gender', width: 15 },
          { header: 'Date of Birth', key: 'date_of_birth', width: 15 },
          { header: 'Marital Status', key: 'marital_status', width: 15 },
          { header: 'Blood Group', key: 'blood_group', width: 15 },
          { header: 'Email', key: 'email', width: 30 },
          { header: 'Phone', key: 'phone', width: 20 },
          { header: 'Staff ID', key: 'staff_id', width: 20 },
          { header: 'Profile Picture', key: 'profile_picture', width: 40 },
          { header: 'Address', key: 'address', width: 40 },
          { header: 'State', key: 'state', width: 20 },
          { header: 'District', key: 'district', width: 20 },
          { header: 'Pincode', key: 'pincode', width: 15 },
          { header: 'Date of Joining', key: 'date_of_joining', width: 15 },
          { header: 'Designation', key: 'designation', width: 25 },
          { header: 'Category ID', key: 'category_id', width: 40 },
          { header: 'Institution ID', key: 'institution_id', width: 40 },
          { header: 'Department ID', key: 'department_id', width: 40 },
          { header: 'Is Active', key: 'is_active', width: 10 },
          { header: 'Created At', key: 'created_at', width: 25 },
          { header: 'Updated At', key: 'updated_at', width: 25 },
          { header: 'Created By', key: 'created_by', width: 40 },
          { header: 'Updated By', key: 'updated_by', width: 40 },
          { header: 'Institution Email', key: 'institution_email', width: 30 },

          // Reference columns (for human readability)
          { header: 'Category Name', key: 'category_name', width: 25 },
          { header: 'Institution Name', key: 'institution_name', width: 30 },
          { header: 'Department Name', key: 'department_name', width: 30 }
        ];

        // Add formatting to headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };

        // Add data rows
        exportableData.forEach((staff) => {
          worksheet.addRow(staff);
        });

        // Add conditional formatting - highlight primary keys and foreign keys
        worksheet
          .getColumn('id')
          .eachCell({ includeEmpty: false }, (cell, rowNumber) => {
            if (rowNumber > 1) {
              cell.font = { color: { argb: '000000FF' } }; // Blue for primary key
            }
          });

        [
          'category_id',
          'institution_id',
          'department_id',
          'created_by',
          'updated_by'
        ].forEach((column) => {
          worksheet
            .getColumn(column)
            .eachCell({ includeEmpty: false }, (cell, rowNumber) => {
              if (rowNumber > 1) {
                cell.font = { color: { argb: '00800080' } }; // Purple for foreign keys
              }
            });
        });

        // Generate Excel file
        const buffer = await workbook.xlsx.writeBuffer();

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename=staff-export-${
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
            'Content-Disposition': `attachment; filename=staff-export-${
              new Date().toISOString().split('T')[0]
            }.json`
          }
        });
      }

      case 'csv':
      default: {
        // Use json2csv to convert data to CSV - include all fields in order
        const fields = [
          'id',
          'first_name',
          'last_name',
          'gender',
          'date_of_birth',
          'marital_status',
          'blood_group',
          'email',
          'phone',
          'staff_id',
          'profile_picture',
          'address',
          'state',
          'district',
          'pincode',
          'date_of_joining',
          'designation',
          'category_id',
          'institution_id',
          'department_id',
          'is_active',
          'created_at',
          'updated_at',
          'created_by',
          'updated_by',
          'institution_email',
          'category_name',
          'institution_name',
          'department_name'
        ];

        const csv = parse(exportableData, { fields });

        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename=staff-export-${
              new Date().toISOString().split('T')[0]
            }.csv`
          }
        });
      }
    }
  } catch (error) {
    console.error('Error exporting staff:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to export staff', message: errorMessage },
      { status: 500 }
    );
  }
}
