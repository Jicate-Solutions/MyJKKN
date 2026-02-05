'use client';

/**
 * Comment Thread Component
 * F004: Grievance Ticketing System
 *
 * Displays comment thread with chronological ordering and add comment form
 */

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MessageSquare, Send, User, Shield, Bot, Users, Loader2 } from 'lucide-react';
import { useGrievanceComments, useAddGrievanceComment } from '@/hooks/grievance/use-grievance-comments';
import type { CommentAuthorType } from '@/types/grievance';

interface CommentThreadProps {
  ticketId: string;
  currentUserId?: string;
  currentUserName: string;
  currentUserType: CommentAuthorType;
  isStaff?: boolean;
}

export function CommentThread({
  ticketId,
  currentUserId,
  currentUserName,
  currentUserType,
  isStaff = false
}: CommentThreadProps) {
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  // Fetch comments
  const { data: comments, isLoading } = useGrievanceComments(ticketId, isStaff);

  // Add comment mutation
  const addCommentMutation = useAddGrievanceComment();

  // Handle submit comment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim()) return;

    await addCommentMutation.mutateAsync({
      ticketId,
      data: {
        author_id: currentUserId,
        author_name: currentUserName,
        author_type: currentUserType,
        content: newComment.trim(),
        is_internal: isInternal
      }
    });

    // Reset form
    setNewComment('');
    setIsInternal(false);
  };

  // Get author icon
  const getAuthorIcon = (authorType: CommentAuthorType) => {
    switch (authorType) {
      case 'staff':
        return <Shield className="h-4 w-4" />;
      case 'learner':
        return <User className="h-4 w-4" />;
      case 'parent':
        return <Users className="h-4 w-4" />;
      case 'system':
        return <Bot className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  // Get author initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments ({comments?.length || 0})
        </CardTitle>
        <CardDescription>Discussion and updates on this ticket</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Comments List */}
        {comments && comments.length > 0 ? (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className={`flex gap-3 p-4 rounded-lg border ${
                  comment.is_internal ? 'bg-yellow-50 border-yellow-200' : 'bg-background'
                }`}
              >
                <Avatar>
                  <AvatarFallback className="bg-primary/10">
                    {getInitials(comment.author_name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-2">
                  {/* Author Info */}
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{comment.author_name}</span>
                    <Badge variant="outline" className="flex items-center gap-1">
                      {getAuthorIcon(comment.author_type)}
                      <span className="capitalize">{comment.author_type}</span>
                    </Badge>
                    {comment.is_internal && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                        Internal
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Comment Content */}
                  <p className="text-sm whitespace-pre-wrap">{comment.content}</p>

                  {/* Attachments */}
                  {comment.attachments && comment.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {comment.attachments.map((attachment, index) => (
                        <a
                          key={index}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          {attachment.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No comments yet. Be the first to comment!</p>
          </div>
        )}

        {/* Add Comment Form */}
        <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
          <div>
            <Label htmlFor="comment">Add Comment</Label>
            <Textarea
              id="comment"
              placeholder="Write your comment here..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
              className="mt-2"
            />
          </div>

          {/* Internal Comment Toggle (Staff only) */}
          {isStaff && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="internal"
                checked={isInternal}
                onCheckedChange={(checked) => setIsInternal(checked as boolean)}
              />
              <Label htmlFor="internal" className="text-sm cursor-pointer">
                Internal comment (visible to staff only)
              </Label>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!newComment.trim() || addCommentMutation.isPending}
            >
              {addCommentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Comment
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
