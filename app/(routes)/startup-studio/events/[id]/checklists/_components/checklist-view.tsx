'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  ListChecks,
  Loader2,
  Plus,
  Sparkles,
  CheckCircle2,
  Clock,
  User,
} from 'lucide-react';
import {
  useSSEvent,
  useEventChecklists,
  useToggleChecklist,
  useSeedChecklists,
} from '@/hooks/startup-studio';

interface ChecklistViewProps {
  eventId: string;
}

const PHASES = [
  { key: 'pre_event', label: 'Pre-Event', icon: Clock },
  { key: 'on_day', label: 'On-Day', icon: ListChecks },
  { key: 'post_event', label: 'Post-Event', icon: CheckCircle2 },
] as const;

export function ChecklistView({ eventId }: ChecklistViewProps) {
  const { data: eventRaw } = useSSEvent(eventId);
  const event = eventRaw as any;

  const {
    data: checklistsRaw,
    isLoading,
    error,
  } = useEventChecklists(eventId);
  const toggleChecklist = useToggleChecklist();
  const seedChecklists = useSeedChecklists();

  const [newItemText, setNewItemText] = useState('');
  const [newItemPhase, setNewItemPhase] = useState<string>('pre_event');

  // Map checklist items to include computed 'completed' from responses
  const checklists = useMemo(() => {
    const raw = (checklistsRaw as any[]) ?? [];
    return raw.map((item: any) => ({
      ...item,
      completed: (item.responses || []).some((r: any) => r.is_completed),
      completed_at: (item.responses || []).find((r: any) => r.is_completed)?.completed_at,
    }));
  }, [checklistsRaw]);

  // Group by phase
  const groupedChecklists = useMemo(() => {
    const groups: Record<string, any[]> = {
      pre_event: [],
      on_day: [],
      post_event: [],
    };
    checklists.forEach((item: any) => {
      const phase = item.phase || 'pre_event';
      if (groups[phase]) {
        groups[phase].push(item);
      } else {
        groups.pre_event.push(item);
      }
    });
    return groups;
  }, [checklists]);

  const handleToggle = async (item: any) => {
    try {
      await toggleChecklist.mutateAsync({
        eventId,
        data: {
          action: 'toggle',
          checklist_id: item.id,
          is_completed: !item.completed,
        },
      });
    } catch {
      // Error handled by React Query
    }
  };

  const handleSeed = async () => {
    try {
      await seedChecklists.mutateAsync({ eventId });
    } catch {
      // Error handled by React Query
    }
  };

  const handleAddItem = async () => {
    if (!newItemText.trim()) return;
    try {
      await toggleChecklist.mutateAsync({
        eventId,
        data: {
          action: 'add',
          title: newItemText.trim(),
          phase: newItemPhase,
        },
      });
      setNewItemText('');
    } catch {
      // Error handled by React Query
    }
  };

  const completedCount = checklists.filter((c: any) => c.completed).length;
  const totalCount = checklists.length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load checklists. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Event Checklists</h1>
          {event?.name && (
            <p className="text-sm text-muted-foreground mt-1">{event.name}</p>
          )}
          {totalCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {completedCount}/{totalCount} completed
            </p>
          )}
        </div>
        {checklists.length === 0 && (
          <Button onClick={handleSeed} disabled={seedChecklists.isPending}>
            {seedChecklists.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Seed Default Checklists
          </Button>
        )}
      </div>

      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="w-full bg-muted rounded-full h-2.5">
          <div
            className="bg-primary h-2.5 rounded-full transition-all"
            style={{
              width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
            }}
          />
        </div>
      )}

      {/* Tabbed Checklist View */}
      {totalCount > 0 ? (
        <Tabs defaultValue="pre_event">
          <TabsList className="w-full sm:w-auto">
            {PHASES.map((phase) => {
              const items = groupedChecklists[phase.key] ?? [];
              const done = items.filter((i: any) => i.completed).length;
              return (
                <TabsTrigger key={phase.key} value={phase.key} className="gap-1.5">
                  <phase.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{phase.label}</span>
                  <span className="text-xs text-muted-foreground">
                    ({done}/{items.length})
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {PHASES.map((phase) => {
            const items = groupedChecklists[phase.key] ?? [];
            return (
              <TabsContent key={phase.key} value={phase.key}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <phase.icon className="h-4 w-4" />
                      {phase.label} Checklist
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No items in this phase.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {items.map((item: any) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                          >
                            <Checkbox
                              checked={item.completed}
                              onCheckedChange={() => handleToggle(item)}
                              disabled={toggleChecklist.isPending}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium ${
                                  item.completed
                                    ? 'line-through text-muted-foreground'
                                    : ''
                                }`}
                              >
                                {item.title}
                              </p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {item.description}
                                </p>
                              )}
                              {item.completed && (item.completed_by_name || item.completed_at) && (
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  {item.completed_by_name && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {item.completed_by_name}
                                    </span>
                                  )}
                                  {item.completed_at && (
                                    <span>
                                      {new Date(item.completed_at).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <ListChecks className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Checklists Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Click &quot;Seed Default Checklists&quot; to generate standard event checklists,
              or add custom items below.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Custom Item */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" />
            Add Custom Item
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="new-item">Item Title</Label>
              <Input
                id="new-item"
                placeholder="e.g., Print certificates"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddItem();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Phase</Label>
              <div className="flex gap-2">
                {PHASES.map((phase) => (
                  <Button
                    key={phase.key}
                    variant={newItemPhase === phase.key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewItemPhase(phase.key)}
                  >
                    {phase.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAddItem}
                disabled={!newItemText.trim() || toggleChecklist.isPending}
              >
                {toggleChecklist.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
