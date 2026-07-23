'use client';

// app/(routes)/bos/sop/_components/sop-comments-panel.tsx
//
// Side panel that lists threaded comments for an SOP document. Comments are
// fetched via useBosSopComments() and rendered as a parent → replies tree.
// Resolution toggling and reply submission go through the same hook layer.

import { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, MessageSquare, Reply, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBosSopComments,
  useAddBosSopComment,
  useUpdateBosSopComment,
  useDeleteBosSopComment,
} from '@/hooks/bos/use-bos-sop';
import type { BosSopComment } from '@/types/bos-sop';

export interface SopCommentsPanelProps {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CommentNode({
  comment,
  documentId,
  depth,
}: {
  comment: BosSopComment;
  documentId: string;
  depth: number;
}) {
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const addComment = useAddBosSopComment();
  const updateComment = useUpdateBosSopComment();
  const deleteComment = useDeleteBosSopComment();

  return (
    <div
      className='rounded border bg-background p-3 space-y-2'
      style={{ marginLeft: `${Math.min(depth, 2) * 16}px` }}
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='space-y-1 flex-1 min-w-0'>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <span className='font-medium text-foreground'>
              {comment.created_by_name ?? 'User'}
            </span>
            <span>·</span>
            <span>{format(new Date(comment.created_at), 'dd MMM yyyy HH:mm')}</span>
            {comment.is_resolved && (
              <Badge variant='secondary' className='text-[10px]'>resolved</Badge>
            )}
          </div>
          {comment.anchor_text && (
            <blockquote className='border-l-2 pl-2 text-xs text-muted-foreground italic'>
              “{comment.anchor_text}”
            </blockquote>
          )}
          <p className='text-sm whitespace-pre-wrap'>{comment.body}</p>
        </div>
        <div className='flex items-center gap-1 shrink-0'>
          <Button
            size='sm'
            variant='ghost'
            className='h-7 w-7 p-0'
            onClick={() =>
              updateComment.mutate({
                documentId,
                commentId: comment.id,
                data: { is_resolved: !comment.is_resolved },
              })
            }
            title={comment.is_resolved ? 'Reopen' : 'Resolve'}
          >
            <CheckCircle2 className={`h-4 w-4 ${comment.is_resolved ? 'text-green-600' : ''}`} />
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-7 w-7 p-0'
            onClick={() => setReplying((v) => !v)}
            title='Reply'
          >
            <Reply className='h-4 w-4' />
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-7 w-7 p-0 text-destructive'
            onClick={() => {
              if (window.confirm('Delete this comment?')) {
                deleteComment.mutate({ documentId, commentId: comment.id });
              }
            }}
            title='Delete'
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {replying && (
        <div className='space-y-2 pt-2'>
          <Textarea
            placeholder='Write a reply…'
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            className='min-h-[60px]'
          />
          <div className='flex gap-2 justify-end'>
            <Button size='sm' variant='ghost' onClick={() => { setReplying(false); setReplyBody(''); }}>Cancel</Button>
            <Button
              size='sm'
              disabled={!replyBody.trim() || addComment.isPending}
              onClick={async () => {
                await addComment.mutateAsync({
                  id: documentId,
                  data: { parent_id: comment.id, body: replyBody },
                });
                setReplyBody('');
                setReplying(false);
              }}
            >
              Reply
            </Button>
          </div>
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className='space-y-2 pt-1'>
          {comment.replies.map((r) => (
            <CommentNode key={r.id} comment={r} documentId={documentId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SopCommentsPanel({ documentId, open, onOpenChange }: SopCommentsPanelProps) {
  const { data: comments, isLoading } = useBosSopComments(documentId);
  const addComment = useAddBosSopComment();
  const [draft, setDraft] = useState('');

  const submit = async () => {
    if (!draft.trim()) return;
    await addComment.mutateAsync({ id: documentId, data: { body: draft } });
    setDraft('');
  };

  const open_count = (comments ?? []).filter((c) => !c.is_resolved).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='w-full sm:max-w-md flex flex-col gap-3'>
        <SheetHeader>
          <SheetTitle className='flex items-center gap-2'>
            <MessageSquare className='h-4 w-4' />
            Comments
            {open_count > 0 && <Badge variant='secondary'>{open_count} open</Badge>}
          </SheetTitle>
        </SheetHeader>

        <div className='flex-1 overflow-y-auto space-y-2 pr-1'>
          {isLoading ? (
            <>
              <Skeleton className='h-20 w-full' />
              <Skeleton className='h-20 w-full' />
            </>
          ) : (comments ?? []).length === 0 ? (
            <div className='text-center py-8 text-sm text-muted-foreground'>
              No comments yet. Add the first comment below.
            </div>
          ) : (
            (comments ?? []).map((c) => (
              <CommentNode key={c.id} comment={c} documentId={documentId} depth={0} />
            ))
          )}
        </div>

        <div className='border-t pt-3 space-y-2'>
          <Textarea
            placeholder='Add a comment…'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className='min-h-[80px]'
          />
          <div className='flex gap-2 justify-end'>
            <Button size='sm' onClick={submit} disabled={!draft.trim() || addComment.isPending}>
              {addComment.isPending ? 'Posting…' : 'Post comment'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
