'use client';

// The Instagram reception panel on an event's console — the first link between
// the Events module and the Instagram data the institution already holds.
//
// It answers one question: how was this event received on Instagram? Engagement
// means saves + shares + comments and never likes, the definition set by the
// Social Loop (app/api/social/loop/route.ts). Likes are not shown at all, so
// there is nothing to mistake for the score.
//
// Three states, none of them blank:
//   • nothing linked  → says so, and shows how to link
//   • linked          → the posts, each post's real signal, and the total
//   • suggestions     → posts published around the event's dates, labelled as
//                       guesses. Time proximity is not proof, so a suggestion
//                       is never linked without someone clicking Link.
//
// Styling follows design-system/MASTER.md: the shipped <Card> primitive (which
// already carries border + shadow in both themes) and `bg-muted` for the
// neutral surface — never `bg-secondary`, which is saturated yellow in light.

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  ExternalLink,
  Instagram,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { EventIgPost, EventIgReception } from '@/lib/services/events/event-ig-reception-service';

type Reception = EventIgReception;

const formatDate = (value: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const truncate = (s: string | null, n = 90) =>
  !s ? '' : s.length > n ? `${s.slice(0, n)}…` : s;

/** One post row — linked or suggested. */
function PostRow({
  post,
  action,
  busy,
}: {
  post: EventIgPost;
  action: React.ReactNode;
  busy: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">
            {post.account_username ? `@${post.account_username}` : 'Unknown account'}
          </span>
          {post.media_type ? (
            <Badge variant="outline" className="text-[10px] uppercase">
              {post.media_type}
            </Badge>
          ) : null}
          {post.other_institution ? (
            <Badge variant="outline" className="text-[10px]">
              Another institution
            </Badge>
          ) : null}
          {formatDate(post.posted_at) ? (
            <span className="text-xs text-muted-foreground">
              {formatDate(post.posted_at)}
            </span>
          ) : null}
        </div>

        {post.caption ? (
          <p className="mt-1 text-xs text-muted-foreground">{truncate(post.caption)}</p>
        ) : null}

        {post.signal_unavailable ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Engagement is not readable for this account — unknown, not zero.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Bookmark className="h-3 w-3" /> {post.saves} saved
            </span>
            <span className="inline-flex items-center gap-1">
              <Send className="h-3 w-3" /> {post.shares} shared
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {post.comments} comments
            </span>
            <span className="font-medium text-foreground">
              {post.realSignal} real signal
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {post.permalink ? (
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open this post on Instagram"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : action}
      </div>
    </div>
  );
}

export function EventInstagramCard({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Reception | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/instagram`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        // Never render a blank panel on failure — say what went wrong.
        setLoadError(json?.error ?? 'Could not load Instagram reception.');
        setData(null);
      } else {
        setLoadError(null);
        setData(json as Reception);
      }
    } catch {
      setLoadError('Could not reach the server to load Instagram reception.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const link = async (igUrl: string, postId?: string) => {
    if (!igUrl.trim()) return;
    if (postId) setBusyPostId(postId);
    else setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/events/${eventId}/instagram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ig_url: igUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setMessage({ kind: 'err', text: json?.error ?? 'Could not link that post.' });
      } else {
        setMessage({ kind: 'ok', text: json.note ?? 'Post linked.' });
        setUrl('');
        await load();
      }
    } catch {
      setMessage({ kind: 'err', text: 'Could not reach the server.' });
    } finally {
      setSubmitting(false);
      setBusyPostId(null);
    }
  };

  const unlink = async (linkId: string, postId: string) => {
    setBusyPostId(postId);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/events/${eventId}/instagram?link_id=${encodeURIComponent(linkId)}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setMessage({ kind: 'err', text: json?.error ?? 'Could not unlink that post.' });
      } else {
        await load();
      }
    } catch {
      setMessage({ kind: 'err', text: 'Could not reach the server.' });
    } finally {
      setBusyPostId(null);
    }
  };

  const totals = data?.totals;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Instagram className="h-4 w-4 text-muted-foreground" />
          Instagram reception
        </CardTitle>
        <CardDescription>
          How this event was received on Instagram. Engagement counts saves, shares and
          comments — the actions that take effort. Likes are not counted.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : loadError ? (
          <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{loadError}</span>
          </div>
        ) : (
          <>
            {/* Totals — only once something is linked. */}
            {totals && totals.posts > 0 ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-muted p-3">
                <div>
                  <div className="text-2xl font-semibold leading-none">
                    {totals.realSignal}
                  </div>
                  <div className="text-xs text-muted-foreground">total real signal</div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {totals.saves} saved · {totals.shares} shared · {totals.comments}{' '}
                  comments across {totals.posts}{' '}
                  {totals.posts === 1 ? 'post' : 'posts'}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No Instagram posts are linked to this event yet, so we cannot say how it
                was received. Paste a post link below to start.
              </p>
            )}

            {/* Linked posts */}
            {data?.linked.length ? (
              <div className="space-y-2">
                {data.linked.map((p) => (
                  <PostRow
                    key={p.ig_post_id}
                    post={p}
                    busy={busyPostId === p.ig_post_id}
                    action={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Unlink this post"
                        onClick={() => p.link_id && unlink(p.link_id, p.ig_post_id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    }
                  />
                ))}
              </div>
            ) : null}

            {/* Caveats — rendered verbatim, never swallowed. */}
            {data?.caveats.map((c) => (
              <div
                key={c}
                className="flex items-start gap-2 rounded-lg border p-3 text-xs text-muted-foreground"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{c}</span>
              </div>
            ))}

            {/* Link box */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.instagram.com/p/…"
                  aria-label="Instagram post link"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void link(url);
                    }
                  }}
                />
                <Button onClick={() => void link(url)} disabled={submitting || !url.trim()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Link'}
                </Button>
              </div>
              {message ? (
                <p
                  className={
                    message.kind === 'ok'
                      ? 'text-xs text-muted-foreground'
                      : 'text-xs text-destructive'
                  }
                >
                  {message.text}
                </p>
              ) : null}
            </div>

            {/* Suggestions */}
            {data?.suggestions.length ? (
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Might be about this event</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Posted on this institution&apos;s accounts around this event&apos;s
                  dates. That is timing only, not proof — check each one before linking
                  it.
                </p>
                {data.suggestions.map((p) => (
                  <PostRow
                    key={p.ig_post_id}
                    post={p}
                    busy={busyPostId === p.ig_post_id}
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          p.permalink && void link(p.permalink, p.ig_post_id)
                        }
                        disabled={!p.permalink}
                      >
                        Link
                      </Button>
                    }
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
