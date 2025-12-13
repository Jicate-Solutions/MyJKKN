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
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';
import { indianStates, getDistrictsByState, getTaluksByDistrict } from '@/lib/data/locations';

export default function EditAdmissionPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [admission, setAdmission] = useState<Admission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Get permissions with waitForLoad option to ensure they're fully loaded
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Define access permissions
  const canEditAdmissions = isSuperAdmin || canAccess('admissions', 'edit');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Edit Admission permissions debug:', {
        isSuperAdmin,
        canEditAdmissions: canAccess('admissions', 'edit')
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  const admissionId = params.id as string;

  // Helper functions to map database values to form IDs
  const mapStateNameToId = (stateName: string): string => {
    if (!stateName) return '';
    const state = indianStates.find(s =>
      s.name.toUpperCase() === stateName.toUpperCase()
    );
    return state?.id || '';
  };

  const mapDistrictNameToId = (stateId: string, districtName: string): string => {
    if (!stateId || !districtName) return '';
    const districts = getDistrictsByState(stateId);
    const district = districts.find(d =>
      d.name.toUpperCase() === districtName.toUpperCase()
    );
    return district?.id || '';
  };

  const mapTalukNameToId = (stateId: string, districtId: string, talukName: string): string => {
    if (!stateId || !districtId || !talukName) return '';
    const taluks = getTaluksByDistrict(stateId, districtId);
    const taluk = taluks.find(t =>
      t.name.toUpperCase() === talukName.toUpperCase()
    );
    return taluk?.id || '';
  };

  useEffect(() => {
    // Only fetch data if the user has permission to edit admissions
    if (!permissionsLoaded) return;

    if (!canEditAdmissions) {
      console.log('User does not have permission to edit admissions');
      router.push('/unauthorized');
      return;
    }

    async function fetchAdmission() {
      if (!admissionId) return;

      try {
        setIsLoading(true);

        // Fetch the admission with related data in a single query
        const { data: admissionData, error: admissionError } = await supabase
          .from('admissions')
          .select(
            `
            *,
            institution:institutions(id, name),
            degree:degrees(id, degree_name),
            department:departments(id, department_name),
            program:programs(id, program_name)
          `
          )
          .eq('id', admissionId)
          .single();

        if (admissionError) throw admissionError;
        if (!admissionData) throw new Error('Admission not found');

        // Type assertion for admissionData
        const admission = admissionData as Record<string, any>;

        // Fetch course separately if needed
        if (admission.year_and_branch) {
          try {
            const { data: courseData } = await supabase
              .from('courses')
              .select('id, course_name')
              .eq('id', admission.year_and_branch)
              .maybeSingle();

            if (courseData) {
              admission.course = courseData;
            }
          } catch (courseError) {
            console.log('Course fetch error:', courseError);
            // Continue even if course fetch fails
          }
        }

        console.log('Raw admission data:', admission);

        // Create a data object that will be enhanced with related information
        let formattedData: any = { ...admission };

        // Parse JSON fields if they're stored as strings
        let tenthMarks = admission.tenth_marks;
        let twelfthMarks = admission.twelfth_marks;

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

        // Map location database names to form IDs
        const stateId = mapStateNameToId(admission.permanent_address_state);
        const districtId = mapDistrictNameToId(stateId, admission.permanent_address_district);
        const talukId = mapTalukNameToId(stateId, districtId, admission.permanent_address_taluk);

        console.log('Location mapping debug:', {
          dbState: admission.permanent_address_state,
          dbDistrict: admission.permanent_address_district,
          dbTaluk: admission.permanent_address_taluk,
          mappedStateId: stateId,
          mappedDistrictId: districtId,
          mappedTalukId: talukId
        });

        // Map database fields to form fields with special handling for missing fields
        formattedData = {
          ...formattedData,
          // Basic Details section
          id: admission.id,
          status: admission.status || 'pending',
          firstName: admission.first_name || '',
          lastName: admission.last_name || '',
          fatherName: admission.father_name || '',
          fatherOccupation: admission.father_occupation || '',
          fatherMobile: admission.father_mobile || '',
          motherName: admission.mother_name || '',
          motherOccupation: admission.mother_occupation || '',
          motherMobile: admission.mother_mobile || '',
          dateOfBirth: admission.date_of_birth || '',
          gender: admission.gender || '',
          religion: admission.religion || '',
          community: admission.community || '',
          caste: admission.caste || '',
          annualIncome: admission.annual_income || '',
          aadharNumber: admission.aadhar_number || '',

          // Academic Information section with properly formatted marks
          lastSchool: admission.last_school || '',
          boardOfStudy: admission.board_of_study || '',
          // Pass the raw marks data to let the form component handle processing
          tenth_marks: admission.tenth_marks,
          twelfth_marks: admission.twelfth_marks,
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
          counselingApplied: Boolean(admission.counseling_applied),
          counselingNumber: admission.counseling_number || '',
          firstGraduate: Boolean(admission.first_graduate),
          medicalCutoffMarks: admission.medical_cutoff_marks || '',
          engineeringCutoffMarks: admission.engineering_cutoff_marks || '',
          neetRollNumber: admission.neet_roll_number || '',
          neetScore: admission.neet_score || '',

          // Course Selection section
          fieldOfStudy: admission.field_of_study || '',
          degreeId: admission.degree_id || '',
          departmentId: admission.department_id || '',
          programId: admission.program_id || '',
          courseType: admission.course_type || '',
          entryType: admission.entry_type || '',
          yearAndBranch: admission.year_and_branch || '',
          quota: admission.quota || '',
          category: admission.category || '',

          // Contact Details section (using mapped location IDs)
          permanentAddressStreet: admission.permanent_address_street || '',
          permanentAddressTaluk: talukId,
          permanentAddressDistrict: districtId,
          permanentAddressPinCode:
            admission.permanent_address_pin_code || '',
          permanentAddressState: stateId,
          studentMobile: admission.student_mobile || '',
          studentEmail: admission.student_email || '',

          // Accommodation Preferences section
          accommodationType: admission.accommodation_type || '',
          hostelType: admission.hostel_type || '',
          foodType: admission.food_type || '',
          busRequired: Boolean(admission.bus_required),
          busRoute: admission.bus_route || '',
          busPickupLocation: admission.bus_pickup_location || '',
          referenceType: admission.reference_type || '',
          referenceName: admission.reference_name || '',
          referenceContact: admission.reference_contact || '',

          // Institution and Program information
          institution: admission.institution || {},
          degree: admission.degree || {},
          department: admission.department || {},
          program: admission.program || {},
          course: admission.course || {}
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
  }, [admissionId, supabase, permissionsLoaded, canEditAdmissions, router]);

  // Show loading state while permissions are loading
  if (permissionsLoading || !permissionsLoaded) {
    return (
      <ContentLayout title='Edit Admission'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Permission check (this is redundant due to the redirect above, but added for safety)
  if (!canEditAdmissions) {
    return (
      <ContentLayout title='Edit Admission'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit admission applications
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/admissions'>Back to Admissions</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title='Edit Admission'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
          <span className='ml-2'>Loading admission details...</span>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Edit Admission'>
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
      </ContentLayout>
    );
  }

  if (!admission) {
    return (
      <ContentLayout title='Edit Admission'>
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
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Admission'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Admissions', href: '/admissions' },
            {
              label: 'Admission Details',
              href: `/admissions/${admissionId}`
            },
            { label: 'Edit Admission' }
          ]}
        />

        <div className='flex items-center justify-between'>
          <div className='flex items-center space-x-2'>
            <Button variant='ghost' size='sm' asChild>
              <Link href={`/admissions/${admissionId}`}>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back to Admission Details
              </Link>
            </Button>
          </div>
        </div>

        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Edit Admission</h1>
          <p className='text-muted-foreground'>
            Application ID:{' '}
            {admission.application_id || `ID: ${admissionId.slice(0, 8)}`}
          </p>
          <p className='text-sm text-muted-foreground'>
            Update admission application details
          </p>
        </div>

        <Card>
          <div className='p-6'>
            <AdmissionForm initialData={admission} isEditing={true} />
          </div>
        </Card>
      </div>
    </ContentLayout>
  );
}

function isValidUUID(str: string) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function parseJsonSafely(value: any) {
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
