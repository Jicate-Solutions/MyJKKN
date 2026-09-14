'use client';

// components/shared/comment-thread-panel.tsx
//
// The presentation of a two-level comment thread: a composer, a list of root
// comments with their replies, per-thread resolve, and inline edit/delete. It
// owns no data and knows no table — every write is a promise handed in by the
// caller, and every authority decision arrives as a boolean.
//
// It exists because two features need the same panel with opposite audiences:
//
//   EventReviewCommentsCard       an authority's remark on an event, hidden
//                                 from the students it is about
//   ReservationCommentsCard       an approver's note on a room booking, shown
//                                 to the booker on purpose
//
// Their gates, their tables and their SQL functions are all separate and stay
// separate (see lib/services/shared/comment-threads.ts for why). What they
// share is 300 lines of JSX, and a second hand-maintained copy of that is how
// one of them quietly stops matching the other.
//
// ── The two authority props ────────────────────────────────────────────────
// `canResolveAny` and `canDeleteAny` are separate and must stay separate. In
// both features an admin-class role may CLOSE any thread while only a super
// admin may DELETE somebody else's words, and the DELETE policies say exactly
// that. Collapsing them into one "isAdmin" would paint a Delete button that the
// database then refuses on every click.

import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  CornerDownRight,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { MAX_COMMENT_BODY } from '@/lib/services/shared/comment-threads';
import type { ThreadComment } from '@/lib/services/shared/comment-threads';

/** Every write the panel can ask for. Reject to keep the user's text. */
export interface CommentThreadHandlers {
  onPost: (body: string) => Promise<unknown>;
  onReply: (parentId: string, body: string) => Promise<unknown>;
  onEdit: (id: string, body: string) => Promise<unknown>;
  onResolve: (id: string, resolved: boolean) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

export interface CommentThreadPanelProps {
  title: string;
  description: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Placeholder for the top composer — say what this channel is for. */
  placeholder: string;
  /** Placeholder for a reply box. */
  replyPlaceholder?: string;
  /** Shown when there is nothing at all. */
  emptyText: string;
  /** Shown when every thread is closed. */
  allResolvedText: string;
  /** Badge on an open thread, e.g. "Awaiting reply". */
  openLabel: string;
  threads: ThreadComment[];
  isLoading: boolean;
  isError?: boolean;
  errorText?: string | null;
  /** The viewer's profile id, for "You" and for the author-only controls. */
  myId: string | null;
  /** May close a thread they did not raise. */
  canResolveAny: boolean;
  /** May delete a comment they did not write. */
  canDeleteAny: boolean;
  handlers: CommentThreadHandlers;
}

/** "just now", "2h ago", "12 Sep" — a thread is read by recency. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** profiles.role is a snake_case key; render it as words. */
function roleLabel(role: string | null): string | null {
  if (!role) return null;
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ── Composer ────────────────────────────────────────────────────────────────

function Composer({
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = body.trim();
  const tooLong = trimmed.length > MAX_COMMENT_BODY;

  // The box is cleared only AFTER the write lands. Clearing on click would
  // throw away a paragraph the moment the network hiccups, and the error toast
  // would be the only trace it ever existed. The rejection is swallowed because
  // the caller's mutation has already explained it.
  const submit = async () => {
    if (!trimmed || tooLong || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setBody('');
    } catch {
      /* text stays put; the toast says why */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        rows={3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        // Ctrl/Cmd+Enter posts. Plain Enter must stay a newline — these are
        // paragraphs, not chat lines.
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
        }}
        className="text-sm"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {tooLong && (
          <span className="mr-auto text-xs text-destructive">
            {trimmed.length} characters — the limit is {MAX_COMMENT_BODY}.
          </span>
        )}
        {onCancel && (
          <Button variant="ghost" size="sm" className="h-8" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={submit}
          disabled={!trimmed || tooLong || busy}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ── One comment (root or reply) ─────────────────────────────────────────────

function CommentBody({
  comment,
  isMine,
  canDelete,
  onEdit,
  onRequestDelete,
}: {
  comment: ThreadComment;
  isMine: boolean;
  canDelete: boolean;
  onEdit: (id: string, body: string) => Promise<unknown>;
  onRequestDelete: (comment: ThreadComment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);

  const label = roleLabel(comment.author.role);

  const save = async () => {
    const next = draft.trim();
    if (!next || next === comment.body) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEdit(comment.id, next);
      setEditing(false);
    } catch {
      /* the toast says why; keep the editor open with their text */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium text-foreground">
          {isMine ? 'You' : comment.author.name}
        </span>
        {label && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
            {label}
          </Badge>
        )}
        <span className="text-muted-foreground">{timeAgo(comment.created_at)}</span>
        {comment.updated_at !== comment.created_at && (
          <span className="text-muted-foreground">· edited</span>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            rows={3}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={saving}
              onClick={() => {
                setDraft(comment.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" className="h-7" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{comment.body}</p>
      )}

      {!editing && (isMine || canDelete) && (
        <div className="flex gap-1">
          {isMine && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3 w-3" /> Edit
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
              onClick={() => onRequestDelete(comment)}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── One thread ──────────────────────────────────────────────────────────────

function Thread({
  thread,
  myId,
  canResolveAny,
  canDeleteAny,
  openLabel,
  replyPlaceholder,
  handlers,
  onRequestDelete,
}: {
  thread: ThreadComment;
  myId: string | null;
  canResolveAny: boolean;
  canDeleteAny: boolean;
  openLabel: string;
  replyPlaceholder: string;
  handlers: CommentThreadHandlers;
  onRequestDelete: (comment: ThreadComment) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [resolving, setResolving] = useState(false);

  const isMine = (authorId: string) => !!myId && authorId === myId;
  // Mirrors the guard trigger exactly: the person who raised it, or an admin.
  const canResolve = canResolveAny || isMine(thread.author_id);

  const toggleResolved = async () => {
    setResolving(true);
    try {
      await handlers.onResolve(thread.id, !thread.is_resolved);
    } catch {
      /* the toast says why */
    } finally {
      setResolving(false);
    }
  };

  return (
    <div
      className={`rounded-lg border p-3 ${
        thread.is_resolved ? 'border-dashed bg-muted/30' : 'bg-background'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <Badge
          variant={thread.is_resolved ? 'secondary' : 'outline'}
          className={`h-5 gap-1 px-1.5 text-[10px] ${
            thread.is_resolved ? '' : 'border-amber-500/50 text-amber-700 dark:text-amber-400'
          }`}
        >
          {thread.is_resolved ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              {thread.resolved_by_name ? `Resolved by ${thread.resolved_by_name}` : 'Resolved'}
            </>
          ) : (
            <>
              <ShieldAlert className="h-3 w-3" /> {openLabel}
            </>
          )}
        </Badge>

        {canResolve && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
            disabled={resolving}
            onClick={toggleResolved}
          >
            {resolving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : thread.is_resolved ? (
              <RotateCcw className="h-3 w-3" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {thread.is_resolved ? 'Reopen' : 'Mark resolved'}
          </Button>
        )}
      </div>

      <CommentBody
        comment={thread}
        isMine={isMine(thread.author_id)}
        canDelete={isMine(thread.author_id) || canDeleteAny}
        onEdit={handlers.onEdit}
        onRequestDelete={onRequestDelete}
      />

      {thread.replies.length > 0 && (
        <div className="mt-3 space-y-3 border-l-2 border-muted pl-3">
          {thread.replies.map((r) => (
            <CommentBody
              key={r.id}
              comment={r}
              isMine={isMine(r.author_id)}
              canDelete={isMine(r.author_id) || canDeleteAny}
              onEdit={handlers.onEdit}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
      )}

      <div className="mt-2">
        {replying ? (
          <Composer
            autoFocus
            placeholder={replyPlaceholder}
            submitLabel="Reply"
            onCancel={() => setReplying(false)}
            onSubmit={(body) =>
              handlers.onReply(thread.id, body).then((r) => {
                setReplying(false);
                return r;
              })
            }
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => setReplying(true)}
          >
            <CornerDownRight className="h-3 w-3" /> Reply
          </Button>
        )}
      </div>
    </div>
  );
}

// ── The panel ───────────────────────────────────────────────────────────────

export function CommentThreadPanel({
  title,
  description,
  icon: Icon = MessageSquare,
  placeholder,
  replyPlaceholder = 'Reply — say what you did about it.',
  emptyText,
  allResolvedText,
  openLabel,
  threads,
  isLoading,
  isError,
  errorText,
  myId,
  canResolveAny,
  canDeleteAny,
  handlers,
}: CommentThreadPanelProps) {
  const [showResolved, setShowResolved] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ThreadComment | null>(null);

  const open = threads.filter((t) => !t.is_resolved);
  const resolved = threads.filter((t) => t.is_resolved);

  const threadProps = {
    myId,
    canResolveAny,
    canDeleteAny,
    openLabel,
    replyPlaceholder,
    handlers,
    onRequestDelete: setPendingDelete,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          {open.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
              {open.length} open
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Composer
          placeholder={placeholder}
          submitLabel="Post comment"
          onSubmit={handlers.onPost}
        />

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-4/5" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            {errorText ?? 'The comments could not be loaded.'}
          </p>
        )}

        {!isLoading && !isError && open.length === 0 && resolved.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
        )}

        {!isLoading && !isError && open.length === 0 && resolved.length > 0 && (
          <p className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {allResolvedText}
          </p>
        )}

        {open.length > 0 && (
          <div className="space-y-3">
            {open.map((t) => (
              <Thread key={t.id} thread={t} {...threadProps} />
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div className="border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-1.5 text-xs text-muted-foreground"
              onClick={() => setShowResolved((s) => !s)}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showResolved ? '' : '-rotate-90'}`}
              />
              {resolved.length} resolved
            </Button>
            {showResolved && (
              <div className="mt-2 space-y-3">
                {resolved.map((t) => (
                  <Thread key={t.id} thread={t} {...threadProps} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Not nested inside another dialog and not opened from a dialog's
          onOpenChange — the Radix pattern that traps pointer events. It is a
          panel-level dialog driven by one piece of state. */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && !pendingDelete.parent_id && pendingDelete.replies.length > 0
                ? `This removes the comment and all ${pendingDelete.replies.length} replies under it. It cannot be undone.`
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) handlers.onDelete(pendingDelete.id).catch(() => {});
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
