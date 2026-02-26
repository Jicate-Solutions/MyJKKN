// lib/validations/education-consultants.ts
// Zod schemas for Education Consultant form validation

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// SHARED ENUMS
// ═══════════════════════════════════════════════════════════════════════════

const consultantTypeEnum = z.enum(['external', 'internal', 'institutional', 'alumni', 'student']);
const consultantStatusEnum = z.enum(['active', 'inactive', 'suspended', 'pending_verification', 'contract_expired']);
const consultantTierEnum = z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond']);

// ═══════════════════════════════════════════════════════════════════════════
// CREATE CONSULTANT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const createConsultantSchema = z.object({
  /** IDs of institutions to link — validated by the checkbox UI, not Zod */
  institution_ids: z.array(z.string()).optional(),
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  alternate_phone: z.string().optional().or(z.literal('')),
  consultant_type: consultantTypeEnum,
  contact_person: z.string().optional().or(z.literal('')),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  gst_number: z.string().optional().or(z.literal('')),
  pan_number: z.string().optional().or(z.literal('')),

  // Address (form aliases — remapped to DB column names in submit handler)
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')),
  pincode: z.string().optional().or(z.literal('')),

  // Banking
  bank_name: z.string().optional().or(z.literal('')),
  bank_account_number: z.string().optional().or(z.literal('')),
  bank_ifsc: z.string().optional().or(z.literal('')),
  bank_account_holder: z.string().optional().or(z.literal('')),

  // Contract
  contract_start_date: z.string().optional().or(z.literal('')),
  contract_end_date: z.string().optional().or(z.literal('')),

  // Notes & tags
  notes: z.string().optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),

  // Coverage & specialization (form aliases)
  geographic_coverage: z.array(z.string()).optional(),
  specializations: z.array(z.string()).optional(),
  programs_handled: z.array(z.string()).optional(),

  // Profile
  profile_photo_url: z.string().optional().or(z.literal('')),
});

export type CreateConsultantFormValues = z.infer<typeof createConsultantSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE CONSULTANT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const updateConsultantSchema = z.object({
  id: z.string().min(1, 'Consultant ID is required'),
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  alternate_phone: z.string().optional().or(z.literal('')),
  consultant_type: consultantTypeEnum,
  // status and tier are per-institution — edit them via the consultant_institutions row
  contact_person: z.string().optional().or(z.literal('')),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  gst_number: z.string().optional().or(z.literal('')),
  pan_number: z.string().optional().or(z.literal('')),

  // Address
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')),
  pincode: z.string().optional().or(z.literal('')),

  // Banking
  bank_name: z.string().optional().or(z.literal('')),
  bank_account_number: z.string().optional().or(z.literal('')),
  bank_ifsc: z.string().optional().or(z.literal('')),
  bank_account_holder: z.string().optional().or(z.literal('')),

  // Contract
  contract_start_date: z.string().optional().or(z.literal('')),
  contract_end_date: z.string().optional().or(z.literal('')),

  // Notes
  notes: z.string().optional().or(z.literal('')),

  // Scoring
  relationship_score: z.number().min(0).max(100).optional(),

  // Profile
  profile_photo_url: z.string().optional().or(z.literal('')),
});

export type UpdateConsultantFormValues = z.infer<typeof updateConsultantSchema>;
