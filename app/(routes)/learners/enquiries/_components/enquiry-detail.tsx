'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  UserCheck,
  GraduationCap,
  Phone,
  MapPin,
  School,
  Home,
  BookText,
  FileEdit
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LearnerProfile } from '@/types/learner-profile';
import { cn } from '@/lib/utils';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import { UserIcon } from 'lucide-react';

interface EnquiryDetailProps {
  enquiry: LearnerProfile;
}

export function EnquiryDetail({ enquiry }: EnquiryDetailProps) {
  const [activeSection, setActiveSection] = useState('personal');

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
      id: 'enquiry',
      label: 'Enquiry Details',
      icon: BookText
    }
  ];

  // Helper function to format date
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Not specified';
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch {
      return 'Invalid date';
    }
  };

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
          {/* Personal Details Section */}
          {activeSection === 'personal' && (
            <>
              <CardHeader>
                <CardTitle>Personal Details</CardTitle>
                <CardDescription>Personal and family information</CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                {/* Profile Header with Image and Name */}
                <div className='flex items-start gap-6 pb-6 border-b'>
                  <div className='relative w-24 h-24 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0'>
                    {enquiry.student_photo_url ? (
                      <img
                        src={enquiry.student_photo_url}
                        alt={`${enquiry.first_name} ${enquiry.last_name || ''}`}
                        className='w-full h-full object-cover'
                      />
                    ) : (
                      <div className='w-full h-full flex items-center justify-center bg-primary/10'>
                        <UserIcon className='h-12 w-12 text-muted-foreground' />
                      </div>
                    )}
                  </div>
                  <div className='flex-1 space-y-2'>
                    <div>
                      <h2 className='text-2xl font-bold tracking-tight'>
                        {enquiry.first_name} {enquiry.last_name || ''}
                      </h2>
                      <p className='text-sm text-muted-foreground'>
                        {enquiry.application_id
                          ? `Application ID: ${enquiry.application_id}`
                          : enquiry.roll_number
                          ? `Roll No: ${enquiry.roll_number}`
                          : 'No ID assigned'}
                      </p>
                    </div>
                    <div>
                      <LifecycleStatusBadge status={enquiry.lifecycle_status} showIcon />
                    </div>
                  </div>
                </div>

                {/* Personal Information */}
                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Personal Information</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Date of Birth
                      </h4>
                      <p className='text-sm'>{formatDate(enquiry.date_of_birth)}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Gender
                      </h4>
                      <p className='text-sm'>{enquiry.gender}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Blood Group
                      </h4>
                      <p className='text-sm'>
                        {enquiry.blood_group || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Religion
                      </h4>
                      <p className='text-sm'>{enquiry.religion}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Community
                      </h4>
                      <p className='text-sm'>{enquiry.community}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Caste
                      </h4>
                      <p className='text-sm'>
                        {enquiry.caste || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Aadhar Number
                      </h4>
                      <p className='text-sm'>
                        {enquiry.aadhar_number || 'Not provided'}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Parent/Guardian Information</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Father&apos;s Name
                      </h4>
                      <p className='text-sm'>{enquiry.father_name}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Father&apos;s Occupation
                      </h4>
                      <p className='text-sm'>
                        {enquiry.father_occupation || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Father&apos;s Mobile
                      </h4>
                      <p className='text-sm'>{enquiry.father_mobile}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Mother&apos;s Name
                      </h4>
                      <p className='text-sm'>{enquiry.mother_name}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Mother&apos;s Occupation
                      </h4>
                      <p className='text-sm'>
                        {enquiry.mother_occupation || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Mother&apos;s Mobile
                      </h4>
                      <p className='text-sm'>{enquiry.mother_mobile}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Annual Income
                      </h4>
                      <p className='text-sm'>
                        {enquiry.annual_income || 'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {/* Academic Information Section */}
          {activeSection === 'academic' && (
            <>
              <CardHeader>
                <CardTitle>Academic Information</CardTitle>
                <CardDescription>Academic and enrollment details</CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Student Identification</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Roll Number
                      </h4>
                      <p className='text-sm'>
                        {enquiry.roll_number || 'Not assigned'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Register Number
                      </h4>
                      <p className='text-sm'>
                        {enquiry.register_number || 'Not assigned'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        College Email
                      </h4>
                      <p className='text-sm'>
                        {enquiry.college_email || 'Not assigned'}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Program Details</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Institution
                      </h4>
                      <p className='text-sm'>
                        {enquiry.institution?.name || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Degree
                      </h4>
                      <p className='text-sm'>
                        {enquiry.degree?.degree_name || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Department
                      </h4>
                      <p className='text-sm'>
                        {enquiry.department?.department_name || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Program
                      </h4>
                      <p className='text-sm'>
                        {enquiry.program?.program_name || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Semester
                      </h4>
                      <p className='text-sm'>
                        {enquiry.semester?.semester_name || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Section
                      </h4>
                      <p className='text-sm'>
                        {enquiry.section?.section_name || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Academic Year
                      </h4>
                      <p className='text-sm'>
                        {enquiry.academic_year?.academic_year_name || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Admission Year
                      </h4>
                      <p className='text-sm'>
                        {enquiry.admission_year || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Entry Type
                      </h4>
                      <p className='text-sm'>{enquiry.entry_type}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Regulation
                      </h4>
                      <p className='text-sm'>
                        {enquiry.regulation
                          ? `${enquiry.regulation.regulation_code} (${enquiry.regulation.regulation_year})`
                          : 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Batch
                      </h4>
                      <p className='text-sm'>
                        {enquiry.batch
                          ? `${enquiry.batch.batch_name} (${enquiry.batch.batch_code})`
                          : 'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Counseling & Quota Information</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Applied for Counseling
                      </h4>
                      <p className='text-sm'>
                        {enquiry.counseling_applied ? 'Yes' : 'No'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Counseling Number
                      </h4>
                      <p className='text-sm'>
                        {enquiry.counseling_number || 'Not applicable'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Scholarship Type
                      </h4>
                      <p className='text-sm'>
                        {enquiry.scholarship_type || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Quota
                      </h4>
                      <p className='text-sm'>
                        {enquiry.quota || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Category
                      </h4>
                      <p className='text-sm'>
                        {enquiry.category || 'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {/* Qualifications Section */}
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
                  <h3 className='text-sm font-semibold'>Academic Background</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Last School
                      </h4>
                      <p className='text-sm'>{enquiry.last_school}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Board of Study
                      </h4>
                      <p className='text-sm'>{enquiry.board_of_study}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>10th Grade Marks</h3>
                  {enquiry.tenth_marks ? (
                    <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Maximum Marks
                        </h4>
                        <p className='text-sm'>
                          {enquiry.tenth_marks.max_marks || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Obtained Marks
                        </h4>
                        <p className='text-sm'>
                          {enquiry.tenth_marks.obtained_marks || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Percentage
                        </h4>
                        <p className='text-sm'>
                          {enquiry.tenth_marks.percentage || 'Not specified'}
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

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>12th Grade Marks</h3>
                  {enquiry.twelfth_marks ? (
                    <div className='space-y-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Group/Stream
                        </h4>
                        <p className='text-sm'>
                          {enquiry.twelfth_marks.group || 'Not specified'}
                        </p>
                      </div>
                      <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium text-muted-foreground'>
                            Maximum Marks
                          </h4>
                          <p className='text-sm'>
                            {enquiry.twelfth_marks.max_marks || 'Not specified'}
                          </p>
                        </div>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium text-muted-foreground'>
                            Obtained Marks
                          </h4>
                          <p className='text-sm'>
                            {enquiry.twelfth_marks.obtained_marks || 'Not specified'}
                          </p>
                        </div>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium text-muted-foreground'>
                            Percentage
                          </h4>
                          <p className='text-sm'>
                            {enquiry.twelfth_marks.percentage || 'Not specified'}
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

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Entrance Exam Details</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Medical Cutoff Marks
                      </h4>
                      <p className='text-sm'>
                        {enquiry.medical_cutoff_marks || 'Not applicable'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Engineering Cutoff Marks
                      </h4>
                      <p className='text-sm'>
                        {enquiry.engineering_cutoff_marks || 'Not applicable'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        NEET Roll Number
                      </h4>
                      <p className='text-sm'>
                        {enquiry.neet_roll_number || 'Not applicable'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        NEET Score
                      </h4>
                      <p className='text-sm'>
                        {enquiry.neet_score || 'Not applicable'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {/* Contact & Address Section */}
          {activeSection === 'contact' && (
            <>
              <CardHeader>
                <CardTitle>Contact & Address</CardTitle>
                <CardDescription>Contact information and address</CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Contact Information</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Student Mobile
                      </h4>
                      <p className='text-sm'>{enquiry.student_mobile}</p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Student Email
                      </h4>
                      <p className='text-sm'>{enquiry.student_email}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Permanent Address</h3>
                  <div className='grid grid-cols-1 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Street Address
                      </h4>
                      <p className='text-sm'>
                        {enquiry.permanent_address_street}
                      </p>
                    </div>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          State
                        </h4>
                        <p className='text-sm'>
                          {enquiry.permanent_address_state}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          District
                        </h4>
                        <p className='text-sm'>
                          {enquiry.permanent_address_district}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Taluk
                        </h4>
                        <p className='text-sm'>
                          {enquiry.permanent_address_taluk || 'Not specified'}
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          PIN Code
                        </h4>
                        <p className='text-sm'>
                          {enquiry.permanent_address_pin_code}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {/* Accommodation Section */}
          {activeSection === 'accommodation' && (
            <>
              <CardHeader>
                <CardTitle>Accommodation Preferences</CardTitle>
                <CardDescription>Hostel and transport details</CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Accommodation Type
                    </h3>
                    <p className='text-sm'>{enquiry.accommodation_type}</p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Hostel Type
                    </h3>
                    <p className='text-sm'>
                      {enquiry.hostel_type || 'Not applicable'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Food Type
                    </h3>
                    <p className='text-sm'>
                      {enquiry.food_type || 'Not applicable'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Bus Required
                    </h3>
                    <p className='text-sm'>
                      {enquiry.bus_required ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Bus Route
                    </h3>
                    <p className='text-sm'>
                      {enquiry.bus_route || 'Not applicable'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Pickup Location
                    </h3>
                    <p className='text-sm'>
                      {enquiry.bus_pickup_location || 'Not applicable'}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Reference Information</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Reference Type
                      </h4>
                      <p className='text-sm'>
                        {enquiry.reference_type || 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Reference Name
                      </h4>
                      <p className='text-sm'>
                        {enquiry.reference_name || 'Not applicable'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Reference Contact
                      </h4>
                      <p className='text-sm'>
                        {enquiry.reference_contact || 'Not applicable'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {/* Enquiry Details Section */}
          {activeSection === 'enquiry' && (
            <>
              <CardHeader>
                <CardTitle>Enquiry Details</CardTitle>
                <CardDescription>
                  Application and lifecycle information
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Application ID
                    </h3>
                    <p className='text-sm font-mono'>
                      {enquiry.application_id || 'Not generated'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Lifecycle Status
                    </h3>
                    <Badge variant='outline'>{enquiry.lifecycle_status}</Badge>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Enquiry Date
                    </h3>
                    <p className='text-sm'>
                      {formatDate(enquiry.enquiry_date || enquiry.created_at)}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Profile Complete
                    </h3>
                    <p className='text-sm'>
                      {enquiry.is_profile_complete ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Created At
                    </h3>
                    <p className='text-sm'>{formatDate(enquiry.created_at)}</p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Last Updated
                    </h3>
                    <p className='text-sm'>{formatDate(enquiry.updated_at)}</p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Created By
                    </h3>
                    <p className='text-sm'>
                      {enquiry.created_by_user
                        ? `${enquiry.created_by_user.full_name || enquiry.created_by_user.email}`
                        : 'Not available'}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <h3 className='text-sm font-medium text-muted-foreground'>
                      Updated By
                    </h3>
                    <p className='text-sm'>
                      {enquiry.updated_by_user
                        ? `${enquiry.updated_by_user.full_name || enquiry.updated_by_user.email}`
                        : 'Not available'}
                    </p>
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
