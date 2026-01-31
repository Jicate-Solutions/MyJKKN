// Education Consultants Validation Schemas
import { z } from 'zod';

// ============================================
// CONSULTANT VALIDATION
// ============================================

// Alias for backward compatibility
export const createConsultantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  consultant_type: z.enum(['external', 'internal', 'institutional', 'alumni', 'student']).default('external'),
  contact_person: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  pincode: z.string().optional().nullable()
});

export const consultantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  alternate_phone: z.string().optional().nullable(),
  consultant_type: z.enum(['external', 'internal', 'institutional', 'alumni', 'student']),
  status: z.enum(['active', 'inactive', 'suspended', 'pending_verification', 'contract_expired']).default('pending_verification'),

  // Contact person
  contact_person: z.string().optional().nullable(),

  // Address
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().default('India').optional().nullable(),
  pincode: z.string().optional().nullable(),

  // Banking
  bank_name: z.string().optional().nullable(),
  bank_account_number: z.string().optional().nullable(),
  bank_ifsc: z.string().optional().nullable(),
  bank_account_holder: z.string().optional().nullable(),
  pan_number: z.string().optional().nullable(),
  gst_number: z.string().optional().nullable(),

  // Coverage
  geographic_coverage: z.array(z.string()).default([]),
  specializations: z.array(z.string()).default([]),
  programs_handled: z.array(z.string()).default([]),

  // Contract
  contract_start_date: z.string().optional().nullable(),
  contract_end_date: z.string().optional().nullable(),

  // Notes
  notes: z.string().optional().nullable(),
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

// Update schema (same as create but all fields optional)
export const updateConsultantSchema = consultantSchema.partial();

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
