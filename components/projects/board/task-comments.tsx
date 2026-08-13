'use client';

/**
 * Threaded comment thread for a single task (F1.11).
 *
 * Renders project_task_comments as one level of replies: top-level comments in
 * time order, each followed by its own replies. parent_comment_id supports
 * arbitrary depth in the schema, but deeper nesting reads badly in a dialog and
 * nothing produces it today, so replies-to-replies are flattened onto their
 * top-level parent rather than being hidden.
 *
 * Mounts only inside an open dialog (Radix unmounts DialogContent when closed),
 * so a board full of cards does not fire N comment queries at once — same
 * reasoning as task-raci-dialog.
 */

import { useMemo, useState } from 'react';
import { Loader2, MessageSquare, CornerDownRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTaskComments, useAddTaskComment } from '@/hooks/projects/use-tasks';
import type { ProjectTaskCommentWithAuthor } from '@/types/projects';
import { cn } from '@/lib/utils';

interface TaskCommentsProps {
  taskId: string;
  className?: string;
}

function authorLabel(c: ProjectTaskCommentWithAuthor): string {
  return c.author?.full_name?.trim() || c.author?.email || 'Unknown user';
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return '?';
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
}

/** "3 Aug, 14:05" — short, no year for the current year. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CommentRow({
  comment,
  isReply,
  onReply,
}: {
  comment: ProjectTaskCommentWithAuthor;
  isReply?: boolean;
  onReply?: () => void;
}) {
  const name = authorLabel(comment);
  return (
    <div className={cn('flex gap-2.5', isReply && 'ml-7')}>
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                   bg-muted text-[11px] font-medium text-muted-foreground"
        aria-hidden
      >
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{when(comment.created_at)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
          {comment.body}
        </p>
        {onReply ? (
          <button
            type="button"
            onClick={onReply}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground
                       hover:text-foreground"
          >
            <CornerDownRight className="h-3 w-3" />
            Reply
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TaskComments({ taskId, className }: TaskCommentsProps) {
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const addComment = useAddTaskComment();

  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<ProjectTaskCommentWithAuthor | null>(null);

  // One level deep: anything with a parent is grouped under that parent. A reply
  // whose parent is itself a reply is attached to the top-level ancestor so it
  // can never fall out of the list.
  const threads = useMemo(() => {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const topLevel = comments.filter((c) => !c.parent_comment_id || !byId.has(c.parent_comment_id));
    const rootOf = (c: ProjectTaskCommentWithAuthor): string => {
      let cur = c;
      const seen = new Set<string>([cur.id]);
      while (cur.parent_comment_id) {
        const parent = byId.get(cur.parent_comment_id);
        if (!parent || seen.has(parent.id)) break;
        cur = parent;
        seen.add(cur.id);
      }
      return cur.id;
    };
    const replies = new Map<string, ProjectTaskCommentWithAuthor[]>();
    for (const c of comments) {
      if (!c.parent_comment_id || !byId.has(c.parent_comment_id)) continue;
      const root = rootOf(c);
      if (root === c.id) continue;
      const list = replies.get(root) ?? [];
      list.push(c);
      replies.set(root, list);
    }
    return topLevel.map((c) => ({ comment: c, replies: replies.get(c.id) ?? [] }));
  }, [comments]);

  const submit = () => {
    const text = body.trim();
    if (!text || addComment.isPending) return;
    addComment.mutate(
      { taskId, body: text, parentCommentId: replyTo?.id ?? null },
      {
        onSuccess: () => {
          setBody('');
          setReplyTo(null);
        },
      }
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        Comments
        {comments.length > 0 ? (
          <span className="text-xs font-normal text-muted-foreground">({comments.length})</span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          No comments yet. Add the first one below.
        </p>
      ) : (
        <div className="max-h-[320px] space-y-4 overflow-y-auto pr-1">
          {threads.map(({ comment, replies }) => (
            <div key={comment.id} className="space-y-3">
              <CommentRow comment={comment} onReply={() => setReplyTo(comment)} />
              {replies.map((r) => (
                <CommentRow key={r.id} comment={r} isReply />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t pt-3">
        {replyTo ? (
          <div className="flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-xs">
            <span className="truncate text-muted-foreground">
              Replying to <span className="font-medium">{authorLabel(replyTo)}</span>
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : null}

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
          rows={3}
          // Enter submits, Shift+Enter makes a new line — the convention the team
          // already has muscle memory for from Google Chat.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Enter to send · Shift + Enter for a new line
          </span>
          <Button size="sm" onClick={submit} disabled={!body.trim() || addComment.isPending}>
            {addComment.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Posting…
              </>
            ) : (
              'Comment'
            )}
          </Button>
        </div>

        {addComment.isError ? (
          <p className="text-xs text-destructive">
            Could not post that comment. Check your connection and try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
