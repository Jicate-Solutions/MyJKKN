'use client';

/**
 * Admission / Social / Engagement — the owner-facing console for the department
 * Instagram engagement loop. A handle MANAGER (admin / social.manage / the named
 * accountable owner) curates one handle at a time:
 *
 *   BRIEF     — set the handle's purpose line + content playbook + posting cadence (Clarity).
 *   REVIEW    — approve / decline / mark-posted member contributions, with a thank-you (Appreciation).
 *   ROTA      — see the weekly contributor rota, assign an upcoming week (Empowerment).
 *   CONCERNS  — resolve the "this post concerns me" safe-channel reports (Respect).
 *
 * All data flows through the engagement-service (fail-soft). Writes are gated by the
 * SECDEF RPCs / table RLS server-side — a non-manager sees an empty handle list and any
 * stray write returns 403. Gate: social.view (v1: the social team + admins manage; when
 * the Director delegates a handle to a faculty via accountable_owner_id, grant them the
 * Social view permission too).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Target, CheckCircle2, XCircle, Send, Heart, ShieldAlert, CalendarClock, Save, Link2 as LinkIcon,
} from 'lucide-react';
import {
  getManagedHandles, setBrief,
  getContributions, reviewContribution,
  getConcerns, resolveConcern,
  getRota, assignRota,
  getRecentPostsForHandle,
} from '@/lib/services/social/engagement-service';
import type {
  ManagedHandle, Contribution, ConcernReport, RotaEntry, RecentPost,
} from '@/lib/types/social-engagement';

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media', href: '/admission/social' },
  { label: 'Engagement' },
];

function EngagementConsole() {
  const [handles, setHandles] = useState<ManagedHandle[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loadingHandles, setLoadingHandles] = useState(true);
  const [handlesError, setHandlesError] = useState<string | null>(null);

  const selected = useMemo(() => handles.find((h) => h.dept_account_id === selectedId) ?? null, [handles, selectedId]);

  // Brief form
  const [purpose, setPurpose] = useState('');
  const [playbook, setPlaybook] = useState('');
  const [cadence, setCadence] = useState<string>('');
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefMsg, setBriefMsg] = useState<string | null>(null);

  // Loop data for the selected handle
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [concerns, setConcerns] = useState<ConcernReport[]>([]);
  const [rota, setRota] = useState<RotaEntry[]>([]);
  const [loadingLoop, setLoadingLoop] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Rota assign
  const [assignWeek, setAssignWeek] = useState('');
  const [assignContributor, setAssignContributor] = useState('');
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const loadHandles = useCallback(async () => {
    const res = await getManagedHandles();
    if (res.success) {
      const list = res.handles ?? [];
      setHandles(list);
      if (list.length > 0) setSelectedId((cur) => cur || list[0].dept_account_id);
    } else {
      setHandlesError(res.error ?? 'Could not load your handles.');
    }
    setLoadingHandles(false);
  }, []);

  useEffect(() => { void loadHandles(); }, [loadHandles]);

  // Sync the brief form + loop data when the selected handle changes. Keyed on selectedId so a
  // brief SAVE (which refreshes the handles array) does NOT re-run this and wipe the save message.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) return;
    setPurpose(selected.purpose_line ?? '');
    setPlaybook(selected.content_playbook ?? '');
    setCadence(selected.posting_cadence_days != null ? String(selected.posting_cadence_days) : '');
    void (async () => {
      setLoadingLoop(true);
      const [c, cn, r] = await Promise.all([
        getContributions(selected.dept_account_id, true),
        getConcerns(selected.dept_account_id),
        getRota(selected.dept_account_id),
      ]);
      setContributions(c.success ? c.contributions ?? [] : []);
      setConcerns(cn.success ? cn.concerns ?? [] : []);
      setRota(r.success ? r.rota ?? [] : []);
      setLoadingLoop(false);
    })();
  }, [selectedId]);

  const saveBrief = async () => {
    if (!selected) return;
    setSavingBrief(true); setBriefMsg(null);
    const res = await setBrief({
      dept_account_id: selected.dept_account_id,
      purpose_line: purpose,
      content_playbook: playbook,
      posting_cadence_days: cadence.trim() ? Number(cadence) : undefined,
    });
    setSavingBrief(false);
    if (res.success) { setHandles(res.handles ?? handles); setBriefMsg('Brief saved.'); }
    else setBriefMsg(res.error ?? 'Could not save.');
  };

  const doReview = async (
    id: string,
    status: 'approved' | 'declined' | 'posted',
    thank = false,
    igPostId?: string,
  ) => {
    setBusyId(id);
    const res = await reviewContribution({ id, status, thank, ig_post_id: igPostId });
    if (res.success && selected) {
      const c = await getContributions(selected.dept_account_id, true);
      setContributions(c.success ? c.contributions ?? [] : []);
    }
    setBusyId(null);
  };

  // Post-attribution picker — the owner links a contribution to the IG post it
  // became, so the recognition nudge credits the contributor with the post's REAL
  // signal (saves+shares+comments). Optional: if the post isn't polled in yet, the
  // owner can mark posted without a link and attribute it later.
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [chosenPostId, setChosenPostId] = useState('');

  const openPicker = async (contributionId: string) => {
    if (!selected) return;
    setPickerFor(contributionId);
    setChosenPostId('');
    setRecentPosts([]);
    setLoadingPosts(true);
    const res = await getRecentPostsForHandle(selected.dept_account_id);
    setRecentPosts(res.success ? res.posts ?? [] : []);
    setLoadingPosts(false);
  };
  const closePicker = () => { setPickerFor(null); setRecentPosts([]); setChosenPostId(''); };
  const confirmPosted = async (contributionId: string, igPostId?: string) => {
    await doReview(contributionId, 'posted', false, igPostId);
    closePicker();
  };

  const doResolveConcern = async (id: string, status: 'reviewing' | 'resolved') => {
    setBusyId(id);
    const res = await resolveConcern({ id, status });
    if (res.success && selected) {
      const cn = await getConcerns(selected.dept_account_id);
      setConcerns(cn.success ? cn.concerns ?? [] : []);
    }
    setBusyId(null);
  };

  const doAssign = async () => {
    if (!selected || !assignWeek || !assignContributor || assigning) return;
    setAssigning(true); setAssignMsg(null);
    // Snap the picked date to that week's Monday, so it matches the learner-side "your week"
    // check (which compares week_start === the current Monday).
    const d = new Date(assignWeek + 'T00:00:00Z');
    const dow = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    const monday = d.toISOString().slice(0, 10);
    const res = await assignRota({
      dept_account_id: selected.dept_account_id,
      week_start: monday,
      contributor_profile_id: assignContributor,
    });
    setAssigning(false);
    if (res.success) {
      const r = await getRota(selected.dept_account_id);
      setRota(r.success ? r.rota ?? [] : []);
      setAssignWeek(''); setAssignContributor(''); setAssignMsg('Assigned.');
    } else setAssignMsg(res.error ?? 'Could not assign.');
  };

  // Contributors seen in the queue — the pool the owner can hand a rota week to.
  const contributorPool = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of contributions) if (!seen.has(c.contributor_profile_id)) seen.set(c.contributor_profile_id, c.contributor_name ?? c.contributor_profile_id.slice(0, 8));
    return [...seen.entries()];
  }, [contributions]);

  const pending = contributions.filter((c) => c.status === 'submitted');
  const openConcerns = concerns.filter((c) => c.status !== 'resolved');

  if (loadingHandles) {
    return <div className="mt-6 space-y-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (handlesError) {
    return <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/30">{handlesError}</div>;
  }
  if (handles.length === 0) {
    return (
      <div className="mt-6 rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        You don&apos;t manage any department Instagram handles yet. Ask an administrator to set you as the
        accountable owner of a handle, or to grant you the Social management permission.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Handle picker */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted-foreground">Managing</label>
        <select
          value={selectedId}
          onChange={(e) => { setSelectedId(e.target.value); setBriefMsg(null); setAssignMsg(null); }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm min-w-64"
        >
          {handles.map((h) => (
            <option key={h.dept_account_id} value={h.dept_account_id}>
              @{h.username} · {h.department_name ?? ''} {h.metrics_source === 'graph' ? '' : '(no live signal)'}
            </option>
          ))}
        </select>
        {selected?.is_owner && <Badge variant="outline" className="border-fuchsia-300 text-fuchsia-700 dark:text-fuchsia-300">You own this</Badge>}
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Brief editor */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-emerald-600" /> The brief</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Purpose line — what this handle is for</label>
                <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} className="text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Content playbook — what earns real signal (saves/shares/comments, not likes)</label>
                <Textarea value={playbook} onChange={(e) => setPlaybook(e.target.value)} rows={6} className="text-sm mt-1" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Post every</label>
                <Input type="number" min={1} max={30} value={cadence} onChange={(e) => setCadence(e.target.value)} className="w-20 text-sm" />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={saveBrief} disabled={savingBrief}><Save className="h-3.5 w-3.5 mr-1.5" />{savingBrief ? 'Saving…' : 'Save brief'}</Button>
                {briefMsg && <span className="text-xs text-muted-foreground">{briefMsg}</span>}
              </div>
            </CardContent>
          </Card>

          {/* Rota */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4 text-sky-600" /> Contributor rota</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rota.length === 0 ? (
                <p className="text-sm text-muted-foreground">No weeks assigned yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {rota.slice(0, 6).map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-sm rounded-md border border-border px-3 py-1.5">
                      <span>Week of {r.week_start}</span>
                      <span className="text-muted-foreground">{r.contributor_name ?? r.contributor_profile_id.slice(0, 8)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Assign a week to a contributor</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" value={assignWeek} onChange={(e) => setAssignWeek(e.target.value)} className="w-40 text-sm" />
                  <select value={assignContributor} onChange={(e) => setAssignContributor(e.target.value)} className="rounded-md border border-input bg-background px-2 py-2 text-sm min-w-44">
                    <option value="">Pick a contributor…</option>
                    {contributorPool.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={doAssign} disabled={!assignWeek || !assignContributor || assigning}>{assigning ? 'Assigning…' : 'Assign'}</Button>
                </div>
                {contributorPool.length === 0 && <p className="text-[11px] text-muted-foreground">Contributors appear here once members submit ideas.</p>}
                {assignMsg && <p className="text-xs text-muted-foreground">{assignMsg}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Review queue */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4 text-fuchsia-600" /> Review queue
                {pending.length > 0 && <Badge variant="outline">{pending.length} pending</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingLoop ? <Skeleton className="h-16 w-full" /> : contributions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contributions yet — members can submit ideas from their dashboard.</p>
              ) : (
                contributions.map((c) => (
                  <div key={c.id} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm">{c.title || c.caption || <span className="text-muted-foreground">Untitled idea</span>}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {c.contributor_name ?? 'A member'} · <StatusBadge status={c.status} />{c.thanked_at ? ' · thanked' : ''}{c.status === 'posted' && c.ig_post_id ? ' · linked ✓' : ''}
                        </div>
                      </div>
                      {c.status === 'submitted' && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => doReview(c.id, 'approved', true)}>
                            <Heart className="h-3.5 w-3.5 mr-1 text-rose-500" /> Approve + thank
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busyId === c.id} onClick={() => doReview(c.id, 'declined')}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {c.status === 'approved' && pickerFor !== c.id && (
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => openPicker(c.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Mark posted
                        </Button>
                      )}
                      {c.status === 'posted' && !c.ig_post_id && pickerFor !== c.id && (
                        <Button size="sm" variant="ghost" disabled={busyId === c.id} onClick={() => openPicker(c.id)}>
                          <LinkIcon className="h-3.5 w-3.5 mr-1 text-sky-600" /> Link IG post
                        </Button>
                      )}
                    </div>

                    {/* Attribution picker — link this contribution to the post it became so
                        the contributor is credited for its real signal (saves/shares/comments). */}
                    {pickerFor === c.id && (
                      <div className="mt-3 rounded-md border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
                        <p className="text-xs text-muted-foreground mb-2">
                          Which Instagram post did this become? Linking it lets the contributor hear
                          that their post earned real signal.
                        </p>
                        {loadingPosts ? (
                          <Skeleton className="h-9 w-full" />
                        ) : (
                          <>
                            <select
                              value={chosenPostId}
                              onChange={(e) => setChosenPostId(e.target.value)}
                              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                            >
                              <option value="">Pick the post…</option>
                              {recentPosts.map((p) => (
                                <option key={p.post_id} value={p.post_id}>
                                  {p.posted_at ? p.posted_at.slice(0, 10) + ' · ' : ''}
                                  {(p.caption ?? 'Untitled post').slice(0, 60)}
                                </option>
                              ))}
                            </select>
                            {recentPosts.length === 0 && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                No recent posts found for this handle yet (they sync in periodically).
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                size="sm"
                                disabled={!chosenPostId || busyId === c.id}
                                onClick={() => confirmPosted(c.id, chosenPostId)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm posted + link
                              </Button>
                              {c.status === 'approved' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyId === c.id}
                                  onClick={() => confirmPosted(c.id, undefined)}
                                >
                                  Post not listed — mark without link
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" disabled={busyId === c.id} onClick={closePicker}>
                                Cancel
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Concerns */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600" /> Concerns
                {openConcerns.length > 0 && <Badge variant="outline" className="border-amber-300 text-amber-700">{openConcerns.length} open</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {concerns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No concerns raised. Members can report a post here if something needs attention.</p>
              ) : (
                concerns.map((c) => (
                  <div key={c.id} className="rounded-md border border-border p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm">{c.reason}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {c.post_ref ? <>re: {c.post_ref} · </> : null}
                        {c.reporter_profile_id ? 'reported by a member' : 'reported anonymously'} · <StatusBadge status={c.status} />
                      </div>
                    </div>
                    {c.status !== 'resolved' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.status === 'open' && (
                          <Button size="sm" variant="ghost" disabled={busyId === c.id} onClick={() => doResolveConcern(c.id, 'reviewing')}>Reviewing</Button>
                        )}
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => doResolveConcern(c.id, 'resolved')}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Resolve
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="uppercase tracking-wide">{status}</span>;
}

export default function SocialEngagementPage() {
  return (
    <PermissionGuard
      module="social"
      action="view"
      fallback={
        <ContentLayout title="Engagement">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator to grant the Social
            Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Department Engagement">
        <PageBreadcrumb items={breadcrumbItems} />
        <EngagementConsole />
      </ContentLayout>
    </PermissionGuard>
  );
}
