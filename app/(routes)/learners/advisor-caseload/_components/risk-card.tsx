'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  User,
  ClipboardPlus,
} from 'lucide-react';
import type { LearnerRiskWithProfile, RiskTier } from '@/services/learner-risk-service';
import { InterventionDialog } from './intervention-dialog';

const TIER_BADGE: Record<
  RiskTier,
  { variant: 'destructive' | 'default' | 'secondary' | 'outline'; className: string }
> = {
  critical: { variant: 'destructive', className: 'bg-red-600' },
  high: { variant: 'destructive', className: 'bg-orange-500 hover:bg-orange-600' },
  moderate: { variant: 'default', className: 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500' },
  low: { variant: 'secondary', className: 'bg-blue-100 text-blue-700' },
  healthy: { variant: 'secondary', className: 'bg-green-100 text-green-700' },
};

function TrendArrow({ direction }: { direction: string | null }) {
  if (direction === 'improving')
    return <TrendingDown className="h-4 w-4 text-green-600" />;
  if (direction === 'worsening')
    return <TrendingUp className="h-4 w-4 text-red-600" />;
  return <ArrowRight className="h-4 w-4 text-gray-400" />;
}

interface RiskCardProps {
  assessment: LearnerRiskWithProfile;
}

export function RiskCard({ assessment }: RiskCardProps) {
  const [interventionOpen, setInterventionOpen] = useState(false);

  const learner = assessment.learner;
  const tierConfig = TIER_BADGE[assessment.risk_tier] ?? TIER_BADGE.moderate;

  const displayName = learner
    ? `${learner.first_name} ${learner.last_name ?? ''}`.trim()
    : 'Unknown Student';

  const rollNumber = learner?.roll_number ?? '--';

  // Show top 3 risk factors as chips
  const topFactors = (assessment.risk_factors ?? []).slice(0, 3);

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left: student info */}
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <User className="h-5 w-5 text-gray-500" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground">{rollNumber}</p>
              </div>
            </div>

            {/* Center: score + trend */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className={tierConfig.className}>
                {assessment.composite_risk_score}
              </Badge>
              <TrendArrow direction={assessment.trend_direction} />
            </div>
          </div>

          {/* Risk factor chips */}
          {topFactors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {topFactors.map((factor, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-xs font-normal"
                >
                  {factor.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/learners/${assessment.learner_id}`}>
                View Profile
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInterventionOpen(true)}
            >
              <ClipboardPlus className="h-4 w-4 mr-1" />
              Log Intervention
            </Button>
          </div>
        </CardContent>
      </Card>

      <InterventionDialog
        open={interventionOpen}
        onOpenChange={setInterventionOpen}
        learnerId={assessment.learner_id}
        learnerName={displayName}
        currentRiskScore={assessment.composite_risk_score}
      />
    </>
  );
}
