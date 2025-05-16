'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

import { StudentService } from '@/lib/services/student/student-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { CreateStudentDto } from '@/types/student';

// Form schema for student creation
const formSchema = z.object({
  // Personal Info
  student_name: z.string().min(1, { message: 'Student name is required' }),
  father_name: z.string().min(1, { message: 'Father name is required' }),
  father_occupation: z.string().optional(),
  father_mobile: z.string().optional(),
  mother_name: z.string().min(1, { message: 'Mother name is required' }),
  mother_occupation: z.string().optional(),
  mother_mobile: z.string().min(1, { message: 'Mother mobile is required' }),
  date_of_birth: z.date({ required_error: 'Date of birth is required' }),
  gender: z.string().min(1, { message: 'Gender is required' }),
  religion: z.string().min(1, { message: 'Religion is required' }),
  community: z.string().min(1, { message: 'Community is required' }),
  caste: z.string().optional(),
  annual_income: z.string().optional(),

  // Academic Info
  last_school: z.string().min(1, { message: 'Last school is required' }),
  board_of_study: z.string().min(1, { message: 'Board of study is required' }),
  tenth_marks: z.object({
    max_marks: z.string().min(1, { message: 'Max marks is required' }),
    obtained_marks: z
      .string()
      .min(1, { message: 'Obtained marks is required' }),
    percentage: z.string().min(1, { message: 'Percentage is required' })
  }),
  twelfth_marks: z.object({
    group: z.string().min(1, { message: 'Group is required' }),
    max_marks: z.string().min(1, { message: 'Max marks is required' }),
    obtained_marks: z
      .string()
      .min(1, { message: 'Obtained marks is required' }),
    percentage: z.string().min(1, { message: 'Percentage is required' }),
    subjects: z.record(z.string())
  }),
  medical_cutoff_marks: z.string().optional(),
  engineering_cutoff_marks: z.string().optional(),
  neet_roll_number: z.string().optional(),
  counseling_applied: z.boolean().default(false),
  counseling_number: z.string().optional(),
  first_graduate: z.boolean().default(false),

  // Course Info
  quota: z.string().optional(),
  category: z.string().optional(),
  institution_id: z.string().min(1, { message: 'Institution is required' }),
  degree_id: z.string().min(1, { message: 'Degree is required' }),
  department_id: z.string().min(1, { message: 'Department is required' }),
  program_id: z.string().min(1, { message: 'Program is required' }),
  semester_id: z.string().optional(),
  section_id: z.string().optional(),
  entry_type: z.string().min(1, { message: 'Entry type is required' }),

  // Contact Info
  permanent_address_street: z
    .string()
    .min(1, { message: 'Address street is required' }),
  permanent_address_taluk: z.string().optional(),
  permanent_address_district: z
    .string()
    .min(1, { message: 'Address district is required' }),
  permanent_address_pin_code: z
    .string()
    .regex(/^\d{6}$/, { message: 'Address PIN code must be 6 digits' }),
  permanent_address_state: z
    .string()
    .min(1, { message: 'Address state is required' }),
  student_mobile: z.string().min(1, { message: 'Student mobile is required' }),
  student_email: z.string().email({ message: 'Valid student email required' }),

  // Accommodation Info
  accommodation_type: z
    .string()
    .min(1, { message: 'Accommodation type is required' }),
  hostel_type: z.string().optional(),
  bus_required: z.boolean().default(false),
  bus_route: z.string().optional(),
  bus_pickup_location: z.string().optional(),

  // Reference Info
  reference_type: z.string().optional(),
  reference_name: z.string().optional(),
  reference_contact: z.string().optional(),

  // Additional fields
  roll_number: z.string().optional(),
  college_email: z
    .string()
    .email({ message: 'Invalid college email format' })
    .optional(),
  status: z
    .enum(['active', 'inactive', 'pending', 'exited', 'graduated'])
    .default('active')
});

export type StudentFormValues = z.infer<typeof formSchema>;

type CreateStudentFormProps = {
  onSuccess?: () => void;
};

export function CreateStudentForm({ onSuccess }: CreateStudentFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateStudent = async (data: CreateStudentDto) => {
    setIsSubmitting(true);
    try {
      const student = await StudentService.createStudent(data);
      toast.success('Student created successfully');
      setIsOpen(false);

      // Navigate to the student detail page or refresh the list
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/students/${student?.id}`);
      }
    } catch (error) {
      console.error('Error creating student:', error);
      toast.error('Failed to create student');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Create Student</Button>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Create New Student</DialogTitle>
        </DialogHeader>
        <StudentFormContent
          onSubmit={handleCreateStudent}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}

function StudentFormContent({
  onSubmit,
  isSubmitting
}: {
  onSubmit: (data: CreateStudentDto) => Promise<void>;
  isSubmitting: boolean;
}) {
  // State for institution, departments, programs, semesters
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);
  const [sections, setSections] = useState<
    Array<{ id: string; section_name: string }>
  >([]);
  const [loading, setLoading] = useState({
    institutions: true,
    departments: false,
    degrees: false,
    programs: false,
    sections: false
  });

  const defaultValues: Partial<StudentFormValues> = {
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
    counseling_applied: false,
    first_graduate: false,
    bus_required: false,
    status: 'active'
  };

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues
  });

  // Watch for dependency changes
  const watchInstitutionId = form.watch('institution_id');
  const watchDepartmentId = form.watch('department_id');
  const watchProgramId = form.watch('program_id');
  const watchAccommodationType = form.watch('accommodation_type');
  const watchBusRequired = form.watch('bus_required');

  // Load institutions on mount
  useEffect(() => {
    async function loadInstitutions() {
      try {
        setLoading((prev) => ({ ...prev, institutions: true }));
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
        toast.error('Failed to load institutions');
      } finally {
        setLoading((prev) => ({ ...prev, institutions: false }));
      }
    }
    loadInstitutions();
  }, []);

  // Load departments when institution changes
  useEffect(() => {
    if (watchInstitutionId) {
      async function loadDepartments() {
        try {
          setLoading((prev) => ({ ...prev, departments: true, degrees: true }));
          form.setValue('department_id', '');
          form.setValue('degree_id', '');
          form.setValue('program_id', '');
          form.setValue('section_id', '');
          setDepartments([]);
          setDegrees([]);
          setPrograms([]);
          setSections([]);

          // Load departments
          const deptResponse = await DepartmentService.getDepartments({
            institution_id: watchInstitutionId,
            isActive: true
          });
          setDepartments(deptResponse.data);

          // Load degrees for the institution
          const degreeResponse = await fetch(
            `/api/organizations/degrees?institution_id=${watchInstitutionId}&isActive=true`
          );
          const degreeData = await degreeResponse.json();
          setDegrees(degreeData.data || []);
        } catch (error) {
          console.error('Error loading departments/degrees:', error);
          toast.error('Failed to load departments/degrees');
        } finally {
          setLoading((prev) => ({
            ...prev,
            departments: false,
            degrees: false
          }));
        }
      }
      loadDepartments();
    }
  }, [watchInstitutionId, form]);

  // Load programs when department changes
  useEffect(() => {
    if (watchDepartmentId) {
      async function loadPrograms() {
        try {
          setLoading((prev) => ({ ...prev, programs: true }));
          form.setValue('program_id', '');
          form.setValue('section_id', '');
          setPrograms([]);
          setSections([]);

          const { data } = await ProgramService.getPrograms({
            department_id: watchDepartmentId,
            isActive: true
          });
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
          toast.error('Failed to load programs');
        } finally {
          setLoading((prev) => ({ ...prev, programs: false }));
        }
      }
      loadPrograms();
    }
  }, [watchDepartmentId, form]);

  // Load sections when program changes
  useEffect(() => {
    if (watchProgramId) {
      async function loadSections() {
        try {
          setLoading((prev) => ({ ...prev, sections: true }));
          form.setValue('section_id', '');
          setSections([]);

          const { data } = await SectionService.getSections({
            program_id: watchProgramId,
            isActive: true
          });
          setSections(data);
        } catch (error) {
          console.error('Error loading sections:', error);
          toast.error('Failed to load sections');
        } finally {
          setLoading((prev) => ({ ...prev, sections: false }));
        }
      }
      loadSections();
    }
  }, [watchProgramId, form]);

  const handleSubmit = async (data: StudentFormValues) => {
    // Transform date to ISO string for API
    const formattedData = {
      ...data,
      date_of_birth: format(data.date_of_birth, 'yyyy-MM-dd'),
      // For manually created students, we create a UUID for admission_id
      // since it's a required field in the database
      admission_id: crypto.randomUUID
        ? crypto.randomUUID()
        : 'manual-' + Date.now().toString()
    } as unknown as CreateStudentDto;

    await onSubmit(formattedData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <Tabs defaultValue='personal' className='w-full'>
          <TabsList className='grid grid-cols-6 mb-4'>
            <TabsTrigger value='personal'>Personal</TabsTrigger>
            <TabsTrigger value='academic'>Academic</TabsTrigger>
            <TabsTrigger value='course'>Course</TabsTrigger>
            <TabsTrigger value='contact'>Contact</TabsTrigger>
            <TabsTrigger value='accommodation'>Accommodation</TabsTrigger>
            <TabsTrigger value='other'>Other</TabsTrigger>
          </TabsList>

          {/* Personal Information Tab */}
          <TabsContent value='personal' className='space-y-4'>
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='student_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Student Name*</FormLabel>
                    <FormControl>
                      <Input placeholder='Full Name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='date_of_birth'
                render={({ field }) => (
                  <FormItem className='flex flex-col'>
                    <FormLabel>Date of Birth*</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant='outline'
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='father_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Father&apos;s Name*</FormLabel>
                    <FormControl>
                      <Input placeholder="Father's Name" {...field} />
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
                      <Input placeholder="Father's Occupation" {...field} />
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
                      <Input placeholder="Father's Mobile" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='mother_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mother&apos;s Name*</FormLabel>
                    <FormControl>
                      <Input placeholder="Mother's Name" {...field} />
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
                      <Input placeholder="Mother's Occupation" {...field} />
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
                    <FormLabel>Mother&apos;s Mobile*</FormLabel>
                    <FormControl>
                      <Input placeholder="Mother's Mobile" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='gender'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Gender' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='Male'>Male</SelectItem>
                        <SelectItem value='Female'>Female</SelectItem>
                        <SelectItem value='Other'>Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='religion'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Religion*</FormLabel>
                    <FormControl>
                      <Input placeholder='Religion' {...field} />
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
                    <FormLabel>Community*</FormLabel>
                    <FormControl>
                      <Input placeholder='Community' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='caste'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Caste</FormLabel>
                    <FormControl>
                      <Input placeholder='Caste' {...field} />
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
                      <Input placeholder='Annual Income' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          {/* Academic Information Tab */}
          <TabsContent value='academic' className='space-y-4'>
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='last_school'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last School*</FormLabel>
                    <FormControl>
                      <Input placeholder='Last School Attended' {...field} />
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
                    <FormLabel>Board of Study*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Board' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='State Board'>State Board</SelectItem>
                        <SelectItem value='CBSE'>CBSE</SelectItem>
                        <SelectItem value='ICSE'>ICSE</SelectItem>
                        <SelectItem value='Matriculation'>
                          Matriculation
                        </SelectItem>
                        <SelectItem value='Other'>Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='col-span-2'>
                <div className='mb-2 font-medium'>10th Marks*</div>
                <div className='grid grid-cols-3 gap-4'>
                  <FormField
                    control={form.control}
                    name='tenth_marks.max_marks'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Marks</FormLabel>
                        <FormControl>
                          <Input placeholder='Max Marks' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='tenth_marks.obtained_marks'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Obtained Marks</FormLabel>
                        <FormControl>
                          <Input placeholder='Obtained Marks' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='tenth_marks.percentage'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Percentage</FormLabel>
                        <FormControl>
                          <Input placeholder='Percentage' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className='col-span-2'>
                <div className='mb-2 font-medium'>12th Marks*</div>
                <div className='grid grid-cols-2 gap-4 mb-4'>
                  <FormField
                    control={form.control}
                    name='twelfth_marks.group'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select Group' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            <SelectItem value='Science - Bio'>
                              Science - Bio
                            </SelectItem>
                            <SelectItem value='Science - Maths'>
                              Science - Maths
                            </SelectItem>
                            <SelectItem value='Commerce'>Commerce</SelectItem>
                            <SelectItem value='Arts'>Arts</SelectItem>
                            <SelectItem value='Vocational'>
                              Vocational
                            </SelectItem>
                            <SelectItem value='Other'>Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className='grid grid-cols-3 gap-4'>
                  <FormField
                    control={form.control}
                    name='twelfth_marks.max_marks'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Marks</FormLabel>
                        <FormControl>
                          <Input placeholder='Max Marks' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='twelfth_marks.obtained_marks'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Obtained Marks</FormLabel>
                        <FormControl>
                          <Input placeholder='Obtained Marks' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='twelfth_marks.percentage'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Percentage</FormLabel>
                        <FormControl>
                          <Input placeholder='Percentage' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name='engineering_cutoff_marks'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Engineering Cutoff Marks</FormLabel>
                    <FormControl>
                      <Input placeholder='Engineering Cutoff' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='medical_cutoff_marks'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Medical Cutoff Marks</FormLabel>
                    <FormControl>
                      <Input placeholder='Medical Cutoff' {...field} />
                    </FormControl>
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
                      <Input placeholder='NEET Roll Number' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='col-span-1'>
                <FormField
                  control={form.control}
                  name='counseling_applied'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-start space-x-3 space-y-0 mt-4'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className='space-y-1 leading-none'>
                        <FormLabel>Counseling Applied</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {form.watch('counseling_applied') && (
                <FormField
                  control={form.control}
                  name='counseling_number'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Counseling Number</FormLabel>
                      <FormControl>
                        <Input placeholder='Counseling Number' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className='col-span-1'>
                <FormField
                  control={form.control}
                  name='first_graduate'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-start space-x-3 space-y-0 mt-4'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className='space-y-1 leading-none'>
                        <FormLabel>First Graduate</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='quota'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quota</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Quota' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='General'>General</SelectItem>
                        <SelectItem value='Management'>Management</SelectItem>
                        <SelectItem value='Government'>Government</SelectItem>
                        <SelectItem value='NRI'>NRI</SelectItem>
                        <SelectItem value='Sports'>Sports</SelectItem>
                        <SelectItem value='Other'>Other</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <FormControl>
                      <Input placeholder='Category' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          {/* Course Information Tab */}
          <TabsContent value='course' className='space-y-4'>
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {loading.institutions ? (
                          <div className='flex items-center justify-center p-2'>
                            <Loader2 className='h-4 w-4 animate-spin mr-2' />
                            Loading...
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='degree_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Degree*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={!watchInstitutionId || loading.degrees}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Degree' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {loading.degrees ? (
                          <div className='flex items-center justify-center p-2'>
                            <Loader2 className='h-4 w-4 animate-spin mr-2' />
                            Loading...
                          </div>
                        ) : degrees.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No degrees found. Select an institution first.
                          </div>
                        ) : (
                          degrees.map((degree) => (
                            <SelectItem key={degree.id} value={degree.id}>
                              {degree.degree_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='department_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={!watchInstitutionId || loading.departments}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Department' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {loading.departments ? (
                          <div className='flex items-center justify-center p-2'>
                            <Loader2 className='h-4 w-4 animate-spin mr-2' />
                            Loading...
                          </div>
                        ) : departments.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No departments found. Select an institution first.
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='program_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Program*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={!watchDepartmentId || loading.programs}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Program' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {loading.programs ? (
                          <div className='flex items-center justify-center p-2'>
                            <Loader2 className='h-4 w-4 animate-spin mr-2' />
                            Loading...
                          </div>
                        ) : programs.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No programs found. Select a department first.
                          </div>
                        ) : (
                          programs.map((program) => (
                            <SelectItem key={program.id} value={program.id}>
                              {program.program_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='section_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={!watchProgramId || loading.sections}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Section' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {loading.sections ? (
                          <div className='flex items-center justify-center p-2'>
                            <Loader2 className='h-4 w-4 animate-spin mr-2' />
                            Loading...
                          </div>
                        ) : sections.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No sections found. Select a program first.
                          </div>
                        ) : (
                          sections.map((section) => (
                            <SelectItem key={section.id} value={section.id}>
                              {section.section_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='entry_type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entry Type*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Entry Type' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='FIRST YEAR'>First Year</SelectItem>
                        <SelectItem value='LATERAL ENTRY'>
                          Lateral Entry
                        </SelectItem>
                        <SelectItem value='TRANSFER'>Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='roll_number'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Roll Number</FormLabel>
                    <FormControl>
                      <Input placeholder='Roll Number' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          {/* Contact Information Tab */}
          <TabsContent value='contact' className='space-y-4'>
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='permanent_address_street'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Street*</FormLabel>
                    <FormControl>
                      <Input placeholder='Street Address' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='permanent_address_taluk'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Taluk</FormLabel>
                    <FormControl>
                      <Input placeholder='Taluk' {...field} />
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
                    <FormLabel>District*</FormLabel>
                    <FormControl>
                      <Input placeholder='District' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='permanent_address_state'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State*</FormLabel>
                    <FormControl>
                      <Input placeholder='State' {...field} />
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
                    <FormLabel>PIN Code*</FormLabel>
                    <FormControl>
                      <Input placeholder='PIN Code' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='student_mobile'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Student Mobile*</FormLabel>
                    <FormControl>
                      <Input placeholder='Student Mobile' {...field} />
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
                    <FormLabel>Student Email*</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Personal Email'
                        {...field}
                        type='email'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='college_email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>College Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='College Email (if assigned)'
                        {...field}
                        type='email'
                      />
                    </FormControl>
                    <FormMessage />
                    <FormDescription>
                      If provided, a user account will be created for the
                      student
                    </FormDescription>
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          {/* Accommodation Tab */}
          <TabsContent value='accommodation' className='space-y-4'>
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='accommodation_type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Accommodation Type*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Accommodation Type' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='DAY SCHOLAR'>Day Scholar</SelectItem>
                        <SelectItem value='HOSTEL'>Hostel</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchAccommodationType === 'HOSTEL' && (
                <FormField
                  control={form.control}
                  name='hostel_type'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hostel Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select Hostel Type' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className='max-h-60 overflow-y-auto'>
                          <SelectItem value='COLLEGE HOSTEL'>
                            College Hostel
                          </SelectItem>
                          <SelectItem value='PRIVATE HOSTEL'>
                            Private Hostel
                          </SelectItem>
                          <SelectItem value='RENTED'>
                            Rented Accommodation
                          </SelectItem>
                          <SelectItem value='RELATIVE'>
                            Relative&apos;s House
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className='col-span-1'>
                <FormField
                  control={form.control}
                  name='bus_required'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-start space-x-3 space-y-0 mt-4'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className='space-y-1 leading-none'>
                        <FormLabel>Bus Required</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {watchBusRequired && (
                <>
                  <FormField
                    control={form.control}
                    name='bus_route'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bus Route</FormLabel>
                        <FormControl>
                          <Input placeholder='Bus Route' {...field} />
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
                        <FormLabel>Bus Pickup Location</FormLabel>
                        <FormControl>
                          <Input placeholder='Bus Pickup Location' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>
          </TabsContent>

          {/* Other Information Tab */}
          <TabsContent value='other' className='space-y-4'>
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='reference_type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Reference Type' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='DIRECT'>Direct</SelectItem>
                        <SelectItem value='AGENT'>Agent</SelectItem>
                        <SelectItem value='STAFF'>Staff</SelectItem>
                        <SelectItem value='STUDENT'>Student</SelectItem>
                        <SelectItem value='ALUMNI'>Alumni</SelectItem>
                        <SelectItem value='OTHER'>Other</SelectItem>
                      </SelectContent>
                    </Select>
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
                      <Input placeholder='Reference Name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='reference_contact'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Contact</FormLabel>
                    <FormControl>
                      <Input placeholder='Reference Contact' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='status'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select Status' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='active'>Active</SelectItem>
                        <SelectItem value='inactive'>Inactive</SelectItem>
                        <SelectItem value='pending'>Pending</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className='mt-6'>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Creating...
              </>
            ) : (
              'Create Student'
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
