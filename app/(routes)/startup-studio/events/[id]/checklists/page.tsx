'use client';

import { use, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { EventChecklistService } from '@/lib/services/startup-studio/event-checklist-service';
import type { ChecklistPhase, EventChecklist, EventChecklistItem } from '@/types/startup-studio';
import { Loader2 } from 'lucide-react';

const PHASE_LABELS: Record<ChecklistPhase, string> = {
  pre_event: 'Pre-Event',
  on_day: 'On Day',
  post_event: 'Post-Event',
};

const PHASE_ORDER: ChecklistPhase[] = ['pre_event', 'on_day', 'post_event'];

function groupByPhase(checklists: EventChecklist[]): Record<ChecklistPhase, EventChecklist[]> {
  const grouped: Record<ChecklistPhase, EventChecklist[]> = {
    pre_event: [],
    on_day: [],
    post_event: [],
  };
  for (const cl of checklists) {
    if (grouped[cl.phase]) {
      grouped[cl.phase].push(cl);
    }
  }
  return grouped;
}

export default function ChecklistsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event } = useEvent(id);
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: checklists, isLoading } = useQuery({
    queryKey: ['startup-event-checklists', id],
    queryFn: () => EventChecklistService.getChecklists(id),
    staleTime: 15 * 1000,
  });

  const handleToggle = useCallback(
    async (item: EventChecklistItem, checked: boolean) => {
      if (!profile?.id) return;
      try {
        if (checked) {
          await EventChecklistService.completeItem(item.id, profile.id);
        } else if (item.completion && Array.isArray(item.completion) && item.completion.length > 0) {
          await EventChecklistService.uncompleteItem(item.completion[0].id);
        } else if (item.completion && !Array.isArray(item.completion) && item.completion.id) {
          await EventChecklistService.uncompleteItem(item.completion.id);
        }
        queryClient.invalidateQueries({ queryKey: ['startup-event-checklists', id] });
      } catch (error) {
        console.error('[startup/checklists] handleToggle failed:', error);
      }
    },
    [id, profile?.id, queryClient]
  );

  const eventName = event?.name || 'Event';
  const grouped = checklists ? groupByPhase(checklists) : null;

  function isCompleted(item: EventChecklistItem): boolean {
    if (!item.completion) return false;
    if (Array.isArray(item.completion)) return item.completion.length > 0;
    return !!item.completion.id;
  }

  return (
    <ContentLayout title="Checklists">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: eventName, href: `/startup-studio/events/${id}` },
          { label: 'Checklists' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!isLoading && (!checklists || checklists.length === 0) && (
          <div className="text-center py-20 text-muted-foreground">
            No checklists configured for this event.
          </div>
        )}

        {grouped &&
          PHASE_ORDER.map((phase) => {
            const phaseChecklists = grouped[phase];
            if (phaseChecklists.length === 0) return null;

            return (
              <div key={phase} className="space-y-4">
                <h2 className="text-lg font-semibold">{PHASE_LABELS[phase]}</h2>
                {phaseChecklists.map((checklist) => (
                  <Card key={checklist.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{checklist.title}</CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {checklist.target_role}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {checklist.items && checklist.items.length > 0 ? (
                        checklist.items.map((item) => {
                          const completed = isCompleted(item);
                          return (
                            <div key={item.id} className="flex items-start gap-3">
                              <Checkbox
                                checked={completed}
                                onCheckedChange={(checked) =>
                                  handleToggle(item, checked === true)
                                }
                              />
                              <div className="space-y-0.5">
                                <label
                                  className={`text-sm font-medium leading-none ${
                                    completed ? 'line-through text-muted-foreground' : ''
                                  }`}
                                >
                                  {item.title}
                                  {item.is_required && (
                                    <span className="text-destructive ml-1">*</span>
                                  )}
                                </label>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground">No items in this checklist.</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}
      </div>
    </ContentLayout>
  );
}
