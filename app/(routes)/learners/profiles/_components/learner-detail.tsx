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
  MapPin,
  School,
  Home,
  BookText,
  FileText,
  Sparkles,
  Briefcase,
  Globe,
  ExternalLink,
  Target,
  TrendingUp,
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
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';

interface LearnerDetailProps {
  learner: LearnerProfile;
}

export function LearnerDetail({ learner }: LearnerDetailProps) {
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

  // Only access permissions after they've loaded
  const hasEditPermission =
    !permissionsLoading && (isSuperAdmin || canAccess('learners', 'edit'));

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
