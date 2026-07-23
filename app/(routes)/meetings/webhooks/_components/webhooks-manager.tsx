'use client';

// app/(routes)/meetings/webhooks/_components/webhooks-manager.tsx
//
// MODULE 9 — interactive manager for the host's webhook registrations + the
// delivery log. Pure client UI over the server actions in ../actions.ts.
//
// Two sections:
//   1. Webhooks — list of registrations with active toggle + delete, and a
//      "New webhook" dialog (name / URL / events). On create we surface the
//      DB-generated signing_secret ONCE so the host can copy it into their
//      receiver (it isn't shown again in plaintext after that).
//   2. Delivery log — recent POST attempts across all the host's webhooks,
//      with status + response code, so failures are visible without leaving
//      MyJKKN.

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  XCircle,
  Clock3,
  Webhook as WebhookIcon,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  WEBHOOK_EVENTS,
  type MeetingWebhook,
  type MeetingWebhookDelivery,
  type WebhookEvent,
} from '@/lib/services/meetings/meeting-webhook-service';
import {
  createWebhook,
  updateWebhook,
  deleteWebhook,
  listMyWebhooks,
  listMyDeliveries,
} from '../actions';

interface Props {
  initialWebhooks: MeetingWebhook[];
  initialDeliveries: MeetingWebhookDelivery[];
  loadError: string | null;
}

const EVENT_LABEL: Record<string, string> = {
  'booking.created': 'Booked',
  'booking.cancelled': 'Cancelled',
  'booking.rescheduled': 'Rescheduled',
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'sent') {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" aria-hidden /> Sent
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" aria-hidden /> Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock3 className="h-3 w-3" aria-hidden /> Pending
    </Badge>
  );
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

export function WebhooksManager({ initialWebhooks, initialDeliveries, loadError }: Props) {
  const [webhooks, setWebhooks] = useState<MeetingWebhook[]>(initialWebhooks);
  const [deliveries, setDeliveries] = useState<MeetingWebhookDelivery[]>(initialDeliveries);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Create-form state
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  // The secret revealed once after a successful create.
  const [revealedSecret, setRevealedSecret] = useState<{ name: string; secret: string } | null>(
    null,
  );

  function refresh() {
    startTransition(async () => {
      const [w, d] = await Promise.all([listMyWebhooks(), listMyDeliveries()]);
      if (w.success) setWebhooks(w.data);
      if (d.success) setDeliveries(d.data);
    });
  }

  function toggleEvent(ev: WebhookEvent, checked: boolean) {
    setEvents((prev) =>
      checked ? Array.from(new Set([...prev, ev])) : prev.filter((e) => e !== ev),
    );
  }

  function handleCreate() {
    if (!name.trim()) return toast.error('Give the webhook a name.');
    if (!/^https?:\/\//i.test(url.trim())) return toast.error('Enter a valid http(s) URL.');
    if (events.length === 0) return toast.error('Pick at least one event.');

    startTransition(async () => {
      const res = await createWebhook({ name: name.trim(), targetUrl: url.trim(), events });
      if (!res.success) {
        toast.error(res.error ?? 'Could not create webhook.');
        return;
      }
      toast.success('Webhook created.');
      setWebhooks((prev) => [res.data!, ...prev]);
      setRevealedSecret({ name: res.data!.name, secret: res.data!.signing_secret });
      // reset form
      setName('');
      setUrl('');
      setEvents([...WEBHOOK_EVENTS]);
      setDialogOpen(false);
    });
  }

  function handleToggleActive(hook: MeetingWebhook, next: boolean) {
    // optimistic
    setWebhooks((prev) => prev.map((h) => (h.id === hook.id ? { ...h, is_active: next } : h)));
    startTransition(async () => {
      const res = await updateWebhook(hook.id, { isActive: next });
      if (!res.success) {
        toast.error(res.error ?? 'Update failed.');
        setWebhooks((prev) =>
          prev.map((h) => (h.id === hook.id ? { ...h, is_active: !next } : h)),
        );
      }
    });
  }

  function handleDelete(hook: MeetingWebhook) {
    if (!window.confirm(`Delete webhook "${hook.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteWebhook(hook.id);
      if (!res.success) {
        toast.error(res.error ?? 'Delete failed.');
        return;
      }
      toast.success('Webhook deleted.');
      setWebhooks((prev) => prev.filter((h) => h.id !== hook.id));
    });
  }

  function copySecret(secret: string) {
    navigator.clipboard?.writeText(secret).then(
      () => toast.success('Signing secret copied.'),
      () => toast.error('Copy failed — select and copy manually.'),
    );
  }

  if (loadError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Could not load your webhooks: {loadError}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* One-time secret reveal */}
      {revealedSecret && (
        <Card className="border-emerald-400/50 bg-emerald-50/40 dark:bg-emerald-950/20">
          <CardContent className="space-y-2 py-4">
            <p className="text-sm font-medium">
              Signing secret for “{revealedSecret.name}” — copy it now
            </p>
            <p className="text-xs text-muted-foreground">
              Use this to verify the <code>X-MyJKKN-Signature</code> header
              (HMAC-SHA256 of the raw request body). It won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                {revealedSecret.secret}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copySecret(revealedSecret.secret)}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRevealedSecret(null)}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhooks list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Your webhooks</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" aria-hidden /> New webhook
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New webhook</DialogTitle>
                <DialogDescription>
                  MyJKKN will POST a signed JSON payload to this URL on each selected
                  event.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wh-name">Name</Label>
                  <Input
                    id="wh-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My CRM sync"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wh-url">Endpoint URL</Label>
                  <Input
                    id="wh-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/hooks/myjkkn"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Events</Label>
                  <div className="space-y-2">
                    {WEBHOOK_EVENTS.map((ev) => (
                      <label key={ev} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={events.includes(ev)}
                          onCheckedChange={(c) => toggleEvent(ev, c === true)}
                        />
                        <span>{EVENT_LABEL[ev] ?? ev}</span>
                        <code className="text-xs text-muted-foreground">{ev}</code>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isPending}>
                  {isPending ? 'Creating…' : 'Create webhook'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <div className="py-10 text-center">
              <WebhookIcon
                className="mx-auto h-10 w-10 text-muted-foreground/40"
                aria-hidden
              />
              <p className="mt-2 text-sm text-muted-foreground">
                No webhooks yet. Create one to receive booking events in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((hook) => (
                <div
                  key={hook.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{hook.name}</span>
                      {!hook.is_active && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{hook.target_url}</p>
                    <div className="flex flex-wrap gap-1">
                      {hook.events.map((ev) => (
                        <Badge key={ev} variant="secondary" className="text-[10px]">
                          {EVENT_LABEL[ev] ?? ev}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={hook.is_active}
                        onCheckedChange={(c) => handleToggleActive(hook, c)}
                        aria-label="Toggle active"
                      />
                      <span className="text-xs text-muted-foreground">Active</span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(hook)}
                      aria-label="Delete webhook"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recent deliveries</CardTitle>
          <Button size="sm" variant="outline" onClick={refresh} disabled={isPending}>
            {isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No deliveries yet. They appear here as bookings happen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm">{EVENT_LABEL[d.event] ?? d.event}</TableCell>
                      <TableCell>
                        <StatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {d.response_code ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{d.attempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatWhen(d.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
