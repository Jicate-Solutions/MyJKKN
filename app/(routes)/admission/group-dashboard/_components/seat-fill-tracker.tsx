'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { InstitutionAdmissionSummary } from '@/types/admission-workflow-config';

interface SeatFillTrackerProps {
  institutions: InstitutionAdmissionSummary[];
}

export function SeatFillTracker({ institutions }: SeatFillTrackerProps) {
  const withSeats = institutions.filter((i) => i.total_seats > 0);

  if (withSeats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Seat Fill Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No seat configuration found. Set up seats in Workflow Config.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Seat Fill Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {withSeats.map((inst) => (
          <div key={inst.institution_id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate max-w-[200px]">
                {inst.institution_name}
              </span>
              <span className="text-muted-foreground">
                {inst.enrolled}/{inst.total_seats}
              </span>
            </div>
            <Progress
              value={Math.min(inst.fill_percentage, 100)}
              className="h-2"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
