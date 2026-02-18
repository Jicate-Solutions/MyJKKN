'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, MessageSquare, ClipboardList, Award } from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

const plannedFeatures = [
  'Group discussion session scheduling and management',
  'Personal interview slot booking and panel assignment',
  'Digital evaluation rubrics with weighted scoring',
  'GD topic bank with difficulty categorization',
  'Evaluator panel management and workload tracking',
  'Real-time scoring during live sessions',
  'Candidate recommendation workflow (accept/reject/waitlist)',
  'GD-PI analytics with score distribution reports',
];

function GDPIComingSoon() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-lg w-full text-center p-8">
          <CardHeader className="pb-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              <Users className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">GD-PI Planning</CardTitle>
            <CardDescription className="text-base">
              <Badge variant="outline" className="mt-2 text-sm font-normal">
                Coming Soon
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Comprehensive group discussion and personal interview management with
              digital evaluation, scoring rubrics, and panel coordination.
            </p>

            <div className="text-left space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Planned Features
              </h3>
              <ul className="space-y-2">
                {plannedFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-center gap-6 pt-4 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> GD sessions</span>
              <span className="flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> Evaluation</span>
              <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5" /> Scoring</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function GDPIPage() {
  return (
    <AdmissionErrorBoundary>
      <GDPIComingSoon />
    </AdmissionErrorBoundary>
  );
}

/*
 * ============================================================================
 * LEGACY CODE - Previous mock implementation (kept for future reference)
 * ============================================================================
 *
 * This page previously contained a full implementation with:
 * - Real DB hooks: useInterviewSlots, useInterviewBookings, useCreateInterviewSlot,
 *   useUpdateInterviewBooking from hooks/admission/use-interviews
 * - GDSession/PISession/Evaluator/GDTopic TypeScript interfaces
 * - SAMPLE_EVALUATORS: 4 evaluators (Dr. Senthil Kumar, Prof. Lakshmi Priya, etc.)
 * - SAMPLE_TOPICS: 6 GD topics with difficulty levels
 * - GD_CRITERIA & PI_CRITERIA: Weighted evaluation rubrics
 * - Tabs: Group Discussions, Personal Interviews, Topic Bank, Evaluators
 * - Dialogs: Create Session, GD Evaluation Sheet with slider-based scoring
 * - Features: Session list with details panel, PI table view, topic cards, evaluator cards
 * - Real data transformation: DB slots/bookings -> GDSession[]/PISession[] via useMemo
 *
 * To restore: check git history for this file before the "Coming Soon" conversion.
 */
