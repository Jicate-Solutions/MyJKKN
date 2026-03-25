// lib/utils/mappings/marketing-leads-excel-mappings.ts
// Excel column mappings for marketing leads database bulk import

export const MARKETING_LEADS_COLUMN_MAPPING: Record<string, string> = {
  "DISTRICT'S": 'district',
  'DISTRICTS': 'district',
  'DISTRICT': 'district',
  'SUB DISTRICT': 'sub_district',
  'SUB-DISTRICT': 'sub_district',
  'SUBDISTRICT': 'sub_district',
  "STUDENT'S NAME": 'student_name',
  'STUDENT NAME': 'student_name',
  'STUDENTS NAME': 'student_name',
  'NAME': 'student_name',
  'FATHER NAME': 'father_name',
  "FATHER'S NAME": 'father_name',
  'FATHERNAME': 'father_name',
  'GENDER': 'gender',
  'COMMUNITY': 'community',
  'MOBILE NUMBER': 'mobile_number',
  'MOBILE NO': 'mobile_number',
  'MOBILE': 'mobile_number',
  'PHONE': 'mobile_number',
  'PHONE NUMBER': 'mobile_number',
  'CONTACT': 'mobile_number',
  'GROUP DETAIL': 'group_detail',
  'GROUP': 'group_detail',
  'GROUP DETAILS': 'group_detail',
  'ADDRESS': 'address',
  'PINCODE': 'pincode',
  'PIN CODE': 'pincode',
  'PIN': 'pincode',
  'ZIPCODE': 'pincode',
  'SCHOOL NAME': 'school_name',
  'SCHOOL': 'school_name',
};

export const MARKETING_LEADS_REQUIRED_FIELDS = ['student_name'];

export const MARKETING_LEADS_TEMPLATE_COLUMNS = [
  { header: "DISTRICT'S", key: 'district', width: 20 },
  { header: 'SUB DISTRICT', key: 'sub_district', width: 20 },
  { header: "STUDENT'S NAME*", key: 'student_name', width: 30 },
  { header: 'FATHER NAME', key: 'father_name', width: 25 },
  { header: 'GENDER', key: 'gender', width: 12 },
  { header: 'COMMUNITY', key: 'community', width: 18 },
  { header: 'MOBILE NUMBER', key: 'mobile_number', width: 18 },
  { header: 'GROUP DETAIL', key: 'group_detail', width: 20 },
  { header: 'ADDRESS', key: 'address', width: 35 },
  { header: 'PINCODE', key: 'pincode', width: 12 },
  { header: 'SCHOOL NAME', key: 'school_name', width: 30 },
];

export const GENDER_VALUES = ['Male', 'Female', 'Other'];

/**
 * Normalize gender value to valid enum.
 */
export function normalizeGender(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim().toLowerCase();
  const mapping: Record<string, string> = {
    male: 'Male',
    m: 'Male',
    female: 'Female',
    f: 'Female',
    other: 'Other',
    o: 'Other',
    transgender: 'Other',
  };
  return mapping[str] || null;
}

/**
 * Clean and validate phone number.
 */
export function cleanMobileNumber(value: unknown): string {
  if (!value) return '';
  let cleaned = String(value).replace(/\D/g, '');
  // Remove leading 91 country code if present and number is > 10 digits
  if (cleaned.length > 10 && cleaned.startsWith('91')) {
    cleaned = cleaned.slice(2);
  }
  return cleaned;
}

/**
 * Clean and validate pincode.
 */
export function cleanPincode(value: unknown): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '').slice(0, 6);
}

/**
 * Validate a single lead row and return errors.
 */
export function validateLeadRow(
  mapped: Record<string, string>,
  rowNumber: number
): { rowNumber: number; errors: string[]; isValid: boolean; [key: string]: any } {
  const errors: string[] = [];

  // Required: student_name
  if (!mapped.student_name?.trim()) {
    errors.push('Student Name is required');
  }

  // Mobile number validation (optional but if provided must be valid)
  if (mapped.mobile_number) {
    const cleaned = cleanMobileNumber(mapped.mobile_number);
    if (cleaned && cleaned.length !== 10) {
      errors.push('Mobile number must be 10 digits');
    }
  }

  // Gender validation (optional but if provided must be valid)
  if (mapped.gender) {
    const normalized = normalizeGender(mapped.gender);
    if (!normalized) {
      errors.push(`Invalid gender: "${mapped.gender}" (use Male/Female/Other)`);
    }
  }

  // Pincode validation (optional but if provided must be valid)
  if (mapped.pincode) {
    const cleaned = cleanPincode(mapped.pincode);
    if (cleaned && cleaned.length !== 6) {
      errors.push('Pincode must be 6 digits');
    }
  }

  return { rowNumber, ...mapped, errors, isValid: errors.length === 0 };
}
