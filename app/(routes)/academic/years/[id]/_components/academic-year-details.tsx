/**
 * Server-rendered Academic Year Details Component
 *
 * Displays academic year information in a card layout.
 * This is a server component that receives pre-fetched data.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { AcademicYear } from '@/types/academics';

interface AcademicYearDetailsProps {
  academicYear: AcademicYear;
}

export function AcademicYearDetails({
  academicYear
}: AcademicYearDetailsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="font-medium">Institution</p>
            <p className="text-base text-muted-foreground">
              {academicYear.institution?.name}
              {academicYear.institution?.counselling_code &&
                ` (${academicYear.institution.counselling_code})`}
            </p>
          </div>
          <div>
            <p className="font-medium">Status</p>
            <Badge variant={academicYear.is_active ? 'default' : 'secondary'}>
              {academicYear.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div>
            <p className="font-medium">Start Date</p>
            <p className="text-base text-muted-foreground">
              {format(new Date(academicYear.start_date), 'PPP')}
            </p>
          </div>
          <div>
            <p className="font-medium">End Date</p>
            <p className="text-base text-muted-foreground">
              {format(new Date(academicYear.end_date), 'PPP')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
