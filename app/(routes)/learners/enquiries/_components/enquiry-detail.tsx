'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  UserCheck,
  GraduationCap,
  Phone,
  MapPin,
  School,
  Home,
  BookText,
  FileEdit,
  IndianRupee,
  LinkIcon,
  ExternalLink,
  CheckCircle2,
  Clock,
  Share2
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
import { usePermissions } from '@/hooks/use-permissions';
import { useEnquiryReferralContext } from '@/hooks/admission/use-enquiry-referral';
// Fee structure constants removed 2026-04-15 — replaced by dynamic fee_items flow.

interface EnquiryDetailProps {
  enquiry: LearnerProfile;
}

export function EnquiryDetail({ enquiry }: EnquiryDetailProps) {
  const [activeSection, setActiveSection] = useState('personal');
  const { canAccess, isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const canViewFinance = isSuperAdmin || isAdmissionGlobalUser || canAccess('learners', 'finance.view');

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
    ...(canViewFinance ? [{
      id: 'finance',
      label: 'Finance Details',
      icon: IndianRupee
    }] : []),
    {
      id: 'referral',
      label: 'Referral & Consultant',
      icon: Share2
    },
    {
      id: 'enquiry',
      label: 'Admitted Details',
      icon: BookText
    }
  ];

  // Fetch consultant attributions from the originating lead (via bridge FK).
  const { data: referralContext, isLoading: referralLoading } =
    useEnquiryReferralContext(enquiry.id);

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
                <CardDescription>Hostel and accommodation details</CardDescription>
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

          {/* Finance Details Section */}
          {activeSection === 'finance' && canViewFinance && (
            <>
              <CardHeader>
                <CardTitle>Finance Details</CardTitle>
                <CardDescription>
                  Dynamic fee line items linked to billing categories.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                {(() => {
                  const feeItems = Array.isArray((enquiry as any).fee_items)
                    ? ((enquiry as any).fee_items as Array<{
                        category_id: string;
                        category_name: string;
                        amount: number;
                      }>)
                    : [];
                  const total = feeItems.reduce(
                    (s, it) => s + Number(it?.amount || 0),
                    0
                  );

                  const legacyFields: Array<{ name: string; label: string }> = [
                    { name: 'application_fee', label: 'Application Fee' },
                    { name: 'university_reg_fee', label: 'University Registration Fee' },
                    { name: 'tuition_fee', label: 'Tuition Fee' },
                    { name: 'hostel_fee', label: 'Hostel Fee' },
                    { name: 'uniform_fee', label: 'Uniform Fee' },
                    { name: 'hospital_training_fee', label: 'Hospital Training Fee' },
                    { name: 'placement_fee', label: 'Placement Fee' },
                    { name: 'transport_fee', label: 'Transport Fee' },
                  ];
                  const presentLegacy = legacyFields.filter(
                    ({ name }) =>
                      (enquiry as any)[name] != null && Number((enquiry as any)[name]) > 0
                  );

                  return (
                    <>
                      <div className='space-y-4'>
                        <h3 className='text-sm font-semibold'>Fee Items</h3>
                        {feeItems.length === 0 ? (
                          <p className='text-sm text-muted-foreground italic'>
                            No fee items added.
                          </p>
                        ) : (
                          <div className='border rounded-md divide-y'>
                            {feeItems.map((it, i) => (
                              <div
                                key={`${it.category_id}-${i}`}
                                className='flex items-center justify-between px-4 py-2 text-sm'
                              >
                                <span>{it.category_name}</span>
                                <span className='font-medium'>
                                  ₹ {Number(it.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            ))}
                            <div className='flex items-center justify-between px-4 py-2 bg-muted/40 text-sm'>
                              <span className='font-semibold'>Total</span>
                              <span className='font-semibold'>
                                ₹ {total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {presentLegacy.length > 0 && (
                        <>
                          <Separator />
                          <div className='space-y-3'>
                            <div>
                              <h3 className='text-sm font-semibold text-muted-foreground'>
                                Legacy Fee Structure (read-only)
                              </h3>
                              <p className='text-xs text-muted-foreground'>
                                Saved before the fee-items flow was introduced.
                              </p>
                            </div>
                            <div className='grid grid-cols-2 gap-3'>
                              {presentLegacy.map(({ name, label }) => (
                                <div
                                  key={name}
                                  className='flex items-center justify-between text-sm bg-muted/30 px-3 py-2 rounded'
                                >
                                  <span className='text-muted-foreground'>{label}</span>
                                  <span className='font-medium'>
                                    ₹ {Number((enquiry as any)[name]).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </>
          )}

          {/* Referral & Consultant Section — data bridged from admission_leads */}
          {activeSection === 'referral' && (
            <>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Share2 className='h-5 w-5' />
                  Referral & Consultant
                </CardTitle>
                <CardDescription>
                  Who brought this lead in — copied from the admission lead record
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                {/* Direct referral info (copied from the lead on conversion) */}
                <div>
                  <h3 className='text-sm font-semibold mb-3'>Referral Details</h3>
                  {enquiry.referral_type || enquiry.referred_by_name ? (
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-1'>
                        <p className='text-xs text-muted-foreground'>Referral Type</p>
                        <Badge variant='outline' className='capitalize'>
                          {enquiry.referral_type || '—'}
                        </Badge>
                      </div>
                      <div className='space-y-1'>
                        <p className='text-xs text-muted-foreground'>Referred By</p>
                        <p className='text-sm font-medium'>
                          {enquiry.referred_by_name || '—'}
                        </p>
                      </div>
                      {enquiry.referred_by_id && (
                        <div className='space-y-1 col-span-2'>
                          <p className='text-xs text-muted-foreground'>Referrer ID</p>
                          <p className='text-xs font-mono text-muted-foreground'>
                            {enquiry.referred_by_id}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      No referral recorded for this enquiry
                    </p>
                  )}
                </div>

                <Separator />

                {/* Consultant attributions — linked via admission_leads.learner_profile_id */}
                <div>
                  <div className='flex items-center justify-between mb-3'>
                    <h3 className='text-sm font-semibold flex items-center gap-2'>
                      <LinkIcon className='h-4 w-4' />
                      Consultant Attributions
                    </h3>
                    {referralContext?.leadId && (
                      <Link
                        href={`/admission/leads/${referralContext.leadId}`}
                        className='text-xs text-primary hover:underline flex items-center gap-1'
                      >
                        View source lead
                        <ExternalLink className='h-3 w-3' />
                      </Link>
                    )}
                  </div>

                  {referralLoading ? (
                    <p className='text-sm text-muted-foreground'>
                      Loading consultant info...
                    </p>
                  ) : !referralContext?.leadId ? (
                    <p className='text-sm text-muted-foreground'>
                      This enquiry was not converted from an admission lead — no consultant context available
                    </p>
                  ) : referralContext.attributions.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      No consultant linked to the source lead
                    </p>
                  ) : (
                    <div className='space-y-3'>
                      {referralContext.attributions.map((attribution: any) => (
                        <div
                          key={attribution.id}
                          className='flex items-start justify-between gap-2 p-3 border rounded-lg'
                        >
                          <div className='min-w-0 flex-1'>
                            <p className='text-sm font-medium truncate'>
                              {attribution.consultant?.name || 'Unknown Consultant'}
                            </p>
                            {attribution.consultant?.email && (
                              <p className='text-xs text-muted-foreground truncate'>
                                {attribution.consultant.email}
                              </p>
                            )}
                            <div className='flex items-center gap-1.5 mt-2 flex-wrap'>
                              <Badge variant='outline' className='text-xs capitalize'>
                                {attribution.attribution_type}
                                {typeof attribution.attribution_percentage === 'number' && (
                                  <span className='ml-1 text-muted-foreground'>
                                    ({attribution.attribution_percentage}%)
                                  </span>
                                )}
                              </Badge>
                              {attribution.is_verified ? (
                                <Badge className='text-xs bg-green-100 text-green-800 gap-1'>
                                  <CheckCircle2 className='h-2.5 w-2.5' />
                                  Verified
                                </Badge>
                              ) : (
                                <Badge className='text-xs bg-yellow-100 text-yellow-800 gap-1'>
                                  <Clock className='h-2.5 w-2.5' />
                                  Pending
                                </Badge>
                              )}
                            </div>
                          </div>
                          {attribution.consultant_id && (
                            <Link
                              href={`/admission/consultants/${attribution.consultant_id}`}
                              className='shrink-0'
                            >
                              <Badge
                                variant='outline'
                                className='hover:bg-muted cursor-pointer gap-1'
                              >
                                <ExternalLink className='h-3 w-3' />
                                View
                              </Badge>
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </>
          )}

          {/* Admitted Details Section */}
          {activeSection === 'enquiry' && (
            <>
              <CardHeader>
                <CardTitle>Admitted Details</CardTitle>
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
                      Admitted Date
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
