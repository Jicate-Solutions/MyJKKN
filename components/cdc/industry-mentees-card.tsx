'use client';

// components/cdc/industry-mentees-card.tsx — industry mentor → learner assignment
// (BUG-004198). Each industry mentor gets a FIXED assigned student list; sessions
// are logged per assigned mentee. Assignment is gated by cdc.industry_mentors.edit.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useLearnersForPicker } from '@/hooks/cdc/use-cdc-pickers';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useIndustryMentees, useAssignIndustryMentee, useUnassignIndustryMentee,
} from '@/hooks/cdc/use-cdc-mentor-sessions';
import { MentorSessionsCard } from './mentor-sessions-card';
import { UserPlus, Loader2, ChevronDown, ChevronRight, X, Users2 } from 'lucide-react';
import type { IndustryMentorPairing } from '@/types/cdc/mentor-sessions';

function menteeName(p: IndustryMentorPairing): string {
  const n = [p.mentee?.first_name, p.mentee?.last_name].filter(Boolean).join(' ').trim();
  return n || 'Unknown learner';
}

export function IndustryMenteesCard({ mentorId }: { mentorId: string }) {
  const { can } = usePermissions();
  const canEdit = can('cdc.industry_mentors.edit');
  const { data: learnerOptions = [], isLoading: learnersLoading } = useLearnersForPicker();
  const { data: pairings = [], isLoading } = useIndustryMentees(mentorId);
  const assign = useAssignIndustryMentee(mentorId);
  const unassign = useUnassignIndustryMentee(mentorId);

  const [learnerId, setLearnerId] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function handleAssign() {
    if (!learnerId) return;
    await assign.mutateAsync(learnerId);
    setLearnerId('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users2 className="w-4 h-4" /> Assigned Mentees {!isLoading && `(${pairings.length})`}
        </CardTitle>
        <CardDescription>The fixed list of learners this industry mentor mentors. Log sessions per mentee.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <div className="space-y-1.5">
            <Label>Assign a learner</Label>
            <div className="flex items-center gap-2">
              <SearchableSelect
                value={learnerId}
                onValueChange={setLearnerId}
                options={learnerOptions}
                placeholder="Search by name or register number…"
                searchPlaceholder="Type to search learners…"
                emptyMessage="No matching learners"
                loading={learnersLoading}
                className="flex-1"
              />
              <Button disabled={!learnerId || assign.isPending} onClick={handleAssign}>
                {assign.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />} Assign
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-xs text-muted-foreground"><Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Loading…</p>
        ) : pairings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No learners assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {pairings.map((p) => {
              const isOpen = expanded === p.id;
              const concluded = p.status === 'concluded';
              return (
                <div key={p.id} className="border rounded-md">
                  <div className="flex items-center justify-between px-3 py-2">
                    <button className="flex items-center gap-2 text-left" onClick={() => setExpanded(isOpen ? null : p.id)}>
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <div>
                        <span className="font-medium text-sm">{menteeName(p)}</span>
                        {p.mentee?.register_number && <span className="text-xs text-muted-foreground"> · {p.mentee.register_number}</span>}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{p.rollup?.session_count ?? 0} sessions</Badge>
                      {concluded && <Badge variant="outline" className="text-xs text-slate-500">concluded</Badge>}
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Unassign"
                          disabled={unassign.isPending} onClick={() => unassign.mutate(p.id)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3">
                      <MentorSessionsCard kind="industry" pairingId={p.id} canLog={canEdit && !concluded} title={`Sessions with ${menteeName(p)}`} compact />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
