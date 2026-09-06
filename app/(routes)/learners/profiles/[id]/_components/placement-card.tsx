// ============================================
// LEARNER PROFILE — PLACEMENT CARD (SERVER COMPONENT)
// ============================================
// Created: 2026-05-19 (CDC Sprint 5 / Workstream A2)
// Purpose: Show a learner's CDC placements on the profile page.
//   Renders nothing when the learner has no placements (silent absence is
//   the correct empty-state per /learners/profiles design language — the
//   card is only relevant for placed learners).
// ============================================

import Link from 'next/link';
import { format } from 'date-fns';
import { Briefcase, MapPin, Calendar, IndianRupee, ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { CdcPlacementService } from '@/lib/services/cdc/placement-service';
import {
  CDC_PLACEMENT_STATUS_LABELS,
  CDC_PLACEMENT_STATUS_COLORS,
} from '@/types/cdc/placements';
import type { CdcPlacementRow } from '@/types/cdc/placements';

interface PlacementCardProps {
  learnerId: string;
}

/**
 * Format a date string as "dd MMM yyyy" with safe fallback.
 */
function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return format(new Date(value), 'dd MMM yyyy');
  } catch {
    return null;
  }
}

/**
 * Format package as "₹X.XX LPA" (or null if no value).
 */
function formatPackage(lpa: number | null | undefined): string | null {
  if (lpa === null || lpa === undefined) return null;
  return `₹${Number(lpa).toFixed(2)} LPA`;
}

export async function PlacementCard({ learnerId }: PlacementCardProps) {
  // Server-side fetch — RLS scopes results to what the viewer is allowed to
  // see (cdc_staff + the learner themselves per cdc_placements_read policy).
  let placements: CdcPlacementRow[] = [];

  try {
    const supabase = await createClient();
    const result = await CdcPlacementService.listPlacements(supabase, {
      learner_id: learnerId,
      pageSize: 10,
    });
    placements = result.data;
  } catch (error) {
    console.error('[PlacementCard] Failed to load placements:', error);
    // Fail silent: profile page should not break if CDC is unavailable.
    return null;
  }

  // Render nothing when learner has no placements (the card is opt-in by data).
  if (placements.length === 0) {
    return null;
  }

  // Prefer the most relevant offer first: accepted > offered > others (by offered_at desc).
  const sortedPlacements = [...placements].sort((a, b) => {
    const rank = (s: CdcPlacementRow['status']) =>
      s === 'accepted' ? 0 : s === 'offered' ? 1 : 2;
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return (b.offered_at ?? '').localeCompare(a.offered_at ?? '');
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Placements
            </CardTitle>
            <CardDescription>
              {placements.length === 1
                ? '1 placement offer on record'
                : `${placements.length} placement offers on record`}
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/cdc/placements">
              View all
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedPlacements.map((p) => {
          const companyName = p.recruiter_name ?? 'Unknown company';
          const role = p.job_role ?? 'Role not recorded';
          const packageStr = formatPackage(p.package_lpa);
          const offerTypeLabel = p.offer_type_label;
          const offeredDate = formatDate(p.offered_at);
          const acceptedDate = formatDate(p.accepted_at);
          const joiningDate = formatDate(p.joining_date);
          const statusColor = CDC_PLACEMENT_STATUS_COLORS[p.status];
          const statusLabel = CDC_PLACEMENT_STATUS_LABELS[p.status];

          return (
            <Link
              key={p.id}
              href={`/cdc/placements/${p.id}`}
              className="block rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold">{companyName}</h4>
                    <Badge className={statusColor}>{statusLabel}</Badge>
                    {offerTypeLabel ? (
                      <Badge variant="outline">{offerTypeLabel}</Badge>
                    ) : null}
                    {p.is_walk_in ? (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                        Walk-in
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{role}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {packageStr ? (
                      <span className="inline-flex items-center gap-1">
                        <IndianRupee className="h-3.5 w-3.5" />
                        {packageStr}
                      </span>
                    ) : null}
                    {p.job_location || p.is_remote ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {p.is_remote ? 'Remote' : p.job_location}
                      </span>
                    ) : null}
                    {(acceptedDate ?? offeredDate) ? (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {acceptedDate
                          ? `Accepted ${acceptedDate}`
                          : `Offered ${offeredDate}`}
                      </span>
                    ) : null}
                    {joiningDate ? (
                      <span className="text-xs">Joining {joiningDate}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
