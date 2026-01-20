'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { LearnerProfile } from '@/types/learner-profile';
import { InfoField } from './info-field';
import { formatFieldLabel } from '@/lib/validations/profile-change-request';

interface ProfileComparisonViewProps {
  currentData: LearnerProfile;
  pendingChanges: Record<string, { old: any; new: any }>;
  canEdit: boolean;
}

export function ProfileComparisonView({
  currentData,
  pendingChanges,
  canEdit,
}: ProfileComparisonViewProps) {
  return (
    <div className="space-y-6">
      {/* Alert explaining the comparison */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Changes Pending Approval</AlertTitle>
        <AlertDescription>
          Your requested changes are shown below alongside your current information.
          You cannot make new edits until this request is resolved.
        </AlertDescription>
      </Alert>

      {/* Desktop: Side-by-side, Mobile: Stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Data (Left/Top) */}
        <Card className="border-2 border-green-500">
          <CardHeader className="bg-green-50">
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Current Information
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {Object.keys(pendingChanges).map((fieldName) => (
                <InfoField
                  key={fieldName}
                  label={formatFieldLabel(fieldName)}
                  value={pendingChanges[fieldName].old}
                  className="bg-white p-3 rounded-md border"
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Changes (Right/Bottom) */}
        <Card className="border-2 border-yellow-500">
          <CardHeader className="bg-yellow-50">
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Requested Changes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {Object.entries(pendingChanges).map(([fieldName, change]) => (
                <InfoField
                  key={fieldName}
                  label={formatFieldLabel(fieldName)}
                  value={change.new}
                  className="bg-yellow-50 p-3 rounded-md border border-yellow-200"
                  isChanged={true}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
