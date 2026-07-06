'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Save, Plus, Trash2, X, SquarePen } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import { SearchableSelect } from '@/components/ui/searchable-select';

import { useUpdateBosMeeting } from '@/hooks/bos/use-bos-meetings';
import { useBosMembersByComposition } from '@/hooks/bos/use-bos-members';
import type {
  BosMeeting,
  BosCourseSyllabus,
  BosMinutesChangeLogEntry,
  UpdateBosMeetingDto,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';

interface MinutesTabProps {
  meeting: BosMeeting;
  canEdit: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────
// Topic and sub_topic in BosMinutesChangeLogEntry may be string | string[] |
// null. The string form exists for backward-compat with the very first save
// shape (single-select per row); we always render and write as arrays now.
function asTopicArray(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return [v];
}

// Build a clean display label for a unit. Drops the em-dash when the title
// is empty so we don't render "Unit I —" with a trailing punctuation that
// implies missing data.
function unitLabel(unit_id: string, unit_title?: string | null): string {
  const title = unit_title?.trim() ?? '';
  return title ? `Unit ${unit_id} — ${title}` : `Unit ${unit_id}`;
}

// Trim trailing punctuation (": ", ":", ",", "—", "-") from a chapter/subtopic
// title so the dropdown doesn't render "Introduction:" or "Microservices,".
function cleanLabel(text: string): string {
  return text.replace(/[\s:,;\-—–]+$/u, '').trim();
}

/**
 * Two-section minutes editor:
 *   1) Free-form rich-text narrative (TipTap via the shared RichTextEditor).
 *   2) Structured "Suggested Changes" list — one row per syllabus change with
 *      unit/topic/sub-topic fields and an attribution dropdown (member who
 *      suggested it).
 *
 * Both sections write into bos_meetings.minutes_content (JSONB). The save
 * button is a single bulk save — no auto-save yet (keeps the data-loss surface
 * predictable; can layer auto-save in a follow-up once users decide the
 * editing pattern they prefer).
 */
export function MinutesTab({ meeting, canEdit }: MinutesTabProps) {
  const router = useRouter();
  // ── Local edit state (form-style) ──────────────────────────────────────────
  // We mirror the server-side minutes_content into local state so users can
  // make a series of edits without firing an API call per keystroke. isDirty
  // gates the Save button — prevents accidental no-op saves.
  //
  // The narrative is no longer edited here — it has its own full-page Word-style
  // editor at /minutes/edit. We still mirror it so the changes_log save below
  // re-sends the current narrative (the PUT route writes minutes_content
  // wholesale, so omitting narrative_html would wipe it).
  const [narrative, setNarrative] = useState<string>(
    meeting.minutes_content?.narrative_html ?? '',
  );
  const [changesLog, setChangesLog] = useState<BosMinutesChangeLogEntry[]>(
    meeting.minutes_content?.changes_log ?? [],
  );
  const [isDirty, setIsDirty] = useState(false);

  // Re-sync local state when the meeting prop changes — e.g. another user
  // saved while this tab was open, or React Query refetched the meeting row.
  // We key off meeting.id + updated_at so unrelated cache pokes don't blow
  // away the user's in-flight edits.
  useEffect(() => {
    setNarrative(meeting.minutes_content?.narrative_html ?? '');
    setChangesLog(meeting.minutes_content?.changes_log ?? []);
    setIsDirty(false);
  }, [meeting.id, meeting.updated_at]);

  // ── Lookups ───────────────────────────────────────────────────────────────
  // Members for the "Suggested by" dropdown.
  const { data: members = [] } = useBosMembersByComposition(meeting.composition_id);

  // Syllabi for the "Syllabus / Course" picker — narrowed to this meeting's
  // composition + regulation, matching the SyllabusTab filter so the picker
  // shows the same courses the user already saw in that tab.
  const { data: syllabiData } = useQuery({
    queryKey: [
      'bos',
      'syllabi-for-minutes',
      meeting.composition_id,
      meeting.regulation_id,
      meeting.board_id,
      meeting.institutions_id,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        institutionsId: meeting.institutions_id,
        isLatest: 'true',
        isArchived: 'false',
      });
      if (meeting.board_id) params.set('boardId', meeting.board_id);
      if (meeting.regulation_id) params.set('regulationId', meeting.regulation_id);
      const res = await fetch(`/api/bos/syllabus?${params}`);
      if (!res.ok) throw new Error('Failed to fetch syllabi');
      return res.json() as Promise<{ data: BosCourseSyllabus[] }>;
    },
    enabled: !!meeting.institutions_id,
    staleTime: 5 * 60 * 1000,
  });

  const syllabi = useMemo(() => {
    const all = syllabiData?.data ?? [];
    return meeting.composition_id
      ? all.filter((s) => s.composition_id === meeting.composition_id)
      : all;
  }, [syllabiData, meeting.composition_id]);

  // ── Save mutation ─────────────────────────────────────────────────────────
  const updateMeeting = useUpdateBosMeeting();

  const handleSave = async () => {
    // Strip blank changes-log rows on save to keep the DB clean. A row with
    // no suggestion_text and no syllabus pick is effectively empty noise.
    const cleaned = changesLog.filter(
      (r) =>
        (r.suggestion_text?.trim() ?? '') !== '' ||
        r.syllabus_id ||
        asTopicArray(r.suggested_by_member_id).length > 0,
    );

    try {
      await updateMeeting.mutateAsync({
        id: meeting.id,
        data: {
          minutes_content: {
            narrative_html: narrative,
            changes_log: cleaned,
          },
        } as UpdateBosMeetingDto,
      });
      toast.success('Minutes saved');
      setChangesLog(cleaned);
      setIsDirty(false);
    } catch (err) {
      logger.error('academic/bos', 'Failed to save minutes', err);
      toast.error((err as Error).message || 'Failed to save minutes');
    }
  };

  // ── Changes-log row mutators ──────────────────────────────────────────────
  // Each mutator flips isDirty so the Save button reflects unsaved changes.
  const addChangeRow = () => {
    setChangesLog((prev) => [
      ...prev,
      {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        suggestion_text: '',
        topic: [],
        sub_topic: [],
        created_at: new Date().toISOString(),
      },
    ]);
    setIsDirty(true);
  };

  const updateChangeRow = (
    id: string,
    patch: Partial<BosMinutesChangeLogEntry>,
  ) => {
    setChangesLog((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    setIsDirty(true);
  };

  const removeChangeRow = (id: string) => {
    setChangesLog((prev) => prev.filter((r) => r.id !== id));
    setIsDirty(true);
  };

  return (
    <div className='space-y-6'>
      {/* ── Header row: title + save button ────────────────────────────── */}
      <div className='flex items-start justify-between gap-4 flex-wrap'>
        <div>
          <h3 className='text-lg font-semibold'>Meeting Minutes</h3>
          <p className='text-sm text-muted-foreground'>
            Record the detailed proceedings of this meeting, including
            discussion notes and any changes suggested by board members.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={handleSave}
            disabled={!isDirty || updateMeeting.isPending}
            size='sm'
          >
            <Save className='mr-2 h-4 w-4' />
            {updateMeeting.isPending ? 'Saving…' : isDirty ? 'Save Changes' : 'Saved'}
          </Button>
        )}
      </div>

      {/* ── Rich-text narrative ───────────────────────────────────────────
          The narrative has a dedicated full-page Word-style editor (ribbon,
          autosave, Tamil typing) at /minutes/edit — the same surface as the
          SOP editor. Here we only preview it and link out to that editor. */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <CardTitle className='text-base'>Minutes Narrative</CardTitle>
          <Button
            variant={canEdit ? 'default' : 'outline'}
            size='sm'
            onClick={() =>
              router.push(`/bos/meetings/${meeting.id}/minutes/edit`)
            }
          >
            <SquarePen className='mr-2 h-4 w-4' />
            {canEdit ? 'Open Editor' : 'View Full'}
          </Button>
        </CardHeader>
        <CardContent>
          {narrative ? (
            <RichTextDisplay content={narrative} />
          ) : (
            <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
              No minutes narrative yet.
              {canEdit ? ' Click "Open Editor" to write it.' : ''}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Changes log ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0'>
          <div>
            <CardTitle className='text-base'>Suggested Changes</CardTitle>
            <p className='text-xs text-muted-foreground mt-1'>
              Track per-syllabus changes proposed during the meeting and who
              suggested each one.
            </p>
          </div>
          {canEdit && (
            <Button onClick={addChangeRow} variant='outline' size='sm'>
              <Plus className='mr-2 h-4 w-4' />
              Add Row
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {changesLog.length === 0 ? (
            <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
              No suggested changes recorded yet.
              {canEdit ? ' Click "Add Row" to add one.' : ''}
            </div>
          ) : (
            <div className='space-y-3'>
              {changesLog.map((row, idx) => (
                <div
                  key={row.id}
                  className='rounded-lg border p-3 space-y-3 bg-muted/20'
                >
                  {/* Row header — index + remove button */}
                  <div className='flex items-center justify-between'>
                    <span className='text-xs font-semibold text-muted-foreground'>
                      Change #{idx + 1}
                    </span>
                    {canEdit && (
                      <Button
                        onClick={() => removeChangeRow(row.id)}
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7'
                        aria-label='Remove change'
                        title='Remove this change'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    )}
                  </div>

                  {/* Syllabus + suggested-by.
                      Changing the syllabus clears unit/topic/sub_topic because
                      those dropdowns are cascading: their option lists derive
                      from the picked syllabus's course_content.units → chapters
                      → subtopics. Leaving the old values when the syllabus
                      changes would let users persist e.g. a "Unit III" from
                      Syllabus A onto a record that points to Syllabus B,
                      where Unit III may not exist or means something else. */}
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                    <div>
                      <Label className='text-xs'>Syllabus / Course</Label>
                      <SearchableSelect
                        value={row.syllabus_id ?? ''}
                        onValueChange={(val) => {
                          const sel = syllabi.find((s) => s.id === val);
                          updateChangeRow(row.id, {
                            syllabus_id: sel?.id ?? null,
                            syllabus_code: sel?.course_code ?? null,
                            unit: null,
                            topic: [],
                            sub_topic: [],
                          });
                        }}
                        options={syllabi.map((s) => ({
                          value: s.id,
                          label: `${s.course_code} — ${s.course_name}`,
                        }))}
                        placeholder='Pick course (optional)'
                        searchPlaceholder='Search code or name…'
                        disabled={!canEdit}
                        className='w-full'
                      />
                    </div>

                    {/* Suggested by — multi-select with chips. Mirrors the
                        topic/sub-topic pattern: picker only shows un-picked
                        members; selections render as removable chips. Stores
                        member IDs + denormalized names side-by-side so PDF
                        and DOCX exports don't need to re-resolve members. */}
                    {(() => {
                      const selectedMemberIds = asTopicArray(row.suggested_by_member_id);
                      const selectedMemberNames = asTopicArray(row.suggested_by_name);
                      // Pair (id, name) by index so removing one drops the
                      // matching name too. Build a quick id→name map for chip
                      // rendering since name might be missing for legacy rows.
                      const idToName = new Map<string, string>();
                      selectedMemberIds.forEach((id, i) => {
                        idToName.set(
                          id,
                          selectedMemberNames[i] ??
                            members.find((mm) => mm.id === id)?.display_name ??
                            id,
                        );
                      });
                      const availableMembers = members.filter(
                        (m) => !selectedMemberIds.includes(m.id),
                      );

                      const handleAddMember = (val: string) => {
                        if (!val) return;
                        const m = members.find((mm) => mm.id === val);
                        if (!m) return;
                        updateChangeRow(row.id, {
                          suggested_by_member_id: [...selectedMemberIds, m.id],
                          suggested_by_name: [
                            ...selectedMemberNames,
                            m.display_name,
                          ],
                        });
                      };
                      const handleRemoveMember = (id: string) => {
                        const idx = selectedMemberIds.indexOf(id);
                        if (idx === -1) return;
                        const nextIds = [...selectedMemberIds];
                        const nextNames = [...selectedMemberNames];
                        nextIds.splice(idx, 1);
                        nextNames.splice(idx, 1);
                        updateChangeRow(row.id, {
                          suggested_by_member_id: nextIds,
                          suggested_by_name: nextNames,
                        });
                      };

                      return (
                        <div>
                          <Label className='text-xs'>
                            Suggested by{' '}
                            {selectedMemberIds.length > 0 && (
                              <span className='text-muted-foreground'>
                                ({selectedMemberIds.length} picked)
                              </span>
                            )}
                          </Label>
                          <SearchableSelect
                            value=''
                            onValueChange={handleAddMember}
                            options={availableMembers.map((m) => ({
                              value: m.id,
                              label: m.display_name,
                            }))}
                            placeholder={
                              availableMembers.length === 0
                                ? 'All members picked'
                                : 'Add member…'
                            }
                            searchPlaceholder='Search member…'
                            disabled={!canEdit || availableMembers.length === 0}
                            className='w-full'
                          />
                          {selectedMemberIds.length > 0 && (
                            <div className='flex flex-wrap gap-1 mt-1.5'>
                              {selectedMemberIds.map((id) => (
                                <span
                                  key={id}
                                  className='inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5'
                                >
                                  {idToName.get(id) ?? id}
                                  {canEdit && (
                                    <button
                                      type='button'
                                      onClick={() => handleRemoveMember(id)}
                                      className='hover:bg-primary/20 rounded-full p-0.5'
                                      aria-label={`Remove ${idToName.get(id) ?? id}`}
                                    >
                                      <X className='h-3 w-3' />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Unit / Topic / Sub-topic.
                      - Unit is single-select (one change row typically lives
                        inside one unit).
                      - Topic and Sub-topic are MULTI-select: a single change
                        often spans several related topics within the unit.
                        The picker appears at the top of each field; selected
                        items render as chips below with × to remove.

                      Stored values are display strings (e.g. "Unit III —
                      Software Architecture") rather than IDs so exports stay
                      readable even if the parent syllabus is later edited.
                      The unit label hides the em-dash when the syllabus has
                      no unit_title; same for topic/sub-topic via cleanLabel(). */}
                  {(() => {
                    const pickedSyllabus = row.syllabus_id
                      ? syllabi.find((s) => s.id === row.syllabus_id)
                      : undefined;
                    const units = pickedSyllabus?.course_content?.units ?? [];

                    const unitOptions = units.map((u) => {
                      const v = unitLabel(u.unit_id, u.unit_title);
                      return { value: v, label: v };
                    });

                    const pickedUnit = units.find(
                      (u) => unitLabel(u.unit_id, u.unit_title) === row.unit,
                    );

                    // Topic options: every chapter of the picked unit, label-cleaned.
                    const topicOptions = (pickedUnit?.chapters ?? [])
                      .map((c) => {
                        const v = cleanLabel(c.title);
                        return { value: v, label: v };
                      })
                      .filter((o) => o.value.length > 0);

                    const selectedTopics = asTopicArray(row.topic);

                    // Sub-topic options: union of subtopics across all currently
                    // picked topics. Lets a user add changes that span multiple
                    // topic-buckets in one row without filling separate rows.
                    const selectedTopicTitles = new Set(selectedTopics);
                    const subTopicOptions = (pickedUnit?.chapters ?? [])
                      .filter((c) => selectedTopicTitles.has(cleanLabel(c.title)))
                      .flatMap((c) => c.subtopics ?? [])
                      .map((st) => {
                        const v = cleanLabel(st.title);
                        return { value: v, label: v };
                      });
                    // De-dup option list (different chapters may share subtopic names).
                    const subTopicOptionsUnique = Array.from(
                      new Map(subTopicOptions.map((o) => [o.value, o])).values(),
                    );

                    const selectedSubTopics = asTopicArray(row.sub_topic);

                    const noSyllabus = !row.syllabus_id;
                    const noUnits = !noSyllabus && unitOptions.length === 0;

                    // Filter options to only those NOT already selected — the
                    // picker should only show un-picked items. Picked items
                    // appear as chips so users see what's selected at a glance.
                    const availableTopicOptions = topicOptions.filter(
                      (o) => !selectedTopics.includes(o.value),
                    );
                    const availableSubTopicOptions = subTopicOptionsUnique.filter(
                      (o) => !selectedSubTopics.includes(o.value),
                    );

                    const handleAddTopic = (val: string) => {
                      if (!val) return;
                      updateChangeRow(row.id, {
                        topic: [...selectedTopics, val],
                        // Don't auto-clear sub_topic when topics expand —
                        // existing sub-topic picks may still belong to other
                        // already-picked topics.
                      });
                    };
                    const handleRemoveTopic = (val: string) => {
                      const next = selectedTopics.filter((t) => t !== val);
                      // Drop sub-topics whose parent topic was removed.
                      const nextTopicSet = new Set(next);
                      const validSubtopicValues = new Set(
                        (pickedUnit?.chapters ?? [])
                          .filter((c) => nextTopicSet.has(cleanLabel(c.title)))
                          .flatMap((c) => c.subtopics ?? [])
                          .map((st) => cleanLabel(st.title)),
                      );
                      const filteredSubTopics = selectedSubTopics.filter((st) =>
                        validSubtopicValues.has(st),
                      );
                      updateChangeRow(row.id, {
                        topic: next,
                        sub_topic: filteredSubTopics,
                      });
                    };

                    const handleAddSubTopic = (val: string) => {
                      if (!val) return;
                      updateChangeRow(row.id, {
                        sub_topic: [...selectedSubTopics, val],
                      });
                    };
                    const handleRemoveSubTopic = (val: string) => {
                      updateChangeRow(row.id, {
                        sub_topic: selectedSubTopics.filter((s) => s !== val),
                      });
                    };

                    return (
                      <div className='grid grid-cols-1 lg:grid-cols-3 gap-3'>
                        {/* ── Unit (single-select) ─────────────────────── */}
                        <div>
                          <Label className='text-xs'>Unit</Label>
                          <SearchableSelect
                            value={row.unit ?? ''}
                            onValueChange={(val) =>
                              updateChangeRow(row.id, {
                                unit: val || null,
                                topic: [],
                                sub_topic: [],
                              })
                            }
                            options={unitOptions}
                            placeholder={
                              noSyllabus
                                ? 'Pick a syllabus first'
                                : noUnits
                                  ? 'No units in syllabus'
                                  : 'Pick unit'
                            }
                            searchPlaceholder='Search unit…'
                            disabled={!canEdit || noSyllabus || noUnits}
                            modal={true}
                            className='w-full'
                          />
                        </div>

                        {/* ── Topic (multi-select with chips) ──────────── */}
                        <div>
                          <Label className='text-xs'>
                            Topics{' '}
                            {selectedTopics.length > 0 && (
                              <span className='text-muted-foreground'>
                                ({selectedTopics.length} picked)
                              </span>
                            )}
                          </Label>
                          <SearchableSelect
                            value=''
                            onValueChange={handleAddTopic}
                            options={availableTopicOptions}
                            placeholder={
                              !row.unit
                                ? 'Pick a unit first'
                                : topicOptions.length === 0
                                  ? 'No topics in unit'
                                  : availableTopicOptions.length === 0
                                    ? 'All topics picked'
                                    : 'Add topic…'
                            }
                            searchPlaceholder='Search topic…'
                            disabled={
                              !canEdit ||
                              !row.unit ||
                              availableTopicOptions.length === 0
                            }
                            modal={true}
                            className='w-full'
                          />
                          {selectedTopics.length > 0 && (
                            <div className='flex flex-wrap gap-1 mt-1.5'>
                              {selectedTopics.map((t) => (
                                <span
                                  key={t}
                                  className='inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5'
                                >
                                  {t}
                                  {canEdit && (
                                    <button
                                      type='button'
                                      onClick={() => handleRemoveTopic(t)}
                                      className='hover:bg-primary/20 rounded-full p-0.5'
                                      aria-label={`Remove ${t}`}
                                    >
                                      <X className='h-3 w-3' />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* ── Sub-topic (multi-select with chips) ──────── */}
                        <div>
                          <Label className='text-xs'>
                            Sub-topics{' '}
                            {selectedSubTopics.length > 0 && (
                              <span className='text-muted-foreground'>
                                ({selectedSubTopics.length} picked)
                              </span>
                            )}
                          </Label>
                          <SearchableSelect
                            value=''
                            onValueChange={handleAddSubTopic}
                            options={availableSubTopicOptions}
                            placeholder={
                              selectedTopics.length === 0
                                ? 'Pick a topic first'
                                : subTopicOptionsUnique.length === 0
                                  ? 'No sub-topics in topics'
                                  : availableSubTopicOptions.length === 0
                                    ? 'All sub-topics picked'
                                    : 'Add sub-topic…'
                            }
                            searchPlaceholder='Search sub-topic…'
                            disabled={
                              !canEdit ||
                              selectedTopics.length === 0 ||
                              availableSubTopicOptions.length === 0
                            }
                            modal={true}
                            className='w-full'
                          />
                          {selectedSubTopics.length > 0 && (
                            <div className='flex flex-wrap gap-1 mt-1.5'>
                              {selectedSubTopics.map((st) => (
                                <span
                                  key={st}
                                  className='inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-xs px-2 py-0.5'
                                >
                                  {st}
                                  {canEdit && (
                                    <button
                                      type='button'
                                      onClick={() => handleRemoveSubTopic(st)}
                                      className='hover:bg-secondary/80 rounded-full p-0.5'
                                      aria-label={`Remove ${st}`}
                                    >
                                      <X className='h-3 w-3' />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Suggestion text */}
                  <div>
                    <Label className='text-xs'>Suggested Change *</Label>
                    <textarea
                      value={row.suggestion_text}
                      onChange={(e) =>
                        updateChangeRow(row.id, {
                          suggestion_text: e.target.value,
                        })
                      }
                      disabled={!canEdit}
                      placeholder='Describe the suggested change…'
                      className='w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y min-h-[60px] disabled:opacity-60 disabled:cursor-not-allowed'
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
