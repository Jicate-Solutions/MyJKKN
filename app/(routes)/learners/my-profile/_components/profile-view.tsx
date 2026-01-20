'use client';

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
} from 'lucide-react';

interface ProfileViewProps {
  learner: LearnerProfile;
  canEdit: boolean;
  onEdit: () => void;
}

export function ProfileView({ learner, canEdit, onEdit }: ProfileViewProps) {
  // Helper to mask Aadhar number (show only last 4 digits)
  const maskAadhar = (aadhar?: string | null) => {
    if (!aadhar) return 'Not provided';
    if (aadhar.length < 4) return aadhar;
    return `XXXX-XXXX-${aadhar.slice(-4)}`;
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
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-10 h-10 text-primary" />
                </div>
              </div>

              {/* Name and Details */}
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl md:text-3xl font-bold text-foreground truncate">
                  {learner.first_name} {learner.last_name || ''}
                </h2>
                <div className="flex flex-wrap gap-2 mt-2">
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

            {/* Edit Button */}
            {canEdit && (
              <Button onClick={onEdit} size="lg" className="w-full md:w-auto shadow-sm">
                <Pencil className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            )}
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
              <InfoField label="Degree" value={learner.degree?.degree_name} icon={GraduationCap} />
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
              <InfoField label="College Email" value={learner.college_email} icon={Mail} />
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

            {/* Guardian Details (if provided) */}
            {((learner as any).guardian_name || (learner as any).guardian_mobile) && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    Guardian Details
                  </h4>
                  <div className="space-y-3">
                    <InfoField label="Name" value={(learner as any).guardian_name} icon={User} />
                    <InfoField label="Mobile" value={(learner as any).guardian_mobile} icon={Phone} />
                    <InfoField
                      label="Occupation"
                      value={(learner as any).guardian_occupation}
                      icon={FileText}
                    />
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Annual Income */}
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
                  <InfoField label="District" value={learner.permanent_address_district} icon={MapPin} />
                  <InfoField label="State" value={learner.permanent_address_state} icon={MapPin} />
                </div>
                <InfoField label="PIN Code" value={learner.permanent_address_pin_code} icon={MapPin} />
              </div>
            </div>

            {/* Present Address (if different from permanent) */}
            {((learner as any).present_address_street ||
              (learner as any).present_address_district) && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    Present Address
                  </h4>
                  <div className="space-y-3">
                    <InfoField
                      label="Address"
                      value={(learner as any).present_address_street}
                      icon={Home}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <InfoField
                        label="District"
                        value={(learner as any).present_address_district}
                        icon={MapPin}
                      />
                      <InfoField
                        label="State"
                        value={(learner as any).present_address_state}
                        icon={MapPin}
                      />
                    </div>
                    <InfoField
                      label="PIN Code"
                      value={(learner as any).present_address_pin_code}
                      icon={MapPin}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
