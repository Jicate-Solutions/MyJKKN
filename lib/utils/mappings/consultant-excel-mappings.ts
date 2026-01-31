// Excel Column Mappings for Consultant Import/Export

// Column mapping for mapColumns function: target field -> possible header names
export const CONSULTANT_COLUMN_MAPPING: Record<string, string[]> = {
  'name': ['Name', 'Full Name', 'Consultant Name'],
  'phone': ['Phone', 'Phone Number', 'Mobile', 'Contact Number'],
  'email': ['Email', 'Email Address', 'E-mail'],
  'consultant_type': ['Type', 'Consultant Type', 'Category'],
  'contact_person': ['Contact Person', 'Contact Name'],
  'alternate_phone': ['Alternate Phone', 'Alt Phone', 'Secondary Phone'],
  'address': ['Address', 'Street Address'],
  'city': ['City', 'Town'],
  'state': ['State', 'Province'],
  'pincode': ['Pincode', 'PIN Code', 'Postal Code', 'ZIP'],
  'pan_number': ['PAN Number', 'PAN', 'PAN No'],
  'gst_number': ['GST Number', 'GST', 'GSTIN', 'GST No'],
  'bank_name': ['Bank Name', 'Bank'],
  'bank_account_number': ['Account Number', 'Bank Account', 'A/C Number'],
  'bank_ifsc': ['IFSC Code', 'IFSC', 'Bank IFSC'],
  'bank_account_holder': ['Account Holder', 'Account Holder Name'],
  'website': ['Website', 'Web', 'URL'],
  'country': ['Country'],
  'geographic_coverage': ['Geographic Coverage', 'Coverage Area', 'Regions'],
  'specializations': ['Specializations', 'Specialization', 'Expertise'],
  'programs_handled': ['Programs Handled', 'Programs', 'Courses'],
  'tier': ['Tier', 'Level'],
  'total_leads_referred': ['Total Leads', 'Leads Referred'],
  'total_conversions': ['Total Conversions', 'Conversions'],
  'total_commission_earned': ['Total Commission', 'Commission Earned'],
  'contract_start_date': ['Contract Start', 'Start Date'],
  'contract_end_date': ['Contract End', 'End Date'],
  'status': ['Status'],
  'notes': ['Notes', 'Comments', 'Remarks'],
  'tags': ['Tags', 'Labels']
};

export const CONSULTANT_REQUIRED_FIELDS = ['name', 'phone'];

export const CONSULTANT_EXCEL_COLUMNS = {
  // Required fields
  name: {
    header: 'Name',
    required: true,
    type: 'string' as const,
    description: 'Full name of the consultant or organization'
  },
  phone: {
    header: 'Phone',
    required: true,
    type: 'string' as const,
    description: 'Primary contact number (10 digits)'
  },

  // Optional fields
  email: {
    header: 'Email',
    required: false,
    type: 'string' as const,
    description: 'Email address'
  },
  consultant_type: {
    header: 'Type',
    required: false,
    type: 'string' as const,
    description: 'Consultant type: external, internal, institutional, alumni, student',
    options: ['external', 'internal', 'institutional', 'alumni', 'student']
  },
  contact_person: {
    header: 'Contact Person',
    required: false,
    type: 'string' as const,
    description: 'Name of contact person (for organizations)'
  },
  alternate_phone: {
    header: 'Alternate Phone',
    required: false,
    type: 'string' as const,
    description: 'Secondary contact number'
  },
  address: {
    header: 'Address',
    required: false,
    type: 'string' as const,
    description: 'Street address'
  },
  city: {
    header: 'City',
    required: false,
    type: 'string' as const,
    description: 'City name'
  },
  state: {
    header: 'State',
    required: false,
    type: 'string' as const,
    description: 'State name'
  },
  pincode: {
    header: 'Pincode',
    required: false,
    type: 'string' as const,
    description: '6-digit pincode'
  },
  pan_number: {
    header: 'PAN Number',
    required: false,
    type: 'string' as const,
    description: 'PAN card number'
  },
  gst_number: {
    header: 'GST Number',
    required: false,
    type: 'string' as const,
    description: 'GST registration number'
  },
  bank_name: {
    header: 'Bank Name',
    required: false,
    type: 'string' as const,
    description: 'Bank name for payments'
  },
  bank_account_number: {
    header: 'Account Number',
    required: false,
    type: 'string' as const,
    description: 'Bank account number'
  },
  bank_ifsc: {
    header: 'IFSC Code',
    required: false,
    type: 'string' as const,
    description: 'Bank IFSC code'
  },
  notes: {
    header: 'Notes',
    required: false,
    type: 'string' as const,
    description: 'Additional notes or comments'
  }
};

export const CONSULTANT_TEMPLATE_HEADERS = Object.values(CONSULTANT_EXCEL_COLUMNS).map(col => col.header);

export const CONSULTANT_REQUIRED_HEADERS = Object.entries(CONSULTANT_EXCEL_COLUMNS)
  .filter(([_, col]) => col.required)
  .map(([_, col]) => col.header);

// Map Excel column header to database field
export function mapExcelToConsultant(row: Record<string, any>): Record<string, any> {
  const mapped: Record<string, any> = {};

  Object.entries(CONSULTANT_EXCEL_COLUMNS).forEach(([field, config]) => {
    const value = row[config.header];
    if (value !== undefined && value !== null && value !== '') {
      mapped[field] = value;
    }
  });

  // Set defaults
  if (!mapped.consultant_type) {
    mapped.consultant_type = 'external';
  }
  if (!mapped.status) {
    mapped.status = 'pending_verification';
  }

  return mapped;
}

// Map database consultant to Excel row
export function mapConsultantToExcel(consultant: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = {};

  Object.entries(CONSULTANT_EXCEL_COLUMNS).forEach(([field, config]) => {
    row[config.header] = consultant[field] ?? '';
  });

  return row;
}

// Generate template for download
export function generateConsultantTemplate(): Record<string, any>[] {
  return [
    {
      'Name': 'Example Consultant',
      'Phone': '9876543210',
      'Email': 'example@email.com',
      'Type': 'external',
      'Contact Person': '',
      'Alternate Phone': '',
      'Address': '123 Main Street',
      'City': 'Chennai',
      'State': 'Tamil Nadu',
      'Pincode': '600001',
      'PAN Number': '',
      'GST Number': '',
      'Bank Name': '',
      'Account Number': '',
      'IFSC Code': '',
      'Notes': 'Sample entry - delete this row'
    }
  ];
}

// Template columns for ExcelJS with header, key, and width
export const CONSULTANT_TEMPLATE_COLUMNS = [
  { header: 'Consultant Name', key: 'name', width: 25 },
  { header: 'Phone', key: 'phone', width: 15 },
  { header: 'Type', key: 'consultant_type', width: 15 },
  { header: 'Email', key: 'email', width: 25 },
  { header: 'Contact Person', key: 'contact_person', width: 20 },
  { header: 'Alternate Phone', key: 'alternate_phone', width: 15 },
  { header: 'Website', key: 'website', width: 25 },
  { header: 'Address', key: 'address', width: 30 },
  { header: 'City', key: 'city', width: 15 },
  { header: 'State', key: 'state', width: 15 },
  { header: 'Country', key: 'country', width: 15 },
  { header: 'Pincode', key: 'pincode', width: 10 },
  { header: 'Bank Name', key: 'bank_name', width: 20 },
  { header: 'Account Number', key: 'bank_account_number', width: 20 },
  { header: 'IFSC Code', key: 'bank_ifsc', width: 15 },
  { header: 'Account Holder', key: 'bank_account_holder', width: 20 },
  { header: 'PAN Number', key: 'pan_number', width: 15 },
  { header: 'GST Number', key: 'gst_number', width: 20 },
  { header: 'Geographic Coverage', key: 'geographic_coverage', width: 25 },
  { header: 'Specializations', key: 'specializations', width: 25 },
  { header: 'Programs Handled', key: 'programs_handled', width: 25 },
  { header: 'Tier', key: 'tier', width: 10 },
  { header: 'Total Leads', key: 'total_leads_referred', width: 12 },
  { header: 'Conversions', key: 'total_conversions', width: 12 },
  { header: 'Commission Earned', key: 'total_commission_earned', width: 18 },
  { header: 'Contract Start', key: 'contract_start_date', width: 15 },
  { header: 'Contract End', key: 'contract_end_date', width: 15 },
  { header: 'Status', key: 'status', width: 18 },
  { header: 'Notes', key: 'notes', width: 30 },
  { header: 'Tags', key: 'tags', width: 20 },
];

// Utility functions for data normalization
export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

export function normalizeConsultantType(type: string): string {
  const normalized = type?.toLowerCase().trim();
  const validTypes = ['external', 'internal', 'institutional', 'alumni', 'student'];
  return validTypes.includes(normalized) ? normalized : 'external';
}

export function normalizeStatus(status: string): string {
  const normalized = status?.toLowerCase().trim().replace(/\s+/g, '_');
  const validStatuses = ['active', 'inactive', 'suspended', 'pending_verification', 'contract_expired'];
  return validStatuses.includes(normalized) ? normalized : 'pending_verification';
}

export function normalizeTier(tier: string): string {
  const normalized = tier?.toLowerCase().trim();
  const validTiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  return validTiers.includes(normalized) ? normalized : 'bronze';
}

// Parser utility functions (also exported from validation file)
export function parseArrayField(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

export function parseNumberField(value: any, defaultValue?: number): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? (defaultValue ?? null) : parsed;
  }
  return defaultValue ?? null;
}

export function parseDateField(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}
