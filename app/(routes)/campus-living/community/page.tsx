'use client';

/**
 * /campus-living/community — Hostel Community noticeboard
 *
 * Wired 2026-05-20 (Agent ξ). Replaces ComingSoon. Reads
 * `hostel_community_posts` (added in companion migration); filter chips
 * by post_type, search by title, pinned posts float top.
 *
 * Per-institution scope via useAuth().profile.institution_id; super-admin
 * sees an empty-state prompt to pick an institution.
 *
 * Permission gate for create: any authenticated user in the same
 * institution can post (RLS enforces). Wardens / admins additionally get a
 * pin toggle on each card. Delete is admin-only (handled server-side via
 * RLS — UI hides the button when the role check fails).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users2,
  Search,
  Loader2,
  Megaphone,
  CalendarDays,
  Vote,
  MessageCircle,
  Pin,
  PinOff,
  Trash2,
  Settings2,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCommunityPosts,
  useDeleteCommunityPost,
  useToggleCommunityPostPin,
} from '@/hooks/campus-living/use-community';
import type { HostelCommunityPostType } from '@/types/campus-living/community';
import { CreatePostDialog } from './_components/create-post-dialog';

const TYPE_FILTERS: { value: HostelCommunityPostType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'event', label: 'Events' },
  { value: 'poll', label: 'Polls' },
  { value: 'discussion', label: 'Discussions' },
];

const TYPE_META: Record<
  HostelCommunityPostType,
  { icon: React.ComponentType<{ className?: string }>; label: string; badge: string }
> = {
  announcement: {
    icon: Megaphone,
    label: 'Announcement',
    badge: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  },
  event: {
    icon: CalendarDays,
    label: 'Event',
    badge: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  },
  poll: {
    icon: Vote,
    label: 'Poll',
    badge: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  },
  discussion: {
    icon: MessageCircle,
    label: 'Discussion',
    badge: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return new Date(iso).toLocaleDateString();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function CampusLivingCommunityPage() {
  const { profile } = useAuth();
  const { permissions, isSuperAdmin } = usePermissions();
  const institutionId = profile?.institution_id ?? undefined;

  // Admins / wardens can pin + delete; everyone else can read + create.
  const isAdmin =
    isSuperAdmin ||
    permissions?.['campus_living.community.manage'] === true ||
    permissions?.['campus_living.settings.edit'] === true;

  const [typeFilter, setTypeFilter] = useState<'all' | HostelCommunityPostType>('all');
  const [search, setSearch] = useState('');

  const filters = useMemo(
    () => ({
      ...(typeFilter !== 'all' ? { post_type: typeFilter } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [typeFilter, search],
  );

  const { data: posts = [], isLoading, isError, error } = useCommunityPosts(
    institutionId,
    filters,
  );
  const deleteMut = useDeleteCommunityPost();
  const pinMut = useToggleCommunityPostPin();

  const counts = useMemo(() => {
    const c: Record<HostelCommunityPostType | 'total', number> = {
      total: posts.length,
      announcement: 0,
      event: 0,
      poll: 0,
      discussion: 0,
    };
    for (const p of posts) c[p.post_type] += 1;
    return c;
  }, [posts]);

  return (
    <ContentLayout title="Hostel Community">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Community' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link href="/campus-living">
              <Button variant="ghost" size="sm" className="-ml-3 mb-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Campus Living
              </Button>
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users2 className="h-6 w-6 text-primary" />
              Hostel Community
            </h1>
            <p className="text-muted-foreground">
              Noticeboard for announcements, events, polls, and discussions
              across the hostel.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/campus-living/community/settings">
              <Button variant="outline">
                <Settings2 className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </Link>
            <CreatePostDialog
              institutionId={institutionId ?? ''}
              authorId={profile?.id ?? null}
              disabled={!institutionId}
            />
          </div>
        </div>

        {!institutionId ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Pick an institution</AlertTitle>
            <AlertDescription>
              Community posts are scoped per-institution. Super admins must
              switch into an institution context to view or post.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{counts.total}</p>
            </CardContent>
          </Card>
          {(['announcement', 'event', 'poll', 'discussion'] as HostelCommunityPostType[]).map(
            (t) => {
              const Meta = TYPE_META[t];
              const Icon = Meta.icon;
              return (
                <Card key={t}>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <Icon className="h-3 w-3" />
                      {Meta.label}s
                    </p>
                    <p className="text-2xl font-bold">{counts[t]}</p>
                  </CardContent>
                </Card>
              );
            },
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={typeFilter}
                onValueChange={(v) =>
                  setTypeFilter(v as 'all' | HostelCommunityPostType)
                }
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        {isError ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load posts</AlertTitle>
            <AlertDescription>
              {(error as Error)?.message ?? 'Unknown error'}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
          </Card>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Users2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium">No posts yet</h3>
              <p className="text-sm text-muted-foreground">
                Be the first to post — use <strong>New Post</strong> above.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {posts.map((p) => {
              const Meta = TYPE_META[p.post_type];
              const Icon = Meta.icon;
              return (
                <Card
                  key={p.id}
                  className={p.is_pinned ? 'border-amber-300 bg-amber-50/30' : undefined}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <Badge className={Meta.badge}>
                            <Icon className="mr-1 h-3 w-3" />
                            {Meta.label}
                          </Badge>
                          {p.is_pinned ? (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              <Pin className="mr-1 h-3 w-3" />
                              Pinned
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {relativeTime(p.created_at)}
                          </span>
                          {p.post_type === 'event' && p.event_date ? (
                            <span className="text-xs text-purple-700">
                              · {new Date(p.event_date).toLocaleString()}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="font-semibold leading-tight">{p.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                          {p.body}
                        </p>
                      </div>
                      {isAdmin ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              pinMut.mutate({ id: p.id, is_pinned: !p.is_pinned })
                            }
                            disabled={pinMut.isPending}
                            title={p.is_pinned ? 'Unpin' : 'Pin'}
                          >
                            {p.is_pinned ? (
                              <PinOff className="h-4 w-4" />
                            ) : (
                              <Pin className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete "${p.title}"? This can't be undone.`,
                                )
                              ) {
                                deleteMut.mutate(p.id);
                              }
                            }}
                            disabled={deleteMut.isPending}
                            className="text-red-600 hover:text-red-700"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
