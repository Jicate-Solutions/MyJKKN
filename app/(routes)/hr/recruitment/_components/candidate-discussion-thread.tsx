'use client';

/**
 * Free-form discussion thread on a recruitment candidate
 * (hr_recruitment_candidate_comments). Approval-step decision comments stay
 * embedded in the approval chain; this thread is for everything around them —
 * screening notes, negotiation context, follow-ups.
 *
 * One level of nesting: replies render indented under their parent.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MessageSquare, Loader2, Reply, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useCandidateComments, useAddCandidateComment } from '@/hooks/hr/use-recruitment';
import type { HRRecruitmentCandidateComment } from '@/types/hr-recruitment';

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function CommentBody({
  comment,
  onReply,
}: {
  comment: HRRecruitmentCandidateComment;
  onReply?: () => void;
}) {
  const name = comment.commenter?.full_name || comment.commenter?.email || 'Unknown user';
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-[11px] text-muted-foreground">{fmtWhen(comment.created_at)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{comment.comment}</p>
      {onReply && (
        <button
          type="button"
          onClick={onReply}
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Reply className="h-3 w-3" />
          Reply
        </button>
      )}
    </div>
  );
}

export function CandidateDiscussionThread({ candidateId }: { candidateId: string }) {
  const { data: comments, isLoading } = useCandidateComments(candidateId);
  const addComment = useAddCandidateComment();

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<HRRecruitmentCandidateComment | null>(null);

  // Top-level comments in order, with replies (any depth flattened to one level) under them.
  const { roots, repliesByParent } = useMemo(() => {
    const all = comments ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    const roots = all.filter((c) => !c.parent_comment_id);
    const repliesByParent = new Map<string, HRRecruitmentCandidateComment[]>();
    for (const c of all) {
      if (!c.parent_comment_id) continue;
      // Walk up to the top-level ancestor so deep replies stay visible.
      let rootId = c.parent_comment_id;
      let guard = 0;
      while (guard++ < 20) {
        const parent = byId.get(rootId);
        if (!parent?.parent_comment_id) break;
        rootId = parent.parent_comment_id;
      }
      const bucket = repliesByParent.get(rootId) ?? [];
      bucket.push(c);
      repliesByParent.set(rootId, bucket);
    }
    return { roots, repliesByParent };
  }, [comments]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    addComment.mutate(
      {
        candidate_id: candidateId,
        comment: text,
        parent_comment_id: replyTo?.id ?? null,
      },
      {
        onSuccess: () => {
          setDraft('');
          setReplyTo(null);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Discussion
          {(comments?.length ?? 0) > 0 && (
            <span className="rounded-full border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {comments!.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No comments yet. Start the discussion below.
          </p>
        ) : (
          <ul className="space-y-3">
            {roots.map((c) => (
              <li key={c.id} className="space-y-2">
                <CommentBody comment={c} onReply={() => setReplyTo(c)} />
                {(repliesByParent.get(c.id) ?? []).map((r) => (
                  <div key={r.id} className="ml-6 border-l-2 border-border pl-3">
                    <CommentBody comment={r} onReply={() => setReplyTo(c)} />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}

        {/* Composer */}
        <div className="space-y-2 border-t pt-3">
          {replyTo && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="truncate">
                Replying to{' '}
                <span className="font-medium text-foreground">
                  {replyTo.commenter?.full_name || replyTo.commenter?.email || 'comment'}
                </span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={submit}
              disabled={addComment.isPending || !draft.trim()}
            >
              {addComment.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {replyTo ? 'Reply' : 'Comment'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
