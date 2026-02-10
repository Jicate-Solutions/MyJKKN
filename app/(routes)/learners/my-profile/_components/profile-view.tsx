'use client';

import { useRouter } from 'next/navigation';
import { LearnerProfile } from '@/types/learner-profile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { InfoField } from './info-field';
import { formatDate } from '@/lib/utils';
import {
  Pencil,
  User,
  Phone,
  Mail,
  MapPin,
  GraduationCap,
  Users,
  Home,
  FileText,
  Shield,
  Calendar,
  BookOpen,
  Building,
  Bed,
  Award,
  School,
  ClipboardList,
  History,
} from 'lucide-react';
import Image from 'next/image';

interface ProfileViewProps {
  learner: LearnerProfile;
  canEdit: boolean;
  onEdit: () => void;
}

export function ProfileView({ learner, canEdit, onEdit }: ProfileViewProps) {
  const router = useRouter();
  // Helper to mask Aadhar number (show only last 4 digits)
  const maskAadhar = (aadhar?: string | null) => {
    if (!aadhar) return 'Not provided';
    if (aadhar.length < 4) return aadhar;
    return `XXXX-XXXX-${aadhar.slice(-4)}`;
  };

  // Helper to format JSON marks
  const formatMarks = (marks: any) => {
    if (!marks) return 'Not provided';
    if (typeof marks === 'string') {
      try {
        marks = JSON.parse(marks);
      } catch {
        return marks;
      }
    }
    if (typeof marks === 'object') {
      return Object.entries(marks)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
    }
    return String(marks);
  };

  return (
    <div className="space-y-6">
      {/* Profile Header Card */}
      <Card className="border-primary/20 shadow-md">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Profile Info */}
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {learner.student_photo_url ? (
                  <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20">
                    <Image
                      src={learner.student_photo_url}
                      alt={`${learner.first_name} ${learner.last_name || ''}`}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
                    <User className="w-10 h-10 text-primary" />
                  </div>
                )}
              </div>

              {/* Name and Details */}
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl md:text-3xl font-bold text-foreground truncate">
                  {learner.first_name} {learner.last_name || ''}
                </h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  {learner.application_id && (
                    <Badge variant="outline" className="text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      App: {learner.application_id}
                    </Badge>
                  )}
                  {learner.roll_number && (
                    <Badge variant="secondary" className="text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      Roll: {learner.roll_number}
                    </Badge>
                  )}
                  {learner.register_number && (
                    <Badge variant="secondary" className="text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      Reg: {learner.register_number}
                    </Badge>
                  )}
                  <Badge
                    variant={learner.lifecycle_status === 'active' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {learner.lifecycle_status || 'Active'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                  {learner.department?.department_name} • {learner.program?.program_name}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <Button
                onClick={() => router.push('/learners/my-profile/status')}
                size="lg"
                variant="outline"
                className="w-full md:w-auto shadow-sm"
              >
                <History className="h-4 w-4 mr-2" />
                View Status & History
              </Button>
              {canEdit && (
                <Button onClick={onEdit} size="lg" className="w-full md:w-auto shadow-sm">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid Layout for Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information Card */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Basic personal details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <InfoField label="First Name" value={learner.first_name} icon={User} />
              <InfoField label="Last Name" value={learner.last_name} icon={User} />
              <InfoField
                label="Date of Birth"
                value={learner.date_of_birth ? formatDate(learner.date_of_birth) : null}
                icon={Calendar}
              />
              <InfoField label="Gender" value={learner.gender} icon={User} />
              <InfoField label="Blood Group" value={learner.blood_group} icon={Shield} />
              <Separator />
              <InfoField label="Religion" value={learner.religion} icon={BookOpen} />
              <InfoField label="Community" value={learner.community} icon={Users} />
              <InfoField label="Caste" value={learner.caste} icon={Users} />
              <InfoField
                label="Aadhar Number"
                value={maskAadhar(learner.aadhar_number)}
                icon={Shield}
              />
            </div>
          </CardContent>
        </Card>

        {/* Academic Information Card */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <CardTitle>Academic Information</CardTitle>
                <CardDescription>Educational details</CardDescription>
              </div>
              <Badge variant={learner.is_profile_complete ? 'default' : 'secondary'}>
                {learner.is_profile_complete ? 'Complete' : 'Incomplete'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <InfoField
                label="Institution"
                value={learner.institution?.name}
                icon={Building}
              />
              <InfoField
                label="Degree"
                value={learner.degree?.degree_name}
                icon={GraduationCap}
              />
              <InfoField
                label="Department"
                value={learner.department?.department_name}
                icon={BookOpen}
              />
              <InfoField label="Program" value={learner.program?.program_name} icon={BookOpen} />
              <Separator />
              <InfoField
                label="Semester"
                value={learner.semester?.semester_name || learner.semester?.semester_code}
                icon={Calendar}
              />
              <InfoField label="Section" value={learner.section?.section_name} icon={Users} />
              <InfoField
                label="Academic Year"
                value={learner.academic_year?.academic_year_name}
                icon={Calendar}
              />
              <InfoField
                label="Admission Year"
                value={learner.admission_year}
                icon={Calendar}
              />
              <Separator />
              <InfoField label="Roll Number" value={learner.roll_number} icon={FileText} />
              <InfoField label="Register Number" value={learner.register_number} icon={FileText} />
              <InfoField label="College Email" value={learner.college_email} icon={Mail} />
              <Separator />
              <InfoField label="Entry Type" value={learner.entry_type} icon={ClipboardList} />
              <InfoField
                label="Regulation"
                value={
                  (learner as any).regulation?.regulation_year ||
                  (learner as any).regulation?.regulation_code
                }
                icon={BookOpen}
              />
              <InfoField
                label="Batch"
                value={
                  (learner as any).batch?.batch_name || (learner as any).batch?.batch_code
                }
                icon={Users}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Details Card */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950 flex items-center justify-center">
                <Phone className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle>Contact Details</CardTitle>
                <CardDescription>Contact information</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Student Contact */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Student Contact
              </h4>
              <div className="space-y-3">
                <InfoField label="Mobile" value={learner.student_mobile} icon={Phone} />
                <InfoField label="Email" value={learner.student_email} icon={Mail} />
              </div>
            </div>

            <Separator />

            {/* Father's Details */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Father&apos;s Details
              </h4>
              <div className="space-y-3">
                <InfoField label="Name" value={learner.father_name} icon={User} />
                <InfoField label="Mobile" value={learner.father_mobile} icon={Phone} />
                <InfoField label="Occupation" value={learner.father_occupation} icon={FileText} />
              </div>
            </div>

            <Separator />

            {/* Mother's Details */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Mother&apos;s Details
              </h4>
              <div className="space-y-3">
                <InfoField label="Name" value={learner.mother_name} icon={User} />
                <InfoField label="Mobile" value={learner.mother_mobile} icon={Phone} />
                <InfoField label="Occupation" value={learner.mother_occupation} icon={FileText} />
              </div>
            </div>

            <Separator />

            {/* Financial Information */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Financial Information
              </h4>
              <InfoField label="Annual Income" value={learner.annual_income} icon={FileText} />
            </div>
          </CardContent>
        </Card>

        {/* Address Information Card */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <CardTitle>Address Information</CardTitle>
                <CardDescription>Residential addresses</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Permanent Address */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Permanent Address
              </h4>
              <div className="space-y-3">
                <InfoField
                  label="Address"
                  value={learner.permanent_address_street}
                  icon={Home}
                />
                <div className="grid grid-cols-2 gap-3">
                  <InfoField
                    label="District"
                    value={learner.permanent_address_district}
                    icon={MapPin}
                  />
                   <InfoField
                    label="TALUK"
                    value={learner.permanent_address_taluk}  
                    icon={MapPin}
                  />
                  <InfoField label="State" value={learner.permanent_address_state} icon={MapPin} />
                  <InfoField
                  label="PIN Code"
                  value={learner.permanent_address_pin_code}
                  icon={MapPin}
                />
                </div>
               
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Counseling & Quota Information Card */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <CardTitle>Counseling & Quota</CardTitle>
                <CardDescription>Admission details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <InfoField
                label="Counseling Applied"
                value={(learner as any).counseling_applied ? 'Yes' : 'No'}
                icon={ClipboardList}
              />
              <InfoField
                label="Counseling Number"
                value={(learner as any).counseling_number}
                icon={FileText}
              />
              <InfoField label="Quota" value={(learner as any).quota} icon={Award} />
              <InfoField label="Category" value={(learner as any).category} icon={Users} />
              <InfoField
                label="Scholarship Type"
                value={(learner as any).scholarship_type}
                icon={Award}
              />
              <Separator />
              <InfoField
                label="Reference Type"
                value={(learner as any).reference_type}
                icon={Users}
              />
              <InfoField
                label="Reference Name"
                value={(learner as any).reference_name}
                icon={User}
              />
              <InfoField
                label="Reference Contact"
                value={(learner as any).reference_contact}
                icon={Phone}
              />
            </div>
          </CardContent>
        </Card>

        {/* Accommodation Details Card */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-950 flex items-center justify-center">
                <Bed className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <CardTitle>Accommodation Details</CardTitle>
                <CardDescription>Hostel and accommodation</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <InfoField
                label="Accommodation Type"
                value={learner.accommodation_type}
                icon={Home}
              />
              <InfoField label="Hostel Type" value={(learner as any).hostel_type} icon={Bed} />
              <InfoField label="Food Type" value={(learner as any).food_type} icon={FileText} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full Width Cards */}
      <div className="space-y-6">
        {/* Previous Academic Qualifications Card */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 dark:bg-cyan-950 flex items-center justify-center">
                <School className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <CardTitle>Previous Academic Qualifications</CardTitle>
                <CardDescription>10th, 12th and competitive exam details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 10th Standard */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  10th Standard
                </h4>
                <div className="space-y-3">
                  <InfoField
                    label="Last School"
                    value={(learner as any).last_school}
                    icon={School}
                  />
                  <InfoField
                    label="Board of Study"
                    value={(learner as any).board_of_study}
                    icon={BookOpen}
                  />
                  <InfoField
                    label="10th Marks"
                    value={formatMarks((learner as any).tenth_marks)}
                    icon={Award}
                  />
                </div>
              </div>

              {/* 12th Standard */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  12th Standard
                </h4>
                <div className="space-y-3">
                  <InfoField
                    label="12th Marks"
                    value={formatMarks((learner as any).twelfth_marks)}
                    icon={Award}
                  />
                  <InfoField
                    label="Medical Cutoff"
                    value={(learner as any).medical_cutoff_marks}
                    icon={FileText}
                  />
                  <InfoField
                    label="Engineering Cutoff"
                    value={(learner as any).engineering_cutoff_marks}
                    icon={FileText}
                  />
                </div>
              </div>

              {/* NEET/Competitive Exams */}
              <div className="md:col-span-2">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  Competitive Exams
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoField
                    label="NEET Roll Number"
                    value={(learner as any).neet_roll_number}
                    icon={FileText}
                  />
                  <InfoField
                    label="NEET Score"
                    value={(learner as any).neet_score}
                    icon={Award}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
