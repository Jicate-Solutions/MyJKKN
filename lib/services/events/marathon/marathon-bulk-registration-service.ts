// lib/services/events/marathon/marathon-bulk-registration-service.ts
// Bulk import service for external marathon registrations.
// Handles Excel template generation, row validation, and batch insert.

import ExcelJS from 'exceljs';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

// ============================================================================
// Types
// ============================================================================

export interface BulkRegistrationRow {
  participant_name: string;
  participant_phone: string;
  participant_email?: string;
  participant_age?: number;
  participant_gender?: string;
  institution_name?: string;
  department?: string;
  category_code: string; // maps to event_categories.code (e.g., '5K', '10K')
  tshirt_size?: string;
  blood_group?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

export interface RowValidationError {
  row: number;
  field: string;
  message: string;
}

export interface BulkImportResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: RowValidationError[];
  registrations: { row: number; bib_number: string; name: string }[];
}

interface CategoryInfo {
  id: string;
  name: string;
  code: string;
  fee_amount: number;
  max_participants: number | null;
}

// ============================================================================
// Template column definitions
// ============================================================================

const TEMPLATE_COLUMNS = [
  { header: 'Name *', key: 'participant_name', width: 25 },
  { header: 'Phone *', key: 'participant_phone', width: 18 },
  { header: 'Email', key: 'participant_email', width: 25 },
  { header: 'Age', key: 'participant_age', width: 8 },
  { header: 'Gender', key: 'participant_gender', width: 10 },
  { header: 'Category Code *', key: 'category_code', width: 16 },
  { header: 'Institution / Organization', key: 'institution_name', width: 30 },
  { header: 'Department', key: 'department', width: 20 },
  { header: 'T-Shirt Size', key: 'tshirt_size', width: 14 },
  { header: 'Blood Group', key: 'blood_group', width: 14 },
  { header: 'Emergency Contact Name', key: 'emergency_contact_name', width: 25 },
  { header: 'Emergency Contact Phone', key: 'emergency_contact_phone', width: 22 },
];

// ============================================================================
// Service
// ============================================================================

export class MarathonBulkRegistrationService {
  /**
   * Generate an Excel import template with headers, sample data, and a legend sheet.
   */
  static async generateTemplate(
    eventId: string,
    eventName: string
  ): Promise<Buffer> {
    const supabase = createServiceRoleClient();

    // Fetch categories for this event
    const { data: categories } = await supabase
      .from('event_categories')
      .select('id, name, code, fee_amount')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('sort_order');

    const cats = (categories ?? []) as CategoryInfo[];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MyJKKN';
    workbook.created = new Date();

    // ── Sheet 1: Registrations ──────────────────────────────────────
    const sheet = workbook.addWorksheet('Registrations');
    sheet.columns = TEMPLATE_COLUMNS;

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    // Add 2 sample rows
    sheet.addRow({
      participant_name: 'Ravi Kumar',
      participant_phone: '9876543210',
      participant_email: 'ravi@example.com',
      participant_age: 22,
      participant_gender: 'male',
      category_code: cats[0]?.code ?? '5K',
      institution_name: 'ABC College',
      department: 'Computer Science',
      tshirt_size: 'L',
      blood_group: 'B+',
      emergency_contact_name: 'Priya Kumar',
      emergency_contact_phone: '9876543211',
    });
    sheet.addRow({
      participant_name: 'Meena S',
      participant_phone: '8765432100',
      participant_email: 'meena@example.com',
      participant_age: 20,
      participant_gender: 'female',
      category_code: cats[1]?.code ?? cats[0]?.code ?? '10K',
      institution_name: 'XYZ University',
      department: 'Physics',
      tshirt_size: 'M',
      blood_group: 'O+',
      emergency_contact_name: 'Suresh S',
      emergency_contact_phone: '8765432101',
    });

    // Style sample rows as italic light gray
    [2, 3].forEach((r) => {
      const row = sheet.getRow(r);
      row.font = { italic: true, color: { argb: 'FF9CA3AF' } };
    });

    // Add category code dropdown validation
    if (cats.length > 0) {
      const codeList = cats.map((c) => c.code).filter(Boolean);
      if (codeList.length > 0) {
        sheet.dataValidations.add('F2:F10000', {
          type: 'list',
          allowBlank: false,
          formulae: [`"${codeList.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'Invalid Category',
          error: `Must be one of: ${codeList.join(', ')}`,
        });
      }
    }

    // Gender dropdown
    sheet.dataValidations.add('E2:E10000', {
      type: 'list',
      allowBlank: true,
      formulae: ['"male,female,other"'],
    });

    // T-shirt size dropdown
    sheet.dataValidations.add('I2:I10000', {
      type: 'list',
      allowBlank: true,
      formulae: ['"XS,S,M,L,XL,XXL"'],
    });

    // ── Sheet 2: Legend ─────────────────────────────────────────────
    const legend = workbook.addWorksheet('Instructions');
    legend.columns = [
      { header: 'Field', key: 'field', width: 30 },
      { header: 'Required', key: 'required', width: 12 },
      { header: 'Description', key: 'description', width: 50 },
    ];

    const legendHeader = legend.getRow(1);
    legendHeader.font = { bold: true };
    legendHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    };

    const fields = [
      { field: 'Name', required: 'Yes', description: 'Full name of the participant (min 2 characters)' },
      { field: 'Phone', required: 'Yes', description: 'Phone number (10-15 digits). Used for duplicate detection.' },
      { field: 'Email', required: 'No', description: 'Email address' },
      { field: 'Age', required: 'No', description: 'Age in years (1-150)' },
      { field: 'Gender', required: 'No', description: 'male / female / other' },
      { field: 'Category Code', required: 'Yes', description: `Category code from: ${cats.map((c) => `${c.code} (${c.name})`).join(', ') || 'No categories defined'}` },
      { field: 'Institution / Organization', required: 'No', description: 'College, school, or company name' },
      { field: 'Department', required: 'No', description: 'Department or branch' },
      { field: 'T-Shirt Size', required: 'No', description: 'XS / S / M / L / XL / XXL' },
      { field: 'Blood Group', required: 'No', description: 'e.g., A+, B-, O+, AB+' },
      { field: 'Emergency Contact Name', required: 'No', description: 'Name of emergency contact person' },
      { field: 'Emergency Contact Phone', required: 'No', description: 'Phone of emergency contact person' },
    ];
    fields.forEach((f) => legend.addRow(f));

    // Add categories reference
    legend.addRow({});
    legend.addRow({ field: '── Available Categories ──', required: '', description: '' });
    cats.forEach((c) => {
      legend.addRow({
        field: c.code ?? '-',
        required: c.name,
        description: c.fee_amount > 0 ? `Fee: ₹${c.fee_amount}` : 'Free',
      });
    });

    // Add event info
    legend.addRow({});
    legend.addRow({ field: '── Event Info ──', required: '', description: '' });
    legend.addRow({ field: 'Event', required: '', description: eventName });
    legend.addRow({ field: 'Import Type', required: '', description: 'External participants only' });
    legend.addRow({ field: 'Note', required: '', description: 'Delete the 2 sample rows before importing' });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Validate parsed rows before import.
   */
  static validateRows(
    rows: Record<string, unknown>[],
    validCategoryCodes: string[]
  ): { validRows: BulkRegistrationRow[]; errors: RowValidationError[] } {
    const errors: RowValidationError[] = [];
    const validRows: BulkRegistrationRow[] = [];
    const seenPhones = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // Excel row (1-indexed + header)
      const raw = rows[i];
      let hasError = false;

      const name = String(raw.participant_name ?? raw['Name *'] ?? raw['Name'] ?? '').trim();
      const phone = String(raw.participant_phone ?? raw['Phone *'] ?? raw['Phone'] ?? '').trim().replace(/\D/g, '');
      const email = String(raw.participant_email ?? raw['Email'] ?? '').trim() || undefined;
      const ageRaw = raw.participant_age ?? raw['Age'] ?? '';
      const age = ageRaw ? Number(ageRaw) : undefined;
      const gender = String(raw.participant_gender ?? raw['Gender'] ?? '').trim().toLowerCase() || undefined;
      const catCode = String(raw.category_code ?? raw['Category Code *'] ?? raw['Category Code'] ?? '').trim().toUpperCase();
      const institution = String(raw.institution_name ?? raw['Institution / Organization'] ?? '').trim() || undefined;
      const department = String(raw.department ?? raw['Department'] ?? '').trim() || undefined;
      const tshirt = String(raw.tshirt_size ?? raw['T-Shirt Size'] ?? '').trim().toUpperCase() || undefined;
      const bloodGroup = String(raw.blood_group ?? raw['Blood Group'] ?? '').trim() || undefined;
      const ecName = String(raw.emergency_contact_name ?? raw['Emergency Contact Name'] ?? '').trim() || undefined;
      const ecPhone = String(raw.emergency_contact_phone ?? raw['Emergency Contact Phone'] ?? '').trim() || undefined;

      // Required field validation
      if (!name || name.length < 2) {
        errors.push({ row: rowNum, field: 'Name', message: 'Name is required (min 2 characters)' });
        hasError = true;
      }

      if (!phone || phone.length < 10 || phone.length > 15) {
        errors.push({ row: rowNum, field: 'Phone', message: 'Valid phone number required (10-15 digits)' });
        hasError = true;
      }

      if (!catCode) {
        errors.push({ row: rowNum, field: 'Category Code', message: 'Category code is required' });
        hasError = true;
      } else if (!validCategoryCodes.includes(catCode)) {
        errors.push({
          row: rowNum,
          field: 'Category Code',
          message: `Invalid category "${catCode}". Valid: ${validCategoryCodes.join(', ')}`,
        });
        hasError = true;
      }

      // Optional field validation
      if (age !== undefined && (isNaN(age) || age < 1 || age > 150)) {
        errors.push({ row: rowNum, field: 'Age', message: 'Age must be 1-150' });
        hasError = true;
      }

      if (gender && !['male', 'female', 'other'].includes(gender)) {
        errors.push({ row: rowNum, field: 'Gender', message: 'Gender must be male/female/other' });
        hasError = true;
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, field: 'Email', message: 'Invalid email format' });
        hasError = true;
      }

      // Duplicate phone within file
      if (phone && seenPhones.has(phone)) {
        errors.push({ row: rowNum, field: 'Phone', message: `Duplicate phone in file (same as earlier row)` });
        hasError = true;
      }
      if (phone) seenPhones.add(phone);

      if (!hasError) {
        validRows.push({
          participant_name: name,
          participant_phone: phone,
          participant_email: email,
          participant_age: age,
          participant_gender: gender,
          category_code: catCode,
          institution_name: institution,
          department: department,
          tshirt_size: tshirt,
          blood_group: bloodGroup,
          emergency_contact_name: ecName,
          emergency_contact_phone: ecPhone,
        });
      }
    }

    return { validRows, errors };
  }

  /**
   * Bulk register external participants.
   * Uses service role client for server-side operations.
   */
  static async bulkRegister(
    eventId: string,
    rows: BulkRegistrationRow[]
  ): Promise<BulkImportResult> {
    const supabase = createServiceRoleClient();

    const result: BulkImportResult = {
      total: rows.length,
      success: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      registrations: [],
    };

    // Fetch event info for BIB generation
    const { data: event } = await supabase
      .from('events')
      .select('id, name, year, config')
      .eq('id', eventId)
      .single();

    if (!event) {
      throw new Error('Event not found');
    }

    const eventCode =
      (event.config as Record<string, unknown>)?.event_code as string ??
      event.name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
    const eventYear = event.year ?? new Date().getFullYear();

    // Fetch categories map
    const { data: categories } = await supabase
      .from('event_categories')
      .select('id, name, code, fee_amount')
      .eq('event_id', eventId)
      .eq('is_active', true);

    const catMap = new Map<string, CategoryInfo>();
    (categories ?? []).forEach((c: any) => {
      if (c.code) catMap.set(c.code.toUpperCase(), c);
    });

    // Fetch existing phones in this event for duplicate detection
    const { data: existingRegs } = await supabase
      .from('events_registrations')
      .select('participant_phone')
      .eq('event_id', eventId);

    const existingPhones = new Set(
      (existingRegs ?? []).map((r: any) => r.participant_phone?.replace(/\D/g, '')).filter(Boolean)
    );

    // Get current BIB sequence counts per category
    const bibCounts = new Map<string, number>();
    for (const [code] of catMap) {
      const { count } = await supabase
        .from('events_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .ilike('bib_number', `%-${code}-%`);
      bibCounts.set(code, (count ?? 0) + 1);
    }

    // Process rows in batch
    const insertPayloads: any[] = [];
    const rowMap: { rowIndex: number; bib: string; name: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel row number

      // Skip duplicate phone
      const cleanPhone = row.participant_phone.replace(/\D/g, '');
      if (existingPhones.has(cleanPhone)) {
        result.skipped++;
        result.errors.push({
          row: rowNum,
          field: 'Phone',
          message: `Phone ${row.participant_phone} already registered in this event`,
        });
        continue;
      }

      const cat = catMap.get(row.category_code.toUpperCase());
      if (!cat) {
        result.failed++;
        result.errors.push({
          row: rowNum,
          field: 'Category Code',
          message: `Category ${row.category_code} not found`,
        });
        continue;
      }

      // Generate BIB
      const seq = bibCounts.get(row.category_code.toUpperCase()) ?? 1;
      const bibNumber = `${eventCode}-${eventYear}-${row.category_code.toUpperCase()}-${String(seq).padStart(4, '0')}`;
      bibCounts.set(row.category_code.toUpperCase(), seq + 1);

      // Mark phone as used
      existingPhones.add(cleanPhone);

      const customData: Record<string, unknown> = {};
      if (row.tshirt_size) customData.tshirt_size = row.tshirt_size;
      if (row.blood_group) customData.blood_group = row.blood_group;
      if (row.emergency_contact_name) customData.emergency_contact_name = row.emergency_contact_name;
      if (row.emergency_contact_phone) customData.emergency_contact_phone = row.emergency_contact_phone;

      insertPayloads.push({
        event_id: eventId,
        category_id: cat.id,
        participant_type: 'external',
        participant_name: row.participant_name,
        participant_phone: row.participant_phone,
        participant_email: row.participant_email ?? null,
        participant_age: row.participant_age ?? null,
        participant_gender: row.participant_gender ?? null,
        institution_name: row.institution_name ?? null,
        department: row.department ?? null,
        bib_number: bibNumber,
        status: 'registered',
        payment_status: cat.fee_amount > 0 ? 'pending' : 'not_required',
        payment_amount: cat.fee_amount ?? 0,
        custom_data: Object.keys(customData).length > 0 ? customData : {},
        source: 'bulk_upload',
        checked_in: false,
      });

      rowMap.push({ rowIndex: i, bib: bibNumber, name: row.participant_name });
    }

    // Batch insert (Supabase supports bulk insert)
    if (insertPayloads.length > 0) {
      // Insert in chunks of 100 to avoid payload size limits
      const CHUNK_SIZE = 100;
      for (let i = 0; i < insertPayloads.length; i += CHUNK_SIZE) {
        const chunk = insertPayloads.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from('events_registrations')
          .insert(chunk);

        if (error) {
          logger.error('events/marathon-bulk', 'Bulk insert failed', error);
          // Mark all rows in this chunk as failed
          for (let j = i; j < Math.min(i + CHUNK_SIZE, insertPayloads.length); j++) {
            result.failed++;
            result.errors.push({
              row: rowMap[j]?.rowIndex + 2,
              field: 'insert',
              message: error.message,
            });
          }
        } else {
          const chunkCount = chunk.length;
          result.success += chunkCount;
          for (let j = i; j < Math.min(i + CHUNK_SIZE, rowMap.length); j++) {
            result.registrations.push({
              row: rowMap[j].rowIndex + 2,
              bib_number: rowMap[j].bib,
              name: rowMap[j].name,
            });
          }
        }
      }
    }

    logger.info('events/marathon-bulk', 'Bulk import completed', {
      eventId,
      total: result.total,
      success: result.success,
      skipped: result.skipped,
      failed: result.failed,
    });

    return result;
  }
}
