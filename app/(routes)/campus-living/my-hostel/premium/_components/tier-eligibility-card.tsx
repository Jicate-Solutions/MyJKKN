// ============================================================================
// PREMIUM ROOM — TierEligibilityCard
// ============================================================================
// Per-tier card showing fee uplift, feature bundle, eligibility verdict,
// and the "Continue" CTA that routes to /campus-living/my-hostel/premium/
// pick-room?tier=<id>. Eligibility verdict is fetched live via
// usePremiumEligibility (which calls fn_hostel_premium_evaluate RPC).
// ============================================================================

'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePremiumEligibility } from '@/hooks/campus-living/use-premium-allocation';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Bed,
  Building2,
  Users,
  Clock,
  Wrench,
  ArrowRight,
} from 'lucide-react';
import type { HostelTierPolicy, TierFeatureKey } from '@/types/campus-living/premium';

interface TierEligibilityCardProps {
  tier: HostelTierPolicy;
  learnerId: string;
  isCurrent: boolean;
  disabled: boolean;
}

const FEATURE_LABELS: Record<TierFeatureKey, { label: string; icon: typeof Bed }> = {
  pick_block_and_room: { label: 'Self-pick block + room', icon: Building2 },
  pick_specific_bed: { label: 'Self-pick specific bed', icon: Bed },
  pick_roommate_with_consent: { label: 'Pick roommate (with consent)', icon: Users },
  extended_curfew_quota: { label: '4 late-returns / month', icon: Clock },
  premium_maintenance_sla: { label: '4-hour maintenance SLA', icon: Wrench },
};

const ELIGIBILITY_REASON_LABELS: Record<string, string> = {
  ok: 'You are eligible',
  tier_not_found: 'Tier not found',
  tier_inactive: 'This tier is currently disabled',
  standard_tier_always_eligible: 'Default tier — always eligible',
  not_a_hostelite: 'You need an active hostel allocation first',
  outstanding_dues: 'Clear outstanding hostel dues to opt-in',
};

export function TierEligibilityCard({
  tier,
  learnerId,
  isCurrent,
  disabled,
}: TierEligibilityCardProps) {
  const {
    data: eligibility,
    isLoading: eligibilityLoading,
  } = usePremiumEligibility(disabled ? null : learnerId, disabled ? null : tier.id);

  const isEligible = eligibility?.eligible === true;
  const reason = eligibility?.reason ?? 'tier_not_found';
  const reasonLabel = ELIGIBILITY_REASON_LABELS[reason] ?? reason;

  const isPremiumPlus = tier.tier_key === 'premium_plus';

  return (
    <Card
      className={
        isCurrent
          ? 'border-emerald-300 bg-emerald-50/30'
          : isPremiumPlus
          ? 'border-amber-300'
          : ''
      }
    >
      <CardHeader>
        <div className='flex items-start justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              {isPremiumPlus && <Sparkles className='h-5 w-5 text-amber-500' />}
              {tier.tier_display_name}
              {isCurrent && (
                <Badge variant='success' className='text-[10px]'>
                  Current
                </Badge>
              )}
            </CardTitle>
            <CardDescription className='mt-1'>
              {tier.description ?? `Premium tier with ${tier.tier_features.length} extra features.`}
            </CardDescription>
          </div>
          <div className='text-right'>
            <div className='text-xl font-bold text-primary'>
              +{Number(tier.fee_uplift_percentage_default).toFixed(0)}%
            </div>
            <div className='text-[11px] text-muted-foreground'>fee uplift</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Features bundle */}
        <div>
          <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'>
            What you get
          </p>
          <ul className='space-y-1.5'>
            {tier.tier_features.map((feature) => {
              const meta = FEATURE_LABELS[feature];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <li
                  key={feature}
                  className='flex items-center gap-2 text-sm text-foreground'
                >
                  <Icon className='h-4 w-4 text-emerald-600 shrink-0' />
                  {meta.label}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Eligibility verdict */}
        <div className='rounded-md border bg-muted/30 p-3 text-sm'>
          {disabled ? (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <XCircle className='h-4 w-4' />
              Active hostel allocation required
            </div>
          ) : eligibilityLoading ? (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' />
              Checking eligibility…
            </div>
          ) : isEligible ? (
            <div className='flex items-center gap-2 text-emerald-700'>
              <CheckCircle2 className='h-4 w-4' />
              {reasonLabel}
            </div>
          ) : (
            <div className='flex items-center gap-2 text-amber-700'>
              <XCircle className='h-4 w-4' />
              {reasonLabel}
            </div>
          )}
        </div>

        {/* CTA */}
        <Button
          asChild={isEligible && !isCurrent}
          disabled={!isEligible || isCurrent || disabled}
          className='w-full'
          variant={isCurrent ? 'outline' : 'default'}
        >
          {isEligible && !isCurrent ? (
            <Link href={`/campus-living/my-hostel/premium/pick-room?tier=${tier.id}`}>
              Continue with {tier.tier_display_name}
              <ArrowRight className='ml-2 h-4 w-4' />
            </Link>
          ) : (
            <span>
              {isCurrent ? 'You are on this tier' : 'Not eligible'}
            </span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
