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
import { useForm } from 'react-hook-form';
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
import type { LearnerProfile } from '@/types/learner-profile';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import { Loader2, Save, Send, ChevronLeft, ChevronRight, X } from 'lucide-react';

// Import form sections
import { BasicDetailsSection } from './form-sections/basic-details';
import { AcademicInformationSection } from './form-sections/academic-information';
import { CourseSelectionSection } from './form-sections/course-selection';
import { ContactDetailsSection } from './form-sections/contact-details';
import { AccommodationPreferencesSection } from './form-sections/accommodation-preferences';

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
const enquiryFormSchema = z.object({
  // Basic Details
  enquiry_date: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  religion: z.string().optional(),
  community: z.string().optional(),
  caste: z.string().optional(),
  aadhar_number: z.string().optional(),

  // Family Information
  father_name: z.string().optional(),
  father_occupation: z.string().optional(),
  father_mobile: z.string().optional(),
  mother_name: z.string().optional(),
  mother_occupation: z.string().optional(),
  mother_mobile: z.string().optional(),
  annual_income: z.string().optional(),

  // Academic Information
  last_school: z.string().optional(),
  board_of_study: z.string().optional(),
  tenth_marks: z.object({
    max_marks: z.string().optional(),
    obtained_marks: z.string().optional(),
    percentage: z.string().optional(),
  }).optional(),
  twelfth_marks: z.object({
    group: z.string().optional(),
    max_marks: z.string().optional(),
    obtained_marks: z.string().optional(),
    percentage: z.string().optional(),
    subjects: z.object({
      // Science subjects
      physics: z.string().optional(),
      chemistry: z.string().optional(),
      mathematics: z.string().optional(),
      biology: z.string().optional(),
      botany: z.string().optional(),
      zoology: z.string().optional(),
      computer_science: z.string().optional(),
      // Commerce subjects
      accountancy: z.string().optional(),
      commerce: z.string().optional(),
      economics: z.string().optional(),
      statistics: z.string().optional(),
      // Arts subjects
      history: z.string().optional(),
      geography: z.string().optional(),
    }).optional(),
  }).optional(),
  neet_roll_number: z.string().optional(),
  neet_score: z.string().optional(),
  medical_cutoff_marks: z.string().optional(),
  engineering_cutoff_marks: z.string().optional(),
  counseling_applied: z.boolean().optional(),
  counseling_number: z.string().optional(),
  first_graduate: z.boolean().optional(),
  quota: z.string().optional(),
  category: z.string().optional(),
  entry_type: z.string().optional(),

  // Course Selection
  institution_id: z.string().optional(),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  academic_year_id: z.string().optional(),
  semester_id: z.string().optional(),
  section_id: z.string().optional(),
  roll_number: z.string().optional(),
  register_number: z.string().optional(),
  regulation_id: z.string().optional(),
  batch_id: z.string().optional(),

  // Contact Details
  student_mobile: z.string().optional(),
  student_email: z.string().optional(),
  permanent_address_street: z.string().optional(),
  permanent_address_taluk: z.string().optional(),
  permanent_address_district: z.string().optional(),
  permanent_address_state: z.string().optional(),
  permanent_address_pin_code: z.string().optional(),

  // Accommodation Preferences
  accommodation_type: z.string().optional(),
  hostel_type: z.string().optional(),
  food_type: z.string().optional(),
  bus_required: z.boolean().optional(),
  bus_route: z.string().optional(),
  bus_pickup_location: z.string().optional(),
  reference_type: z.string().optional(),
  reference_name: z.string().optional(),
  reference_contact: z.string().optional(),
});

// Required fields schema for final submission
const requiredFieldsSchema = enquiryFormSchema.extend({
  first_name: z.string().min(2, 'First name is required'),
  student_mobile: z.string().min(10, 'Mobile number is required'),
  institution_id: z.string().uuid('Institution is required'),
  program_id: z.string().uuid('Program is required'),
});

type EnquiryFormValues = z.infer<typeof enquiryFormSchema>;

interface EnquiryFormProps {
  learner?: LearnerProfile;
  onSuccess?: (learner: LearnerProfile) => void;
}

const formTabs = [
  { id: 'basic-details', label: 'Basic Details' },
  { id: 'academic-information', label: 'Academic Information' },
  { id: 'course-selection', label: 'Course Selection' },
  { id: 'contact-details', label: 'Contact Details' },
  { id: 'accommodation-preferences', label: 'Accommodation' },
];

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
    console.log(`[enquiry-form] No ${type} name provided`);
    return '';
  }

  try {
    console.log(`[enquiry-form] Converting ${type} name "${name}" to ID`);

    if (type === 'state') {
      const state = indianStates.find((s) => s.name === name);
      if (state) {
        console.log(`[enquiry-form] Found state ID: ${state.id}`);
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
        const district = districts.find((d) => d.name === name);
        if (district) {
          console.log(`[enquiry-form] Found district ID: ${district.id}`);
          return district.id;
        }
      }
      console.warn(`[enquiry-form] District "${name}" not found`);
      return '';
    }

    if (type === 'taluk') {
      // If we have stateId, search more efficiently
      if (stateId) {
        console.log(`[enquiry-form] Searching taluk in state: ${stateId}`);
        const districts = getDistrictsByState(stateId);
        for (const district of districts) {
          const taluks = getTaluksByDistrict(stateId, district.id);
          const taluk = taluks.find((t) => t.name === name);
          if (taluk) {
            console.log(`[enquiry-form] Found taluk ID: ${taluk.id}`);
            return taluk.id;
          }
        }
      } else {
        // Search all states if no stateId provided
        console.log(`[enquiry-form] Searching taluk across all states`);
        for (const state of indianStates) {
          const districts = getDistrictsByState(state.id);
          for (const district of districts) {
            const taluks = getTaluksByDistrict(state.id, district.id);
            const taluk = taluks.find((t) => t.name === name);
            if (taluk) {
              console.log(`[enquiry-form] Found taluk ID: ${taluk.id}`);
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
 * EnquiryForm Component
 *
 * Complete multi-step form for learner enquiries
 * Features:
 * - 5 tabs with comprehensive fields
 * - Save draft functionality
 * - Form validation on submit
 * - All admission fields included
 */
export function EnquiryForm({ learner, onSuccess }: EnquiryFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [activeTab, setActiveTab] = useState('basic-details');
  const [savedEnquiryId, setSavedEnquiryId] = useState<string | null>(learner?.id || null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Initialize form with all fields
  const form = useForm<EnquiryFormValues>({
    resolver: zodResolver(enquiryFormSchema),
    defaultValues: learner
      ? {
          // Basic Details
          enquiry_date: learner.enquiry_date || new Date().toISOString().split('T')[0],
          first_name: learner.first_name || '',
          last_name: learner.last_name || '',
          date_of_birth: learner.date_of_birth || '',
          gender: learner.gender as 'Male' | 'Female' | 'Other' | undefined,
          religion: learner.religion || '',
          community: learner.community || '',
          caste: learner.caste || '',
          aadhar_number: learner.aadhar_number || '',

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
          board_of_study: learner.board_of_study || '',
          tenth_marks: {
            max_marks: learner.tenth_marks?.max_marks || '',
            obtained_marks: learner.tenth_marks?.obtained_marks || '',
            percentage: learner.tenth_marks?.percentage || '',
          },
          twelfth_marks: {
            group: learner.twelfth_marks?.group || '',
            max_marks: learner.twelfth_marks?.max_marks || '',
            obtained_marks: learner.twelfth_marks?.obtained_marks || '',
            percentage: learner.twelfth_marks?.percentage || '',
            subjects: {
              physics: learner.twelfth_marks?.subjects?.physics || '',
              chemistry: learner.twelfth_marks?.subjects?.chemistry || '',
              mathematics: learner.twelfth_marks?.subjects?.mathematics || '',
              biology: learner.twelfth_marks?.subjects?.biology || '',
              botany: learner.twelfth_marks?.subjects?.botany || '',
              zoology: learner.twelfth_marks?.subjects?.zoology || '',
              computer_science: learner.twelfth_marks?.subjects?.computer_science || '',
              accountancy: learner.twelfth_marks?.subjects?.accountancy || '',
              commerce: learner.twelfth_marks?.subjects?.commerce || '',
              economics: learner.twelfth_marks?.subjects?.economics || '',
              statistics: learner.twelfth_marks?.subjects?.statistics || '',
              history: learner.twelfth_marks?.subjects?.history || '',
              geography: learner.twelfth_marks?.subjects?.geography || '',
            },
          },
          neet_roll_number: learner.neet_roll_number || '',
          neet_score: learner.neet_score || '',
          medical_cutoff_marks: learner.medical_cutoff_marks || '',
          engineering_cutoff_marks: learner.engineering_cutoff_marks || '',
          counseling_applied: learner.counseling_applied || false,
          counseling_number: learner.counseling_number || '',
          first_graduate: learner.first_graduate || false,
          quota: learner.quota || '',
          category: learner.category || '',
          entry_type: learner.entry_type || '',

          // Course Selection
          institution_id: learner.institution_id || '',
          degree_id: learner.degree_id || '',
          department_id: learner.department_id || '',
          program_id: learner.program_id || '',
          academic_year_id: learner.academic_year_id || '',
          semester_id: learner.semester_id || '',
          section_id: learner.section_id || '',
          roll_number: learner.roll_number || '',
          register_number: learner.register_number || '',
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
          reference_type: learner.reference_type || '',
          reference_name: learner.reference_name || '',
          reference_contact: learner.reference_contact || '',
        }
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
          first_graduate: false,
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

    // Helper to convert location IDs to names for database storage
    const getLocationNameById = (
      id: string | undefined,
      type: 'state' | 'district' | 'taluk',
      stateId?: string,
      districtId?: string
    ): string | undefined => {
      if (!id) return undefined;

      if (type === 'state') {
        // Import location data
        const { indianStates } = require('@/lib/data/locations');
        return indianStates.find((s: any) => s.id === id)?.name;
      } else if (type === 'district') {
        const { getDistrictsByState } = require('@/lib/data/locations');
        if (!stateId) return undefined;
        const districts = getDistrictsByState(stateId);
        return districts.find((d: any) => d.id === id)?.name;
      } else if (type === 'taluk') {
        const { getTaluksByDistrict } = require('@/lib/data/locations');
        if (!stateId || !districtId) return undefined;
        const taluks = getTaluksByDistrict(stateId, districtId);
        return taluks.find((t: any) => t.id === id)?.name;
      }
      return undefined;
    };

    return {
      // Basic Details (string fields - NOT NULL)
      first_name: values.first_name || '',
      last_name: values.last_name || undefined,
      date_of_birth: values.date_of_birth || '',
      gender: values.gender || '',
      religion: values.religion || '',
      community: values.community || '',
      caste: values.caste || undefined,
      aadhar_number: values.aadhar_number || undefined,
      enquiry_date: values.enquiry_date || undefined,

      // Family Information (NOT NULL fields)
      father_name: values.father_name || '',
      father_occupation: values.father_occupation || undefined,
      father_mobile: values.father_mobile || '',
      mother_name: values.mother_name || '',
      mother_occupation: values.mother_occupation || undefined,
      mother_mobile: values.mother_mobile || '',
      annual_income: values.annual_income || undefined,

      // Academic Information (NOT NULL fields)
      last_school: values.last_school || '',
      board_of_study: values.board_of_study || '',
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
      first_graduate: values.first_graduate || undefined,
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

      // Contact Details (NOT NULL fields)
      student_mobile: values.student_mobile || '',
      student_email: values.student_email || '',
      permanent_address_street: values.permanent_address_street || '',
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
      reference_name: values.reference_name || undefined,
      reference_contact: values.reference_contact || undefined,

      // System fields
      lifecycle_status: 'enquiry' as const,
      is_profile_complete: false,
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
      const errorMessages = Object.entries(errors)
        .map(([field, messages]) => `${field}: ${messages?.join(', ')}`)
        .join('\n');

      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = formatFormDataForAPI(values);

      let result: LearnerProfile;

      if (learner) {
        result = await LearnerProfileService.updateLearnerProfile(learner.id, data);
        toast.success('Enquiry updated successfully');
      } else if (savedEnquiryId) {
        // Update existing draft with final submission
        result = await LearnerProfileService.updateLearnerProfile(savedEnquiryId, data);
        toast.success('Enquiry submitted successfully');
      } else {
        result = await LearnerProfileService.createLearnerProfile(data as any);
        toast.success('Enquiry created successfully');
      }

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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            {formTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="basic-details" className="space-y-4">
            <Card className="p-6">
              <BasicDetailsSection form={form} />
            </Card>
          </TabsContent>

          <TabsContent value="academic-information" className="space-y-4">
            <Card className="p-6">
              <AcademicInformationSection form={form} />
            </Card>
          </TabsContent>

          <TabsContent value="course-selection" className="space-y-4">
            <Card className="p-6">
              <CourseSelectionSection form={form} />
            </Card>
          </TabsContent>

          <TabsContent value="contact-details" className="space-y-4">
            <Card className="p-6">
              <ContactDetailsSection form={form} />
            </Card>
          </TabsContent>

          <TabsContent value="accommodation-preferences" className="space-y-4">
            <Card className="p-6">
              <AccommodationPreferencesSection form={form} />
            </Card>
          </TabsContent>
        </Tabs>

        {/* Form Actions - Navigation Buttons */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t">
          {/* Left side - Cancel button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelClick}
            disabled={isSubmitting || isSavingDraft}
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>

          {/* Right side - Navigation and Action buttons */}
          <div className="flex items-center gap-2">
            {/* Previous Button - Show on all tabs except first */}
            {!isFirstTab && (
              <Button
                type="button"
                variant="outline"
                onClick={goToPreviousTab}
                disabled={isSubmitting || isSavingDraft}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
            )}

            {/* Save Draft Button - Always visible */}
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSubmitting || isSavingDraft}
            >
              {isSavingDraft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>

            {/* Save & Next Button - Show on all tabs except last */}
            {!isLastTab && (
              <Button
                type="button"
                onClick={handleSaveAndNext}
                disabled={isSubmitting || isSavingDraft}
              >
                {isSavingDraft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                Save & Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {/* Submit Button - Show only on last tab */}
            {isLastTab && (
              <Button type="submit" disabled={isSubmitting || isSavingDraft}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="mr-2 h-4 w-4" />
                {learner ? 'Update Enquiry' : 'Submit Enquiry'}
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
