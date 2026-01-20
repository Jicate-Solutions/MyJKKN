'use client';

import { LearnerProfile } from '@/types/learner-profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoField } from './info-field';
import { formatDate } from '@/lib/utils';
import { Pencil } from 'lucide-react';

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

  // Helper to format address
  const formatAddress = (
    street?: string,
    city?: string,
    state?: string,
    pincode?: string
  ) => {
    const parts = [street, city, state, pincode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Not provided';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">
            {learner.first_name} {learner.last_name || ''}
          </h2>
          {learner.roll_number && (
            <p className="text-muted-foreground">Roll No: {learner.roll_number}</p>
          )}
        </div>
        {canEdit && (
          <Button onClick={onEdit} className="w-full sm:w-auto">
            <Pencil className="h-4 w-4 mr-2" />
            Edit Profile
          </Button>
        )}
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="academic">Academic</TabsTrigger>
        </TabsList>

        {/* Personal Information Tab */}
        <TabsContent value="personal">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="First Name" value={learner.first_name} />
                <InfoField label="Last Name" value={learner.last_name} />
                <InfoField
                  label="Date of Birth"
                  value={learner.date_of_birth ? formatDate(learner.date_of_birth) : null}
                />
                <InfoField label="Gender" value={learner.gender} />
                <InfoField label="Blood Group" value={learner.blood_group} />
                <InfoField label="Religion" value={learner.religion} />
                <InfoField label="Community" value={learner.community} />
                <InfoField label="Caste" value={learner.caste} />
                <InfoField
                  label="Aadhar Number"
                  value={maskAadhar(learner.aadhar_number)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact Details Tab */}
        <TabsContent value="contact">
          <Card>
            <CardHeader>
              <CardTitle>Contact Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Student Contact */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Student Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoField label="Mobile" value={learner.student_mobile} />
                  <InfoField label="Email" value={learner.student_email} />
                </div>
              </div>

              {/* Father's Details */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Father&apos;s Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InfoField label="Name" value={learner.father_name} />
                  <InfoField label="Mobile" value={learner.father_mobile} />
                  <InfoField label="Occupation" value={learner.father_occupation} />
                </div>
              </div>

              {/* Mother's Details */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Mother&apos;s Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InfoField label="Name" value={learner.mother_name} />
                  <InfoField label="Mobile" value={learner.mother_mobile} />
                  <InfoField label="Occupation" value={learner.mother_occupation} />
                </div>
              </div>

              {/* Guardian Details (if provided) */}
              {(learner as any).guardian_name && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Guardian Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <InfoField label="Name" value={(learner as any).guardian_name} />
                    <InfoField label="Mobile" value={(learner as any).guardian_mobile} />
                    <InfoField label="Relation" value={(learner as any).guardian_relation} />
                  </div>
                </div>
              )}

              {/* Annual Income */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Financial Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoField label="Annual Income" value={learner.annual_income} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Address Information Tab */}
        <TabsContent value="address">
          <Card>
            <CardHeader>
              <CardTitle>Address Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Permanent Address */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Permanent Address</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoField
                    label="Address"
                    value={learner.permanent_address_street}
                    className="md:col-span-2"
                  />
                  <InfoField label="City/District" value={learner.permanent_address_district} />
                  <InfoField label="State" value={learner.permanent_address_state} />
                  <InfoField label="PIN Code" value={learner.permanent_address_pin_code} />
                </div>
              </div>

              {/* Present Address (if different from permanent) */}
              {((learner as any).present_address_street || (learner as any).present_address_district) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Present Address</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoField
                      label="Address"
                      value={(learner as any).present_address_street}
                      className="md:col-span-2"
                    />
                    <InfoField label="City/District" value={(learner as any).present_address_district} />
                    <InfoField label="State" value={(learner as any).present_address_state} />
                    <InfoField label="PIN Code" value={(learner as any).present_address_pin_code} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Academic Information Tab */}
        <TabsContent value="academic">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Academic Information
                <Badge variant={learner.is_profile_complete ? 'default' : 'secondary'}>
                  {learner.is_profile_complete ? 'Complete' : 'Incomplete'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField
                  label="Institution"
                  value={learner.institution?.name}
                  className="md:col-span-2 lg:col-span-3"
                />
                <InfoField label="Degree" value={learner.degree?.degree_name} />
                <InfoField label="Department" value={learner.department?.department_name} />
                <InfoField label="Program" value={learner.program?.program_name} />
                <InfoField
                  label="Semester"
                  value={learner.semester?.semester_name || learner.semester?.semester_code}
                />
                <InfoField label="Section" value={learner.section?.section_name} />
                <InfoField
                  label="Academic Year"
                  value={learner.academic_year?.academic_year_name}
                />
                <InfoField label="Roll Number" value={learner.roll_number} />
                <InfoField label="Register Number" value={learner.register_number} />
                <InfoField label="College Email" value={learner.college_email} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
