// ============================================
// ENQUIRY BULK-EDIT — SHARED COLUMN MAPPING + SANITIZER
// ============================================
// Created: 2026-06-29
// Purpose: Single source of truth for which columns the enquiry (non-active)
//   bulk-edit accepts, shared by the preview and apply routes so they cannot
//   drift. This mapping IS the "safe subset" enforcement: academic placement,
//   lifecycle status, entry/scholarship/accommodation/quota are deliberately
//   NOT here, so any edits to those columns are silently ignored on upload.
//   (Same display-only trick the active-learner bulk-edit uses.)
// ============================================

import { sanitizeValue } from '@/lib/utils/excel-parser';
import {
  normalizeDropdownValue,
  BLOOD_GROUP_VALUES
} from '@/lib/constants/learner-dropdown-values';

/**
 * Editable columns only. `id` is the required match key. Community/Caste are
 * resolved to their FKs downstream by BulkLearnerEditService.processBulkEdit.
 */
export const ENQUIRY_BULK_EDIT_COLUMN_MAPPING: Record<string, string[]> = {
  // REQUIRED match key
  id: ['ID*', 'ID', 'id', 'learner_id'],

  // SECTION 1: Basic Details
  first_name: ['First Name', 'first_name', 'firstname'],
  last_name: ['Last Name', 'last_name', 'lastname'],
  date_of_birth: ['Date of Birth', 'DOB', 'date_of_birth', 'dob'],
  gender: ['Gender', 'gender'],
  religion: ['Religion', 'religion'],
  community: ['Community', 'community'],
  caste: ['Caste', 'caste'],
  aadhar_number: ['Aadhar Number', 'aadhar_number', 'aadhaar'],
  blood_group: ['Blood Group', 'blood_group'],

  // SECTION 2: Parent/Guardian Information
  father_name: ['Father Name', 'father_name', 'fathername'],
  father_occupation: ['Father Occupation', 'father_occupation'],
  father_mobile: ['Father Mobile', 'father_mobile'],
  mother_name: ['Mother Name', 'mother_name', 'mothername'],
  mother_occupation: ['Mother Occupation', 'mother_occupation'],
  mother_mobile: ['Mother Mobile', 'mother_mobile'],
  annual_income: ['Annual Income', 'annual_income'],

  // SECTION 4: Contact Details
  student_mobile: ['Student Mobile', 'Mobile', 'mobile', 'student_mobile'],
  college_email: ['College Email', 'college_email', 'email'],
  student_email: ['Personal Email', 'Student Email', 'student_email', 'personal_email'],

  // SECTION 5: Address Information
  permanent_address_street: ['Permanent Address Street', 'permanent_address_street', 'address_street'],
  permanent_address_taluk: ['Permanent Address Taluk', 'permanent_address_taluk', 'taluk'],
  permanent_address_district: ['Permanent Address District', 'permanent_address_district', 'district'],
  permanent_address_pin_code: ['Permanent Address Pin Code', 'permanent_address_pin_code', 'pincode', 'pin'],
  permanent_address_state: ['Permanent Address State', 'permanent_address_state', 'state'],

  // SECTION 7: Previous Education
  last_school: ['Last School', 'last_school'],
  board_of_study: ['Board of Study', 'board_of_study'],
  tenth_max_marks: ['10th Max Marks', 'tenth_max_marks'],
  tenth_obtained_marks: ['10th Obtained Marks', 'tenth_obtained_marks'],
  tenth_percentage: ['10th Percentage', 'tenth_percentage'],
  twelfth_group: ['12th Group', 'twelfth_group'],
  twelfth_max_marks: ['12th Max Marks', 'twelfth_max_marks'],
  twelfth_obtained_marks: ['12th Obtained Marks', 'twelfth_obtained_marks'],
  twelfth_percentage: ['12th Percentage', 'twelfth_percentage'],

  // SECTION 8: Entrance Exam Details
  medical_cutoff_marks: ['Medical Cutoff Marks', 'medical_cutoff_marks'],
  engineering_cutoff_marks: ['Engineering Cutoff Marks', 'engineering_cutoff_marks'],
  neet_roll_number: ['NEET Roll Number', 'neet_roll_number'],
  neet_score: ['NEET Score', 'neet_score'],

  // SECTION 10: Reference Information
  reference_type: ['Reference Type', 'reference_type'],
  reference_name: ['Reference Name', 'reference_name'],
  reference_contact: ['Reference Contact', 'reference_contact']
};

/**
 * Turn a mapped Excel row into the sanitized partial-update payload.
 * Only non-empty cells produce a key, so blank cells leave the DB value
 * unchanged. Community/Caste stay as readable labels — the service resolves
 * them to FKs. 10th/12th marks are rebuilt into their JSONB shape.
 *
 * NOTE (parity with active flow): a marks object is written whole, so a blank
 * sub-cell drops that sub-field. The export pre-fills all three, so normal
 * round-trips are safe; only manually clearing a single marks cell loses it.
 */
export function buildSanitizedEnquiryRow(
  mappedData: Record<string, any>
): Record<string, any> {
  const out: Record<string, any> = { id: mappedData.id };

  // SECTION 1: Basic Details
  if (mappedData.first_name) out.first_name = sanitizeValue(mappedData.first_name, 'text');
  if (mappedData.last_name) out.last_name = sanitizeValue(mappedData.last_name, 'text');
  if (mappedData.date_of_birth) out.date_of_birth = sanitizeValue(mappedData.date_of_birth, 'date');
  if (mappedData.gender) out.gender = sanitizeValue(mappedData.gender, 'text');
  if (mappedData.religion) out.religion = sanitizeValue(mappedData.religion, 'text');
  if (mappedData.community) out.community = sanitizeValue(mappedData.community, 'text');
  if (mappedData.caste) out.caste = sanitizeValue(mappedData.caste, 'text');
  if (mappedData.aadhar_number) out.aadhar_number = sanitizeValue(mappedData.aadhar_number, 'mobile');
  if (mappedData.blood_group) {
    const normalized = normalizeDropdownValue(String(mappedData.blood_group), BLOOD_GROUP_VALUES);
    if (normalized) out.blood_group = normalized;
  }

  // SECTION 2: Parent/Guardian Information
  if (mappedData.father_name) out.father_name = sanitizeValue(mappedData.father_name, 'text');
  if (mappedData.father_occupation) out.father_occupation = sanitizeValue(mappedData.father_occupation, 'text');
  if (mappedData.father_mobile) out.father_mobile = sanitizeValue(mappedData.father_mobile, 'mobile');
  if (mappedData.mother_name) out.mother_name = sanitizeValue(mappedData.mother_name, 'text');
  if (mappedData.mother_occupation) out.mother_occupation = sanitizeValue(mappedData.mother_occupation, 'text');
  if (mappedData.mother_mobile) out.mother_mobile = sanitizeValue(mappedData.mother_mobile, 'mobile');
  if (mappedData.annual_income) out.annual_income = mappedData.annual_income;

  // SECTION 4: Contact Details
  if (mappedData.student_mobile) out.student_mobile = sanitizeValue(mappedData.student_mobile, 'mobile');
  if (mappedData.college_email) out.college_email = sanitizeValue(mappedData.college_email, 'email');
  if (mappedData.student_email) out.student_email = sanitizeValue(mappedData.student_email, 'email');

  // SECTION 5: Address Information
  if (mappedData.permanent_address_street) out.permanent_address_street = sanitizeValue(mappedData.permanent_address_street, 'text');
  if (mappedData.permanent_address_taluk) out.permanent_address_taluk = sanitizeValue(mappedData.permanent_address_taluk, 'text');
  if (mappedData.permanent_address_district) out.permanent_address_district = sanitizeValue(mappedData.permanent_address_district, 'text');
  if (mappedData.permanent_address_pin_code) out.permanent_address_pin_code = sanitizeValue(mappedData.permanent_address_pin_code, 'mobile');
  if (mappedData.permanent_address_state) out.permanent_address_state = sanitizeValue(mappedData.permanent_address_state, 'text');

  // SECTION 7: Previous Education
  if (mappedData.last_school) out.last_school = sanitizeValue(mappedData.last_school, 'text');
  if (mappedData.board_of_study) out.board_of_study = sanitizeValue(mappedData.board_of_study, 'text');
  if (mappedData.tenth_max_marks || mappedData.tenth_obtained_marks || mappedData.tenth_percentage) {
    out.tenth_marks = {};
    if (mappedData.tenth_max_marks) out.tenth_marks.max_marks = Number(mappedData.tenth_max_marks);
    if (mappedData.tenth_obtained_marks) out.tenth_marks.obtained_marks = Number(mappedData.tenth_obtained_marks);
    if (mappedData.tenth_percentage) out.tenth_marks.percentage = Number(mappedData.tenth_percentage);
  }
  if (
    mappedData.twelfth_group ||
    mappedData.twelfth_max_marks ||
    mappedData.twelfth_obtained_marks ||
    mappedData.twelfth_percentage
  ) {
    out.twelfth_marks = {};
    if (mappedData.twelfth_group) out.twelfth_marks.group = sanitizeValue(mappedData.twelfth_group, 'text');
    if (mappedData.twelfth_max_marks) out.twelfth_marks.max_marks = Number(mappedData.twelfth_max_marks);
    if (mappedData.twelfth_obtained_marks) out.twelfth_marks.obtained_marks = Number(mappedData.twelfth_obtained_marks);
    if (mappedData.twelfth_percentage) out.twelfth_marks.percentage = Number(mappedData.twelfth_percentage);
  }

  // SECTION 8: Entrance Exam Details
  if (mappedData.medical_cutoff_marks) out.medical_cutoff_marks = Number(mappedData.medical_cutoff_marks);
  if (mappedData.engineering_cutoff_marks) out.engineering_cutoff_marks = Number(mappedData.engineering_cutoff_marks);
  if (mappedData.neet_roll_number) out.neet_roll_number = sanitizeValue(mappedData.neet_roll_number, 'text');
  if (mappedData.neet_score) out.neet_score = Number(mappedData.neet_score);

  // SECTION 10: Reference Information
  if (mappedData.reference_type) out.reference_type = sanitizeValue(mappedData.reference_type, 'text');
  if (mappedData.reference_name) out.reference_name = sanitizeValue(mappedData.reference_name, 'text');
  if (mappedData.reference_contact) out.reference_contact = sanitizeValue(mappedData.reference_contact, 'mobile');

  return out;
}
