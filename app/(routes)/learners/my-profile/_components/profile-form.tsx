'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Save, X } from 'lucide-react';
import { useCreateChangeRequest } from '@/hooks/learner-profile/use-change-request-mutations';
import type { LearnerProfile } from '@/types/learner-profile';

interface ProfileFormProps {
  learnerProfile: Partial<LearnerProfile>;
  userId: string;
}

interface FormData {
  first_name: string;
  last_name: string;
  student_mobile: string;
}

export default function ProfileForm({ learnerProfile, userId }: ProfileFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    first_name: learnerProfile.first_name || '',
    last_name: learnerProfile.last_name || '',
    student_mobile: learnerProfile.student_mobile || '',
  });

  const { mutate: createChangeRequest, isPending: isSaving } = useCreateChangeRequest();

  const handleEdit = () => {
    setFormData({
      first_name: learnerProfile.first_name || '',
      last_name: learnerProfile.last_name || '',
      student_mobile: learnerProfile.student_mobile || '',
    });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!learnerProfile.id) return;

    // Build changed fields by comparing form data to current profile
    const changedFields: Record<string, { old: string; new: string }> = {};

    if (formData.first_name !== (learnerProfile.first_name || '')) {
      changedFields.first_name = {
        old: learnerProfile.first_name || '',
        new: formData.first_name,
      };
    }
    if (formData.last_name !== (learnerProfile.last_name || '')) {
      changedFields.last_name = {
        old: learnerProfile.last_name || '',
        new: formData.last_name,
      };
    }
    if (formData.student_mobile !== (learnerProfile.student_mobile || '')) {
      changedFields.student_mobile = {
        old: learnerProfile.student_mobile || '',
        new: formData.student_mobile,
      };
    }

    if (Object.keys(changedFields).length === 0) {
      setIsEditing(false);
      return;
    }

    createChangeRequest(
      {
        learner_id: learnerProfile.id,
        changed_fields: changedFields,
        fields_summary: Object.keys(changedFields),
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Your profile information from the institution
            </CardDescription>
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => handleInputChange('first_name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => handleInputChange('last_name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={learnerProfile.college_email || '-'}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.student_mobile}
                  onChange={(e) => handleInputChange('student_mobile', e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving} size="sm">
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Submitting...' : 'Submit Changes'}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={isSaving} size="sm">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Changes will be submitted for approval by the institution admin.
            </p>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">First Name</label>
              <p className="text-sm text-muted-foreground">
                {learnerProfile.first_name || '-'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Last Name</label>
              <p className="text-sm text-muted-foreground">
                {learnerProfile.last_name || '-'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <p className="text-sm text-muted-foreground">
                {learnerProfile.college_email || '-'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <p className="text-sm text-muted-foreground">
                {learnerProfile.student_mobile || '-'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
