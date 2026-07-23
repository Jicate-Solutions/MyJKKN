'use client';

// components/dashboard/dept-ig-feed-card.tsx — the learner's own department Instagram
// handle brought IN to the dashboard (not a bare link-out). Shows the handle's purpose,
// recent posts deep-linked to the exact post, and the loop hooks (your turn to post /
// your idea's status / submit an idea). Ranks each post on REAL signal (saves+shares+
// comments) — likes are shown greyed for context, never as the headline. Self-hides when
// the learner's department has no graph-tier handle, so it never clutters an unaffected
// dashboard. Shared by the v2 dashboard and any learner surface.

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Instagram, ExternalLink, Sparkles, Send, CheckCircle2, Film, Images, ImageIcon } from 'lucide-react';
import { getHandleFeed, submitContribution } from '@/lib/services/social/engagement-service';
import type { DeptHandle, FeedPost, RotaEntry } from '@/lib/types/social-engagement';

function mediaIcon(type: string | null) {
  if (type === 'VIDEO' || type === 'REELS') return <Film className="h-3.5 w-3.5" />;
  if (type === 'CAROUSEL_ALBUM') return <Images className="h-3.5 w-3.5" />;
  return <ImageIcon className="h-3.5 w-3.5" />;
}

/** Current week's Monday as YYYY-MM-DD, in IST (the ERP's operating timezone). */
function currentMondayIST(): string {
  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000); // shift to IST wall-clock
  const dow = istNow.getUTCDay(); // 0=Sun..6=Sat on the shifted clock
  const monday = new Date(istNow);
  monday.setUTCDate(istNow.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return monday.toISOString().slice(0, 10);
}

/** Friendly "week of 12 Aug" label for an upcoming rota turn. */
function weekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function DeptIgFeedCard() {
  const [handle, setHandle] = useState<DeptHandle | null>(null);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [myRota, setMyRota] = useState<RotaEntry | null>(null);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  const [composing, setComposing] = useState(false);
  const [idea, setIdea] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getHandleFeed(6);
    if (res.success && res.handle) {
      setHandle(res.handle);
      setFeed(res.feed ?? []);
      setMyRota(res.myRota ?? null);
      setPending(res.myPendingContributions ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!handle || !idea.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await submitContribution({ dept_account_id: handle.dept_account_id, caption: idea.trim() });
    setSubmitting(false);
    if (res.success) {
      setSubmitted(true);
      setIdea('');
      setComposing(false);
      setPending((n) => n + 1);
    } else {
      setSubmitError(res.error ?? 'Could not submit. Please try again.');
    }
  };

  // Self-hide until we know there's a handle for this learner's department.
  if (loading || !handle) return null;

  return (
    <Card className="border-fuchsia-200/70 dark:border-fuchsia-900/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Instagram className="h-4 w-4 text-fuchsia-600" />
            Your department on Instagram
          </CardTitle>
          <a
            href={`https://instagram.com/${handle.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-fuchsia-700 dark:text-fuchsia-400 hover:underline whitespace-nowrap"
          >
            @{handle.username}
          </a>
        </div>
        {handle.purpose_line ? (
          <p className="text-xs text-muted-foreground mt-1">{handle.purpose_line}</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">{handle.department_name}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Loop hooks */}
        {myRota && (
          <div className="flex items-start gap-2 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-sm text-fuchsia-900 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/30 dark:text-fuchsia-200">
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {myRota.week_start === currentMondayIST()
                ? <>It&apos;s your week to shape the feed — share an idea below.</>
                : <>Your turn is coming up (week of {weekLabel(myRota.week_start)}) — start gathering ideas.</>}
            </span>
          </div>
        )}

        {/* Feed — real posts, deep-linked, scored on real signal */}
        {feed.length > 0 ? (
          <ul className="space-y-1.5">
            {feed.map((p) => (
              <li key={p.post_id}>
                <a
                  href={p.permalink ?? `https://instagram.com/${handle.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
                >
                  <span className="text-neutral-500 shrink-0">{mediaIcon(p.media_type)}</span>
                  <span className="flex-1 min-w-0 text-sm truncate">
                    {p.caption?.trim() || <span className="text-muted-foreground">Untitled post</span>}
                  </span>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                    title="Real signal = saves + shares + comments"
                  >
                    {p.real_signal} signal
                  </Badge>
                  <span className="shrink-0 text-[11px] text-neutral-400" title="Likes (context only, not scored)">
                    ♥ {p.likes}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-400 group-hover:text-fuchsia-600" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No posts yet — be the first to shape what your department shares.</p>
        )}

        {/* Submit an idea (loop hook — invited, never pushed) */}
        {submitted ? (
          <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Thanks — your idea is with the handle owner for review.</span>
          </div>
        ) : composing ? (
          <div className="space-y-2">
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="A post idea, a caption, or something worth sharing from your department…"
              rows={3}
              className="text-sm"
            />
            {submitError && <p className="text-xs text-red-600">{submitError}</p>}
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={submit} disabled={submitting || !idea.trim()}>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {submitting ? 'Sending…' : 'Send to owner'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setComposing(false)} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setComposing(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Share an idea
            </Button>
            {pending > 0 && (
              <span className="text-xs text-muted-foreground">
                {pending} of your idea{pending === 1 ? '' : 's'} awaiting review
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
