'use client';

import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipboardCheck } from 'lucide-react';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { EventChecklistService } from '@/lib/services/startup-studio/event-checklist-service';
import type { EventChecklist, ChecklistPhase } from '@/types/startup-studio';

const PHASE_LABELS: Record<ChecklistPhase, string> = {
  pre_event: 'Pre-Event',
  on_day: 'On Day',
  post_event: 'Post-Event',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  mentor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  team: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export default function ChecklistsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event } = useEvent(id);
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: checklists = [], isLoading } = useQuery({
    queryKey: ['event-checklists', id],
    queryFn: () => EventChecklistService.getChecklists(id),
    enabled: !!id,
    staleTime: 15 * 1000,
  });

  const completeItem = useMutation({
    mutationFn: (checklistItemId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventChecklistService.completeItem(checklistItemId, profile.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-checklists'] });
      toast.success('Item completed');
    },
    onError: () => toast.error('Failed to complete item'),
  });

  const uncompleteItem = useMutation({
    mutationFn: (completionId: string) =>
      EventChecklistService.uncompleteItem(completionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-checklists'] });
      toast.success('Item unchecked');
    },
    onError: () => toast.error('Failed to uncomplete item'),
  });

  const groupedByPhase = checklists.reduce<Record<ChecklistPhase, EventChecklist[]>>(
    (acc, checklist) => {
      const phase = checklist.phase;
      if (!acc[phase]) acc[phase] = [];
      acc[phase].push(checklist);
      return acc;
    },
    {} as Record<ChecklistPhase, EventChecklist[]>
  );

  const phases: ChecklistPhase[] = ['pre_event', 'on_day', 'post_event'];

  return (
    <ContentLayout>
      <PageBreadcrumb items={[
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
        { label: 'Checklists' },
      ]} />

      <div className="space-y-6 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6" />
          Event Checklists
        </h2>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading checklists...</div>
        ) : checklists.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No checklists configured for this event.
            </CardContent>
          </Card>
        ) : (
          phases.map((phase) => {
            const phaseChecklists = groupedByPhase[phase];
            if (!phaseChecklists?.length) return null;

            return (
              <div key={phase} className="space-y-3">
                <h3 className="text-lg font-semibold text-muted-foreground">
                  {PHASE_LABELS[phase]}
                </h3>
                {phaseChecklists.map((checklist) => (
                  <Card key={checklist.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>{checklist.title}</span>
                        <Badge className={ROLE_COLORS[checklist.target_role] || ''}>
                          {checklist.target_role}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(checklist.items || []).map((item) => {
                          const isCompleted = !!item.completion;
                          return (
                            <div key={item.id} className="flex items-start gap-3">
                              <Checkbox
                                checked={isCompleted}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    completeItem.mutate(item.id);
                                  } else if (item.completion) {
                                    uncompleteItem.mutate(item.completion.id);
                                  }
                                }}
                              />
                              <div className="flex-1">
                                <span className={isCompleted ? 'line-through text-muted-foreground' : ''}>
                                  {item.title}
                                  {item.is_required && <span className="text-red-500 ml-1">*</span>}
                                </span>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })
        )}
      </div>
    </ContentLayout>
  );
}
