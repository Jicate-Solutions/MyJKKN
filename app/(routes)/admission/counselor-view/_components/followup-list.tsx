'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FollowupCard } from './followup-card';
import type { FollowupLead } from '@/lib/services/admission/counselor-daily-view-service';

type SortMode = 'urgency' | 'name' | 'score';

const URGENCY_ORDER: Record<string, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
};

interface FollowupListProps {
  leads: FollowupLead[];
  onCall: (leadId: string) => void;
  onAdvanceStage: (leadId: string, newStage: string) => void;
  onReschedule: (leadId: string, newDate: string) => void;
  onAddNote: (leadId: string, note: string) => void;
  isActioning?: boolean;
}

export function FollowupList({
  leads,
  onCall,
  onAdvanceStage,
  onReschedule,
  onAddNote,
  isActioning,
}: FollowupListProps) {
  const [sortMode, setSortMode] = useState<SortMode>('urgency');

  const sortedLeads = [...leads].sort((a, b) => {
    switch (sortMode) {
      case 'urgency':
        return (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2);
      case 'name':
        return a.full_name.localeCompare(b.full_name);
      case 'score':
        return (b.score ?? 0) - (a.score ?? 0);
      default:
        return 0;
    }
  });

  if (leads.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No follow-ups scheduled.</p>
        <p className="text-xs mt-1">Great job staying on top of things!</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">
          Follow-ups ({leads.length})
        </h3>
        <div className="flex items-center gap-1">
          {(['urgency', 'name', 'score'] as SortMode[]).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={sortMode === mode ? 'default' : 'ghost'}
              className="h-6 text-[10px] px-2"
              onClick={() => setSortMode(mode)}
            >
              {mode === 'urgency' ? 'Urgent' : mode === 'name' ? 'A-Z' : 'Score'}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {sortedLeads.map((lead) => (
          <FollowupCard
            key={lead.id}
            lead={lead}
            onCall={onCall}
            onAdvanceStage={onAdvanceStage}
            onReschedule={onReschedule}
            onAddNote={onAddNote}
            isActioning={isActioning}
          />
        ))}
      </div>
    </div>
  );
}
