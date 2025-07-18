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
import { BasicDetailsForm } from './form-sections/basic-details';
import { AcademicInformationForm } from './form-sections/academic-information';
import { ContactDetailsForm } from './form-sections/contact-details';
import { AccommodationPreferencesForm } from './form-sections/accommodation-preferences';
import { AdmissionService } from '@/lib/services/admission/admission-service';
import {
  useCreateAdmission,
  useUpdateAdmission
} from '@/hooks/admission/use-admissions';
import toast from 'react-hot-toast';
import { CourseSelectionForm } from './form-sections/course-selection';
import {
  indianStates,
  getDistrictsByState,
  getTaluksByDistrict
} from '@/lib/data/locations';

// Define the form schema with all sections
const basicDetailsSchema = z.object({
  enquiryDate: z.string().optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
  fatherName: z.string().min(1, "Father's name is required"),
  fatherOccupation: z.string().optional(),
  fatherMobile: z.string().length(10, 'Mobile number must be 10 digits'),
  motherName: z.string().min(1, "Mother's name is required"),
  motherOccupation: z.string().optional(),
  motherMobile: z.string().length(10, 'Mobile number must be 10 digits'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.string().min(1, 'Gender is required'),
  religion: z.string().min(1, 'Religion is required'),
  community: z.string().min(1, 'Community is required'),
  caste: z.string().optional(),
  annualIncome: z.string().optional()
});

// Schema for academic information
const academicInformationSchema = z.object({
  lastSchool: z.string().min(1, 'Last school/college is required'),
  boardOfStudy: z.string().min(1, 'Board of study is required'),
  tenthMarks: z.object({
    maxMarks: z.string().min(1, 'Max marks are required'),
    obtainedMarks: z.string().min(1, 'Obtained marks are required'),
    percentage: z.string().optional()
  }),
  twelfthMarks: z.object({
    group: z.string().min(1, 'Group/stream is required'),
    maxMarks: z.string().min(1, 'Max marks are required'),
    obtainedMarks: z.string().min(1, 'Obtained marks are required'),
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

// Schema for course selection
const courseSelectionSchema = z.object({
  quota: z.string().optional(),
  category: z.string().optional(),
  institution_id: z.string().min(1, 'Institution is required'),
  degreeId: z.string().min(1, 'Degree is required'),
  departmentId: z.string().min(1, 'Department is required'),
  programId: z.string().min(1, 'Program is required'),
  entryType: z.string().min(1, 'Entry type is required')
});

// Schema for contact details
const contactDetailsSchema = z.object({
  permanentAddressStreet: z.string().min(1, 'Street address is required'),
  permanentAddressTaluk: z.string().optional(),
  permanentAddressDistrict: z.string().min(1, 'District is required'),
  permanentAddressPinCode: z.string().length(6, 'PIN code must be 6 digits'),
  permanentAddressState: z.string().min(1, 'State is required'),
  studentMobile: z.string().length(10, 'Mobile number must be 10 digits'),
  studentEmail: z.string().email('Invalid email address')
});

// Schema for accommodation preferences
const accommodationPreferencesSchema = z.object({
  accommodationType: z.string().min(1, 'Accommodation type is required'),
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

  // Use the React Query mutations
  const createAdmission = useCreateAdmission();
  const updateAdmission = useUpdateAdmission(initialData?.id);

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

  // Function to validate the current section before proceeding
  const validateSection = async () => {
    let fieldsToValidate: string[] = [];

    // Determine which fields to validate based on the active tab
    switch (activeTab) {
      case 'basic-details':
        fieldsToValidate = [
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
        break;
      case 'academic-information':
        fieldsToValidate = [
          'lastSchool',
          'boardOfStudy',
          'tenthMarks.maxMarks',
          'tenthMarks.obtainedMarks'
        ];
        break;
      case 'course-selection':
        fieldsToValidate = [
          'institution_id',
          'degreeId',
          'departmentId',
          'programId',
          'entryType'
        ];
        break;
      case 'contact-details':
        fieldsToValidate = [
          'permanentAddressStreet',
          'permanentAddressDistrict',
          'permanentAddressPinCode',
          'permanentAddressState',
          'studentMobile',
          'studentEmail'
        ];
        break;
      case 'accommodation-preferences':
        fieldsToValidate = ['accommodationType'];
        break;
    }

    const result = await form.trigger(fieldsToValidate as any);
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

  // Handle next button click
  const handleNext = async () => {
    // Trigger validation on the fields in the current section
    const isValid = await validateSection();
    if (isValid) {
      goToNextTab();
    } else {
      // If validation fails, show errors in the form fields
      // React Hook Form will automatically show error messages

      // Get the validation errors to show in toast
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

        // Show toast message with validation errors
        toast.error(
          `Please correct the following errors before continuing to the next section: ${readableErrors.join(
            ', '
          )}`
        );

        // Focus on the first error field
        const firstErrorField = errorFields[0];
        if (firstErrorField) {
          try {
            // Try to find and focus the element
            const element = document.querySelector(
              `[name="${firstErrorField}"]`
            ) as HTMLElement;
            if (element) {
              element.focus();
            }
          } catch (e) {
            console.error('Error focusing field:', e);
          }
        }
      }
    }
  };

  // Handle form submission
  const onSubmit = async (data: AdmissionFormValues) => {
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
      const formattedData = {
        // Map camelCase field names to snake_case for Supabase
        first_name: formatStringValue(data.firstName),
        last_name: formatStringValue(data.lastName || ''),
        father_name: formatStringValue(data.fatherName),
        father_occupation: formatStringValue(data.fatherOccupation || ''),
        father_mobile: data.fatherMobile,
        mother_name: formatStringValue(data.motherName),
        mother_occupation: formatStringValue(data.motherOccupation || ''),
        mother_mobile: data.motherMobile,
        date_of_birth: data.dateOfBirth,
        gender: formatStringValue(data.gender),
        religion: formatStringValue(data.religion),
        community: formatStringValue(data.community),
        caste: formatStringValue(data.caste || ''),
        annual_income: data.annualIncome || '',

        // Academic Information
        last_school: formatStringValue(data.lastSchool),
        board_of_study: formatStringValue(data.boardOfStudy),
        tenth_marks: {
          max_marks: data.tenthMarks.maxMarks,
          obtained_marks: data.tenthMarks.obtainedMarks,
          percentage: data.tenthMarks.percentage || ''
        },
        twelfth_marks: {
          group: data.twelfthMarks.group,
          max_marks: data.twelfthMarks.maxMarks,
          obtained_marks: data.twelfthMarks.obtainedMarks,
          percentage: data.twelfthMarks.percentage || '',
          subjects: Object.entries(data.twelfthMarks.subjects || {}).reduce(
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
        institution_id: data.institution_id,
        degree_id: isValidUUID(data.degreeId) ? data.degreeId : undefined,
        department_id: isValidUUID(data.departmentId)
          ? data.departmentId
          : undefined,
        program_id: isValidUUID(data.programId) ? data.programId : undefined,
        entry_type: formatStringValue(data.entryType),

        // Contact Details
        permanent_address_street: formatStringValue(
          data.permanentAddressStreet
        ),
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
          ) || data.permanentAddressDistrict
        ),
        permanent_address_pin_code: data.permanentAddressPinCode,
        permanent_address_state: formatStringValue(
          getLocationNameById(data.permanentAddressState, 'state') ||
            data.permanentAddressState
        ),
        student_mobile: data.studentMobile,
        student_email: formatStringValue(data.studentEmail, true), // Keep email lowercase

        // Accommodation Preferences
        accommodation_type: formatAccommodationType(data.accommodationType),
        hostel_type: formatStringValue(data.hostelType || ''),
        bus_required: data.busRequired || false,
        bus_route: formatStringValue(data.busRoute || ''),
        bus_pickup_location: formatStringValue(data.busPickupLocation || ''),
        reference_type: formatStringValue(data.referenceType || ''),
        reference_name: formatStringValue(data.referenceName || ''),
        reference_contact: data.referenceContact || '',

        // Status - new submissions are always pending
        status: 'pending'
      };

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
        // Create new admission application
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
          <Button
            type='button'
            variant='outline'
            onClick={goToPreviousTab}
            disabled={activeTab === formTabs[0].id || isSubmitting}
          >
            Previous
          </Button>

          {activeTab !== formTabs[formTabs.length - 1].id ? (
            <Button type='button' onClick={handleNext} disabled={isSubmitting}>
              Next
            </Button>
          ) : (
            <Button type='submit' disabled={isSubmitting}>
              {isSubmitting
                ? isEditing
                  ? 'Updating...'
                  : 'Submitting...'
                : isEditing
                ? 'Update Application'
                : 'Submit Application'}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
