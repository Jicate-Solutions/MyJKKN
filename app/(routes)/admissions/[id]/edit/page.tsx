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

        // Create a data object that will be enhanced with related information
        let formattedData: any = { ...admissionData };

        // Fetch related data separately if needed
        if (admissionData.field_of_study) {
          const { data: institutionData } = await supabase
            .from('institutions')
            .select('id, name')
            .eq('id', admissionData.field_of_study)
            .maybeSingle();

          if (institutionData) {
            formattedData.institution = institutionData;
          }
        }

        if (admissionData.degree_id) {
          const { data: degreeData } = await supabase
            .from('degrees')
            .select('id, degree_name')
            .eq('id', admissionData.degree_id)
            .maybeSingle();

          if (degreeData) {
            formattedData.degree = degreeData;
          }
        }

        if (admissionData.department_id) {
          const { data: departmentData } = await supabase
            .from('departments')
            .select('id, department_name')
            .eq('id', admissionData.department_id)
            .maybeSingle();

          if (departmentData) {
            formattedData.department = departmentData;
          }
        }

        if (admissionData.program_id) {
          const { data: programData } = await supabase
            .from('programs')
            .select('id, program_name')
            .eq('id', admissionData.program_id)
            .maybeSingle();

          if (programData) {
            formattedData.program = programData;
          }
        }

        if (admissionData.year_and_branch) {
          const { data: courseData } = await supabase
            .from('courses')
            .select('id, course_name')
            .eq('id', admissionData.year_and_branch)
            .maybeSingle();

          if (courseData) {
            formattedData.course = courseData;
          }
        }

        // Map database fields to form fields
        formattedData = {
          ...formattedData,
          studentName: admissionData.student_name,
          fatherName: admissionData.father_name,
          fatherOccupation: admissionData.father_occupation,
          fatherMobile: admissionData.father_mobile,
          motherName: admissionData.mother_name,
          motherOccupation: admissionData.mother_occupation,
          motherMobile: admissionData.mother_mobile,
          dateOfBirth: admissionData.date_of_birth,
          lastSchool: admissionData.last_school,
          boardOfStudy: admissionData.board_of_study,
          counselingApplied: admissionData.counseling_applied,
          counselingNumber: admissionData.counseling_number,
          firstGraduate: admissionData.first_graduate,
          fieldOfStudy: admissionData.field_of_study,
          degreeId: admissionData.degree_id,
          departmentId: admissionData.department_id,
          programId: admissionData.program_id,
          courseType: admissionData.course_type,
          entryType: admissionData.entry_type,
          yearAndBranch: admissionData.year_and_branch,
          permanentAddress: {
            street: admissionData.permanent_address_street,
            district: admissionData.permanent_address_district,
            taluk: admissionData.permanent_address_taluk,
            pincode: admissionData.permanent_address_pin_code,
            state: admissionData.permanent_address_state
          },
          mobileNumber: admissionData.student_mobile,
          email: admissionData.student_email,
          accommodationType: admissionData.accommodation_type,
          hostelType: admissionData.hostel_type,
          busRequired: admissionData.bus_required,
          busRoute: admissionData.bus_route,
          pickupLocation: admissionData.bus_pickup_location,
          referenceType: admissionData.reference_type,
          referenceName: admissionData.reference_name,
          referenceContact: admissionData.reference_contact,
          quota: admissionData.quota,
          category: admissionData.category,
          tenthMarks: admissionData.tenth_marks,
          twelfthMarks: admissionData.twelfth_marks,
          medicalCutoffMarks: admissionData.medical_cutoff_marks,
          engineeringCutoffMarks: admissionData.engineering_cutoff_marks,
          neetRollNumber: admissionData.neet_roll_number
        };

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
