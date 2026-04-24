import * as XLSX from 'xlsx';

// ── Shared Types ──────────────────────────────────────────────────────────────

export interface BillingCategoryImportError {
  row: number;
  name: string;
  errors: string[];
}

export interface BillingCategoryUploadSummary {
  total: number;
  success: number;
  failed: number;
}

// ── Template Exports ──────────────────────────────────────────────────────────

export function exportParentCategoriesTemplate(
  institutions: { id: string; name: string; counselling_code: string }[]
): void {
  const wb = XLSX.utils.book_new();

  const template = [{ 'Institution Name *': '', 'Parent Category Name *': '', 'Status': 'Active' }];
  const ws = XLSX.utils.json_to_sheet(template);
  ws['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  const refData: Record<string, string>[] = [
    { 'Type': '═══ INSTITUTION NAMES ═══', 'Value': '', 'Notes': '' },
    ...institutions.map(i => ({ 'Type': 'Institution', 'Value': i.name, 'Notes': i.counselling_code || '' })),
    { 'Type': '', 'Value': '', 'Notes': '' },
    { 'Type': '═══ STATUS VALUES ═══', 'Value': '', 'Notes': '' },
    { 'Type': 'Status', 'Value': 'Active', 'Notes': 'Category is active' },
    { 'Type': 'Status', 'Value': 'Inactive', 'Notes': 'Category is inactive' },
  ];
  const wsRef = XLSX.utils.json_to_sheet(refData);
  wsRef['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Codes');

  XLSX.writeFile(wb, `billing_parent_categories_template_${today()}.xlsx`);
}

export function exportSubCategoriesTemplate(
  institutions: { id: string; name: string; counselling_code: string }[],
  parentCategories: { id: string; parent_category_name: string; institution?: { name: string } | null }[]
): void {
  const wb = XLSX.utils.book_new();

  const template = [{
    'Institution Name *': '',
    'Parent Category Name *': '',
    'Sub Category Name *': '',
    'Status': 'Active',
  }];
  const ws = XLSX.utils.json_to_sheet(template);
  ws['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 35 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  const refData: Record<string, string>[] = [
    { 'Type': '═══ INSTITUTION NAMES ═══', 'Value': '', 'Notes': '' },
    ...institutions.map(i => ({ 'Type': 'Institution', 'Value': i.name, 'Notes': i.counselling_code || '' })),
    { 'Type': '', 'Value': '', 'Notes': '' },
    { 'Type': '═══ PARENT CATEGORY NAMES ═══', 'Value': '', 'Notes': 'Institution' },
    ...parentCategories.map(p => ({ 'Type': 'Parent Category', 'Value': p.parent_category_name, 'Notes': p.institution?.name || '' })),
    { 'Type': '', 'Value': '', 'Notes': '' },
    { 'Type': '═══ STATUS VALUES ═══', 'Value': '', 'Notes': '' },
    { 'Type': 'Status', 'Value': 'Active', 'Notes': '' },
    { 'Type': 'Status', 'Value': 'Inactive', 'Notes': '' },
  ];
  const wsRef = XLSX.utils.json_to_sheet(refData);
  wsRef['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Codes');

  XLSX.writeFile(wb, `billing_sub_categories_template_${today()}.xlsx`);
}

export function exportItemCategoriesTemplate(
  institutions: { id: string; name: string; counselling_code: string }[],
  parentCategories: { id: string; parent_category_name: string; institution?: { name: string } | null }[],
  subCategories: {
    id: string;
    sub_category_name: string;
    parent_category?: { parent_category_name: string } | null;
    institution?: { name: string } | null;
  }[]
): void {
  const wb = XLSX.utils.book_new();

  const template = [{
    'Institution Name *': '',
    'Parent Category Name *': '',
    'Sub Category Name *': '',
    'Item Category Name *': '',
    'Amount': '',
    'Frequency *': 'one-time',
    'Status': 'Active',
  }];
  const ws = XLSX.utils.json_to_sheet(template);
  ws['!cols'] = [{ wch: 30 }, { wch: 28 }, { wch: 28 }, { wch: 35 }, { wch: 12 }, { wch: 15 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  const refData: Record<string, string>[] = [
    { 'Type': '═══ INSTITUTION NAMES ═══', 'Value': '', 'Notes': '' },
    ...institutions.map(i => ({ 'Type': 'Institution', 'Value': i.name, 'Notes': i.counselling_code || '' })),
    { 'Type': '', 'Value': '', 'Notes': '' },
    { 'Type': '═══ PARENT CATEGORIES ═══', 'Value': '', 'Notes': 'Institution' },
    ...parentCategories.map(p => ({ 'Type': 'Parent Category', 'Value': p.parent_category_name, 'Notes': p.institution?.name || '' })),
    { 'Type': '', 'Value': '', 'Notes': '' },
    { 'Type': '═══ SUB CATEGORIES ═══', 'Value': '', 'Notes': 'Parent Category' },
    ...subCategories.map(s => ({ 'Type': 'Sub Category', 'Value': s.sub_category_name, 'Notes': s.parent_category?.parent_category_name || '' })),
    { 'Type': '', 'Value': '', 'Notes': '' },
    { 'Type': '═══ FREQUENCY VALUES ═══', 'Value': '', 'Notes': '' },
    { 'Type': 'Frequency', 'Value': 'monthly', 'Notes': 'Billed every month' },
    { 'Type': 'Frequency', 'Value': 'quarterly', 'Notes': 'Billed every 3 months' },
    { 'Type': 'Frequency', 'Value': 'yearly', 'Notes': 'Billed once a year' },
    { 'Type': 'Frequency', 'Value': 'one-time', 'Notes': 'Single charge' },
    { 'Type': '', 'Value': '', 'Notes': '' },
    { 'Type': '═══ STATUS VALUES ═══', 'Value': '', 'Notes': '' },
    { 'Type': 'Status', 'Value': 'Active', 'Notes': '' },
    { 'Type': 'Status', 'Value': 'Inactive', 'Notes': '' },
  ];
  const wsRef = XLSX.utils.json_to_sheet(refData);
  wsRef['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Codes');

  XLSX.writeFile(wb, `billing_item_categories_template_${today()}.xlsx`);
}

// ── Parsed Row Types ──────────────────────────────────────────────────────────

export interface ParsedParentCategoryRow {
  institution_name: string;
  parent_category_name: string;
  is_active: boolean;
}

export interface ParsedSubCategoryRow {
  institution_name: string;
  parent_category_name: string;
  sub_category_name: string;
  is_active: boolean;
}

export interface ParsedItemCategoryRow {
  institution_name: string;
  parent_category_name: string;
  sub_category_name: string;
  item_category_name: string;
  amount: number | null;
  frequency: string;
  is_active: boolean;
}

// ── Row Mappers ───────────────────────────────────────────────────────────────

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseStatus(row: Record<string, unknown>): boolean {
  const val = str(row, 'Status', 'status', 'is_active').toLowerCase();
  return val === '' || val === 'active' || val === 'true';
}

export function mapParentCategoryRow(row: Record<string, unknown>): ParsedParentCategoryRow {
  return {
    institution_name: str(row, 'Institution Name *', 'Institution Name', 'institution_name'),
    parent_category_name: str(row, 'Parent Category Name *', 'Parent Category Name', 'parent_category_name'),
    is_active: parseStatus(row),
  };
}

export function mapSubCategoryRow(row: Record<string, unknown>): ParsedSubCategoryRow {
  return {
    institution_name: str(row, 'Institution Name *', 'Institution Name', 'institution_name'),
    parent_category_name: str(row, 'Parent Category Name *', 'Parent Category Name', 'parent_category_name'),
    sub_category_name: str(row, 'Sub Category Name *', 'Sub Category Name', 'sub_category_name'),
    is_active: parseStatus(row),
  };
}

const VALID_FREQUENCIES = ['monthly', 'quarterly', 'yearly', 'one-time'] as const;

export function mapItemCategoryRow(row: Record<string, unknown>): ParsedItemCategoryRow {
  const amountRaw = str(row, 'Amount', 'amount');
  const parsed = amountRaw !== '' ? parseFloat(amountRaw) : null;
  return {
    institution_name: str(row, 'Institution Name *', 'Institution Name', 'institution_name'),
    parent_category_name: str(row, 'Parent Category Name *', 'Parent Category Name', 'parent_category_name'),
    sub_category_name: str(row, 'Sub Category Name *', 'Sub Category Name', 'sub_category_name'),
    item_category_name: str(row, 'Item Category Name *', 'Item Category Name', 'item_category_name'),
    amount: parsed !== null && isNaN(parsed) ? null : parsed,
    frequency: str(row, 'Frequency *', 'Frequency', 'frequency').toLowerCase() || 'one-time',
    is_active: parseStatus(row),
  };
}

// ── Validators ────────────────────────────────────────────────────────────────

const NAME_PATTERN = /^[a-zA-Z0-9\s\-]+$/;

export function validateParentCategoryRow(row: ParsedParentCategoryRow): string[] {
  const errors: string[] = [];
  if (!row.institution_name) errors.push('Institution Name is required');
  if (!row.parent_category_name) errors.push('Parent Category Name is required');
  else if (row.parent_category_name.length > 100) errors.push('Parent Category Name must be 100 characters or less');
  else if (!NAME_PATTERN.test(row.parent_category_name)) errors.push('Only letters, numbers, spaces, and hyphens allowed in Parent Category Name');
  return errors;
}

export function validateSubCategoryRow(row: ParsedSubCategoryRow): string[] {
  const errors: string[] = [];
  if (!row.institution_name) errors.push('Institution Name is required');
  if (!row.parent_category_name) errors.push('Parent Category Name is required');
  if (!row.sub_category_name) errors.push('Sub Category Name is required');
  else if (row.sub_category_name.length > 100) errors.push('Sub Category Name must be 100 characters or less');
  else if (!NAME_PATTERN.test(row.sub_category_name)) errors.push('Only letters, numbers, spaces, and hyphens allowed in Sub Category Name');
  return errors;
}

export function validateItemCategoryRow(row: ParsedItemCategoryRow): string[] {
  const errors: string[] = [];
  if (!row.institution_name) errors.push('Institution Name is required');
  if (!row.parent_category_name) errors.push('Parent Category Name is required');
  if (!row.sub_category_name) errors.push('Sub Category Name is required');
  if (!row.item_category_name) errors.push('Item Category Name is required');
  else if (row.item_category_name.length > 150) errors.push('Item Category Name must be 150 characters or less');
  if (row.amount !== null && (isNaN(row.amount as number) || (row.amount as number) < 0)) errors.push('Amount must be a positive number');
  if (!row.frequency) errors.push('Frequency is required');
  else if (!VALID_FREQUENCIES.includes(row.frequency as typeof VALID_FREQUENCIES[number])) errors.push(`Frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`);
  return errors;
}

// ── File Parser ───────────────────────────────────────────────────────────────

export async function parseBulkUploadFile<T>(
  file: File,
  mapper: (row: Record<string, unknown>) => T
): Promise<T[]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(data), { type: 'array' });
  const mainSheet = wb.SheetNames.find(
    (n) => !['reference', 'instruction', '_valid'].some((skip) => n.toLowerCase().includes(skip))
  ) ?? wb.SheetNames[0];
  const ws = wb.Sheets[mainSheet];
  const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
  return json.map(mapper);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0];
}
