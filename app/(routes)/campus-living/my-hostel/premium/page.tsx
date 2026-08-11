// ============================================================================
// PREMIUM ROOM — LEARNER OPT-IN PAGE (Phase 2)
// ============================================================================
// Created: 2026-05-19
// Spec lineage: PR #953 Phase 1 substrate + service stubs documented the
//               opt-in flow. This is the learner-facing tier picker that
//               replaces the deferred admission-team-owned intake stub.
//
// Flow:
//   1. Learner lands here from /campus-living/my-hostel ("Upgrade to Premium")
//   2. We list the 3 tiers (standard / premium / premium_plus) from
//      hostel_tier_policy (per-institution row wins over global default).
//   3. For each premium/premium_plus tier, call fn_hostel_premium_evaluate
//      to show eligibility verdict + fee uplift % + feature bundle.
//   4. "Continue" CTA navigates to ../premium/pick-room?tier=<tierId>.
//
// Non-goals here: actual reservation (that's pick-room page), payment gateway
// (Phase 2 follow-on PR).
// ============================================================================

'use client';

export const navMeta = {
  label: 'Premium Room — Opt-in',
  icon: 'Sparkles',
  invokedFrom: '/campus-living/my-hostel',
} as const;

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useHostelTiers } from '@/hooks/campus-living/use-hostel-tier-policy';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { TierEligibilityCard } from './_components/tier-eligibility-card';
import { PremiumInviteEntryCard } from '../_components/premium-invite-entry-card';
import {
  Sparkles,
  BedDouble,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import type { HostelTierPolicy } from '@/types/campus-living/premium';

export default function PremiumOptInPage() {
  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const institutionId = profile?.institution_id ?? null;

  // Fetch tier list. Per-institution rows are seeded by admin; if none yet,
  // fall back to global defaults.
  const { data: institutionTiers, isLoading: tiersLoadingInst } =
    useHostelTiers(institutionId);
  const { data: globalTiers, isLoading: tiersLoadingGlobal } = useHostelTiers(null);

  // Prefer institution-scoped rows; if any exist, use them, else global.
  const tiers: HostelTierPolicy[] = (institutionTiers && institutionTiers.length > 0
    ? institutionTiers
    : globalTiers ?? []);

  // Existing allocation check — premium opt-in requires being a hostelite
  // OR explicitly opting in as a brand-new allocation (depends on spec; we
  // surface either flow but the eligibility RPC enforces "must be a hostelite").
  const { data: allocations, isLoading: allocLoading } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', userId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(userId, true),
    enabled: !!userId,
  });

  const activeAllocation = (allocations ?? [])[0] as any;
  const currentTierId: string | undefined = activeAllocation?.tier_id;

  const loading = tiersLoadingInst || tiersLoadingGlobal || allocLoading;

  if (loading) {
    return (
      <ContentLayout title='Premium Room — Opt-in'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  // Surface premium-and-above tiers ordered by sort_order. Standard tier shown
  // as a "current plan" reference if learner is already on standard.
  const premiumTiers = tiers.filter((t) => t.tier_key !== 'standard');
  const standardTier = tiers.find((t) => t.tier_key === 'standard');

  return (
    <ContentLayout title='Premium Room — Opt-in'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'My Hostel', href: '/campus-living/my-hostel' },
          { label: 'Premium Room' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex items-start gap-3'>
          <Sparkles className='h-7 w-7 text-amber-500 mt-1' />
          <div>
            <h1 className='text-2xl font-bold py-1'>Upgrade to Premium Room</h1>
            <p className='text-sm text-muted-foreground max-w-2xl'>
              Premium Room gives you self-pick over your block, room, bed, and
              roommate (with their consent). Premium Plus adds an extended
              curfew quota and faster maintenance response. Fee uplift is
              charged on top of your standard hostel fee.
            </p>
          </div>
        </div>

        {/* Current allocation status (info banner) */}
        {activeAllocation ? (
          <Card className='border-muted'>
            <CardContent className='p-4 flex items-center gap-3'>
              <BedDouble className='h-5 w-5 text-muted-foreground' />
              <div className='text-sm'>
                <span className='text-muted-foreground'>Current allocation: </span>
                <strong>
                  {activeAllocation?.hostel_blocks?.name ?? 'Block —'}, Room{' '}
                  {activeAllocation?.hostel_rooms?.room_number ?? '—'}, Bed{' '}
                  {activeAllocation?.hostel_beds?.bed_number ?? '—'}
                </strong>
                {currentTierId && standardTier && currentTierId === standardTier.id && (
                  <Badge className='ml-2' variant='secondary'>
                    Standard tier
                  </Badge>
                )}
                {currentTierId &&
                  premiumTiers.find((t) => t.id === currentTierId) && (
                    <Badge className='ml-2' variant='success'>
                      <CheckCircle2 className='h-3 w-3 mr-1' />
                      {premiumTiers.find((t) => t.id === currentTierId)
                        ?.tier_display_name}
                    </Badge>
                  )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className='border-amber-200 bg-amber-50/50'>
            <CardContent className='p-4 flex items-start gap-3'>
              <AlertCircle className='h-5 w-5 text-amber-600 mt-0.5' />
              <div className='text-sm'>
                <p className='font-medium text-amber-900'>
                  You don't have an active hostel allocation yet.
                </p>
                <p className='text-amber-700 mt-1'>
                  Premium Room requires an active allocation. Visit the{' '}
                  <Link
                    href='/campus-living/my-hostel'
                    className='underline underline-offset-2'
                  >
                    My Hostel page
                  </Link>{' '}
                  to confirm your hostel status, then return here to upgrade.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invite entry — a premium resident's cheapest way to cut her own bill.
            Renders nothing for anyone without a premium allocation. */}
        <PremiumInviteEntryCard />

        {/* Premium tier cards */}
        {premiumTiers.length === 0 ? (
          <Card>
            <CardContent className='p-8 text-center'>
              <AlertCircle className='h-10 w-10 mx-auto text-muted-foreground mb-2' />
              <p className='text-muted-foreground'>
                Premium tiers are not configured for your college yet. Please
                contact your hostel office.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className='grid md:grid-cols-2 gap-4'>
            {premiumTiers.map((tier) => (
              <TierEligibilityCard
                key={tier.id}
                tier={tier}
                learnerId={userId}
                isCurrent={tier.id === currentTierId}
                disabled={!activeAllocation}
              />
            ))}
          </div>
        )}

        {/* Standard tier reference */}
        {standardTier && (
          <Card className='border-dashed'>
            <CardHeader>
              <CardTitle className='text-base flex items-center gap-2'>
                <BedDouble className='h-4 w-4 text-muted-foreground' />
                {standardTier.tier_display_name} (default)
              </CardTitle>
              <CardDescription>
                Admin-driven allocation. No self-pick features. No fee uplift.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
