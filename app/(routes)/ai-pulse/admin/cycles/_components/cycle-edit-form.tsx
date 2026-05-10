'use client';
// app/(routes)/ai-pulse/admin/cycles/_components/cycle-edit-form.tsx
// Created: 2026-05-06
// Purpose: AI Pulse Champion Console edit view. Lets Krishnaveni / Ranjith edit
//          per-cycle config (featured tool, briefing topic, host, meet URL,
//          recording URL, external_judge flag) and cancel a cycle.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  Save,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAIPulseCycle,
  useCancelCycle,
  useUpdateCycleConfig,
  type UpdateCycleConfigInput,
} from '@/lib/services/ai-pulse/cycles-service';
import { FeaturedToolSelect } from './featured-tool-select';
import { HostUserSelect } from './host-user-select';

const PERMISSION_KEY = 'aiPulse:cycles.manage';

interface CycleEditFormProps {
  cycleId: string;
}

interface FormState {
  featured_tool_id: string | null;
  briefing_topic_id: string | null;
  briefing_topic_text: string | null;
  host_user_id: string | null;
  meet_url: string;
  recording_url: string;
  external_judge_cycle: boolean;
}

const EMPTY_FORM: FormState = {
  featured_tool_id: null,
  briefing_topic_id: null,
  briefing_topic_text: null,
  host_user_id: null,
  meet_url: '',
  recording_url: '',
  external_judge_cycle: false,
};

function isValidHttpUrl(s: string): boolean {
  if (!s.trim()) return true; // empty allowed
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function CycleEditForm({ cycleId }: CycleEditFormProps) {
  const router = useRouter();
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();
  const canManage = isSuperAdmin || can(PERMISSION_KEY);

  const { data: cycle, isLoading, error } = useAIPulseCycle(cycleId);
  const update = useUpdateCycleConfig(cycleId);
  const cancel = useCancelCycle(cycleId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [cancelReason, setCancelReason] = useState('');
  const [dirty, setDirty] = useState(false);

  // Hydrate form from cycle data
  useEffect(() => {
    if (!cycle) return;
    setForm({
      featured_tool_id: cycle.ai_pulse.featured_tool_id || null,
      briefing_topic_id: cycle.ai_pulse.briefing_topic_id || null,
      briefing_topic_text: cycle.ai_pulse.briefing_topic_text || null,
      host_user_id: cycle.ai_pulse.host_user_id || null,
      meet_url: cycle.ai_pulse.meet_url || '',
      recording_url: cycle.ai_pulse.recording_url || '',
      external_judge_cycle: cycle.ai_pulse.external_judge_cycle === true,
    });
    setDirty(false);
  }, [cycle]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // ---------------------------------------------------------------------------
  // Permission gate
  // ---------------------------------------------------------------------------
  if (permsLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!canManage) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Champion access required</AlertTitle>
        <AlertDescription>
          You need <code className="font-mono">{PERMISSION_KEY}</code> to edit
          cycles.
        </AlertDescription>
      </Alert>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading / error
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load cycle</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (!cycle) {
    return (
      <Alert>
        <AlertTitle>Cycle not found</AlertTitle>
        <AlertDescription>
          The requested cycle does not exist or is not an AI Pulse cycle.
        </AlertDescription>
      </Alert>
    );
  }

  const isCancelled = cycle.status === 'cancelled';

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------
  const handleSave = async () => {
    if (!isValidHttpUrl(form.meet_url)) {
      toast.error('Meet URL must be a valid http(s) URL');
      return;
    }
    if (!isValidHttpUrl(form.recording_url)) {
      toast.error('Recording URL must be a valid http(s) URL');
      return;
    }

    const patch: UpdateCycleConfigInput = {
      featured_tool_id: form.featured_tool_id,
      briefing_topic_id: form.briefing_topic_id,
      briefing_topic_text: form.briefing_topic_text?.trim() || null,
      host_user_id: form.host_user_id,
      meet_url: form.meet_url.trim() || null,
      recording_url: form.recording_url.trim() || null,
      external_judge_cycle: form.external_judge_cycle,
    };

    const res = await update.mutateAsync(patch);
    if (!res.ok) {
      toast.error(res.error || 'Save failed');
      return;
    }
    toast.success('Cycle saved');
    setDirty(false);
  };

  // ---------------------------------------------------------------------------
  // Cancel handler (separate confirm dialog)
  // ---------------------------------------------------------------------------
  const handleCancel = async () => {
    const res = await cancel.mutateAsync(cancelReason);
    if (!res.ok) {
      toast.error(res.error || 'Cancel failed');
      return;
    }
    toast.success('Cycle cancelled');
    setCancelReason('');
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/ai-pulse/admin/cycles')}
            className="gap-2 -ml-2 mb-1"
          >
            <ArrowLeft className="h-4 w-4" />
            All cycles
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold">
              {cycle.name || 'Untitled cycle'}
            </h2>
            <Badge variant="outline" className="capitalize">
              {cycle.status}
            </Badge>
            {cycle.demo_date && (
              <span className="text-sm text-muted-foreground">
                Demo:{' '}
                {new Date(cycle.demo_date).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={!dirty || update.isPending || isCancelled}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {isCancelled && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>This cycle is cancelled</AlertTitle>
          <AlertDescription>
            {cycle.ai_pulse.cancellation_reason
              ? `Reason: ${cycle.ai_pulse.cancellation_reason}`
              : 'No reason recorded.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Cycle details card */}
      <Card>
        <CardHeader>
          <CardTitle>Cycle configuration</CardTitle>
          <CardDescription>
            Per-cycle settings stored in{' '}
            <code className="font-mono text-xs">
              startup_events.config.ai_pulse
            </code>
            . Changes apply immediately on save.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Featured tool */}
          <div className="space-y-2">
            <Label htmlFor="featured-tool">Featured tool</Label>
            <FeaturedToolSelect
              id="featured-tool"
              value={form.featured_tool_id}
              onChange={(v) => setField('featured_tool_id', v)}
              disabled={isCancelled}
            />
            <p className="text-xs text-muted-foreground">
              The tool learners build with this week. Pick from active entries
              in the master list.
            </p>
          </div>

          {/* Briefing topic */}
          <div className="space-y-2">
            <Label htmlFor="briefing-topic">Briefing topic</Label>
            <Input
              id="briefing-topic"
              type="text"
              value={form.briefing_topic_text || ''}
              onChange={(e) =>
                setField('briefing_topic_text', e.target.value || null)
              }
              placeholder="e.g. Prompt engineering for academic tasks"
              disabled={isCancelled}
            />
            <p className="text-xs text-muted-foreground">
              Short title for this week&apos;s briefing. Stored as free text
              alongside an optional structured topic id.
            </p>
          </div>

          {/* Host */}
          <div className="space-y-2">
            <Label htmlFor="host">Host</Label>
            <HostUserSelect
              id="host"
              value={form.host_user_id}
              onChange={(v) => setField('host_user_id', v)}
              disabled={isCancelled}
            />
            <p className="text-xs text-muted-foreground">
              Staff member who runs the live Thursday session. Defaults to the
              Champion / Co-Champion.
            </p>
          </div>

          {/* Meet URL */}
          <div className="space-y-2">
            <Label htmlFor="meet-url">Google Meet URL</Label>
            <Input
              id="meet-url"
              type="url"
              value={form.meet_url}
              onChange={(e) => setField('meet_url', e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              disabled={isCancelled}
            />
          </div>

          {/* Recording URL */}
          <div className="space-y-2">
            <Label htmlFor="recording-url">Recording URL (Drive)</Label>
            <Input
              id="recording-url"
              type="url"
              value={form.recording_url}
              onChange={(e) => setField('recording_url', e.target.value)}
              placeholder="https://drive.google.com/…"
              disabled={isCancelled}
            />
          </div>

          {/* External judge toggle */}
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="external-judge" className="cursor-pointer">
                External judge cycle
              </Label>
              <p className="text-xs text-muted-foreground">
                Quarterly: invite an external judge to score Gold Standard
                submissions for this cycle.
              </p>
            </div>
            <Switch
              id="external-judge"
              checked={form.external_judge_cycle}
              onCheckedChange={(v) => setField('external_judge_cycle', v)}
              disabled={isCancelled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      {!isCancelled && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Danger zone
            </CardTitle>
            <CardDescription>
              Cancelling a cycle marks it as cancelled and is reflected in the
              learner-facing schedule. Cannot be undone via this UI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <XCircle className="h-4 w-4" />
                  Cancel this cycle
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this cycle?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark the cycle as cancelled. Provide a brief
                    reason for the audit trail. This action cannot be reversed
                    from this UI.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="cancel-reason">
                    Reason (required, min 5 chars)
                  </Label>
                  <Textarea
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g. Featured tool unavailable; rescheduling to next week"
                    rows={3}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep cycle</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancel}
                    disabled={
                      cancel.isPending || cancelReason.trim().length < 5
                    }
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {cancel.isPending ? 'Cancelling…' : 'Cancel cycle'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
