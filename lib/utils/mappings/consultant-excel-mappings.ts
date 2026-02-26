// lib/utils/mappings/consultant-excel-mappings.ts
// Excel column mappings for consultant bulk import/export

export const CONSULTANT_COLUMN_MAPPING: Record<string, string> = {
  'Consultant Name': 'name',
  'Phone': 'phone',
  'Type': 'consultant_type',
  'Email': 'email',
  'Contact Person': 'contact_person',
  'Alternate Phone': 'alternate_phone',
  'Website': 'website',
  'Address': 'address_line1',
  'City': 'city',
  'State': 'state',
  'Country': 'country',
  'Pincode': 'pincode',
  'Bank Name': 'bank_name',
  'Account Number': 'bank_account_number',
  'IFSC Code': 'bank_ifsc_code',
  'Account Holder': 'bank_account_holder',
  'PAN Number': 'pan_number',
  'GST Number': 'gst_number',
  'Geographic Coverage': 'geographic_coverage',
  'Specializations': 'specializations',
  'Programs Handled': 'programs_handled',
  'Tier': 'tier',
  'Total Leads': 'total_leads_referred',
  'Conversions': 'successful_conversions',
  'Commission Earned': 'total_commission_earned',
  'Contract Start': 'contract_start_date',
  'Contract End': 'contract_end_date',
  'Status': 'status',
  'Notes': 'notes',
  'Tags': 'tags',
};

export const CONSULTANT_REQUIRED_FIELDS = ['name', 'phone', 'consultant_type'];

export const CONSULTANT_TEMPLATE_COLUMNS = [
  { header: 'Consultant Name*', key: 'name', width: 30 },
  { header: 'Phone*', key: 'phone', width: 15 },
  { header: 'Type*', key: 'consultant_type', width: 15 },
  { header: 'Email', key: 'email', width: 25 },
  { header: 'Contact Person', key: 'contact_person', width: 20 },
  { header: 'Alternate Phone', key: 'alternate_phone', width: 15 },
  { header: 'Website', key: 'website', width: 25 },
  { header: 'Address', key: 'address_line1', width: 30 },
  { header: 'City', key: 'city', width: 15 },
  { header: 'State', key: 'state', width: 15 },
  { header: 'Country', key: 'country', width: 15 },
  { header: 'Pincode', key: 'pincode', width: 10 },
  { header: 'Bank Name', key: 'bank_name', width: 20 },
  { header: 'Account Number', key: 'bank_account_number', width: 20 },
  { header: 'IFSC Code', key: 'bank_ifsc_code', width: 15 },
  { header: 'Account Holder', key: 'bank_account_holder', width: 20 },
  { header: 'PAN Number', key: 'pan_number', width: 15 },
  { header: 'GST Number', key: 'gst_number', width: 18 },
  { header: 'Geographic Coverage', key: 'geographic_coverage', width: 30 },
  { header: 'Specializations', key: 'specializations', width: 30 },
  { header: 'Programs Handled', key: 'programs_handled', width: 30 },
  { header: 'Tier', key: 'tier', width: 12 },
  { header: 'Total Leads', key: 'total_leads_referred', width: 12 },
  { header: 'Conversions', key: 'successful_conversions', width: 12 },
  { header: 'Commission Earned', key: 'total_commission_earned', width: 18 },
  { header: 'Contract Start', key: 'contract_start_date', width: 15 },
  { header: 'Contract End', key: 'contract_end_date', width: 15 },
  { header: 'Status', key: 'status', width: 18 },
  { header: 'Notes', key: 'notes', width: 30 },
  { header: 'Tags', key: 'tags', width: 25 },
];

/**
 * Parse a comma-separated string into an array of trimmed strings.
 */
export function parseArrayField(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse a numeric field, returning the default value for invalid values.
 */
export function parseNumberField(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined || value === '') return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Normalize consultant type to valid enum value.
 */
export function normalizeConsultantType(value: unknown): string {
  const str = String(value || '').toLowerCase().trim();
  const mapping: Record<string, string> = {
    external: 'external',
    internal: 'internal',
    institutional: 'institutional',
    alumni: 'alumni',
    student: 'student',
    agent: 'external',
    partner: 'external',
  };
  return mapping[str] || 'external';
}

/**
 * Normalize status to valid enum value.
 */
export function normalizeStatus(value: unknown): string {
  const str = String(value || '').toLowerCase().trim().replace(/\s+/g, '_');
  const valid = ['active', 'inactive', 'suspended', 'pending_verification', 'contract_expired'];
  return valid.includes(str) ? str : 'active';
}

/**
 * Normalize tier to valid enum value.
 */
export function normalizeTier(value: unknown): string {
  const str = String(value || '').toLowerCase().trim();
  const valid = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  return valid.includes(str) ? str : 'bronze';
}

/**
 * Clean phone number - strip non-digit characters.
 */
export function cleanPhoneNumber(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Parse date field to ISO string or null.
 */
export function parseDateField(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;

  // Try ISO format first
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) return isoDate.toISOString().split('T')[0];

  // Try DD/MM/YYYY format
  const parts = str.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }

  return null;
}
