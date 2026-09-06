'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateCommunityPost } from '@/hooks/campus-living/use-community';
import type {
  HostelCommunityPostType,
  CreateHostelCommunityPostDTO,
} from '@/types/campus-living/community';

interface CreatePostDialogProps {
  institutionId: string;
  authorId: string | null;
  disabled?: boolean;
}

const POST_TYPE_OPTIONS: { value: HostelCommunityPostType; label: string }[] = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'event', label: 'Event' },
  { value: 'poll', label: 'Poll' },
  { value: 'discussion', label: 'Discussion' },
];

export function CreatePostDialog({
  institutionId,
  authorId,
  disabled = false,
}: CreatePostDialogProps) {
  const [open, setOpen] = useState(false);
  const [postType, setPostType] = useState<HostelCommunityPostType>('announcement');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [eventDate, setEventDate] = useState('');

  const createMut = useCreateCommunityPost();

  const reset = () => {
    setPostType('announcement');
    setTitle('');
    setBody('');
    setIsPinned(false);
    setEventDate('');
  };

  const handleSubmit = async () => {
    if (!institutionId) return;
    if (!title.trim() || !body.trim()) return;

    const payload: CreateHostelCommunityPostDTO = {
      institution_id: institutionId,
      post_type: postType,
      title: title.trim(),
      body: body.trim(),
      is_pinned: isPinned,
      is_published: true,
      author_id: authorId,
      event_date: postType === 'event' && eventDate ? eventDate : null,
    };

    try {
      await createMut.mutateAsync(payload);
      reset();
      setOpen(false);
    } catch {
      // hook handles toast
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled || !institutionId}>
          <Plus className="mr-2 h-4 w-4" />
          New Post
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New community post</DialogTitle>
          <DialogDescription>
            Shared with hostel residents in your institution. Published
            immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="post-type">Type</Label>
            <Select
              value={postType}
              onValueChange={(v) => setPostType(v as HostelCommunityPostType)}
            >
              <SelectTrigger id="post-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POST_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="post-title">Title</Label>
            <Input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary line"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="post-body">Body</Label>
            <Textarea
              id="post-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Details, links, dates…"
              rows={5}
              maxLength={5000}
            />
          </div>

          {postType === 'event' && (
            <div className="space-y-2">
              <Label htmlFor="post-event-date">Event date</Label>
              <Input
                id="post-event-date"
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="post-pinned" className="cursor-pointer">
                Pin to top
              </Label>
              <p className="text-xs text-muted-foreground">
                Pinned posts always sort first on the noticeboard.
              </p>
            </div>
            <Switch
              id="post-pinned"
              checked={isPinned}
              onCheckedChange={setIsPinned}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !title.trim() || !body.trim() || createMut.isPending
            }
          >
            {createMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
