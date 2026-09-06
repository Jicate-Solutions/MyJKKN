'use client';
// ============================================
// LEARNER DETAIL COMPONENT
// ============================================
// Created: 2025-01-19
// Purpose: Display comprehensive learner profile information
// ============================================


import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { useRouteById, useRouteStops } from '@/hooks/tms/use-route-lookup';
import {
  UserCheck,
  GraduationCap,
  Phone,
  MapPin,
  School,
  Home,
  BookText,
  FileText,
  IndianRupee,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReferenceDetailsDialog } from '@/components/admission/reference-details-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { JkknQrBlock } from '@/components/identity/jkkn-id-chip';
import { Separator } from '@/components/ui/separator';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';
import { formatAdmissionYear } from '@/lib/utils/admission-year-format';
import type { LearnerProfile } from '@/types/learner-profile';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import { ViewOnMapLink } from '@/components/learners/view-on-map-link';
import { formatTwelfthGroup } from '@/lib/utils/mappings/enquiry-excel-mappings';
import { useQuery } from '@tanstack/react-query';
import { DegreeService } from '@/lib/services/organization/degree-service';
// Fee structure constants removed 2026-04-15 — replaced by dynamic fee_items flow.

import { useQuotaName } from '@/hooks/admission/use-quota-name';
import { useCommunityName } from '@/hooks/admission/use-community-name';
import { useCasteName } from '@/hooks/admission/use-caste-name';

interface LearnerDetailProps {
  learner: LearnerProfile;
}

export function LearnerDetail({ learner }: LearnerDetailProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState('personal');
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const quotaName = useQuotaName((learner as { quota_id?: string }).quota_id);
  const communityName = useCommunityName((learner as { community_category_id?: string }).community_category_id);
  const casteName = useCasteName((learner as { caste_id?: string }).caste_id);
  const {
    canAccess,
    isSuperAdmin,
    isAdmissionGlobalUser,
    isLoading: permissionsLoading,
  } = usePermissions();

  // Resolve the stored hostel/mess category FKs to display names.
  const { hostelCategories: allHostelCategories } = useActiveHostelCategories();
  const { messCategories: allMessCategories } = useActiveMessCategories();
  const hostelCategoryName = allHostelCategories.find(
    (c) => c.id === (learner as any).hostel_category_id
  )?.name;
  const messCategoryName = allMessCategories.find(
    (c) => c.id === (learner as any).mess_category_id
  )?.name;

  // Resolve the Day-Scholar transport route + boarding-point names.
  const transportRouteId = (learner as any).transport_route_id as string | undefined;
  const { route: routeObj } = useRouteById(transportRouteId);
  const { stops: routeStops } = useRouteStops(transportRouteId);
  const routeName = routeObj
    ? `${routeObj.route_number} - ${routeObj.route_name}`
    : undefined;
  const stopName = routeStops.find(
    (s) => s.id === (learner as any).transport_stop_id
  )?.stop_name;

  const isProfileComplete =
    !!learner.roll_number &&
    !!learner.college_email &&
    !!learner.student_photo_url;

  // Only access permissions after they've loaded
  const hasEditPermission =
    !permissionsLoading && (isSuperAdmin || isAdmissionGlobalUser || canAccess('learners', 'edit'));
  const canViewFinance = isSuperAdmin || isAdmissionGlobalUser || canAccess('learners', 'finance.view');

  const { data: degreeData } = useQuery({
    queryKey: ['degree-for-detail', learner.degree_id],
    queryFn: () => DegreeService.getDegree(learner.degree_id!),
    enabled: !!learner.degree_id,
  });
  const isPG = degreeData?.degree_type === 'pg';

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
    ...(canViewFinance ? [{
      id: 'finance',
      label: 'Finance Details',
      icon: IndianRupee
    }] : []),
    {
      id: 'admission',
      label: 'Admission Details',
      icon: BookText,
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
                  {/* The permanent JKKN ID QR — the photo's counterpart, same
                      h-24 size, at the end of the row. Click = enlarge/download. */}
                  <JkknQrBlock
                    kind="learner"
                    refId={learner.id}
                    personName={`${learner.first_name} ${learner.last_name || ''}`.trim()}
                    className="ml-auto"
                  />
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
                      <p className="text-sm">{communityName || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Caste</h4>
                      <p className="text-sm">{casteName || 'Not specified'}</p>
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
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Learner Type
                      </h4>
                      <p className="text-sm capitalize">{learner.learner_type || 'Not specified'}</p>
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
                      <p className="text-sm">{quotaName || 'Not specified'}</p>
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
                {/* College / School Background — always visible */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">{isPG ? 'Previous College' : 'Academic Background'}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        {isPG ? 'College Name & Place' : 'Last School'}
                      </h4>
                      <p className="text-sm">{learner.last_school || 'Not specified'}</p>
                    </div>
                    {!isPG && (
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Board of Study
                        </h4>
                        <p className="text-sm">{learner.board_of_study || 'Not specified'}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* PG-specific: Previous Qualification */}
                {isPG && learner.twelfth_marks && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Previous Qualification</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Previous Course / Degree
                          </h4>
                          <p className="text-sm">
                            {(learner.twelfth_marks as any).course_name || 'Not specified'}
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
                  </>
                )}

                {/* UG-only: 10th Grade Marks */}
                {!isPG && (
                  <>
                    <Separator />
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
                  </>
                )}

                {/* UG-only: 12th Grade Marks */}
                {!isPG && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">12th Grade Marks</h3>
                      {learner.twelfth_marks ? (
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium text-muted-foreground">
                              Group/Stream
                            </h4>
                            <p className="text-sm">
                              {formatTwelfthGroup((learner.twelfth_marks as any).group)}
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
                  </>
                )}

                {/* UG-only: Entrance Exam Details */}
                {!isPG && (
                  <>
                    <Separator />
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
                  </>
                )}
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
                  {/* One address is stored (permanent_address_*). A second
                      "Communication Address" block used to render the SAME
                      street column under a different heading, which read as two
                      addresses that always agreed. Labels below match the
                      columns and the edit form's Contact tab exactly. */}
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Street Address
                      </h4>
                      <p className="text-sm">{learner.permanent_address_street || 'Not specified'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Taluk
                      </h4>
                      <p className="text-sm">{learner.permanent_address_taluk || 'Not specified'}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        District
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
                        PIN Code
                      </h4>
                      <p className="text-sm">{learner.permanent_address_pin_code || 'Not specified'}</p>
                      <ViewOnMapLink
                        postOfficeId={learner.post_office_id}
                        pincode={learner.permanent_address_pin_code}
                      />
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
                  {learner.accommodation_type === 'HOSTEL' && (
                    <>
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Hostel Room Category
                        </h4>
                        <p className="text-sm">
                          {hostelCategoryName || 'Not specified'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Mess Category
                        </h4>
                        <p className="text-sm">
                          {messCategoryName || 'Not specified'}
                        </p>
                      </div>
                    </>
                  )}
                  {learner.accommodation_type === 'DAY SCHOLAR' && (
                    <>
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Bus Required
                        </h4>
                        <p className="text-sm">
                          {(learner as any).bus_required === true
                            ? 'Yes'
                            : (learner as any).bus_required === false
                            ? 'No'
                            : 'Not specified'}
                        </p>
                      </div>
                      {(learner as any).bus_required === true && (
                        <>
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium text-muted-foreground">
                              Route
                            </h4>
                            <p className="text-sm">{routeName || 'Not specified'}</p>
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium text-muted-foreground">
                              Boarding Point
                            </h4>
                            <p className="text-sm">{stopName || 'Not specified'}</p>
                          </div>
                        </>
                      )}
                    </>
                  )}
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
                  const feeItems = Array.isArray((learner as any).fee_items)
                    ? ((learner as any).fee_items as Array<{
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
                  ];
                  const presentLegacy = legacyFields.filter(
                    ({ name }) =>
                      (learner as any)[name] != null && Number((learner as any)[name]) > 0
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
                                    ₹ {Number((learner as any)[name]).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                        Admitted Date
                      </h4>
                      <p className="text-sm">{formatDate(learner.enquiry_date)}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Admission Year
                      </h4>
                      {/* 2026-04-23: rich label via shared formatter (FK -> name + year range). */}
                      <p className="text-sm">{formatAdmissionYear(learner as any)}</p>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium">Reference Details</h3>
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-xs">
                          Super Admin Only
                        </Badge>
                        {/* Whether the referral resolves to a real record is the
                          * fact that matters: a name-only referral cannot be
                          * joined by any referrer report or commission run. */}
                        {(learner as any).referral_type && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              (learner as any).referred_by_id
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-amber-50 text-amber-700 border-amber-300'
                            )}
                          >
                            {(learner as any).referred_by_id ? 'Linked record' : 'Name only'}
                          </Badge>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() => setReferenceDialogOpen(true)}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Referral Type
                          </h4>
                          <p className="text-sm capitalize">
                            {(learner as any).referral_type ||
                              learner.reference_type ||
                              'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Referred By
                          </h4>
                          <p className="text-sm">
                            {(learner as any).referred_by_name ||
                              learner.reference_name ||
                              'Not specified'}
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

                    <ReferenceDetailsDialog
                      open={referenceDialogOpen}
                      onOpenChange={setReferenceDialogOpen}
                      learnerId={learner.id}
                      learnerName={`${learner.first_name || ''} ${learner.last_name || ''}`.trim()}
                      institutionId={(learner as any).institution_id}
                      initial={{
                        referral_type: (learner as any).referral_type ?? null,
                        referred_by_id: (learner as any).referred_by_id ?? null,
                        referred_by_name:
                          (learner as any).referred_by_name ?? learner.reference_name ?? null,
                        reference_contact: learner.reference_contact ?? null,
                      }}
                      // The detail page is a server component — refresh re-runs
                      // its fetch so the card reflects what was just written.
                      onSaved={() => router.refresh()}
                    />
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
