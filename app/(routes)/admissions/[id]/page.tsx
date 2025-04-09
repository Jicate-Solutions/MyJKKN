'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, Loader2, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation';

// Status badge color mapping
const statusColorMap: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  approved: 'bg-green-100 text-green-800 hover:bg-green-100',
  rejected: 'bg-red-100 text-red-800 hover:bg-red-100',
  waitlisted: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  enrolled: 'bg-purple-100 text-purple-800 hover:bg-purple-100'
};

export default function AdmissionDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [admission, setAdmission] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseClient();

  const admissionId = params.id as string;

  const fetchAdmission = useCallback(async () => {
    if (!admissionId) return;

    try {
      setIsLoading(true);

      // Fetch the admission from Supabase first
      const { data: admissionData, error: admissionError } = await supabase
        .from('admissions')
        .select('*')
        .eq('id', admissionId)
        .single();

      if (admissionError) throw admissionError;
      if (!admissionData) throw new Error('Admission not found');

      // If we have organization IDs, fetch their details separately
      if (admissionData.field_of_study) {
        const { data: institutionData } = await supabase
          .from('institutions')
          .select('id, name')
          .eq('id', admissionData.field_of_study)
          .maybeSingle();

        if (institutionData) {
          admissionData.institution = institutionData;
        }
      }

      if (admissionData.degree_id) {
        const { data: degreeData } = await supabase
          .from('degrees')
          .select('id, degree_name')
          .eq('id', admissionData.degree_id)
          .maybeSingle();

        if (degreeData) {
          admissionData.degree = degreeData;
        }
      }

      if (admissionData.department_id) {
        const { data: departmentData } = await supabase
          .from('departments')
          .select('id, department_name')
          .eq('id', admissionData.department_id)
          .maybeSingle();

        if (departmentData) {
          admissionData.department = departmentData;
        }
      }

      if (admissionData.program_id) {
        const { data: programData } = await supabase
          .from('programs')
          .select('id, program_name')
          .eq('id', admissionData.program_id)
          .maybeSingle();

        if (programData) {
          admissionData.program = programData;
        }
      }

      if (admissionData.year_and_branch) {
        const { data: courseData } = await supabase
          .from('courses')
          .select('id, course_name')
          .eq('id', admissionData.year_and_branch)
          .maybeSingle();

        if (courseData) {
          admissionData.course = courseData;
        }
      }

      setAdmission(admissionData);
    } catch (err: any) {
      console.error('Error fetching admission:', err);
      setError(err.message || 'Failed to fetch admission details');
    } finally {
      setIsLoading(false);
    }
  }, [admissionId, supabase]);

  useEffect(() => {
    fetchAdmission();
  }, [fetchAdmission]);

  if (isLoading) {
    return (
      <ContentLayout title='Role Management'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
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
    <ContentLayout title='Admission Details'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Admissions', href: '/admissions' },
            { label: 'Admission Details', href: `/admissions/${admissionId}` }
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
          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={fetchAdmission}
              className='flex items-center'
            >
              <RefreshCcw className='mr-2 h-4 w-4' />
              Refresh
            </Button>
            <Button
              variant='default'
              size='sm'
              onClick={() => router.push(`/admissions/${admissionId}/edit`)}
              className='flex items-center'
            >
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </Button>
          </div>
        </div>

        <div className='flex flex-col space-y-1'>
          <div className='flex items-center space-x-4'>
            <h1 className='text-2xl font-bold tracking-tight'>
              Admission Details
            </h1>
            <Badge
              className={statusColorMap[admission.status] || 'bg-gray-100'}
            >
              {admission.status.charAt(0).toUpperCase() +
                admission.status.slice(1)}
            </Badge>
          </div>
          <p className='text-muted-foreground'>
            Application ID: {admission.id}
          </p>
          <p className='text-sm text-muted-foreground'>
            Submitted on: {format(new Date(admission.created_at), 'PPP')}
          </p>
        </div>

        <Tabs defaultValue='basic-details' className='w-full'>
          <TabsList className='grid grid-cols-5 mb-4'>
            <TabsTrigger value='basic-details'>Basic Details</TabsTrigger>
            <TabsTrigger value='academic'>Academic</TabsTrigger>
            <TabsTrigger value='course'>Course</TabsTrigger>
            <TabsTrigger value='contact'>Contact</TabsTrigger>
            <TabsTrigger value='accommodation'>Accommodation</TabsTrigger>
          </TabsList>

          <Card className='p-6'>
            <TabsContent value='basic-details' className='space-y-6'>
              <div>
                <h3 className='text-lg font-semibold mb-4'>
                  Student Information
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <DetailItem
                    label='Student Name'
                    value={admission.student_name}
                  />
                  <DetailItem
                    label='Date of Birth'
                    value={admission.date_of_birth}
                  />
                  <DetailItem label='Gender' value={admission.gender} />
                  <DetailItem
                    label="Father's Name"
                    value={admission.father_name}
                  />
                  <DetailItem
                    label="Father's Mobile Number"
                    value={admission.father_mobile}
                  />
                  <DetailItem
                    label="Father's Occupation"
                    value={admission.father_occupation}
                  />
                  <DetailItem
                    label="Mother's Name"
                    value={admission.mother_name}
                  />
                  <DetailItem
                    label="Mother's Mobile Number"
                    value={admission.mother_mobile}
                  />
                  <DetailItem
                    label="Mother's Occupation"
                    value={admission.mother_occupation}
                  />
                  <DetailItem
                    label="Mother's Mobile Number"
                    value={admission.mother_mobile}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className='text-lg font-semibold mb-4'>
                  Community Information
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <DetailItem label='Religion' value={admission.religion} />
                  <DetailItem label='Caste' value={admission.caste} />
                  <DetailItem label='Community' value={admission.community} />
                  <DetailItem
                    label='Annual Income'
                    value={`₹ ${admission.annual_income}`}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value='academic' className='space-y-6'>
              <div>
                <h3 className='text-lg font-semibold mb-4'>
                  School Information
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <DetailItem
                    label='School/College Last Studied'
                    value={admission.last_school}
                  />
                  <DetailItem
                    label='Board of Study'
                    value={admission.board_of_study}
                  />
                  <DetailItem
                    label='First Graduate'
                    value={admission.first_graduate ? 'Yes' : 'No'}
                  />
                  <DetailItem
                    label='Counseling Applied'
                    value={admission.counseling_applied ? 'Yes' : 'No'}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className='text-lg font-semibold mb-4'>
                  10th Standard Marks
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <DetailItem
                    label='Maximum Marks'
                    value={admission.tenth_marks?.max_marks}
                  />
                  <DetailItem
                    label='Obtained Marks'
                    value={admission.tenth_marks?.obtained_marks}
                  />
                  <DetailItem
                    label='Percentage'
                    value={
                      admission.tenth_marks?.percentage
                        ? `${admission.tenth_marks.percentage}%`
                        : 'Not provided'
                    }
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className='text-lg font-semibold mb-4'>
                  12th Standard Marks
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-4'>
                  <DetailItem
                    label='Group'
                    value={admission.twelfth_marks?.group}
                  />
                  <DetailItem
                    label='Maximum Marks'
                    value={admission.twelfth_marks?.max_marks}
                  />
                  <DetailItem
                    label='Obtained Marks'
                    value={admission.twelfth_marks?.obtained_marks}
                  />
                  <DetailItem
                    label='Percentage'
                    value={
                      admission.twelfth_marks?.percentage
                        ? `${admission.twelfth_marks.percentage}%`
                        : 'Not provided'
                    }
                  />
                </div>

                <h4 className='text-md font-medium mb-2'>Subject-wise Marks</h4>
                <div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
                  {admission.twelfth_marks?.subjects &&
                    Object.entries(admission.twelfth_marks.subjects).map(
                      ([subject, mark]) => (
                        <DetailItem
                          key={subject}
                          label={
                            subject.charAt(0).toUpperCase() + subject.slice(1)
                          }
                          value={mark as string}
                        />
                      )
                    )}
                </div>
              </div>

              <Separator />

              <div className='space-y-2'>
                <h4 className='text-md font-medium mb-2'>
                  NEET Roll Number (if applicable)
                </h4>
                <DetailItem
                  label='NEET Roll Number'
                  value={admission?.neet_roll_number}
                />
              </div>

              {admission?.counseling_number && (
                <>
                  <Separator />
                  <div className='space-y-2'>
                    <h4 className='text-md font-medium mb-2'>
                      Counseling Application Number
                    </h4>
                    <DetailItem
                      label='Counseling Application Number'
                      value={admission.counseling_number}
                    />
                  </div>
                  <Separator />
                </>
              )}
            </TabsContent>

            <TabsContent value='course' className='space-y-6'>
              <div>
                <h3 className='text-lg font-semibold mb-4'>Course Selection</h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <DetailItem
                    label='Institution'
                    value={
                      admission.institution?.name || admission.field_of_study
                    }
                  />
                  <DetailItem
                    label='Degree'
                    value={admission.degree?.degree_name || 'Not provided'}
                  />
                  <DetailItem
                    label='Department'
                    value={
                      admission.department?.department_name || 'Not provided'
                    }
                  />
                  <DetailItem
                    label='Program'
                    value={admission.program?.program_name || 'Not provided'}
                  />
                  <DetailItem
                    label='Course Type'
                    value={admission.course_type}
                  />
                  <DetailItem label='Entry Type' value={admission.entry_type} />
                  <DetailItem
                    label='Course'
                    value={
                      admission.course?.course_name || admission.year_and_branch
                    }
                  />
                  {admission.medical_cutoff_marks && (
                    <DetailItem
                      label='Medical Cutoff'
                      value={`${admission.medical_cutoff_marks}%`}
                    />
                  )}
                  {admission.engineering_cutoff_marks && (
                    <DetailItem
                      label='Engineering Cutoff'
                      value={`${admission.engineering_cutoff_marks}%`}
                    />
                  )}
                  {admission.quota && (
                    <DetailItem label='Quota' value={admission.quota} />
                  )}
                  {admission.category && (
                    <DetailItem label='Category' value={admission.category} />
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value='contact' className='space-y-6'>
              <div>
                <h3 className='text-lg font-semibold mb-4'>
                  Contact Information
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <DetailItem
                    label='Mobile Number'
                    value={admission.student_mobile}
                  />
                  <DetailItem label='Email' value={admission.student_email} />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className='text-lg font-semibold mb-4'>
                  Permanent Address
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <DetailItem
                    label='Street'
                    value={admission.permanent_address_street}
                  />
                  <DetailItem
                    label='District'
                    value={admission.permanent_address_district}
                  />
                  <DetailItem
                    label='Taluk'
                    value={admission.permanent_address_taluk}
                  />
                  <DetailItem
                    label='Pincode'
                    value={admission.permanent_address_pin_code}
                  />
                  <DetailItem
                    label='State'
                    value={admission.permanent_address_state}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value='accommodation' className='space-y-6'>
              <div>
                <h3 className='text-lg font-semibold mb-4'>
                  Accommodation Preferences
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <DetailItem
                    label='Accommodation Type'
                    value={admission.accommodation_type}
                  />
                  {admission.accommodation_type === 'hostel' && (
                    <DetailItem
                      label='Hostel Type'
                      value={admission.hostel_type}
                    />
                  )}
                </div>
              </div>

              {admission.bus_required && (
                <>
                  <Separator />

                  <div>
                    <h3 className='text-lg font-semibold mb-4'>
                      Transport Information
                    </h3>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <DetailItem label='Bus Required' value='Yes' />
                      <DetailItem
                        label='Bus Route'
                        value={admission.bus_route || 'Not specified'}
                      />
                      <DetailItem
                        label='Pickup Location'
                        value={admission.bus_pickup_location || 'Not specified'}
                      />
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div>
                <h3 className='text-lg font-semibold mb-4'>
                  Reference Information
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <DetailItem
                    label='Reference Type'
                    value={admission.reference_type}
                  />
                  {admission.reference_name && (
                    <DetailItem
                      label='Reference Name'
                      value={admission.reference_name}
                    />
                  )}
                  {admission.reference_contact && (
                    <DetailItem
                      label='Reference Contact'
                      value={admission.reference_contact}
                    />
                  )}
                </div>
              </div>
            </TabsContent>
          </Card>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

// Helper component for displaying detail items
interface DetailItemProps {
  label: string;
  value: string | number | null | undefined;
}

function DetailItem({ label, value }: DetailItemProps) {
  return (
    <div className='space-y-1'>
      <p className='text-sm font-medium text-muted-foreground'>{label}</p>
      <p className='font-medium'>{value || 'Not provided'}</p>
    </div>
  );
}
