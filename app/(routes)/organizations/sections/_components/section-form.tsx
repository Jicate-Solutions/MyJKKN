'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Section } from '@/types/organizations';
import { SectionService } from '@/lib/services/section-service';
import { OrganizationService } from '@/lib/services/organization-service';
import { DegreeService } from '@/lib/services/degree-service';
import { DepartmentService } from '@/lib/services/department-service';
import { ProgramService } from '@/lib/services/program-service';
import { CourseService } from '@/lib/services/course-service';
import { SemesterService } from '@/lib/services/semester-service';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';

const sectionSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  program_id: z.string().min(1, 'Program is required'),
  course_id: z.string().min(1, 'Course is required'),
  semester_id: z.string().min(1, 'Semester is required'),
  section_code: z
    .string()
    .min(2, 'Section code must be at least 2 characters')
    .max(20, 'Section code must be at most 20 characters')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Section code can only contain uppercase letters, numbers, underscores, and hyphens'
    )
    .transform((val) => val.toUpperCase()),
  section_name: z.string().min(1, 'Name is required'),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof sectionSchema>;

interface SectionFormProps {
  section?: Section;
  isEditing?: boolean;
}

interface Institution {
  id: string;
  name: string;
}

interface Degree {
  id: string;
  degree_name: string;
}

interface Department {
  id: string;
  department_name: string;
}

interface Program {
  id: string;
  program_name: string;
}

interface Course {
  id: string;
  course_name: string;
}

interface Semester {
  id: string;
  semester_name: string;
}

export function SectionForm({ section, isEditing }: SectionFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(sectionSchema),
    defaultValues: {
      institution_id: section?.institution_id || '',
      degree_id: section?.degree_id || '',
      department_id: section?.department_id || '',
      program_id: section?.program_id || '',
      course_id: section?.course_id || '',
      semester_id: section?.semester_id || '',
      section_code: section?.section_code || '',
      section_name: section?.section_name || '',
      is_active: section?.is_active ?? true
    }
  });

  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');
  const watchedCourseId = form.watch('course_id');

  // Load institutions on mount
  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
        toast.error('Failed to load institutions');
      }
    }
    loadInstitutions();
  }, []);

  // Load degrees when institution changes
  useEffect(() => {
    if (watchedInstitutionId) {
      async function loadDegrees() {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            watchedInstitutionId
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
          toast.error('Failed to load degrees');
        }
      }
      loadDegrees();
    } else {
      setDegrees([]);
      form.setValue('degree_id', '');
    }
  }, [watchedInstitutionId, form]);

  // Load departments when degree changes
  useEffect(() => {
    if (watchedDegreeId) {
      async function loadDepartments() {
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            watchedDegreeId
          );
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
          toast.error('Failed to load departments');
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
      form.setValue('department_id', '');
    }
  }, [watchedDegreeId, form]);

  // Load programs when department changes
  useEffect(() => {
    if (watchedDepartmentId) {
      async function loadPrograms() {
        try {
          const { data } = await ProgramService.getPrograms({
            department_id: watchedDepartmentId,
            isActive: true
          });
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
          toast.error('Failed to load programs');
        }
      }
      loadPrograms();
    } else {
      setPrograms([]);
      form.setValue('program_id', '');
    }
  }, [watchedDepartmentId, form]);

  // Load courses when program changes
  useEffect(() => {
    if (watchedProgramId) {
      async function loadCourses() {
        try {
          const data = await CourseService.getCoursesByProgram(
            watchedProgramId
          );
          setCourses(data);
        } catch (error) {
          console.error('Error loading courses:', error);
          toast.error('Failed to load courses');
        }
      }
      loadCourses();
    } else {
      setCourses([]);
      form.setValue('course_id', '');
    }
  }, [watchedProgramId, form]);

  // Load semesters when course changes
  useEffect(() => {
    if (watchedCourseId) {
      async function loadSemesters() {
        try {
          const data = await SemesterService.getSemestersByCourse(
            watchedCourseId
          );
          setSemesters(data);
        } catch (error) {
          console.error('Error loading semesters:', error);
          toast.error('Failed to load semesters');
        }
      }
      loadSemesters();
    } else {
      setSemesters([]);
      form.setValue('semester_id', '');
    }
  }, [watchedCourseId, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      if (isEditing && section) {
        await SectionService.updateSection(section.id, values);
      } else {
        await SectionService.createSection(values);
      }

      router.push('/organizations/sections');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save section'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <Card>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              {/* Institution Select */}
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.map((inst: Institution) => (
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

              {/* Degree Select */}
              <FormField
                control={form.control}
                name='degree_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Degree</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchedInstitutionId || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select degree' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {degrees.map((degree: Degree) => (
                          <SelectItem key={degree.id} value={degree.id}>
                            {degree.degree_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Department Select */}
              <FormField
                control={form.control}
                name='department_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchedDegreeId || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select department' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments.map((dept: Department) => (
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

              {/* Program Select */}
              <FormField
                control={form.control}
                name='program_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Program</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchedDepartmentId || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select program' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {programs.map((program: Program) => (
                          <SelectItem key={program.id} value={program.id}>
                            {program.program_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Course Select */}
              <FormField
                control={form.control}
                name='course_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Course</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchedProgramId || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select course' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {courses.map((course: Course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.course_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Semester Select */}
              <FormField
                control={form.control}
                name='semester_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semester</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchedCourseId || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select semester' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {semesters.map((semester: Semester) => (
                          <SelectItem key={semester.id} value={semester.id}>
                            {semester.semester_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Section Code Input */}
              <FormField
                control={form.control}
                name='section_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter section code'
                        {...field}
                        value={field.value.toUpperCase()}
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase())
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Section Name Input */}
              <FormField
                control={form.control}
                name='section_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter section name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Active Status Switch */}
            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Active Status</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      Disable to temporarily hide this section
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className='flex justify-end gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? isEditing
                ? 'Saving...'
                : 'Creating...'
              : isEditing
              ? 'Save Changes'
              : 'Create Section'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
