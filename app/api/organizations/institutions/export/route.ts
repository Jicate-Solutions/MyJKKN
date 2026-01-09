import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { parse } from 'json2csv';
import {
  EXCEL_INSTITUTION_TYPES,
  EXCEL_CATEGORIES,
  EXCEL_TIMETABLE_TYPES,
  mapValueToLabel
} from '@/lib/utils/institution-excel-mappings';


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
    let query = (supabase as any).from('institutions').select('*');

    // Apply filters
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    // If not exporting all, limit to a reasonable number
    if (!includeAll) {
      query = query.limit(500);
    }

    // Execute the query
    const { data: institutions, error } = await query;

    if (error) {
      console.error('Error fetching institutions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: error.message },
        { status: 500 }
      );
    }

    if (!institutions || institutions.length === 0) {
      return NextResponse.json(
        { error: 'No institutions found to export' },
        { status: 404 }
      );
    }

    // Process data for export
    const exportableData = institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
      code: institution.code || '',
      counselling_code: institution.counselling_code || '',
      institution_type: mapValueToLabel(institution.institution_type || '', 'institutionType'),
      category: mapValueToLabel(institution.category || '', 'category'),
      timetable_type: mapValueToLabel(institution.timetable_type || '', 'timetableType'),
      accredited_by: institution.accredited_by || '',
      address_line1: institution.address_line1 || '',
      address_line2: institution.address_line2 || '',
      address_line3: institution.address_line3 || '',
      address: institution.address || '',
      city: institution.city || '',
      state: institution.state || '',
      country: institution.country || '',
      pincode: institution.pincode || institution.pin_code || '',
      phone: institution.phone || '',
      email: institution.email || '',
      website: institution.website || '',
      is_active: institution.is_active,
      logo_url: institution.logo_url || '',
      transportation_dept: institution.transportation_dept || '',
      administration_dept: institution.administration_dept || '',
      accounts_dept: institution.accounts_dept || '',
      admission_dept: institution.admission_dept || '',
      placement_dept: institution.placement_dept || '',
      anti_ragging_dept: institution.anti_ragging_dept || '',
      created_by: institution.created_by || '',
      created_at: institution.created_at || '',
      updated_at: institution.updated_at || ''
    }));

    // Format and return the data according to the requested format
    switch (format) {
      case 'xlsx': {
        // Create and format Excel workbook with dropdown validation
        const workbook = new ExcelJS.Workbook();

        // ============================================================
        // SHEET 1: Institutions (Main Data Sheet)
        // ============================================================
        const worksheet = workbook.addWorksheet('Institutions');

        // Define columns
        worksheet.columns = [
          { header: 'ID', key: 'id', width: 40 },
          { header: 'Name', key: 'name', width: 30 },
          { header: 'Code', key: 'code', width: 15 },
          { header: 'Counselling Code', key: 'counselling_code', width: 20 },
          { header: 'Institution Type', key: 'institution_type', width: 20 },
          { header: 'Category', key: 'category', width: 15 },
          { header: 'Timetable Type', key: 'timetable_type', width: 20 },
          { header: 'Accredited By', key: 'accredited_by', width: 15 },
          { header: 'Address Line 1', key: 'address_line1', width: 30 },
          { header: 'Address Line 2', key: 'address_line2', width: 30 },
          { header: 'Address Line 3', key: 'address_line3', width: 30 },
          { header: 'Address', key: 'address', width: 30 },
          { header: 'City', key: 'city', width: 20 },
          { header: 'State', key: 'state', width: 20 },
          { header: 'Country', key: 'country', width: 20 },
          { header: 'Pincode', key: 'pincode', width: 15 },
          { header: 'Phone', key: 'phone', width: 20 },
          { header: 'Email', key: 'email', width: 30 },
          { header: 'Website', key: 'website', width: 30 },
          { header: 'Is Active', key: 'is_active', width: 10 },
          { header: 'Logo URL', key: 'logo_url', width: 40 },
          {
            header: 'Transportation Dept',
            key: 'transportation_dept',
            width: 20
          },
          {
            header: 'Administration Dept',
            key: 'administration_dept',
            width: 20
          },
          { header: 'Accounts Dept', key: 'accounts_dept', width: 20 },
          { header: 'Admission Dept', key: 'admission_dept', width: 20 },
          { header: 'Placement Dept', key: 'placement_dept', width: 20 },
          { header: 'Anti-Ragging Dept', key: 'anti_ragging_dept', width: 20 },
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

        // Freeze first row
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        // Add data rows
        exportableData.forEach((institution) => {
          worksheet.addRow(institution);
        });

        // ============================================================
        // SHEET 2: Lists (Reference Data for Dropdowns)
        // ============================================================
        const listsSheet = workbook.addWorksheet('Lists');

        // Add headers
        listsSheet.addRow(['Institution Type', 'Category', 'Timetable Type']);
        listsSheet.getRow(1).font = { bold: true };

        // Add dropdown values
        const maxRows = Math.max(
          EXCEL_INSTITUTION_TYPES.length,
          EXCEL_CATEGORIES.length,
          EXCEL_TIMETABLE_TYPES.length
        );

        for (let i = 0; i < maxRows; i++) {
          listsSheet.addRow([
            EXCEL_INSTITUTION_TYPES[i] || '',
            EXCEL_CATEGORIES[i] || '',
            EXCEL_TIMETABLE_TYPES[i] || ''
          ]);
        }

        // Auto-fit columns in Lists sheet
        listsSheet.columns = [
          { width: 20 },
          { width: 15 },
          { width: 20 }
        ];

        // ============================================================
        // DATA VALIDATION (Dropdowns) - Using inline lists
        // ExcelJS requires: formulae: ['"Value1,Value2,Value3"']
        // with double quotes inside the array for inline list validation
        // ============================================================

        // Define validation end row (data + 50 extra rows, capped at 100)
        const validationEndRow = Math.min(exportableData.length + 50, 100);

        // Create inline list formulas - ExcelJS format requires double-quoted string
        const institutionTypeList = `"${EXCEL_INSTITUTION_TYPES.join(',')}"`;
        const categoryList = `"${EXCEL_CATEGORIES.join(',')}"`;
        const timetableTypeList = `"${EXCEL_TIMETABLE_TYPES.join(',')}"`;

        // Apply validation cell-by-cell (ExcelJS requires this approach)
        for (let row = 2; row <= validationEndRow; row++) {
          // Column E: Institution Type dropdown
          worksheet.getCell(`E${row}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [institutionTypeList],
            showErrorMessage: true,
            errorStyle: 'warning',
            errorTitle: 'Invalid Input',
            error: `Please select: ${EXCEL_INSTITUTION_TYPES.join(', ')}`
          };

          // Column F: Category dropdown
          worksheet.getCell(`F${row}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [categoryList],
            showErrorMessage: true,
            errorStyle: 'warning',
            errorTitle: 'Invalid Input',
            error: `Please select: ${EXCEL_CATEGORIES.join(', ')}`
          };

          // Column G: Timetable Type dropdown
          worksheet.getCell(`G${row}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [timetableTypeList],
            showErrorMessage: true,
            errorStyle: 'warning',
            errorTitle: 'Invalid Input',
            error: `Please select: ${EXCEL_TIMETABLE_TYPES.join(', ')}`
          };
        }

        // ============================================================
        // OPTIONAL: Hide Lists Sheet (Recommended)
        // ============================================================
        listsSheet.state = 'hidden';

        // Generate Excel file
        const buffer = await workbook.xlsx.writeBuffer();

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename=institutions-export-${
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
            'Content-Disposition': `attachment; filename=institutions-export-${
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
          'name',
          'code',
          'counselling_code',
          'institution_type',
          'category',
          'timetable_type',
          'accredited_by',
          'address_line1',
          'address_line2',
          'address_line3',
          'address',
          'city',
          'state',
          'country',
          'pincode',
          'phone',
          'email',
          'website',
          'is_active',
          'logo_url',
          'transportation_dept',
          'administration_dept',
          'accounts_dept',
          'admission_dept',
          'placement_dept',
          'anti_ragging_dept',
          'created_by',
          'created_at',
          'updated_at'
        ];

        const csv = parse(exportableData, { fields });

        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename=institutions-export-${
              new Date().toISOString().split('T')[0]
            }.csv`
          }
        });
      }
    }
  } catch (error) {
    console.error('Error exporting institutions:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to export institutions', message: errorMessage },
      { status: 500 }
    );
  }
}
