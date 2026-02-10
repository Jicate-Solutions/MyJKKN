// Products / TRL / RDIF Types - Product Development Tracking
// Canonical service-layer types: @/lib/services/solutions/types.ts
//
// This file defines SH-prefixed interfaces for JKKN-owned products,
// TRL (Technology Readiness Level) tracking, validation evidence,
// and RDIF (Research & Development Innovation Fund) prerequisite readiness.

// ============================================
// ENUMS / CONSTANTS
// ============================================

export type ProductDomain =
  | 'health_tech'
  | 'edu_tech'
  | 'pharma_tech'
  | 'dental_tech'
  | 'nursing_tech'
  | 'construction_tech'
  | 'other';

export type RDIFSector =
  | 'health_technologies'
  | 'digital_economy'
  | 'energy'
  | 'agriculture'
  | 'defence'
  | 'space'
  | 'telecom';

export type PatentStatus =
  | 'none'
  | 'provisional_filed'
  | 'full_filed'
  | 'granted'
  | 'rejected';

export type ProductStatus =
  | 'concept'
  | 'prototype'
  | 'lab_validated'
  | 'field_validated'
  | 'market_ready'
  | 'deployed'
  | 'archived';

export type ValidationStatus = 'pending' | 'verified' | 'rejected';

export type ValidationType =
  | 'internal_review'
  | 'lab_test'
  | 'field_test'
  | 'external_review'
  | 'user_validation'
  | 'publication'
  | 'patent';

// ============================================
// BASE TYPES
// ============================================

export interface SHProduct {
  id: string;
  product_code: string;
  title: string;
  description: string | null;
  current_trl: number;
  target_trl: number | null;
  trl_assessed_at: string | null;
  trl_assessed_by: string | null;
  originating_solution_ids: string[] | null;
  lead_department_id: string | null;
  domain: ProductDomain | null;
  sector: RDIFSector | null;
  patent_status: PatentStatus;
  patent_number: string | null;
  patent_filed_at: string | null;
  status: ProductStatus;
  rdif_readiness_score: number;
  development_budget: number;
  development_spent: number;
  tags: string[] | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SHProductWithDetails extends SHProduct {
  department?: { id: string; name: string; code: string } | null;
  validations?: SHProductValidation[];
  originating_solutions?: Array<{ id: string; title: string; solution_code: string }>;
}

export interface SHProductValidation {
  id: string;
  product_id: string;
  trl_level: number;
  validation_type: ValidationType;
  title: string;
  evidence_description: string | null;
  evidence_url: string | null;
  validated_by: string | null;
  validator_affiliation: string | null;
  is_external: boolean;
  validation_date: string | null;
  status: ValidationStatus;
  created_at: string;
  created_by: string | null;
}

export interface SHRDIFPrerequisite {
  id: string;
  prerequisite_key: string;
  label: string;
  description: string | null;
  is_met: boolean;
  evidence: string | null;
  evidence_url: string | null;
  target_date: string | null;
  updated_at: string;
  updated_by: string | null;
}

// ============================================
// TRL LEVEL REFERENCE (for UI components)
// ============================================

export const TRL_LEVELS: Record<number, { name: string; description: string; color: string }> = {
  1: { name: 'Basic Principles', description: 'Basic principles observed and reported', color: '#ef4444' },
  2: { name: 'Concept Formulated', description: 'Technology concept and/or application formulated', color: '#f97316' },
  3: { name: 'Proof of Concept', description: 'Analytical and experimental proof of concept', color: '#f59e0b' },
  4: { name: 'Lab Validated', description: 'Component validated in laboratory environment', color: '#eab308' },
  5: { name: 'Relevant Environment', description: 'Component validated in relevant environment', color: '#84cc16' },
  6: { name: 'Demonstrated', description: 'System demonstrated in relevant environment', color: '#22c55e' },
  7: { name: 'Operational Prototype', description: 'System prototype in operational environment', color: '#10b981' },
  8: { name: 'System Complete', description: 'Actual system completed and qualified', color: '#06b6d4' },
  9: { name: 'Proven', description: 'Actual system proven in operational environment', color: '#3b82f6' },
};

// ============================================
// RDIF PREREQUISITE KEYS (for programmatic access)
// ============================================

export const RDIF_PREREQUISITE_KEYS = [
  'registered_company',
  'indian_control',
  'trl_4_plus',
  'ip_portfolio',
  'co_investment',
  'rd_track_record',
  'slfm_relationships',
  'dsir_recognition',
  'research_output',
] as const;

export type RDIFPrerequisiteKey = typeof RDIF_PREREQUISITE_KEYS[number];

// ============================================
// INPUT TYPES (for create/update operations)
// ============================================

export interface CreateProductInput {
  product_code: string;
  title: string;
  description?: string;
  current_trl?: number;
  target_trl?: number;
  originating_solution_ids?: string[];
  lead_department_id?: string;
  domain?: ProductDomain;
  sector?: RDIFSector;
  status?: ProductStatus;
  development_budget?: number;
  tags?: string[];
  notes?: string;
  created_by?: string;
}

export interface UpdateProductInput {
  title?: string;
  description?: string;
  current_trl?: number;
  target_trl?: number;
  trl_assessed_at?: string;
  trl_assessed_by?: string;
  originating_solution_ids?: string[];
  lead_department_id?: string;
  domain?: ProductDomain;
  sector?: RDIFSector;
  patent_status?: PatentStatus;
  patent_number?: string;
  patent_filed_at?: string;
  status?: ProductStatus;
  rdif_readiness_score?: number;
  development_budget?: number;
  development_spent?: number;
  tags?: string[];
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateProductValidationInput {
  product_id: string;
  trl_level: number;
  validation_type: ValidationType;
  title: string;
  evidence_description?: string;
  evidence_url?: string;
  validated_by?: string;
  validator_affiliation?: string;
  is_external?: boolean;
  validation_date?: string;
  created_by?: string;
}

export interface UpdateRDIFPrerequisiteInput {
  is_met?: boolean;
  evidence?: string;
  evidence_url?: string;
  target_date?: string;
  updated_by?: string;
}
