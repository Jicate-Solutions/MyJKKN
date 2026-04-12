'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Link2,
  ListChecks,
  Upload,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { StorageUtils } from '@/lib/supabase/storage-utils';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import toast from 'react-hot-toast';
import type {
  ActionType,
  ResponseType,
  FormItem,
  ActionConfig,
  PendingAction
} from '@/types/notifications';

// ---------------------------------------------------------------------------
// Deadline helpers
// ---------------------------------------------------------------------------

function getDeadlineInfo(sentAt: string, deadlineAt: string, isOverdue: boolean) {
  if (isOverdue) {
    return { label: 'OVERDUE', color: 'text-destructive' as const, variant: 'destructive' as const };
  }

  const now = Date.now();
  const start = new Date(sentAt).getTime();
  const end = new Date(deadlineAt).getTime();
  const total = end - start;
  const remaining = end - now;

  if (total <= 0) {
    return { label: 'OVERDUE', color: 'text-destructive' as const, variant: 'destructive' as const };
  }

  const pctRemaining = remaining / total;
  const diff = remaining;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let label: string;
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    label = `${days}d ${hours % 24}h left`;
  } else if (hours > 0) {
    label = `${hours}h ${minutes}m left`;
  } else {
    label = `${minutes}m left`;
  }

  if (pctRemaining > 0.5) {
    return { label, color: 'text-green-600' as const, variant: 'secondary' as const };
  }
  if (pctRemaining > 0.25) {
    return { label, color: 'text-yellow-600' as const, variant: 'secondary' as const };
  }
  return { label, color: 'text-orange-600' as const, variant: 'outline' as const };
}

function getResponseIcon(type: ActionConfig['response_type']) {
  switch (type) {
    case 'text':
      return <FileText className="h-3.5 w-3.5" />;
    case 'file':
      return <Upload className="h-3.5 w-3.5" />;
    case 'form':
      return <ListChecks className="h-3.5 w-3.5" />;
    case 'link':
      return <Link2 className="h-3.5 w-3.5" />;
  }
}

// ---------------------------------------------------------------------------
// Response form per response_type
// ---------------------------------------------------------------------------

interface ResponseFormProps {
  action: PendingAction;
  onSubmit: (payload: Record<string, unknown>) => void;
  isSubmitting: boolean;
}

function ResponseForm({ action, onSubmit, isSubmitting }: ResponseFormProps) {
  const config = action.action_config;
  const [textValue, setTextValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formChecks, setFormChecks] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    config?.form_items?.forEach((item) => {
      initial[item.id] = false;
    });
    return initial;
  });
  const [linkConfirmed, setLinkConfirmed] = useState(false);

  // Guard against missing config
  if (!config || !config.response_type) {
    return (
      <div className="p-4 text-sm text-destructive">
        This action is missing response configuration. Please contact your administrator.
      </div>
    );
  }

  const handleSubmit = async () => {
    switch (config.response_type) {
      case 'text': {
        const minLen = config.min_text_length ?? 1;
        if (textValue.trim().length < minLen) {
          toast.error(`Response must be at least ${minLen} characters`);
          return;
        }
        onSubmit({ text_response: textValue.trim(), response_type: 'text' });
        break;
      }
      case 'file': {
        if (!file) {
          toast.error('Please select a file');
          return;
        }
        const maxMb = config.max_file_size_mb ?? 10;
        if (file.size > maxMb * 1024 * 1024) {
          toast.error(`File must be under ${maxMb}MB`);
          return;
        }
        if (file.size === 0) {
          toast.error('Cannot upload an empty file');
          return;
        }
        // Upload the file to Supabase storage
        setUploading(true);
        try {
          const fileUrl = await StorageUtils.uploadFile(
            'action-responses',
            file,
            'responses'
          );
          onSubmit({
            file_url: fileUrl,
            file_name: file.name,
            file_size: file.size,
            response_type: 'file',
          });
        } catch {
          toast.error('Failed to upload file. Please try again.');
        } finally {
          setUploading(false);
        }
        break;
      }
      case 'form': {
        // Validate all items are checked before submission
        const items = config.form_items || [];
        const allChecked = items.length === 0 || items.every(item => formChecks[item.id]);
        if (!allChecked) {
          toast.error('Please complete all checklist items');
          return;
        }
        onSubmit({ form_response: formChecks, response_type: 'form' });
        break;
      }
      case 'link': {
        if (!linkConfirmed) {
          toast.error('Please confirm you have visited the link');
          return;
        }
        onSubmit({ link_confirmed: true, response_type: 'link' });
        break;
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Text response */}
      {config.response_type === 'text' && (
        <div className="space-y-2">
          <Label htmlFor="text-response">Your response</Label>
          <Textarea
            id="text-response"
            placeholder="Type your response..."
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            rows={4}
            className="resize-none text-base"
          />
          {config.min_text_length && (
            <p className="text-xs text-muted-foreground">
              Minimum {config.min_text_length} characters ({textValue.length}/{config.min_text_length})
            </p>
          )}
        </div>
      )}

      {/* File upload */}
      {config.response_type === 'file' && (
        <div className="space-y-2">
          <Label htmlFor="file-response">Upload file</Label>
          <Input
            id="file-response"
            type="file"
            accept={config.allowed_file_types?.join(',') || undefined}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {config.max_file_size_mb && (
            <p className="text-xs text-muted-foreground">
              Max size: {config.max_file_size_mb}MB
              {config.allowed_file_types?.length
                ? ` | Allowed: ${config.allowed_file_types.join(', ')}`
                : ''}
            </p>
          )}
          {file && (
            <p className="text-xs text-muted-foreground">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)
            </p>
          )}
        </div>
      )}

      {/* Checklist / form */}
      {config.response_type === 'form' && config.form_items && (
        <div className="space-y-3">
          <Label>Complete the following items</Label>
          {config.form_items.map((item: FormItem) => (
            <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id={`form-${item.id}`}
                checked={formChecks[item.id] ?? false}
                onCheckedChange={(checked) =>
                  setFormChecks((prev) => ({ ...prev, [item.id]: !!checked }))
                }
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <Label htmlFor={`form-${item.id}`} className="font-medium cursor-pointer">
                  {item.title}
                </Label>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                )}
              </div>
            </div>
          ))}
          <FormProgress items={config.form_items} checks={formChecks} />
        </div>
      )}

      {/* Link confirmation */}
      {config.response_type === 'link' && (
        <div className="space-y-3">
          {config.link_url && (
            <a
              href={config.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <Link2 className="h-4 w-4" />
              Open link
            </a>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="link-confirm"
              checked={linkConfirmed}
              onCheckedChange={(checked) => setLinkConfirmed(!!checked)}
            />
            <Label htmlFor="link-confirm" className="cursor-pointer text-sm">
              I have visited the link and completed the required action
            </Label>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button onClick={handleSubmit} disabled={isSubmitting || uploading} className="w-full sm:w-auto">
          {uploading ? 'Uploading file...' : isSubmitting ? 'Submitting...' : 'Submit Response'}
        </Button>
      </DialogFooter>
    </div>
  );
}

// Small progress indicator for form/checklist items
function FormProgress({
  items,
  checks,
}: {
  items: FormItem[];
  checks: Record<string, boolean>;
}) {
  const completed = items.filter((i) => checks[i.id]).length;
  const pct = items.length > 0 ? (completed / items.length) * 100 : 0;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Progress value={pct} className="h-1.5 flex-1" />
      <span>
        {completed}/{items.length}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action card inside the widget list
// ---------------------------------------------------------------------------

function ActionCard({
  action,
  onRespond,
}: {
  action: PendingAction;
  onRespond: (action: PendingAction) => void;
}) {
  const deadline = getDeadlineInfo(action.sent_at, action.deadline_at, action.is_overdue);
  const config = action.action_config;

  // Form progress (only for form/checklist type)
  const formItemCount = config.form_items?.length ?? 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/30">
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold truncate flex-1">{action.title}</h4>
        <Badge variant={deadline.variant} className="shrink-0 text-[10px] px-1.5 py-0.5">
          {getResponseIcon(config.response_type)}
        </Badge>
      </div>

      {/* Sender */}
      <p className="text-xs text-muted-foreground truncate">
        From: {action.created_by_name}
      </p>

      {/* Deadline */}
      <div className={cn('flex items-center gap-1.5 text-xs font-medium', deadline.color)}>
        {action.is_overdue ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <Clock className="h-3.5 w-3.5" />
        )}
        <span>{deadline.label}</span>
      </div>

      {/* Form progress bar (for form/checklist types only) */}
      {config.response_type === 'form' && formItemCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Progress value={0} className="h-1.5 flex-1" />
          <span>0/{formItemCount}</span>
        </div>
      )}

      {/* Respond button */}
      <Button
        size="sm"
        variant="outline"
        className="w-full mt-1"
        onClick={() => onRespond(action)}
      >
        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
        Respond
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton for loading state
// ---------------------------------------------------------------------------

function WidgetSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-6 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main widget
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 10;

export function ActionItemsWidget() {
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<PendingAction | null>(null);

  // ------- Fetch pending actions -------
  const { data, isLoading } = useQuery({
    queryKey: ['pending-actions-widget'],
    queryFn: async () => {
      const res = await fetch(`/api/notifications/pending-actions?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!res.ok) return { actions: [] };
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  // Filter to tracked actions only
  const trackedActions: PendingAction[] = useMemo(() => {
    const all: PendingAction[] = data?.actions ?? [];
    return all.filter((a) => a.action_type === 'tracked');
  }, [data]);

  // ------- Submit mutation -------
  const submitMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/notifications/submit-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_id: selectedAction?.notification_id,
          ...payload,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to submit response');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Response submitted');
      queryClient.invalidateQueries({ queryKey: ['pending-actions-widget'] });
      queryClient.invalidateQueries({ queryKey: ['pending-urgent-actions'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setSelectedAction(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit response');
    },
  });

  const handleSubmit = (payload: Record<string, unknown>) => {
    submitMutation.mutate(payload);
  };

  // ------- Render -------

  if (isLoading) return <WidgetSkeleton />;

  // If no tracked actions, render nothing
  if (trackedActions.length === 0) return null;

  const visible = trackedActions.slice(0, MAX_VISIBLE);
  const hasMore = trackedActions.length > MAX_VISIBLE;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Action Items</CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              {trackedActions.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {visible.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onRespond={setSelectedAction}
            />
          ))}
          {hasMore && (
            <p className="text-xs text-center text-muted-foreground py-1">
              Showing {MAX_VISIBLE} of {trackedActions.length} actions
            </p>
          )}
        </CardContent>
      </Card>

      {/* Response Dialog */}
      <Dialog
        open={!!selectedAction}
        onOpenChange={(open) => {
          if (!open) setSelectedAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedAction?.title}</DialogTitle>
            <DialogDescription>
              From {selectedAction?.created_by_name} &middot;{' '}
              {selectedAction
                ? getDeadlineInfo(
                    selectedAction.sent_at,
                    selectedAction.deadline_at,
                    selectedAction.is_overdue
                  ).label
                : ''}
            </DialogDescription>
          </DialogHeader>

          {selectedAction && (
            <>
              {/* Notification body — so user knows what they're responding to */}
              {selectedAction.body && (
                <div className="prose prose-sm max-w-none dark:prose-invert max-h-[200px] overflow-y-auto border rounded-lg p-3 bg-muted/30">
                  <RichTextDisplay content={selectedAction.body} />
                </div>
              )}
              <ResponseForm
                action={selectedAction}
                onSubmit={handleSubmit}
                isSubmitting={submitMutation.isPending}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
