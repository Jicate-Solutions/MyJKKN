'use client';

// ============================================================================
// OKR Comment Thread Component
// Threaded comments with @mentions, editing, and reactions
// ============================================================================

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  MoreHorizontal,
  Reply,
  Edit2,
  Trash2,
  Send,
  X,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useOKRComments,
  useOKRCommentCount,
  useCreateOKRComment,
  useUpdateOKRComment,
  useDeleteOKRComment,
} from '@/hooks/okr';
import { ReactionPicker } from './reaction-picker';
import type { OKREntityType, OKRComment } from '@/types/okr';

interface CommentThreadProps {
  entityType: OKREntityType;
  entityId: string;
  title?: string;
  className?: string;
  maxHeight?: string;
}

export function CommentThread({
  entityType,
  entityId,
  title = 'Comments',
  className,
  maxHeight = '400px',
}: CommentThreadProps) {
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: comments, isLoading } = useOKRComments(entityType, entityId);
  const { data: commentCount } = useOKRCommentCount(entityType, entityId);
  const createComment = useCreateOKRComment();
  const updateComment = useUpdateOKRComment();
  const deleteComment = useDeleteOKRComment();

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    await createComment.mutateAsync({
      entity_type: entityType,
      entity_id: entityId,
      content: newComment,
      parent_comment_id: replyTo || undefined,
    });

    setNewComment('');
    setReplyTo(null);
  };

  const handleUpdate = async (commentId: string) => {
    if (!editContent.trim()) return;

    await updateComment.mutateAsync({
      commentId,
      content: editContent,
    });

    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = async (commentId: string) => {
    if (confirm('Are you sure you want to delete this comment?')) {
      await deleteComment.mutateAsync(commentId);
    }
  };

  const startEdit = (comment: OKRComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const startReply = (commentId: string) => {
    setReplyTo(commentId);
    textareaRef.current?.focus();
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4" />
          {title}
          {commentCount !== undefined && commentCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {commentCount}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comment input */}
        <div className="space-y-2">
          {replyTo && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Reply className="h-3 w-3" />
              <span>Replying to comment</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => setReplyTo(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="min-h-[80px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              Press Cmd+Enter to submit
            </span>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!newComment.trim() || createComment.isPending}
            >
              {createComment.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="ml-1">Post</span>
            </Button>
          </div>
        </div>

        {/* Comments list */}
        <div
          className="space-y-3 overflow-y-auto"
          style={{ maxHeight }}
        >
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments?.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No comments yet. Be the first to comment!</p>
            </div>
          ) : (
            comments?.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                entityType={entityType}
                editingId={editingId}
                editContent={editContent}
                setEditContent={setEditContent}
                onEdit={startEdit}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onReply={startReply}
                onCancelEdit={() => {
                  setEditingId(null);
                  setEditContent('');
                }}
                getInitials={getInitials}
                isUpdating={updateComment.isPending}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Individual comment item
interface CommentItemProps {
  comment: OKRComment;
  entityType: OKREntityType;
  editingId: string | null;
  editContent: string;
  setEditContent: (content: string) => void;
  onEdit: (comment: OKRComment) => void;
  onUpdate: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onReply: (commentId: string) => void;
  onCancelEdit: () => void;
  getInitials: (name?: string) => string;
  isUpdating: boolean;
  depth?: number;
}

function CommentItem({
  comment,
  entityType,
  editingId,
  editContent,
  setEditContent,
  onEdit,
  onUpdate,
  onDelete,
  onReply,
  onCancelEdit,
  getInitials,
  isUpdating,
  depth = 0,
}: CommentItemProps) {
  const isEditing = editingId === comment.id;
  const maxDepth = 2;

  return (
    <div
      className={cn(
        'space-y-2',
        depth > 0 && 'ml-8 pl-3 border-l-2 border-muted'
      )}
    >
      <div className="flex gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.author?.avatar_url} />
          <AvatarFallback className="text-xs">
            {getInitials(comment.author?.full_name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {comment.author?.full_name || 'Unknown User'}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.created_at), {
                  addSuffix: true,
                })}
              </span>
              {comment.is_edited && (
                <span className="text-xs text-muted-foreground">(edited)</span>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {depth < maxDepth && (
                  <DropdownMenuItem onClick={() => onReply(comment.id)}>
                    <Reply className="h-4 w-4 mr-2" />
                    Reply
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onEdit(comment)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(comment.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[60px] resize-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => onUpdate(comment.id)}
                  disabled={!editContent.trim() || isUpdating}
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelEdit}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {comment.content}
            </p>
          )}

          {/* Reactions */}
          {!isEditing && (
            <ReactionPicker
              entityType="comment"
              entityId={comment.id}
              compact
            />
          )}
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              entityType={entityType}
              editingId={editingId}
              editContent={editContent}
              setEditContent={setEditContent}
              onEdit={onEdit}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onReply={onReply}
              onCancelEdit={onCancelEdit}
              getInitials={getInitials}
              isUpdating={isUpdating}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Compact comment count badge for use in lists
export function CommentCountBadge({
  entityType,
  entityId,
  className,
}: {
  entityType: OKREntityType;
  entityId: string;
  className?: string;
}) {
  const { data: count } = useOKRCommentCount(entityType, entityId);

  if (!count) return null;

  return (
    <div className={cn('flex items-center gap-1 text-muted-foreground', className)}>
      <MessageCircle className="h-3.5 w-3.5" />
      <span className="text-xs">{count}</span>
    </div>
  );
}
