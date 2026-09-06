'use client';

// =============================================================================
// Curriculum-aware class poll — Phase 2: Faculty lesson-spine REVIEW + APPROVE UI
// =============================================================================
// The AI bulk-mint cron (/api/cron/curriculum-lesson-spine-generate) drafts an
// ordered lesson spine for BoS-covered courses, as status='draft' rows a human
// must ratify. This page is that ratification surface:
//   • left: the review inbox — courses that have AI drafts pending
//     (fn_curriculum_courses_with_pending_ai_drafts)
//   • right: the selected course's draft spine (fn_curriculum_lesson_drafts_for_course),
//     each lesson editable (re-word title, re-tag each outcome's Fink/Bloom/co_ref)
//     then APPROVE (draft→published via fn_curriculum_lesson_ai_approve) or REJECT
//     (draft→archived via fn_curriculum_lesson_ai_reject).
// HARD INVARIANT: a draft is student-invisible and inert until approved here. AI is
// the author, faculty is the authority. HOD/admin override applies (server-gated).
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen, Sparkles, Check, X, Loader2, ChevronRight, Info, PencilLine,
} from 'lucide-react';

import { AiTaskButton } from '@/components/ai-tasks/ai-task-button';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CurriculumService,
  FINK_OPTIONS,
  BLOOM_OPTIONS,
  finkLabel,
  bloomLabel,
  isBloomPrimary,
  type CourseWithPendingDrafts,
  type DraftArtifact,
  type LessonOutcome,
  type FinkDimension,
} from '@/lib/services/curriculum/curriculum-service';

const BRAND = '#0b6d41';

// Local editable copy of a draft so a faculty's in-progress edits don't mutate the
// fetched list until they approve.
type EditState = Record<
  string,
  {
    title: string;
    primaryFink: FinkDimension | '';
    primaryBloom: string;                         // K1..K6, used when taxonomy = 'blooms'
    primaryTaxonomy: 'finks' | 'blooms' | 'jkkn_advanced' | null;   // read-only branch: which primary picker to show
    outcomes: LessonOutcome[];
  }
>;

function kindLabel(kind: DraftArtifact['artifact_kind']): string {
  return kind === 'lesson' ? 'Lesson'
    : kind === 'concept_brief' ? 'Concept-Application brief'
    : 'Team-capstone brief';
}

export default function CurriculumReviewPage() {
  const [inbox, setInbox] = useState<CourseWithPendingDrafts[] | null>(null);
  const [selected, setSelected] = useState<CourseWithPendingDrafts | null>(null);
  const [drafts, setDrafts] = useState<DraftArtifact[] | null>(null);
  const [edits, setEdits] = useState<EditState>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setInboxError(null);
    try {
      const rows = await CurriculumService.coursesWithPendingDrafts();
      setInbox(rows);
      // keep the selection if it still has drafts, else clear
      setSelected((prev) => (prev && rows.some((r) => r.course_id === prev.course_id) ? prev : null));
    } catch (e) {
      setInbox([]);
      setInboxError(e instanceof Error ? e.message : 'Could not load the review inbox.');
    }
  }, []);

  const loadDrafts = useCallback(async (courseId: string) => {
    setLoadingDrafts(true);
    try {
      const rows = await CurriculumService.draftsForCourse(courseId);
      setDrafts(rows);
      const next: EditState = {};
      for (const d of rows) {
        next[d.id] = {
          title: d.title,
          primaryFink: (d.primary_fink_dimension ?? '') as FinkDimension | '',
          primaryBloom: d.primary_bloom_level ?? '',
          primaryTaxonomy: d.primary_taxonomy ?? null,
          outcomes: (d.learning_outcomes ?? []).map((o) => ({ ...o })),
        };
      }
      setEdits(next);
    } catch (e) {
      setDrafts([]);
      toast.error(e instanceof Error ? e.message : 'Could not load this course’s drafts.');
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  useEffect(() => { loadInbox(); }, [loadInbox]);
  useEffect(() => {
    if (selected) loadDrafts(selected.course_id);
    else setDrafts(null);
  }, [selected, loadDrafts]);

  const patchOutcome = (draftId: string, idx: number, patch: Partial<LessonOutcome>) => {
    setEdits((prev) => {
      const cur = prev[draftId];
      if (!cur) return prev;
      const outcomes = cur.outcomes.map((o, i) => (i === idx ? { ...o, ...patch } : o));
      return { ...prev, [draftId]: { ...cur, outcomes } };
    });
  };

  const approve = async (draft: DraftArtifact) => {
    const e = edits[draft.id];
    setBusyId(draft.id);
    try {
      // co_refs derived from the (possibly edited) outcomes so the lesson's CLO
      // mapping stays consistent with what the faculty ratified. Only LESSON
      // outcomes carry a string `co_ref` per outcome; brief artifacts store co_ref
      // as an ARRAY, so deriving from their outcomes would emit malformed co_refs
      // (deep-review LOW 2026-07-06) — briefs use the draft's already-correct
      // co_refs array instead.
      const coRefs =
        draft.artifact_kind === 'lesson' && e
          ? [...new Set(e.outcomes.map((o) => o.co_ref).filter((x): x is string => !!x))]
          : draft.co_refs;
      const bloomPrimary = isBloomPrimary(e?.primaryTaxonomy);
      await CurriculumService.approveDraft(draft.id, {
        title: e?.title,
        // Send only the axis that matches this course's taxonomy; the other stays null so a
        // blooms lesson never carries a stray Fink primary (and vice-versa).
        primaryFink: bloomPrimary ? undefined : ((e?.primaryFink || undefined) as FinkDimension | undefined),
        primaryBloom: bloomPrimary ? (e?.primaryBloom || undefined) : undefined,
        primaryTaxonomy: e?.primaryTaxonomy ?? undefined,
        learningOutcomes: e?.outcomes,
        coRefs,
      });
      toast.success(`Published: ${e?.title ?? draft.title}`);
      // optimistic remove from the local list, then refresh the inbox counts
      setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : prev));
      await loadInbox();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve this lesson.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (draft: DraftArtifact) => {
    setBusyId(draft.id);
    try {
      await CurriculumService.rejectDraft(draft.id);
      toast.success('Draft discarded (never shown to students).');
      setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : prev));
      await loadInbox();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reject this draft.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ContentLayout title="Lesson Spine Review">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Academic', href: '/academic' },
          { label: 'Lesson Spine Review' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2" style={{ color: BRAND }}>
            <Sparkles className="h-6 w-6" /> AI Lesson-Spine Review
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            The system drafts a teaching lesson spine from each course’s approved syllabus.
            Nothing here is visible to students until <span className="font-medium">you approve it</span> —
            AI drafts, you decide. Re-word a title or re-tag an outcome, then Approve to publish or
            Discard to remove.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* ── Review inbox ─────────────────────────────────────────── */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4" style={{ color: BRAND }} /> Courses to review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {inbox === null ? (
                <>
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </>
              ) : inboxError ? (
                <p className="text-sm text-destructive">{inboxError}</p>
              ) : inbox.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No AI drafts are waiting for review. When the generator runs, courses with a
                  syllabus on file will appear here.
                </div>
              ) : (
                inbox.map((c) => {
                  const isSel = selected?.course_id === c.course_id;
                  return (
                    <button
                      key={c.course_id}
                      onClick={() => setSelected(c)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left text-sm transition ${
                        isSel ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/5' : 'hover:border-[color:var(--brand)]/40'
                      }`}
                      style={{ ['--brand' as string]: BRAND }}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.course_code}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.course_name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="secondary">{c.draft_count}</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* ── Draft spine for the selected course ──────────────────── */}
          <div className="space-y-4">
            {selected && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selected.course_code}</p>
                  <p className="truncate text-xs text-muted-foreground">{selected.course_name}</p>
                </div>
                {/* "Regenerate spine" — enqueues a curriculum.lesson_spine_regen task on
                    the async AI Max-button lane (lib/ai-tasks/registry.ts). The fresh
                    spine REPLACES unapproved drafts slot-by-slot; approved (published)
                    lessons are never touched. Server-side authz mirrors this page's
                    read gate (fn_curriculum_lesson_drafts_for_course). */}
                <AiTaskButton
                  taskType="curriculum.lesson_spine_regen"
                  entityId={selected.course_id}
                  label="Regenerate spine"
                  readyLabel="Spine regenerated"
                  popoverTitle="Lesson-spine regeneration"
                />
              </div>
            )}
            {!selected ? (
              <Card>
                <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Info className="h-6 w-6" />
                  Select a course on the left to review its AI-drafted lesson spine.
                </CardContent>
              </Card>
            ) : loadingDrafts ? (
              <>
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </>
            ) : !drafts || drafts.length === 0 ? (
              <Card>
                <CardContent className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Check className="h-6 w-6" style={{ color: BRAND }} />
                  All drafts for <span className="font-medium">{selected.course_code}</span> have been
                  reviewed.
                </CardContent>
              </Card>
            ) : (
              drafts.map((draft) => {
                const e = edits[draft.id];
                const busy = busyId === draft.id;
                return (
                  <Card key={draft.id} className="overflow-hidden">
                    <CardHeader className="gap-2 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          <Sparkles className="h-3 w-3" /> AI draft
                        </Badge>
                        <Badge variant="secondary">{kindLabel(draft.artifact_kind)}</Badge>
                        {draft.artifact_kind === 'lesson' && (
                          <Badge
                            variant="outline"
                            className="border-transparent"
                            style={isBloomPrimary(draft.primary_taxonomy)
                              ? { backgroundColor: '#fff7d6', color: '#7a5c00' }   // gold — Bloom-primary
                              : { backgroundColor: '#e6f4ee', color: BRAND }}      // green — Fink-primary
                          >
                            {isBloomPrimary(draft.primary_taxonomy) ? 'Bloom-primary' : 'Fink-primary'}
                          </Badge>
                        )}
                        {draft.unit_label && <Badge variant="outline">{draft.unit_label}</Badge>}
                        {draft.sequence_no != null && (
                          <span className="text-xs text-muted-foreground">#{draft.sequence_no}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <PencilLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <Input
                          value={e?.title ?? draft.title}
                          onChange={(ev) =>
                            setEdits((prev) => ({
                              ...prev,
                              [draft.id]: { ...prev[draft.id], title: ev.target.value },
                            }))
                          }
                          className="text-base font-medium"
                          aria-label="Lesson title"
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {draft.artifact_kind === 'lesson' && (
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                            {isBloomPrimary(e?.primaryTaxonomy) ? 'Primary Bloom level' : 'Primary focus'}
                          </span>
                          {isBloomPrimary(e?.primaryTaxonomy) ? (
                            <Select
                              // JABT added-half codes (HD/AF3/L2L, …) have no SelectItem — the
                              // picker offers K1-K6 only, the added half enters via the Fink
                              // picker by design. A Radix Select whose value matches no item
                              // renders EMPTY, so treat non-K values as "no selection" and let
                              // the placeholder (bloomLabel knows the added-half labels) show.
                              value={BLOOM_OPTIONS.some((b) => b.value === e?.primaryBloom) ? e?.primaryBloom : undefined}
                              onValueChange={(v) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [draft.id]: { ...prev[draft.id], primaryBloom: v },
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 w-full sm:w-56">
                                <SelectValue placeholder={bloomLabel(draft.primary_bloom_level)} />
                              </SelectTrigger>
                              <SelectContent>
                                {BLOOM_OPTIONS.map((b) => (
                                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Select
                              value={e?.primaryFink || undefined}
                              onValueChange={(v) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [draft.id]: { ...prev[draft.id], primaryFink: v as FinkDimension },
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 w-full sm:w-56">
                                <SelectValue placeholder={finkLabel(draft.primary_fink_dimension)} />
                              </SelectTrigger>
                              <SelectContent>
                                {FINK_OPTIONS.map((f) => (
                                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}

                      {/* Outcomes — lesson = tagged outcome rows; briefs = the free-text body */}
                      {draft.artifact_kind === 'lesson' ? (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Learning outcomes
                          </p>
                          {(e?.outcomes ?? []).length === 0 && (
                            <p className="text-sm text-muted-foreground">No outcomes drafted.</p>
                          )}
                          {(e?.outcomes ?? []).map((o, idx) => (
                            <div key={idx} className="rounded-md border p-3 space-y-2">
                              <Textarea
                                value={o.text ?? ''}
                                onChange={(ev) => patchOutcome(draft.id, idx, { text: ev.target.value })}
                                rows={2}
                                className="text-sm"
                                aria-label={`Outcome ${idx + 1} text`}
                              />
                              <div className="flex flex-wrap gap-2">
                                <Select
                                  value={(o.fink_dimension as string) || undefined}
                                  onValueChange={(v) => patchOutcome(draft.id, idx, { fink_dimension: v })}
                                >
                                  <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Fink dimension" /></SelectTrigger>
                                  <SelectContent>
                                    {FINK_OPTIONS.map((f) => (
                                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={o.bloom_level || undefined}
                                  onValueChange={(v) => patchOutcome(draft.id, idx, { bloom_level: v })}
                                >
                                  <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Bloom level" /></SelectTrigger>
                                  <SelectContent>
                                    {BLOOM_OPTIONS.map((b) => (
                                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={o.co_ref ?? ''}
                                  onChange={(ev) => patchOutcome(draft.id, idx, { co_ref: ev.target.value })}
                                  placeholder="CO ref (e.g. CO1)"
                                  className="h-8 w-32"
                                  aria-label={`Outcome ${idx + 1} CO reference`}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Brief
                          </p>
                          <p className="rounded-md border bg-muted/30 p-3 text-sm">
                            {draft.learning_outcomes?.[0]?.text || '(no brief text)'}
                          </p>
                          {draft.co_refs?.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Maps to: {draft.co_refs.join(', ')}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => approve(draft)}
                          disabled={busy}
                          style={{ backgroundColor: BRAND }}
                          className="text-white hover:opacity-90"
                        >
                          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                          Approve &amp; publish
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => reject(draft)} disabled={busy}>
                          <X className="mr-1.5 h-4 w-4" /> Discard
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
