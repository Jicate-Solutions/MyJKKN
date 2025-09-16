'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { BasicDetailsForm } from './form-sections/basic-details';
import { AcademicInformationForm } from './form-sections/academic-information';
import { ContactDetailsForm } from './form-sections/contact-details';
import { AccommodationPreferencesForm } from './form-sections/accommodation-preferences';
import { AdmissionService } from '@/lib/services/admission/admission-service';
import {
  useCreateAdmission,
  useCreateAdmissionFromDraft,
  useUpdateAdmission,
  useSaveDraftAdmission,
  useUpdateDraftAdmission
} from '@/hooks/admission/use-admissions';
import toast from 'react-hot-toast';
import { CourseSelectionForm } from './form-sections/course-selection';
import {
  indianStates,
  getDistrictsByState,
  getTaluksByDistrict
} from '@/lib/data/locations';

// Define the form schema with all sections - ALL FIELDS ARE OPTIONAL
const basicDetailsSchema = z.object({
  enquiryDate: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fatherName: z.string().optional(),
  fatherOccupation: z.string().optional(),
  fatherMobile: z.string().optional(),
  motherName: z.string().optional(),
  motherOccupation: z.string().optional(),
  motherMobile: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  religion: z.string().optional(),
  community: z.string().optional(),
  caste: z.string().optional(),
  annualIncome: z.string().optional()
});

// Schema for academic information - ALL FIELDS ARE OPTIONAL
const academicInformationSchema = z.object({
  lastSchool: z.string().optional(),
  boardOfStudy: z.string().optional(),
  tenthMarks: z.object({
    maxMarks: z.string().optional(),
    obtainedMarks: z.string().optional(),
    percentage: z.string().optional()
  }),
  twelfthMarks: z.object({
    group: z.string().optional(),
    maxMarks: z.string().optional(),
    obtainedMarks: z.string().optional(),
    percentage: z.string().optional(),
    subjects: z.record(z.string().optional()).optional()
  }),
  medicalCutoffMarks: z.string().optional(),
  engineeringCutoffMarks: z.string().optional(),
  neetRollNumber: z.string().optional(),
  counselingApplied: z.boolean().optional(),
  counselingNumber: z.string().optional(),
  firstGraduate: z.boolean().optional()
});

// Schema for course selection - ALL FIELDS ARE OPTIONAL
const courseSelectionSchema = z.object({
  quota: z.string().optional(),
  category: z.string().optional(),
  institution_id: z.string().optional(),
  degreeId: z.string().optional(),
  departmentId: z.string().optional(),
  programId: z.string().optional(),
  entryType: z.string().optional()
});

// Schema for contact details - ALL FIELDS ARE OPTIONAL
const contactDetailsSchema = z.object({
  permanentAddressStreet: z.string().optional(),
  permanentAddressTaluk: z.string().optional(),
  permanentAddressDistrict: z.string().optional(),
  permanentAddressPinCode: z.string().optional(),
  permanentAddressState: z.string().optional(),
  studentMobile: z.string().optional(),
  studentEmail: z.string().optional()
});

// Schema for accommodation preferences - ALL FIELDS ARE OPTIONAL
const accommodationPreferencesSchema = z.object({
  accommodationType: z.string().optional(),
  hostelType: z.string().optional(),
  busRequired: z.boolean().optional(),
  busRoute: z.string().optional(),
  busPickupLocation: z.string().optional(),
  referenceType: z.string().optional(),
  referenceName: z.string().optional(),
  referenceContact: z.string().optional()
});

// Combine all schemas into one
const admissionFormSchema = z.object({
  ...basicDetailsSchema.shape,
  ...academicInformationSchema.shape,
  ...courseSelectionSchema.shape,
  ...contactDetailsSchema.shape,
  ...accommodationPreferencesSchema.shape
});

type AdmissionFormValues = z.infer<typeof admissionFormSchema>;

// These are the tabs for our form sections
const formTabs = [
  { id: 'basic-details', label: 'Basic Details' },
  { id: 'academic-information', label: 'Academic Information' },
  { id: 'course-selection', label: 'Course Selection' },
  { id: 'contact-details', label: 'Contact Details' },
  { id: 'accommodation-preferences', label: 'Accommodation' }
];

export function AdmissionForm({
  initialData,
  isEditing
}: {
  initialData?: any;
  isEditing?: boolean;
}) {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [activeTab, setActiveTab] = useState(formTabs[0].id);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [savedAdmissionId, setSavedAdmissionId] = useState(initialData?.id || null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Use the React Query mutations
  const createAdmission = useCreateAdmission();
  const createAdmissionFromDraft = useCreateAdmissionFromDraft();
  const updateAdmission = useUpdateAdmission(initialData?.id);
  const saveDraftAdmission = useSaveDraftAdmission();
  const updateDraftAdmission = useUpdateDraftAdmission();

  // Log initial data for debugging
  useEffect(() => {
    if (isEditing && initialData) {
      console.log('Initial data received in AdmissionForm:', initialData);
    }
  }, [initialData, isEditing]);

  // Scroll to top whenever tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  // Helper function to ensure we have proper defaults for nested objects
  const ensureNestedDefaults = (data: any) => {
    if (!data) return null;

    console.log('Initial data before processing:', data);

    // Special handling for tenthMarks
    let tenthMarks = data.tenthMarks || {};

    // Convert from database format if necessary (tenth_marks -> tenthMarks)
    if (data.tenth_marks && !data.tenthMarks) {
      const dbMarks =
        typeof data.tenth_marks === 'string'
          ? JSON.parse(data.tenth_marks)
          : data.tenth_marks;

      tenthMarks = {
        maxMarks: dbMarks.maxMarks || dbMarks.max_marks || '',
        obtainedMarks: dbMarks.obtainedMarks || dbMarks.obtained_marks || '',
        percentage: dbMarks.percentage || ''
      };
    }

    // Special handling for twelfthMarks
    let twelfthMarks = data.twelfthMarks || {};

    // Convert from database format if necessary (twelfth_marks -> twelfthMarks)
    if (data.twelfth_marks && !data.twelfthMarks) {
      const dbMarks =
        typeof data.twelfth_marks === 'string'
          ? JSON.parse(data.twelfth_marks)
          : data.twelfth_marks;

      twelfthMarks = {
        group: dbMarks.group || '',
        maxMarks: dbMarks.maxMarks || dbMarks.max_marks || '',
        obtainedMarks: dbMarks.obtainedMarks || dbMarks.obtained_marks || '',
        percentage: dbMarks.percentage || '',
        subjects: dbMarks.subjects || {}
      };
    }

    console.log('Processed marks data:', { tenthMarks, twelfthMarks });

    return {
      ...data,
      religion: data.religion || '',
      community: data.community || '',
      tenthMarks: {
        maxMarks: tenthMarks.maxMarks || '',
        obtainedMarks: tenthMarks.obtainedMarks || '',
        percentage: tenthMarks.percentage || ''
      },
      twelfthMarks: {
        group: twelfthMarks.group || '',
        maxMarks: twelfthMarks.maxMarks || '',
        obtainedMarks: twelfthMarks.obtainedMarks || '',
        percentage: twelfthMarks.percentage || '',
        subjects: twelfthMarks.subjects || {}
      },
      hostelType: data.hostelType || '',
      referenceType: data.referenceType || '',
      referenceName: data.referenceName || '',
      referenceContact: data.referenceContact || ''
    };
  };

  // Initialize the form with default values or initialData for editing
  const form = useForm<AdmissionFormValues>({
    resolver: zodResolver(admissionFormSchema),
    defaultValues: initialData
      ? ensureNestedDefaults(initialData)
      : {
          // Default values for a new admission
          // Basic Details
          enquiryDate: new Date().toISOString().split('T')[0],
          firstName: '',
          lastName: '',
          fatherName: '',
          fatherOccupation: '',
          fatherMobile: '',
          motherName: '',
          motherOccupation: '',
          motherMobile: '',
          dateOfBirth: '',
          gender: '',
          religion: '',
          community: '',
          caste: '',
          annualIncome: '',

          // Academic Information
          lastSchool: '',
          boardOfStudy: '',
          tenthMarks: {
            maxMarks: '',
            obtainedMarks: '',
            percentage: ''
          },
          twelfthMarks: {
            group: '',
            maxMarks: '',
            obtainedMarks: '',
            percentage: '',
            subjects: {}
          },
          medicalCutoffMarks: '',
          engineeringCutoffMarks: '',
          neetRollNumber: '',
          counselingApplied: false,
          counselingNumber: '',
          firstGraduate: false,

          // Course Selection
          quota: '',
          category: '',
          institution_id: '',
          degreeId: '',
          departmentId: '',
          programId: '',
          entryType: '',

          // Contact Details
          permanentAddressStreet: '',
          permanentAddressTaluk: '',
          permanentAddressDistrict: '',
          permanentAddressPinCode: '',
          permanentAddressState: '',
          studentMobile: '',
          studentEmail: '',

          // Accommodation Preferences
          accommodationType: '',
          hostelType: '',
          busRequired: false,
          busRoute: '',
          busPickupLocation: '',
          referenceType: '',
          referenceName: '',
          referenceContact: ''
        },
    mode: 'onBlur',
    criteriaMode: 'all'
  });

  // Log form values after initialization
  useEffect(() => {
    if (isEditing) {
      console.log('Form values after initialization:', form.getValues());
    }
  }, [form, isEditing]);

  // Log form values when they change
  useEffect(() => {
    if (isEditing) {
      const subscription = form.watch((value) => {
        console.log('Current form values:', value);
      });

      return () => subscription.unsubscribe();
    }
  }, [form, isEditing]);

  // Function to move to the next tab
  const goToNextTab = () => {
    const currentIndex = formTabs.findIndex((tab) => tab.id === activeTab);
    if (currentIndex < formTabs.length - 1) {
      setActiveTab(formTabs[currentIndex + 1].id);
      // Scroll to top of the page
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Function to move to the previous tab
  const goToPreviousTab = () => {
    const currentIndex = formTabs.findIndex((tab) => tab.id === activeTab);
    if (currentIndex > 0) {
      setActiveTab(formTabs[currentIndex - 1].id);
      // Scroll to top of the page
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Function to validate the current section before proceeding - ALL FIELDS ARE OPTIONAL NOW
  const validateSection = async () => {
    // Since all fields are now optional, we can always proceed to the next section
    // Only perform basic validation for format (like email format if provided)
    const result = await form.trigger();
    return result;
  };

  // Function to display error toast with consistent styling
  const showErrorToast = (content: string) => {
    toast.error(content);
  };

  // Helper function to convert location IDs to display names
  const getLocationNameById = (
    id: string | undefined,
    type: 'state' | 'district' | 'taluk',
    stateId?: string,
    districtId?: string
  ): string | undefined => {
    if (!id) return undefined;

    switch (type) {
      case 'state':
        return indianStates.find((state) => state.id === id)?.name;

      case 'district':
        if (!stateId) return undefined;
        const districts = getDistrictsByState(stateId);
        return districts.find((district) => district.id === id)?.name;

      case 'taluk':
        if (!stateId || !districtId) return undefined;
        const taluks = getTaluksByDistrict(stateId, districtId);
        return taluks.find((taluk) => taluk.id === id)?.name;

      default:
        return undefined;
    }
  };

  // Function to get error message for a field (handles nested fields)
  const getErrorMessage = (errors: any, field: string): string | undefined => {
    // Handle nested fields like 'tenthMarks.maxMarks'
    const fieldParts = field.split('.');
    let currentErrors = errors;

    // Navigate through nested objects
    for (let i = 0; i < fieldParts.length; i++) {
      const part = fieldParts[i];

      if (!currentErrors[part as keyof typeof currentErrors]) {
        return undefined;
      }

      // If this is the last part, return message
      if (i === fieldParts.length - 1) {
        return (currentErrors[part as keyof typeof currentErrors] as any)
          .message;
      }

      // Otherwise, continue to nested errors
      currentErrors = currentErrors[part as keyof typeof currentErrors] as any;
    }

    return undefined;
  };

  // Handle Save and Next button click
  const handleSaveAndNext = async () => {
    // Prevent double-click by checking if already saving
    if (isSavingSection || isSubmitting) {
      return;
    }
    
    setIsSavingSection(true);
    try {
      // Get current form data
      const formData = form.getValues();
      
      // Convert form data to API format (partial data for draft)
      const formattedData = formatFormDataForAPI(formData, true); // true for draft mode

      if (savedAdmissionId) {
        // Update existing draft
        await updateDraftAdmission.mutateAsync({ 
          id: savedAdmissionId, 
          data: formattedData 
        });
        toast.success('Section saved successfully');
      } else {
        // Create new draft
        const result = await saveDraftAdmission.mutateAsync(formattedData);
        setSavedAdmissionId(result.id);
        toast.success('Section saved successfully');
      }
      
      // Move to next tab
      goToNextTab();
    } catch (error: any) {
      console.error('Error saving section:', error);
      toast.error(`Failed to save section: ${error.message}`);
    } finally {
      setIsSavingSection(false);
    }
  };

  // Handle next button click (without saving)
  const handleNext = async () => {
    // Since all fields are optional, we can always proceed
    const isValid = await validateSection();
    if (isValid) {
      goToNextTab();
    } else {
      // Show format validation errors if any
      const errors = form.formState.errors;
      if (Object.keys(errors).length > 0) {
        toast.error('Please correct the format errors before continuing');
      }
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    setShowCancelDialog(true);
  };

  // Handle confirmed cancellation
  const handleConfirmCancel = async () => {
    setShowCancelDialog(false);

    try {
      // If there's a saved admission ID, delete the draft
      if (savedAdmissionId) {
        const { error } = await supabase
          .from('admissions')
          .delete()
          .eq('id', savedAdmissionId)
          .eq('status', 'draft'); // Only delete if it's a draft

        if (error) {
          console.error('Error deleting draft admission:', error);
          toast.error('Failed to cancel admission. Please try again.');
          return;
        }

        toast.success('Draft admission cancelled successfully');
      } else {
        toast.success('Admission cancelled');
      }

      // Redirect back to admissions list
      router.push('/admissions');
    } catch (error) {
      console.error('Error cancelling admission:', error);
      toast.error('Failed to cancel admission. Please try again.');
    }
  };

  // Function to format form data for API (reusable for both draft and final submission)
  const formatFormDataForAPI = (data: AdmissionFormValues, isDraft: boolean = false) => {
    // Helper function to check if a string is a valid UUID
    function isValidUUID(str: string | undefined): boolean {
      if (!str) return false;
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidPattern.test(str);
    }

    // Helper function to convert string to uppercase (except email fields)
    function formatStringValue(
      str: string,
      isEmail: boolean = false
    ): string {
      if (!str) return '';
      return isEmail ? str.trim().toLowerCase() : str.trim().toUpperCase();
    }

    // Helper function to format accommodation type
    function formatAccommodationType(type: string): string {
      if (!type) return '';
      return type.replace(/_/g, ' ').toUpperCase();
    }

    return {
      // Map camelCase field names to snake_case for Supabase
      first_name: formatStringValue(data.firstName || ''),
      last_name: formatStringValue(data.lastName || ''),
      father_name: formatStringValue(data.fatherName || ''),
      father_occupation: formatStringValue(data.fatherOccupation || ''),
      father_mobile: data.fatherMobile || '',
      mother_name: formatStringValue(data.motherName || ''),
      mother_occupation: formatStringValue(data.motherOccupation || ''),
      mother_mobile: data.motherMobile || '',
      date_of_birth: data.dateOfBirth || '',
      gender: formatStringValue(data.gender || ''),
      religion: formatStringValue(data.religion || ''),
      community: formatStringValue(data.community || ''),
      caste: formatStringValue(data.caste || ''),
      annual_income: data.annualIncome || '',

      // Academic Information
      last_school: formatStringValue(data.lastSchool || ''),
      board_of_study: formatStringValue(data.boardOfStudy || ''),
      tenth_marks: {
        max_marks: data.tenthMarks?.maxMarks || '',
        obtained_marks: data.tenthMarks?.obtainedMarks || '',
        percentage: data.tenthMarks?.percentage || ''
      },
      twelfth_marks: {
        group: data.twelfthMarks?.group || '',
        max_marks: data.twelfthMarks?.maxMarks || '',
        obtained_marks: data.twelfthMarks?.obtainedMarks || '',
        percentage: data.twelfthMarks?.percentage || '',
        subjects: Object.entries(data.twelfthMarks?.subjects || {}).reduce(
          (acc, [key, value]) => {
            acc[key] = value || '';
            return acc;
          },
          {} as Record<string, string>
        )
      },
      medical_cutoff_marks: data.medicalCutoffMarks || '',
      engineering_cutoff_marks: data.engineeringCutoffMarks || '',
      neet_roll_number: data.neetRollNumber || '',
      counseling_applied: data.counselingApplied || false,
      counseling_number: data.counselingNumber || '',
      first_graduate: data.firstGraduate || false,

      // Course Selection - handle both UUIDs and string values
      quota: formatStringValue(data.quota || ''),
      category: formatStringValue(data.category || ''),
      institution_id: data.institution_id || undefined,
      degree_id: isValidUUID(data.degreeId) ? data.degreeId : undefined,
      department_id: isValidUUID(data.departmentId) ? data.departmentId : undefined,
      program_id: isValidUUID(data.programId) ? data.programId : undefined,
      entry_type: formatStringValue(data.entryType || ''),

      // Contact Details
      permanent_address_street: formatStringValue(data.permanentAddressStreet || ''),
      permanent_address_taluk: formatStringValue(
        getLocationNameById(
          data.permanentAddressTaluk,
          'taluk',
          data.permanentAddressState,
          data.permanentAddressDistrict
        ) || ''
      ),
      permanent_address_district: formatStringValue(
        getLocationNameById(
          data.permanentAddressDistrict,
          'district',
          data.permanentAddressState
        ) || data.permanentAddressDistrict || ''
      ),
      permanent_address_pin_code: data.permanentAddressPinCode || '',
      permanent_address_state: formatStringValue(
        getLocationNameById(data.permanentAddressState, 'state') ||
          data.permanentAddressState || ''
      ),
      student_mobile: data.studentMobile || '',
      student_email: formatStringValue(data.studentEmail || '', true), // Keep email lowercase

      // Accommodation Preferences
      accommodation_type: formatAccommodationType(data.accommodationType || ''),
      hostel_type: formatStringValue(data.hostelType || ''),
      bus_required: data.busRequired || false,
      bus_route: formatStringValue(data.busRoute || ''),
      bus_pickup_location: formatStringValue(data.busPickupLocation || ''),
      reference_type: formatStringValue(data.referenceType || ''),
      reference_name: formatStringValue(data.referenceName || ''),
      reference_contact: data.referenceContact || '',

      // Status - draft for saving sections, pending for final submission
      status: isDraft ? 'draft' : 'pending'
    };
  };

  // Handle form submission
  const onSubmit = async (data: AdmissionFormValues) => {
    // Prevent double-click by checking if already submitting
    if (isSubmitting || isSavingSection) {
      return;
    }
    
    setIsSubmitting(true);

    try {
      // Validate the entire form
      const isValid = await form.trigger();
      if (!isValid) {
        const errors = form.formState.errors;
        const errorFields = Object.keys(errors).concat(
          // Add nested field paths for complex objects
          Object.entries(errors)
            .filter(
              ([_, value]) =>
                typeof value === 'object' &&
                value !== null &&
                !('message' in value)
            )
            .flatMap(([parent, value]) =>
              Object.keys(value).map((key) => `${parent}.${key}`)
            )
        );

        if (errorFields.length > 0) {
          const readableErrors = errorFields
            .filter((field) => getErrorMessage(errors, field)) // Only include fields with error messages
            .map((field) => {
              const fieldName = getReadableFieldName(field);
              const errorMessage = getErrorMessage(errors, field);
              return `${fieldName}${errorMessage ? `: ${errorMessage}` : ''}`;
            });

          // Display a toast with the validation errors
          toast.error(
            'Form has validation errors. Please check and correct the form.'
          );

          // Find the first tab with errors and switch to it
          let tabFound = false;
          for (const tab of formTabs) {
            const fieldsToValidate = getFieldsForTab(tab.id);
            const hasError = fieldsToValidate.some((field) => {
              const fieldParts = field.split('.');
              let currentErrors = errors;

              // Navigate through nested objects to check for errors
              for (let i = 0; i < fieldParts.length; i++) {
                const part = fieldParts[i];
                if (!currentErrors[part as keyof typeof currentErrors])
                  return false;
                currentErrors = currentErrors[
                  part as keyof typeof currentErrors
                ] as any;
              }

              return true;
            });

            if (hasError && !tabFound) {
              tabFound = true;
              setActiveTab(tab.id);
              // Scroll to the top
              window.scrollTo({ top: 0, behavior: 'smooth' });
              toast(`Please correct errors in the "${tab.label}" section`);
              break;
            }
          }
          setIsSubmitting(false);
          return;
        }
      }

      // Convert form data to the format expected by Supabase
      const formattedData = formatFormDataForAPI(data, false); // false for final submission

      console.log('Form data to submit:', formattedData);

      if (isEditing) {
        // Update existing admission application
        updateAdmission.mutate(formattedData, {
          onSuccess: () => {
            toast.success('Admission application updated successfully');
            // Redirect to the admission details page
            router.push(`/admissions/${initialData.id}`);
          },
          onError: (error: Error) => {
            console.error('Error updating admission:', error);
            toast.error(
              `Failed to update admission application: ${error.message}`
            );
          }
        });
      } else {
        // Check if this is a conversion from draft to final
        if (savedAdmissionId) {
          // Convert draft to final submission
          createAdmissionFromDraft.mutate(
            { draftId: savedAdmissionId, data: formattedData },
            {
              onSuccess: (data) => {
                toast.success('Admission application submitted successfully');
                // Redirect to the admissions list page
                router.push('/admissions');
              },
              onError: (error: Error) => {
                console.error('Error converting draft to final admission:', error);
                toast.error(
                  `Failed to submit admission application: ${error.message}`
                );
              }
            }
          );
        } else {
          // Create new admission application (no draft exists)
          createAdmission.mutate(formattedData, {
            onSuccess: (data) => {
              toast.success('Admission application submitted successfully');

              // Redirect to the admissions list page
              router.push('/admissions');
            },
            onError: (error: Error) => {
              console.error('Error creating admission:', error);
              toast.error(
                `Failed to submit admission application: ${error.message}`
              );
            }
          });
        }
      }
    } catch (error: any) {
      console.error('Error submitting form:', error);
      toast.error(
        `Failed to ${isEditing ? 'update' : 'submit'} admission application: ${
          error.message
        }`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Function to get fields for a specific tab
  const getFieldsForTab = (tabId: string): string[] => {
    switch (tabId) {
      case 'basic-details':
        return [
          'firstName',
          'fatherName',
          'fatherMobile',
          'motherName',
          'motherMobile',
          'dateOfBirth',
          'gender',
          'religion',
          'community'
        ];
      case 'academic-information':
        return [
          'lastSchool',
          'boardOfStudy',
          'tenthMarks.maxMarks',
          'tenthMarks.obtainedMarks'
        ];
      case 'course-selection':
        return [
          'institution_id',
          'degreeId',
          'departmentId',
          'programId',
          'entryType'
        ];
      case 'contact-details':
        return [
          'permanentAddressStreet',
          'permanentAddressDistrict',
          'permanentAddressPinCode',
          'permanentAddressState',
          'studentMobile',
          'studentEmail'
        ];
      case 'accommodation-preferences':
        return ['accommodationType'];
      default:
        return [];
    }
  };

  // Function to convert field names to readable format
  const getReadableFieldName = (field: string): string => {
    const fieldMap: Record<string, string> = {
      firstName: 'First Name',
      lastName: 'Last Name',
      fatherName: "Father's Name",
      fatherMobile: "Father's Mobile",
      motherName: "Mother's Name",
      motherMobile: "Mother's Mobile",
      dateOfBirth: 'Date of Birth',
      gender: 'Gender',
      religion: 'Religion',
      community: 'Community',
      lastSchool: 'Last School',
      boardOfStudy: 'Board of Study',
      'tenthMarks.maxMarks': 'Class 10 Maximum Marks',
      'tenthMarks.obtainedMarks': 'Class 10 Obtained Marks',
      'twelfthMarks.group': 'Class 12 Group',
      'twelfthMarks.maxMarks': 'Class 12 Maximum Marks',
      'twelfthMarks.obtainedMarks': 'Class 12 Obtained Marks',
      institution_id: 'Institution',
      degreeId: 'Degree',
      departmentId: 'Department',
      programId: 'Program',
      entryType: 'Entry Type',
      permanentAddressStreet: 'Street Address',
      permanentAddressDistrict: 'District',
      permanentAddressPinCode: 'PIN Code',
      permanentAddressState: 'State',
      studentMobile: 'Student Mobile',
      studentEmail: 'Student Email',
      accommodationType: 'Accommodation Type',
      hostelType: 'Hostel Type',
      busRequired: 'Bus Required',
      busRoute: 'Bus Route',
      busPickupLocation: 'Bus Pickup Location'
    };

    // Handle nested and unmapped fields
    if (fieldMap[field]) {
      return fieldMap[field];
    }

    // Format camelCase to words
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
          <TabsList className='grid w-full grid-cols-2 md:grid-cols-5'>
            {formTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                disabled={isSubmitting}
                className='text-xs md:text-sm'
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className='mt-6'>
            <TabsContent value='basic-details'>
              <Card className='p-6'>
                <BasicDetailsForm form={form} />
              </Card>
            </TabsContent>

            <TabsContent value='academic-information'>
              <Card className='p-6'>
                <AcademicInformationForm form={form} />
              </Card>
            </TabsContent>

            <TabsContent value='course-selection'>
              <Card className='p-6'>
                <CourseSelectionForm form={form} />
              </Card>
            </TabsContent>

            <TabsContent value='contact-details'>
              <Card className='p-6'>
                <ContactDetailsForm form={form} />
              </Card>
            </TabsContent>

            <TabsContent value='accommodation-preferences'>
              <Card className='p-6'>
                <AccommodationPreferencesForm form={form} />
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        <div className='flex justify-between'>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={goToPreviousTab}
              disabled={activeTab === formTabs[0].id || isSubmitting || isSavingSection || saveDraftAdmission.isPending || updateDraftAdmission.isPending || createAdmission.isPending || updateAdmission.isPending}
            >
              Previous
            </Button>

            <Button
              type='button'
              variant='destructive'
              onClick={handleCancel}
              disabled={isSubmitting || isSavingSection || saveDraftAdmission.isPending || updateDraftAdmission.isPending || createAdmission.isPending || updateAdmission.isPending}
              className='text-white'
            >
              Cancel
            </Button>
          </div>

          <div className='flex gap-2'>
            {activeTab !== formTabs[formTabs.length - 1].id ? (
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={handleNext}
                  disabled={isSubmitting || isSavingSection || saveDraftAdmission.isPending || updateDraftAdmission.isPending || createAdmission.isPending || updateAdmission.isPending}
                >
                  Next
                </Button>
                <Button
                  type='button'
                  onClick={handleSaveAndNext}
                  disabled={isSubmitting || isSavingSection || saveDraftAdmission.isPending || updateDraftAdmission.isPending}
                >
                  {(isSavingSection || saveDraftAdmission.isPending || updateDraftAdmission.isPending) ? 'Saving...' : 'Save & Next'}
                </Button>
              </>
            ) : (
              <Button type='submit' disabled={isSubmitting || isSavingSection || createAdmission.isPending || createAdmissionFromDraft.isPending || updateAdmission.isPending}>
                {(isSubmitting || createAdmission.isPending || createAdmissionFromDraft.isPending || updateAdmission.isPending)
                  ? isEditing
                    ? 'Updating...'
                    : 'Submitting...'
                  : isEditing
                  ? 'Update Application'
                  : 'Submit Application'}
              </Button>
            )}
          </div>
        </div>
      </form>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Cancel Admission</DialogTitle>
            <DialogDescription>
              {savedAdmissionId
                ? 'Are you sure you want to cancel this admission? All saved data will be permanently deleted and cannot be recovered.'
                : 'Are you sure you want to cancel this admission? Any unsaved changes will be lost.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowCancelDialog(false)}
            >
              Keep Editing
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={handleConfirmCancel}
            >
              {savedAdmissionId ? 'Delete & Cancel' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
