// ============================================
// LEARNER DETAIL COMPONENT
// ============================================
// Created: 2025-01-19
// Purpose: Display comprehensive learner profile information
// ============================================

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  UserCheck,
  GraduationCap,
  Phone,
  School,
  Home,
  BookText,
  Sparkles,
  Briefcase,
  Globe,
  ExternalLink,
  Target,
  TrendingUp,
  CreditCard,
  IndianRupee,
  AlertTriangle,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';
import type { LearnerProfile } from '@/types/learner-profile';
import type { LearnerBillingSummary } from '../_data/get-learner-billing';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';

interface LearnerDetailProps {
  learner: LearnerProfile;
  billing?: LearnerBillingSummary | null;
}

export function LearnerDetail({ learner, billing }: LearnerDetailProps) {
  const [activeSection, setActiveSection] = useState('personal');
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading,
  } = usePermissions();

  const isProfileComplete =
    !!learner.roll_number &&
    !!learner.college_email &&
    !!learner.student_photo_url;

  const sections = [
    {
      id: 'personal',
      label: 'Personal Details',
      icon: UserCheck,
    },
    {
      id: 'academic',
      label: 'Academic Information',
      icon: GraduationCap,
    },
    {
      id: 'qualifications',
      label: 'Qualifications',
      icon: School,
    },
    {
      id: 'contact',
      label: 'Contact & Address',
      icon: Phone,
    },
    {
      id: 'accommodation',
      label: 'Accommodation',
      icon: Home,
    },
    {
      id: 'admission',
      label: 'Admission Details',
      icon: BookText,
    },
    {
      id: 'billing',
      label: 'Billing & Fees',
      icon: CreditCard,
    },
    {
      id: 'capabilities',
      label: 'Capabilities & Career',
      icon: Sparkles,
    },
  ];

  // Helper function to format date
  const formatDate = (dateString: string | null | undefined) => {
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
      <div className="w-full lg:w-64 shrink-0">
        <Card className="h-full">
          <CardContent className="p-0">
            <nav className="flex flex-col">
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
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="flex-1">
        <Card className="h-full">
          {/* Personal Details Section */}
          {activeSection === 'personal' && (
            <>
              <CardHeader>
                <CardTitle>Personal Details</CardTitle>
                <CardDescription>Basic personal information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Profile Photo */}
                <div className="flex items-center gap-4">
                  <Avatar className="h-24 w-24">
                    <AvatarImage
                      src={learner.student_photo_url || ''}
                      alt={`${learner.first_name} ${learner.last_name || ''}`}
                    />
                    <AvatarFallback className="text-2xl">
                      {learner.first_name.charAt(0)}
                      {learner.last_name?.charAt(0) || ''}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {learner.first_name} {learner.last_name || ''}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <LifecycleStatusBadge status={learner.lifecycle_status} />
                      {isProfileComplete ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                          Profile Complete
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                          Incomplete Profile
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Basic Information */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Basic Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        First Name
                      </h4>
                      <p className="text-sm">{learner.first_name}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Last Name
                      </h4>
                      <p className="text-sm">{learner.last_name || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Date of Birth
                      </h4>
                      <p className="text-sm">{formatDate(learner.date_of_birth)}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Gender</h4>
                      <p className="text-sm capitalize">{learner.gender || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Religion
                      </h4>
                      <p className="text-sm">{learner.religion || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Community
                      </h4>
                      <p className="text-sm">{learner.community || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Caste</h4>
                      <p className="text-sm">{learner.caste || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Blood Group
                      </h4>
                      <p className="text-sm">{learner.blood_group || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Aadhar Number
                      </h4>
                      <p className="text-sm">{learner.aadhar_number || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Parents Information */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Parent/Guardian Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Father&apos;s Name
                      </h4>
                      <p className="text-sm">{learner.father_name || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Father&apos;s Occupation
                      </h4>
                      <p className="text-sm">{learner.father_occupation || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Father&apos;s Mobile
                      </h4>
                      <p className="text-sm">{learner.father_mobile || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Mother&apos;s Name
                      </h4>
                      <p className="text-sm">{learner.mother_name || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Mother&apos;s Occupation
                      </h4>
                      <p className="text-sm">{learner.mother_occupation || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Mother&apos;s Mobile
                      </h4>
                      <p className="text-sm">{learner.mother_mobile || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Annual Income
                      </h4>
                      <p className="text-sm">{learner.annual_income || 'Not specified'}</p>
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
              <CardContent className="space-y-6">
                {/* Student Identification */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Student Identification</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Roll Number
                      </h4>
                      <p className="text-sm">{learner.roll_number || 'Not assigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Register Number
                      </h4>
                      <p className="text-sm">{learner.register_number || 'Not assigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        College Email
                      </h4>
                      <p className="text-sm">{learner.college_email || 'Not assigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Personal Email
                      </h4>
                      <p className="text-sm">{learner.student_email || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Mobile Number
                      </h4>
                      <p className="text-sm">{learner.student_mobile || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Program Details */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Program Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Institution
                      </h4>
                      <p className="text-sm">
                        {(learner as any).institution?.name || 'Not specified'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Degree
                      </h4>
                      <p className="text-sm">
                        {(learner as any).degree?.degree_name || 'Not specified'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Department
                      </h4>
                      <p className="text-sm">
                        {(learner as any).department?.department_name || 'Not specified'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Program
                      </h4>
                      <p className="text-sm">
                        {(learner as any).program?.program_name || 'Not specified'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Semester
                      </h4>
                      <p className="text-sm">
                        {(learner as any).semester?.semester_name || 'Not specified'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Section
                      </h4>
                      <p className="text-sm">
                        {(learner as any).section?.section_name || 'Not specified'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Academic Year
                      </h4>
                      <p className="text-sm">
                        {(learner as any).academic_year?.academic_year_name || 'Not specified'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Entry Type
                      </h4>
                      <p className="text-sm capitalize">{learner.entry_type || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Regulation
                      </h4>
                      <p className="text-sm">
                        {(learner as any).regulation
                          ? `${(learner as any).regulation.regulation_code} (${(learner as any).regulation.regulation_year})`
                          : 'Not specified'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Batch
                      </h4>
                      <p className="text-sm">
                        {(learner as any).batch
                          ? `${(learner as any).batch.batch_name} (${(learner as any).batch.batch_code})`
                          : 'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Counseling & Quota Information */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Counseling & Quota Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Applied for Counseling
                      </h4>
                      <p className="text-sm">
                        {learner.counseling_applied ? 'Yes' : 'No'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Counseling Number
                      </h4>
                      <p className="text-sm">
                        {learner.counseling_number || 'Not applicable'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Scholarship Type
                      </h4>
                      <p className="text-sm">
                        {learner.scholarship_type || 'Not specified'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Quota
                      </h4>
                      <p className="text-sm">{learner.quota || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Category
                      </h4>
                      <p className="text-sm">{learner.category || 'Not specified'}</p>
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
                <CardDescription>Previous academic qualifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Academic Background */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Academic Background</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Last School
                      </h4>
                      <p className="text-sm">{learner.last_school || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Board of Study
                      </h4>
                      <p className="text-sm">{learner.board_of_study || 'Not specified'}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* 10th Grade Marks */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">10th Grade Marks</h3>
                  {learner.tenth_marks ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Maximum Marks
                        </h4>
                        <p className="text-sm">
                          {(learner.tenth_marks as any).max_marks || 'Not specified'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Obtained Marks
                        </h4>
                        <p className="text-sm">
                          {(learner.tenth_marks as any).obtained_marks || 'Not specified'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Percentage
                        </h4>
                        <p className="text-sm">
                          {(learner.tenth_marks as any).percentage || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No 10th grade mark information available
                    </p>
                  )}
                </div>

                <Separator />

                {/* 12th Grade Marks */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">12th Grade Marks</h3>
                  {learner.twelfth_marks ? (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Group/Stream
                        </h4>
                        <p className="text-sm">
                          {(learner.twelfth_marks as any).group || 'Not specified'}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Maximum Marks
                          </h4>
                          <p className="text-sm">
                            {(learner.twelfth_marks as any).max_marks || 'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Obtained Marks
                          </h4>
                          <p className="text-sm">
                            {(learner.twelfth_marks as any).obtained_marks || 'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Percentage
                          </h4>
                          <p className="text-sm">
                            {(learner.twelfth_marks as any).percentage || 'Not specified'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No 12th grade mark information available
                    </p>
                  )}
                </div>

                <Separator />

                {/* Entrance Exam Details */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Entrance Exam Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Medical Cutoff Marks
                      </h4>
                      <p className="text-sm">
                        {learner.medical_cutoff_marks || 'Not applicable'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Engineering Cutoff Marks
                      </h4>
                      <p className="text-sm">
                        {learner.engineering_cutoff_marks || 'Not applicable'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        NEET Roll Number
                      </h4>
                      <p className="text-sm">
                        {learner.neet_roll_number || 'Not applicable'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        NEET Score
                      </h4>
                      <p className="text-sm">
                        {learner.neet_score || 'Not applicable'}
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
                <CardDescription>Contact information and address details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Contact Information */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Contact Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Student Mobile
                      </h4>
                      <p className="text-sm">{learner.student_mobile || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Personal Email
                      </h4>
                      <p className="text-sm">{learner.student_email || 'Not provided'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        College Email
                      </h4>
                      <p className="text-sm">{learner.college_email || 'Not assigned'}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Address Information */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Address Information</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Permanent Address
                      </h4>
                      <p className="text-sm">{learner.permanent_address_street || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Communication Address
                      </h4>
                      <p className="text-sm">{learner.permanent_address_street || 'Not specified'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        City
                      </h4>
                      <p className="text-sm">{learner.permanent_address_district || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        State
                      </h4>
                      <p className="text-sm">{learner.permanent_address_state || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Pincode
                      </h4>
                      <p className="text-sm">{learner.permanent_address_pin_code || 'Not specified'}</p>
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
                <CardTitle>Accommodation</CardTitle>
                <CardDescription>Hostel and accommodation details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Accommodation Type
                    </h4>
                    <p className="text-sm capitalize">
                      {learner.accommodation_type || 'Not specified'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {/* Billing & Fees Section */}
          {activeSection === 'billing' && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Billing & Fees
                </CardTitle>
                <CardDescription>Fee summary, payment status, and outstanding balances</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {billing ? (
                  <>
                    {/* Financial Overview Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg border p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <p className="text-xl font-bold">
                          {Number(billing.total_bill_amount).toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-muted-foreground">Total Billed</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        </div>
                        <p className="text-xl font-bold text-green-600">
                          {Number(Number(billing.total_bill_amount) - Number(billing.total_outstanding)).toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-muted-foreground">Total Paid</p>
                      </div>
                      <div className={cn(
                        "rounded-lg border p-3 text-center",
                        Number(billing.total_outstanding) > 0 && "border-orange-200 bg-orange-50"
                      )}>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <AlertTriangle className={cn(
                            "h-3.5 w-3.5",
                            Number(billing.total_outstanding) > 0 ? "text-orange-500" : "text-muted-foreground"
                          )} />
                        </div>
                        <p className={cn(
                          "text-xl font-bold",
                          Number(billing.total_outstanding) > 0 ? "text-orange-600" : ""
                        )}>
                          {Number(billing.total_outstanding).toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-muted-foreground">Outstanding</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Receipt className="h-3.5 w-3.5 text-blue-500" />
                        </div>
                        <p className="text-xl font-bold">
                          {billing.total_receipts}
                        </p>
                        <p className="text-xs text-muted-foreground">Receipts</p>
                      </div>
                    </div>

                    {/* Collection Progress Bar */}
                    {Number(billing.total_bill_amount) > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Collection Progress</span>
                          <span className="font-medium">
                            {Math.round(
                              ((Number(billing.total_bill_amount) - Number(billing.total_outstanding)) /
                                Number(billing.total_bill_amount)) *
                                100
                            )}
                            %
                          </span>
                        </div>
                        <Progress
                          value={Math.round(
                            ((Number(billing.total_bill_amount) - Number(billing.total_outstanding)) /
                              Number(billing.total_bill_amount)) *
                              100
                          )}
                          className="h-2"
                        />
                      </div>
                    )}

                    <Separator />

                    {/* Bill Breakdown */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Bill Status Breakdown</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Total Bills</h4>
                          <p className="text-sm font-semibold">{billing.total_bills}</p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-green-600">Paid</h4>
                          <p className="text-sm font-semibold">{billing.paid_bills}</p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-orange-600">Unpaid</h4>
                          <p className="text-sm font-semibold">{billing.unpaid_bills}</p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-yellow-600">Partially Paid</h4>
                          <p className="text-sm font-semibold">{billing.partially_paid_bills}</p>
                        </div>
                      </div>
                    </div>

                    {/* Overdue Warning */}
                    {Number(billing.overdue_bills) > 0 && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <span className="text-sm text-red-700">
                          {billing.overdue_bills} overdue bill{Number(billing.overdue_bills) !== 1 ? 's' : ''} require attention
                        </span>
                      </div>
                    )}

                    <Separator />

                    {/* Payment & Refund Info */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Payment & Refund Details</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Total Receipt Amount</h4>
                          <p className="text-sm">
                            {Number(billing.total_receipt_amount).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Last Payment</h4>
                          <p className="text-sm">
                            {billing.last_payment_date
                              ? formatDate(billing.last_payment_date)
                              : 'No payments recorded'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Total Refunds</h4>
                          <p className="text-sm">{billing.total_refunds}</p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Refund Amount</h4>
                          <p className="text-sm">
                            {Number(billing.total_processed_refunds).toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No Billing Data</p>
                    <p className="text-xs mt-1">
                      No bills have been generated for this learner yet.
                      Bills will appear here once they are created in the Billing module.
                    </p>
                  </div>
                )}
              </CardContent>
            </>
          )}

          {/* Capabilities & Career Section */}
          {activeSection === 'capabilities' && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Capabilities & Career
                </CardTitle>
                <CardDescription>Competency tracking, career aspirations, and industry readiness</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Industry Readiness Score */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    Industry Readiness
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Progress
                        value={learner.industry_readiness_score ?? 0}
                        className="h-3"
                      />
                    </div>
                    <span className="text-2xl font-bold min-w-[60px] text-right">
                      {learner.industry_readiness_score != null
                        ? `${learner.industry_readiness_score}%`
                        : '—'}
                    </span>
                  </div>
                  {learner.portfolio_url && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={learner.portfolio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        Portfolio
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {!learner.industry_readiness_score && !learner.portfolio_url && (
                    <p className="text-sm text-muted-foreground">
                      No industry readiness data available yet. This will be populated as the learner acquires competencies and completes industry engagements.
                    </p>
                  )}
                </div>

                <Separator />

                {/* Competencies */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Target className="h-4 w-4 text-green-500" />
                    Competencies
                  </h3>
                  {learner.capabilities?.competencies && learner.capabilities.competencies.length > 0 ? (
                    <div className="space-y-3">
                      {learner.capabilities.competencies.map((comp, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <p className="text-sm font-medium">{comp.competency_name || comp.competency_id}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="capitalize text-xs">
                                {comp.current_level}
                              </Badge>
                              {comp.evidence && comp.evidence.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {comp.evidence.length} evidence item{comp.evidence.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          {comp.verified_at && (
                            <Badge variant="default" className="text-xs">Verified</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No competencies tracked yet. Competencies will appear here as the learner progresses through courses and assessments.
                    </p>
                  )}
                </div>

                {/* Capability Summary */}
                {learner.capabilities?.summary && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">Capability Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xl font-bold">{learner.capabilities.summary.technical_skills}</p>
                          <p className="text-xs text-muted-foreground">Technical</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xl font-bold">{learner.capabilities.summary.behavioral_skills}</p>
                          <p className="text-xs text-muted-foreground">Behavioral</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xl font-bold">{learner.capabilities.summary.domain_knowledge}</p>
                          <p className="text-xs text-muted-foreground">Domain</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-xl font-bold">{learner.capabilities.summary.soft_skills}</p>
                          <p className="text-xs text-muted-foreground">Soft Skills</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Fink's Learning Profile */}
                {learner.capabilities?.overall_finks_profile && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">Fink&apos;s Learning Profile</h3>
                      <div className="space-y-2">
                        {[
                          { key: 'foundational_knowledge', label: 'Foundational Knowledge', color: 'bg-blue-500' },
                          { key: 'application', label: 'Application', color: 'bg-green-500' },
                          { key: 'integration', label: 'Integration', color: 'bg-purple-500' },
                          { key: 'human_dimension', label: 'Human Dimension', color: 'bg-orange-500' },
                          { key: 'caring', label: 'Caring', color: 'bg-pink-500' },
                          { key: 'learning_how_to_learn', label: 'Learning How to Learn', color: 'bg-teal-500' },
                        ].map(({ key, label }) => {
                          const score = (learner.capabilities?.overall_finks_profile as any)?.[key] ?? 0;
                          return (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{label}</span>
                                <span className="font-medium">{score}%</span>
                              </div>
                              <Progress value={score} className="h-2" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Career Aspirations */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-purple-500" />
                    Career Aspirations
                  </h3>
                  {learner.career_aspirations &&
                   (learner.career_aspirations.target_roles?.length ||
                    learner.career_aspirations.preferred_industries?.length ||
                    learner.career_aspirations.further_studies !== undefined) ? (
                    <div className="space-y-4">
                      {learner.career_aspirations.target_roles && learner.career_aspirations.target_roles.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Target Roles</h4>
                          <div className="flex flex-wrap gap-2">
                            {learner.career_aspirations.target_roles.map((role, idx) => (
                              <Badge key={idx} variant="secondary">{role}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {learner.career_aspirations.preferred_industries && learner.career_aspirations.preferred_industries.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Preferred Industries</h4>
                          <div className="flex flex-wrap gap-2">
                            {learner.career_aspirations.preferred_industries.map((ind, idx) => (
                              <Badge key={idx} variant="outline">{ind}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {learner.career_aspirations.location_preferences && learner.career_aspirations.location_preferences.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Location Preferences</h4>
                          <p className="text-sm">{learner.career_aspirations.location_preferences.join(', ')}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        {learner.career_aspirations.salary_expectations && (
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium text-muted-foreground">Salary Expectations</h4>
                            <p className="text-sm">{learner.career_aspirations.salary_expectations}</p>
                          </div>
                        )}
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Further Studies</h4>
                          <p className="text-sm">
                            {learner.career_aspirations.further_studies === true ? 'Interested' :
                             learner.career_aspirations.further_studies === false ? 'Not interested' : 'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">Entrepreneurship</h4>
                          <p className="text-sm">
                            {learner.career_aspirations.entrepreneurship_interest === true ? 'Interested' :
                             learner.career_aspirations.entrepreneurship_interest === false ? 'Not interested' : 'Not specified'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No career aspirations recorded yet. This section will be populated during career counseling sessions.
                    </p>
                  )}
                </div>
              </CardContent>
            </>
          )}

          {/* Admission Details Section */}
          {activeSection === 'admission' && (
            <>
              <CardHeader>
                <CardTitle>Admission Details</CardTitle>
                <CardDescription>Admission and enrollment information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Admission Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Application Number
                      </h4>
                      <p className="text-sm">{learner.application_id || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Enquiry Date
                      </h4>
                      <p className="text-sm">{formatDate(learner.enquiry_date)}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Admission Year
                      </h4>
                      <p className="text-sm">{learner.admission_year || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Lifecycle Status
                      </h4>
                      <div className="flex items-center">
                        <LifecycleStatusBadge status={learner.lifecycle_status} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reference Details - Super Admin Only */}
                {isSuperAdmin && (
                  <>
                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">Reference Details</h3>
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-xs">
                          Super Admin Only
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Reference Type
                          </h4>
                          <p className="text-sm capitalize">
                            {learner.reference_type || 'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Reference Name
                          </h4>
                          <p className="text-sm">
                            {learner.reference_name || 'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Reference Contact
                          </h4>
                          <p className="text-sm">
                            {learner.reference_contact || 'Not specified'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">System Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Created At
                      </h4>
                      <p className="text-sm">
                        {format(new Date(learner.created_at), 'dd MMM yyyy, HH:mm')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Last Updated
                      </h4>
                      <p className="text-sm">
                        {format(new Date(learner.updated_at), 'dd MMM yyyy, HH:mm')}
                      </p>
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
