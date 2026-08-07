export const dynamic = 'force-dynamic';

// app/api/staff/bulk-edit/template/route.ts
//
// GET — Excel template pre-filled with EXISTING staff (current values), matching the
// optional institution_id/department_id/category_id filters. Runs as the signed-in user
// (RLS scopes the rows). Institution Email is the locked match key on re-upload.

import { NextRequest, NextResponse, connection } from 'next/server';
import ExcelJS from 'exceljs';
import { withAuth } from '@/lib/auth/with-auth';
import { getErrorMessage } from '@/lib/utils';
import { BULK_EDIT_COLUMNS } from '@/lib/services/staff/staff-bulk-edit-columns';
import { BaseService } from '@/lib/services/base-service';

export const GET = withAuth(async (request: NextRequest, auth) => {
  await connection();
  try {
    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institution_id') || undefined;
    const departmentId = url.searchParams.get('department_id') || undefined;
    const categoryId = url.searchParams.get('category_id') || undefined;

    const supabase = (BaseService as any).supabase;
    let query = supabase
      .from('staff')
      .select(
        'id, institution_email, staff_id, first_name, last_name, institution_id, ' +
          'phone, email, date_of_birth, gender, marital_status, blood_group, address, state, district, pincode, ' +
          'designation, date_of_joining, department_id, category_id, biometric_id, biometric_institution_id, ' +
          'institution:institutions!staff_institution_id_fkey(id, name), ' +
          'department:departments(id, department_name), ' +
          'category:employment_categories(id, category_name)'
      )
      .order('first_name', { ascending: true });

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (departmentId) query = query.eq('department_id', departmentId);
    if (categoryId) query = query.eq('category_id', categoryId);

    const { data: staff, error } = await query;
    if (error) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    }

    // Machine names for the Biometric Machine column — ALL institutions, not just the
    // ones in this filtered result, because the machine's owning institution is often
    // NOT the staff member's own institution.
    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('id, name')
      .order('name');
    if (instError) {
      return NextResponse.json({ error: getErrorMessage(instError) }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();

    // ── Instructions ────────────────────────────────────────────────
    const help = wb.addWorksheet('Instructions');
    help.columns = [{ width: 32 }, { width: 90 }];
    help.addRow(['Staff Bulk Edit', '']);
    help.addRow(['', '']);
    help.addRow(['Blank cell', 'Leaves the field unchanged. Bulk edit never clears a field and never creates staff.']);
    help.addRow(['Institution Email', 'The match key. Do not edit it, and do not delete the column.']);
    help.addRow(['Locked columns', 'Institution Email, Staff ID (current), Name, Institution are ignored on upload.']);
    help.addRow(['', '']);
    for (const col of BULK_EDIT_COLUMNS) {
      if (col.note) help.addRow([col.header, col.note]);
      if (col.enumValues) help.addRow([`${col.header} — allowed`, col.enumValues.join(', ')]);
    }

    // ── Staff ───────────────────────────────────────────────────────
    const ws = wb.addWorksheet('Staff');
    ws.columns = BULK_EDIT_COLUMNS.map(c => ({
      header: c.header,
      key: c.header,
      width: Math.max(16, Math.min(40, c.header.length + 8))
    }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const s of staff ?? []) {
      ws.addRow({
        // RAW institution_email — never displayEmail(). 124 staff hold a synthetic
        // @nolog.jkkn.local address and that IS their key.
        'Institution Email': s.institution_email,
        'Staff ID (current)': s.staff_id ?? '',
        Name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
        Institution: s.institution?.name ?? '',
        Phone: s.phone ?? '',
        'Personal Email': s.email ?? '',
        'Date of Birth': s.date_of_birth ?? '',
        Gender: s.gender ?? '',
        'Marital Status': s.marital_status ?? '',
        'Blood Group': s.blood_group ?? '',
        Address: s.address ?? '',
        State: s.state ?? '',
        District: s.district ?? '',
        Pincode: s.pincode ?? '',
        'Staff ID (new)': s.staff_id ?? '',
        Designation: s.designation ?? '',
        'Date of Joining': s.date_of_joining ?? '',
        Department: s.department?.department_name ?? '',
        Category: s.category?.category_name ?? '',
        'Biometric Code': s.biometric_id ?? '',
        'Biometric Machine': (institutions ?? []).find((i: any) => i.id === s.biometric_institution_id)?.name ?? ''
      });
    }

    // Dropdowns on the enum columns, for rows 2..(n+500) so pasted rows keep them.
    const lastRow = (staff?.length ?? 0) + 500;
    BULK_EDIT_COLUMNS.forEach((col, idx) => {
      if (!col.enumValues) return;
      const letter = ws.getColumn(idx + 1).letter;
      for (let r = 2; r <= lastRow; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${col.enumValues.join(',')}"`]
        };
      }
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="staff-bulk-edit-${new Date().toISOString().slice(0, 10)}.xlsx"`
      }
    });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}, { requiredPermission: 'write' });
