'use client';
// ============================================
// ENQUIRY FORM COMPONENT (Multi-Step)
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-18 - Added all admission fields with tabs
// Purpose: Complete multi-step form for learner enquiries
// ============================================


import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, FieldErrors, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { LearnerProfile } from '@/types/learner-profile';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import { Loader2, Save, Send, ChevronLeft, ChevronRight, X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

// Import form sections
import { BasicDetailsSection } from './form-sections/basic-details';
import { AcademicInformationSection } from './form-sections/academic-information';
import { CourseSelectionSection } from './form-sections/course-selection';
import { ContactDetailsSection } from './form-sections/contact-details';
import { AccommodationPreferencesSection } from './form-sections/accommodation-preferences';
import { FinanceDetailsSection } from './form-sections/finance-details';
// FEE_STRUCTURE_CONFIG removed 2026-04-15 — replaced by dynamic fee_items flow.
import { uploadProfileImage } from './profile-image-upload';
import { usePermissions } from '@/hooks/use-permissions';
import { useQuery } from '@tanstack/react-query';
import { DegreeService } from '@/lib/services/organization/degree-service';
import type { DegreeType } from '@/types/organizations';

// Plan 6 / Task 5 — pre-submit confirmation dialog wiring
import { PreSubmitConfirmationDialog } from './pre-submit-confirmation-dialog';
import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';
import { FeeResolutionService } from '@/lib/services/admission/fee-resolution-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { logActivityForCurrentUser } from '@/lib/utils/activity-logger-client';
import { AdmissionFeesActivityTemplates } from '@/lib/utils/admission-fees-activity-templates';
import { IncompleteFeeBanner, getMissingFeeDimensions } from './incomplete-fee-banner';
import { getErrorMessage } from '@/lib/utils';
import { errorMessage } from '@/lib/utils/supabase-error';
import type {
  AdmissionFeeStructureWithItems,
  FeeStructureMatrixDimensions,
  ResolvedFeeItem,
} from '@/types/admission';

// Import location data for converting names to IDs
import {
  indianStates,
  getDistrictsByState,
  getTaluksByDistrict
} from '@/lib/data/locations';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// Task 15 — student-self-fill QR + per-section status chips
import { ShowStudentQRButton } from '@/components/admission/show-student-qr-button';
import { StudentSectionStatusChip } from './student-section-status-chip';

/**
 * Complete Enquiry Form Schema
 * All fields are optional for draft mode
 * Required fields are validated only on final submission
 */
export const enquiryFormSchema = z.object({
  // Basic Details
  enquiry_date: z.string().nullable().optional(),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  // Tamil-script name — rendered only when showTamilNames is set (Learner
  // Profiles create + edit). Optional everywhere: the columns are nullable and
  // the fields are absent from the other flows that share this schema.
  first_name_tamil: z.string().optional(),
  last_name_tamil: z.string().optional(),
  // External identifiers — rendered only when showLearnerIdentifiers is set.
  // Never format-validated: see the migration header for why.
  abc_id: z.string().optional(),
  emis: z.string().optional(),
  umis: z.string().optional(),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['Male', 'Female', 'Other'], { required_error: 'Gender is required' }),
  religion: z.string().min(1, 'Religion is required'),
  // FK source of truth (DB-backed community_categories / castes).
  community_category_id: z.string().uuid('Community is required'),
  caste_id: z.string().uuid().optional().or(z.literal('')),
  // Legacy TEXT shadows — kept optional for back-compat; the DB trigger keeps
  // them in sync from the FK ids above, so the UI no longer writes them.
  aadhar_number: z.string().nullable().optional(),
  blood_group: z.string().nullable().optional(),
  student_photo_url: z.string().nullable().optional(),
  // 2026-04-23: legacy integer year — kept for B2A back-compat (6 endpoints
  // still expose it). Auto-derived from admission_year_id on submit.
  admission_year: z.number().nullable().optional(),
  // 2026-04-23: new source of truth — FK to admission_years (cascading
  // institution + program scoped). Picked via <AdmissionYearSelect/> in
  // the Course Selection tab.
  // 2026-07-27: promoted optional → required (see the academic_year_id /
  // section_id note below for why this is safe for early capture).
  admission_year_id: z.string().uuid('Admission year is required'),
  learner_type: z.enum(['regular', 'irregular', 'intern']).nullable().optional(),

  // Family Information
  father_name: z.string().min(1, "Father's name is required"),
  father_occupation: z.string().nullable().optional(),
  father_mobile: z.string().nullable().optional(),
  mother_name: z.string().min(1, "Mother's name is required"),
  mother_occupation: z.string().nullable().optional(),
  mother_mobile: z.string().nullable().optional(),
  annual_income: z.string().nullable().optional(),

  // Academic Information
  last_school: z.string().nullable().optional(),
  // FK to school_master when picked from the dropdown; null for manual entries
  last_school_id: z.string().nullable().optional(),
  school_district: z.string().nullable().optional(),
  board_of_study: z.string().nullable().optional(),
  tenth_marks: z.object({
    max_marks: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
    obtained_marks: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
    percentage: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
  }).nullable().optional(),
  twelfth_marks: z.object({
    group: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
    max_marks: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
    obtained_marks: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
    percentage: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
    subjects: z.object({
      // Science subjects
      physics: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      chemistry: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      mathematics: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      biology: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      botany: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      zoology: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      computer_science: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      // Commerce subjects
      accountancy: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      commerce: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      economics: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      statistics: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      // Arts subjects
      history: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
      geography: z.union([z.coerce.string(), z.null(), z.undefined()]).optional(),
    }).optional(),
  }).nullable().optional(),
  neet_roll_number: z.string().nullable().optional(),
  neet_score: z.string().nullable().optional(),
  medical_cutoff_marks: z.string().nullable().optional(),
  engineering_cutoff_marks: z.string().nullable().optional(),
  counseling_applied: z.boolean().nullable().optional(),
  counseling_number: z.string().nullable().optional(),
  scholarship_type: z.string().min(1, 'Scholarship type is required'),
  quota_id: z.string().uuid('Select a valid quota').nullable().optional(),
  entry_type: z.string().min(1, 'Entry type is required'),

  // Course Selection
  institution_id: z.string().min(1, 'Institution is required'),
  // 2026-05-26: degree_id and department_id are optional for schools
  // (auto-filled by SchoolDefaultsService); required for colleges
  degree_id: z.string().nullable().optional(),
  department_id: z.string().nullable().optional(),
  program_id: z.string().min(1, 'Program is required'),
  // 2026-05-21: academic_year_id and section_id were relaxed required → optional
  // because most enquiries are captured before the student is placed in an
  // academic-year cohort / section, and keeping them required blocked save on
  // the entry-point form.
  // 2026-07-27: promoted back to required (with admission_year_id above). The
  // 2026-05-21 concern is covered by "Save Draft" / "Save & Next", which call
  // form.getValues() and bypass validation entirely — a counsellor can still
  // capture an enquiry before the cohort/section is known. Only the final
  // Submit now demands all three.
  academic_year_id: z.string().min(1, 'Academic year is required'),
  semester_id: z.string().min(1, 'Semester is required'),
  section_id: z.string().min(1, 'Section is required'),
  roll_number: z.string().nullable().optional(),
  register_number: z.string().nullable().optional(),
  college_email: z.string().nullable().optional(),
  regulation_id: z.string().nullable().optional(),
  batch_id: z.string().nullable().optional(),

  // Contact Details
  student_mobile: z.string().min(1, "Student's mobile number is required"),
  student_email: z.string().nullable().optional(),
  permanent_address_street: z.string().min(1, 'Street address is required')
    .refine((v) => !v.includes('@'), { message: 'Please enter a street address, not an email' }),
  permanent_address_taluk: z.string().min(1, 'Taluk is required'),
  permanent_address_district: z.string().min(1, 'District is required'),
  permanent_address_state: z.string().min(1, 'State is required'),
  permanent_address_pin_code: z.string().min(1, 'PIN code is required'),
  // postal_codes FK when a post office was picked for the pincode (optional)
  post_office_id: z.string().nullable().optional(),

  // Accommodation Preferences
  accommodation_type: z.string().min(1, 'Accommodation type is required'),
  hostel_category_id: z.string().nullable().optional(),
  mess_category_id: z.string().nullable().optional(),
  bus_required: z.boolean().nullable().optional(),
  transport_route_id: z.string().nullable().optional(),
  transport_stop_id: z.string().nullable().optional(),
  reference_type: z.string().nullable().optional(),
  reference_name: z.string().nullable().optional(),
  reference_contact: z.string().nullable().optional(),

  // Finance Details — LEGACY columns kept for backward compat
  application_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  university_reg_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  fee_structure_type: z.enum([
    'tuition_hostel',
    'tuition_uniform_hospital',
    'tuition_instruments_hospital',
    'tuition_instruments',
    'tuition_only',
  ]).nullable().optional(),
  tuition_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  hostel_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  dayscholar_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  uniform_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  hospital_training_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  placement_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),

  // Updated: 2026-04-15 - Dynamic fee line items (new flow)
  fee_items: z
    .array(
      z.object({
        category_id: z.string().min(1, 'Category is required'),
        category_name: z.string().min(1, 'Category name is required'),
        amount: z.coerce.number().min(0, 'Amount must be non-negative'),
      })
    )
    .default([])
    .optional(),
});

// Required fields schema for final submission
const requiredFieldsSchema = enquiryFormSchema.extend({
  first_name: z.string().min(2, 'First name is required'),
  student_mobile: z.string().min(10, 'Mobile number is required'),
  institution_id: z.string().uuid('Institution is required'),
  program_id: z.string().uuid('Program is required'),
});

// 2026-07-27: the three fields promoted to required above all live on the
// Course Selection tab. Surfaces that HIDE that tab (learners/my-profile passes
// visibleTabs without 'course-selection') must keep them optional — a required
// field on a tab the user cannot open is an unfixable submit block, and
// onInvalid would try to switch to a tab that isn't rendered. Those surfaces
// swap in the relaxed pair below; every other caller renders the tab and gets
// the strict schemas.
const COURSE_TAB_OPTIONAL = {
  admission_year_id: z.string().uuid().nullable().optional().or(z.literal('')),
  academic_year_id: z.string().nullable().optional(),
  section_id: z.string().nullable().optional(),
};
const relaxedFormSchema = enquiryFormSchema.extend(COURSE_TAB_OPTIONAL);
const relaxedRequiredFieldsSchema = requiredFieldsSchema.extend(COURSE_TAB_OPTIONAL);

export type EnquiryFormValues = z.infer<typeof enquiryFormSchema>;

interface EnquiryFormProps {
  learner?: LearnerProfile;
  onSuccess?: (learner: LearnerProfile) => void;
  visibleTabs?: string[];
  onSubmit?: (data: any) => Promise<void>;
  submitLabel?: string;
  hideDraft?: boolean;
  isStudentView?: boolean;
  /**
   * Apply admission-capture policy on the Course Selection tab (first-year =>
   * Science & Humanities department only, semester locked to Freshers/section
   * A). Defaults to true for the enquiry/admission flow.
   *
   * Learner Profiles create + edit pass false: those screens serve the entire
   * existing population, whose entry_type records how they joined years ago,
   * not a decision being made now.
   */
  enforceAdmissionRules?: boolean;
  /**
   * Show the final submit button on every step instead of only the last one,
   * so a step form can be finalised from wherever the user happens to be.
   * "Save & Next" keeps advancing step by step; the submit button validates
   * every tab, saves, and hands off to onSuccess (which redirects).
   *
   * Learner Profiles edit passes true: an officer correcting one field on the
   * first tab should not have to walk through four more tabs to commit it.
   */
  allowSubmitFromAnyTab?: boolean;
  /**
   * Collapse the create-wizard's step controls into a single "Update" button
   * that saves from whatever tab the user is on. Hides "Previous", "Save &
   * Next" and the separate final-submit button; the tab headers stay as the
   * navigation.
   *
   * /learners/enquiries/[id]/edit passes true. Two separate defects made an
   * edit there look like it never happened:
   *
   *  1. The button labelled "Update" on a middle tab was the SAVE DRAFT
   *     button, and handleSaveDraft never called onSuccess. onSuccess is the
   *     only hook that invalidates learnerProfileKeys.detail/lists and calls
   *     router.refresh(), so with staleTime 5min + refetchOnWindowFocus off
   *     the row was written but the detail page and a re-opened edit form both
   *     kept serving the pre-edit snapshot. Same class of bug the Profiles
   *     edit page fixed with hideDraft.
   *  2. Three save-ish buttons ("Update", "Save & Next", and the final submit
   *     on the last tab) were indistinguishable at a glance.
   *
   * Deliberately NOT the allowSubmitFromAnyTab + hideDraft pair that Profiles
   * edit uses: that routes every save through requiredFieldsSchema, which
   * requires section_id — and 390 of 456 open enquiries (86%, measured
   * 2026-09-02) have none, because an enquiry is captured early and completed
   * later. Making the only save button refuse those records would be worse
   * than the bug. Enquiry edits therefore keep the non-blocking save and rely
   * on the DB guards (trg_validate_learner_semester_year_scope refuses
   * genuinely inconsistent course dimensions; trg_detect_fee_dimension_change
   * re-runs admission_resolve_fee_items_for_lead when a fee dimension moves).
   */
  singleSaveButton?: boolean;
  /**
   * Render the Tamil-script name inputs (first_name_tamil / last_name_tamil)
   * on the Basic Details tab. Defaults to false.
   *
   * Only Learner Profiles create + edit pass true. This form is also mounted by
   * /learners/enquiries and the student self-fill form, and those flows were
   * explicitly left unchanged — the flag keeps the new fields off screens that
   * did not ask for them, the same way isStudentView gates section content.
   */
  showTamilNames?: boolean;
  /**
   * Render the external-identifier inputs (ABC ID / EMIS / UMIS) on the Basic
   * Details tab. Defaults to false; only Learner Profiles create + edit pass
   * true, for the same reason as showTamilNames.
   */
  showLearnerIdentifiers?: boolean;
}

  const ALL_TABS = [
    { id: 'basic-details', label: 'Basic Details' },
    { id: 'contact-details', label: 'Contact Details' },
    { id: 'course-selection', label: 'Course Selection' },
    { id: 'academic-information', label: 'Academic Information' },
    { id: 'accommodation-preferences', label: 'Accommodation' },
    { id: 'finance-details', label: 'Finance Details' },
  ];

/**
 * Helper function to normalize 12th group/stream values
 * Maps legacy database values to dropdown values
 */
function normalizeGroupValue(group: string | undefined): string {
  if (!group) return '';

  const normalized = group.toLowerCase().trim();

  // Map legacy values to dropdown values
  const groupMappings: Record<string, string> = {
    'bio maths': 'pcbm',
    'maths biology': 'pcbm',
    'bio nursing': 'pcbz',
    'maths computer': 'pccs',
    'computer science': 'pccs',
    'pcbm': 'pcbm',
    'pccs': 'pccs',
    'pcbz': 'pcbz',
    'science': 'science',
    'commerce': 'commerce',
    'cseca': 'cseca',
    'heca': 'heca',
    'seca': 'seca',
    'arts': 'arts',
    'vocational': 'vocational',
    'diploma': 'diploma',
  };

  return groupMappings[normalized] || '';
}

/**
 * Helper function to normalize reference type values
 * Maps legacy database values to dropdown values
 */
function normalizeReferenceType(referenceType: string | undefined): string {
  if (!referenceType) return '';

  const normalized = referenceType.toUpperCase().trim();

  // Map legacy values to dropdown values
  const referenceMappings: Record<string, string> = {
    'STAFF': 'JKKN STAFF',
    'JKKN STAFF': 'JKKN STAFF',
    'CONSULTANT': 'EDUCATIONAL CONSULTANT',
    'EDUCATIONAL CONSULTANT': 'EDUCATIONAL CONSULTANT',
    'CURRENT/FORMER STUDENT': 'CURRENT/FORMER STUDENT',
    'DIRECT APPLICATION': 'DIRECT APPLICATION',
    'SOCIAL MEDIA': 'SOCIAL MEDIA',
    'OTHERS': 'OTHERS',
    'NO': '', // Legacy "NO" value maps to empty
  };

  return referenceMappings[normalized] || '';
}

/**
 * Helper function to convert location name back to ID for editing
 * Database stores names, but form needs IDs for dropdowns
 */
function findKnownLocationId(
  name: string | undefined,
  type: 'state' | 'district' | 'taluk',
  stateId?: string
): string | undefined {
  if (!name) {
    return '';
  }

  try {
    // Two storage formats coexist in production for permanent_address_*
    // columns: (a) legacy entries store the display NAME (e.g.
    // 'TAMIL NADU', 'TIRUVANNAMALAI'); (b) student-form-QR entries store
    // the snake_case ID directly (e.g. 'tamil_nadu', 'tiruvannamalai').
    // We try ID-match FIRST (cheap and unambiguous) and fall back to
    // name-match. Pre-2026-05-21 this function only did name-match, so
    // every student-form-submitted row's state+district+taluk silently
    // failed to load into the edit form, then the cascading-reset
    // effect in contact-details.tsx cleared them. Found by user report
    // 2026-05-21; verified against learner SUNITHA who had
    // state='tamil_nadu' / district='krishnagiri' stored correctly
    // but didn't populate on edit.
    const normalized = name.trim().toLowerCase();

    if (type === 'state') {
      const byId = indianStates.find((s) => s.id.toLowerCase() === normalized);
      if (byId) return byId.id;
      const byName = indianStates.find((s) => s.name.toLowerCase() === normalized);
      return byName?.id ?? '';
    }

    if (type === 'district') {
      // ID-first scan across all states
      for (const state of indianStates) {
        const districts = getDistrictsByState(state.id);
        const byId = districts.find((d) => d.id.toLowerCase() === normalized);
        if (byId) return byId.id;
      }
      // Fall back to name-match
      for (const state of indianStates) {
        const districts = getDistrictsByState(state.id);
        const byName = districts.find((d) => d.name.toLowerCase() === normalized);
        if (byName) return byName.id;
      }
      return '';
    }

    if (type === 'taluk') {
      const search = (sid: string): string | undefined => {
        const districts = getDistrictsByState(sid);
        // ID-first
        for (const district of districts) {
          const taluks = getTaluksByDistrict(sid, district.id);
          const byId = taluks.find((t) => t.id.toLowerCase() === normalized);
          if (byId) return byId.id;
        }
        // Name fallback
        for (const district of districts) {
          const taluks = getTaluksByDistrict(sid, district.id);
          const byName = taluks.find((t) => t.name.toLowerCase() === normalized);
          if (byName) return byName.id;
        }
        return undefined;
      };

      if (stateId) {
        const hit = search(stateId);
        if (hit) return hit;
      } else {
        for (const state of indianStates) {
          const hit = search(state.id);
          if (hit) return hit;
        }
      }
      return '';
    }

    return '';
  } catch (error) {
    console.error('[enquiry-form] Error converting location name/id to ID:', error, { name, type, stateId });
    return '';
  }
}

/**
 * Name/ID -> picker ID, preserving values the picker has never heard of.
 *
 * lib/data/locations.ts is a fixed dataset; production rows predate it and hold
 * free-text that isn't in it (e.g. taluk 'KANAGAGRI' under SALEM, whose taluk
 * list is Salem/Attur/Edappadi/…). Returning '' for those blanked a REQUIRED
 * field, so opening the edit form showed missing data and the only way to save
 * was to pick a different taluk — overwriting the real value. Passing the raw
 * value through keeps it visible, valid and re-savable; getLocationNameById
 * round-trips it back out unchanged.
 */
function getLocationIdByName(
  name: string | undefined,
  type: 'state' | 'district' | 'taluk',
  stateId?: string
): string | undefined {
  if (!name) return '';
  return findKnownLocationId(name, type, stateId) || name;
}

/**
 * Mapping of form fields to their respective tabs
 * Used for auto-switching tabs on validation errors
 */
const fieldToTabMap: Record<string, string> = {
  // Basic Details
  enquiry_date: 'basic-details',
  first_name: 'basic-details',
  last_name: 'basic-details',
  date_of_birth: 'basic-details',
  gender: 'basic-details',
  religion: 'basic-details',
  aadhar_number: 'basic-details',
  blood_group: 'basic-details',
  student_photo_url: 'basic-details',
  // 2026-04-23: admission_year + admission_year_id moved to course-selection
  // tab (sits next to Institution + Program where it belongs semantically).
  admission_year: 'course-selection',
  admission_year_id: 'course-selection',

  // Family (Basic Details)
  father_name: 'basic-details',
  father_occupation: 'basic-details',
  father_mobile: 'basic-details',
  mother_name: 'basic-details',
  mother_occupation: 'basic-details',
  mother_mobile: 'basic-details',
  annual_income: 'basic-details',
  roll_number: 'basic-details',
  register_number: 'basic-details',

  // Academic Information
  last_school: 'academic-information',
  last_school_id: 'academic-information',
  school_district: 'academic-information',
  board_of_study: 'academic-information',
  tenth_marks: 'academic-information',
  twelfth_marks: 'academic-information',
  neet_roll_number: 'academic-information',
  neet_score: 'academic-information',
  medical_cutoff_marks: 'academic-information',
  engineering_cutoff_marks: 'academic-information',
  counseling_applied: 'academic-information',
  counseling_number: 'academic-information',
  scholarship_type: 'academic-information',
  quota_id: 'academic-information',
  entry_type: 'academic-information',

  // Course Selection
  institution_id: 'course-selection',
  degree_id: 'course-selection',
  department_id: 'course-selection',
  program_id: 'course-selection',
  academic_year_id: 'course-selection',
  semester_id: 'course-selection',
  section_id: 'course-selection',
  college_email: 'contact-details',
  regulation_id: 'course-selection',
  batch_id: 'course-selection',

  // Contact Details
  student_mobile: 'contact-details',
  student_email: 'contact-details',
  permanent_address_street: 'contact-details',
  permanent_address_taluk: 'contact-details',
  permanent_address_district: 'contact-details',
  permanent_address_state: 'contact-details',
  permanent_address_pin_code: 'contact-details',
  post_office_id: 'contact-details',

  // Accommodation Preferences
  accommodation_type: 'accommodation-preferences',
  hostel_category_id: 'accommodation-preferences',
  mess_category_id: 'accommodation-preferences',
  bus_required: 'accommodation-preferences',
  transport_route_id: 'accommodation-preferences',
  transport_stop_id: 'accommodation-preferences',
  reference_type: 'accommodation-preferences',
  reference_name: 'accommodation-preferences',
  reference_contact: 'accommodation-preferences',

  // Finance Details
  application_fee: 'finance-details',
  university_reg_fee: 'finance-details',
  fee_structure_type: 'finance-details',
  tuition_fee: 'finance-details',
  hostel_fee: 'finance-details',
  dayscholar_fee: 'finance-details',
  uniform_fee: 'finance-details',
  hospital_training_fee: 'finance-details',
  placement_fee: 'finance-details',
};

// 2026-05-21: human-readable labels keyed by the same field name as
// `fieldToTabMap`. Used by BOTH onInvalid (resolver-time rejection) and
// onSubmit (final-required-fields rejection) so the operator sees the
// SAME specific field list in either path. Previously onInvalid only
// reported a count and onSubmit duplicated this map inline.
const FIELD_LABELS: Record<string, string> = {
  first_name:                 'First Name',
  last_name:                  'Last Name',
  date_of_birth:              'Date of Birth',
  gender:                     'Gender',
  religion:                   'Religion',
  community:                  'Community',
  caste:                      'Caste',
  father_name:                "Father's Name",
  mother_name:                "Mother's Name",
  student_mobile:             'Student Mobile',
  institution_id:             'Institution',
  degree_id:                  'Degree',
  department_id:              'Department',
  program_id:                 'Program',
  admission_year_id:          'Admission Year',
  academic_year_id:           'Academic Year',
  semester_id:                'Semester',
  section_id:                 'Section',
  scholarship_type:           'Scholarship Type',
  entry_type:                 'Entry Type',
  permanent_address_street:   'Street Address',
  permanent_address_taluk:    'Taluk',
  permanent_address_district: 'District',
  permanent_address_state:    'State',
  permanent_address_pin_code: 'PIN Code',
  accommodation_type:         'Accommodation Type',
  hostel_category_id:         'Hostel Room Category',
  mess_category_id:           'Mess Category',
  bus_required:               'Bus Required',
  transport_route_id:         'Route',
  transport_stop_id:          'Boarding Point',
};

// Tab labels keyed by tab id (mirrors ALL_TABS but module-level for use
// in the error-grouping helpers without closing over component state).
const TAB_LABELS: Record<string, string> = {
  'basic-details':            'Basic Details',
  'contact-details':          'Contact Details',
  'course-selection':         'Course Selection',
  'academic-information':     'Academic Information',
  'accommodation-preferences':'Accommodation',
  'finance-details':          'Finance Details',
};

/**
 * Group a set of invalid field paths by their tab.
 * Used by both onInvalid (zod-resolver rejections, where `errors` keys can
 * include dotted nested paths like `tenth_marks.max_marks`) and onSubmit
 * (final-required-fields rejection, where keys are top-level only).
 */
function groupFieldsByTab(fields: string[]): Record<string, string[]> {
  const byTab: Record<string, string[]> = {};
  fields.forEach((field) => {
    // Nested fields (e.g. `tenth_marks.max_marks`) resolve to their root key
    const rootKey = field.split('.')[0];
    const tabId = fieldToTabMap[rootKey] ?? 'unknown';
    const tabLabel = TAB_LABELS[tabId] ?? 'Other';
    const label = FIELD_LABELS[rootKey] ?? rootKey;
    if (!byTab[tabLabel]) byTab[tabLabel] = [];
    if (!byTab[tabLabel].includes(`• ${label}`)) {
      byTab[tabLabel].push(`• ${label}`);
    }
  });
  return byTab;
}

/**
 * Normalize a form UUID value for the API: empty/whitespace → null, otherwise
 * the value as-is. Module-scoped so BOTH formatFormDataForAPI and onSubmit's
 * pre-submit fee-dialog dimension builder can use it (it was previously a local
 * closure inside formatFormDataForAPI, which caused a ReferenceError when
 * onSubmit referenced it).
 */
const formatUUID = (value: string | undefined): string | null => {
  if (!value || value.trim() === '') return null;
  return value;
};

/**
 * EnquiryForm Component
 *
 * Complete multi-step form for learner enquiries
 * Features:
 * - 5 tabs with comprehensive fields
 * - Save draft functionality
 * - Form validation on submit
 * - All admission fields included
 */
export function EnquiryForm({ 
  learner, 
  onSuccess, 
  visibleTabs, 
  onSubmit: onSubmitProp,
  submitLabel,
  hideDraft = false,
  isStudentView = false,
  enforceAdmissionRules = true,
  allowSubmitFromAnyTab = false,
  singleSaveButton = false,
  showTamilNames = false,
  showLearnerIdentifiers = false
}: EnquiryFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [activeTab, setActiveTab] = useState(visibleTabs ? visibleTabs[0] : 'basic-details');
  const [savedEnquiryId, setSavedEnquiryId] = useState<string | null>(learner?.id || null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);

  // Task 15 — per-section student-fill status (sourced from admission_lead_activities)
  type SectionKey = 'basic' | 'academic' | 'contact';
  type SectionStatus = { filled: boolean; filledAt: string | null; filledBy: 'student' | 'admission_override' | null };
  const [sectionStatus, setSectionStatus] = useState<Record<SectionKey, SectionStatus>>({
    basic:    { filled: false, filledAt: null, filledBy: null },
    academic: { filled: false, filledAt: null, filledBy: null },
    contact:  { filled: false, filledAt: null, filledBy: null },
  });

  useEffect(() => {
    const learnerProfileId = savedEnquiryId ?? learner?.id;
    if (!learnerProfileId) return;
    const supabase = createClientSupabaseClient();
    (async () => {
      // Resolve learner_profile_id → admission_leads.id
      const { data: leadRow } = await supabase
        .from('admission_leads')
        .select('id')
        .eq('learner_profile_id', learnerProfileId)
        .maybeSingle();
      if (!leadRow?.id) return;
      const { data: rows } = await supabase
        .from('admission_lead_activities')
        .select('subject, description, created_at')
        .eq('lead_id', leadRow.id)
        .eq('activity_type', 'student_section_filled')
        .order('created_at', { ascending: false });
      if (!rows) return;
      const next: Record<SectionKey, SectionStatus> = {
        basic:    { filled: false, filledAt: null, filledBy: null },
        academic: { filled: false, filledAt: null, filledBy: null },
        contact:  { filled: false, filledAt: null, filledBy: null },
      };
      for (const r of rows) {
        const desc = r.description || '';
        const isOverride = /admission override/i.test(desc);
        const m = desc.match(/Filled (basic|academic|contact)/i);
        const section = m?.[1]?.toLowerCase() as SectionKey | undefined;
        if (!section || !next[section]) continue;
        if (next[section].filled) continue; // keep most recent (already top-sorted)
        next[section] = {
          filled: true,
          filledAt: r.created_at,
          filledBy: isOverride ? 'admission_override' : 'student',
        };
      }
      setSectionStatus(next);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedEnquiryId, learner?.id]);

  // Task 16: override flow — confirm dialog before admission edits a
  // student-fillable section; records the override in the activity log on save.
  // The `canOverrideStudentSection` derived boolean lives further down in the
  // file (after the usePermissions() call at line ~597) — moving it here
  // would create a TDZ ReferenceError because `isSuperAdminUser` etc. are
  // not yet in scope at this depth.
  const [overrideDialog, setOverrideDialog] = useState<'basic' | 'academic' | 'contact' | null>(null);
  const [sectionOverrideMode, setSectionOverrideMode] = useState<{
    basic: boolean; academic: boolean; contact: boolean;
  }>({ basic: false, academic: false, contact: false });

  // ========================================================================
  // Plan 6 / Task 5 — Pre-submit confirmation dialog state.
  // The flow: form submit → check institution's pre_submit_dialog_enabled →
  // if enabled, fetch matrix preview, open dialog, wait for user → confirm
  // calls commitSubmit which runs the existing save path + post-save fee
  // resolution + activity log. If disabled, save proceeds inline.
  // The dialog is bypassed entirely when:
  //   - onSubmitProp is set (custom flows like change-request approval)
  //   - the lead is in legacy_fee_mode (no matrix to preview)
  //   - institution_id is missing (can't look up the setting)
  // ========================================================================
  const [preSubmitOpen, setPreSubmitOpen] = useState(false);
  const [pendingFormValues, setPendingFormValues] = useState<EnquiryFormValues | null>(null);
  const [previewMatch, setPreviewMatch] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [previewItems, setPreviewItems] = useState<ResolvedFeeItem[]>([]);

  const formTabs = visibleTabs
    ? ALL_TABS.filter(tab => visibleTabs.includes(tab.id))
    : ALL_TABS;

  // Admission Year / Academic Year / Section are required only when the tab
  // that renders them is actually reachable (see COURSE_TAB_OPTIONAL above).
  const showsCourseTab = !visibleTabs || visibleTabs.includes('course-selection');

  // Finance tab permission check.
  // BUG-003147/003148/003155/003262: admission_staff had learners.admissions.edit
  // but not learners.finance.edit, so the finance section rendered read-only and
  // admission_staff perceived "saves don't persist". The save itself already passes
  // the RLS UPDATE policy via user_has_permission('learners.admissions.edit'),
  // so the UI gate should accept the same key.
  const { canAccess, isSuperAdmin: isSuperAdminUser, isAdmissionGlobalUser } = usePermissions();
  const canViewFinance =
    isSuperAdminUser || isAdmissionGlobalUser
    || canAccess('learners', 'finance.view')
    || canAccess('learners', 'admissions.view');
  const canEditFinance =
    isSuperAdminUser || isAdmissionGlobalUser
    || canAccess('learners', 'finance.edit')
    || canAccess('learners', 'admissions.edit');
  // Task 16 — derive AFTER usePermissions() is called above, otherwise
  // the references hit a temporal dead zone (the override-state useState
  // calls live earlier in the function body).
  const canOverrideStudentSection =
    isSuperAdminUser
    || isAdmissionGlobalUser
    || canAccess('learners', 'profile.student_section.override') === true;

  // Filter out finance tab if user lacks permission
  const filteredFormTabs = canViewFinance
    ? formTabs
    : formTabs.filter(tab => tab.id !== 'finance-details');

  // Initialize form with all fields
  const form = useForm<EnquiryFormValues>({
    resolver: zodResolver(
      showsCourseTab ? enquiryFormSchema : relaxedFormSchema,
    ) as Resolver<EnquiryFormValues>,
    defaultValues: learner
      ? (() => {
          console.log('[enquiry-form] Loading learner data:', {
            id: learner.id,
            name: `${learner.first_name} ${learner.last_name}`,
            lifecycle_status: learner.lifecycle_status,
            institution_id: learner.institution_id,
            degree_id: learner.degree_id,
            department_id: learner.department_id,
            program_id: learner.program_id,
            academic_year_id: learner.academic_year_id,
            semester_id: learner.semester_id,
            section_id: learner.section_id,
            tenth_marks: learner.tenth_marks,
            twelfth_marks: learner.twelfth_marks,
          });
          return {
          // Basic Details
          enquiry_date: learner.enquiry_date || new Date().toISOString().split('T')[0],
          first_name: learner.first_name || '',
          last_name: learner.last_name || '',
          // NULL is the normal state for these columns — coerce to '' so the
          // controlled Input never flips to uncontrolled on an un-backfilled row.
          first_name_tamil: learner.first_name_tamil || '',
          last_name_tamil: learner.last_name_tamil || '',
          abc_id: learner.abc_id || '',
          emis: learner.emis || '',
          umis: learner.umis || '',
          date_of_birth: learner.date_of_birth || '',
          gender: (learner.gender || undefined) as 'Male' | 'Female' | 'Other' | undefined,
          religion: learner.religion || '',
          community_category_id: learner.community_category_id || '',
          caste_id: learner.caste_id || '',
          aadhar_number: learner.aadhar_number || '',
          blood_group: learner.blood_group || '',
          student_photo_url: learner.student_photo_url || '',
          admission_year: learner.admission_year || undefined,
          admission_year_id: learner.admission_year_id || '',

          // Family
          father_name: learner.father_name || '',
          father_occupation: learner.father_occupation || '',
          father_mobile: learner.father_mobile || '',
          mother_name: learner.mother_name || '',
          mother_occupation: learner.mother_occupation || '',
          mother_mobile: learner.mother_mobile || '',
          annual_income: learner.annual_income || '',

          // Academic
          last_school: learner.last_school || '',
          last_school_id: learner.last_school_id || '',
          school_district: learner.school_district || '',
          board_of_study: learner.board_of_study?.toLowerCase().replace(/\s+/g, '_') || '',
          tenth_marks: {
            max_marks: learner.tenth_marks?.max_marks ? String(learner.tenth_marks.max_marks) : '',
            obtained_marks: learner.tenth_marks?.obtained_marks ? String(learner.tenth_marks.obtained_marks) : '',
            percentage: learner.tenth_marks?.percentage ? String(learner.tenth_marks.percentage) : '',
          },
          twelfth_marks: {
            group: normalizeGroupValue(learner.twelfth_marks?.group),
            max_marks: learner.twelfth_marks?.max_marks ? String(learner.twelfth_marks.max_marks) : '',
            obtained_marks: learner.twelfth_marks?.obtained_marks ? String(learner.twelfth_marks.obtained_marks) : '',
            percentage: learner.twelfth_marks?.percentage ? String(learner.twelfth_marks.percentage) : '',
            subjects: {
              physics: learner.twelfth_marks?.subjects?.physics ? String(learner.twelfth_marks.subjects.physics) : '',
              chemistry: learner.twelfth_marks?.subjects?.chemistry ? String(learner.twelfth_marks.subjects.chemistry) : '',
              mathematics: learner.twelfth_marks?.subjects?.mathematics ? String(learner.twelfth_marks.subjects.mathematics) : '',
              biology: learner.twelfth_marks?.subjects?.biology ? String(learner.twelfth_marks.subjects.biology) : '',
              botany: learner.twelfth_marks?.subjects?.botany ? String(learner.twelfth_marks.subjects.botany) : '',
              zoology: learner.twelfth_marks?.subjects?.zoology ? String(learner.twelfth_marks.subjects.zoology) : '',
              computer_science: learner.twelfth_marks?.subjects?.computer_science ? String(learner.twelfth_marks.subjects.computer_science) : '',
              accountancy: learner.twelfth_marks?.subjects?.accountancy ? String(learner.twelfth_marks.subjects.accountancy) : '',
              commerce: learner.twelfth_marks?.subjects?.commerce ? String(learner.twelfth_marks.subjects.commerce) : '',
              economics: learner.twelfth_marks?.subjects?.economics ? String(learner.twelfth_marks.subjects.economics) : '',
              statistics: learner.twelfth_marks?.subjects?.statistics ? String(learner.twelfth_marks.subjects.statistics) : '',
              history: learner.twelfth_marks?.subjects?.history ? String(learner.twelfth_marks.subjects.history) : '',
              geography: learner.twelfth_marks?.subjects?.geography ? String(learner.twelfth_marks.subjects.geography) : '',
            },
          },
          neet_roll_number: learner.neet_roll_number || '',
          neet_score: learner.neet_score || '',
          medical_cutoff_marks: learner.medical_cutoff_marks || '',
          engineering_cutoff_marks: learner.engineering_cutoff_marks || '',
          counseling_applied: learner.counseling_applied || false,
          counseling_number: learner.counseling_number || '',
          scholarship_type: learner.scholarship_type || '',
          quota_id: (learner as { quota_id?: string }).quota_id || '',
          entry_type: learner.entry_type || '',

          // Course Selection
          institution_id: (() => {
            const id = learner.institution_id || '';
            console.log('[enquiry-form] Institution ID:', id);
            return id;
          })(),
          degree_id: (() => {
            const id = learner.degree_id || '';
            console.log('[enquiry-form] Degree ID:', id);
            return id;
          })(),
          department_id: (() => {
            const id = learner.department_id || '';
            console.log('[enquiry-form] Department ID:', id);
            return id;
          })(),
          program_id: (() => {
            const id = learner.program_id || '';
            console.log('[enquiry-form] Program ID:', id);
            return id;
          })(),
          academic_year_id: (() => {
            const id = learner.academic_year_id || '';
            console.log('[enquiry-form] Academic Year ID:', id);
            return id;
          })(),
          semester_id: (() => {
            const id = learner.semester_id || '';
            console.log('[enquiry-form] Semester ID:', id);
            return id;
          })(),
          section_id: (() => {
            const id = learner.section_id || '';
            console.log('[enquiry-form] Section ID:', id);
            return id;
          })(),
          roll_number: learner.roll_number || '',
          register_number: learner.register_number || '',
          college_email: learner.college_email || '',
          regulation_id: learner.regulation_id || '',
          batch_id: learner.batch_id || '',
          learner_type: learner.learner_type || undefined,

          // Contact - Convert location names back to IDs for editing
          student_mobile: learner.student_mobile || '',
          student_email: learner.student_email || '',
          permanent_address_street: learner.permanent_address_street || '',
          permanent_address_state: (() => {
            const stateId = getLocationIdByName(learner.permanent_address_state, 'state');
            return stateId || '';
          })(),
          permanent_address_district: (() => {
            const districtId = getLocationIdByName(learner.permanent_address_district, 'district');
            return districtId || '';
          })(),
          permanent_address_taluk: (() => {
            const stateId = getLocationIdByName(learner.permanent_address_state, 'state');
            const talukId = getLocationIdByName(learner.permanent_address_taluk, 'taluk', stateId);
            return talukId || '';
          })(),
          permanent_address_pin_code: learner.permanent_address_pin_code || '',
          post_office_id: learner.post_office_id || '',

          // Accommodation
          accommodation_type: learner.accommodation_type || '',
          hostel_category_id: learner.hostel_category_id || undefined,
          mess_category_id: learner.mess_category_id || undefined,
          bus_required: learner.bus_required ?? undefined,
          transport_route_id: learner.transport_route_id || undefined,
          transport_stop_id: learner.transport_stop_id || undefined,
          reference_type: normalizeReferenceType(learner.reference_type),
          reference_name: learner.reference_name || '',
          reference_contact: learner.reference_contact || '',

          // Finance Details
          application_fee: learner?.application_fee ?? null,
          university_reg_fee: learner?.university_reg_fee ?? null,
          fee_structure_type: learner?.fee_structure_type ?? null,
          tuition_fee: learner?.tuition_fee ?? null,
          hostel_fee: learner?.hostel_fee ?? null,
          dayscholar_fee: learner?.dayscholar_fee ?? null,
          uniform_fee: learner?.uniform_fee ?? null,
          hospital_training_fee: learner?.hospital_training_fee ?? null,
          placement_fee: learner?.placement_fee ?? null,
          fee_items: Array.isArray((learner as any)?.fee_items)
            ? ((learner as any).fee_items as Array<any>).map((it) => ({
                category_id: it?.category_id ?? '',
                category_name: it?.category_name ?? '',
                amount: Number(it?.amount ?? 0),
              }))
            : [],
        };
        })()
      : {
          // Basic Details
          enquiry_date: new Date().toISOString().split('T')[0], // Auto-populate with today's date
          first_name: '',
          last_name: '',
          first_name_tamil: '',
          last_name_tamil: '',
          abc_id: '',
          emis: '',
          umis: '',
          date_of_birth: '',
          gender: undefined,
          religion: '',
          community_category_id: '',
          caste_id: '',
          aadhar_number: '',
          blood_group: '',
          student_photo_url: '',
          admission_year: undefined,
          admission_year_id: '',

          // Family
          father_name: '',
          father_occupation: '',
          father_mobile: '',
          mother_name: '',
          mother_occupation: '',
          mother_mobile: '',
          annual_income: '',

          // Academic
          last_school: '',
          last_school_id: '',
          school_district: '',
          board_of_study: '',
          tenth_marks: {
            max_marks: '',
            obtained_marks: '',
            percentage: '',
          },
          twelfth_marks: {
            group: '',
            max_marks: '',
            obtained_marks: '',
            percentage: '',
            subjects: {
              physics: '',
              chemistry: '',
              mathematics: '',
              biology: '',
              botany: '',
              zoology: '',
              computer_science: '',
              accountancy: '',
              commerce: '',
              economics: '',
              statistics: '',
              history: '',
              geography: '',
            },
          },
          neet_roll_number: '',
          neet_score: '',
          medical_cutoff_marks: '',
          engineering_cutoff_marks: '',
          counseling_applied: false,
          counseling_number: '',
          scholarship_type: '',
          quota_id: '',
          entry_type: '',

          // Course Selection
          institution_id: '',
          degree_id: '',
          department_id: '',
          program_id: '',
          academic_year_id: '',
          semester_id: '',
          section_id: '',
          roll_number: '',
          register_number: '',
          college_email: '',
          regulation_id: '',
          batch_id: '',

          // Contact
          student_mobile: '',
          student_email: '',
          permanent_address_street: '',
          permanent_address_taluk: '',
          permanent_address_district: '',
          permanent_address_state: '',
          permanent_address_pin_code: '',
          post_office_id: '',

          // Accommodation
          accommodation_type: '',
          hostel_category_id: undefined,
          mess_category_id: undefined,
          bus_required: undefined,
          transport_route_id: undefined,
          transport_stop_id: undefined,
          reference_type: '',
          reference_name: '',
          reference_contact: '',

          // Finance Details
          application_fee: null,
          university_reg_fee: null,
          fee_structure_type: null,
          tuition_fee: null,
          hostel_fee: null,
          dayscholar_fee: null,
          uniform_fee: null,
          hospital_training_fee: null,
          placement_fee: null,
          fee_items: [],
        },
  });

  // ============================================
  // SCROLL TO TOP ON TAB CHANGE
  // ============================================
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  // ============================================
  // NAVIGATION FUNCTIONS
  // ============================================
  const currentTabIndex = filteredFormTabs.findIndex((tab) => tab.id === activeTab);
  const isFirstTab = currentTabIndex === 0;
  const isLastTab = currentTabIndex === filteredFormTabs.length - 1;

  const goToNextTab = () => {
    if (!isLastTab) {
      setActiveTab(filteredFormTabs[currentTabIndex + 1].id);
    }
  };

  const goToPreviousTab = () => {
    if (!isFirstTab) {
      setActiveTab(filteredFormTabs[currentTabIndex - 1].id);
    }
  };

  // ============================================
  // DRAFT MANAGEMENT
  // ============================================

  // Format form data with default values for required fields
  const formatFormDataForAPI = async (values: EnquiryFormValues) => {
    // formatUUID is now a module-level helper (see top of file) so onSubmit's
    // pre-submit fee-dialog dimension builder can share it. It returns null for
    // empty strings so the DB column is explicitly cleared rather than the key
    // being stripped by JSON.stringify (which would leave the stale value).

    // Helper to convert personal details to uppercase (except email fields)
    const toUpperCaseField = (value: string | undefined) => {
      if (!value || value.trim() === '') return undefined;
      return value.trim().toUpperCase();
    };

    // Helper to convert location IDs to names for database storage (uppercase)
    const getLocationNameById = (
      id: string | undefined,
      type: 'state' | 'district' | 'taluk',
      stateId?: string,
      districtId?: string
    ): string | undefined => {
      if (!id) return undefined;

      let name: string | undefined;

      if (type === 'state') {
        // Use already imported location data
        name = indianStates.find((s: any) => s.id === id)?.name;
      } else if (type === 'district') {
        if (stateId) {
          const districts = getDistrictsByState(stateId);
          name = districts.find((d: any) => d.id === id)?.name;
        }
      } else if (type === 'taluk') {
        if (stateId && districtId) {
          const taluks = getTaluksByDistrict(stateId, districtId);
          name = taluks.find((t: any) => t.id === id)?.name;
        }
      }

      // No match means the form is carrying a raw stored value the picker
      // doesn't know (see getLocationIdByName). Write it back as-is instead of
      // undefined, which would blank the column on every unrelated edit.
      return (name || id).toUpperCase();
    };

    // accommodation_type TEXT is retired — resolve the HOSTEL/DAY SCHOLAR choice
    // to the global accommodation_types FK and persist that instead.
    let accommodationTypeId: string | null = null;
    if (values.accommodation_type) {
      try {
        const accommodations = await LookupService.listAccommodationTypes(true);
        const norm = String(values.accommodation_type).trim().toLowerCase();
        accommodationTypeId =
          accommodations.find(
            (a) => a.code.toLowerCase() === norm || a.name.toLowerCase() === norm,
          )?.id ?? null;
      } catch (err) {
        console.error('[enquiry-form] accommodation TEXT→FK resolution failed:', err);
      }
    }

    return {
      // Basic Details (string fields - NOT NULL) - Convert to UPPERCASE
      first_name: toUpperCaseField(values.first_name) || '',
      last_name: toUpperCaseField(values.last_name),
      // Tamil names are written ONLY by the screens that render the inputs.
      // Two deliberate differences from the fields above:
      //  1. No toUpperCaseField — Tamil script is caseless, and .toUpperCase()
      //     on a grapheme cluster risks mangling combining vowel signs.
      //  2. Spread-gated on showTamilNames, so a flow that never shows the
      //     inputs (enquiries, student self-fill) omits the keys entirely and
      //     cannot blank a Tamil name captured elsewhere. When the inputs ARE
      //     shown, a cleared box sends null so it can genuinely be erased.
      ...(showTamilNames
        ? {
            first_name_tamil: values.first_name_tamil?.trim() || null,
            last_name_tamil: values.last_name_tamil?.trim() || null,
          }
        : {}),
      // Same spread-gate as the Tamil names: a flow that never renders these
      // inputs omits the keys entirely and so cannot blank an identifier
      // captured elsewhere. Upper-cased + whitespace-stripped to match what
      // IdentifierField normalises to on blur, in case a value reached form
      // state some other way (autofill, restored draft).
      ...(showLearnerIdentifiers
        ? {
            abc_id: values.abc_id?.replace(/\s+/g, '').toUpperCase() || null,
            emis: values.emis?.replace(/\s+/g, '').toUpperCase() || null,
            umis: values.umis?.replace(/\s+/g, '').toUpperCase() || null,
          }
        : {}),
      date_of_birth: values.date_of_birth || '',
      // NOT toUpperCaseField: gender is Title Case per learners_profiles_gender_check.
      gender: values.gender || '',
      religion: toUpperCaseField(values.religion) || '',
      // FK source of truth; community/caste TEXT are auto-filled by the DB
      // shadow trigger (sync_learner_community_caste_text) from these ids.
      community_category_id: formatUUID(values.community_category_id) || null,
      caste_id: formatUUID(values.caste_id) || null,
      aadhar_number: values.aadhar_number || undefined,
      blood_group: values.blood_group || undefined,
      student_photo_url: values.student_photo_url || undefined,
      // 2026-05-02 (Phase D): integer admission_year column dropped. Only the
      // FK is written. course-selection.tsx still keeps the integer in form
      // state for display/validation purposes, but it never reaches the DB.
      admission_year_id: formatUUID(values.admission_year_id),
      enquiry_date: values.enquiry_date || undefined,

      // Family Information (NOT NULL fields) - Convert to UPPERCASE
      father_name: toUpperCaseField(values.father_name) || '',
      father_occupation: toUpperCaseField(values.father_occupation),
      father_mobile: values.father_mobile || '',
      mother_name: toUpperCaseField(values.mother_name) || '',
      mother_occupation: toUpperCaseField(values.mother_occupation),
      mother_mobile: values.mother_mobile || '',
      annual_income: values.annual_income || undefined,

      // Academic Information (NOT NULL fields) - Convert to UPPERCASE
      last_school: toUpperCaseField(values.last_school) || '',
      // school_master link — blank → undefined so '' never reaches the uuid column.
      // school_district keeps the master's casing so the district dropdown
      // re-matches on edit (do NOT uppercase it).
      last_school_id: formatUUID(values.last_school_id || undefined),
      school_district: values.school_district || undefined,
      board_of_study: toUpperCaseField(values.board_of_study) || '',
      tenth_marks: values.tenth_marks || {
        max_marks: '',
        obtained_marks: '',
        percentage: '',
      },
      twelfth_marks: values.twelfth_marks || {
        group: '',
        max_marks: '',
        obtained_marks: '',
        percentage: '',
        subjects: {},
      },
      medical_cutoff_marks: values.medical_cutoff_marks || undefined,
      engineering_cutoff_marks: values.engineering_cutoff_marks || undefined,
      neet_roll_number: values.neet_roll_number || undefined,
      neet_score: values.neet_score || undefined,
      counseling_applied: values.counseling_applied || undefined,
      counseling_number: values.counseling_number || undefined,
      scholarship_type: values.scholarship_type || undefined,
      quota_id: formatUUID(values.quota_id),
      entry_type: values.entry_type || '',

      // Course Selection (UUID fields - must be undefined if empty)
      institution_id: formatUUID(values.institution_id),
      degree_id: formatUUID(values.degree_id),
      department_id: formatUUID(values.department_id),
      program_id: formatUUID(values.program_id),
      academic_year_id: formatUUID(values.academic_year_id),
      semester_id: formatUUID(values.semester_id),
      section_id: formatUUID(values.section_id),
      regulation_id: formatUUID(values.regulation_id),
      batch_id: formatUUID(values.batch_id),
      roll_number: values.roll_number || undefined,
      register_number: values.register_number || undefined,
      college_email: values.college_email || undefined,
      // BUG-003157: the old `values.learner_type || undefined` dropped the field
      // when HOD tried to clear the value (empty string → undefined → column
      // untouched). Distinguish "not in form state" (undefined) from "explicit
      // empty" (send null) so clearing sticks.
      learner_type:
        values.learner_type === undefined
          ? undefined
          : (values.learner_type as 'regular' | 'irregular' | 'intern' | null) || null,

      // Contact Details (NOT NULL fields)
      student_mobile: values.student_mobile || '',
      student_email: values.student_email || '', // Keep email lowercase
      permanent_address_street: toUpperCaseField(values.permanent_address_street) || '',
      permanent_address_taluk: getLocationNameById(
        values.permanent_address_taluk,
        'taluk',
        values.permanent_address_state,
        values.permanent_address_district
      ) || undefined,
      permanent_address_district: getLocationNameById(
        values.permanent_address_district,
        'district',
        values.permanent_address_state
      ) || '',
      permanent_address_pin_code: values.permanent_address_pin_code || '',
      // Blank → null so '' never reaches the uuid column (22P02)
      post_office_id: formatUUID(values.post_office_id || undefined),
      permanent_address_state: getLocationNameById(
        values.permanent_address_state,
        'state'
      ) || '',

      // Accommodation Preferences — accommodation_type TEXT retired; persist the
      // resolved institution-scoped FK only.
      accommodation_type_id: accommodationTypeId,
      // Nullable UUID FKs — normalize '' → null so an unset dropdown doesn't
      // send the empty string as a uuid param (Postgres 22P02).
      hostel_category_id: values.hostel_category_id || null,
      mess_category_id: values.mess_category_id || null,
      // Transport (Day Scholar). bus_required is a real boolean; the FK UUIDs
      // normalize '' → null so an unset dropdown doesn't send '' (Postgres 22P02).
      bus_required: values.bus_required ?? null,
      transport_route_id: values.transport_route_id || null,
      transport_stop_id: values.transport_stop_id || null,
      reference_type: values.reference_type || undefined,
      reference_name: toUpperCaseField(values.reference_name),
      reference_contact: values.reference_contact || undefined,

      // Finance Details - LEGACY columns preserved on edit; new flow writes fee_items.
      application_fee: values.application_fee ?? null,
      university_reg_fee: values.university_reg_fee ?? null,
      fee_structure_type: values.fee_structure_type ?? null,
      tuition_fee: values.tuition_fee ?? null,
      hostel_fee: values.hostel_fee ?? null,
      dayscholar_fee: null, // DEPRECATED
      uniform_fee: values.uniform_fee ?? null,
      hospital_training_fee: values.hospital_training_fee ?? null,
      placement_fee: values.placement_fee ?? null,

      // Updated: 2026-04-15 - Dynamic fee line items persisted as JSONB array.
      fee_items: Array.isArray(values.fee_items)
        ? values.fee_items
            .filter((it: any) => it?.category_id)
            .map((it: any) => ({
              category_id: String(it.category_id),
              category_name: String(it.category_name ?? ''),
              amount: Number(it.amount ?? 0),
            }))
        : [],

      // System fields. On CREATE, seed the entry-point status.
      // 2026-05-20: Updated default from 'admitted' (old entry-point) to 'enquiry'.
      // On EDIT, never resend it: this function builds a FULL-ROW payload, so
      // shipping lifecycle_status made every routine field edit rewrite the
      // learner's status, and `|| 'enquiry'` would silently demote any learner
      // whose status failed to load. Status transitions belong to the explicit
      // status actions (row-actions / enquiry-status-update), not to a field
      // edit. Auto-activation is unaffected — the service reads the status back
      // off the updated row, not off this DTO.
      ...(learner ? {} : { lifecycle_status: 'enquiry' as const }),
      is_profile_complete: learner?.is_profile_complete ?? false,
    };
  };

  // Save & Next - Save current progress and move to next tab
  const handleSaveAndNext = async () => {
    // Prevent double-click
    if (isSavingDraft || isSubmitting) {
      return;
    }

    setIsSavingDraft(true);
    try {
      const values = form.getValues();
      const data = await formatFormDataForAPI(values);

      let result: LearnerProfile;

      if (savedEnquiryId) {
        // Update existing draft
        result = await LearnerProfileService.updateLearnerProfile(savedEnquiryId, data);
        toast.success('Progress saved successfully');
      } else {
        // Create new draft
        result = await LearnerProfileService.createLearnerProfile(data as any);
        setSavedEnquiryId(result.id);
        toast.success('Progress saved successfully');
          
      }

      // Move to next tab if not on last tab
      if (!isLastTab) {
        goToNextTab();
      }
    } catch (error) {
      console.error('[enquiry-form] Error saving progress:', error);
      toast.error(errorMessage(error, 'Failed to save progress'));
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Save draft (without validation). On the create wizard this stays on the
  // current page; when editing an existing record it is the "Update" button and
  // must complete the save (see the onSuccess hand-off at the end).
  const handleSaveDraft = async () => {
    // Prevent double-click
    if (isSavingDraft || isSubmitting) {
      return;
    }

    setIsSavingDraft(true);
    try {
      const values = form.getValues();

      // A queued photo has to be uploaded here too, not just on the final
      // submit path. On an edit surface this IS the save button, so leaving the
      // upload out meant picking a new photo and pressing Update discarded it
      // with no error. Non-blocking, exactly as commitSubmit treats it: a
      // failed upload must not throw away every other field the user changed.
      if (pendingImageFile) {
        try {
          const imageUrl = await uploadProfileImage(pendingImageFile);
          values.student_photo_url = imageUrl;
          form.setValue('student_photo_url', imageUrl);
          setPendingImageFile(null);
        } catch (err) {
          console.error('[enquiry-form] Image upload failed during save:', err);
          toast.error('Photo could not be uploaded — saving the other changes without it.');
        }
      }

      const data = await formatFormDataForAPI(values);

      let result: LearnerProfile;

      if (savedEnquiryId) {
        // Update existing draft
        result = await LearnerProfileService.updateLearnerProfile(savedEnquiryId, data);
        toast.success(learner ? 'Enquiry updated successfully' : 'Progress saved successfully');
      } else {
        // Create new draft
        result = await LearnerProfileService.createLearnerProfile(data as any);
        setSavedEnquiryId(result.id);
        toast.success('Progress saved successfully');
      }

      // Editing an existing record: hand off to onSuccess. It is the ONLY hook
      // that invalidates learnerProfileKeys.detail/lists and calls
      // router.refresh(), and the row is already written by the time we get
      // here — but with staleTime 5min and refetchOnWindowFocus off, skipping
      // it left the detail page and a re-opened edit form showing the pre-edit
      // course/program, so a successful save looked like it did nothing. This
      // was the reported "I click Update and it still doesn't update".
      //
      // Gated on `learner`, NOT on savedEnquiryId: mid-wizard the create flow
      // also has a savedEnquiryId, and onSuccess redirects — firing it there
      // would throw the operator out of the form on the first "Save Draft".
      if (learner && onSuccess) {
        onSuccess(result);
      }
    } catch (error) {
      console.error('[enquiry-form] Error saving draft:', error);
      toast.error(errorMessage(error, 'Failed to save progress'));
    } finally {
      setIsSavingDraft(false);
    }
  };

  // ============================================
  // CANCEL WITH DRAFT DELETION
  // ============================================
  const handleCancelClick = () => {
    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    try {
      // Delete draft if exists
      if (savedEnquiryId && !learner) {
        await LearnerProfileService.deleteLearnerProfile(savedEnquiryId);
        toast.success('Draft discarded');
      }
      router.push('/learners/enquiries');
    } catch (error) {
      console.error('[enquiry-form] Error canceling:', error);
      toast.error('Error canceling form');
    }
  };

  // Handle form validation errors (triggered by react-hook-form)
  // 2026-05-21: rewritten so the operator sees WHICH fields are missing,
  // grouped by tab, instead of just "Found N errors". Also auto-switches
  // to the first error tab AND focuses the first invalid field (after a
  // microtask so the Tabs switch lands first).
  const onInvalid = (errors: FieldErrors<EnquiryFormValues>) => {
    const errorKeys = Object.keys(errors);
    if (errorKeys.length === 0) return;

    const firstErrorField = errorKeys[0];
    const rootKey = firstErrorField.split('.')[0];
    const tabId =
      fieldToTabMap[firstErrorField] ?? fieldToTabMap[rootKey];

    if (tabId) {
      setActiveTab(tabId);
    }

    // Focus the first invalid field after the Tabs switch settles.
    // setFocus is a no-op if the input isn't registered yet, so the
    // setTimeout gives React a tick to mount the newly-visible tab.
    setTimeout(() => {
      try {
        form.setFocus(firstErrorField as any);
        // Best-effort scrollIntoView for the field's label (the input is
        // often a Select trigger; scrolling its container is more useful
        // than scrolling the input itself).
        const el = document.querySelector(
          `[name="${firstErrorField}"], [id="${firstErrorField}"]`,
        );
        if (el && 'scrollIntoView' in el) {
          (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (e) {
        console.warn('[enquiry-form] could not focus invalid field', firstErrorField, e);
      }
    }, 50);

    const errorsByTab = groupFieldsByTab(errorKeys);
    const errorMessage = Object.entries(errorsByTab)
      .map(([tab, fields]) => `${tab}:\n${fields.join('\n')}`)
      .join('\n\n');

    console.log('[enquiry-form] Validation failed (onInvalid):', {
      keys: errorKeys,
      errors,
      errorsByTab,
    });

    toast.error(
      `Please fill in the following required fields:\n\n${errorMessage}`,
      {
        duration: 8000,
        style: {
          maxWidth: '500px',
          whiteSpace: 'pre-line',
        },
      },
    );
  };

  // ========================================================================
  // Plan 6 / Task 5 — commitSubmit
  // The actual save path. Used by both the inline (no-dialog) submit and the
  // pre-submit dialog's onConfirm callback. After save it best-effort calls
  // FeeResolutionService.resolveForLearner + logs enquiry.fee_resolved or
  // enquiry.fee_match_failed (only when not delegated to onSubmitProp and
  // not in legacy mode).
  // ========================================================================
  const commitSubmit = async (values: EnquiryFormValues) => {
    setIsSubmitting(true);
    try {
      // Upload pending image file first (if exists). Non-blocking: a failed
      // photo upload previously aborted the whole submit via an early return,
      // which silently discarded every other field the user had filled in —
      // the reported "can't add learner manually" bug. Now it just proceeds
      // without a photo; the learner can add one later from Edit.
      if (pendingImageFile) {
        console.log('[enquiry-form] Uploading pending image file...');
        try {
          const imageUrl = await uploadProfileImage(pendingImageFile);
          values.student_photo_url = imageUrl; // Update form value with uploaded URL
          console.log('[enquiry-form] Image uploaded successfully:', imageUrl);
          toast.success('Image uploaded successfully');
        } catch (error) {
          console.error('[enquiry-form] Image upload failed:', error);
          toast.error('Photo could not be uploaded — saving without it. You can add a photo later from Edit.');
        }
      }

      const data = await formatFormDataForAPI(values);

      // Allow overriding submission logic (e.g. for change requests)
      if (onSubmitProp) {
        console.log('[enquiry-form] Using custom onSubmit handler');
        await onSubmitProp(data);
        setIsSubmitting(false);
        return;
      }

      let result: LearnerProfile;

      if (learner) {
        result = await LearnerProfileService.updateLearnerProfile(learner.id, data);
        const isProfile = ['active', 'inactive', 'graduated', 'exited'].includes(learner.lifecycle_status);
        toast.success(isProfile ? 'Profile updated successfully' : 'Admitted updated successfully');
      } else if (savedEnquiryId) {
        // Update existing draft with final submission
        result = await LearnerProfileService.updateLearnerProfile(savedEnquiryId, data);
        toast.success('Admitted submitted successfully');
      } else {
        result = await LearnerProfileService.createLearnerProfile(data as any);
        toast.success('Admitted created successfully');
      }

      // Check if user account was created
      // @ts-expect-error - Temporary metadata from service
      const userCreation = result._userCreation;
      if (userCreation) {
        if (userCreation.success) {
          toast.success(userCreation.message, { duration: 5000 });
        } else {
          toast.error(`User creation failed: ${userCreation.message}`, { duration: 5000 });
        }
      }

      // Post-save: resolve fee_items + log activity. Two paths now:
      //   (a) Legacy + admitted + all 8 fee-matrix dims present →
      //       admission_adopt_structure_for_lead (flips legacy_fee_mode=false
      //       AND resolves atomically). This is the "Fees Setup Pending" tab
      //       flow — the row falls out of that tab on success.
      //   (b) Already matrix-driven (!legacy) → existing resolveForLearner.
      // Both wrapped so failures don't block submit (best-effort).
      const isLegacy =
        (result as { legacy_fee_mode?: boolean } | undefined)?.legacy_fee_mode ?? false;
      // 2026-05-20: Entry-point status renamed admitted → enquiry. Backfill flow
      // also catches enquiry_submitted (learner self-filled the form).
      const entryStatus = (result as { lifecycle_status?: string } | undefined)?.lifecycle_status;
      const isAtEntry = entryStatus === 'enquiry' || entryStatus === 'enquiry_submitted';
      const missingFeeDims = getMissingFeeDimensions(result as any);
      const hasAllFeeDims = missingFeeDims.length === 0;

      if (result?.id && canViewFinance) {
        if (isLegacy && isAtEntry && hasAllFeeDims) {
          // Path (a): adopt structure flow
          try {
            const adoption = await FeeResolutionService.adoptStructureForLead(result.id);
            toast.success(
              `Fee structure applied — ${adoption.itemCount} item${adoption.itemCount === 1 ? '' : 's'}, total ₹${adoption.total.toLocaleString('en-IN')}`,
              { duration: 5000 },
            );
            await logActivityForCurrentUser({
              actionType: 'enquiry.fee_resolved',
              resourceType: 'learner',
              resourceId: result.id,
              description: AdmissionFeesActivityTemplates.enquiry.fee_resolved(
                adoption.itemCount,
                adoption.total,
              ),
              metadata: {
                learner_id: result.id,
                count: adoption.itemCount,
                total: adoption.total,
                via: 'adopt_structure_for_lead',
              },
            });
          } catch (err) {
            const msg = getErrorMessage(err);
            if (msg.includes('adopt_structure_no_match')) {
              toast(
                'Profile saved. No matching fee structure for this combination — create one in Settings → Fees Structure.',
                { duration: 6000, icon: '⚠️' },
              );
              await logActivityForCurrentUser({
                actionType: 'enquiry.fee_match_failed',
                resourceType: 'learner',
                resourceId: result.id,
                description: AdmissionFeesActivityTemplates.enquiry.fee_match_failed(),
                metadata: { learner_id: result.id, via: 'adopt_structure_for_lead' },
              });
            } else if (msg.includes('permission_denied')) {
              toast.error(
                "Profile saved, but you don't have permission to apply fee structures. Ask an admin.",
                { duration: 6000 },
              );
            } else {
              console.error('[enquiry-form] Adopt structure failed:', err);
              toast.error('Profile saved, but fee structure could not be applied.');
            }
          }
        } else if (isLegacy && isAtEntry) {
          // Saved but still incomplete — explicit "we know, here's why" toast
          toast(
            `Profile saved. Fee structure will be applied once the following ${missingFeeDims.length === 1 ? 'field is' : 'fields are'} filled.`,
            { duration: 6000, icon: 'ℹ️' },
          );
        } else if (!isLegacy) {
          // Path (b): existing matrix-driven resolve
          try {
            const resolution = await FeeResolutionService.resolveForLearner(result.id);
            if (resolution.matched) {
              await logActivityForCurrentUser({
                actionType: 'enquiry.fee_resolved',
                resourceType: 'learner',
                resourceId: result.id,
                description: AdmissionFeesActivityTemplates.enquiry.fee_resolved(
                  resolution.items.length,
                  resolution.total,
                ),
                metadata: {
                  learner_id: result.id,
                  count: resolution.items.length,
                  total: resolution.total,
                },
              });
            } else {
              await logActivityForCurrentUser({
                actionType: 'enquiry.fee_match_failed',
                resourceType: 'learner',
                resourceId: result.id,
                description: AdmissionFeesActivityTemplates.enquiry.fee_match_failed(),
                metadata: { learner_id: result.id },
              });
            }
          } catch (err) {
            console.error('[enquiry-form] Post-save fee resolution failed:', err);
            // best-effort — never block submit on this
          }
        }
      }

      // Clear pending image after successful submission
      setPendingImageFile(null);

      // Task 16: write override audit rows for any section edited under override mode
      const overriddenSections = (Object.keys(sectionOverrideMode) as Array<'basic' | 'academic' | 'contact'>)
        .filter((s) => sectionOverrideMode[s]);
      if (overriddenSections.length > 0 && result?.id) {
        try {
          const supabase = createClientSupabaseClient();
          const { data: leadRow } = await supabase
            .from('admission_leads')
            .select('id')
            .eq('learner_profile_id', result.id)
            .maybeSingle();
          if (leadRow?.id) {
            const rows = overriddenSections.map((s) => ({
              lead_id: leadRow.id,
              activity_type: 'student_section_filled',
              subject: `Admission override — ${s} section`,
              description: `Filled ${s} section as admission override`,
            }));
            await supabase.from('admission_lead_activities').insert(rows);
          }
        } catch (err) {
          console.error('[enquiry-form] Override audit log write failed:', err);
          // best-effort — never block save on this
        }
        setSectionOverrideMode({ basic: false, academic: false, contact: false });
      }

      // Auto-log this admission-officer save as a 'manual_edit' activity so
      // the Activities tab timeline has a complete audit trail. Routes through
      // the same /activities API endpoint that the notes-and-memo capture
      // panel uses — server-side permission gating + service-role write.
      // Best-effort: a 403 from a role without the .create permission, or a
      // network error, never blocks the save.
      if (result?.id) {
        try {
          await fetch(
            `/api/admission/enquiries/${encodeURIComponent(result.id)}/activities`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                activity_type: 'manual_edit',
                subject: 'Profile updated by admission officer',
                note: 'Enquiry details were edited via the admission form.',
              }),
            },
          );
        } catch (err) {
          console.error('[enquiry-form] manual_edit activity log failed:', err);
        }
      }

      if (onSuccess) {
        onSuccess(result);
      } else {
        router.push(`/learners/enquiries/${result.id}`);
      }
    } catch (error) {
      console.error('[enquiry-form] Error saving enquiry:', error);
      // Surface the real reason. The service throws actionable messages here
      // (duplicate college_email, email already in use by another user), and a
      // bare 'Failed to save enquiry' makes every one of them look identical.
      // errorMessage() also translates the raw postgrest codes that reach this
      // path on create — 23505 unique violations and 42501 RLS refusals.
      toast.error(errorMessage(error, 'Failed to save enquiry'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit form (with validation)
  const onSubmit = async (values: EnquiryFormValues) => {
    // Prevent double-click
    if (isSubmitting || isSavingDraft) {
      return;
    }

    // Validate required fields
    const validation = (
      showsCourseTab ? requiredFieldsSchema : relaxedRequiredFieldsSchema
    ).safeParse(values);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const errorKeys = Object.keys(errors);

      // Auto-switch to first error tab + focus + scroll. Same helpers
      // as onInvalid so both validation paths behave identically.
      if (errorKeys.length > 0) {
        const firstErrorField = errorKeys[0];
        const rootKey = firstErrorField.split('.')[0];
        const tabId = fieldToTabMap[firstErrorField] ?? fieldToTabMap[rootKey];
        if (tabId) setActiveTab(tabId);
        setTimeout(() => {
          try {
            form.setFocus(firstErrorField as any);
            const el = document.querySelector(
              `[name="${firstErrorField}"], [id="${firstErrorField}"]`,
            );
            if (el && 'scrollIntoView' in el) {
              (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } catch (e) {
            console.warn('[enquiry-form] could not focus invalid field', firstErrorField, e);
          }
        }, 50);
      }

      // 2026-05-21: groupFieldsByTab is the shared helper between onInvalid
      // (zod-resolver path) and onSubmit (final-required-fields path). The
      // local fieldNames map that lived here was duplicating FIELD_LABELS.
      const errorsByTab = groupFieldsByTab(errorKeys);

      // Create detailed error message
      const errorMessage = Object.entries(errorsByTab)
        .map(([tab, fields]) => `${tab}:\n${fields.join('\n')}`)
        .join('\n\n');

      console.error('[enquiry-form] Validation errors:', {
        errors,
        errorsByTab,
        errorMessage
      });

      // Show error toast with details
      toast.error(
        `Please fill in the following required fields:\n\n${errorMessage}`,
        {
          duration: 8000,
          style: {
            maxWidth: '500px',
            whiteSpace: 'pre-line'
          }
        }
      );
      return;
    }

    // ======================================================================
    // Plan 6 / Task 5 — Pre-submit confirmation dialog interception.
    // Before invoking commitSubmit, check the institution's
    // pre_submit_dialog_enabled setting. When ON, fetch the matrix preview
    // and open the dialog; commitSubmit fires from the dialog's onConfirm.
    // Bypass when:
    //   - onSubmitProp is set (custom delegate, e.g. change-request approval)
    //   - lead is already in legacy_fee_mode (no matrix to preview)
    //   - finance not viewable in this context (e.g. student view)
    //   - institution_id missing (can't look up the setting)
    // ======================================================================
    const isLegacy =
      (learner as { legacy_fee_mode?: boolean } | undefined)?.legacy_fee_mode ?? false;
    const canRunDialog =
      !onSubmitProp &&
      canViewFinance &&
      !isLegacy &&
      !!values.institution_id;

    if (canRunDialog) {
      let dialogEnabled = true; // The DDL default is true; treat unknown as ON.
      try {
        const settings = await AdmissionSettingsService.getByInstitution(values.institution_id!);
        dialogEnabled = settings?.pre_submit_dialog_enabled ?? true;
      } catch (err) {
        console.error('[enquiry-form] Failed to load admission settings:', err);
        // soft-fail: fall through to inline submit if the lookup blew up
        dialogEnabled = false;
      }

      if (dialogEnabled) {
        // Build the preview by remapping form fields to dim shape and calling
        // FeeResolutionService.previewMatchByDimensions. previewItems is a
        // best-effort projection — empty when no match, in which case the
        // dialog's "no fee structure matched" banner shows.
        //
        // The 3 demographic dims (quota / community / accommodation) live on
        // the form as TEXT fields but the matrix needs FK ids. For LOADED
        // learners (edit mode) the parent passes already-resolved FK ids on
        // the `learner` prop; for NEW enquiries we resolve TEXT→FK here so
        // the preview matches what FinanceDetailsSection already shows.
        const learnerLike = (learner ?? {}) as {
          quota_id?: string;
          community_category_id?: string;
          accommodation_type_id?: string;
        };

        const resolveLookupId = (
          text: string | null | undefined,
          rows: Array<{ id: string; code: string; name: string }>,
        ): string | undefined => {
          if (!text) return undefined;
          const norm = text.trim().toLowerCase();
          if (!norm) return undefined;
          const match = rows.find(
            (r) => r.code.toLowerCase() === norm || r.name.toLowerCase() === norm,
          );
          return match?.id;
        };

        // Quota now lives on the form as the FK directly (quota_id); prefer the
        // live form value, fall back to the loaded learner prop.
        const resolvedQuotaId =
          formatUUID((values as { quota_id?: string }).quota_id) || learnerLike.quota_id;
        const resolvedCommunityId =
          formatUUID((values as { community_category_id?: string }).community_category_id) ||
          learnerLike.community_category_id;
        let resolvedAccommodationId = learnerLike.accommodation_type_id;

        // Accommodation is still a TEXT field on the form — resolve TEXT→FK for
        // the matrix preview when its FK isn't already known. (Quota + community
        // are FKs on the form directly.)
        if (!resolvedAccommodationId) {
          try {
            const accommodations = await LookupService.listAccommodationTypes(true);
            resolvedAccommodationId = resolveLookupId(values.accommodation_type, accommodations);
          } catch (err) {
            console.error('[enquiry-form] TEXT→FK lookup failed:', err);
          }
        }

        const dims: Partial<FeeStructureMatrixDimensions> = {
          institution_id: values.institution_id ?? undefined,
          degree_id: values.degree_id ?? undefined,
          department_id: values.department_id ?? undefined,
          // Form column is `program_id` (singular); dim shape uses British `programme_id`.
          programme_id: values.program_id ?? undefined,
          quota_id: resolvedQuotaId,
          community_category_id: resolvedCommunityId,
          accommodation_type_id: resolvedAccommodationId,
          admission_year_id: values.admission_year_id ?? undefined,
          gender: (values as { gender?: string }).gender || undefined,
        };
        const allDimsPresent = !!(
          dims.institution_id &&
          dims.degree_id &&
          dims.department_id &&
          dims.programme_id &&
          dims.quota_id &&
          dims.community_category_id &&
          dims.accommodation_type_id &&
          dims.admission_year_id
        );

        let match: AdmissionFeeStructureWithItems | null = null;
        let items: ResolvedFeeItem[] = [];
        if (allDimsPresent) {
          try {
            match = await FeeResolutionService.previewMatchByDimensions(
              dims as FeeStructureMatrixDimensions,
            );
            if (match?.items?.length) {
              // Look up category labels (admission_fee_structure_items only
              // carries billing_category_id, not the human label).
              const categories =
                await BillingCategoryService.getActiveBillingCategories().catch(() => []);
              const labelById: Record<string, string> = {};
              for (const cat of categories) labelById[cat.id] = cat.category_name;
              items = match.items.map((it) => ({
                category_id: it.billing_category_id,
                category_name:
                  labelById[it.billing_category_id] ?? it.billing_category_id,
                amount: Number(it.amount ?? 0),
                source: 'structure',
              }));
            }
          } catch (err) {
            console.error('[enquiry-form] previewMatchByDimensions failed:', err);
          }
        }

        setPreviewMatch(match);
        setPreviewItems(items);
        setPendingFormValues(values);
        setPreSubmitOpen(true);
        return; // wait for user confirmation
      }
    }

    // No dialog — proceed to save inline.
    await commitSubmit(values);
  };

  // Resolve degree_type for the selected degree — drives PG-conditional
  // field visibility in AcademicInformationSection.
  const watchedDegreeId = form.watch('degree_id');
  const { data: selectedDegree } = useQuery({
    queryKey: ['degree-for-form', watchedDegreeId],
    queryFn: () => DegreeService.getDegree(watchedDegreeId),
    enabled: !!watchedDegreeId,
  });
  const selectedDegreeType: DegreeType | undefined = selectedDegree?.degree_type;

  // Calculate profile completion status
  const collegeEmail = form.watch('college_email');
  const academicYearId = form.watch('academic_year_id');
  const semesterId = form.watch('semester_id');
  const sectionId = form.watch('section_id');

  const requiredForActivation = [
    { field: 'college_email', label: 'College Email', value: collegeEmail, valid: collegeEmail?.endsWith('@jkkn.ac.in') },
    { field: 'academic_year_id', label: 'Academic Year', value: academicYearId, valid: !!academicYearId },
    { field: 'semester_id', label: 'Semester', value: semesterId, valid: !!semesterId },
    { field: 'section_id', label: 'Section', value: sectionId, valid: !!sectionId },
  ];

  const filledFieldsCount = requiredForActivation.filter(f => f.valid).length;
  const isProfileComplete = filledFieldsCount === 4;
  const currentStatus = learner?.lifecycle_status;
  // 2026-05-20: Updated to match new workflow — auto-activation can happen
  // from any pre-account stage (entry, post-form, post-threshold).
  const canAutoActivate = currentStatus && ['enquiry', 'enquiry_submitted', 'pending', 'approved', 'admitted'].includes(currentStatus);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
        {/* Fees Setup Pending banner — shows when admitted+legacy. Lists the
            fee-matrix dimensions still missing; on save (commitSubmit), if
            all 8 dims are filled, admission_adopt_structure_for_lead fires. */}
        <IncompleteFeeBanner learner={learner} />

        {/* Task 15 — QR button for student self-fill; only shown on edit (learner exists) and not student view */}
        {!isStudentView && (savedEnquiryId ?? learner?.id) && (
          <div className="flex items-center justify-end gap-2 pb-2">
            <ShowStudentQRButton
              learnerProfileId={(savedEnquiryId ?? learner?.id)!}
              alreadySubmitted={(learner as { is_profile_complete?: boolean } | undefined)?.is_profile_complete === true}
            />
          </div>
        )}

        {/* Profile Completion Indicator */}
        {canAutoActivate && (
          <Alert variant={isProfileComplete ? 'default' : 'default'} className={isProfileComplete ? 'border-green-500 bg-green-50' : 'border-blue-500 bg-blue-50'}>
            <div className="flex items-start gap-3">
              {isProfileComplete ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              ) : (
                <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              )}
              <div className="flex-1">
                <AlertTitle className={isProfileComplete ? 'text-green-900' : 'text-blue-900'}>
                  {isProfileComplete ? (
                    'Profile Complete - Ready for Activation'
                  ) : (
                    `Profile Completion: ${filledFieldsCount}/4 Required Fields`
                  )}
                </AlertTitle>
                <AlertDescription className={isProfileComplete ? 'text-green-800' : 'text-blue-800'}>
                  {isProfileComplete ? (
                    <div className="space-y-2">
                      <p>All required fields are filled. When you save this form, the learner will automatically be activated and a user account will be created.</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {requiredForActivation.map(field => (
                          <Badge key={field.field} variant="outline" className="bg-green-100 border-green-300 text-green-800">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {field.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p>Fill the following {4 - filledFieldsCount} field(s) to enable auto-activation:</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {requiredForActivation.map(field => (
                          <Badge
                            key={field.field}
                            variant="outline"
                            className={field.valid ? 'bg-green-100 border-green-300 text-green-800' : 'bg-gray-100 border-gray-300 text-gray-700'}
                          >
                            {field.valid ? (
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                            ) : (
                              <AlertCircle className="mr-1 h-3 w-3" />
                            )}
                            {field.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex justify-start h-auto p-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {filteredFormTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex-shrink-0 min-w-fit sm:min-w-[100px] md:flex-1 md:min-w-[140px] text-xs sm:text-sm px-3 py-2 whitespace-nowrap"
            >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="basic-details" className="space-y-4 mt-4">
            {!isStudentView && learner?.id && (
              <div className="flex items-center justify-between mb-1">
                <div />
                <StudentSectionStatusChip
                  filled={sectionStatus.basic.filled}
                  filledAt={sectionStatus.basic.filledAt}
                  filledBy={sectionStatus.basic.filledBy}
                  canOverride={canOverrideStudentSection && !sectionStatus.basic.filled}
                  onOverrideClick={() => setOverrideDialog('basic')}
                />
              </div>
            )}
            <Card className="p-3 sm:p-4 md:p-6">
              <BasicDetailsSection
                form={form}
                onImageFileChange={setPendingImageFile}
                isStudentView={isStudentView}
                showTamilNames={showTamilNames}
                showLearnerIdentifiers={showLearnerIdentifiers}
              />
            </Card>
          </TabsContent>

          <TabsContent value="contact-details" className="space-y-4 mt-4">
            {!isStudentView && learner?.id && (
              <div className="flex items-center justify-between mb-1">
                <div />
                <StudentSectionStatusChip
                  filled={sectionStatus.contact.filled}
                  filledAt={sectionStatus.contact.filledAt}
                  filledBy={sectionStatus.contact.filledBy}
                  canOverride={canOverrideStudentSection && !sectionStatus.contact.filled}
                  onOverrideClick={() => setOverrideDialog('contact')}
                />
              </div>
            )}
            <Card className="p-3 sm:p-4 md:p-6">
              <ContactDetailsSection form={form} showCollegeEmail={!isStudentView} />
            </Card>
          </TabsContent>

          <TabsContent value="course-selection" className="space-y-4 mt-4">
            <Card className="p-3 sm:p-4 md:p-6">
              <CourseSelectionSection
                form={form}
                showLearnerType={!!learner && !isStudentView}
                enforceAdmissionRules={enforceAdmissionRules}
              />
            </Card>
          </TabsContent>

          <TabsContent value="academic-information" className="space-y-4 mt-4">
            {!isStudentView && learner?.id && (
              <div className="flex items-center justify-between mb-1">
                <div />
                <StudentSectionStatusChip
                  filled={sectionStatus.academic.filled}
                  filledAt={sectionStatus.academic.filledAt}
                  filledBy={sectionStatus.academic.filledBy}
                  canOverride={canOverrideStudentSection && !sectionStatus.academic.filled}
                  onOverrideClick={() => setOverrideDialog('academic')}
                />
              </div>
            )}
            <Card className="p-3 sm:p-4 md:p-6">
              <AcademicInformationSection form={form} degreeType={selectedDegreeType} />
            </Card>
          </TabsContent>

          <TabsContent value="accommodation-preferences" className="space-y-4 mt-4">
            <Card className="p-3 sm:p-4 md:p-6">
              <AccommodationPreferencesSection form={form} isStudentView={isStudentView} />
            </Card>
          </TabsContent>

          {canViewFinance && (
            <TabsContent value="finance-details" className="space-y-4 mt-4">
              <Card className="p-3 sm:p-4 md:p-6">
                <FinanceDetailsSection
                  form={form}
                  readOnly={!canEditFinance}
                  // 2026-05-05 Plan 3 / Task 14: forward learnerId + matrix
                  // dimensions that aren't on the form schema today, so the
                  // matrix-driven Finance tab can resolve fees per learner.
                  // legacy_fee_mode + (quota|community_category|accommodation_type)_id
                  // live on learners_profiles but aren't in the form's zod schema;
                  // we read them off the loaded `learner` prop directly.
                  learnerId={savedEnquiryId ?? learner?.id}
                  legacyFeeMode={
                    (learner as { legacy_fee_mode?: boolean } | undefined)?.legacy_fee_mode ?? false
                  }
                  extraDims={
                    learner
                      ? {
                          quota_id: (learner as { quota_id?: string }).quota_id,
                          community_category_id: (learner as { community_category_id?: string })
                            .community_category_id,
                          accommodation_type_id: (learner as { accommodation_type_id?: string })
                            .accommodation_type_id,
                        }
                      : undefined
                  }
                />
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Form Actions - Navigation Buttons */}
        <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:gap-4 pt-4 border-t sm:flex-row sm:items-center">
          {/* Left side - Cancel button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelClick}
            disabled={isSubmitting || isSavingDraft}
            className="w-full sm:w-auto text-sm sm:text-base py-2"
          >
            <X className="mr-1 sm:mr-2 h-4 w-4" />
            Cancel
          </Button>

          {/* Right side - Navigation and Action buttons */}
          <div className="flex flex-col-reverse items-stretch gap-2 w-full sm:flex-row sm:w-auto sm:items-center">
            {/* Previous Button - Show on all tabs except first.
                singleSaveButton drops it: "Previous" with no "Save & Next"
                beside it is a half a wizard, and the tab headers already
                navigate. */}
            {!isFirstTab && !singleSaveButton && (
              <Button
                type="button"
                variant="outline"
                onClick={goToPreviousTab}
                disabled={isSubmitting || isSavingDraft}
                className="w-full sm:w-auto text-sm sm:text-base py-2"
              >
                <ChevronLeft className="mr-1 sm:mr-2 h-4 w-4" />
                Previous
              </Button>
            )}

            {/* Save Draft Button - Always visible unless hidden.
                Under singleSaveButton this is the ONE action button, so it
                takes the primary variant instead of reading as a secondary
                option next to nothing. */}
            {!hideDraft && (
              <Button
                type="button"
                variant={singleSaveButton ? 'default' : 'outline'}
                onClick={handleSaveDraft}
                disabled={isSubmitting || isSavingDraft}
                className="w-full sm:w-auto text-sm sm:text-base py-2"
              >
                {isSavingDraft && <Loader2 className="mr-1 sm:mr-2 h-4 w-4 animate-spin" />}
                {!isSavingDraft && <Save className="mr-1 sm:mr-2 h-4 w-4" />}
                <span className="hidden xs:inline">{learner ? 'Update' : 'Save Draft'}</span>
                <span className="xs:hidden">{learner ? 'Update' : 'Draft'}</span>
              </Button>
            )}

            {/* Save & Next Button - Show on all tabs except last */}
            {!isLastTab && !singleSaveButton && (
              <Button
                type="button"
                onClick={handleSaveAndNext}
                disabled={isSubmitting || isSavingDraft}
                className="w-full sm:w-auto text-sm sm:text-base py-2"
              >
                {isSavingDraft && <Loader2 className="mr-1 sm:mr-2 h-4 w-4 animate-spin" />}
                {!isSavingDraft && <Save className="mr-1 sm:mr-2 h-4 w-4" />}
                <span className="hidden xs:inline">Save & Next</span>
                <span className="xs:hidden">Next</span>
                <ChevronRight className="ml-1 sm:ml-2 h-4 w-4" />
              </Button>
            )}

            {/* Final submit. Last tab only by default; allowSubmitFromAnyTab
                puts it next to "Save & Next" on every step so the form can be
                finalised without walking to the end.

                In that mode the button is type="button" with an explicit
                handleSubmit call rather than type="submit". A submit button
                present on every tab switches on the browser's implicit
                submission, and Enter in any of this form's ~70 inputs would
                then finalise and redirect mid-typing. Validation is identical
                either way — handleSubmit runs the same resolver and routes to
                onInvalid, which jumps to the first tab holding an error.

                singleSaveButton suppresses it entirely: on an edit surface
                there is no "final submission" left to make — the record exists
                and lifecycle transitions belong to the explicit status actions
                (row-actions / enquiry-status-update), not to a field edit. Its
                only effect here would be a second, stricter save button that
                refuses the 86% of enquiries with no section_id. */}
            {(isLastTab || allowSubmitFromAnyTab) && !singleSaveButton && (
              <Button
                type={allowSubmitFromAnyTab ? 'button' : 'submit'}
                onClick={allowSubmitFromAnyTab ? form.handleSubmit(onSubmit, onInvalid) : undefined}
                disabled={isSubmitting || isSavingDraft}
                className="w-full sm:w-auto text-sm sm:text-base py-2"
              >
                {isSubmitting && <Loader2 className="mr-1 sm:mr-2 h-4 w-4 animate-spin" />}
                {!isSubmitting && <Send className="mr-1 sm:mr-2 h-4 w-4" />}
                {submitLabel || (learner
                  ? (learner.lifecycle_status === 'active' || learner.lifecycle_status === 'inactive' || learner.lifecycle_status === 'exited' || learner.lifecycle_status === 'graduated'
                      ? 'Update Profile'
                      : 'Update Enquiry')
                  : 'Submit Enquiry')}
              </Button>
            )}
          </div>
        </div>
      </form>

      {/* Plan 6 / Task 5 — pre-submit confirmation dialog. Read-only summary
       *  shown when the institution's pre_submit_dialog_enabled flag is ON
       *  and the lead is matrix-driven (not legacy_fee_mode). On confirm,
       *  commitSubmit fires the existing save path. */}
      <PreSubmitConfirmationDialog
        open={preSubmitOpen}
        onOpenChange={(open) => {
          setPreSubmitOpen(open);
          if (!open) {
            // Closed without confirming — clear pending state.
            setPendingFormValues(null);
            setPreviewMatch(null);
            setPreviewItems([]);
          }
        }}
        leadName={
          pendingFormValues
            ? `${pendingFormValues.first_name ?? ''} ${pendingFormValues.last_name ?? ''}`.trim()
            : ''
        }
        matchedStructureName={previewMatch?.name ?? null}
        resolvedItems={previewItems}
        total={previewItems.reduce((s, it) => s + Number(it.amount || 0), 0)}
        submitting={isSubmitting}
        onConfirm={async () => {
          if (!pendingFormValues) {
            setPreSubmitOpen(false);
            return;
          }
          const values = pendingFormValues;
          setPreSubmitOpen(false);
          await commitSubmit(values);
          // After commit, clear the pending state. (commitSubmit handles
          // navigation/onSuccess so the component may unmount before this
          // runs — guard for that case is implicit since setState on
          // unmounted is a no-op warning, not an error.)
          setPendingFormValues(null);
          setPreviewMatch(null);
          setPreviewItems([]);
        }}
      />

      {/* Task 16: Override-edit confirm dialog */}
      <AlertDialog open={!!overrideDialog} onOpenChange={(o) => !o && setOverrideDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Override student-filled section?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;re editing fields the student should fill themselves. This action
              will be recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (overrideDialog) {
                  setSectionOverrideMode((prev) => ({ ...prev, [overrideDialog]: true }));
                }
                setOverrideDialog(null);
              }}
            >
              Yes, fill on behalf
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Enquiry Form</DialogTitle>
            <DialogDescription>
              {savedEnquiryId && !learner
                ? 'All saved data will be permanently deleted. Are you sure you want to cancel?'
                : 'Any unsaved changes will be lost. Are you sure you want to cancel?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              disabled={isSubmitting}
            >
              Keep Editing
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={isSubmitting}
            >
              {savedEnquiryId && !learner ? 'Delete & Cancel' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
