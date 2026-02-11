'use client';

/**
 * Forums Client Component
 * Topic list, threaded discussion view, create topic, post replies, reactions
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  MessageSquare,
  Plus,
  Pin,
  Lock,
  ThumbsUp,
  Bookmark,
  Flag,
  Clock,
  ArrowLeft,
  Send,
  MessageCircle
} from 'lucide-react';
import {
  useForumTopics,
  useTopicPosts,
  useCreateTopic,
  useCreatePost,
  useReactToPost
} from '@/hooks/learners-council/use-lc-communication';
import type {
  LCForumTopic,
  LCForumPost,
  CreateForumTopicDto,
  ForumReactionType
} from '@/types/learners-council';

interface ForumsClientProps {
  initialTopics: LCForumTopic[];
  categories: string[];
  userId: string;
  userName: string;
}

export function ForumsClient({ initialTopics, categories, userId, userName }: ForumsClientProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  // Create topic form
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formDescription, setFormDescription] = useState('');

  const filters = {
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    page: 1,
    limit: 20
  };

  const { data: topicsData, isLoading } = useForumTopics(filters);
  const createTopicMutation = useCreateTopic();

  const topics = topicsData?.data || initialTopics;

  const handleCreateTopic = () => {
    if (!formTitle.trim()) return;

    const dto: CreateForumTopicDto = {
      title: formTitle.trim(),
      category: formCategory,
      description: formDescription.trim() || undefined
    };

    createTopicMutation.mutate(
      { data: dto, userId },
      {
        onSuccess: () => {
          setShowCreateDialog(false);
          setFormTitle('');
          setFormCategory('general');
          setFormDescription('');
        }
      }
    );
  };

  // If viewing a topic's discussion
  if (activeTopicId) {
    const activeTopic = topics.find((t) => t.id === activeTopicId);
    return (
      <TopicDiscussion
        topicId={activeTopicId}
        topic={activeTopic || null}
        userId={userId}
        userName={userName}
        onBack={() => setActiveTopicId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            Discussion Forums
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Discuss ideas, share feedback, and collaborate with fellow Learners
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Topic
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Discussion Topic</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Title</label>
                <Input
                  placeholder="What would you like to discuss?"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Category</label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="academics">Academics</SelectItem>
                    <SelectItem value="events">Events</SelectItem>
                    <SelectItem value="suggestions">Suggestions</SelectItem>
                    <SelectItem value="feedback">Feedback</SelectItem>
                    <SelectItem value="announcements">Announcements</SelectItem>
                    {categories
                      .filter(
                        (c) =>
                          !['general', 'academics', 'events', 'suggestions', 'feedback', 'announcements'].includes(c)
                      )
                      .map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                <Textarea
                  placeholder="Add more context to start the discussion..."
                  rows={4}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateTopic}
                disabled={createTopicMutation.isPending || !formTitle.trim()}
              >
                {createTopicMutation.isPending ? 'Creating...' : 'Create Topic'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Filter */}
      <div className="flex gap-3 items-center">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="academics">Academics</SelectItem>
            <SelectItem value="events">Events</SelectItem>
            <SelectItem value="suggestions">Suggestions</SelectItem>
            <SelectItem value="feedback">Feedback</SelectItem>
            {categories
              .filter(
                (c) =>
                  !['general', 'academics', 'events', 'suggestions', 'feedback'].includes(c)
              )
              .map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Topic List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : topics.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No topics yet. Start a discussion!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {topics.map((topic) => (
            <Card
              key={topic.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setActiveTopicId(topic.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 mt-0.5">
                    <AvatarFallback className="text-xs">
                      {topic.creator?.full_name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {topic.is_pinned && (
                        <Pin className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      )}
                      {topic.is_locked && (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <h3 className="font-semibold text-sm truncate">{topic.title}</h3>
                    </div>
                    {topic.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                        {topic.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                        {topic.category}
                      </Badge>
                      <span>{topic.creator?.full_name}</span>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        <span>{topic.post_count || 0}</span>
                      </div>
                      {topic.last_post_at && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {new Date(topic.last_post_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short'
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TopicDiscussion Sub-component
// ============================================================================

function TopicDiscussion({
  topicId,
  topic,
  userId,
  userName,
  onBack
}: {
  topicId: string;
  topic: LCForumTopic | null;
  userId: string;
  userName: string;
  onBack: () => void;
}) {
  const [replyContent, setReplyContent] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);

  const { data: postsData, isLoading } = useTopicPosts(topicId);
  const createPostMutation = useCreatePost();
  const reactMutation = useReactToPost();

  const posts = postsData?.data || [];

  const handleReply = () => {
    if (!replyContent.trim()) return;

    createPostMutation.mutate(
      {
        data: {
          topic_id: topicId,
          parent_id: replyToId || undefined,
          content: replyContent.trim()
        },
        userId
      },
      {
        onSuccess: () => {
          setReplyContent('');
          setReplyToId(null);
        }
      }
    );
  };

  const handleReact = (postId: string, type: ForumReactionType) => {
    reactMutation.mutate({ postId, userId, type, topicId });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {topic?.is_pinned && <Pin className="h-4 w-4 text-amber-500 fill-amber-500" />}
            {topic?.is_locked && <Lock className="h-4 w-4 text-muted-foreground" />}
            <h2 className="text-xl font-bold truncate">{topic?.title || 'Discussion'}</h2>
          </div>
          {topic && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <Badge variant="outline" className="text-xs">{topic.category}</Badge>
              <span>by {topic.creator?.full_name}</span>
              <span>{topic.post_count || 0} posts</span>
            </div>
          )}
        </div>
      </div>

      {topic?.description && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{topic.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Posts */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <MessageCircle className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No replies yet. Be the first!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              userId={userId}
              topicId={topicId}
              onReact={handleReact}
              onReply={(postId) => setReplyToId(postId)}
            />
          ))}
        </div>
      )}

      {/* Reply Box */}
      {!topic?.is_locked && (
        <Card>
          <CardContent className="p-4">
            {replyToId && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 bg-muted/50 rounded p-2">
                <span>Replying to a post</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1"
                  onClick={() => setReplyToId(null)}
                >
                  Cancel
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                placeholder="Write your reply..."
                rows={2}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="flex-1"
              />
              <Button
                size="icon"
                className="self-end"
                onClick={handleReply}
                disabled={createPostMutation.isPending || !replyContent.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// PostItem Sub-component
// ============================================================================

function PostItem({
  post,
  userId,
  topicId,
  onReact,
  onReply,
  isReply = false
}: {
  post: LCForumPost;
  userId: string;
  topicId: string;
  onReact: (postId: string, type: ForumReactionType) => void;
  onReply: (postId: string) => void;
  isReply?: boolean;
}) {
  const likeCount = post.reaction_counts?.like || 0;
  const saveCount = post.reaction_counts?.save || 0;
  const flagCount = post.reaction_counts?.flag || 0;

  // Check if current user reacted
  const reactions = (post.reactions || []) as { user_id: string; type: string }[];
  const userLiked = reactions.some((r) => r.user_id === userId && r.type === 'like');
  const userSaved = reactions.some((r) => r.user_id === userId && r.type === 'save');

  if (post.status === 'hidden') {
    return (
      <div className={`${isReply ? 'ml-10' : ''} p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground italic`}>
        This post has been hidden by a moderator.
      </div>
    );
  }

  return (
    <div className={isReply ? 'ml-10' : ''}>
      <Card className={isReply ? 'border-l-2 border-l-muted-foreground/20' : ''}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {post.author?.full_name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{post.author?.full_name || 'Unknown'}</span>
                <span className="text-muted-foreground text-xs">
                  {new Date(post.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                {post.edited_at && (
                  <span className="text-muted-foreground text-xs">(edited)</span>
                )}
              </div>
              <div className="mt-2 text-sm whitespace-pre-wrap">{post.content}</div>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 gap-1 text-xs ${userLiked ? 'text-primary' : 'text-muted-foreground'}`}
                  onClick={() => onReact(post.id, 'like')}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  {likeCount > 0 && <span>{likeCount}</span>}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 gap-1 text-xs ${userSaved ? 'text-primary' : 'text-muted-foreground'}`}
                  onClick={() => onReact(post.id, 'save')}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  {saveCount > 0 && <span>{saveCount}</span>}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={() => onReact(post.id, 'flag')}
                >
                  <Flag className="h-3.5 w-3.5" />
                </Button>
                {!isReply && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground"
                    onClick={() => onReply(post.id)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Reply
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nested Replies */}
      {post.replies && post.replies.length > 0 && (
        <div className="space-y-2 mt-2">
          {post.replies.map((reply) => (
            <PostItem
              key={reply.id}
              post={reply}
              userId={userId}
              topicId={topicId}
              onReact={onReact}
              onReply={onReply}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}
