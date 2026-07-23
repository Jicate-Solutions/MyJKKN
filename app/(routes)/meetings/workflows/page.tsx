'use client';

// app/(routes)/meetings/workflows/page.tsx
//
// Meeting Workflows — list page (Module 4, Calendly Workflows parity). Lists
// the signed-in host's automation workflows with their trigger, timing, active
// state and action count; lets the host create a new workflow or open one in
// the builder.
//
// Client component because PermissionGuard (usePermissions) is client-side;
// data is fetched through the 'use server' actions in ./actions.ts. RLS scopes
// everything to the host. Gate: <PermissionGuard module="meetings"
// action="workflows.view"> — keyed guard, correct once the meetings.workflows.*
// keys are added to the permission catalog (see NAV-WIRING-workflows.md).

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Calendar, Clock, Inbox, Loader2, Plus, Workflow as WorkflowIcon } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  createWorkflowAction,
  listWorkflowsAction,
} from './actions';
import {
  type MeetingWorkflowWithActions,
  type WorkflowTrigger,
} from '@/lib/services/meetings/meeting-workflow-service';

const TABS = [
  { key: 'availability', label: 'Availability', href: '/meetings/availability', icon: Clock },
  { key: 'inbox', label: 'Inbox', href: '/meetings/inbox', icon: Inbox },
  { key: 'manage', label: 'Manage', href: '/meetings/manage', icon: Calendar },
  { key: 'workflows', label: 'Workflows', href: '/meetings/workflows', icon: WorkflowIcon },
] as const;

const TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  on_booked: 'When booked',
  before_meeting: 'Before the meeting',
  after_meeting: 'After the meeting',
  on_cancelled: 'When cancelled',
  on_rescheduled: 'When rescheduled',
};

function describeTiming(w: MeetingWorkflowWithActions): string {
  if (w.trigger === 'before_meeting') return `${w.offset_minutes} min before start`;
  if (w.trigger === 'after_meeting') return `${w.offset_minutes} min after end`;
  return 'Immediately';
}

function WorkflowsContent() {
  const [workflows, setWorkflows] = useState<MeetingWorkflowWithActions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState<WorkflowTrigger>('before_meeting');
  const [isPending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const res = await listWorkflowsAction();
    if (res.success) {
      setWorkflows(res.data ?? []);
      setError(null);
    } else {
      setError(res.error ?? 'Could not load workflows.');
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function handleCreate() {
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError('Give your workflow a name.');
      return;
    }
    startTransition(async () => {
      const res = await createWorkflowAction({
        name: newName.trim(),
        trigger: newTrigger,
        offset_minutes: newTrigger === 'before_meeting' || newTrigger === 'after_meeting' ? 60 : 0,
        is_active: true,
      });
      if (res.success) {
        setCreateOpen(false);
        setNewName('');
        setNewTrigger('before_meeting');
        await refresh();
      } else {
        setCreateError(res.error ?? 'Could not create workflow.');
      }
    });
  }

  return (
    <ContentLayout title="Meeting Workflows">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Workflows' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <PageHeader
          title="Workflows"
          description="Send automatic reminders and follow-ups around your meetings — a reminder a day before, a thank-you after, a notice when something is cancelled."
        />

        {/* Section tab bar */}
        <nav aria-label="Meetings sections" className="flex flex-wrap gap-1 border-b border-border">
          {TABS.map((tab) => {
            const active = tab.key === 'workflows';
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex justify-end">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> New workflow
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New workflow</DialogTitle>
                <DialogDescription>
                  Pick a name and when it should run. You can add the messages on the next screen.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wf-name">Name</Label>
                  <Input
                    id="wf-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Day-before reminder"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wf-trigger">When it runs</Label>
                  <Select
                    value={newTrigger}
                    onValueChange={(v) => setNewTrigger(v as WorkflowTrigger)}
                  >
                    <SelectTrigger id="wf-trigger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TRIGGER_LABELS) as WorkflowTrigger[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TRIGGER_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {createError && <p className="text-sm text-destructive">{createError}</p>}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isPending}>
                  {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading workflows…
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="space-y-3 py-10 text-center">
              <h3 className="text-sm font-medium">Could not load your workflows</h3>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={refresh}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : workflows.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 py-12 text-center">
              <WorkflowIcon className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
              <div>
                <h3 className="text-sm font-medium">No workflows yet</h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  Create a workflow to automatically remind attendees before a meeting or follow up
                  after it.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {workflows.map((w) => (
              <Link key={w.id} href={`/meetings/workflows/${w.id}`} className="block">
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{w.name}</h3>
                        {w.is_active ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Paused
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {TRIGGER_LABELS[w.trigger]} · {describeTiming(w)} ·{' '}
                        {w.actions.length} {w.actions.length === 1 ? 'message' : 'messages'}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}

export default function MeetingWorkflowsPage() {
  return (
    <PermissionGuard
      module="meetings"
      action="workflows.view"
      fallback={
        <ContentLayout title="Meeting Workflows">
          <Card className="mt-6 border-destructive/40">
            <CardContent className="space-y-2 py-12 text-center">
              <h3 className="text-sm font-medium">You don&apos;t have access to Meeting Workflows</h3>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
                Ask a platform administrator to grant you the{' '}
                <code className="rounded bg-muted px-1">meetings.workflows.view</code> permission.
              </p>
            </CardContent>
          </Card>
        </ContentLayout>
      }
    >
      <WorkflowsContent />
    </PermissionGuard>
  );
}
