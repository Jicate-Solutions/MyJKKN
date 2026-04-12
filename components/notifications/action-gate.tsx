'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bell,
  Zap,
  FileText,
  Upload,
  ExternalLink,
  CalendarClock,
  X,
  Paperclip,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import { StorageUtils } from '@/lib/supabase/storage-utils';
import toast from 'react-hot-toast';
import type {
  PendingAction,
  ActionConfig,
  ResponseType
} from '@/types/notifications';

// ==================== RESPONSE FORM COMPONENTS (inline) ====================

/**
 * TextResponseForm — Textarea with character counter.
 * Min 10 chars required before submit is enabled.
 */
function TextResponseForm({
  config,
  onSubmit,
  isSubmitting
}: {
  config: ActionConfig;
  onSubmit: (data: { text_response: string }) => void;
  isSubmitting: boolean;
}) {
  const [text, setText] = useState('');
  const minLength = config.min_text_length || 10;
  const isValid = text.trim().length >= minLength;

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Your Response</label>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your response here..."
        rows={4}
        className="resize-none text-base"
      />
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-xs',
            isValid ? 'text-muted-foreground' : 'text-destructive'
          )}
        >
          {text.trim().length}/{minLength} min characters
        </span>
        <Button
          onClick={() => onSubmit({ text_response: text.trim() })}
          disabled={!isValid || isSubmitting}
          className="gap-2"
        >
          {isSubmitting ? 'Submitting...' : (
            <>
              <Send className="h-4 w-4" />
              Submit Response
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * FileResponseForm — File input with preview.
 * Accepts PDF, DOCX, XLSX, JPG, PNG. Uses StorageUtils.uploadFile for upload.
 */
function FileResponseForm({
  config,
  onSubmit,
  isSubmitting
}: {
  config: ActionConfig;
  onSubmit: (data: { file_url: string; file_name: string; file_size: number }) => void;
  isSubmitting: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptTypes = config.allowed_file_types?.join(',') ||
    '.pdf,.docx,.xlsx,.jpg,.jpeg,.png';
  const maxSizeMb = config.max_file_size_mb || 10;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > maxSizeMb * 1024 * 1024) {
      toast.error(`File must be under ${maxSizeMb}MB`);
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async () => {
    if (!file) return;
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
        file_size: file.size
      });
    } catch {
      toast.error('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Upload Your Response</label>

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Tap to select a file
          </span>
          <span className="text-xs text-muted-foreground/60">
            PDF, DOCX, XLSX, JPG, PNG (max {maxSizeMb}MB)
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-muted/30">
          <Paperclip className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8"
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={acceptTypes}
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!file || uploading || isSubmitting}
          className="gap-2"
        >
          {uploading || isSubmitting ? 'Uploading...' : (
            <>
              <Send className="h-4 w-4" />
              Submit File
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * FormResponseForm — Renders action_config.form_items as a checklist.
 * Each item: checkbox + title + description.
 * Submit enabled only when ALL items are checked.
 */
function FormResponseForm({
  config,
  onSubmit,
  isSubmitting
}: {
  config: ActionConfig;
  onSubmit: (data: { form_response: Record<string, boolean> }) => void;
  isSubmitting: boolean;
}) {
  const items = config.form_items || [];
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allChecked = items.length > 0 && items.every((item) => checked[item.id]);

  const handleToggle = (itemId: string) => {
    setChecked((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">
        Complete all items to submit
      </label>
      <div className="space-y-2">
        {items.map((item) => (
          <label
            key={item.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors',
              checked[item.id]
                ? 'bg-primary/5 border-primary/30'
                : 'bg-background hover:bg-muted/30'
            )}
          >
            <Checkbox
              checked={checked[item.id] || false}
              onCheckedChange={() => handleToggle(item.id)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{item.title}</p>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.description}
                </p>
              )}
            </div>
            {checked[item.id] && (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {Object.values(checked).filter(Boolean).length}/{items.length} completed
        </span>
        <Button
          onClick={() => onSubmit({ form_response: checked })}
          disabled={!allChecked || isSubmitting}
          className="gap-2"
        >
          {isSubmitting ? 'Submitting...' : (
            <>
              <Send className="h-4 w-4" />
              Submit
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * LinkResponseForm — Shows link as a clickable button opening in new tab.
 * After clicking: "I have visited this link" confirmation checkbox.
 * Submit when confirmed.
 */
function LinkResponseForm({
  config,
  onSubmit,
  isSubmitting
}: {
  config: ActionConfig;
  onSubmit: (data: { link_confirmed: boolean }) => void;
  isSubmitting: boolean;
}) {
  const [visited, setVisited] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const linkUrl = config.link_url || '#';

  const handleVisit = () => {
    window.open(linkUrl, '_blank', 'noopener,noreferrer');
    setVisited(true);
  };

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">Visit the required link</label>

      <Button
        variant="outline"
        className="w-full h-12 gap-2 text-base"
        onClick={handleVisit}
      >
        <ExternalLink className="h-5 w-5" />
        Open Link
      </Button>

      {visited && (
        <label className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-muted/30 cursor-pointer">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(c) => setConfirmed(c === true)}
          />
          <span className="text-sm">I have visited this link</span>
        </label>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => onSubmit({ link_confirmed: true })}
          disabled={!confirmed || isSubmitting}
          className="gap-2"
        >
          {isSubmitting ? 'Submitting...' : (
            <>
              <Send className="h-4 w-4" />
              Confirm & Submit
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ==================== EXTENSION REQUEST SECTION ====================

function ExtensionRequestSection({
  action,
  onRequestSubmitted
}: {
  action: PendingAction;
  onRequestSubmitted: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [requestedDeadline, setRequestedDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValid = reason.trim().length >= 10 && requestedDeadline;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/notifications/request-extension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_id: action.notification_id,
          reason: reason.trim(),
          requested_deadline: requestedDeadline
        })
      });
      if (!res.ok) throw new Error('Failed to request extension');
      toast.success('Extension request submitted');
      onRequestSubmitted();
    } catch {
      toast.error('Failed to submit extension request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Already has a pending extension request
  if (action.extension_request?.status === 'pending') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-sm">
        <CalendarClock className="h-4 w-4 shrink-0" />
        <span>Extension pending approval</span>
      </div>
    );
  }

  if (!showForm) {
    return (
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => setShowForm(true)}
      >
        <CalendarClock className="h-4 w-4" />
        Request Extension
      </Button>
    );
  }

  return (
    <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Request Extension
        </h4>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setShowForm(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Reason for extension
        </label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why you need more time..."
          rows={3}
          className="resize-none text-sm"
        />
        <span
          className={cn(
            'text-xs',
            reason.trim().length >= 10
              ? 'text-muted-foreground'
              : 'text-destructive'
          )}
        >
          {reason.trim().length}/10 min characters
        </span>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Requested new deadline
        </label>
        <Input
          type="datetime-local"
          value={requestedDeadline}
          onChange={(e) => setRequestedDeadline(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          className="text-sm"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!isValid || submitting}
        className="w-full gap-2"
        size="sm"
      >
        {submitting ? 'Submitting...' : 'Submit Extension Request'}
      </Button>
    </div>
  );
}

// ==================== MAIN ACTION GATE COMPONENT ====================

/**
 * ActionGate — Blocking modal for urgent actions requiring a RESPONSE.
 *
 * Like AcknowledgmentGate, this renders a full-screen blocking overlay
 * when there are pending urgent actions. The user CANNOT interact with
 * the app until they respond to every pending urgent action.
 *
 * Different from AcknowledgmentGate:
 * - Fetches from /api/notifications/pending-actions
 * - Filters for action_type === 'urgent' only
 * - Shows a RESPONSE FORM based on action_config.response_type
 * - Has "Request Extension" secondary button
 * - Submit calls POST /api/notifications/submit-action
 */
export function ActionGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch pending urgent actions — cache-bust to prevent stale responses
  const { data, isLoading } = useQuery({
    queryKey: ['pending-urgent-actions'],
    queryFn: async () => {
      const res = await fetch(
        `/api/notifications/pending-actions?_t=${Date.now()}`,
        {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
        }
      );
      if (!res.ok) return { actions: [], count: 0 };
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    // Post-process: filter for urgent only (tracked goes to dashboard)
    select: (data) => {
      const urgentActions = (data?.actions || []).filter(
        (a: PendingAction) => a.action_type === 'urgent' && !a.has_responded
      );
      return { actions: urgentActions, count: urgentActions.length };
    }
  });

  const actions: PendingAction[] = data?.actions || [];
  const hasPending = actions.length > 0;

  // Submit action response mutation
  const submitMutation = useMutation({
    mutationFn: async (payload: {
      notification_id: string;
      response_type: ResponseType;
      text_response?: string;
      file_url?: string;
      file_name?: string;
      file_size?: number;
      form_response?: Record<string, boolean>;
      link_confirmed?: boolean;
    }) => {
      const res = await fetch('/api/notifications/submit-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to submit response');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-urgent-actions'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const handleSubmitResponse = useCallback(
    async (responseData: Record<string, any>) => {
      const current = actions[currentIndex];
      if (!current) return;

      try {
        await submitMutation.mutateAsync({
          notification_id: current.notification_id,
          response_type: current.action_config.response_type,
          ...responseData
        });

        if (currentIndex < actions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
          toast.success(
            `Response submitted (${currentIndex + 1}/${actions.length})`
          );
        } else {
          toast.success('All actions completed!', {
            icon: '\u2705',
            duration: 3000
          });
          setCurrentIndex(0);
        }
      } catch {
        toast.error('Failed to submit response. Please try again.');
      }
    },
    [actions, currentIndex, submitMutation]
  );

  const handleExtensionSubmitted = useCallback(() => {
    // Refetch to update extension status — dismiss modal temporarily
    queryClient.invalidateQueries({ queryKey: ['pending-urgent-actions'] });
  }, [queryClient]);

  // Don't block while loading
  if (isLoading) return <>{children}</>;

  // No pending urgent actions — render app normally
  if (!hasPending) return <>{children}</>;

  const current = actions[currentIndex];
  if (!current) return <>{children}</>;

  const deadlineDate = new Date(current.deadline_at);
  const isOverdue = current.is_overdue;
  const timeLeft = isOverdue ? 'OVERDUE' : getTimeRemaining(deadlineDate);

  const responseTypeLabels: Record<ResponseType, string> = {
    text: 'Written Response Required',
    file: 'File Upload Required',
    form: 'Checklist Completion Required',
    link: 'Link Visit Required'
  };

  const responseTypeIcons: Record<ResponseType, React.ReactNode> = {
    text: <FileText className="h-4 w-4" />,
    file: <Upload className="h-4 w-4" />,
    form: <CheckCircle2 className="h-4 w-4" />,
    link: <ExternalLink className="h-4 w-4" />
  };

  return (
    <>
      {/* Blocked app content (blurred) */}
      <div className="pointer-events-none select-none blur-sm opacity-30">
        {children}
      </div>

      {/* Full-screen action overlay */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg bg-background rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300 max-h-[95vh] flex flex-col">
          {/* Header */}
          <div
            className={cn(
              'px-6 py-4 flex items-center gap-3 shrink-0',
              isOverdue
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-orange-500 text-white'
            )}
          >
            <Zap className="h-6 w-6 shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">Action Required</h2>
              <p className="text-sm opacity-90">
                {actions.length === 1
                  ? '1 action requires your response'
                  : `${currentIndex + 1} of ${actions.length} actions`}
              </p>
            </div>
            {isOverdue && (
              <Badge
                variant="outline"
                className="bg-white/20 text-white border-white/30 shrink-0"
              >
                OVERDUE
              </Badge>
            )}
          </div>

          {/* Scrollable content */}
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* Title and metadata */}
            <div>
              <h3 className="text-xl font-semibold">{current.title}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Bell className="h-3.5 w-3.5" />
                  {current.category}
                </span>
                <span>·</span>
                <span>From: {current.created_by_name}</span>
                <span>·</span>
                <Badge variant="destructive" className="text-xs">
                  {current.priority}
                </Badge>
              </div>
            </div>

            {/* Body */}
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <RichTextDisplay content={current.body} />
            </div>

            {/* Attachments */}
            {current.metadata?.attachments &&
              current.metadata.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Attachments:
                  </p>
                  <div className="space-y-1.5">
                    {current.metadata.attachments.map(
                      (att: any, idx: number) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors text-sm"
                        >
                          <span className="truncate flex-1">{att.name}</span>
                          <Badge
                            variant="outline"
                            className="text-xs shrink-0"
                          >
                            {att.type?.split('/').pop()?.toUpperCase() || 'FILE'}
                          </Badge>
                        </a>
                      )
                    )}
                  </div>
                </div>
              )}

            {/* Deadline indicator */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                isOverdue
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {isOverdue ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              <span>
                {isOverdue
                  ? `Response was due ${getTimeAgo(deadlineDate)}. Your supervisor will be notified.`
                  : `Deadline: ${timeLeft}`}
              </span>
            </div>

            {/* Response type badge */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-sm">
              {responseTypeIcons[current.action_config.response_type]}
              <span className="font-medium">
                {responseTypeLabels[current.action_config.response_type]}
              </span>
            </div>

            {/* Response form — based on response_type */}
            <div className="pt-1">
              {current.action_config.response_type === 'text' && (
                <TextResponseForm
                  config={current.action_config}
                  onSubmit={handleSubmitResponse}
                  isSubmitting={submitMutation.isPending}
                />
              )}
              {current.action_config.response_type === 'file' && (
                <FileResponseForm
                  config={current.action_config}
                  onSubmit={handleSubmitResponse}
                  isSubmitting={submitMutation.isPending}
                />
              )}
              {current.action_config.response_type === 'form' && (
                <FormResponseForm
                  config={current.action_config}
                  onSubmit={handleSubmitResponse}
                  isSubmitting={submitMutation.isPending}
                />
              )}
              {current.action_config.response_type === 'link' && (
                <LinkResponseForm
                  config={current.action_config}
                  onSubmit={handleSubmitResponse}
                  isSubmitting={submitMutation.isPending}
                />
              )}
            </div>
          </div>

          {/* Extension request area */}
          <div className="px-6 py-4 bg-muted/30 border-t shrink-0 space-y-2">
            <ExtensionRequestSection
              action={current}
              onRequestSubmitted={handleExtensionSubmitted}
            />
            <p className="text-xs text-center text-muted-foreground">
              Your response is permanently recorded. You cannot proceed without completing this action.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ==================== HELPER FUNCTIONS ====================

function getTimeRemaining(deadline: Date): string {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return 'OVERDUE';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h remaining`;
  }
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  return `${minutes}m ago`;
}
