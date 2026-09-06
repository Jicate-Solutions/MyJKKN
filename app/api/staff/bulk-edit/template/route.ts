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
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

export const GET = withAuth(async (request: NextRequest, auth) => {
  await connection();
  try {
    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institution_id') || undefined;
    const departmentId = url.searchParams.get('department_id') || undefined;
    const categoryId = url.searchParams.get('category_id') || undefined;
    // Optional: the machine this whole sheet is enrolling onto. Mirrors the HR "Link codes"
    // step, which picks the machine ONCE for a file rather than per person. Without it every
    // row has to restate the machine, and a code with no machine is refused outright by
    // staff_biometric_scope_chk — which is what made code-only edits look like they were
    // being ignored.
    const biometricInstitutionId = url.searchParams.get('biometric_institution_id') || undefined;

    // Explicit institution scope, in addition to RLS. Mirrors preview/apply so all three
    // routes enforce the same boundary rather than this one relying on RLS alone.
    const filter = await createApiInstitutionFilter(request, { requireInstitutionAccess: true });
    if (!filter.isAllowed) {
      return NextResponse.json({ error: filter.reason ?? 'No institution access' }, { status: 403 });
    }

    const supabase = (BaseService as any).supabase;
    // PostgREST caps an unbounded select() at 1000 rows. Staff is at 864 and climbing, and
    // a row missing from the sheet is invisible — the user simply never sees that person to
    // edit them. Bound it explicitly, generously above current scale, so growth past the cap
    // errors instead of silently truncating. Same reasoning as LOOKUP_RANGE_END in
    // bulk-staff-edit-service.ts.
    const STAFF_RANGE_END = 9999;
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

    // An EMPTY institutionIds means ALL institutions (super-admin / admission-global bypass;
    // api-institution-filter.ts's own comment reads "Empty means access to all").
    // .in('institution_id', []) would match ZERO rows, so guard on length — and never branch
    // on filter.isSuperAdmin, which silently strips scope='all' secondary roles.
    if (filter.institutionIds.length > 0) {
      query = query.in('institution_id', filter.institutionIds);
    }

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (departmentId) query = query.eq('department_id', departmentId);
    if (categoryId) query = query.eq('category_id', categoryId);

    const { data: staff, error } = await query.range(0, STAFF_RANGE_END);
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

    // Employment category names for the Category dropdown. UNFILTERED on purpose, matching
    // BulkStaffEditService.buildContext: the validator accepts any category name that exists,
    // so the sheet has to offer exactly that set. Filtering to is_active here would hide a
    // name the validator would have accepted.
    const { data: categoryList, error: catError } = await supabase
      .from('employment_categories')
      .select('id, category_name')
      .order('category_name');
    if (catError) {
      return NextResponse.json({ error: getErrorMessage(catError) }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();

    // ── Instructions ────────────────────────────────────────────────
    const help = wb.addWorksheet('Instructions');
    help.columns = [{ width: 32 }, { width: 90 }];
    help.addRow(['Staff Bulk Edit', '']);
    help.addRow(['', '']);
    help.addRow(['Blank cell', 'Leaves the field unchanged. Bulk edit never clears a field and never creates staff.']);
    help.addRow(['Institution Email', 'The match key. Do not edit it, and do not delete the column.']);
    help.addRow(['Locked columns', 'Institution Email, Staff ID, Name, Institution are ignored on upload.']);
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

    // The sheet-wide machine default, applied ONLY where the cell would otherwise be blank.
    // Never over-write a machine already on file: doing so would silently move an existing
    // enrolment to a different machine for everyone in the sheet, and because a blank code
    // cell means "keep the code on file", that move would sail through validation.
    const defaultMachineName = biometricInstitutionId
      ? ((institutions ?? []).find((i: any) => i.id === biometricInstitutionId)?.name ?? '')
      : '';

    for (const s of staff ?? []) {
      const currentMachineName =
        (institutions ?? []).find((i: any) => i.id === s.biometric_institution_id)?.name ?? '';
      ws.addRow({
        // RAW institution_email — never displayEmail(). 124 staff hold a synthetic
        // @nolog.jkkn.local address and that IS their key.
        'Institution Email': s.institution_email,
        'Staff ID': s.staff_id ?? '',
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
        Designation: s.designation ?? '',
        'Date of Joining': s.date_of_joining ?? '',
        Department: s.department?.department_name ?? '',
        Category: s.category?.category_name ?? '',
        'Biometric Code': s.biometric_id ?? '',
        'Biometric Machine': currentMachineName || defaultMachineName
      });
    }

    // ── Lists (hidden) ──────────────────────────────────────────────
    // Backing ranges for the lookup dropdowns. An inline list formula ("a,b,c") is capped at
    // 255 characters by the file format and the institution names alone blow past that, so a
    // closed-set lookup has to point at a real range instead.
    //
    // Department is deliberately NOT given a dropdown: department names are only unique
    // WITHIN an institution and the validator resolves them inside the staff member's own
    // institution, so a flat cross-institution list would offer choices that are wrong for
    // most rows. That cell arrives pre-filled with the current department and only needs
    // typing when it is genuinely being changed.
    const lists = wb.addWorksheet('Lists', { state: 'hidden' });
    lists.getCell('A1').value = 'Machines';
    (institutions ?? []).forEach((i: any, n: number) => {
      lists.getCell(`A${n + 2}`).value = i.name;
    });
    lists.getCell('B1').value = 'Categories';
    (categoryList ?? []).forEach((c: any, n: number) => {
      lists.getCell(`B${n + 2}`).value = c.category_name;
    });

    // Dropdowns for rows 2..(n+500) so pasted rows keep them.
    //
    // The closed-set LOOKUP columns get one too, not just the enums. "Biometric Machine"
    // having no dropdown is what made biometric edits fail in practice: the column is blank
    // for every staff member (nobody is enrolled yet), so it always has to be typed from
    // scratch, and anything that is not an exact institution name is rejected as a record
    // error — which the preview then reported as "nothing differs".
    const lastRow = (staff?.length ?? 0) + 500;
    const rangeFor = (column: 'A' | 'B', count: number) =>
      count > 0 ? [`Lists!$${column}$2:$${column}$${count + 1}`] : null;
    const lookupSource: Record<string, string[] | null> = {
      'Biometric Machine': rangeFor('A', (institutions ?? []).length),
      Category: rangeFor('B', (categoryList ?? []).length)
    };

    BULK_EDIT_COLUMNS.forEach((col, idx) => {
      const formulae = col.enumValues
        ? [`"${col.enumValues.join(',')}"`]
        : (lookupSource[col.header] ?? null);
      if (!formulae) return;
      const letter = ws.getColumn(idx + 1).letter;
      for (let r = 2; r <= lastRow; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae
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
}, { requirePermission: 'staff.manage_imports' });
