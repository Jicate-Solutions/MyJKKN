'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { PipelineStage } from '@/lib/services/admission/counselor-daily-view-service';

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  not_reachable: 'Not Reachable',
  interested: 'Interested',
  follow_up_scheduled: 'Follow-up Set',
  engaged: 'Engaged',
  qualified: 'Qualified',
  application_started: 'App Started',
  application_submitted: 'App Submitted',
  documents_pending: 'Docs Pending',
  documents_verified: 'Docs Verified',
  interview_scheduled: 'Interview Set',
  interview_completed: 'Interview Done',
  offer_sent: 'Offer Sent',
  offer_accepted: 'Offer Accepted',
  token_paid: 'Token Paid',
  applied: 'Applied',
  interviewed: 'Interviewed',
  offered: 'Offered',
  enrolled: 'Enrolled',
  lost: 'Lost',
  dormant: 'Dormant',
};

const STAGE_ORDER = [
  'new', 'contacted', 'not_reachable', 'interested', 'follow_up_scheduled',
  'engaged', 'qualified', 'application_started', 'application_submitted',
  'documents_pending', 'documents_verified', 'interview_scheduled',
  'interview_completed', 'offer_sent', 'offer_accepted', 'token_paid',
  'applied', 'interviewed', 'offered', 'enrolled', 'lost', 'dormant',
];

const STAGE_COLORS: Record<string, string> = {
  new: 'bg-gray-200 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  not_reachable: 'bg-red-100 text-red-700',
  interested: 'bg-green-100 text-green-700',
  follow_up_scheduled: 'bg-sky-100 text-sky-700',
  engaged: 'bg-cyan-100 text-cyan-700',
  qualified: 'bg-cyan-100 text-cyan-700',
  application_started: 'bg-indigo-100 text-indigo-700',
  application_submitted: 'bg-violet-100 text-violet-700',
  documents_pending: 'bg-amber-100 text-amber-700',
  documents_verified: 'bg-teal-100 text-teal-700',
  interview_scheduled: 'bg-pink-100 text-pink-700',
  interview_completed: 'bg-rose-100 text-rose-700',
  offer_sent: 'bg-orange-100 text-orange-700',
  offer_accepted: 'bg-lime-100 text-lime-700',
  token_paid: 'bg-emerald-100 text-emerald-700',
  applied: 'bg-violet-100 text-violet-700',
  interviewed: 'bg-rose-100 text-rose-700',
  offered: 'bg-orange-100 text-orange-700',
  enrolled: 'bg-green-200 text-green-800',
  lost: 'bg-red-200 text-red-800',
  dormant: 'bg-gray-300 text-gray-700',
};

interface MiniPipelineProps {
  pipeline: PipelineStage[];
  isLoading?: boolean;
}

export function MiniPipeline({ pipeline, isLoading }: MiniPipelineProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse">
            <div className="h-4 w-24 bg-muted rounded mb-3" />
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 w-20 bg-muted rounded flex-shrink-0" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build a map for quick lookup
  const pipelineMap = new Map<string, number>();
  for (const p of pipeline) {
    pipelineMap.set(p.stage, p.count);
  }

  // Only show stages that have leads
  const activeStages = STAGE_ORDER.filter((s) => pipelineMap.has(s));
  const totalLeads = pipeline.reduce((sum, p) => sum + p.count, 0);

  if (activeStages.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Pipeline</h3>
          <span className="text-xs text-muted-foreground">{totalLeads} total</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {activeStages.map((stage) => {
            const count = pipelineMap.get(stage) || 0;
            const colorClass = STAGE_COLORS[stage] || 'bg-gray-100 text-gray-600';

            return (
              <div
                key={stage}
                className={`flex flex-col items-center justify-center px-2.5 py-2 rounded-md flex-shrink-0 min-w-[60px] ${colorClass}`}
              >
                <span className="text-lg font-bold leading-none">{count}</span>
                <span className="text-[9px] mt-0.5 text-center leading-tight whitespace-nowrap">
                  {STAGE_LABELS[stage] || stage}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
