// ============================================
// LEARNER EDIT PAGE
// ============================================
// Created: 2025-01-19
// Purpose: Edit learner profile with comprehensive form
// ============================================

'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Save, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import type { LearnerProfile, UpdateLearnerProfileDto } from '@/types/learner-profile';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { RegulationService } from '@/lib/services/organization/regulation-service';
import { BatchService } from '@/lib/services/organization/batch-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import Link from 'next/link';

// Form schema for learner edit
const editLearnerSchema = z.object({
  // Basic information
  first_name: z.string().min(2, 'First name is required'),
  last_name: z.string().optional(),
  father_name: z.string().min(2, "Father's name is required"),
  father_occupation: z.string().optional(),
  father_mobile: z.string().optional(),
  mother_name: z.string().min(2, "Mother's name is required"),
  mother_occupation: z.string().optional(),
  mother_mobile: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().optional(),

  // Academic information
  roll_number: z.string().optional(),
  college_email: z
    .string()
    .email('Invalid college email format')
    .refine(
      (val) => val.toLowerCase().endsWith('@jkkn.ac.in'),
      'College email must use @jkkn.ac.in domain (e.g., student@jkkn.ac.in)'
    )
    .optional(),
  student_email: z.string().email('Invalid personal email format').optional(),
  academic_year_id: z.string().min(1, 'Academic year is required'),
  student_mobile: z.string().optional(),
  student_photo_url: z.string().optional(),

  // Academic background
  religion: z.string().optional(),
  community: z.string().optional(),
  caste: z.string().optional(),
  aadhar_number: z.string().optional(),
  blood_group: z.string().optional(),
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
  register_number: z.string().optional(),
  entry_type: z.string().optional(),
  regulation_id: z.string().optional(),
  batch_id: z.string().optional(),

  // Address
  permanent_address: z.string().optional(),
  communication_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),

  // Accommodation
  accommodation_type: z.string().optional(),

  // Admission
  application_number: z.string().optional(),
  admission_date: z.string().optional(),
});

type EditLearnerFormValues = z.infer<typeof editLearnerSchema>;

interface LearnerEditPageProps {
  params: Promise<{ id: string }>;
}

export default function LearnerEditPage({ params }: LearnerEditPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [learner, setLearner] = useState<LearnerProfile | null>(null);
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  // Organization data
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [degrees, setDegrees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [regulations, setRegulations] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);

  // Check for permission to edit learner
  useEffect(() => {
    if (permissionsLoading) return;

    const shouldRedirect = !isSuperAdmin && !canAccess('learners', 'edit');

    if (shouldRedirect) {
      console.log('[learners/profiles/[id]/edit] Access denied');
      router.push('/unauthorized');
    }
  }, [isSuperAdmin, canAccess, router, permissionsLoading]);

  const form = useForm<EditLearnerFormValues>({
    resolver: zodResolver(editLearnerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      father_name: '',
      mother_name: '',
      academic_year_id: '',
      semester_id: '',
      section_id: '',
    },
  });

  const watchInstitutionId = form.watch('institution_id');
  const watchDegreeId = form.watch('degree_id');
  const watchDepartmentId = form.watch('department_id');
  const watchProgramId = form.watch('program_id');
  const watchSemesterId = form.watch('semester_id');

  // Fetch learner data
  useEffect(() => {
    async function fetchLearner() {
      try {
        setLoading(true);
        const data = await LearnerProfileService.getLearnerProfile(id);

        if (!data) {
          setLearner(null);
          return;
        }

        setLearner(data);

        // Pre-load cascading dropdown data to ensure values display correctly
        // This prevents the race condition where form values are set before dropdown options load
        if (data.institution_id) {
          const degreesData = await DegreeService.getDegreesByInstitution(data.institution_id);
          let degrees = degreesData || [];

          // Ensure current degree is in the list (even if institution_id doesn't match)
          if (data.degree_id && data.degree && !degrees.find(d => d.id === data.degree_id)) {
            degrees = [...degrees, { id: data.degree.id, degree_name: data.degree.degree_name }];
          }
          setDegrees(degrees);

          // Load regulations and batches for this institution
          const regulationsData = await RegulationService.getRegulationsByInstitution(data.institution_id);
          let regulations = regulationsData || [];

          // Ensure current regulation is in the list
          if (data.regulation_id && data.regulation && !regulations.find(r => r.id === data.regulation_id)) {
            regulations = [...regulations, {
              id: data.regulation.id,
              regulation_code: data.regulation.regulation_code,
              regulation_year: data.regulation.regulation_year
            }];
          }
          setRegulations(regulations);

          const batchesData = await BatchService.getBatchesByInstitution(data.institution_id);
          let batches = batchesData || [];

          // Ensure current batch is in the list
          if (data.batch_id && data.batch && !batches.find(b => b.id === data.batch_id)) {
            batches = [...batches, {
              id: data.batch.id,
              batch_name: data.batch.batch_name,
              batch_code: data.batch.batch_code
            }];
          }
          setBatches(batches);

          // Load academic years for this institution
          const academicYearsData = await AcademicYearService.getAcademicYearsByInstitution(data.institution_id);
          let academicYearsOptions = academicYearsData || [];

          // Ensure current academic year is in the list (even if institution_id doesn't match)
          if (data.academic_year_id && data.academic_year && !academicYearsOptions.find(ay => ay.id === data.academic_year_id)) {
            academicYearsOptions = [...academicYearsOptions, {
              id: data.academic_year.id,
              academic_year_name: data.academic_year.academic_year_name,
              start_date: data.academic_year.start_date,
              end_date: data.academic_year.end_date,
              is_active: data.academic_year.is_active
            }];
          }
          setAcademicYears(academicYearsOptions);
        }
        if (data.degree_id) {
          const departmentsData = await DepartmentService.getDepartmentsByDegree(data.degree_id);
          let departments = departmentsData || [];

          // Ensure current department is in the list
          if (data.department_id && data.department && !departments.find(d => d.id === data.department_id)) {
            departments = [...departments, { id: data.department.id, department_name: data.department.department_name }];
          }
          setDepartments(departments);
        }
        if (data.department_id) {
          const programsData = await ProgramService.getProgramsByDepartment(data.department_id);
          let programs = programsData || [];

          // Ensure current program is in the list
          if (data.program_id && data.program && !programs.find(p => p.id === data.program_id)) {
            programs = [...programs, { id: data.program.id, program_name: data.program.program_name }];
          }
          setPrograms(programs);
        }
        if (data.program_id) {
          const semestersData = await SemesterService.getSemestersByProgram(data.program_id);
          let semesters = semestersData || [];

          // Ensure current semester is in the list
          if (data.semester_id && data.semester && !semesters.find(s => s.id === data.semester_id)) {
            semesters = [...semesters, {
              id: data.semester.id,
              semester_name: data.semester.semester_name,
              semester_code: data.semester.semester_code
            }];
          }
          setSemesters(semesters);
        }
        if (data.semester_id) {
          const sectionsData = await SectionService.getSectionsBySemester(data.semester_id);
          let sections = sectionsData || [];

          // Ensure current section is in the list
          if (data.section_id && data.section && !sections.find(s => s.id === data.section_id)) {
            sections = [...sections, { id: data.section.id, section_name: data.section.section_name }];
          }
          setSections(sections);
        }

        // Populate form with existing data
        form.reset({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          father_name: data.father_name || '',
          father_occupation: data.father_occupation || '',
          father_mobile: data.father_mobile || '',
          mother_name: data.mother_name || '',
          mother_occupation: data.mother_occupation || '',
          mother_mobile: data.mother_mobile || '',
          date_of_birth: data.date_of_birth || '',
          gender: data.gender || '',
          roll_number: data.roll_number || '',
          college_email: data.college_email || '',
          student_email: data.student_email || '',
          academic_year_id: data.academic_year_id || '',
          student_mobile: data.student_mobile || '',
          student_photo_url: data.student_photo_url || '',
          religion: data.religion || '',
          community: data.community || '',
          caste: data.caste || '',
          aadhar_number: data.aadhar_number || '',
          blood_group: data.blood_group || '',
          annual_income: data.annual_income || '',
          last_school: data.last_school || '',
          board_of_study: data.board_of_study || '',
          institution_id: data.institution_id || '',
          degree_id: data.degree_id || '',
          department_id: data.department_id || '',
          program_id: data.program_id || '',
          semester_id: data.semester_id || '',
          section_id: data.section_id || '',
          register_number: data.register_number || '',
          entry_type: data.entry_type || '',
          regulation_id: data.regulation_id || '',
          batch_id: data.batch_id || '',
          permanent_address: data.permanent_address_street || '',
          communication_address: '',
          city: '',
          state: data.permanent_address_state || '',
          pincode: data.permanent_address_pin_code || '',
          accommodation_type: data.accommodation_type || '',
          application_number: '',
          admission_date: '',
        });
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching learner:', error);
        toast.error('Failed to load learner data');
        router.push('/learners/profiles');
      } finally {
        setLoading(false);
      }
    }

    fetchLearner();
  }, [id, router, form]);

  // Fetch institutions
  useEffect(() => {
    async function fetchInstitutions() {
      try {
        const response = await OrganizationService.getInstitutions();
        setInstitutions(response.data || []);
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching institutions:', error);
      }
    }

    fetchInstitutions();
  }, []);

  // Fetch degrees based on institution
  useEffect(() => {
    if (!watchInstitutionId) {
      setDegrees([]);
      return;
    }

    async function fetchDegrees() {
      try {
        const data = await DegreeService.getDegreesByInstitution(
          watchInstitutionId || ''
        );
        setDegrees(data || []);
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching degrees:', error);
      }
    }

    fetchDegrees();
  }, [watchInstitutionId]);

  // Fetch departments based on degree
  useEffect(() => {
    if (!watchDegreeId) {
      setDepartments([]);
      return;
    }

    async function fetchDepartments() {
      try {
        const data = await DepartmentService.getDepartmentsByDegree(watchDegreeId || '');
        setDepartments(data || []);
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching departments:', error);
      }
    }

    fetchDepartments();
  }, [watchDegreeId]);

  // Fetch programs based on department
  useEffect(() => {
    if (!watchDepartmentId) {
      setPrograms([]);
      return;
    }

    async function fetchPrograms() {
      try {
        const data = await ProgramService.getProgramsByDepartment(
          watchDepartmentId || ''
        );
        setPrograms(data || []);
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching programs:', error);
      }
    }

    fetchPrograms();
  }, [watchDepartmentId]);

  // Fetch semesters based on program
  useEffect(() => {
    if (!watchProgramId) {
      setSemesters([]);
      return;
    }

    async function fetchSemesters() {
      try {
        const data = await SemesterService.getSemestersByProgram(watchProgramId || '');
        setSemesters(data || []);
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching semesters:', error);
      }
    }

    fetchSemesters();
  }, [watchProgramId]);

  // Fetch sections based on semester
  useEffect(() => {
    if (!watchSemesterId) {
      setSections([]);
      return;
    }

    async function fetchSections() {
      try {
        const data = await SectionService.getSectionsBySemester(watchSemesterId || '');
        setSections(data || []);
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching sections:', error);
      }
    }

    fetchSections();
  }, [watchSemesterId]);

  // Fetch regulations based on institution
  useEffect(() => {
    if (!watchInstitutionId) {
      setRegulations([]);
      return;
    }

    async function fetchRegulations() {
      try {
        const data = await RegulationService.getRegulationsByInstitution(watchInstitutionId || '');
        setRegulations(data || []);
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching regulations:', error);
      }
    }

    fetchRegulations();
  }, [watchInstitutionId]);

  // Fetch batches based on institution
  useEffect(() => {
    if (!watchInstitutionId) {
      setBatches([]);
      return;
    }

    async function fetchBatches() {
      try {
        const data = await BatchService.getBatchesByInstitution(watchInstitutionId || '');
        setBatches(data || []);
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching batches:', error);
      }
    }

    fetchBatches();
  }, [watchInstitutionId]);

  // Fetch academic years based on institution
  useEffect(() => {
    if (!watchInstitutionId) {
      setAcademicYears([]);
      return;
    }

    async function fetchAcademicYears() {
      try {
        const data = await AcademicYearService.getAcademicYearsByInstitution(watchInstitutionId || '');
        setAcademicYears(data || []);
      } catch (error) {
        console.error('[learners/profiles/[id]/edit] Error fetching academic years:', error);
      }
    }

    fetchAcademicYears();
  }, [watchInstitutionId]);

  const onSubmit = async (values: EditLearnerFormValues) => {
    try {
      setSaving(true);

      const dto: UpdateLearnerProfileDto = {
        first_name: values.first_name,
        last_name: values.last_name || undefined,
        father_name: values.father_name,
        father_occupation: values.father_occupation || undefined,
        father_mobile: values.father_mobile || undefined,
        mother_name: values.mother_name,
        mother_occupation: values.mother_occupation || undefined,
        mother_mobile: values.mother_mobile || undefined,
        date_of_birth: values.date_of_birth || undefined,
        gender: values.gender || undefined,
        roll_number: values.roll_number || undefined,
        college_email: values.college_email || undefined,
        student_email: values.student_email || undefined,
        academic_year_id: values.academic_year_id,
        student_mobile: values.student_mobile || undefined,
        student_photo_url: values.student_photo_url || undefined,
        religion: values.religion || undefined,
        community: values.community || undefined,
        caste: values.caste || undefined,
        aadhar_number: values.aadhar_number || undefined,
        blood_group: values.blood_group || undefined,
        annual_income: values.annual_income || undefined,
        last_school: values.last_school || undefined,
        board_of_study: values.board_of_study || undefined,
        institution_id: values.institution_id || undefined,
        degree_id: values.degree_id || undefined,
        department_id: values.department_id || undefined,
        program_id: values.program_id || undefined,
        semester_id: values.semester_id,
        section_id: values.section_id,
        register_number: values.register_number || undefined,
        entry_type: values.entry_type || undefined,
        regulation_id: values.regulation_id || undefined,
        batch_id: values.batch_id || undefined,
        permanent_address_street: values.permanent_address || undefined,
        permanent_address_state: values.state || undefined,
        permanent_address_pin_code: values.pincode || undefined,
        permanent_address_district: values.city || undefined,
        accommodation_type: values.accommodation_type || undefined,
      };

      await LearnerProfileService.updateLearnerProfile(id, dto);

      toast.success('Learner profile updated successfully');
      router.push(`/learners/profiles/${id}`);
    } catch (error) {
      console.error('[learners/profiles/[id]/edit] Error updating learner:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update learner profile'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ContentLayout title="Edit Learner">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!learner) {
    return (
      <ContentLayout title="Edit Learner">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Learner Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The requested learner could not be found.
          </p>
          <Button asChild>
            <Link href="/learners/profiles">Back to Learners</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit: ${learner.first_name} ${learner.last_name || ''}`}>
      <div className="space-y-6">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learners', href: '/learners/profiles' },
            {
              label: `${learner.first_name} ${learner.last_name || ''}`,
              href: `/learners/profiles/${id}`,
            },
            { label: 'Edit' },
          ]}
        />

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Learner Profile</h1>
            <p className="text-muted-foreground">
              Update learner information and academic details
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/learners/profiles/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cancel
            </Link>
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="academic">Academic</TabsTrigger>
                <TabsTrigger value="contact">Contact</TabsTrigger>
                <TabsTrigger value="qualifications">Qualifications</TabsTrigger>
                <TabsTrigger value="other">Other</TabsTrigger>
              </TabsList>

              {/* Personal Tab */}
              <TabsContent value="personal">
                <Card>
                  <CardHeader>
                    <CardTitle>Personal Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="first_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              First Name <span className="text-red-500">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="last_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="date_of_birth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date of Birth</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="MALE">Male</SelectItem>
                                <SelectItem value="FEMALE">Female</SelectItem>
                                <SelectItem value="OTHER">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="blood_group"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Blood Group</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select blood group" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="A+">A+</SelectItem>
                                <SelectItem value="A-">A-</SelectItem>
                                <SelectItem value="B+">B+</SelectItem>
                                <SelectItem value="B-">B-</SelectItem>
                                <SelectItem value="AB+">AB+</SelectItem>
                                <SelectItem value="AB-">AB-</SelectItem>
                                <SelectItem value="O+">O+</SelectItem>
                                <SelectItem value="O-">O-</SelectItem>
                                <SelectItem value="A1+">A1+</SelectItem>
                                <SelectItem value="A1B">A1B</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="religion"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Religion</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select religion" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="HINDU">Hindu</SelectItem>
                                <SelectItem value="CHRISTIAN">Christian</SelectItem>
                                <SelectItem value="MUSLIM">Muslim</SelectItem>
                                <SelectItem value="OTHERS">Others</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="community"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Community</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select community" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="OC">OC</SelectItem>
                                <SelectItem value="BC">BC</SelectItem>
                                <SelectItem value="BCM">BCM</SelectItem>
                                <SelectItem value="MBC">MBC</SelectItem>
                                <SelectItem value="DNC">DNC</SelectItem>
                                <SelectItem value="BC-CC">BC-CC</SelectItem>
                                <SelectItem value="SC">SC</SelectItem>
                                <SelectItem value="ST">ST</SelectItem>
                                <SelectItem value="SC (A)">SC (A)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="caste"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Caste</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="aadhar_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Aadhar Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="XXXX-XXXX-XXXX" maxLength={12} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="father_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Father Name <span className="text-red-500">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="father_occupation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Father Occupation</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="father_mobile"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Father Mobile</FormLabel>
                            <FormControl>
                              <Input {...field} type="tel" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mother_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Mother Name <span className="text-red-500">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mother_occupation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mother Occupation</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mother_mobile"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mother Mobile</FormLabel>
                            <FormControl>
                              <Input {...field} type="tel" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="annual_income"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Annual Income</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Academic Tab */}
              <TabsContent value="academic">
                <Card>
                  <CardHeader>
                    <CardTitle>Academic Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="roll_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Roll Number</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="register_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Register Number</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="college_email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>College Email</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="student_email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Personal Email</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="student_mobile"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Student Mobile</FormLabel>
                            <FormControl>
                              <Input {...field} type="tel" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="institution_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Institution</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select institution" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {institutions.map((inst) => (
                                  <SelectItem key={inst.id} value={inst.id}>
                                    {inst.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="degree_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Degree</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!watchInstitutionId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select degree" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {degrees.map((deg) => (
                                  <SelectItem key={deg.id} value={deg.id}>
                                    {deg.degree_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="department_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Department</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!watchDegreeId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {departments.map((dept) => (
                                  <SelectItem key={dept.id} value={dept.id}>
                                    {dept.department_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="program_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Program</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!watchDepartmentId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select program" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {programs.map((prog) => (
                                  <SelectItem key={prog.id} value={prog.id}>
                                    {prog.program_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="semester_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Semester <span className="text-red-500">*</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!watchProgramId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select semester" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {semesters.map((sem) => (
                                  <SelectItem key={sem.id} value={sem.id}>
                                    {sem.semester_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="section_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Section <span className="text-red-500">*</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!watchSemesterId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select section" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {sections.map((sec) => (
                                  <SelectItem key={sec.id} value={sec.id}>
                                    {sec.section_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="academic_year_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Academic Year <span className="text-red-500">*</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!watchInstitutionId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select academic year" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {academicYears.map((year) => (
                                  <SelectItem key={year.id} value={year.id}>
                                    {year.academic_year_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="regulation_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Regulation</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!watchInstitutionId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select regulation" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {regulations.map((reg) => (
                                  <SelectItem key={reg.id} value={reg.id}>
                                    {reg.regulation_year || reg.regulation_code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="batch_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Batch</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={!watchInstitutionId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select batch" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {batches.map((batch) => (
                                  <SelectItem key={batch.id} value={batch.id}>
                                    {batch.batch_name || batch.batch_code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Contact Tab */}
              <TabsContent value="contact">
                <Card>
                  <CardHeader>
                    <CardTitle>Contact & Address</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="permanent_address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Permanent Address</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="communication_address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Communication Address</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="pincode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pincode</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Qualifications Tab */}
              <TabsContent value="qualifications">
                <Card>
                  <CardHeader>
                    <CardTitle>Qualifications</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="last_school"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last School</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="board_of_study"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Board of Study</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="entry_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entry Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select entry type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="FIRST YEAR">First Year</SelectItem>
                                <SelectItem value="LATERAL ENTRY">Lateral Entry</SelectItem>
                                <SelectItem value="RE-ADMISSION">Re-Admission</SelectItem>
                                <SelectItem value="COLLEGE TRANSFER">College Transfer</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Other Tab */}
              <TabsContent value="other">
                <Card>
                  <CardHeader>
                    <CardTitle>Other Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="accommodation_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Accommodation Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select accommodation" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="HOSTEL">Hostel</SelectItem>
                                <SelectItem value="DAY SCHOLAR">Day Scholar</SelectItem>
                                <SelectItem value="HOME">Home</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="application_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Application Number</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="admission_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Admission Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="student_photo_url"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Student Photo URL</FormLabel>
                            <FormControl>
                              <Input {...field} type="url" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" asChild>
                <Link href={`/learners/profiles/${id}`}>Cancel</Link>
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </ContentLayout>
  );
}
