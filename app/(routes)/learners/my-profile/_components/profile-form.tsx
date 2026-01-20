'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProfileFormProps {
  learnerProfile: any; // TODO: Add proper type
  userId: string;
}

export default function ProfileForm({ learnerProfile, userId }: ProfileFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
        <CardDescription>
          Your profile information from the institution
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
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
              {learnerProfile.email || '-'}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <p className="text-sm text-muted-foreground">
              {learnerProfile.phone_number || '-'}
            </p>
          </div>
        </div>
        {/* TODO: Add editable form with save functionality */}
      </CardContent>
    </Card>
  );
}
