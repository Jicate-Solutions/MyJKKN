// ============================================
// ENQUIRY FORM COMPONENT (Multi-Step)
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-18 - Added all admission fields with tabs
// Purpose: Complete multi-step form for learner enquiries
// ============================================

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, FieldErrors } from 'react-hook-form';
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
import { uploadProfileImage } from './profile-image-upload';

// Import location data for converting names to IDs
import {
  indianStates,
  getDistrictsByState,
  getTaluksByDistrict
} from '@/lib/data/locations';
import toast from 'react-hot-toast';

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
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { required_error: 'Gender is required' }),
  religion: z.string().min(1, 'Religion is required'),
  community: z.string().min(1, 'Community is required'),
  caste: z.string().min(1, 'Caste is required'),
  aadhar_number: z.string().nullable().optional(),
  blood_group: z.string().nullable().optional(),
  student_photo_url: z.string().nullable().optional(),
  admission_year: z.number().nullable().optional(),

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
  quota: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  entry_type: z.string().min(1, 'Entry type is required'),

  // Course Selection
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  program_id: z.string().min(1, 'Program is required'),
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
  permanent_address_street: z.string().min(1, 'Street address is required'),
  permanent_address_taluk: z.string().min(1, 'Taluk is required'),
  permanent_address_district: z.string().min(1, 'District is required'),
  permanent_address_state: z.string().min(1, 'State is required'),
  permanent_address_pin_code: z.string().min(1, 'PIN code is required'),

  // Accommodation Preferences
  accommodation_type: z.string().min(1, 'Accommodation type is required'),
  hostel_type: z.string().nullable().optional(),
  food_type: z.string().nullable().optional(),
  bus_required: z.boolean().nullable().optional(),
  bus_route: z.string().nullable().optional(),
  bus_pickup_location: z.string().nullable().optional(),
  reference_type: z.string().nullable().optional(),
  reference_name: z.string().nullable().optional(),
  reference_contact: z.string().nullable().optional(),
});

// Required fields schema for final submission
const requiredFieldsSchema = enquiryFormSchema.extend({
  first_name: z.string().min(2, 'First name is required'),
  student_mobile: z.string().min(10, 'Mobile number is required'),
  institution_id: z.string().uuid('Institution is required'),
  program_id: z.string().uuid('Program is required'),
});

export type EnquiryFormValues = z.infer<typeof enquiryFormSchema>;

interface EnquiryFormProps {
  learner?: LearnerProfile;
  onSuccess?: (learner: LearnerProfile) => void;
  visibleTabs?: string[];
  onSubmit?: (data: any) => Promise<void>;
  submitLabel?: string;
  hideDraft?: boolean;
  isStudentView?: boolean;
}

  const ALL_TABS = [
    { id: 'basic-details', label: 'Basic Details' },
    { id: 'academic-information', label: 'Academic Information' },
    { id: 'course-selection', label: 'Course Selection' },
    { id: 'contact-details', label: 'Contact Details' },
    { id: 'accommodation-preferences', label: 'Accommodation' },
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
function getLocationIdByName(
  name: string | undefined,
  type: 'state' | 'district' | 'taluk',
  stateId?: string
): string | undefined {
  if (!name) {
    return '';
  }

  try {

    // Normalize name for case-insensitive comparison
    const normalizedName = name.trim().toLowerCase();

    if (type === 'state') {
      const state = indianStates.find((s) => s.name.toLowerCase() === normalizedName);
      if (state) {
        return state.id;
      } else {
        console.warn(`[enquiry-form] State "${name}" not found in indianStates`);
        return '';
      }
    }

    // For district and taluk, we need to search across all states
    if (type === 'district') {
      for (const state of indianStates) {
        const districts = getDistrictsByState(state.id);
        const district = districts.find((d) => d.name.toLowerCase() === normalizedName);
        if (district) {
          return district.id;
        }
      }
      console.warn(`[enquiry-form] District "${name}" not found`);
      return '';
    }

    if (type === 'taluk') {
      // If we have stateId, search more efficiently
      if (stateId) {
        const districts = getDistrictsByState(stateId);
        for (const district of districts) {
          const taluks = getTaluksByDistrict(stateId, district.id);
          const taluk = taluks.find((t) => t.name.toLowerCase() === normalizedName);
          if (taluk) {
            return taluk.id;
          }
        }
      } else {
        // Search all states if no stateId provided
        for (const state of indianStates) {
          const districts = getDistrictsByState(state.id);
          for (const district of districts) {
            const taluks = getTaluksByDistrict(state.id, district.id);
            const taluk = taluks.find((t) => t.name.toLowerCase() === normalizedName);
            if (taluk) {
              return taluk.id;
            }
          }
        }
      }
      console.warn(`[enquiry-form] Taluk "${name}" not found`);
      return '';
    }

    return '';
  } catch (error) {
    console.error('[enquiry-form] Error converting location name to ID:', error, { name, type, stateId });
    return '';
  }
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
  community: 'basic-details',
  caste: 'basic-details',
  aadhar_number: 'basic-details',
  blood_group: 'basic-details',
  student_photo_url: 'basic-details',
  admission_year: 'basic-details',
  
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
  quota: 'academic-information',
  category: 'academic-information',
  entry_type: 'academic-information',

  // Course Selection
  institution_id: 'course-selection',
  degree_id: 'course-selection',
  department_id: 'course-selection',
  program_id: 'course-selection',
  academic_year_id: 'course-selection',
  semester_id: 'course-selection',
  section_id: 'course-selection',
  college_email: 'course-selection',
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

  // Accommodation Preferences
  accommodation_type: 'accommodation-preferences',
  hostel_type: 'accommodation-preferences',
  food_type: 'accommodation-preferences',
  bus_required: 'accommodation-preferences',
  bus_route: 'accommodation-preferences',
  bus_pickup_location: 'accommodation-preferences',
  reference_type: 'accommodation-preferences',
  reference_name: 'accommodation-preferences',
  reference_contact: 'accommodation-preferences',
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
  isStudentView = false
}: EnquiryFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [activeTab, setActiveTab] = useState(visibleTabs ? visibleTabs[0] : 'basic-details');
  const [savedEnquiryId, setSavedEnquiryId] = useState<string | null>(learner?.id || null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);

  const formTabs = visibleTabs 
    ? ALL_TABS.filter(tab => visibleTabs.includes(tab.id))
    : ALL_TABS;

  // Initialize form with all fields
  const form = useForm<EnquiryFormValues>({
    resolver: zodResolver(enquiryFormSchema),
    defaultValues: learner
      ? (() => {
          return {
          // Basic Details
          enquiry_date: learner.enquiry_date || new Date().toISOString().split('T')[0],
          first_name: learner.first_name || '',
          last_name: learner.last_name || '',
          date_of_birth: learner.date_of_birth || '',
          gender: learner.gender?.toUpperCase() as 'MALE' | 'FEMALE' | 'OTHER' | undefined,
          religion: learner.religion || '',
          community: learner.community || '',
          caste: learner.caste || '',
          aadhar_number: learner.aadhar_number || '',
          blood_group: learner.blood_group || '',
          student_photo_url: learner.student_photo_url || '',
          admission_year: learner.admission_year || undefined,

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
          quota: learner.quota || '',
          category: learner.category || '',
          entry_type: learner.entry_type || '',

          // Course Selection
          institution_id: (() => {
            const id = learner.institution_id || '';
            return id;
          })(),
          degree_id: (() => {
            const id = learner.degree_id || '';
            return id;
          })(),
          department_id: (() => {
            const id = learner.department_id || '';
            return id;
          })(),
          program_id: (() => {
            const id = learner.program_id || '';
            return id;
          })(),
          academic_year_id: (() => {
            const id = learner.academic_year_id || '';
            return id;
          })(),
          semester_id: (() => {
            const id = learner.semester_id || '';
            return id;
          })(),
          section_id: (() => {
            const id = learner.section_id || '';
            return id;
          })(),
          roll_number: learner.roll_number || '',
          register_number: learner.register_number || '',
          college_email: learner.college_email || '',
          regulation_id: learner.regulation_id || '',
          batch_id: learner.batch_id || '',

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

          // Accommodation
          accommodation_type: learner.accommodation_type || '',
          hostel_type: learner.hostel_type || '',
          food_type: learner.food_type || '',
          bus_required: learner.bus_required || false,
          bus_route: learner.bus_route || '',
          bus_pickup_location: learner.bus_pickup_location || '',
          reference_type: normalizeReferenceType(learner.reference_type),
          reference_name: learner.reference_name || '',
          reference_contact: learner.reference_contact || '',
        };
        })()
      : {
          // Basic Details
          enquiry_date: new Date().toISOString().split('T')[0], // Auto-populate with today's date
          first_name: '',
          last_name: '',
          date_of_birth: '',
          gender: undefined,
          religion: '',
          community: '',
          caste: '',
          aadhar_number: '',
          blood_group: '',
          student_photo_url: '',
          admission_year: undefined,

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
          quota: '',
          category: '',
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

          // Accommodation
          accommodation_type: '',
          hostel_type: '',
          food_type: '',
          bus_required: false,
          bus_route: '',
          bus_pickup_location: '',
          reference_type: '',
          reference_name: '',
          reference_contact: '',
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
  const currentTabIndex = formTabs.findIndex((tab) => tab.id === activeTab);
  const isFirstTab = currentTabIndex === 0;
  const isLastTab = currentTabIndex === formTabs.length - 1;

  const goToNextTab = () => {
    if (!isLastTab) {
      setActiveTab(formTabs[currentTabIndex + 1].id);
    }
  };

  const goToPreviousTab = () => {
    if (!isFirstTab) {
      setActiveTab(formTabs[currentTabIndex - 1].id);
    }
  };

  // ============================================
  // DRAFT MANAGEMENT
  // ============================================

  // Format form data with default values for required fields
  const formatFormDataForAPI = (values: EnquiryFormValues) => {
    // Helper to handle UUID fields - return undefined if empty string
    const formatUUID = (value: string | undefined) => {
      if (!value || value.trim() === '') return undefined;
      return value;
    };

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
        if (!stateId) return undefined;
        const districts = getDistrictsByState(stateId);
        name = districts.find((d: any) => d.id === id)?.name;
      } else if (type === 'taluk') {
        if (!stateId || !districtId) return undefined;
        const taluks = getTaluksByDistrict(stateId, districtId);
        name = taluks.find((t: any) => t.id === id)?.name;
      }

      // Convert location names to uppercase for consistency
      return name ? name.toUpperCase() : undefined;
    };

    return {
      // Basic Details (string fields - NOT NULL) - Convert to UPPERCASE
      first_name: toUpperCaseField(values.first_name) || '',
      last_name: toUpperCaseField(values.last_name),
      date_of_birth: values.date_of_birth || '',
      gender: toUpperCaseField(values.gender) || '',
      religion: toUpperCaseField(values.religion) || '',
      community: toUpperCaseField(values.community) || '',
      caste: toUpperCaseField(values.caste),
      aadhar_number: values.aadhar_number || undefined,
      blood_group: values.blood_group || undefined,
      student_photo_url: values.student_photo_url || undefined,
      admission_year: values.admission_year || undefined,
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
      quota: values.quota || undefined,
      category: values.category || undefined,
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
      permanent_address_state: getLocationNameById(
        values.permanent_address_state,
        'state'
      ) || '',

      // Accommodation Preferences (NOT NULL for accommodation_type)
      accommodation_type: values.accommodation_type || '',
      hostel_type: values.hostel_type || undefined,
      food_type: values.food_type || undefined,
      bus_required: values.bus_required || undefined,
      bus_route: values.bus_route || undefined,
      bus_pickup_location: values.bus_pickup_location || undefined,
      reference_type: values.reference_type || undefined,
      reference_name: toUpperCaseField(values.reference_name),
      reference_contact: values.reference_contact || undefined,

      // System fields - Preserve existing values when editing, default to 'enquiry' when creating
      lifecycle_status: learner?.lifecycle_status || ('enquiry' as const),
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
      const data = formatFormDataForAPI(values);

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
      toast.error('Failed to save progress');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Save draft (without validation) and stay on current page
  const handleSaveDraft = async () => {
    // Prevent double-click
    if (isSavingDraft || isSubmitting) {
      return;
    }

    setIsSavingDraft(true);
    try {
      const values = form.getValues();
      const data = formatFormDataForAPI(values);

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
    } catch (error) {
      console.error('[enquiry-form] Error saving draft:', error);
      toast.error('Failed to save progress');
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
  const onInvalid = (errors: FieldErrors<EnquiryFormValues>) => {
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const firstErrorField = errorKeys[0];
      const tabId = fieldToTabMap[firstErrorField] || fieldToTabMap[firstErrorField.split('.')[0]]; // Handle nested fields
      
      if (tabId) {
        setActiveTab(tabId);
        
        // Find tab label
        const tabLabel = ALL_TABS.find(t => t.id === tabId)?.label || 'the relevant tab';
        
        const errorCount = Object.keys(errors).length;
        toast.error(
          `Validation Failed: Please check ${tabLabel}.\nFound ${errorCount} error${errorCount > 1 ? 's' : ''}.`,
          { duration: 4000 }
        );
        
      } else {
        toast.error('Please check the form for errors.');
      }
    }
  };

  // Submit form (with validation)
  const onSubmit = async (values: EnquiryFormValues) => {
    // Prevent double-click
    if (isSubmitting || isSavingDraft) {
      return;
    }

    // Validate required fields
    const validation = requiredFieldsSchema.safeParse(values);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const errorKeys = Object.keys(errors);
      
      // Auto-switch to tab with first error
      if (errorKeys.length > 0) {
        const firstErrorField = errorKeys[0];
        const tabId = fieldToTabMap[firstErrorField];
        if (tabId) {
          setActiveTab(tabId);
        }
      }

      // Create user-friendly field names
      const fieldNames: Record<string, { label: string; tab: string }> = {
        first_name: { label: 'First Name', tab: 'Basic Details' },
        last_name: { label: 'Last Name', tab: 'Basic Details' },
        date_of_birth: { label: 'Date of Birth', tab: 'Basic Details' },
        gender: { label: 'Gender', tab: 'Basic Details' },
        religion: { label: 'Religion', tab: 'Basic Details' },
        community: { label: 'Community', tab: 'Basic Details' },
        caste: { label: 'Caste', tab: 'Basic Details' },
        father_name: { label: "Father's Name", tab: 'Basic Details' },
        mother_name: { label: "Mother's Name", tab: 'Basic Details' },
        student_mobile: { label: 'Student Mobile', tab: 'Contact Details' },
        institution_id: { label: 'Institution', tab: 'Course Selection' },
        degree_id: { label: 'Degree', tab: 'Course Selection' },
        department_id: { label: 'Department', tab: 'Course Selection' },
        program_id: { label: 'Program', tab: 'Course Selection' },
        academic_year_id: { label: 'Academic Year', tab: 'Course Selection' },
        semester_id: { label: 'Semester', tab: 'Course Selection' },
        section_id: { label: 'Section', tab: 'Course Selection' },
        scholarship_type: { label: 'Scholarship Type', tab: 'Academic Information' },
        entry_type: { label: 'Entry Type', tab: 'Academic Information' },
        permanent_address_street: { label: 'Street Address', tab: 'Contact Details' },
        permanent_address_taluk: { label: 'Taluk', tab: 'Contact Details' },
        permanent_address_district: { label: 'District', tab: 'Contact Details' },
        permanent_address_state: { label: 'State', tab: 'Contact Details' },
        permanent_address_pin_code: { label: 'PIN Code', tab: 'Contact Details' },
        accommodation_type: { label: 'Accommodation Type', tab: 'Accommodation' },
      };

      // Group errors by tab
      const errorsByTab: Record<string, string[]> = {};
      Object.entries(errors).forEach(([field, messages]) => {
        const fieldInfo = fieldNames[field] || { label: field, tab: 'Unknown' };
        if (!errorsByTab[fieldInfo.tab]) {
          errorsByTab[fieldInfo.tab] = [];
        }
        errorsByTab[fieldInfo.tab].push(`• ${fieldInfo.label}`);
      });

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

    setIsSubmitting(true);
    try {
      // Upload pending image file first (if exists)
      if (pendingImageFile) {
        try {
          const imageUrl = await uploadProfileImage(pendingImageFile);
          values.student_photo_url = imageUrl; // Update form value with uploaded URL
          toast.success('Image uploaded successfully');
        } catch (error) {
          console.error('[enquiry-form] Image upload failed:', error);
          toast.error('Failed to upload image. Please try again.');
          setIsSubmitting(false);
          return; // Don't proceed if image upload fails
        }
      }

      const data = formatFormDataForAPI(values);

      // Allow overriding submission logic (e.g. for change requests)
      if (onSubmitProp) {
        await onSubmitProp(data);
        setIsSubmitting(false);
        return;
      }

      let result: LearnerProfile;

      if (learner) {
        result = await LearnerProfileService.updateLearnerProfile(learner.id, data);
        const isProfile = ['active', 'inactive', 'graduated', 'exited'].includes(learner.lifecycle_status);
        toast.success(isProfile ? 'Profile updated successfully' : 'Enquiry updated successfully');
      } else if (savedEnquiryId) {
        // Update existing draft with final submission
        result = await LearnerProfileService.updateLearnerProfile(savedEnquiryId, data);
        toast.success('Enquiry submitted successfully');
      } else {
        result = await LearnerProfileService.createLearnerProfile(data as any);
        toast.success('Enquiry created successfully');
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

      // Clear pending image after successful submission
      setPendingImageFile(null);

      if (onSuccess) {
        onSuccess(result);
      } else {
        router.push(`/learners/enquiries/${result.id}`);
      }
    } catch (error) {
      console.error('[enquiry-form] Error saving enquiry:', error);
      toast.error('Failed to save enquiry');
    } finally {
      setIsSubmitting(false);
    }
  };

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
  const canAutoActivate = currentStatus && ['enquiry', 'pending', 'approved'].includes(currentStatus);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
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
          {formTabs.map((tab) => (
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
            <Card className="p-3 sm:p-4 md:p-6">
              <BasicDetailsSection
                form={form}
                onImageFileChange={setPendingImageFile}
                isStudentView={isStudentView}
              />
            </Card>
          </TabsContent>

          <TabsContent value="academic-information" className="space-y-4 mt-4">
            <Card className="p-3 sm:p-4 md:p-6">
              <AcademicInformationSection form={form} />
            </Card>
          </TabsContent>

          <TabsContent value="course-selection" className="space-y-4 mt-4">
            <Card className="p-3 sm:p-4 md:p-6">
              <CourseSelectionSection form={form} />
            </Card>
          </TabsContent>

          <TabsContent value="contact-details" className="space-y-4 mt-4">
            <Card className="p-3 sm:p-4 md:p-6">
              <ContactDetailsSection form={form} />
            </Card>
          </TabsContent>

          <TabsContent value="accommodation-preferences" className="space-y-4 mt-4">
            <Card className="p-3 sm:p-4 md:p-6">
              <AccommodationPreferencesSection form={form} isStudentView={isStudentView} />
            </Card>
          </TabsContent>
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
            {/* Previous Button - Show on all tabs except first */}
            {!isFirstTab && (
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

            {/* Save Draft Button - Always visible unless hidden */}
            {!hideDraft && (
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isSubmitting || isSavingDraft}
                className="w-full sm:w-auto text-sm sm:text-base py-2"
              >
                {isSavingDraft && <Loader2 className="mr-1 sm:mr-2 h-4 w-4 animate-spin" />}
                {!isSavingDraft && <Save className="mr-1 sm:mr-2 h-4 w-4" />}
                <span className="hidden xs:inline">Save Draft</span>
                <span className="xs:hidden">Draft</span>
              </Button>
            )}

            {/* Save & Next Button - Show on all tabs except last */}
            {!isLastTab && (
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

            {/* Submit Button - Show only on last tab */}
            {isLastTab && (
              <Button type="submit" disabled={isSubmitting || isSavingDraft} className="w-full sm:w-auto text-sm sm:text-base py-2">
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
