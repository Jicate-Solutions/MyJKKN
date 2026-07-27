'use client';

// app/(routes)/meetings/workflows/[id]/page.tsx
//
// Meeting Workflows — builder (Module 4). Edit one workflow: its name, trigger,
// timing (offset for before/after), active state, and an ORDERED list of
// actions (each = one message on email or WhatsApp with a placeholder-aware
// template). Save persists settings + the full action list atomically.
//
// Client component (PermissionGuard is client-side). All mutations go through
// the 'use server' actions in ../actions.ts; RLS scopes to the host.
// Placeholders supported in templates: {{attendee_name}}, {{start_time}},
// {{host_name}}, {{cancel_url}}.

import { use, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  GripVertical,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { deleteWorkflowAction, getWorkflowAction, saveWorkflowAction } from '../actions';
import {
  type ActionInput,
  type WorkflowChannel,
  type WorkflowTrigger,
} from '@/lib/services/meetings/meeting-workflow-service';

const TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  on_booked: 'When the meeting is booked',
  before_meeting: 'Before the meeting starts',
  after_meeting: 'After the meeting ends',
  on_cancelled: 'When the meeting is cancelled',
  on_rescheduled: 'When the meeting is rescheduled',
};

const PLACEHOLDERS = ['{{attendee_name}}', '{{start_time}}', '{{host_name}}', '{{cancel_url}}'];

interface DraftAction extends ActionInput {
  key: string; // stable client key
}

function isTimed(t: WorkflowTrigger): boolean {
  return t === 'before_meeting' || t === 'after_meeting';
}

function BuilderContent({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<WorkflowTrigger>('before_meeting');
  const [offsetMinutes, setOffsetMinutes] = useState(60);
  const [isActive, setIsActive] = useState(true);
  const [actions, setActions] = useState<DraftAction[]>([]);

  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await getWorkflowAction(id);
      if (res.success && res.data) {
        const w = res.data;
        setName(w.name);
        setTrigger(w.trigger);
        setOffsetMinutes(w.offset_minutes);
        setIsActive(w.is_active);
        setActions(
          w.actions.map((a, i) => ({
            key: a.id ?? `existing-${i}`,
            order_index: a.order_index,
            channel: a.channel,
            subject: a.subject ?? '',
            body_template: a.body_template,
          }))
        );
        setLoadError(null);
      } else {
        setLoadError(res.error ?? 'Could not load this workflow.');
      }
      setLoading(false);
    })();
  }, [id]);

  function addAction(channel: WorkflowChannel) {
    setActions((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        order_index: prev.length,
        channel,
        subject: channel === 'email' ? '' : null,
        body_template: '',
      },
    ]);
  }

  function updateAction(key: string, patch: Partial<DraftAction>) {
    setActions((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  function removeAction(key: string) {
    setActions((prev) => prev.filter((a) => a.key !== key));
  }

  function moveAction(key: string, dir: -1 | 1) {
    setActions((prev) => {
      const idx = prev.findIndex((a) => a.key === key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error('Give your workflow a name.');
      return;
    }
    for (const a of actions) {
      if (!a.body_template.trim()) {
        toast.error('Every message needs a body. Fill it in or remove the message.');
        return;
      }
    }
    startSaving(async () => {
      const payloadActions: ActionInput[] = actions.map((a, i) => ({
        order_index: i,
        channel: a.channel,
        subject: a.channel === 'email' ? a.subject ?? '' : null,
        body_template: a.body_template,
      }));
      const res = await saveWorkflowAction(
        id,
        {
          name: name.trim(),
          trigger,
          offset_minutes: isTimed(trigger) ? offsetMinutes : 0,
          is_active: isActive,
        },
        payloadActions
      );
      if (res.success) {
        toast.success('Workflow saved.');
        router.push('/meetings/workflows');
      } else {
        toast.error(res.error ?? 'Could not save the workflow.');
      }
    });
  }

  function handleDelete() {
    if (!confirm('Delete this workflow? Scheduled reminders that have not been sent will stop.')) {
      return;
    }
    startDeleting(async () => {
      const res = await deleteWorkflowAction(id);
      if (res.success) {
        toast.success('Workflow deleted.');
        router.push('/meetings/workflows');
      } else {
        toast.error(res.error ?? 'Could not delete the workflow.');
      }
    });
  }

  if (loading) {
    return (
      <ContentLayout title="Edit workflow">
        <Card className="mt-6">
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (loadError) {
    return (
      <ContentLayout title="Edit workflow">
        <Card className="mt-6 border-destructive/40">
          <CardContent className="space-y-3 py-10 text-center">
            <h3 className="text-sm font-medium">Could not load this workflow</h3>
            <p className="mx-auto max-w-md text-xs text-muted-foreground">{loadError}</p>
            <Link href="/meetings/workflows" className="inline-flex">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to workflows
              </Button>
            </Link>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Edit workflow">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Workflows', href: '/meetings/workflows' },
          { label: 'Edit' },
        ]}
      />

      <div className="mt-4 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            title="Edit workflow"
            description="Choose when this runs and the messages it sends. Use the placeholders to personalise each message."
          />
          <Button variant="ghost" size="sm" className="shrink-0" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-4 w-4" />
            )}
            Delete
          </Button>
        </div>

        {/* Settings */}
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trigger">When it runs</Label>
                <Select value={trigger} onValueChange={(v) => setTrigger(v as WorkflowTrigger)}>
                  <SelectTrigger id="trigger">
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
            </div>

            {isTimed(trigger) && (
              <div className="space-y-1.5">
                <Label htmlFor="offset">
                  How many minutes {trigger === 'before_meeting' ? 'before the start' : 'after the end'}?
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="offset"
                    type="number"
                    min={0}
                    className="w-32"
                    value={offsetMinutes}
                    onChange={(e) => setOffsetMinutes(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  />
                  <span className="text-xs text-muted-foreground">
                    e.g. 60 = 1 hour, 1440 = 1 day
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  When off, no new reminders are scheduled.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Messages</h3>
              <p className="text-xs text-muted-foreground">
                Sent in order when the workflow runs. Placeholders:{' '}
                <code className="text-[11px]">{PLACEHOLDERS.join(' ')}</code>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => addAction('email')}>
                <Mail className="mr-1.5 h-4 w-4" /> Email
              </Button>
              <Button variant="outline" size="sm" onClick={() => addAction('whatsapp')}>
                <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
              </Button>
            </div>
          </div>

          {actions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-xs text-muted-foreground">
                No messages yet. Add an email or WhatsApp message above.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {actions.map((a, i) => (
                <Card key={a.key}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {a.channel === 'email' ? (
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                        {a.channel === 'email' ? 'Email' : 'WhatsApp'} · step {i + 1}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={i === 0}
                          onClick={() => moveAction(a.key, -1)}
                          aria-label="Move up"
                        >
                          <GripVertical className="h-4 w-4 rotate-90" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={i === actions.length - 1}
                          onClick={() => moveAction(a.key, 1)}
                          aria-label="Move down"
                        >
                          <GripVertical className="h-4 w-4 -rotate-90" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeAction(a.key)}
                          aria-label="Remove message"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {a.channel === 'email' && (
                      <div className="space-y-1.5">
                        <Label htmlFor={`subject-${a.key}`}>Subject</Label>
                        <Input
                          id={`subject-${a.key}`}
                          value={a.subject ?? ''}
                          onChange={(e) => updateAction(a.key, { subject: e.target.value })}
                          placeholder="e.g. Reminder: your meeting with {{host_name}}"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor={`body-${a.key}`}>Message</Label>
                      <Textarea
                        id={`body-${a.key}`}
                        rows={4}
                        value={a.body_template}
                        onChange={(e) => updateAction(a.key, { body_template: e.target.value })}
                        placeholder={
                          'Hi {{attendee_name}}, this is a reminder about your meeting on {{start_time}} with {{host_name}}.'
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div className="flex justify-between">
          <Link href="/meetings/workflows" className="inline-flex">
            <Button variant="ghost">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          </Link>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save workflow
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}

export default function MeetingWorkflowBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <PermissionGuard
      module="meetings"
      action="workflows.view"
      fallback={
        <ContentLayout title="Edit workflow">
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
      <BuilderContent id={id} />
    </PermissionGuard>
  );
}
