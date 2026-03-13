// ============================================
// FEE STRUCTURE CONFIGURATION
// ============================================
// Created: 2026-03-13
// Purpose: Centralized config for fee structure types,
// primary fields, and conditional optional fees.
// Used by: finance-details form, enquiry-detail, learner-detail
// ============================================

export const FEE_STRUCTURE_TYPES = [
  'tuition_uniform_hospital',
  'tuition_instruments_hospital',
  'tuition_instruments',
  'tuition_hostel',
  'tuition_only',
] as const;

export type FeeStructureType = (typeof FEE_STRUCTURE_TYPES)[number];

export interface FeeFieldConfig {
  name: string;
  label: string;
}

export interface FeeStructureConfig {
  label: string;
  description: string;
  primaryFields: FeeFieldConfig[];
  optionalFees: string[];
}

export const FEE_STRUCTURE_CONFIG: Record<FeeStructureType, FeeStructureConfig> = {
  tuition_uniform_hospital: {
    label: 'Tuition + Uniform + Hospital Training',
    description: 'Combined fee covering tuition, uniform, and hospital training',
    primaryFields: [
      { name: 'tuition_fee', label: 'Combined Fee (Tuition + Uniform + Hospital)' },
    ],
    optionalFees: ['transport_fee', 'hostel_fee'],
  },
  tuition_instruments_hospital: {
    label: 'Tuition + Instruments + Hospital',
    description: 'Combined fee covering tuition, instruments, and hospital training',
    primaryFields: [
      { name: 'tuition_fee', label: 'Combined Fee (Tuition + Instruments + Hospital)' },
    ],
    optionalFees: [],
  },
  tuition_instruments: {
    label: 'Tuition + Instruments',
    description: 'Combined fee covering tuition and instruments',
    primaryFields: [
      { name: 'tuition_fee', label: 'Combined Fee (Tuition + Instruments)' },
    ],
    optionalFees: ['transport_fee'],
  },
  tuition_hostel: {
    label: 'Tuition Fee + Hostel',
    description: 'Separate tuition and hostel fees',
    primaryFields: [
      { name: 'tuition_fee', label: 'Tuition Fee' },
      { name: 'hostel_fee', label: 'Hostel Fee' },
    ],
    optionalFees: ['placement_fee'],
  },
  tuition_only: {
    label: 'Tuition Fee',
    description: 'Tuition fee only',
    primaryFields: [
      { name: 'tuition_fee', label: 'Tuition Fee' },
    ],
    optionalFees: ['placement_fee', 'transport_fee'],
  },
};

export const OPTIONAL_FEE_LABELS: Record<string, string> = {
  uniform_fee: 'Uniform Fee',
  hospital_training_fee: 'Hospital Training Fee',
  placement_fee: 'Placement Fee',
  transport_fee: 'Transport Fee',
  hostel_fee: 'Hostel Fee',
};

// All fee fields that get conditionally shown/hidden based on structure type
export const ALL_CONDITIONAL_FEE_FIELDS = [
  'tuition_fee',
  'hostel_fee',
  'dayscholar_fee',
  'uniform_fee',
  'hospital_training_fee',
  'placement_fee',
  'transport_fee',
] as const;
