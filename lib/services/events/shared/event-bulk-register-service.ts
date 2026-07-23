// lib/services/events/shared/event-bulk-register-service.ts
// Shared bulk roster/CSV import service for ANY event type (Events Platform Promotion PR7).
//
// Generalizes the marathon bulk-registration flow into an event-agnostic engine that imports a
// roster (parsed CSV / Excel rows) into events_registrations for any event by eventId. The generic
// spine is: validate rows → dedupe by phone (within file + against existing regs) → assign a
// participant code → batch-insert into events_registrations.
//
// Marathon keeps its exact BIB-number scheme by injecting a custom `codeGenerator` (see
// marathon-bulk-registration-service.ts, which now delegates here). Events that don't supply a
// generator get a neutral sequential registration number (REG-0001, REG-0002, …) written to the
// already-existing events_registrations.registration_number column — so NO migration is required.

import ExcelJS from 'exceljs';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

const MOD = 'events/bulk-register';

// ============================================================================
// Types
// ============================================================================

export interface BulkRegisterRow {
  participant_name: string;
  participant_phone: string;
  participant_email?: string;
  participant_age?: number;
  participant_gender?: string;
  institution_name?: string;
  department?: string;
  /** Optional — maps to event_categories.code. Events without categories leave this blank. */
  category_code?: string;
  // Common optional extras stored in custom_data
  tshirt_size?: string;
  blood_group?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  // Payment fields
  payment_status?: string; // paid / pending / not_required / waived
  payment_amount?: number;
  payment_method?: string; // cash / upi / bank_transfer / card / online
  payment_reference?: string;
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
  /** bib_number holds whatever participant code was assigned (BIB for marathon, REG-#### otherwise). */
  registrations: { row: number; bib_number: string; name: string }[];
}

export interface EventCategoryInfo {
  id: string;
  name: string;
  code: string | null;
  fee_amount: number;
  max_participants?: number | null;
}

/**
 * Per-event code generation. The engine calls `next(row, category)` once per accepted row, in order.
 * Implementations are responsible for their own sequencing (the engine does not share state across calls
 * other than passing the running per-event registration count via `index`).
 */
export interface CodeGenerator {
  /**
   * @param ctx.row          the validated row being inserted
   * @param ctx.category     the resolved category (may be null for category-less events)
   * @param ctx.index        0-based index among the rows accepted in THIS import batch
   * @param ctx.existingCount number of registrations that already existed for this event before the batch
   */
  next(ctx: {
    row: BulkRegisterRow;
    category: EventCategoryInfo | null;
    index: number;
    existingCount: number;
  }): string;
}

export interface BulkRegisterOptions {
  /** Custom participant-code generator (marathon injects its BIB scheme). Defaults to REG-#### codes. */
  codeGenerator?: CodeGenerator;
  /** Whether a category_code is required on every row. Marathon sets true; category-less events false. */
  requireCategory?: boolean;
}

const VALID_PAYMENT_STATUSES = ['paid', 'pending', 'not_required', 'waived'];
const VALID_PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'card', 'online'];
const VALID_GENDERS = ['male', 'female', 'other'];

// ============================================================================
// Field extraction (tolerant of header label OR machine key)
// ============================================================================

function pick(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (v !== undefined && v !== null && v !== '') return String(v).trim();
  }
  return '';
}

// ============================================================================
// Default (neutral) code generator — sequential REG-#### registration numbers
// ============================================================================

const defaultCodeGenerator: CodeGenerator = {
  next: ({ index, existingCount }) =>
    `REG-${String(existingCount + index + 1).padStart(4, '0')}`,
};

// ============================================================================
// Template column definitions (shared)
// ============================================================================

const TEMPLATE_COLUMNS = [
  { header: 'Name *', key: 'participant_name', width: 25 },
  { header: 'Phone *', key: 'participant_phone', width: 18 },
  { header: 'Email', key: 'participant_email', width: 25 },
  { header: 'Age', key: 'participant_age', width: 8 },
  { header: 'Gender', key: 'participant_gender', width: 10 },
  { header: 'Category Code', key: 'category_code', width: 16 },
  { header: 'Institution / Organization', key: 'institution_name', width: 30 },
  { header: 'Department', key: 'department', width: 20 },
  { header: 'T-Shirt Size', key: 'tshirt_size', width: 14 },
  { header: 'Blood Group', key: 'blood_group', width: 14 },
  { header: 'Emergency Contact Name', key: 'emergency_contact_name', width: 25 },
  { header: 'Emergency Contact Phone', key: 'emergency_contact_phone', width: 22 },
  { header: 'Payment Status', key: 'payment_status', width: 16 },
  { header: 'Amount Paid', key: 'payment_amount', width: 14 },
  { header: 'Payment Method', key: 'payment_method', width: 16 },
  { header: 'Payment Reference', key: 'payment_reference', width: 22 },
];

// ============================================================================
// Service
// ============================================================================

export class EventBulkRegisterService {
  /**
   * Fetch the active categories (with codes) for an event. Helper for callers that need the valid
   * category-code list for client-side validation or template generation.
   */
  static async getCategoryInfo(eventId: string): Promise<EventCategoryInfo[]> {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('event_categories')
      .select('id, name, code, fee_amount')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('sort_order');
    return (data ?? []) as EventCategoryInfo[];
  }

  /**
   * Generate an Excel import template with headers, sample data, and an instructions sheet.
   * Works for any event — category dropdown is omitted when the event has no categories.
   */
  static async generateTemplate(eventId: string, eventName: string): Promise<Buffer> {
    const cats = await this.getCategoryInfo(eventId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MyJKKN';
    workbook.created = new Date();

    // ── Sheet 1: Registrations ──────────────────────────────────────
    const sheet = workbook.addWorksheet('Registrations');
    sheet.columns = TEMPLATE_COLUMNS;

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    // Sample rows
    sheet.addRow({
      participant_name: 'Ravi Kumar',
      participant_phone: '9876543210',
      participant_email: 'ravi@example.com',
      participant_age: 22,
      participant_gender: 'male',
      category_code: cats[0]?.code ?? '',
      institution_name: 'ABC College',
      department: 'Computer Science',
      tshirt_size: 'L',
      blood_group: 'B+',
      emergency_contact_name: 'Priya Kumar',
      emergency_contact_phone: '9876543211',
      payment_status: 'paid',
      payment_amount: cats[0]?.fee_amount ?? 0,
      payment_method: 'upi',
      payment_reference: 'TXN123456',
    });
    sheet.addRow({
      participant_name: 'Meena S',
      participant_phone: '8765432100',
      participant_email: 'meena@example.com',
      participant_age: 20,
      participant_gender: 'female',
      category_code: cats[1]?.code ?? cats[0]?.code ?? '',
      institution_name: 'XYZ University',
      department: 'Physics',
      tshirt_size: 'M',
      blood_group: 'O+',
      emergency_contact_name: 'Suresh S',
      emergency_contact_phone: '8765432101',
      payment_status: '',
      payment_amount: '',
      payment_method: '',
      payment_reference: '',
    });

    [2, 3].forEach((r) => {
      sheet.getRow(r).font = { italic: true, color: { argb: 'FF9CA3AF' } };
    });

    // Category-code dropdown (only if the event has codes)
    const codeList = cats.map((c) => c.code).filter(Boolean) as string[];
    if (codeList.length > 0) {
      sheet.dataValidations.add('F2:F10000', {
        type: 'list',
        allowBlank: true,
        formulae: [`"${codeList.join(',')}"`],
        showErrorMessage: true,
        errorTitle: 'Invalid Category',
        error: `Must be one of: ${codeList.join(', ')}`,
      });
    }

    sheet.dataValidations.add('E2:E10000', {
      type: 'list',
      allowBlank: true,
      formulae: ['"male,female,other"'],
    });
    sheet.dataValidations.add('I2:I10000', {
      type: 'list',
      allowBlank: true,
      formulae: ['"XS,S,M,L,XL,XXL"'],
    });
    sheet.dataValidations.add('M2:M10000', {
      type: 'list',
      allowBlank: true,
      formulae: ['"paid,pending,not_required,waived"'],
    });
    sheet.dataValidations.add('O2:O10000', {
      type: 'list',
      allowBlank: true,
      formulae: ['"cash,upi,bank_transfer,card,online"'],
    });

    // ── Sheet 2: Instructions ───────────────────────────────────────
    const legend = workbook.addWorksheet('Instructions');
    legend.columns = [
      { header: 'Field', key: 'field', width: 30 },
      { header: 'Required', key: 'required', width: 12 },
      { header: 'Description', key: 'description', width: 50 },
    ];
    const legendHeader = legend.getRow(1);
    legendHeader.font = { bold: true };
    legendHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

    const categoryRequired = codeList.length > 0;
    const fields = [
      { field: 'Name', required: 'Yes', description: 'Full name of the participant (min 2 characters)' },
      { field: 'Phone', required: 'Yes', description: 'Phone number (10-15 digits). Used for duplicate detection.' },
      { field: 'Email', required: 'No', description: 'Email address' },
      { field: 'Age', required: 'No', description: 'Age in years (1-150)' },
      { field: 'Gender', required: 'No', description: 'male / female / other' },
      {
        field: 'Category Code',
        required: categoryRequired ? 'Yes' : 'No',
        description: categoryRequired
          ? `Category code from: ${cats.map((c) => `${c.code} (${c.name})`).join(', ')}`
          : 'Leave blank — this event has no categories.',
      },
      { field: 'Institution / Organization', required: 'No', description: 'College, school, or company name' },
      { field: 'Department', required: 'No', description: 'Department or branch' },
      { field: 'T-Shirt Size', required: 'No', description: 'XS / S / M / L / XL / XXL' },
      { field: 'Blood Group', required: 'No', description: 'e.g., A+, B-, O+, AB+' },
      { field: 'Emergency Contact Name', required: 'No', description: 'Name of emergency contact person' },
      { field: 'Emergency Contact Phone', required: 'No', description: 'Phone of emergency contact person' },
      { field: 'Payment Status', required: 'No', description: 'paid / pending / not_required / waived' },
      { field: 'Amount Paid', required: 'No', description: 'Amount paid (number). Blank uses category fee.' },
      { field: 'Payment Method', required: 'No', description: 'cash / upi / bank_transfer / card / online' },
      { field: 'Payment Reference', required: 'No', description: 'Transaction ID, receipt number, or reference' },
    ];
    fields.forEach((f) => legend.addRow(f));

    if (cats.length > 0) {
      legend.addRow({});
      legend.addRow({ field: '── Available Categories ──', required: '', description: '' });
      cats.forEach((c) => {
        legend.addRow({
          field: c.code ?? '-',
          required: c.name,
          description: c.fee_amount > 0 ? `Fee: ₹${c.fee_amount}` : 'Free',
        });
      });
    }

    legend.addRow({});
    legend.addRow({ field: '── Event Info ──', required: '', description: '' });
    legend.addRow({ field: 'Event', required: '', description: eventName });
    legend.addRow({ field: 'Import Type', required: '', description: 'External participants' });
    legend.addRow({ field: 'Note', required: '', description: 'Delete the 2 sample rows before importing' });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Validate parsed roster rows. `validCategoryCodes` is the set of acceptable codes (UPPER-cased);
   * pass an empty array for category-less events. `requireCategory` enforces a code on every row.
   */
  static validateRows(
    rows: Record<string, unknown>[],
    validCategoryCodes: string[],
    options: { requireCategory?: boolean } = {}
  ): { validRows: BulkRegisterRow[]; errors: RowValidationError[] } {
    const requireCategory = options.requireCategory ?? validCategoryCodes.length > 0;
    const errors: RowValidationError[] = [];
    const validRows: BulkRegisterRow[] = [];
    const seenPhones = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // header + 1-indexed
      const raw = rows[i];
      let hasError = false;

      const name = pick(raw, 'participant_name', 'Name *', 'Name');
      const phone = pick(raw, 'participant_phone', 'Phone *', 'Phone').replace(/\D/g, '');
      const email = pick(raw, 'participant_email', 'Email') || undefined;
      const ageRaw = pick(raw, 'participant_age', 'Age');
      const age = ageRaw ? Number(ageRaw) : undefined;
      const gender = pick(raw, 'participant_gender', 'Gender').toLowerCase() || undefined;
      const catCode =
        pick(raw, 'category_code', 'Category Code *', 'Category Code').toUpperCase() || undefined;
      const institution = pick(raw, 'institution_name', 'Institution / Organization') || undefined;
      const department = pick(raw, 'department', 'Department') || undefined;
      const tshirt = pick(raw, 'tshirt_size', 'T-Shirt Size').toUpperCase() || undefined;
      const bloodGroup = pick(raw, 'blood_group', 'Blood Group') || undefined;
      const ecName = pick(raw, 'emergency_contact_name', 'Emergency Contact Name') || undefined;
      const ecPhone = pick(raw, 'emergency_contact_phone', 'Emergency Contact Phone') || undefined;

      const paymentStatus = pick(raw, 'payment_status', 'Payment Status').toLowerCase() || undefined;
      const paymentAmountRaw = pick(raw, 'payment_amount', 'Amount Paid');
      const paymentAmount = paymentAmountRaw ? Number(paymentAmountRaw) : undefined;
      const paymentMethod = pick(raw, 'payment_method', 'Payment Method').toLowerCase() || undefined;
      const paymentReference = pick(raw, 'payment_reference', 'Payment Reference') || undefined;

      // Required
      if (!name || name.length < 2) {
        errors.push({ row: rowNum, field: 'Name', message: 'Name is required (min 2 characters)' });
        hasError = true;
      }
      if (!phone || phone.length < 10 || phone.length > 15) {
        errors.push({ row: rowNum, field: 'Phone', message: 'Valid phone number required (10-15 digits)' });
        hasError = true;
      }

      // Category
      if (requireCategory && !catCode) {
        errors.push({ row: rowNum, field: 'Category Code', message: 'Category code is required' });
        hasError = true;
      } else if (catCode && validCategoryCodes.length > 0 && !validCategoryCodes.includes(catCode)) {
        errors.push({
          row: rowNum,
          field: 'Category Code',
          message: `Invalid category "${catCode}". Valid: ${validCategoryCodes.join(', ')}`,
        });
        hasError = true;
      }

      // Optional
      if (age !== undefined && (isNaN(age) || age < 1 || age > 150)) {
        errors.push({ row: rowNum, field: 'Age', message: 'Age must be 1-150' });
        hasError = true;
      }
      if (gender && !VALID_GENDERS.includes(gender)) {
        errors.push({ row: rowNum, field: 'Gender', message: 'Gender must be male/female/other' });
        hasError = true;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, field: 'Email', message: 'Invalid email format' });
        hasError = true;
      }
      if (paymentStatus && !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
        errors.push({
          row: rowNum,
          field: 'Payment Status',
          message: `Must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}`,
        });
        hasError = true;
      }
      if (paymentAmount !== undefined && (isNaN(paymentAmount) || paymentAmount < 0)) {
        errors.push({ row: rowNum, field: 'Amount Paid', message: 'Amount must be a positive number' });
        hasError = true;
      }
      if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
        errors.push({
          row: rowNum,
          field: 'Payment Method',
          message: `Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
        });
        hasError = true;
      }

      // Duplicate phone within file
      if (phone && seenPhones.has(phone)) {
        errors.push({ row: rowNum, field: 'Phone', message: 'Duplicate phone in file (same as earlier row)' });
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
          department,
          tshirt_size: tshirt,
          blood_group: bloodGroup,
          emergency_contact_name: ecName,
          emergency_contact_phone: ecPhone,
          payment_status: paymentStatus,
          payment_amount: paymentAmount,
          payment_method: paymentMethod,
          payment_reference: paymentReference,
        });
      }
    }

    return { validRows, errors };
  }

  /**
   * Bulk-insert validated rows into events_registrations for any event.
   * Dedupes by phone against existing registrations; assigns a participant code via the (optional)
   * codeGenerator; writes optional extras to custom_data. Uses the service-role client.
   */
  static async bulkRegister(
    eventId: string,
    rows: BulkRegisterRow[],
    options: BulkRegisterOptions = {}
  ): Promise<BulkImportResult> {
    const supabase = createServiceRoleClient();
    const codeGenerator = options.codeGenerator ?? defaultCodeGenerator;

    const result: BulkImportResult = {
      total: rows.length,
      success: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      registrations: [],
    };

    const { data: event } = await supabase
      .from('events')
      .select('id, name')
      .eq('id', eventId)
      .single();
    if (!event) throw new Error('Event not found');

    // Category map (optional)
    const { data: categories } = await supabase
      .from('event_categories')
      .select('id, name, code, fee_amount')
      .eq('event_id', eventId)
      .eq('is_active', true);
    const catMap = new Map<string, EventCategoryInfo>();
    (categories ?? []).forEach((c: any) => {
      if (c.code) catMap.set(String(c.code).toUpperCase(), c);
    });

    // Existing phones for dedupe
    const { data: existingRegs } = await supabase
      .from('events_registrations')
      .select('participant_phone')
      .eq('event_id', eventId);
    const existingPhones = new Set(
      (existingRegs ?? [])
        .map((r: any) => r.participant_phone?.replace(/\D/g, ''))
        .filter(Boolean)
    );

    // Running registration count for the default code generator
    const { count: priorCount } = await supabase
      .from('events_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);
    const existingCount = priorCount ?? 0;

    const insertPayloads: any[] = [];
    const rowMap: { rowIndex: number; code: string; name: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

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

      let category: EventCategoryInfo | null = null;
      if (row.category_code) {
        category = catMap.get(row.category_code.toUpperCase()) ?? null;
        if (!category && catMap.size > 0) {
          // Category was supplied and the event HAS categories, but it didn't resolve → fail row.
          result.failed++;
          result.errors.push({
            row: rowNum,
            field: 'Category Code',
            message: `Category ${row.category_code} not found`,
          });
          continue;
        }
      }

      const acceptedIndex = rowMap.length;
      const code = codeGenerator.next({ row, category, index: acceptedIndex, existingCount });

      existingPhones.add(cleanPhone);

      const customData: Record<string, unknown> = {};
      if (row.tshirt_size) customData.tshirt_size = row.tshirt_size;
      if (row.blood_group) customData.blood_group = row.blood_group;
      if (row.emergency_contact_name) customData.emergency_contact_name = row.emergency_contact_name;
      if (row.emergency_contact_phone) customData.emergency_contact_phone = row.emergency_contact_phone;

      const feeAmount = category?.fee_amount ?? 0;
      const payStatus = row.payment_status ?? (feeAmount > 0 ? 'pending' : 'not_required');

      insertPayloads.push({
        event_id: eventId,
        category_id: category?.id ?? null,
        participant_type: 'external',
        participant_name: row.participant_name,
        participant_phone: row.participant_phone,
        participant_email: row.participant_email ?? null,
        participant_age: row.participant_age ?? null,
        participant_gender: row.participant_gender ?? null,
        institution_name: row.institution_name ?? null,
        department: row.department ?? null,
        bib_number: code,
        registration_number: code,
        status: 'registered',
        payment_status: payStatus,
        payment_amount: row.payment_amount ?? feeAmount,
        payment_method: row.payment_method ?? null,
        payment_reference: row.payment_reference ?? null,
        custom_data: customData,
        source: 'bulk_upload',
        checked_in: false,
      });
      rowMap.push({ rowIndex: i, code, name: row.participant_name });
    }

    if (insertPayloads.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < insertPayloads.length; i += CHUNK_SIZE) {
        const chunk = insertPayloads.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('events_registrations').insert(chunk);
        if (error) {
          logger.error(MOD, 'Bulk insert failed', error);
          for (let j = i; j < Math.min(i + CHUNK_SIZE, insertPayloads.length); j++) {
            result.failed++;
            result.errors.push({ row: rowMap[j]?.rowIndex + 2, field: 'insert', message: error.message });
          }
        } else {
          result.success += chunk.length;
          for (let j = i; j < Math.min(i + CHUNK_SIZE, rowMap.length); j++) {
            result.registrations.push({
              row: rowMap[j].rowIndex + 2,
              bib_number: rowMap[j].code,
              name: rowMap[j].name,
            });
          }
        }
      }
    }

    logger.info(MOD, 'Bulk import completed', {
      eventId,
      total: result.total,
      success: result.success,
      skipped: result.skipped,
      failed: result.failed,
    });

    return result;
  }
}
