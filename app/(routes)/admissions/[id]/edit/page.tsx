'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AdmissionForm } from '../../_components/admission-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Admission } from '@/types/admission';

export default function EditAdmissionPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [admission, setAdmission] = useState<Admission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const admissionId = params.id as string;

  useEffect(() => {
    async function fetchAdmission() {
      if (!admissionId) return;

      try {
        setIsLoading(true);

        // Fetch the admission from Supabase without joins
        const { data: admissionData, error: admissionError } = await supabase
          .from('admissions')
          .select('*')
          .eq('id', admissionId)
          .single();

        if (admissionError) throw admissionError;
        if (!admissionData) throw new Error('Admission not found');

        console.log('Raw admission data:', admissionData);

        // Create a data object that will be enhanced with related information
        let formattedData: any = { ...admissionData };

        // Check if field_of_study is a valid UUID before querying
        if (
          admissionData.field_of_study &&
          isValidUUID(admissionData.field_of_study)
        ) {
          try {
            const { data: institutionData } = await supabase
              .from('institutions')
              .select('id, name')
              .eq('id', admissionData.field_of_study)
              .maybeSingle();

            if (institutionData) {
              formattedData.institution = institutionData;
            }
          } catch (err) {
            console.error('Error fetching institution:', err);
          }
        } else if (admissionData.field_of_study) {
          // If not a UUID, it might be already the name - store it directly
          formattedData.institution = {
            id: admissionData.field_of_study,
            name: admissionData.field_of_study
          };
        }

        // Apply same UUID check for other related fields
        if (admissionData.degree_id && isValidUUID(admissionData.degree_id)) {
          try {
            const { data: degreeData } = await supabase
              .from('degrees')
              .select('id, degree_name')
              .eq('id', admissionData.degree_id)
              .maybeSingle();

            if (degreeData) {
              formattedData.degree = degreeData;
            }
          } catch (err) {
            console.error('Error fetching degree:', err);
          }
        }

        if (
          admissionData.department_id &&
          isValidUUID(admissionData.department_id)
        ) {
          try {
            const { data: departmentData } = await supabase
              .from('departments')
              .select('id, department_name')
              .eq('id', admissionData.department_id)
              .maybeSingle();

            if (departmentData) {
              formattedData.department = departmentData;
            }
          } catch (err) {
            console.error('Error fetching department:', err);
          }
        }

        if (admissionData.program_id && isValidUUID(admissionData.program_id)) {
          try {
            const { data: programData } = await supabase
              .from('programs')
              .select('id, program_name')
              .eq('id', admissionData.program_id)
              .maybeSingle();

            if (programData) {
              formattedData.program = programData;
            }
          } catch (err) {
            console.error('Error fetching program:', err);
          }
        }

        // Check if year_and_branch is a UUID or a string value (like "B.Ed")
        if (
          admissionData.year_and_branch &&
          isValidUUID(admissionData.year_and_branch)
        ) {
          try {
            const { data: courseData } = await supabase
              .from('courses')
              .select('id, course_name')
              .eq('id', admissionData.year_and_branch)
              .maybeSingle();

            if (courseData) {
              formattedData.course = courseData;
            }
          } catch (err) {
            console.error('Error fetching course:', err);
          }
        } else if (admissionData.year_and_branch) {
          // If not a UUID, it's probably a string course name
          console.log('Course name (not UUID):', admissionData.year_and_branch);
          formattedData.course = {
            id: admissionData.year_and_branch,
            course_name: admissionData.year_and_branch
          };
        }

        // Log course-related information for debugging
        console.log('Course information debug:', {
          fieldOfStudy: admissionData.field_of_study,
          degreeId: admissionData.degree_id,
          departmentId: admissionData.department_id,
          programId: admissionData.program_id,
          courseType: admissionData.course_type,
          entryType: admissionData.entry_type,
          yearAndBranch: admissionData.year_and_branch
        });

        // Parse JSON fields if they're stored as strings
        let tenthMarks = admissionData.tenth_marks;
        let twelfthMarks = admissionData.twelfth_marks;

        console.log('Raw tenth marks:', tenthMarks);
        console.log('Raw twelfth marks:', twelfthMarks);

        // Handle string representations of JSON
        if (typeof tenthMarks === 'string') {
          try {
            tenthMarks = JSON.parse(tenthMarks);
          } catch (e) {
            console.error('Error parsing tenth marks JSON:', e);
            tenthMarks = { maxMarks: '', obtainedMarks: '', percentage: '' };
          }
        }

        if (typeof twelfthMarks === 'string') {
          try {
            twelfthMarks = JSON.parse(twelfthMarks);
          } catch (e) {
            console.error('Error parsing twelfth marks JSON:', e);
            twelfthMarks = {
              group: '',
              maxMarks: '',
              obtainedMarks: '',
              percentage: '',
              subjects: {}
            };
          }
        }

        // Convert legacy format: {max_marks, obtained_marks} to {maxMarks, obtainedMarks}
        if (tenthMarks && typeof tenthMarks === 'object') {
          if (
            tenthMarks.max_marks !== undefined &&
            tenthMarks.maxMarks === undefined
          ) {
            tenthMarks.maxMarks = tenthMarks.max_marks;
          }
          if (
            tenthMarks.obtained_marks !== undefined &&
            tenthMarks.obtainedMarks === undefined
          ) {
            tenthMarks.obtainedMarks = tenthMarks.obtained_marks;
          }
        }

        if (twelfthMarks && typeof twelfthMarks === 'object') {
          if (
            twelfthMarks.max_marks !== undefined &&
            twelfthMarks.maxMarks === undefined
          ) {
            twelfthMarks.maxMarks = twelfthMarks.max_marks;
          }
          if (
            twelfthMarks.obtained_marks !== undefined &&
            twelfthMarks.obtainedMarks === undefined
          ) {
            twelfthMarks.obtainedMarks = twelfthMarks.obtained_marks;
          }
        }

        // Ensure nested objects have proper structure
        if (!tenthMarks || typeof tenthMarks !== 'object') {
          tenthMarks = { maxMarks: '', obtainedMarks: '', percentage: '' };
        }

        if (!twelfthMarks || typeof twelfthMarks !== 'object') {
          twelfthMarks = {
            group: '',
            maxMarks: '',
            obtainedMarks: '',
            percentage: '',
            subjects: {}
          };
        }

        // Make sure subjects is an object, not null
        if (!twelfthMarks.subjects) {
          twelfthMarks.subjects = {};
        }

        console.log('Processed tenth marks:', tenthMarks);
        console.log('Processed twelfth marks:', twelfthMarks);

        // Map database fields to form fields with special handling for missing fields
        formattedData = {
          ...formattedData,
          // Basic Details section
          id: admissionData.id,
          status: admissionData.status || 'pending',
          studentName: admissionData.student_name || '',
          fatherName: admissionData.father_name || '',
          fatherOccupation: admissionData.father_occupation || '',
          fatherMobile: admissionData.father_mobile || '',
          motherName: admissionData.mother_name || '',
          motherOccupation: admissionData.mother_occupation || '',
          motherMobile: admissionData.mother_mobile || '',
          dateOfBirth: admissionData.date_of_birth || '',
          gender: admissionData.gender || '',
          religion: admissionData.religion || '',
          community: admissionData.community || '',
          caste: admissionData.caste || '',
          annualIncome: admissionData.annual_income || '',

          // Academic Information section with properly formatted marks
          lastSchool: admissionData.last_school || '',
          boardOfStudy: admissionData.board_of_study || '',
          // Pass the raw marks data to let the form component handle processing
          tenth_marks: admissionData.tenth_marks,
          twelfth_marks: admissionData.twelfth_marks,
          // Also map to the expected form structure
          tenthMarks: {
            maxMarks: tenthMarks?.maxMarks || tenthMarks?.max_marks || '',
            obtainedMarks:
              tenthMarks?.obtainedMarks || tenthMarks?.obtained_marks || '',
            percentage: tenthMarks?.percentage || ''
          },
          twelfthMarks: {
            group: twelfthMarks?.group || '',
            maxMarks: twelfthMarks?.maxMarks || twelfthMarks?.max_marks || '',
            obtainedMarks:
              twelfthMarks?.obtainedMarks || twelfthMarks?.obtained_marks || '',
            percentage: twelfthMarks?.percentage || '',
            subjects: twelfthMarks?.subjects || {}
          },
          counselingApplied: Boolean(admissionData.counseling_applied),
          counselingNumber: admissionData.counseling_number || '',
          firstGraduate: Boolean(admissionData.first_graduate),
          medicalCutoffMarks: admissionData.medical_cutoff_marks || '',
          engineeringCutoffMarks: admissionData.engineering_cutoff_marks || '',
          neetRollNumber: admissionData.neet_roll_number || '',

          // Course Selection section
          fieldOfStudy: admissionData.field_of_study || '',
          degreeId: admissionData.degree_id || '',
          departmentId: admissionData.department_id || '',
          programId: admissionData.program_id || '',
          courseType: admissionData.course_type || '',
          entryType: admissionData.entry_type || '',
          yearAndBranch: admissionData.year_and_branch || '',
          quota: admissionData.quota || '',
          category: admissionData.category || '',

          // Contact Details section
          permanentAddressStreet: admissionData.permanent_address_street || '',
          permanentAddressTaluk: admissionData.permanent_address_taluk || '',
          permanentAddressDistrict:
            admissionData.permanent_address_district || '',
          permanentAddressPinCode:
            admissionData.permanent_address_pin_code || '',
          permanentAddressState: admissionData.permanent_address_state || '',
          studentMobile: admissionData.student_mobile || '',
          studentEmail: admissionData.student_email || '',

          // Accommodation Preferences section
          accommodationType: admissionData.accommodation_type || '',
          hostelType: admissionData.hostel_type || '',
          busRequired: Boolean(admissionData.bus_required),
          busRoute: admissionData.bus_route || '',
          busPickupLocation: admissionData.bus_pickup_location || '',
          referenceType: admissionData.reference_type || '',
          referenceName: admissionData.reference_name || '',
          referenceContact: admissionData.reference_contact || ''
        };

        console.log('Formatted data for form:', formattedData);
        console.log('Tenth marks in formatted data:', formattedData.tenthMarks);
        console.log(
          'Twelfth marks in formatted data:',
          formattedData.twelfthMarks
        );

        setAdmission(formattedData);
      } catch (err: any) {
        console.error('Error fetching admission:', err);
        setError(err.message || 'Failed to fetch admission details');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAdmission();
  }, [admissionId, supabase]);

  // Helper function to validate UUID format
  function isValidUUID(str: string) {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(str);
  }

  // Helper function to safely parse JSON that might be a string or already an object
  function parseJsonSafely(value: any) {
    if (!value) return null;

    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.error('Error parsing JSON:', e);
        return null;
      }
    }

    return value;
  }

  if (isLoading) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[60vh]'>
        <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
        <p className='text-muted-foreground'>Loading admission details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center mb-4'>
          <Button variant='ghost' size='sm' asChild className='mr-2'>
            <Link href='/admissions'>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back to Admissions
            </Link>
          </Button>
        </div>

        <Alert variant='destructive'>
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>

        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  if (!admission) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center mb-4'>
          <Button variant='ghost' size='sm' asChild className='mr-2'>
            <Link href='/admissions'>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back to Admissions
            </Link>
          </Button>
        </div>

        <Alert>
          <AlertTitle>Admission Not Found</AlertTitle>
          <AlertDescription>
            The admission application you are looking for could not be found.
          </AlertDescription>
        </Alert>

        <Button onClick={() => router.push('/admissions')}>
          View All Admissions
        </Button>
      </div>
    );
  }

  return (
    <ContentLayout title='Admissions'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admissions', href: '/admissions' },
            { label: 'Edit Admission' }
          ]}
        />

        <div className='flex items-center justify-between'>
          <div className='flex items-center space-x-2'>
            <Button variant='ghost' size='sm' asChild>
              <Link href='/admissions'>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back to Admissions
              </Link>
            </Button>
          </div>
        </div>

        <div className='flex flex-col space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>Edit Admission</h1>
          <p className='text-muted-foreground'>
            Update the admission application details below.
          </p>
        </div>

        <Card className='p-6'>
          <AdmissionForm initialData={admission} isEditing={true} />
        </Card>
      </div>
    </ContentLayout>
  );
}
