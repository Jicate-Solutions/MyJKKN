'use client';

/**
 * Gemba visits — client surface.
 *
 * Three panels, one department at a time:
 *
 *   1. Playbook documents, each badged Official / Lapsed / Proposed. The badge
 *      is computed by the single `officialState()` helper, so an expiry can
 *      never read as official in one place and lapsed in another.
 *   2. The visits themselves — who went, when, what they found, and the
 *      self-recorded marker where it applies.
 *   3. The department's replies. A reply never edits, hides or supersedes an
 *      observation; both records stand and a reader sees both accounts.
 *
 * Everything is read through RLS-scoped queries, so this component renders what
 * the viewer may already see and never widens it. Writes go through the two
 * SECURITY DEFINER RPCs only.
 *
 * The gate on improvement.ideas.view is enforced here with an explicit
 * no-access panel naming who to contact — never a silent redirect (CLAUDE.md
 * rule 27).
 *
 * `v_gemba_area_summary` — the notes-free leadership lens — is deliberately not
 * rendered on this screen. This is the department lens, and it reads notes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  CheckCircle2,
  Footprints,
  Lightbulb,
  MessageSquare,
  Plus,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  GembaService,
  OFFICIAL_STATE_BADGE_CLASS,
  OFFICIAL_STATE_LABEL,
  artifactLabel,
  officialState,
  type GembaArea,
  type GembaArtifact,
  type GembaObservation,
} from '@/lib/services/improvement/gemba-service';
import { RecordVisitDialog } from './record-visit-dialog';

/** Officers may record a visit anywhere — the RPC's second lane. */
const OFFICER_PERMISSION = 'improvement.area_role.assign';

/**
 * Officers who may READ the screen but not necessarily record anywhere.
 * `gemba_observations_read` grants SELECT on this key too; the record RPC does
 * not, so it is deliberately absent from OFFICER_PERMISSION above.
 */
const BOARD_MANAGE_PERMISSION = 'improvement.board.manage';

function formatWhen(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface GembaClientProps {
  currentUserId: string;
  currentUserName: string;
}

export function GembaClient({ currentUserId, currentUserName }: GembaClientProps) {
  const { can, isLoading: permsLoading, isSuperAdmin } = usePermissions();
  // can() returns false while permissions load, so branch on permsLoading FIRST
  // below — a still-loading state must never read as "denied".
  // Open the screen to the same union the database already grants read on.
  // `gemba_observations_read` allows improvement.area_role.assign OR
  // improvement.board.manage as well as a posting, and that migration's own
  // comment records why: "the CAO and Executive Administrative Officers do not
  // hold ideas.view at all." Gating on ideas.view alone locked out every
  // officer the RPC's officer lane exists for.
  const canView =
    isSuperAdmin ||
    can('improvement.ideas.view') ||
    can(OFFICER_PERMISSION) ||
    can(BOARD_MANAGE_PERMISSION);
  const isOfficer = isSuperAdmin || can(OFFICER_PERMISSION);

  const [postedAreas, setPostedAreas] = useState<GembaArea[] | null>(null);
  const [allAreas, setAllAreas] = useState<GembaArea[] | null>(null);
  const [areaId, setAreaId] = useState<string>('');
  const [artifacts, setArtifacts] = useState<GembaArtifact[] | null>(null);
  const [observations, setObservations] = useState<GembaObservation[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Departments this person may record against. A posted associate gets their
  // postings; an officer gets every active department.
  const recordableAreas = useMemo(() => {
    if (isOfficer) return allAreas ?? postedAreas ?? [];
    return postedAreas ?? [];
  }, [isOfficer, allAreas, postedAreas]);

  const postedAreaIds = useMemo(
    () => (postedAreas ?? []).map((a) => a.id),
    [postedAreas]
  );

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    Promise.all([
      GembaService.myPostedAreas(),
      isOfficer ? GembaService.listAllAreas() : Promise.resolve<GembaArea[]>([]),
    ]).then(([posted, all]) => {
      if (cancelled) return;
      setPostedAreas(posted);
      setAllAreas(all);
      const first = (isOfficer && all.length > 0 ? all : posted)[0];
      if (first) setAreaId((current) => current || first.id);
    });
    return () => {
      cancelled = true;
    };
  }, [canView, isOfficer]);

  const loadArea = useCallback(async (id: string) => {
    const [a, o] = await Promise.all([
      GembaService.listArtifacts(id),
      GembaService.listObservations(id),
    ]);
    return { a, o };
  }, []);

  useEffect(() => {
    if (!canView || !areaId) return;
    let cancelled = false;
    setArtifacts(null);
    setObservations(null);
    loadArea(areaId).then(({ a, o }) => {
      if (cancelled) return;
      setArtifacts(a);
      setObservations(o);
    });
    return () => {
      cancelled = true;
    };
  }, [canView, areaId, loadArea]);

  const refresh = useCallback(() => {
    if (!areaId) return;
    loadArea(areaId).then(({ a, o }) => {
      setArtifacts(a);
      setObservations(o);
    });
  }, [areaId, loadArea]);

  const handleReply = async (observationId: string) => {
    const body = (replyDrafts[observationId] ?? '').trim();
    if (!body) {
      toast.error('A reply needs something in it.');
      return;
    }
    setReplyingTo(observationId);
    try {
      await GembaService.reply(observationId, body);
      setReplyDrafts((d) => ({ ...d, [observationId]: '' }));
      toast.success('Reply posted. The observation stays exactly as it was.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not post the reply.');
    } finally {
      setReplyingTo(null);
    }
  };

  // --- Gates ----------------------------------------------------------------

  if (permsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-16">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
            <div>
              <p className="font-medium">Gemba visits are for the Improvement Board</p>
              <p className="text-muted-foreground mt-1 text-sm">
                You don&apos;t have access to record or read gemba visits. If you
                believe this is a mistake, contact your programme lead — they can
                grant Improvement Board access and post you to a department.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/improvement-board">Back to the Improvement Board</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const areasLoading = postedAreas === null;
  const selectedArea = recordableAreas.find((a) => a.id === areaId) ?? null;
  const canRecordHere = isOfficer || postedAreaIds.includes(areaId);

  return (
    <div className="space-y-6">
      {/* Header ------------------------------------------------------------ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Footprints className="text-primary h-6 w-6" />
            Gemba visits
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            A playbook becomes official when somebody goes and looks — not when
            it is approved at a desk. Record what you found, and the document you
            checked is vouched for until it needs another visit.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={areasLoading || recordableAreas.length === 0}
        >
          <Plus className="mr-2 h-4 w-4" />
          Record a visit
        </Button>
      </div>

      {/* No postings ------------------------------------------------------- */}
      {!areasLoading && recordableAreas.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 p-6">
            <p className="font-medium">You are not posted to a department yet</p>
            <p className="text-muted-foreground text-sm">
              A visit can only be recorded by someone posted to the department
              they walked into. Ask your programme lead to post you on the
              Analyst Assignments screen, and this page will fill in.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Department picker -------------------------------------------------- */}
      {recordableAreas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recordableAreas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAreaId(a.id)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                a.id === areaId
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted border-border'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {selectedArea && !canRecordHere && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You can read {selectedArea.label}, but you are not posted there, so
            you cannot record a visit to it.
          </span>
        </div>
      )}

      {/* Playbook documents -------------------------------------------------- */}
      {selectedArea && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {selectedArea.label} — playbook documents
          </h2>
          {artifacts === null ? (
            <Skeleton className="h-28 w-full" />
          ) : artifacts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No playbook documents drafted for this department yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {artifacts.map((artifact) => {
                const state = officialState(artifact);
                return (
                  <Card key={artifact.id}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">
                          {artifactLabel(artifact.artifact_type)}
                        </p>
                        <Badge
                          variant="outline"
                          className={OFFICIAL_STATE_BADGE_CLASS[state]}
                        >
                          {OFFICIAL_STATE_LABEL[state]}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {state === 'proposed' && 'Nobody has been to look yet.'}
                        {state === 'official' &&
                          `Vouched for on ${formatWhen(artifact.official_at)}${
                            artifact.official_until
                              ? ` · holds until ${formatWhen(artifact.official_until)}`
                              : ''
                          }`}
                        {state === 'lapsed' &&
                          `Was official until ${formatWhen(artifact.official_until)}.`}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Visits --------------------------------------------------------------- */}
      {selectedArea && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Visits</h2>
          {observations === null ? (
            <Skeleton className="h-32 w-full" />
          ) : observations.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground text-sm">
                  Nobody has recorded a visit to {selectedArea.label} yet. Until
                  someone does, every document here stays proposed.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {observations.map((o) => (
                <Card key={o.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {o.observed_by === currentUserId
                            ? currentUserName
                            : o.observer_name || 'A member of the programme'}
                          {o.finding === 'matches' ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-100 text-emerald-800"
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Matches
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-100 text-amber-800"
                            >
                              <AlertCircle className="mr-1 h-3 w-3" />
                              Differs
                            </Badge>
                          )}
                          {o.is_self_recorded && (
                            <Badge
                              variant="outline"
                              className="border-slate-200 bg-slate-100 text-slate-700"
                            >
                              <UserCheck className="mr-1 h-3 w-3" />
                              Self-recorded
                            </Badge>
                          )}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Visited {formatWhen(o.observed_at)}
                          {o.artifact_label ? ` · checked the ${o.artifact_label}` : ''}
                        </p>
                      </div>
                      {o.raised_idea_id && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/improvement-board">
                            <Lightbulb className="mr-1 h-3.5 w-3.5" />
                            Idea raised
                          </Link>
                        </Button>
                      )}
                    </div>

                    {o.notes && (
                      <p className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-wrap">
                        {o.notes}
                      </p>
                    )}

                    {/* Replies — the observation above is never edited. */}
                    {o.replies.length > 0 && (
                      <div className="space-y-2 border-l-2 pl-3">
                        {o.replies.map((r) => (
                          <div key={r.id} className="text-sm">
                            <p className="text-muted-foreground text-xs">
                              {r.author_id === currentUserId
                                ? currentUserName
                                : r.author_name || 'The department'}{' '}
                              · {formatWhen(r.created_at)}
                            </p>
                            <p className="whitespace-pre-wrap">{r.body}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Textarea
                        rows={2}
                        placeholder="Reply — the observation stays exactly as it is."
                        value={replyDrafts[o.id] ?? ''}
                        onChange={(e) =>
                          setReplyDrafts((d) => ({ ...d, [o.id]: e.target.value }))
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          replyingTo === o.id || !(replyDrafts[o.id] ?? '').trim()
                        }
                        onClick={() => handleReply(o.id)}
                      >
                        <MessageSquare className="mr-2 h-3.5 w-3.5" />
                        {replyingTo === o.id ? 'Posting…' : 'Reply'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      <RecordVisitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        areas={recordableAreas}
        postedAreaIds={postedAreaIds}
        isOfficer={isOfficer}
        defaultAreaId={areaId}
        onRecorded={refresh}
      />
    </div>
  );
}
