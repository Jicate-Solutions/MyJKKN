// CDC Export types — agent ζ Sprint 7b

export type ExportFormat = 'csv' | 'xlsx';

// NAAC 5.2.1 placement row (matches cdc_naac_5_2_1_row composite type in DB)
export interface NaacRow {
  student_name: string;
  roll_number: string | null;
  college_email: string | null;
  course: string;
  company_name: string;
  package_lpa: number | null;
  year_of_placement: number;
  placement_status: string;
  job_role: string | null;
  job_location: string | null;
  is_walk_in: boolean;
  offered_at: string; // date string
}

// AICTE Annual Return row (matches cdc_aicte_annual_row composite type in DB)
export interface AicteRow {
  student_name: string;
  roll_number: string | null;
  program: string;
  company_name: string;
  package_inr: number | null;
  offer_date: string; // date string
  placement_status: string;
  job_role: string | null;
  is_internal: boolean;
}

// Flex generator request — sent by the UI
export type FlexTable = 'cdc_placements' | 'cdc_drives' | 'cdc_training_enrollments';

export interface FlexExportRequest {
  table: FlexTable;
  columns: string[];
  dateFrom: string; // ISO date
  dateTo: string;   // ISO date
  format: ExportFormat;
}

// Column metadata returned by the flex generator for column picker
export interface FlexColumnMeta {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'date';
}

// Export request shapes
export interface NaacExportRequest {
  cycle: string;   // e.g. '2024-25'
  format: ExportFormat;
}

export interface AicteExportRequest {
  year: number;    // calendar year e.g. 2025
  format: ExportFormat;
}

// Allowed columns per table (server-side safe list)
export const FLEX_TABLE_COLUMNS: Record<FlexTable, FlexColumnMeta[]> = {
  cdc_placements: [
    { name: 'learner_name',      label: 'Student Name',     type: 'text' },
    { name: 'roll_number',       label: 'Roll Number',      type: 'text' },
    { name: 'company_name',      label: 'Company',          type: 'text' },
    { name: 'job_role',          label: 'Job Role',         type: 'text' },
    { name: 'job_location',      label: 'Location',         type: 'text' },
    { name: 'package_lpa',       label: 'Package (LPA)',    type: 'number' },
    { name: 'package_inr_total', label: 'Package (INR)',    type: 'number' },
    { name: 'status',            label: 'Status',           type: 'text' },
    { name: 'is_walk_in',        label: 'Walk-in?',         type: 'boolean' },
    { name: 'offered_at',        label: 'Offer Date',       type: 'date' },
    { name: 'accepted_at',       label: 'Accepted Date',    type: 'date' },
  ],
  cdc_drives: [
    { name: 'drive_name',        label: 'Drive Name',       type: 'text' },
    { name: 'company_name',      label: 'Company',          type: 'text' },
    { name: 'drive_date',        label: 'Drive Date',       type: 'date' },
    { name: 'status',            label: 'Status',           type: 'text' },
    { name: 'venue',             label: 'Venue',            type: 'text' },
    { name: 'package_lpa_min',   label: 'Package Min (LPA)', type: 'number' },
    { name: 'package_lpa_max',   label: 'Package Max (LPA)', type: 'number' },
    { name: 'total_offers',      label: 'Total Offers',     type: 'number' },
  ],
  cdc_training_enrollments: [
    { name: 'learner_name',      label: 'Student Name',     type: 'text' },
    { name: 'programme_name',    label: 'Programme',        type: 'text' },
    { name: 'status',            label: 'Status',           type: 'text' },
    { name: 'enrolled_at',       label: 'Enrolled Date',    type: 'date' },
    { name: 'completed_at',      label: 'Completed Date',   type: 'date' },
    { name: 'score',             label: 'Score',            type: 'number' },
    { name: 'certificate_url',   label: 'Certificate URL',  type: 'text' },
  ],
};
