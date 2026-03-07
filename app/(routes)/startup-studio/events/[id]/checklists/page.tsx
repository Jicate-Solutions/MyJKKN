'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Clock, Hammer, ListChecks, ListTodo, Loader2, Presentation, Plus, Trash2,
} from 'lucide-react';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { EventChecklistService } from '@/lib/services/startup-studio/event-checklist-service';
import { cn } from '@/lib/utils';
import type { EventChecklist, ChecklistPhase } from '@/types/startup-studio';

const PHASES: { value: ChecklistPhase; label: string; icon: React.ReactNode }[] = [
  { value: 'pre_event', label: 'Pre-Event', icon: <Clock className="h-4 w-4" /> },
  { value: 'build_day', label: 'Build Day', icon: <Hammer className="h-4 w-4" /> },
  { value: 'demo_day', label: 'Demo Day', icon: <Presentation className="h-4 w-4" /> },
  { value: 'post_event', label: 'Post-Event', icon: <ListTodo className="h-4 w-4" /> },
];

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function ChecklistsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: event } = useEvent(id);
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = profile?.is_super_admin || profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator';

  const [activePhase, setActivePhase] = useState<ChecklistPhase>('pre_event');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPhase, setNewItemPhase] = useState<ChecklistPhase>('pre_event');

  const { data: checklists = [], isLoading } = useQuery({
    queryKey: ['event-checklists', id],
    queryFn: () => EventChecklistService.getChecklists(id),
    enabled: !!id,
    staleTime: 15 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['event-checklists', id] });

  const completeItem = useMutation({
    mutationFn: (checklistItemId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventChecklistService.completeItem(checklistItemId, profile.id);
    },
    onSuccess: () => { invalidate(); toast.success('Item completed'); },
    onError: () => toast.error('Failed to complete item'),
  });

  const uncompleteItem = useMutation({
    mutationFn: (completionId: string) => EventChecklistService.uncompleteItem(completionId),
    onSuccess: () => { invalidate(); toast.success('Item unchecked'); },
    onError: () => toast.error('Failed to uncomplete item'),
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => EventChecklistService.deleteItem(itemId),
    onSuccess: () => { invalidate(); toast.success('Item removed'); },
    onError: () => toast.error('Failed to remove item'),
  });

  const addItem = useMutation({
    mutationFn: async () => {
      // Find a checklist for the selected phase, or create one
      let checklist = checklists.find((cl) => cl.phase === newItemPhase);
      if (!checklist) {
        checklist = await EventChecklistService.createChecklist(id, {
          title: `${PHASES.find((p) => p.value === newItemPhase)?.label} Checklist`,
          phase: newItemPhase,
          target_role: 'admin',
        });
      }
      return EventChecklistService.addItem(checklist.id, { title: newItemTitle });
    },
    onSuccess: () => {
      invalidate();
      setNewItemTitle('');
      toast.success('Item added');
    },
    onError: () => toast.error('Failed to add item'),
  });

  // Flatten all items grouped by phase with counts
  const phaseCounts: Record<ChecklistPhase, { total: number; done: number }> = {
    pre_event: { total: 0, done: 0 },
    on_day: { total: 0, done: 0 },
    build_day: { total: 0, done: 0 },
    demo_day: { total: 0, done: 0 },
    post_event: { total: 0, done: 0 },
  };

  const allItemsByPhase: Record<ChecklistPhase, Array<{
    id: string; title: string; description: string | null; is_required: boolean;
    completion?: { id: string; completed_at: string } | null;
    checklistTitle: string;
  }>> = { pre_event: [], on_day: [], build_day: [], demo_day: [], post_event: [] };

  checklists.forEach((cl) => {
    const items = cl.items || [];
    items.forEach((item) => {
      // Supabase returns completion as array, extract first element
      const rawCompletion = item.completion as any;
      const comp = Array.isArray(rawCompletion) ? rawCompletion[0] : rawCompletion;

      phaseCounts[cl.phase].total++;
      if (comp) phaseCounts[cl.phase].done++;
      allItemsByPhase[cl.phase].push({
        id: item.id,
        title: item.title,
        description: item.description,
        is_required: item.is_required,
        completion: comp ? { id: comp.id, completed_at: comp.completed_at } : null,
        checklistTitle: cl.title,
      });
    });
  });

  const totalItems = Object.values(phaseCounts).reduce((s, p) => s + p.total, 0);
  const totalDone = Object.values(phaseCounts).reduce((s, p) => s + p.done, 0);
  const progressPercent = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

  const activeItems = allItemsByPhase[activePhase];
  const activeLabel = PHASES.find((p) => p.value === activePhase)?.label || '';

  return (
    <ContentLayout title="Event Checklists">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: 'Events', href: '/startup-studio/events' },
        { label: 'Checklists' },
      ]} />

      <div className="space-y-6 mt-4 pb-10">
        {/* Back */}
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => router.push(`/startup-studio/events/${id}`)}>
          <ArrowLeft className="h-4 w-4" /> Back to Event
        </Button>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Event Checklists</h1>
          <p className="text-sm text-muted-foreground">{event?.name || 'Event'}</p>
          <p className="text-sm text-muted-foreground">{totalDone}/{totalItems} completed</p>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-muted rounded-full h-2.5">
          <div
            className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Phase Tabs */}
            <div className="flex gap-2 border-b pb-0">
              {PHASES.map((phase) => {
                const counts = phaseCounts[phase.value];
                const isActive = activePhase === phase.value;
                return (
                  <button
                    key={phase.value}
                    onClick={() => setActivePhase(phase.value)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors',
                      isActive
                        ? 'bg-background text-foreground border-border -mb-px'
                        : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/70'
                    )}
                  >
                    {phase.icon}
                    {phase.label}
                    <span className={cn(
                      'text-xs',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      ({counts.done}/{counts.total})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Phase Items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {PHASES.find((p) => p.value === activePhase)?.icon}
                  {activeLabel} Checklist
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No items in this phase yet.
                  </p>
                ) : (
                  <div className="divide-y">
                    {activeItems.map((item) => {
                      const isCompleted = !!item.completion;
                      return (
                        <div key={item.id} className="flex items-start gap-3 py-3 group">
                          <Checkbox
                            checked={isCompleted}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                completeItem.mutate(item.id);
                              } else if (item.completion) {
                                uncompleteItem.mutate(item.completion.id);
                              }
                            }}
                            className={cn('mt-0.5', isCompleted && 'data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500')}
                          />
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm', isCompleted && 'text-muted-foreground line-through')}>
                              {item.title}
                              {item.is_required && <span className="text-red-500 ml-1">*</span>}
                            </p>
                            {isCompleted && item.completion?.completed_at && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatTimestamp(item.completion.completed_at)}
                              </p>
                            )}
                            {!isCompleted && item.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.description}
                              </p>
                            )}
                          </div>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => deleteItem.mutate(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add Custom Item */}
            {isAdmin && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add Custom Item
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                    <div className="flex-1 w-full space-y-1.5">
                      <label className="text-sm font-medium">Item Title</label>
                      <Input
                        placeholder="e.g., Print certificates"
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newItemTitle.trim()) addItem.mutate();
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Phase</label>
                      <div className="flex gap-1">
                        {PHASES.map((phase) => (
                          <Button
                            key={phase.value}
                            type="button"
                            variant={newItemPhase === phase.value ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setNewItemPhase(phase.value)}
                            className="text-xs"
                          >
                            {phase.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <Button
                      onClick={() => addItem.mutate()}
                      disabled={!newItemTitle.trim() || addItem.isPending}
                      className="gap-1.5 shrink-0"
                    >
                      {addItem.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
