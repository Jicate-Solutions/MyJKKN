'use client';

/**
 * SeatFilledCard — learner-space "Seat Filled" KPI tile for the Group Dashboard.
 *
 * Added 2026-05-17 (E4 of the dynamic-admission-statuses initiative). Pairs
 * with the new "Enrolled Leads" tile (lead-space) to surface the drop-off gap
 * between admission_leads.funnel_stage='enrolled' and
 * learners_profiles with an admission_statuses row flagged is_seat_filled=true.
 *
 * When gap > 0, the supporting line becomes a clickable shortcut to the leads
 * list filtered to funnel_stage='enrolled' — the pursuit list for chasing the
 * "enrolled in CRM but not yet active in learner system" cohort.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface Props {
  enrolledLeads: number | undefined;
  seatFilled: number | undefined;
  isLoading: boolean;
}

export function SeatFilledCard({ enrolledLeads, seatFilled, isLoading }: Props) {
  const gap = (enrolledLeads ?? 0) - (seatFilled ?? 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Seat Filled</CardTitle>
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold">
              {(seatFilled ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              of {(enrolledLeads ?? 0).toLocaleString()} enrolled
              {gap > 0 && (
                <Link
                  href="/admission/leads?funnel_stage=enrolled"
                  className="ml-1 underline text-amber-600"
                >
                  ({gap} below threshold)
                </Link>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
