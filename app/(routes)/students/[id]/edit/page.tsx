'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import React from 'react';
import {
  Loader2,
  Save,
  ArrowLeft,
  UserCheck,
  Upload,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useStudent, useUpdateStudent } from '@/hooks/student/use-students';
import { studentSchema, UpdateStudentDto } from '@/types/student';
import { PhotoUpload } from '../../_components/photo-upload';
import toast from 'react-hot-toast';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { Section } from '@/types/organizations';
import { useQueryClient } from '@tanstack/react-query';
import { studentKeys } from '@/hooks/student/use-students';

// Form schema for student edit (focusing on additional required fields)
const editStudentSchema = z.object({
  // Basic information
  student_name: z.string().min(2, 'Name is required'),
  father_name: z.string().min(2, "Father's name is required"),
  father_occupation: z.string().optional(),
  father_mobile: z.string().optional(),
  mother_name: z.string().min(2, "Mother's name is required"),
  mother_occupation: z.string().optional(),
  mother_mobile: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().optional(),

  // Academic information
  roll_number: z.string().min(1, 'Roll number is required'),
  college_email: z.string().email('Invalid college email format'),
  student_email: z.string().email('Invalid personal email format').optional(),
  student_mobile: z.string().optional(),
  student_photo_url: z.string().optional(),

  // Academic background
  religion: z.string().optional(),
  community: z.string().optional(),
  caste: z.string().optional(),
  annual_income: z.string().optional(),
  last_school: z.string().optional(),
  board_of_study: z.string().optional(),

  // Program details
  institution_id: z.string().optional(),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester_id: z.string().min(1, 'Semester is required'),
  section_id: z.string().min(1, 'Section is required'),
  entry_type: z.string().optional(),

  // Address
  permanent_address_street: z.string().optional(),
  permanent_address_taluk: z.string().optional(),
  permanent_address_district: z.string().optional(),
  permanent_address_pin_code: z.string().optional(),
  permanent_address_state: z.string().optional(),

  // Accommodation
  accommodation_type: z.string().optional(),
  hostel_type: z.string().optional(),
  bus_required: z.boolean().optional(),
  bus_route: z.string().optional(),
  bus_pickup_location: z.string().optional(),

  // Status
  status: z
    .enum(['active', 'inactive', 'pending', 'exited', 'graduated'])
    .optional(),

  // Others
  reference_type: z.string().optional(),
  reference_name: z.string().optional(),
  reference_contact: z.string().optional(),

  // Previous Academic Qualifications
  tenth_marks: z
    .object({
      max_marks: z.string().optional(),
      obtained_marks: z.string().optional(),
      percentage: z.string().optional()
    })
    .optional()
    .nullable(),

  twelfth_marks: z
    .object({
      group: z.string().optional(),
      max_marks: z.string().optional(),
      obtained_marks: z.string().optional(),
      percentage: z.string().optional(),
      subjects: z.record(z.string().optional()).optional()
    })
    .optional()
    .nullable(),

  medical_cutoff_marks: z.string().optional(),
  engineering_cutoff_marks: z.string().optional(),
  neet_roll_number: z.string().optional(),
  counseling_applied: z.boolean().optional(),
  counseling_number: z.string().optional(),
  first_graduate: z.boolean().optional(),

  // New fields
  quota: z.string().optional(),
  category: z.string().optional()
});

type EditStudentFormValues = z.infer<typeof editStudentSchema>;

interface EditStudentPageProps {
  params: Promise<{
    id: string;
  }>;
}

// Custom hook to handle semester and section loading
const useStudentSemesterAndSection = (student: any, form: any) => {
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string; semester_code: string }>
  >([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoadingSemesters, setIsLoadingSemesters] = useState(false);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  const loadSections = useCallback(
    async (semesterId: string | undefined) => {
      if (!semesterId) {
        setSections([]);
        form.setValue('section_id', ''); // Clear section in form if no semesterId
        return;
      }
      try {
        setIsLoadingSections(true);
        const data = await SectionService.getSectionsBySemester(semesterId);
        console.log('Loaded sections:', data);
        console.log('Student section_id:', student?.section_id);

        setSections(data);

        // If student has a section_id, set it in the form
        if (student?.section_id) {
          // Check if the section exists in the loaded sections
          const sectionExists = data.some((s) => s.id === student.section_id);
          if (sectionExists) {
            console.log('Setting section_id in form:', student.section_id);
            form.setValue('section_id', student.section_id);
          }
        } else if (data.length === 0) {
          form.setValue('section_id', ''); // No sections available, clear form value
        }
      } catch (error) {
        console.error('Error loading sections:', error);
        setSections([]);
        form.setValue('section_id', '');
      } finally {
        setIsLoadingSections(false);
      }
    },
    [student?.section_id, form]
  );

  const loadSemesters = useCallback(async () => {
    if (!student?.program_id) {
      setSemesters([]);
      setSections([]); // Also clear sections if no program
      form.setValue('semester_id', '');
      form.setValue('section_id', '');
      return;
    }
    try {
      setIsLoadingSemesters(true);
      const data = await SemesterService.getSemestersByProgram(
        student.program_id
      );
      setSemesters(data);
      // If student has a semester_id and it's in the loaded list, set it and load sections
      if (
        student.semester_id &&
        data.some((s) => s.id === student.semester_id)
      ) {
        form.setValue('semester_id', student.semester_id);
        await loadSections(student.semester_id); // Await here to ensure sections are loaded based on this
      } else {
        // No pre-existing semester_id or it's not in the list, clear sections
        await loadSections(undefined);
      }
    } catch (error) {
      console.error('Error loading semesters:', error);
      setSemesters([]);
      setSections([]);
      form.setValue('semester_id', '');
      form.setValue('section_id', '');
    } finally {
      setIsLoadingSemesters(false);
    }
  }, [student?.program_id, student?.semester_id, loadSections, form]); // Added form

  useEffect(() => {
    if (student) {
      loadSemesters(); // This will also trigger loadSections if semester_id is present
    }
  }, [student, loadSemesters]);

  return {
    semesters,
    sections,
    isLoadingSemesters,
    isLoadingSections,
    loadSections // Expose loadSections to be called on semester change in form
  };
};

// After useEffect to reset form
// Add utility function to normalize accommodation type
const normalizeAccommodationType = (
  type: string | undefined | null
): string => {
  if (!type) return '';

  // Convert to uppercase for consistency
  const upperType = type.toUpperCase();

  // Handle different formats
  if (upperType === 'HOSTEL' || upperType === 'DAY SCHOLAR') {
    return upperType;
  }

  // Handle lowercase formats from admission form
  if (type === 'hostel') return 'HOSTEL';
  if (type === 'day_scholar') return 'DAY SCHOLAR';

  return type; // Return as-is if no match
};

export default function EditStudentPage({ params }: EditStudentPageProps) {
  // Unwrap params using React.use()
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  const router = useRouter();
  const { data: student, isLoading: isLoadingStudent } = useStudent(id);
  const updateStudent = useUpdateStudent(id);
  const queryClient = useQueryClient();

  // State for entity names
  const [institutionName, setInstitutionName] = useState<string>('');
  const [degreeName, setDegreeName] = useState<string>('');
  const [departmentName, setDepartmentName] = useState<string>('');
  const [programName, setProgramName] = useState<string>('');

  // Add states for dropdown options
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(false);
  const [isLoadingDegrees, setIsLoadingDegrees] = useState(false);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);

  // Initialize form with default values
  const form = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentSchema),
    defaultValues: {
      student_name: '',
      father_name: '',
      father_occupation: '',
      father_mobile: '',
      mother_name: '',
      mother_occupation: '',
      mother_mobile: '',
      date_of_birth: '',
      gender: '',
      roll_number: '',
      college_email: '',
      student_email: '',
      student_mobile: '',
      student_photo_url: '',
      religion: '',
      community: '',
      caste: '',
      annual_income: '',
      last_school: '',
      board_of_study: '',
      institution_id: '',
      degree_id: '',
      department_id: '',
      program_id: '',
      semester_id: '',
      section_id: '',
      entry_type: '',
      permanent_address_street: '',
      permanent_address_taluk: '',
      permanent_address_district: '',
      permanent_address_pin_code: '',
      permanent_address_state: '',
      accommodation_type: '',
      hostel_type: '',
      bus_required: false,
      bus_route: '',
      bus_pickup_location: '',
      status: 'active',
      reference_type: '',
      reference_name: '',
      reference_contact: '',
      tenth_marks: {
        max_marks: '',
        obtained_marks: '',
        percentage: ''
      },
      twelfth_marks: {
        group: '',
        max_marks: '',
        obtained_marks: '',
        percentage: '',
        subjects: {}
      },
      medical_cutoff_marks: '',
      engineering_cutoff_marks: '',
      neet_roll_number: '',
      counseling_applied: false,
      counseling_number: '',
      first_graduate: false,
      quota: '',
      category: ''
    }
  });

  // Use custom hook for semester and section loading, passing the form instance
  const {
    semesters,
    sections,
    isLoadingSemesters,
    isLoadingSections,
    loadSections // We need loadSections for the semester_id field watcher
  } = useStudentSemesterAndSection(student, form);

  // Watch for gender changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'gender' || !name) {
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Effect to reset form when student data changes (initial load)
  useEffect(() => {
    if (student) {
      console.log('Student data loaded:', {
        semester_id: student.semester_id,
        section_id: student.section_id
      });

      const normalizedGender = student.gender
        ? student.gender.toLowerCase()
        : '';

      // Process tenth marks data
      const tenthMarks = student.tenth_marks || {};
      // Convert from string to object if needed
      const processedTenthMarks =
        typeof tenthMarks === 'string' ? JSON.parse(tenthMarks) : tenthMarks;

      // Process twelfth marks data
      const twelfthMarks = student.twelfth_marks || {};
      // Convert from string to object if needed
      const processedTwelfthMarks =
        typeof twelfthMarks === 'string'
          ? JSON.parse(twelfthMarks)
          : twelfthMarks;

      form.reset(
        {
          student_name: student.student_name || '',
          father_name: student.father_name || '',
          father_occupation: student.father_occupation || '',
          father_mobile: student.father_mobile || '',
          mother_name: student.mother_name || '',
          mother_occupation: student.mother_occupation || '',
          mother_mobile: student.mother_mobile || '',
          date_of_birth: student.date_of_birth || '',
          gender: normalizedGender,
          roll_number: student.roll_number || '',
          college_email: student.college_email || '',
          student_email: student.student_email || '',
          student_mobile: student.student_mobile || '',
          student_photo_url: student.student_photo_url || '',
          religion: student.religion || '',
          community: student.community || '',
          caste: student.caste || '',
          annual_income: student.annual_income || '',
          last_school: student.last_school || '',
          board_of_study: student.board_of_study || '',
          institution_id: student.institution_id || '',
          degree_id: student.degree_id || '',
          department_id: student.department_id || '',
          program_id: student.program_id || '',
          semester_id: student.semester_id || '',
          section_id: student.section_id || '',
          entry_type: student.entry_type || '',
          permanent_address_street: student.permanent_address_street || '',
          permanent_address_taluk: student.permanent_address_taluk || '',
          permanent_address_district: student.permanent_address_district || '',
          permanent_address_pin_code: student.permanent_address_pin_code || '',
          permanent_address_state: student.permanent_address_state || '',
          accommodation_type: normalizeAccommodationType(
            student.accommodation_type
          ),
          hostel_type: student.hostel_type || '',
          bus_required: student.bus_required || false,
          bus_route: student.bus_route || '',
          bus_pickup_location: student.bus_pickup_location || '',
          status: student.status || 'active',
          reference_type: student.reference_type || '',
          reference_name: student.reference_name || '',
          reference_contact: student.reference_contact || '',
          tenth_marks: {
            max_marks: processedTenthMarks.max_marks || '',
            obtained_marks: processedTenthMarks.obtained_marks || '',
            percentage: processedTenthMarks.percentage || ''
          },
          twelfth_marks: {
            group: processedTwelfthMarks.group || '',
            max_marks: processedTwelfthMarks.max_marks || '',
            obtained_marks: processedTwelfthMarks.obtained_marks || '',
            percentage: processedTwelfthMarks.percentage || '',
            subjects: processedTwelfthMarks.subjects || {}
          },
          medical_cutoff_marks: student.medical_cutoff_marks || '',
          engineering_cutoff_marks: student.engineering_cutoff_marks || '',
          neet_roll_number: student.neet_roll_number || '',
          counseling_applied: student.counseling_applied || false,
          counseling_number: student.counseling_number || '',
          first_graduate: student.first_graduate || false,
          quota: student.quota || '',
          category: student.category || ''
        },
        { keepDefaultValues: false }
      );

      // Explicitly set important values after reset to ensure they take effect
      setTimeout(() => {
        form.setValue('gender', normalizedGender);

        if (student.semester_id) {
          form.setValue('semester_id', student.semester_id);
        }
        if (student.section_id) {
          form.setValue('section_id', student.section_id);
        }
        console.log('Form values after reset:', {
          gender: form.getValues('gender'),
          semester_id: form.getValues('semester_id'),
          section_id: form.getValues('section_id')
        });
      }, 0);
    }
  }, [student, form]);

  // Watch for semester_id changes in the form to reload sections
  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (name === 'semester_id' && type === 'change') {
        const newSemesterId = value.semester_id as string | undefined;
        loadSections(newSemesterId); // loadSections from the custom hook will handle clearing section_id if newSemesterId is undefined
        // If the change was manual (not initial load by hook), clear the section_id field
        if (student?.semester_id !== newSemesterId) {
          form.setValue('section_id', '');
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, loadSections, student?.semester_id]);

  // Fetch entity names when student data loads
  useEffect(() => {
    async function fetchEntityNames() {
      if (!student) return;

      // Fetch institution name
      if (student.institution_id) {
        try {
          const institutions = await OrganizationService.getInstitutionNames();
          const institution = institutions.find(
            (i) => i.id === student.institution_id
          );
          if (institution) {
            setInstitutionName(institution.name);
          }
        } catch (error) {
          console.error('Error fetching institution name:', error);
        }
      }

      // Fetch degree name
      if (student.degree_id) {
        try {
          const degreesResponse = await DegreeService.getDegrees();
          const degree = degreesResponse.data.find(
            (d) => d.id === student.degree_id
          );
          if (degree) {
            setDegreeName(degree.degree_name);
          }
        } catch (error) {
          console.error('Error fetching degree name:', error);
        }
      }

      // Fetch department name
      if (student.department_id) {
        try {
          const departmentsResponse = await DepartmentService.getDepartments();
          const department = departmentsResponse.data.find(
            (d) => d.id === student.department_id
          );
          if (department) {
            setDepartmentName(department.department_name);
          }
        } catch (error) {
          console.error('Error fetching department name:', error);
        }
      }

      // Fetch program name
      if (student.program_id) {
        try {
          const programsResponse = await ProgramService.getPrograms();
          const program = programsResponse.data.find(
            (p) => p.id === student.program_id
          );
          if (program) {
            setProgramName(program.program_name);
          }
        } catch (error) {
          console.error('Error fetching program name:', error);
        }
      }
    }

    fetchEntityNames();
  }, [student]);

  // Modify fetchFormOptions to load initial values based on the student
  useEffect(() => {
    async function fetchFormOptions() {
      // Fetch institutions for all cases
      try {
        setIsLoadingInstitutions(true);
        const institutionsData =
          await OrganizationService.getInstitutionNames();
        setInstitutions(institutionsData);
      } catch (error) {
        console.error('Error fetching institutions:', error);
      } finally {
        setIsLoadingInstitutions(false);
      }

      // Load initial degrees based on student's institution
      if (student?.institution_id) {
        try {
          setIsLoadingDegrees(true);
          // We know student.institution_id is defined here
          const degreesData = await DegreeService.getDegreesByInstitution(
            student.institution_id!
          );
          setDegrees(degreesData);
        } catch (error) {
          console.error('Error fetching degrees:', error);
        } finally {
          setIsLoadingDegrees(false);
        }
      }

      // Load initial departments based on student's degree
      if (student?.degree_id) {
        try {
          setIsLoadingDepartments(true);
          // We know student.degree_id is defined here
          const departmentsData =
            await DepartmentService.getDepartmentsByDegree(student.degree_id!);
          setDepartments(departmentsData);
        } catch (error) {
          console.error('Error fetching departments:', error);
        } finally {
          setIsLoadingDepartments(false);
        }
      }

      // Load initial programs based on student's department
      if (student?.department_id) {
        try {
          setIsLoadingPrograms(true);
          // We know student.department_id is defined here
          const programsData = await ProgramService.getProgramsByDepartment(
            student.department_id!
          );
          setPrograms(programsData);
        } catch (error) {
          console.error('Error fetching programs:', error);
        } finally {
          setIsLoadingPrograms(false);
        }
      }
    }

    if (student) {
      fetchFormOptions();
    }
  }, [student]);

  // Add an effect to filter degrees when institution changes
  useEffect(() => {
    const institutionId = form.getValues('institution_id');
    // Skip if there's no institutionId or we're still in initial loading
    if (!institutionId || isLoadingStudent) {
      return;
    }

    async function filterDegreesByInstitution() {
      try {
        setIsLoadingDegrees(true);
        // Non-null assertion is safe here because we checked institutionId above
        const degreesData = await DegreeService.getDegreesByInstitution(
          institutionId!
        );
        setDegrees(degreesData);

        // Clear dependent fields if the institution changes
        if (student?.institution_id !== institutionId) {
          form.setValue('degree_id', '');
          form.setValue('department_id', '');
          form.setValue('program_id', '');
        }
      } catch (error) {
        console.error('Error filtering degrees by institution:', error);
      } finally {
        setIsLoadingDegrees(false);
      }
    }

    // Watch for institution_id changes
    const subscription = form.watch((value, { name, type }) => {
      if (name === 'institution_id' && type === 'change') {
        filterDegreesByInstitution();
      }
    });

    return () => subscription.unsubscribe();
  }, [form, student?.institution_id, isLoadingStudent]);

  // Add an effect to filter departments when degree changes
  useEffect(() => {
    const degreeId = form.getValues('degree_id');
    // Skip if there's no degreeId or we're still in initial loading
    if (!degreeId || isLoadingStudent) {
      return;
    }

    async function filterDepartmentsByDegree() {
      try {
        setIsLoadingDepartments(true);
        // Non-null assertion is safe here because we checked degreeId above
        const departmentsData = await DepartmentService.getDepartmentsByDegree(
          degreeId!
        );
        setDepartments(departmentsData);

        // Clear dependent fields if the degree changes
        if (student?.degree_id !== degreeId) {
          form.setValue('department_id', '');
          form.setValue('program_id', '');
        }
      } catch (error) {
        console.error('Error filtering departments by degree:', error);
      } finally {
        setIsLoadingDepartments(false);
      }
    }

    // Watch for degree_id changes
    const subscription = form.watch((value, { name, type }) => {
      if (name === 'degree_id' && type === 'change') {
        filterDepartmentsByDegree();
      }
    });

    return () => subscription.unsubscribe();
  }, [form, student?.degree_id, isLoadingStudent]);

  // Add an effect to filter programs when department changes
  useEffect(() => {
    const departmentId = form.getValues('department_id');
    // Skip if there's no departmentId or we're still in initial loading
    if (!departmentId || isLoadingStudent) {
      return;
    }

    async function filterProgramsByDepartment() {
      try {
        setIsLoadingPrograms(true);
        // Non-null assertion is safe here because we checked departmentId above
        const programsData = await ProgramService.getProgramsByDepartment(
          departmentId!
        );
        setPrograms(programsData);

        // Clear dependent field if the department changes
        if (student?.department_id !== departmentId) {
          form.setValue('program_id', '');
        }
      } catch (error) {
        console.error('Error filtering programs by department:', error);
      } finally {
        setIsLoadingPrograms(false);
      }
    }

    // Watch for department_id changes
    const subscription = form.watch((value, { name, type }) => {
      if (name === 'department_id' && type === 'change') {
        filterProgramsByDepartment();
      }
    });

    return () => subscription.unsubscribe();
  }, [form, student?.department_id, isLoadingStudent]);

  // Handle form submission
  const onSubmit = async (data: EditStudentFormValues) => {
    try {
      // Check if all required fields are filled
      const isComplete =
        !!data.roll_number &&
        !!data.college_email &&
        !!data.semester_id &&
        !!data.section_id;

      // Transform marks data to ensure compatibility with UpdateStudentDto
      const transformedData = {
        ...data,
        // Convert null to undefined or ensure object properties are strings
        tenth_marks: data.tenth_marks
          ? {
              max_marks: data.tenth_marks.max_marks || '',
              obtained_marks: data.tenth_marks.obtained_marks || '',
              percentage: data.tenth_marks.percentage || ''
            }
          : undefined,

        // Convert null to undefined or ensure object properties are strings
        twelfth_marks: data.twelfth_marks
          ? {
              group: data.twelfth_marks.group || '',
              max_marks: data.twelfth_marks.max_marks || '',
              obtained_marks: data.twelfth_marks.obtained_marks || '',
              percentage: data.twelfth_marks.percentage || '',
              // Ensure all subject values are strings (not undefined)
              subjects: data.twelfth_marks.subjects
                ? Object.entries(data.twelfth_marks.subjects).reduce(
                    (acc, [key, value]) => {
                      acc[key] = value || '';
                      return acc;
                    },
                    {} as Record<string, string>
                  )
                : {}
            }
          : undefined
      };

      // If all required fields are filled, also set status to active
      const updatePayload = {
        ...transformedData,
        is_profile_complete: isComplete,
        status: isComplete ? ('active' as const) : undefined
      };

      // Submit the data payload
      await updateStudent.mutateAsync(updatePayload);

      // Invalidate all student queries to force data refresh across the app
      queryClient.invalidateQueries({ queryKey: studentKeys.all });

      toast.success('Student record updated');

      router.push(`/students/${id}`);
    } catch (error) {
      console.error('Error updating student:', error);
      toast.error('Failed to update student');
    }
  };

  // Loading state
  if (isLoadingStudent) {
    return (
      <ContentLayout title='Edit Student'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
          <p className='text-muted-foreground'>Loading student data...</p>
        </div>
      </ContentLayout>
    );
  }

  // Student not found
  if (!student) {
    return (
      <ContentLayout title='Edit Student'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <p className='text-muted-foreground'>Student not found</p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => router.push('/students')}
          >
            Go Back to Students
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const isProfileComplete =
    !!student.roll_number &&
    !!student.college_email &&
    !!student.semester_id &&
    !!student.section_id;

  return (
    <ContentLayout title='Edit Student'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Students', href: '/students' },
            { label: student.student_name, href: `/students/${id}` },
            { label: 'Edit' }
          ]}
        />

        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Edit Student: {student.student_name}
            </h1>
            <p className='text-muted-foreground'>Update student information</p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={updateStudent.isPending}
            >
              {updateStudent.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Save className='mr-2 h-4 w-4' />
              )}
              Save Changes
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UserCheck className='h-5 w-5' />
              Edit Student Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              <Form {...form}>
                <form className='space-y-6'>
                  <Tabs defaultValue='basic'>
                    <TabsList className='grid grid-cols-6 mb-4'>
                      <TabsTrigger value='basic'>Basic Info</TabsTrigger>
                      <TabsTrigger value='academic'>Academic</TabsTrigger>
                      <TabsTrigger value='qualifications'>
                        Qualifications
                      </TabsTrigger>
                      <TabsTrigger value='contact'>
                        Contact & Address
                      </TabsTrigger>
                      <TabsTrigger value='accommodation'>
                        Accommodation
                      </TabsTrigger>
                      <TabsTrigger value='others'>Other Details</TabsTrigger>
                    </TabsList>

                    {/* Basic Information Tab */}
                    <TabsContent value='basic' className='space-y-6'>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='student_name'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Student Name*</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter full name'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='gender'
                          render={({ field }) => {
                            console.log('Gender field render:', {
                              value: field.value
                            });
                            return (
                              <FormItem>
                                <FormLabel>Gender</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder='Select gender' />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value='male'>Male</SelectItem>
                                    <SelectItem value='female'>
                                      Female
                                    </SelectItem>
                                    <SelectItem value='other'>Other</SelectItem>
                                  </SelectContent>
                                </Select>

                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                        <FormField
                          control={form.control}
                          name='father_name'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Father&apos;s Name*</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Enter father's name"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='father_occupation'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Father&apos;s Occupation</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Enter father's occupation"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='father_mobile'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Father&apos;s Mobile</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Enter father's mobile"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                        <FormField
                          control={form.control}
                          name='mother_name'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mother&apos;s Name*</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Enter mother's name"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='mother_occupation'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mother&apos;s Occupation</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Enter mother's occupation"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='mother_mobile'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mother&apos;s Mobile</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Enter mother's mobile"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                        <FormField
                          control={form.control}
                          name='date_of_birth'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Date of Birth</FormLabel>
                              <FormControl>
                                <Input {...field} type='date' />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='religion'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Religion</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter religion'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='community'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Community</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter community'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='caste'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Caste</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder='Enter caste' />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='annual_income'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Annual Income</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter annual income'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </TabsContent>

                    {/* Academic Information Tab */}
                    <TabsContent value='academic' className='space-y-6'>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='roll_number'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Roll Number*</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter roll number'
                                />
                              </FormControl>
                              <FormDescription>
                                The official student roll number
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='college_email'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>College Email*</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type='email'
                                  placeholder='student@college.edu'
                                />
                              </FormControl>
                              <FormDescription>
                                Official college email address for the student
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='quota'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Admission Quota</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select quota' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value='GOVERNMENT'>
                                    Government Quota
                                  </SelectItem>
                                  <SelectItem value='MANAGEMENT'>
                                    Management Quota
                                  </SelectItem>
                                  <SelectItem value='NRI'>NRI Quota</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                The admission quota under which the student was
                                admitted
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='category'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select category' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value='GENERAL'>
                                    General
                                  </SelectItem>
                                  <SelectItem value='OBC'>OBC</SelectItem>
                                  <SelectItem value='SC'>SC</SelectItem>
                                  <SelectItem value='ST'>ST</SelectItem>
                                  <SelectItem value='OTHER'>Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                The reservation category of the student
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='institution_id'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Institution</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                                disabled={isLoadingInstitutions}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select institution' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {isLoadingInstitutions ? (
                                    <div className='flex items-center justify-center p-2'>
                                      <Loader2 className='h-4 w-4 animate-spin mr-2' />
                                      Loading...
                                    </div>
                                  ) : institutions.length === 0 ? (
                                    <div className='p-2 text-center text-sm text-muted-foreground'>
                                      No institutions available
                                    </div>
                                  ) : (
                                    institutions.map((institution) => (
                                      <SelectItem
                                        key={institution.id}
                                        value={institution.id}
                                      >
                                        {institution.name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Institution identifier
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='degree_id'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Degree</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                                disabled={isLoadingDegrees}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select degree' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {isLoadingDegrees ? (
                                    <div className='flex items-center justify-center p-2'>
                                      <Loader2 className='h-4 w-4 animate-spin mr-2' />
                                      Loading...
                                    </div>
                                  ) : degrees.length === 0 ? (
                                    <div className='p-2 text-center text-sm text-muted-foreground'>
                                      No degrees available
                                    </div>
                                  ) : (
                                    degrees.map((degree) => (
                                      <SelectItem
                                        key={degree.id}
                                        value={degree.id}
                                      >
                                        {degree.degree_name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Degree identifier
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='department_id'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Department</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                                disabled={isLoadingDepartments}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select department' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {isLoadingDepartments ? (
                                    <div className='flex items-center justify-center p-2'>
                                      <Loader2 className='h-4 w-4 animate-spin mr-2' />
                                      Loading...
                                    </div>
                                  ) : departments.length === 0 ? (
                                    <div className='p-2 text-center text-sm text-muted-foreground'>
                                      No departments available
                                    </div>
                                  ) : (
                                    departments.map((department) => (
                                      <SelectItem
                                        key={department.id}
                                        value={department.id}
                                      >
                                        {department.department_name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Department identifier
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='program_id'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Program</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                                disabled={isLoadingPrograms}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select program' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {isLoadingPrograms ? (
                                    <div className='flex items-center justify-center p-2'>
                                      <Loader2 className='h-4 w-4 animate-spin mr-2' />
                                      Loading...
                                    </div>
                                  ) : programs.length === 0 ? (
                                    <div className='p-2 text-center text-sm text-muted-foreground'>
                                      No programs available
                                    </div>
                                  ) : (
                                    programs.map((program) => (
                                      <SelectItem
                                        key={program.id}
                                        value={program.id}
                                      >
                                        {program.program_name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Program identifier
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='entry_type'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Entry Type</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select entry type' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value='FIRST YEAR'>
                                    First Year
                                  </SelectItem>
                                  <SelectItem value='LATERAL ENTRY'>
                                    Lateral Entry
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='status'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || 'active'}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select status' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value='active'>Active</SelectItem>
                                  <SelectItem value='inactive'>
                                    Inactive
                                  </SelectItem>
                                  <SelectItem value='pending'>
                                    Pending
                                  </SelectItem>
                                  <SelectItem value='exited'>Exited</SelectItem>
                                  <SelectItem value='graduated'>
                                    Graduated
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='semester_id'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Semester*</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={student?.semester_id || ''}
                                disabled={isLoadingSemesters}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select semester' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {isLoadingSemesters ? (
                                    <div className='flex items-center justify-center p-2'>
                                      <Loader2 className='h-4 w-4 animate-spin mr-2' />
                                      Loading...
                                    </div>
                                  ) : semesters.length === 0 ? (
                                    <div className='p-2 text-center text-sm text-muted-foreground'>
                                      No semesters available
                                    </div>
                                  ) : (
                                    semesters.map((semester) => (
                                      <SelectItem
                                        key={semester.id}
                                        value={semester.id}
                                      >
                                        {semester.semester_name} (
                                        {semester.semester_code})
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Current semester of the student
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='section_id'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Section*</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={student?.section_id || ''}
                                disabled={
                                  !form.watch('semester_id') ||
                                  isLoadingSections
                                }
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select section' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {!form.watch('semester_id') ? (
                                    <div className='p-2 text-center text-sm text-muted-foreground'>
                                      Select a semester first
                                    </div>
                                  ) : isLoadingSections ? (
                                    <div className='flex items-center justify-center p-2'>
                                      <Loader2 className='h-4 w-4 animate-spin mr-2' />
                                      Loading...
                                    </div>
                                  ) : sections.length === 0 ? (
                                    <div className='p-2 text-center text-sm text-muted-foreground'>
                                      No sections available
                                    </div>
                                  ) : (
                                    sections.map((section) => (
                                      <SelectItem
                                        key={section.id}
                                        value={section.id}
                                      >
                                        {section.section_name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Current section of the student
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name='student_photo_url'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Student Photo (Optional)</FormLabel>
                            <FormControl>
                              <PhotoUpload
                                value={field.value}
                                onChange={field.onChange}
                                onRemove={() => field.onChange('')}
                                studentId={id}
                              />
                            </FormControl>
                            <FormDescription>
                              Upload a passport-size photograph of the student
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    {/* Previous Academic Qualifications Tab */}
                    <TabsContent value='qualifications' className='space-y-6'>
                      <div>
                        <h3 className='text-lg font-medium mb-2'>
                          Previous Academic Qualifications
                        </h3>
                        <p className='text-sm text-muted-foreground mb-4'>
                          Details of previous academic background and
                          achievements
                        </p>
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='last_school'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last School/College</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Name of previous school/college'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='board_of_study'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Board of Study</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select board' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value='State Board'>
                                    State Board
                                  </SelectItem>
                                  <SelectItem value='CBSE'>CBSE</SelectItem>
                                  <SelectItem value='ICSE'>ICSE</SelectItem>
                                  <SelectItem value='Others'>Others</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <Separator className='my-4' />

                      <div>
                        <h4 className='text-md font-medium mb-3'>
                          Class 10 Marks
                        </h4>
                        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                          <FormField
                            control={form.control}
                            name={`tenth_marks.max_marks`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Maximum Marks</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type='text'
                                    placeholder='Maximum possible marks'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`tenth_marks.obtained_marks`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Obtained Marks</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type='text'
                                    placeholder='Marks obtained'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`tenth_marks.percentage`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Percentage (%)</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type='text'
                                    placeholder='Percentage'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <Separator className='my-4' />

                      <div>
                        <h4 className='text-md font-medium mb-3'>
                          Class 12 Marks
                        </h4>
                        <FormField
                          control={form.control}
                          name={`twelfth_marks.group`}
                          render={({ field }) => (
                            <FormItem className='mb-4'>
                              <FormLabel>Group/Stream</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ''}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select group/stream' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value='pcbm'>
                                    Physics, Chemistry, Biology, Mathematics
                                  </SelectItem>
                                  <SelectItem value='pccs'>
                                    Physics, Chemistry, Computer Science,
                                    Mathematics
                                  </SelectItem>
                                  <SelectItem value='pcbz'>
                                    Physics, Chemistry, Botany, Zoology
                                  </SelectItem>
                                  <SelectItem value='others'>
                                    Other Groups
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                12th standard group/stream
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                          <FormField
                            control={form.control}
                            name={`twelfth_marks.max_marks`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Maximum Marks</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type='text'
                                    placeholder='Maximum possible marks'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`twelfth_marks.obtained_marks`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Obtained Marks</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type='text'
                                    placeholder='Marks obtained'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`twelfth_marks.percentage`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Percentage (%)</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type='text'
                                    placeholder='Percentage'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <Separator className='my-4' />

                      <div>
                        <h4 className='text-md font-medium mb-3'>
                          Entrance Exam & Cutoff Marks
                        </h4>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                          <FormField
                            control={form.control}
                            name='medical_cutoff_marks'
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Medical Cutoff</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder='Medical cutoff marks'
                                  />
                                </FormControl>
                                <FormDescription>
                                  For medical/healthcare courses
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name='engineering_cutoff_marks'
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Engineering Cutoff</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder='Engineering cutoff marks'
                                  />
                                </FormControl>
                                <FormDescription>
                                  For engineering courses
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name='neet_roll_number'
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NEET Roll Number</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder='NEET roll number'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name='counseling_number'
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Counseling Number</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder='Counseling application number'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 mt-4'>
                          <FormField
                            control={form.control}
                            name='first_graduate'
                            render={({ field }) => (
                              <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className='space-y-1 leading-none'>
                                  <FormLabel>First Graduate</FormLabel>
                                  <FormDescription>
                                    Student is the first graduate in their
                                    family
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 mt-4'>
                          <FormField
                            control={form.control}
                            name='counseling_applied'
                            render={({ field }) => (
                              <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className='space-y-1 leading-none'>
                                  <FormLabel>Applied for Counseling</FormLabel>
                                  <FormDescription>
                                    Student has applied for counseling
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </TabsContent>

                    {/* Contact & Address Tab */}
                    <TabsContent value='contact' className='space-y-6'>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='student_mobile'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Student Mobile</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Enter student's mobile number"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='student_email'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Personal Email</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type='email'
                                  placeholder="Enter student's personal email"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <h3 className='text-md font-medium mt-4'>
                        Permanent Address
                      </h3>
                      <div className='grid grid-cols-1 gap-4'>
                        <FormField
                          control={form.control}
                          name='permanent_address_street'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Street Address</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter street address'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                        <FormField
                          control={form.control}
                          name='permanent_address_taluk'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Taluk</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder='Enter taluk' />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='permanent_address_district'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>District</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter district'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='permanent_address_pin_code'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>PIN Code</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter PIN code'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name='permanent_address_state'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder='Enter state' />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    {/* Accommodation Tab */}
                    <TabsContent value='accommodation' className='space-y-6'>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='accommodation_type'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Accommodation Type</FormLabel>
                              <Select
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  // Reset hostel_type if day scholar is selected
                                  if (value !== 'HOSTEL') {
                                    form.setValue('hostel_type', '');
                                  }
                                }}
                                value={field.value || ''}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select accommodation type' />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value='DAY SCHOLAR'>
                                    Day Scholar
                                  </SelectItem>
                                  <SelectItem value='HOSTEL'>Hostel</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Student&apos;s accommodation arrangement
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {form.watch('accommodation_type') === 'HOSTEL' && (
                          <FormField
                            control={form.control}
                            name='hostel_type'
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Hostel Type</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder='Enter hostel type'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>

                      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                        <FormField
                          control={form.control}
                          name='bus_required'
                          render={({ field }) => (
                            <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className='space-y-1 leading-none'>
                                <FormLabel>Bus Required</FormLabel>
                                <FormDescription>
                                  Check if the student requires bus
                                  transportation
                                </FormDescription>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>

                      {form.watch('bus_required') && (
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                          <FormField
                            control={form.control}
                            name='bus_route'
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bus Route</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder='Enter bus route'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name='bus_pickup_location'
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Pickup Location</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder='Enter pickup location'
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </TabsContent>

                    {/* Other Details Tab */}
                    <TabsContent value='others' className='space-y-6'>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <FormField
                          control={form.control}
                          name='reference_type'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reference Type</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter reference type'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name='reference_name'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reference Name</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Enter reference name'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name='reference_contact'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reference Contact</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder='Enter reference contact'
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                  </Tabs>
                </form>
              </Form>
            </div>
          </CardContent>
        </Card>

        <div className='flex justify-end gap-2 mt-6'>
          <Button variant='outline' onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={updateStudent.isPending}
          >
            {updateStudent.isPending ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Save className='mr-2 h-4 w-4' />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
