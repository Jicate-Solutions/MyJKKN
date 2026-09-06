'use client';

// Pharmacy (COP) syllabus editors — the tabs that replace the Anna
// CO-PO/CLO/Pedagogy sections for the pci_pharm (B.Pharm) and mgr_pharmd
// (Pharm.D) academic models. Kept in a separate file so the 3,900-line
// syllabus-form.tsx only needs thin wiring. All three are controlled: they
// take a value + onChange and never own state, so they slot straight into the
// parent form's formData / updateField flow.
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import type {
  BosExamScheme,
  BosExamSchemeComponent,
  BosExamQuestionSection,
  BosInternshipPostings,
  BosInternshipPosting,
  BosAhsContent,
  BosAhsSubject,
} from '@/types/bos';

// ── Scope (B.Pharm "Scope" paragraph) ────────────────────────────────
export function PharmacyScopeCard({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scope</CardTitle>
        <CardDescription>
          The course &quot;Scope&quot; paragraph as it appears at the top of the PCI
          B.Pharm syllabus (before the Objectives list).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder="This subject is designed to impart fundamental knowledge on…"
        />
      </CardContent>
    </Card>
  );
}

// ── Exam scheme (PCI IA+End-Sem / Dr. MGR Theory+IA+Practical+Oral) ───
const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function PharmacyExamSchemeCard({
  value,
  onChange,
  showQuestionPattern = false,
}: {
  value?: BosExamScheme;
  onChange: (v: BosExamScheme) => void;
  /** PCI B.Pharm shows a theory question-paper blueprint; Pharm.D does not. */
  showQuestionPattern?: boolean;
}) {
  const scheme: BosExamScheme = value ?? {};
  const components: BosExamSchemeComponent[] = scheme.components ?? [];
  const sections: BosExamQuestionSection[] = scheme.question_pattern?.sections ?? [];

  const patch = (p: Partial<BosExamScheme>) => onChange({ ...scheme, ...p });

  const setComponent = (i: number, p: Partial<BosExamSchemeComponent>) => {
    const next = components.map((c, idx) => (idx === i ? { ...c, ...p } : c));
    patch({ components: next });
  };
  const addComponent = () =>
    patch({ components: [...components, { name: '', max: null, min: null }] });
  const removeComponent = (i: number) =>
    patch({ components: components.filter((_, idx) => idx !== i) });

  const setSection = (i: number, p: Partial<BosExamQuestionSection>) => {
    const next = sections.map((s, idx) => (idx === i ? { ...s, ...p } : s));
    patch({ question_pattern: { ...scheme.question_pattern, sections: next } });
  };
  const addSection = () =>
    patch({
      question_pattern: {
        ...scheme.question_pattern,
        sections: [...sections, { name: '', marks: null }],
      },
    });
  const removeSection = (i: number) =>
    patch({
      question_pattern: {
        ...scheme.question_pattern,
        sections: sections.filter((_, idx) => idx !== i),
      },
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exam Scheme</CardTitle>
        <CardDescription>
          Marks components and pass rule. Replaces the Anna CO-PO / Bloom
          assessment blocks — pharmacy syllabi have no outcome mapping.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Components */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Mark components</h4>
            <Button type="button" variant="outline" size="sm" onClick={addComponent}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add component
            </Button>
          </div>
          {components.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No components yet. Add e.g. &quot;Internal Assessment&quot; (max 25) and
              &quot;End Semester (Theory)&quot; (max 75).
            </p>
          )}
          {components.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_5rem_6rem_auto] items-end gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Component</label>
                <Input
                  value={c.name}
                  onChange={(e) => setComponent(i, { name: e.target.value })}
                  placeholder="Internal Assessment"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Max</label>
                <Input
                  inputMode="numeric"
                  value={c.max ?? ''}
                  onChange={(e) => setComponent(i, { max: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Min</label>
                <Input
                  inputMode="numeric"
                  value={c.min ?? ''}
                  onChange={(e) => setComponent(i, { min: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Duration (h)</label>
                <Input
                  inputMode="numeric"
                  value={c.duration_hours ?? ''}
                  onChange={(e) => setComponent(i, { duration_hours: numOrNull(e.target.value) })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeComponent(i)}
                aria-label="Remove component"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        {/* Totals + pass rule */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground">Total marks</label>
            <Input
              inputMode="numeric"
              value={scheme.total_marks ?? ''}
              onChange={(e) => patch({ total_marks: numOrNull(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Pass %</label>
            <Input
              inputMode="numeric"
              value={scheme.pass_pct ?? ''}
              onChange={(e) => patch({ pass_pct: numOrNull(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Distinction %</label>
            <Input
              inputMode="numeric"
              value={scheme.distinction_pct ?? ''}
              onChange={(e) => patch({ distinction_pct: numOrNull(e.target.value) })}
            />
          </div>
        </div>

        {/* PCI theory question-paper blueprint (B.Pharm only) */}
        {showQuestionPattern && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Question-paper pattern (theory)</h4>
              <Button type="button" variant="outline" size="sm" onClick={addSection}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add section
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="text-xs text-muted-foreground">Variant (marks)</label>
                <Input
                  value={scheme.question_pattern?.variant ?? ''}
                  onChange={(e) =>
                    patch({
                      question_pattern: { ...scheme.question_pattern, variant: e.target.value },
                    })
                  }
                  placeholder="75"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Duration (h)</label>
                <Input
                  inputMode="numeric"
                  value={scheme.question_pattern?.duration_hours ?? ''}
                  onChange={(e) =>
                    patch({
                      question_pattern: {
                        ...scheme.question_pattern,
                        duration_hours: numOrNull(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </div>
            {sections.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_auto] items-end gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Section</label>
                  <Input
                    value={s.name}
                    onChange={(e) => setSection(i, { name: e.target.value })}
                    placeholder="Long Answers (2 of 3)"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Marks</label>
                  <Input
                    inputMode="numeric"
                    value={s.marks ?? ''}
                    onChange={(e) => setSection(i, { marks: numOrNull(e.target.value) })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSection(i)}
                  aria-label="Remove section"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground">Notes</label>
          <Textarea
            value={scheme.notes ?? ''}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Internship / Residency postings (Pharm.D 6th year) ────────────────
export function PharmacyInternshipCard({
  value,
  onChange,
}: {
  value?: BosInternshipPostings;
  onChange: (v: BosInternshipPostings) => void;
}) {
  const data: BosInternshipPostings = value ?? {};
  const postings: BosInternshipPosting[] = data.postings ?? [];
  const patch = (p: Partial<BosInternshipPostings>) => onChange({ ...data, ...p });

  const setPosting = (i: number, p: Partial<BosInternshipPosting>) =>
    patch({ postings: postings.map((x, idx) => (idx === i ? { ...x, ...p } : x)) });
  const addPosting = () => patch({ postings: [...postings, { area: '', duration: '' }] });
  const removePosting = (i: number) =>
    patch({ postings: postings.filter((_, idx) => idx !== i) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Internship / Residency</CardTitle>
        <CardDescription>
          Pharm.D sixth-year postings (e.g. 6 months General Medicine + 2 months
          each in three specialty departments).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Total duration</label>
          <Input
            value={data.total_duration ?? ''}
            onChange={(e) => patch({ total_duration: e.target.value })}
            placeholder="12 months"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Postings</h4>
            <Button type="button" variant="outline" size="sm" onClick={addPosting}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add posting
            </Button>
          </div>
          {postings.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_5rem_auto] items-end gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Area / department</label>
                <Input
                  value={p.area}
                  onChange={(e) => setPosting(i, { area: e.target.value })}
                  placeholder="General Medicine"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Duration</label>
                <Input
                  value={p.duration ?? ''}
                  onChange={(e) => setPosting(i, { duration: e.target.value })}
                  placeholder="6 months"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Repeat ×</label>
                <Input
                  inputMode="numeric"
                  value={p.repeat ?? ''}
                  onChange={(e) => setPosting(i, { repeat: numOrNull(e.target.value) ?? undefined })}
                  placeholder="3"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removePosting(i)}
                aria-label="Remove posting"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Notes</label>
          <Textarea
            value={data.notes ?? ''}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── AHS / Pharm.D content tree (year → subject/paper → flat topics | units) ──
// Edits BosAhsContent { intro?, subjects: BosAhsSubject[] }. Distinct from the
// Anna Unit I–V ContentEditor (which reads course_content). One AHS syllabus row
// is one paper, so `subjects` typically holds a single entry — but the editor
// supports many so a year-bundled subject can be authored too.
//
// Note: topics are stored as a string list here. Rows imported from PDF may hold
// a few {title, content} topic objects; those are coerced to "title: content"
// strings on first edit (display is lossless; a later edit flattens them).
const topicToStr = (t: unknown): string =>
  typeof t === 'string'
    ? t
    : t && typeof t === 'object'
      ? [((t as Record<string, unknown>).title ?? '') as string,
         ((t as Record<string, unknown>).content ?? '') as string]
          .filter(Boolean).join(': ')
      : String(t ?? '');

function StringListEditor({
  items,
  onChange,
  addLabel,
  placeholder,
  rows = 2,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      {items.map((val, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-2">
          <Textarea
            value={val}
            rows={rows}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ''])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

export function AhsContentCard({
  value,
  onChange,
}: {
  value?: BosAhsContent;
  onChange: (v: BosAhsContent) => void;
}) {
  const data: BosAhsContent = value ?? {};
  const subjects: BosAhsSubject[] = data.subjects ?? [];
  const patch = (p: Partial<BosAhsContent>) => onChange({ ...data, ...p });
  const setSubject = (i: number, p: Partial<BosAhsSubject>) =>
    patch({ subjects: subjects.map((s, idx) => (idx === i ? { ...s, ...p } : s)) });
  const addSubject = () =>
    patch({ subjects: [...subjects, { title: '', mode: 'flat', topics: [], units: [], reference_books: [] }] });
  const removeSubject = (i: number) =>
    patch({ subjects: subjects.filter((_, idx) => idx !== i) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content</CardTitle>
        <CardDescription>
          Paper / subject topics for the year-based (Dr. M.G.R. / AHS) model. Use
          &quot;flat&quot; for a straight topic list, or &quot;units&quot; for a Unit-grouped paper.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-xs text-muted-foreground">Intro / objectives (optional)</label>
          <Textarea
            value={data.intro ?? ''}
            onChange={(e) => patch({ intro: e.target.value })}
            rows={2}
          />
        </div>

        {subjects.length === 0 && (
          <p className="text-xs text-muted-foreground">No paper yet — add one.</p>
        )}

        {subjects.map((s, i) => {
          const topics = (s.topics ?? []).map(topicToStr);
          const units = s.units ?? [];
          return (
            <div key={i} className="space-y-3 rounded-md border p-3">
              <div className="grid grid-cols-[8rem_1fr_6rem_7rem_auto] items-end gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Paper / No.</label>
                  <Input
                    value={s.subject_no ?? ''}
                    onChange={(e) => setSubject(i, { subject_no: e.target.value })}
                    placeholder="Paper I"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Title</label>
                  <Input
                    value={s.title}
                    onChange={(e) => setSubject(i, { title: e.target.value })}
                    placeholder="Anatomy & Physiology"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Lecture hrs</label>
                  <Input
                    inputMode="numeric"
                    value={s.lecture_hours ?? ''}
                    onChange={(e) => setSubject(i, { lecture_hours: numOrNull(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Mode</label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={s.mode ?? 'flat'}
                    onChange={(e) => setSubject(i, { mode: e.target.value as 'flat' | 'units' })}
                  >
                    <option value="flat">flat</option>
                    <option value="units">units</option>
                  </select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSubject(i)}
                  aria-label="Remove paper"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              {(s.mode ?? 'flat') === 'flat' ? (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Topics</h4>
                  <StringListEditor
                    items={topics}
                    onChange={(next) => setSubject(i, { topics: next })}
                    addLabel="Add topic"
                    placeholder="Anatomy of the Upper and Lower airways"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Units</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSubject(i, { units: [...units, { unit_no: '', topics: [] }] })
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add unit
                    </Button>
                  </div>
                  {units.map((u, ui) => (
                    <div key={ui} className="space-y-2 rounded border-l-2 border-muted pl-3">
                      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Unit</label>
                          <Input
                            value={u.unit_no ?? ''}
                            onChange={(e) =>
                              setSubject(i, {
                                units: units.map((x, xi) => (xi === ui ? { ...x, unit_no: e.target.value } : x)),
                              })
                            }
                            placeholder="Unit 1"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setSubject(i, { units: units.filter((_, xi) => xi !== ui) })
                          }
                          aria-label="Remove unit"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <StringListEditor
                        items={(u.topics ?? []).map(topicToStr)}
                        onChange={(next) =>
                          setSubject(i, {
                            units: units.map((x, xi) => (xi === ui ? { ...x, topics: next } : x)),
                          })
                        }
                        addLabel="Add topic"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reference books</h4>
                <StringListEditor
                  items={(s.reference_books ?? []).map(topicToStr)}
                  onChange={(next) => setSubject(i, { reference_books: next })}
                  addLabel="Add reference"
                  rows={1}
                />
              </div>
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" onClick={addSubject}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add paper / subject
        </Button>
      </CardContent>
    </Card>
  );
}
