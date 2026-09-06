'use client';

/**
 * MBA case studies — client surface. Three lanes on one screen:
 *
 *   1. WRITE (everyone who can open the board). The caller's own improvement
 *      ideas that cleared both eligibility tests, and the cases they have
 *      started. An empty list explains the funnel rather than showing a box.
 *   2. REVIEW (improvement.board.manage holders only). Submitted cases, a grade
 *      box, notes, and publishing as a separate deliberate tick.
 *   3. LIBRARY (anyone who can open the board). Published cases under the
 *      author's byline — the learner gets the credit (Director ruling).
 *
 * ACCESS is a union of three permission keys plus the super-admin bypass, the
 * shape the sibling gemba screen established — not one key. The writers and the
 * graders are reached by different keys, so gating on improvement.ideas.view
 * alone shows a no-access panel to the very people the review lane is built for
 * — a defect this module has already shipped twice, in two different costumes.
 * Which role_key holds which key is a live value in `custom_roles.permissions`;
 * this file compares by value (`can()` is `=== true`) and records no roster.
 *
 * WRITES all go through CaseStudyService, which calls the four SECURITY DEFINER
 * RPCs and nothing else. This component never decides eligibility; it hides a
 * control the server would refuse, and shows whatever the server says when a
 * refusal happens anyway.
 *
 * NOT-INSTALLED is a first-class state. Those RPCs and six of the columns are
 * created by migration `20260809010000` in sibling PR #2759, which is open and
 * NOT applied — merging it does not apply it either. Until that happens the
 * screen says so in a sentence: zero cases and no feature must never look the
 * same.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BookOpen,
  Bot,
  ClipboardCheck,
  FileText,
  Info,
  Loader2,
  PenLine,
  Send,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  AI_DRAFT_MARKER,
  CASE_STATUS_BADGE_CLASS,
  CASE_STATUS_LABEL,
  CaseStudyNotInstalledError,
  CaseStudyService,
  arrayToLines,
  linesToArray,
  type CaseStudyAvailability,
  type CaseStudyEnriched,
  type WritingLane,
} from '@/lib/services/improvement/case-study-service';

/** Gates the review lane: this key alone decides who is shown the grade box. */
const GRADE_PERMISSION = 'improvement.board.manage';
/** Opens the screen for the officer population. Read access only, no grade box. */
const OFFICER_PERMISSION = 'improvement.area_role.assign';
/** Opens the screen for the associates who write the cases. */
const ASSOCIATE_PERMISSION = 'improvement.ideas.view';

function formatWhen(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface CaseStudiesClientProps {
  currentUserId: string;
  currentUserName: string;
}

interface EditorState {
  title: string;
  summary: string;
  fullContent: string;
  keyTakeaways: string;
  learningObjectives: string;
}

function editorFrom(row: CaseStudyEnriched): EditorState {
  return {
    title: row.title ?? '',
    summary: row.summary ?? '',
    fullContent: row.full_content ?? '',
    keyTakeaways: arrayToLines(row.key_takeaways),
    learningObjectives: arrayToLines(row.learning_objectives),
  };
}

export function CaseStudiesClient({
  currentUserId,
  currentUserName,
}: CaseStudiesClientProps) {
  const { can, isLoading: permsLoading, isSuperAdmin } = usePermissions();

  // can() returns false while permissions load, so permsLoading is branched on
  // FIRST below — a still-loading state must never render as "denied".
  const canView =
    isSuperAdmin ||
    can(ASSOCIATE_PERMISSION) ||
    can(OFFICER_PERMISSION) ||
    can(GRADE_PERMISSION);

  // The review lane is held to exactly the check fn_case_study_grade is
  // SPECIFIED to make — improvement.board.manage, or a super admin — and no
  // wider. That specification is migration 20260809010000's (PR #2759, open and
  // not applied); it is matched here so the grade box is not offered to someone
  // the server would then refuse, and it is deliberately not made more generous
  // than the contract it mirrors.
  const canGrade = isSuperAdmin || can(GRADE_PERMISSION);

  const [availability, setAvailability] =
    useState<CaseStudyAvailability | null>(null);
  const [lane, setLane] = useState<WritingLane | null>(null);
  const [myCases, setMyCases] = useState<CaseStudyEnriched[] | null>(null);
  const [queue, setQueue] = useState<CaseStudyEnriched[] | null>(null);
  const [published, setPublished] = useState<CaseStudyEnriched[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [startingIdea, setStartingIdea] = useState<string | null>(null);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [gradeDrafts, setGradeDrafts] = useState<
    Record<string, { grade: string; notes: string; publish: boolean }>
  >({});
  const [gradingId, setGradingId] = useState<string | null>(null);

  const openCase = useMemo(
    () => (myCases || []).find((c) => c.id === openCaseId) ?? null,
    [myCases, openCaseId]
  );

  const load = useCallback(async () => {
    setLoadError(null);
    const state = await CaseStudyService.checkAvailability();
    setAvailability(state);
    if (state !== 'ready') {
      setLane(null);
      setMyCases(null);
      setQueue(null);
      setPublished(null);
      return;
    }
    try {
      const [laneData, mine, lib] = await Promise.all([
        CaseStudyService.myWritingLane(currentUserId),
        CaseStudyService.listMyCases(currentUserId),
        CaseStudyService.listPublished(),
      ]);
      setLane(laneData);
      setMyCases(mine);
      setPublished(lib);
      if (canGrade) setQueue(await CaseStudyService.listReviewQueue());
      else setQueue([]);
    } catch (error) {
      if (error instanceof CaseStudyNotInstalledError) {
        setAvailability('not_installed');
        return;
      }
      setLoadError(
        error instanceof Error ? error.message : 'Could not load case studies.'
      );
    }
  }, [currentUserId, canGrade]);

  useEffect(() => {
    if (permsLoading || !canView) return;
    void load();
  }, [permsLoading, canView, load]);

  // Reset the editor whenever a different case is opened.
  useEffect(() => {
    if (!openCase) {
      setEditor(null);
      return;
    }
    setEditor(editorFrom(openCase));
  }, [openCase]);

  const handleStart = async (ideaId: string) => {
    setStartingIdea(ideaId);
    try {
      const newId = await CaseStudyService.start(ideaId);
      toast.success('Case started — the first draft is being written for you.');
      await load();
      setOpenCaseId(newId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not start the case.'
      );
    } finally {
      setStartingIdea(null);
    }
  };

  const handleSave = async () => {
    if (!openCase || !editor) return;
    if (!editor.title.trim()) {
      toast.error('Give the case a title before saving.');
      return;
    }
    setSaving(true);
    try {
      await CaseStudyService.save(openCase.id, {
        title: editor.title.trim(),
        summary: editor.summary.trim(),
        fullContent: editor.fullContent,
        keyTakeaways: linesToArray(editor.keyTakeaways),
        learningObjectives: linesToArray(editor.learningObjectives),
      });
      toast.success('Saved.');
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not save the case.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!openCase) return;
    setSubmitting(true);
    try {
      await CaseStudyService.submit(openCase.id);
      toast.success('Handed in. It is now waiting for a grade.');
      setOpenCaseId(null);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not hand in the case.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGrade = async (row: CaseStudyEnriched) => {
    const draft = gradeDrafts[row.id] ?? { grade: '', notes: '', publish: false };
    const value = Number(draft.grade);
    if (!draft.grade.trim() || Number.isNaN(value)) {
      toast.error('Enter a numeric grade.');
      return;
    }
    setGradingId(row.id);
    try {
      await CaseStudyService.grade(row.id, {
        grade: value,
        notes: draft.notes.trim(),
        publish: draft.publish,
      });
      toast.success(
        draft.publish
          ? 'Graded and published to the library.'
          : 'Graded. It stays inside the programme until you publish it.'
      );
      setGradeDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not record the grade.'
      );
    } finally {
      setGradingId(null);
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
              <p className="font-medium">
                Case studies belong to the Improvement Board
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                You do not have access to read or write improvement case
                studies. If you believe that is wrong, contact your programme
                lead — they can grant Improvement Board access and post you to a
                department.
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

  // --- Header ---------------------------------------------------------------

  const header = (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <BookOpen className="text-primary h-6 w-6" />
        Improvement case studies
      </h1>
      <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
        An improvement you actually made, written up as something you can show
        an employer. Writing it is a graded part of the programme. Cases stay
        inside MyJKKN for now — publishing puts one in the library here, not on
        the public internet.
      </p>
    </div>
  );

  if (availability === null) {
    return (
      <div className="space-y-6">
        {header}
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (availability === 'not_installed') {
    return (
      <div className="space-y-6">
        {header}
        <Card className="border-amber-300 dark:border-amber-800">
          <CardContent className="flex items-start gap-4 p-6">
            <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">
                This screen is ready, the database change behind it is not.
              </p>
              <p className="text-muted-foreground">
                Case studies need four functions and six columns that have not
                been applied to this database yet. Nothing is broken and nothing
                is lost — the screen simply has nothing to read or write until
                that change lands. Ask whoever is running the release to apply
                the case-study change, then reload this page.
              </p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Check again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (availability === 'unavailable' || loadError) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-4 p-6">
            <TriangleAlert className="text-destructive mt-0.5 h-6 w-6 shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">Could not load case studies.</p>
              <p className="text-muted-foreground">
                {loadError ??
                  'The case-study records did not answer. This is not a permission problem — reloading often clears it.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Lanes ----------------------------------------------------------------

  const queueCount = queue?.length ?? 0;

  return (
    <div className="space-y-6">
      {header}

      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">
            <PenLine className="mr-2 h-4 w-4" />
            Write
          </TabsTrigger>
          {canGrade && (
            <TabsTrigger value="review">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Review{queueCount > 0 ? ` (${queueCount})` : ''}
            </TabsTrigger>
          )}
          <TabsTrigger value="library">
            <BookOpen className="mr-2 h-4 w-4" />
            Library
          </TabsTrigger>
        </TabsList>

        {/* ---------------- WRITE ---------------- */}
        <TabsContent value="write" className="space-y-6 pt-4">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <h2 className="font-semibold">Ideas ready to write up</h2>
                <p className="text-muted-foreground text-sm">
                  You may write a case about an improvement that was actually
                  made and whose value was actually confirmed — nothing earlier.
                </p>
              </div>

              {lane === null ? (
                <Skeleton className="h-24 w-full" />
              ) : lane.eligible.length === 0 ? (
                <div className="bg-muted/40 flex items-start gap-3 rounded-lg p-4 text-sm">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                  <div className="space-y-2">
                    <p className="font-medium">
                      Nothing of yours is eligible yet — here is exactly why.
                    </p>
                    <p className="text-muted-foreground">
                      An idea can only become a case after it has travelled the
                      whole way: filed, approved, applied, and then verified with
                      its value confirmed to hold. Of the ideas you filed,{' '}
                      <strong>{lane.totalMine}</strong> in total,{' '}
                      <strong>{lane.verifiedMine}</strong> reached verified and{' '}
                      <strong>{lane.valueHoldsMine}</strong> had the value
                      confirmed.
                      {lane.alreadyWritten > 0 && (
                        <>
                          {' '}
                          <strong>{lane.alreadyWritten}</strong> of those already
                          has a case, so it is not offered twice.
                        </>
                      )}
                    </p>
                    {lane.totalMine === 0 && (
                      <p className="text-muted-foreground">
                        You have not filed an improvement idea yet. That is the
                        first step — go and look at your department, then file
                        what you found.
                      </p>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/improvement-board">
                        Open the Improvement Board
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {lane.eligible.map((idea) => (
                    <div
                      key={idea.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"
                    >
                      <div className="min-w-[16rem] flex-1">
                        <p className="font-medium">{idea.title}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {idea.area_label ?? 'No department'} · value confirmed{' '}
                          {formatWhen(idea.verified_at)}
                        </p>
                        {idea.problem && (
                          <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                            {idea.problem}
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={() => void handleStart(idea.id)}
                        disabled={startingIdea !== null}
                      >
                        {startingIdea === idea.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PenLine className="mr-2 h-4 w-4" />
                        )}
                        Write the case
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <h2 className="font-semibold">My cases</h2>
                <p className="text-muted-foreground text-sm">
                  Everything you have started, handed in, or had graded.
                </p>
              </div>

              {myCases === null ? (
                <Skeleton className="h-24 w-full" />
              ) : myCases.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  You have not started a case yet. When one of your improvements
                  becomes eligible above, the button starts it here.
                </p>
              ) : (
                <div className="space-y-3">
                  {myCases.map((row) => (
                    <div key={row.id} className="rounded-lg border">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenCaseId(openCaseId === row.id ? null : row.id)
                        }
                        className="hover:bg-muted/40 flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                      >
                        <div className="min-w-[16rem] flex-1">
                          <p className="font-medium">{row.title}</p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {row.idea_title
                              ? `About: ${row.idea_title}`
                              : 'Not linked to an idea'}{' '}
                            · updated {formatWhen(row.updated_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {row.grade !== null && (
                            <Badge variant="outline">Grade {row.grade}</Badge>
                          )}
                          <Badge
                            className={CASE_STATUS_BADGE_CLASS[row.status]}
                            variant="secondary"
                          >
                            {CASE_STATUS_LABEL[row.status]}
                          </Badge>
                        </div>
                      </button>

                      {openCaseId === row.id && (
                        <div className="space-y-4 border-t p-4">
                          {row.grade !== null && (
                            <div className="rounded-lg border border-emerald-300 p-3 text-sm dark:border-emerald-800">
                              <p className="font-medium">
                                Graded {row.grade} by{' '}
                                {row.grader_name ?? 'the programme'} on{' '}
                                {formatWhen(row.graded_at)}
                              </p>
                              {row.grade_notes && (
                                <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
                                  {row.grade_notes}
                                </p>
                              )}
                            </div>
                          )}

                          {row.status === 'draft' &&
                            row.generated_by === AI_DRAFT_MARKER && (
                              <div className="flex items-start gap-3 rounded-lg border border-violet-300 p-3 text-sm dark:border-violet-800">
                                <Bot className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
                                <p>
                                  <strong>
                                    This first draft was written by AI, and it is
                                    not what you hand in.
                                  </strong>{' '}
                                  It is a starting point so you are not facing a
                                  blank page. Rewrite it in your own words with
                                  what you actually saw and did — the grade is
                                  for your account of the improvement, not for
                                  the machine&apos;s.
                                </p>
                              </div>
                            )}

                          {row.status !== 'draft' ? (
                            <div className="space-y-3 text-sm">
                              <p className="text-muted-foreground">
                                {row.status === 'under_review'
                                  ? 'Handed in — it can no longer be edited while it waits for a grade.'
                                  : 'This case has been graded and is no longer editable.'}
                              </p>
                              {row.summary && (
                                <p className="whitespace-pre-wrap">
                                  {row.summary}
                                </p>
                              )}
                              {row.full_content && (
                                <p className="whitespace-pre-wrap">
                                  {row.full_content}
                                </p>
                              )}
                            </div>
                          ) : editor === null ? (
                            <Skeleton className="h-40 w-full" />
                          ) : (
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <label className="text-sm font-medium">
                                  Title
                                </label>
                                <Input
                                  value={editor.title}
                                  onChange={(e) =>
                                    setEditor({
                                      ...editor,
                                      title: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-sm font-medium">
                                  Summary
                                </label>
                                <Textarea
                                  rows={3}
                                  value={editor.summary}
                                  onChange={(e) =>
                                    setEditor({
                                      ...editor,
                                      summary: e.target.value,
                                    })
                                  }
                                  placeholder="In a few lines: what was wrong, what you changed, what it was worth."
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-sm font-medium">
                                  The case
                                </label>
                                <Textarea
                                  rows={14}
                                  value={editor.fullContent}
                                  onChange={(e) =>
                                    setEditor({
                                      ...editor,
                                      fullContent: e.target.value,
                                    })
                                  }
                                  placeholder="What you saw when you went and looked, what you proposed, what was actually done, and how the value was confirmed."
                                />
                              </div>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="text-sm font-medium">
                                    Key takeaways
                                  </label>
                                  <Textarea
                                    rows={4}
                                    value={editor.keyTakeaways}
                                    onChange={(e) =>
                                      setEditor({
                                        ...editor,
                                        keyTakeaways: e.target.value,
                                      })
                                    }
                                    placeholder="One per line"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-sm font-medium">
                                    Learning objectives
                                  </label>
                                  <Textarea
                                    rows={4}
                                    value={editor.learningObjectives}
                                    onChange={(e) =>
                                      setEditor({
                                        ...editor,
                                        learningObjectives: e.target.value,
                                      })
                                    }
                                    placeholder="One per line"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => void handleSave()}
                                  disabled={saving || submitting}
                                >
                                  {saving && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  )}
                                  Save draft
                                </Button>
                                <Button
                                  onClick={() => void handleSubmit()}
                                  disabled={saving || submitting}
                                >
                                  {submitting ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Send className="mr-2 h-4 w-4" />
                                  )}
                                  Hand in for a grade
                                </Button>
                              </div>
                              <p className="text-muted-foreground text-xs">
                                Handing in locks the case for editing. Save your
                                changes first.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- REVIEW ---------------- */}
        {canGrade && (
          <TabsContent value="review" className="space-y-4 pt-4">
            <Card>
              <CardContent className="space-y-4 p-6">
                <div>
                  <h2 className="font-semibold">Waiting for a grade</h2>
                  <p className="text-muted-foreground text-sm">
                    Grading records the grade and your notes. Publishing to the
                    library is a separate tick — a graded case stays inside the
                    programme until you choose to publish it.
                  </p>
                </div>

                {queue === null ? (
                  <Skeleton className="h-24 w-full" />
                ) : queue.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Nothing has been handed in yet. Cases appear here the moment
                    an author hands one in.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {queue.map((row) => {
                      const draft = gradeDrafts[row.id] ?? {
                        grade: '',
                        notes: '',
                        publish: false,
                      };
                      return (
                        <div key={row.id} className="space-y-4 rounded-lg border p-4">
                          <div>
                            <p className="font-medium">{row.title}</p>
                            <p className="text-muted-foreground mt-1 text-xs">
                              By {row.author_name ?? 'Unknown'} ·{' '}
                              {row.idea_title
                                ? `about: ${row.idea_title}`
                                : 'not linked to an idea'}{' '}
                              · handed in {formatWhen(row.updated_at)}
                            </p>
                          </div>

                          {row.summary && (
                            <p className="text-sm whitespace-pre-wrap">
                              {row.summary}
                            </p>
                          )}
                          {row.full_content && (
                            <div className="bg-muted/40 max-h-72 overflow-y-auto rounded-lg p-3 text-sm whitespace-pre-wrap">
                              {row.full_content}
                            </div>
                          )}
                          {(row.key_takeaways?.length ?? 0) > 0 && (
                            <div className="text-sm">
                              <p className="font-medium">Key takeaways</p>
                              <ul className="text-muted-foreground mt-1 list-disc pl-5">
                                {row.key_takeaways?.map((t, i) => (
                                  <li key={i}>{t}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                            <div className="space-y-1">
                              <label className="text-sm font-medium">Grade</label>
                              <Input
                                type="number"
                                inputMode="decimal"
                                value={draft.grade}
                                onChange={(e) =>
                                  setGradeDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: { ...draft, grade: e.target.value },
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium">
                                Notes for the author
                              </label>
                              <Textarea
                                rows={3}
                                value={draft.notes}
                                onChange={(e) =>
                                  setGradeDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: { ...draft, notes: e.target.value },
                                  }))
                                }
                                placeholder="What was strong, and what would make it stronger."
                              />
                            </div>
                          </div>

                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={draft.publish}
                              onCheckedChange={(checked) =>
                                setGradeDrafts((prev) => ({
                                  ...prev,
                                  [row.id]: {
                                    ...draft,
                                    publish: checked === true,
                                  },
                                }))
                              }
                            />
                            Publish this case to the library under the
                            author&apos;s name
                          </label>

                          <Button
                            onClick={() => void handleGrade(row)}
                            disabled={gradingId !== null}
                          >
                            {gradingId === row.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ClipboardCheck className="mr-2 h-4 w-4" />
                            )}
                            Record the grade
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ---------------- LIBRARY ---------------- */}
        <TabsContent value="library" className="space-y-4 pt-4">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <h2 className="font-semibold">Published cases</h2>
                <p className="text-muted-foreground text-sm">
                  Readable by everyone who can open the Improvement Board. The
                  byline is the author&apos;s — they did the work and they get
                  the credit.
                </p>
              </div>

              {published === null ? (
                <Skeleton className="h-24 w-full" />
              ) : published.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  The library is empty. A case appears here once it has been
                  graded and deliberately published — grading alone does not
                  publish it.
                </p>
              ) : (
                <div className="space-y-4">
                  {published.map((row) => (
                    <article key={row.id} className="space-y-2 rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium">{row.title}</h3>
                          <p className="text-muted-foreground mt-1 text-xs">
                            By{' '}
                            <span className="font-medium">
                              {row.author_name ??
                                (row.author_id === currentUserId
                                  ? currentUserName
                                  : 'Unknown')}
                            </span>{' '}
                            · published {formatWhen(row.published_at)}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          <Sparkles className="mr-1 h-3 w-3" />
                          Case study
                        </Badge>
                      </div>
                      {row.summary && (
                        <p className="text-sm whitespace-pre-wrap">
                          {row.summary}
                        </p>
                      )}
                      {row.full_content && (
                        <details className="text-sm">
                          <summary className="text-primary cursor-pointer">
                            <FileText className="mr-1 inline h-3 w-3" />
                            Read the full case
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap">
                            {row.full_content}
                          </p>
                        </details>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
