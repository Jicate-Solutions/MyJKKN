'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import React from 'react';
import {
  ArrowLeft,
  FileEdit,
  Loader2,
  User,
  UserCheck,
  GraduationCap,
  Phone,
  Mail,
  MapPin,
  School
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useStudent } from '@/hooks/student/use-students';
import Image from 'next/image';

interface StudentDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function StudentDetailPage({ params }: StudentDetailPageProps) {
  // Unwrap params using React.use()
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  const router = useRouter();
  const { data: student, isLoading, error } = useStudent(id);
  const [activeTab, setActiveTab] = useState('overview');

  if (isLoading) {
    return (
      <ContentLayout title='Student Details'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
          <p className='text-muted-foreground'>Loading student details...</p>
        </div>
      </ContentLayout>
    );
  }

  if (error || !student) {
    return (
      <ContentLayout title='Student Details'>
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
    !!student.student_photo_url;

  return (
    <ContentLayout title={`Student: ${student.student_name}`}>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Students', href: '/students' },
            { label: student.student_name }
          ]}
        />

        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Student: {student.student_name}
            </h1>
            <p className='text-muted-foreground'>
              View student details and information
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <Button onClick={() => router.push(`/students/${id}/edit`)}>
              <FileEdit className='mr-2 h-4 w-4' />
              Edit
            </Button>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          {/* Student Profile Card */}
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Student profile information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='flex flex-col items-center'>
                <div className='relative h-32 w-32 mb-4'>
                  {student.student_photo_url ? (
                    <Image
                      src={student.student_photo_url}
                      alt={student.student_name}
                      className='h-full w-full rounded-full object-cover border-4 border-muted'
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://via.placeholder.com/150?text=No+Image';
                      }}
                    />
                  ) : (
                    <div className='h-full w-full rounded-full bg-muted flex items-center justify-center'>
                      <User className='h-16 w-16 text-muted-foreground' />
                    </div>
                  )}
                  <Badge
                    className={`absolute bottom-0 right-0 ${
                      isProfileComplete ? 'bg-green-100 text-green-800' : ''
                    }`}
                    variant={isProfileComplete ? 'default' : 'outline'}
                  >
                    {isProfileComplete ? 'Complete' : 'Incomplete'}
                  </Badge>
                </div>

                <h2 className='text-xl font-bold text-center'>
                  {student.student_name}
                </h2>
                <p className='text-muted-foreground text-center'>
                  {student.roll_number || 'No Roll Number Assigned'}
                </p>

                <Separator className='my-4' />

                <div className='w-full space-y-3'>
                  <div className='flex items-center'>
                    <GraduationCap className='h-4 w-4 mr-2 text-muted-foreground' />
                    <span className='text-sm'>
                      {student.program?.program_name || 'Program not specified'}
                    </span>
                  </div>
                  <div className='flex items-center'>
                    <Phone className='h-4 w-4 mr-2 text-muted-foreground' />
                    <span className='text-sm'>
                      {student.student_mobile || 'No mobile number'}
                    </span>
                  </div>
                  <div className='flex items-center'>
                    <Mail className='h-4 w-4 mr-2 text-muted-foreground' />
                    <span className='text-sm'>
                      {student.college_email ||
                        student.student_email ||
                        'No email'}
                    </span>
                  </div>
                  <div className='flex items-start'>
                    <MapPin className='h-4 w-4 mr-2 mt-1 text-muted-foreground' />
                    <span className='text-sm'>
                      {(student.permanent_address_street && (
                        <>
                          {student.permanent_address_street}
                          {student.permanent_address_district && (
                            <>, {student.permanent_address_district}</>
                          )}
                          {student.permanent_address_state && (
                            <>, {student.permanent_address_state}</>
                          )}
                        </>
                      )) ||
                        'No address specified'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main content */}
          <div className='md:col-span-2 space-y-6'>
            {/* Profile Completion Notice */}
            {!isProfileComplete && (
              <Card className='bg-yellow-50 border-yellow-200'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <UserCheck className='h-5 w-5' />
                    Profile Completion Required
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground mb-2'>
                    Please complete the following information:
                  </p>
                  <ul className='text-sm list-disc list-inside space-y-1'>
                    {!student.roll_number && (
                      <li className='text-red-600'>Roll Number</li>
                    )}
                    {!student.college_email && (
                      <li className='text-red-600'>College Email</li>
                    )}
                    {!student.student_photo_url && (
                      <li className='text-red-600'>Student Photo</li>
                    )}
                  </ul>
                  <Button
                    className='mt-3'
                    size='sm'
                    onClick={() => router.push(`/students/${id}/edit`)}
                  >
                    Complete Profile
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Detail Tabs */}
            <Card>
              <CardHeader className='pb-0'>
                <CardTitle>Student Information</CardTitle>
                <CardDescription>
                  Detailed information about the student
                </CardDescription>
              </CardHeader>
              <CardContent className='pt-6'>
                <Tabs
                  defaultValue='overview'
                  value={activeTab}
                  onValueChange={setActiveTab}
                >
                  <TabsList className='grid w-full grid-cols-4'>
                    <TabsTrigger value='overview'>Overview</TabsTrigger>
                    <TabsTrigger value='academics'>Academics</TabsTrigger>
                    <TabsTrigger value='personal'>Personal</TabsTrigger>
                    <TabsTrigger value='admission'>Admission</TabsTrigger>
                  </TabsList>

                  <TabsContent value='overview' className='space-y-4 mt-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <div className='space-y-2'>
                        <h3 className='text-sm font-medium'>Student Details</h3>
                        <div className='grid grid-cols-2 gap-2 text-sm'>
                          <div className='text-muted-foreground'>Name</div>
                          <div>{student.student_name}</div>
                          <div className='text-muted-foreground'>
                            Roll Number
                          </div>
                          <div>{student.roll_number || 'Not assigned'}</div>
                          <div className='text-muted-foreground'>
                            College Email
                          </div>
                          <div>{student.college_email || 'Not assigned'}</div>
                          <div className='text-muted-foreground'>Program</div>
                          <div>{student.program?.program_name || 'N/A'}</div>
                          <div className='text-muted-foreground'>
                            Institution
                          </div>
                          <div>{student.institution?.name || 'N/A'}</div>
                        </div>
                      </div>

                      <div className='space-y-2'>
                        <h3 className='text-sm font-medium'>
                          Contact Information
                        </h3>
                        <div className='grid grid-cols-2 gap-2 text-sm'>
                          <div className='text-muted-foreground'>Mobile</div>
                          <div>{student.student_mobile || 'N/A'}</div>
                          <div className='text-muted-foreground'>Email</div>
                          <div>{student.student_email || 'N/A'}</div>
                          <div className='text-muted-foreground'>
                            Parent Mobile
                          </div>
                          <div>
                            {student.father_mobile ||
                              student.mother_mobile ||
                              'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className='space-y-2'>
                      <h3 className='text-sm font-medium'>
                        College Information
                      </h3>
                      <div className='grid grid-cols-2 md:grid-cols-4 gap-2 text-sm'>
                        <div className='text-muted-foreground'>Department</div>
                        <div>
                          {student.department?.department_name || 'N/A'}
                        </div>
                        <div className='text-muted-foreground'>Entry Type</div>
                        <div>{student.entry_type || 'N/A'}</div>
                        <div className='text-muted-foreground'>
                          Accommodation
                        </div>
                        <div>{student.accommodation_type || 'N/A'}</div>
                        <div className='text-muted-foreground'>Hostel Type</div>
                        <div>{student.hostel_type || 'N/A'}</div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value='academics' className='space-y-4 mt-4'>
                    <div className='space-y-4'>
                      <div className='space-y-2'>
                        <h3 className='text-sm font-medium'>
                          Academic Background
                        </h3>
                        <div className='grid grid-cols-2 gap-2 text-sm'>
                          <div className='text-muted-foreground'>
                            Last School
                          </div>
                          <div>{student.last_school || 'N/A'}</div>
                          <div className='text-muted-foreground'>
                            Board of Study
                          </div>
                          <div>{student.board_of_study || 'N/A'}</div>
                        </div>
                      </div>

                      <Separator />

                      <div className='space-y-2'>
                        <h3 className='text-sm font-medium'>
                          10th Grade Marks
                        </h3>
                        {student.tenth_marks ? (
                          <div className='grid grid-cols-2 md:grid-cols-3 gap-2 text-sm'>
                            <div className='text-muted-foreground'>
                              Maximum Marks
                            </div>
                            <div>{student.tenth_marks.max_marks || 'N/A'}</div>
                            <div></div>
                            <div className='text-muted-foreground'>
                              Obtained Marks
                            </div>
                            <div>
                              {student.tenth_marks.obtained_marks || 'N/A'}
                            </div>
                            <div></div>
                            <div className='text-muted-foreground'>
                              Percentage
                            </div>
                            <div>{student.tenth_marks.percentage || 'N/A'}</div>
                          </div>
                        ) : (
                          <p className='text-sm text-muted-foreground'>
                            No 10th grade mark information available
                          </p>
                        )}
                      </div>

                      <Separator />

                      <div className='space-y-2'>
                        <h3 className='text-sm font-medium'>
                          12th Grade Marks
                        </h3>
                        {student.twelfth_marks ? (
                          <div className='grid grid-cols-2 md:grid-cols-3 gap-2 text-sm'>
                            <div className='text-muted-foreground'>Group</div>
                            <div>{student.twelfth_marks.group || 'N/A'}</div>
                            <div></div>
                            <div className='text-muted-foreground'>
                              Maximum Marks
                            </div>
                            <div>
                              {student.twelfth_marks.max_marks || 'N/A'}
                            </div>
                            <div></div>
                            <div className='text-muted-foreground'>
                              Obtained Marks
                            </div>
                            <div>
                              {student.twelfth_marks.obtained_marks || 'N/A'}
                            </div>
                            <div></div>
                            <div className='text-muted-foreground'>
                              Percentage
                            </div>
                            <div>
                              {student.twelfth_marks.percentage || 'N/A'}
                            </div>
                          </div>
                        ) : (
                          <p className='text-sm text-muted-foreground'>
                            No 12th grade mark information available
                          </p>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value='personal' className='space-y-4 mt-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <div className='space-y-2'>
                        <h3 className='text-sm font-medium'>
                          Personal Information
                        </h3>
                        <div className='grid grid-cols-2 gap-2 text-sm'>
                          <div className='text-muted-foreground'>
                            Date of Birth
                          </div>
                          <div>
                            {student.date_of_birth
                              ? format(new Date(student.date_of_birth), 'PPP')
                              : 'N/A'}
                          </div>
                          <div className='text-muted-foreground'>Gender</div>
                          <div>{student.gender || 'N/A'}</div>
                          <div className='text-muted-foreground'>Religion</div>
                          <div>{student.religion || 'N/A'}</div>
                          <div className='text-muted-foreground'>Community</div>
                          <div>{student.community || 'N/A'}</div>
                          <div className='text-muted-foreground'>
                            First Graduate
                          </div>
                          <div>{student.first_graduate ? 'Yes' : 'No'}</div>
                        </div>
                      </div>

                      <div className='space-y-2'>
                        <h3 className='text-sm font-medium'>
                          Family Information
                        </h3>
                        <div className='grid grid-cols-2 gap-2 text-sm'>
                          <div className='text-muted-foreground'>
                            Father&apos;s Name
                          </div>
                          <div>{student.father_name || 'N/A'}</div>
                          <div className='text-muted-foreground'>
                            Father&apos;s Occupation
                          </div>
                          <div>{student.father_occupation || 'N/A'}</div>
                          <div className='text-muted-foreground'>
                            Father&apos;s Mobile
                          </div>
                          <div>{student.father_mobile || 'N/A'}</div>
                          <div className='text-muted-foreground'>
                            Mother&apos;s Name
                          </div>
                          <div>{student.mother_name || 'N/A'}</div>
                          <div className='text-muted-foreground'>
                            Mother&apos;s Occupation
                          </div>
                          <div>{student.mother_occupation || 'N/A'}</div>
                          <div className='text-muted-foreground'>
                            Mother&apos;s Mobile
                          </div>
                          <div>{student.mother_mobile || 'N/A'}</div>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className='space-y-2'>
                      <h3 className='text-sm font-medium'>Permanent Address</h3>
                      <div className='text-sm'>
                        {(student.permanent_address_street && (
                          <p>
                            {student.permanent_address_street}
                            {student.permanent_address_taluk && (
                              <>, {student.permanent_address_taluk}</>
                            )}
                            <br />
                            {student.permanent_address_district && (
                              <>{student.permanent_address_district}, </>
                            )}
                            {student.permanent_address_state && (
                              <>{student.permanent_address_state} </>
                            )}
                            {student.permanent_address_pin_code && (
                              <>- {student.permanent_address_pin_code}</>
                            )}
                          </p>
                        )) || (
                          <p className='text-muted-foreground'>
                            No address information available
                          </p>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value='admission' className='space-y-4 mt-4'>
                    <div className='space-y-2'>
                      <h3 className='text-sm font-medium'>
                        Admission Information
                      </h3>
                      <div className='grid grid-cols-2 md:grid-cols-4 gap-2 text-sm'>
                        <div className='text-muted-foreground'>
                          Admission ID
                        </div>
                        <div>{student.admission_id || 'N/A'}</div>
                        <div className='text-muted-foreground'>Quota</div>
                        <div>{student.quota || 'N/A'}</div>
                        <div className='text-muted-foreground'>Category</div>
                        <div>{student.category || 'N/A'}</div>
                        <div className='text-muted-foreground'>
                          Counseling Applied
                        </div>
                        <div>{student.counseling_applied ? 'Yes' : 'No'}</div>
                        <div className='text-muted-foreground'>
                          Counseling Number
                        </div>
                        <div>{student.counseling_number || 'N/A'}</div>
                        <div className='text-muted-foreground'>
                          NEET Roll Number
                        </div>
                        <div>{student.neet_roll_number || 'N/A'}</div>
                        <div className='text-muted-foreground'>
                          Medical Cutoff
                        </div>
                        <div>{student.medical_cutoff_marks || 'N/A'}</div>
                        <div className='text-muted-foreground'>
                          Engineering Cutoff
                        </div>
                        <div>{student.engineering_cutoff_marks || 'N/A'}</div>
                      </div>
                    </div>

                    <Separator />

                    <div className='space-y-2'>
                      <h3 className='text-sm font-medium'>Transportation</h3>
                      <div className='grid grid-cols-2 md:grid-cols-4 gap-2 text-sm'>
                        <div className='text-muted-foreground'>
                          Bus Required
                        </div>
                        <div>{student.bus_required ? 'Yes' : 'No'}</div>
                        <div className='text-muted-foreground'>Bus Route</div>
                        <div>{student.bus_route || 'N/A'}</div>
                        <div className='text-muted-foreground'>
                          Pickup Location
                        </div>
                        <div>{student.bus_pickup_location || 'N/A'}</div>
                      </div>
                    </div>

                    <Separator />

                    <div className='space-y-2'>
                      <h3 className='text-sm font-medium'>
                        Reference Information
                      </h3>
                      <div className='grid grid-cols-2 md:grid-cols-4 gap-2 text-sm'>
                        <div className='text-muted-foreground'>
                          Reference Type
                        </div>
                        <div>{student.reference_type || 'N/A'}</div>
                        <div className='text-muted-foreground'>
                          Reference Name
                        </div>
                        <div>{student.reference_name || 'N/A'}</div>
                        <div className='text-muted-foreground'>
                          Reference Contact
                        </div>
                        <div>{student.reference_contact || 'N/A'}</div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
