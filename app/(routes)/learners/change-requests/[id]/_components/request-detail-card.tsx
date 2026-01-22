'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { LearnerProfile } from '@/types/learner-profile';
import { InfoField } from '@/app/(routes)/learners/my-profile/_components/info-field';
import { formatFieldLabel } from '@/lib/validations/profile-change-request';

interface RequestDetailCardProps {
  currentData: LearnerProfile;
  changedFields: Record<string, { old: any; new: any }>;
}

/**
 * Request Detail Card
 *
 * Displays side-by-side comparison of current vs requested values
 * Desktop: 2-column grid
 * Mobile: Stacked layout
 */
export function RequestDetailCard({
  currentData,
  changedFields,
}: RequestDetailCardProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Current Data (Left/Top) */}
      <Card className="border-2 border-green-500">
        <CardHeader className="bg-green-50">
          <CardTitle className="flex items-center gap-2 text-green-900">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Current Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 max-h-[600px] overflow-y-auto">
          <div className="space-y-4">
            {Object.keys(changedFields).map((fieldName) => (
              <InfoField
                key={fieldName}
                label={formatFieldLabel(fieldName)}
                value={changedFields[fieldName].old}
                fieldName={fieldName}
                className="bg-white p-3 rounded-md border"
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Requested Changes (Right/Bottom) */}
      <Card className="border-2 border-blue-500">
        <CardHeader className="bg-blue-50">
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            Requested Changes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 max-h-[600px] overflow-y-auto">
          <div className="space-y-4">
            {Object.entries(changedFields).map(([fieldName, change]) => (
              <InfoField
                key={fieldName}
                label={formatFieldLabel(fieldName)}
                value={change.new}
                fieldName={fieldName}
                className="bg-blue-50 p-3 rounded-md border border-blue-200"
                isChanged={true}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
