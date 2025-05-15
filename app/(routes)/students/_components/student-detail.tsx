'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';
import {
  User,
  UserCheck,
  GraduationCap,
  Phone,
  Mail,
  MapPin,
  School,
  FileEdit,
  Home,
  Briefcase,
  BookText,
  Trash
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
import { Student } from '@/types/student';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface StudentDetailProps {
  student: Student;
}

export function StudentDetail({ student }: StudentDetailProps) {
  const [activeSection, setActiveSection] = useState('profile');
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();
  const router = useRouter();

  const isProfileComplete =
    !!student.roll_number &&
    !!student.college_email &&
    !!student.student_photo_url;

  // Only access permissions after they've loaded
  const hasEditPermission =
    !permissionsLoading && (isSuperAdmin || canAccess('students', 'edit'));
  const hasDeletePermission =
    !permissionsLoading && (isSuperAdmin || canAccess('students', 'delete'));

  const sections = [
    {
      id: 'personal',
      label: 'Personal Details',
      icon: UserCheck
    },
    {
      id: 'academic',
      label: 'Academic Information',
      icon: GraduationCap
    },
    {
      id: 'qualifications',
      label: 'Qualifications',
      icon: School
    },
    {
      id: 'contact',
      label: 'Contact & Address',
      icon: Phone
    },
    {
      id: 'accommodation',
      label: 'Accommodation',
      icon: Home
    },
    {
      id: 'admission',
      label: 'Admission Details',
      icon: BookText
    }
  ];

  return (
    <>
      {/* Sidebar Navigation */}
      <div className='w-full lg:w-64 shrink-0'>
        <Card className='h-full'>
          <CardContent className='p-0'>
            <nav className='flex flex-col'>
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 text-sm border-l-2 border-transparent hover:bg-muted/50 transition-colors text-left',
                      activeSection === section.id &&
                        'border-l-2 border-primary bg-muted text-primary'
                    )}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <Icon className='h-4 w-4' />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className='flex-1'>
        <Card className='h-full'>
          {activeSection === 'profile' && (
            <>
              <CardHeader>
                <CardTitle>Edit profile</CardTitle>
                <CardDescription>
                  Update your personal information
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                {/* Avatar Section */}
                <div>
                  <h3 className='text-sm font-medium mb-3'>Avatar</h3>
                  <div className='flex items-start space-x-4'>
                    <div className='relative h-20 w-20'>
                      {student.student_photo_url ? (
                        <div className='relative h-full w-full'>
                          <Image
                            src={student.student_photo_url}
                            alt={student.student_name}
                            className='rounded-full object-cover'
                            fill
                            unoptimized={true}
                            referrerPolicy='no-referrer'
                          />
                        </div>
                      ) : (
                        <div className='h-full w-full rounded-full bg-muted flex items-center justify-center'>
                          <User className='h-8 w-8 text-muted-foreground' />
                        </div>
                      )}
                    </div>
                    <div className='space-y-2'>
                      <p className='text-xs text-muted-foreground max-w-xs'>
                        At least 400x400 is recommended. PNG or JPG format only.
                      </p>
                    </div>
                  </div>
                </div>
                <Separator />

                {/* Name Section */}
                <div>
                  <h3 className='text-sm font-medium mb-3'>Name</h3>
                  <div className='relative'>
                    <Input
                      value={student.student_name}
                      readOnly
                      className='pr-10'
                    />
                  </div>
                </div>

                {/* Location Section */}
                <div>
                  <h3 className='text-sm font-medium mb-3'>Location</h3>
                  <div className='flex items-center space-x-2'>
                    <MapPin className='h-4 w-4 text-muted-foreground' />
                    <span className='text-sm'>
                      {student.permanent_address_district &&
                      student.permanent_address_state
                        ? `${student.permanent_address_district}, ${student.permanent_address_state}`
                        : 'Location not specified'}
                    </span>
                  </div>
                </div>

                {/* Bio Section */}
                <div>
                  <h3 className='text-sm font-medium mb-3'>Bio</h3>
                  <p className='text-sm'>
                    {student.institution?.name ? (
                      <>
                        Student at{' '}
                        <span className='font-medium'>
                          {student.institution.name}
                        </span>
                        {student.program?.program_name && (
                          <>, studying {student.program.program_name}</>
                        )}
                      </>
                    ) : (
                      'No institution information available'
                    )}
                  </p>
                </div>
              </CardContent>
            </>
          )}

          {activeSection === 'academic' && (
            <>
              <CardHeader>
                <CardTitle>Academic Information</CardTitle>
                <CardDescription>Academic and program details</CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Roll Number
                    </h3>
                    <p className='text-sm'>
                      {student.roll_number || 'Not assigned'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      College Email
                    </h3>
                    <p className='text-sm'>
                      {student.college_email || 'Not assigned'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Institution
                    </h3>
                    <p className='text-sm'>
                      {student.institution?.name || 'Not specified'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Degree
                    </h3>
                    <p className='text-sm'>
                      {student.degree?.degree_name || 'Not specified'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Department
                    </h3>
                    <p className='text-sm'>
                      {student.department?.department_name || 'Not specified'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Program
                    </h3>
                    <p className='text-sm'>
                      {student.program?.program_name || 'Not specified'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Entry Type
                    </h3>
                    <p className='text-sm'>
                      {student.entry_type || 'Not specified'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Semester
                    </h3>
                    <p className='text-sm'>
                      {student.semester?.semester_name || 'Not specified'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Section
                    </h3>
                    <p className='text-sm'>
                      {student.section?.section_name || 'Not specified'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {activeSection === 'qualifications' && (
            <>
              <CardHeader>
                <CardTitle>Qualifications</CardTitle>
                <CardDescription>
                  Previous academic qualifications
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>Academic Background</h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Last School
                        </h4>
                        <p className='text-sm'>
                          {student.last_school || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Board of Study
                        </h4>
                        <p className='text-sm'>
                          {student.board_of_study || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>10th Grade Marks</h3>
                    {student.tenth_marks ? (
                      <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium text-muted-foreground'>
                            Maximum Marks
                          </h4>
                          <p className='text-sm'>
                            {student.tenth_marks.max_marks || 'Not specified'}
                          </p>
                        </div>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium text-muted-foreground'>
                            Obtained Marks
                          </h4>
                          <p className='text-sm'>
                            {student.tenth_marks.obtained_marks ||
                              'Not specified'}
                          </p>
                        </div>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium text-muted-foreground'>
                            Percentage
                          </h4>
                          <p className='text-sm'>
                            {student.tenth_marks.percentage || 'Not specified'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className='text-sm text-muted-foreground'>
                        No 10th grade mark information available
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>12th Grade Marks</h3>
                    {student.twelfth_marks ? (
                      <div className='space-y-4'>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium text-muted-foreground'>
                            Group/Stream
                          </h4>
                          <p className='text-sm'>
                            {student.twelfth_marks.group || 'Not specified'}
                          </p>
                        </div>
                        <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                          <div className='space-y-1'>
                            <h4 className='text-sm font-medium text-muted-foreground'>
                              Maximum Marks
                            </h4>
                            <p className='text-sm'>
                              {student.twelfth_marks.max_marks ||
                                'Not specified'}
                            </p>
                          </div>
                          <div className='space-y-1'>
                            <h4 className='text-sm font-medium text-muted-foreground'>
                              Obtained Marks
                            </h4>
                            <p className='text-sm'>
                              {student.twelfth_marks.obtained_marks ||
                                'Not specified'}
                            </p>
                          </div>
                          <div className='space-y-1'>
                            <h4 className='text-sm font-medium text-muted-foreground'>
                              Percentage
                            </h4>
                            <p className='text-sm'>
                              {student.twelfth_marks.percentage ||
                                'Not specified'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className='text-sm text-muted-foreground'>
                        No 12th grade mark information available
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {activeSection === 'personal' && (
            <>
              <CardHeader>
                <CardTitle>Personal Details</CardTitle>
                <CardDescription>
                  Personal and family information
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='flex items-center space-x-6 mb-4'>
                  <div className='relative h-24 w-24'>
                    {student.student_photo_url ? (
                      <div className='relative h-full w-full'>
                        <Image
                          src={student.student_photo_url}
                          alt={student.student_name}
                          className='rounded-lg object-cover'
                          fill
                          unoptimized={true}
                          referrerPolicy='no-referrer'
                        />
                      </div>
                    ) : (
                      <div className='h-full w-full rounded-full bg-muted flex items-center justify-center'>
                        <User className='h-10 w-10 text-muted-foreground' />
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className='text-lg font-semibold'>
                      {student.student_name}
                    </h2>
                    <p className='text-sm text-muted-foreground'>
                      {student.roll_number
                        ? `Roll No: ${student.roll_number}`
                        : 'No Roll Number Assigned'}
                    </p>
                    <div className='mt-1'>
                      <Badge
                        variant={
                          student.status === 'active' ? 'default' : 'secondary'
                        }
                      >
                        {student.status || 'Not specified'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>
                      Personal Information
                    </h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Date of Birth
                        </h4>
                        <p className='text-sm'>
                          {student.date_of_birth
                            ? format(new Date(student.date_of_birth), 'PPP')
                            : 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Gender
                        </h4>
                        <p className='text-sm'>
                          {student.gender || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Religion
                        </h4>
                        <p className='text-sm'>
                          {student.religion || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Community
                        </h4>
                        <p className='text-sm'>
                          {student.community || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Caste
                        </h4>
                        <p className='text-sm'>
                          {student.caste || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Annual Income
                        </h4>
                        <p className='text-sm'>
                          {student.annual_income || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>
                      Father&apos;s Information
                    </h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Name
                        </h4>
                        <p className='text-sm'>
                          {student.father_name || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Occupation
                        </h4>
                        <p className='text-sm'>
                          {student.father_occupation || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Mobile
                        </h4>
                        <p className='text-sm'>
                          {student.father_mobile || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>
                      Mother&apos;s Information
                    </h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Name
                        </h4>
                        <p className='text-sm'>
                          {student.mother_name || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Occupation
                        </h4>
                        <p className='text-sm'>
                          {student.mother_occupation || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Mobile
                        </h4>
                        <p className='text-sm'>
                          {student.mother_mobile || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {activeSection === 'contact' && (
            <>
              <CardHeader>
                <CardTitle>Contact & Address</CardTitle>
                <CardDescription>
                  Contact details and address information
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>Contact Information</h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          College Email
                        </h4>
                        <p className='text-sm'>
                          {student.college_email || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Personal Email
                        </h4>
                        <p className='text-sm'>
                          {student.student_email || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Mobile
                        </h4>
                        <p className='text-sm'>
                          {student.student_mobile || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>Permanent Address</h3>

                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Street
                        </h4>
                        <p className='text-sm'>
                          {student.permanent_address_street || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Taluk
                        </h4>
                        <p className='text-sm'>
                          {student.permanent_address_taluk || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          District
                        </h4>
                        <p className='text-sm'>
                          {student.permanent_address_district ||
                            'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          PIN Code
                        </h4>
                        <p className='text-sm'>
                          {student.permanent_address_pin_code ||
                            'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          State
                        </h4>
                        <p className='text-sm'>
                          {student.permanent_address_state || 'Not specified'}
                        </p>
                      </div>
                    </div>

                    <div className='mt-4 p-3 bg-muted rounded-md'>
                      <p className='text-sm'>
                        {(student.permanent_address_street && (
                          <>
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
                          </>
                        )) || (
                          <span className='text-muted-foreground'>
                            No address information available
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {activeSection === 'accommodation' && (
            <>
              <CardHeader>
                <CardTitle>Accommodation</CardTitle>
                <CardDescription>
                  Accommodation and transportation details
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>
                      Accommodation Details
                    </h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Accommodation Type
                        </h4>
                        <p className='text-sm'>
                          {student.accommodation_type || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Hostel Type
                        </h4>
                        <p className='text-sm'>
                          {student.hostel_type || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>
                      Transportation Details
                    </h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Bus Required
                        </h4>
                        <p className='text-sm'>
                          {student.bus_required ? 'Yes' : 'No'}
                        </p>
                      </div>
                      {student.bus_required && (
                        <>
                          <div className='space-y-1'>
                            <h4 className='text-sm font-medium text-muted-foreground'>
                              Bus Route
                            </h4>
                            <p className='text-sm'>
                              {student.bus_route || 'Not specified'}
                            </p>
                          </div>
                          <div className='space-y-1'>
                            <h4 className='text-sm font-medium text-muted-foreground'>
                              Pickup Location
                            </h4>
                            <p className='text-sm'>
                              {student.bus_pickup_location || 'Not specified'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {activeSection === 'admission' && (
            <>
              <CardHeader>
                <CardTitle>Admission Details</CardTitle>
                <CardDescription>
                  Admission and reference information
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>
                      Admission Information
                    </h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Admission ID
                        </h4>
                        <p className='text-sm'>
                          {student.admission_id || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Quota
                        </h4>
                        <p className='text-sm'>
                          {student.quota || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Category
                        </h4>
                        <p className='text-sm'>
                          {student.category || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Counseling Applied
                        </h4>
                        <p className='text-sm'>
                          {student.counseling_applied ? 'Yes' : 'No'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Counseling Number
                        </h4>
                        <p className='text-sm'>
                          {student.counseling_number || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className='space-y-2'>
                    <h3 className='text-sm font-medium'>
                      Reference Information
                    </h3>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Reference Type
                        </h4>
                        <p className='text-sm'>
                          {student.reference_type || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Reference Name
                        </h4>
                        <p className='text-sm'>
                          {student.reference_name || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Reference Contact
                        </h4>
                        <p className='text-sm'>
                          {student.reference_contact || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
