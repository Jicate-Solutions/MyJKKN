// Education Consultants Validation Schemas
import { z } from 'zod';

// ============================================
// CONSULTANT VALIDATION
// ============================================

// Helper: transform empty strings to null for optional fields
const emptyToNull = z.string().transform(v => v === '' ? null : v);
const optionalString = emptyToNull.nullable().optional();
const optionalEmail = z.string()
  .transform(v => v === '' ? null : v)
  .pipe(z.string().email('Invalid email address').nullable())
  .optional();

export const createConsultantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: optionalEmail,
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  consultant_type: z.enum(['external', 'internal', 'institutional', 'alumni', 'student']).default('external'),
  alternate_phone: optionalString,
  contact_person: optionalString,

  // Address (maps to address_line1 in DB)
  address: optionalString,
  city: optionalString,
  state: optionalString,
  country: optionalString,
  pincode: optionalString,

  // Business
  website: optionalString,
  gst_number: optionalString,
  pan_number: optionalString,

  // Banking
  bank_name: optionalString,
  bank_account_number: optionalString,
  bank_ifsc: optionalString,
  bank_account_holder: optionalString,

  // Contract
  contract_start_date: optionalString,
  contract_end_date: optionalString,

  // Notes
  notes: optionalString,

  // Arrays
  geographic_coverage: z.array(z.string()).default([]),
  specializations: z.array(z.string()).default([]),
  programs_handled: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([])
});

export const consultantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: optionalEmail,
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  alternate_phone: optionalString,
  consultant_type: z.enum(['external', 'internal', 'institutional', 'alumni', 'student']),
  status: z.enum(['active', 'inactive', 'suspended', 'pending_verification', 'contract_expired']).default('pending_verification'),

  // Contact person
  contact_person: optionalString,

  // Address
  address: optionalString,
  city: optionalString,
  state: optionalString,
  country: optionalString,
  pincode: optionalString,

  // Business
  website: optionalString,
  gst_number: optionalString,
  pan_number: optionalString,

  // Banking
  bank_name: optionalString,
  bank_account_number: optionalString,
  bank_ifsc: optionalString,
  bank_account_holder: optionalString,

  // Coverage
  geographic_coverage: z.array(z.string()).default([]),
  specializations: z.array(z.string()).default([]),
  programs_handled: z.array(z.string()).default([]),

  // Contract
  contract_start_date: optionalString,
  contract_end_date: optionalString,

  // Notes
  notes: optionalString,
  tags: z.array(z.string()).default([])
});

export type ConsultantFormData = z.infer<typeof consultantSchema>;

// ============================================
// COMMISSION STRUCTURE VALIDATION
// ============================================

export const commissionStructureSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  calculation_method: z.enum(['percentage', 'flat', 'tiered', 'milestone']),
  base_rate: z.number().min(0, 'Rate must be positive'),
  max_rate: z.number().optional().nullable(),
  min_amount: z.number().optional().nullable(),
  max_amount: z.number().optional().nullable(),
  tier_rules: z.any().optional().nullable(),
  is_active: z.boolean().default(true)
});

export type CommissionStructureFormData = z.infer<typeof commissionStructureSchema>;

// ============================================
// LEAD ATTRIBUTION VALIDATION
// ============================================

export const leadAttributionSchema = z.object({
  consultant_id: z.string().uuid('Invalid consultant ID'),
  lead_id: z.string().uuid('Invalid lead ID'),
  attribution_type: z.enum(['primary', 'secondary', 'assist']).default('primary'),
  attribution_percentage: z.number().min(0).max(100).default(100),
  notes: z.string().optional().nullable()
});

export type LeadAttributionFormData = z.infer<typeof leadAttributionSchema>;

// ============================================
// REWARD CONFIG VALIDATION
// ============================================

export const rewardConfigSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  reward_type: z.enum(['discount', 'cashback', 'credit', 'voucher', 'merchandise']),
  trigger_type: z.enum(['referral_count', 'conversion_count', 'revenue_milestone', 'tier_upgrade']),
  trigger_value: z.number().min(1),
  reward_value: z.number().min(0),
  is_recurring: z.boolean().default(false),
  is_active: z.boolean().default(true),
  valid_from: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable()
});

export type RewardConfigFormData = z.infer<typeof rewardConfigSchema>;

// Update schema (same as consultant but all fields optional + edit-specific fields)
export const updateConsultantSchema = consultantSchema.extend({
  id: z.string().optional(),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond']).optional(),
  relationship_score: z.number().min(0).max(100).optional(),
}).partial();

// Parser utility functions
export function parseArrayField(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

export function parseNumberField(value: any): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
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

// ============================================
// IMPORT VALIDATION
// ============================================

export const consultantImportRowSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().nullable(),
  consultant_type: z.enum(['external', 'internal', 'institutional', 'alumni', 'student']).optional(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable()
});

export function validateConsultantImport(rows: any[]) {
  const results = {
    valid: [] as any[],
    invalid: [] as { row: number; errors: string[] }[]
  };

  rows.forEach((row, index) => {
    const result = consultantImportRowSchema.safeParse(row);
    if (result.success) {
      results.valid.push(result.data);
    } else {
      results.invalid.push({
        row: index + 1,
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }
  });

  return results;
}
