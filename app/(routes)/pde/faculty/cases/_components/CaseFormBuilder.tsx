'use client';

// CaseFormBuilder — the canonical visual editor for a clinical_case.
// Used by both /pde/faculty/cases/new and /pde/faculty/cases/[id]/edit.
//
// Tabs: Patient Details · Stages · Questions · Domain Weights · Metadata
//
// STAGES ARE OPTIONAL. Add none and the case is flat — one patient scenario and
// a list of questions, exactly as clinical cases worked before stages existed,
// and exactly how every case authored to date still works.
//
// Add stages and the case becomes a progressive vignette: each stage carries
// its own clinical narrative and figure, every question is assigned to a stage,
// and a learner must pass each stage before the next opens.

import { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  AlertTriangle,
  CheckCircle2,
  Upload,
  Loader2,
  ChevronUp,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { stripImageMetadata } from '@/lib/services/pde/strip-image-metadata';
import { validateClinicalQuestion } from '@/lib/services/pde/clinical-question-validation';
import type {
  CreateClinicalCaseInput,
  CreateClinicalCaseStageInput,
  CreateClinicalQuestionInput,
  ClinicalCaseScenario,
  DomainWeights,
  ImportedPmsImage,
  OSCEDomain,
} from '@/types/pde';
import { DomainWeightSliders } from './DomainWeightSliders';
import { QuestionEditor } from './QuestionEditor';

interface VacCourseOption {
  id: string;
  code?: string;
  name: string;
}

interface Props {
  initialValue?: Partial<CreateClinicalCaseInput>;
  /** De-identified PMS image candidates — faculty must confirm each before use (default-deny). */
  importedImages?: ImportedPmsImage[];
  courseOptions: VacCourseOption[];
  saving?: boolean;
  saveLabel?: string;
  onSave: (value: CreateClinicalCaseInput) => Promise<void> | void;
  extraActions?: React.ReactNode;
}

const DEFAULT_WEIGHTS: DomainWeights = {
  data_gathering: 20,
  hypothesis_generation: 20,
  management_planning: 20,
  patient_communication: 20,
  professionalism: 20,
};

const EMPTY_SCENARIO: ClinicalCaseScenario = {
  patient_name: '',
  age: 0,
  gender: '',
  chief_complaint: '',
  hopi: '',
};

const NEW_QUESTION = (idx: number): CreateClinicalQuestionInput => ({
  question_type: 'free_text_socratic',
  question_text: '',
  points: 10,
  order_index: idx + 1,
  metadata: {
    q_number: idx + 1,
    osce_domain: 'data_gathering' as OSCEDomain,
    ground_truth: '',
    key_concepts: [],
  },
});

function asPercent(v: number) {
  return v <= 1 ? v * 100 : v;
}

function weightsToPercent(w: DomainWeights): DomainWeights {
  return {
    data_gathering: asPercent(w.data_gathering),
    hypothesis_generation: asPercent(w.hypothesis_generation),
    management_planning: asPercent(w.management_planning),
    patient_communication: asPercent(w.patient_communication),
    professionalism: asPercent(w.professionalism),
  };
}

export function CaseFormBuilder({
  initialValue,
  importedImages,
  courseOptions,
  saving,
  saveLabel = 'Save',
  onSave,
  extraActions,
}: Props) {
  const [courseId, setCourseId] = useState<string>(initialValue?.course_id || '');
  const [title, setTitle] = useState<string>(initialValue?.title || '');
  const [description, setDescription] = useState<string>(initialValue?.description || '');
  const [scenario, setScenario] = useState<ClinicalCaseScenario>(
    initialValue?.case_scenario ?? EMPTY_SCENARIO
  );
  const [weights, setWeights] = useState<DomainWeights>(
    initialValue?.metadata?.domain_weights
      ? weightsToPercent(initialValue.metadata.domain_weights as DomainWeights)
      : DEFAULT_WEIGHTS
  );
  const [discipline, setDiscipline] = useState<string>(
    initialValue?.metadata?.discipline || 'oral_medicine'
  );
  const [timeLimit, setTimeLimit] = useState<number | null>(
    initialValue?.time_limit_minutes ?? null
  );
  const [passThreshold, setPassThreshold] = useState<number>(
    initialValue?.pass_threshold ?? 60
  );
  const [questions, setQuestions] = useState<CreateClinicalQuestionInput[]>(
    initialValue?.questions && initialValue.questions.length > 0
      ? initialValue.questions
      : [NEW_QUESTION(0)]
  );
  const [stages, setStages] = useState<CreateClinicalCaseStageInput[]>(
    initialValue?.stages ?? []
  );
  const [tab, setTab] = useState<'patient' | 'stages' | 'questions' | 'weights' | 'metadata'>(
    'patient'
  );
  const [error, setError] = useState<string | null>(null);
  // Per-image confirmation that no burned-in identifier is visible.
  // Unconfirmed images cannot be attached anywhere (default-deny).
  const [confirmedImages, setConfirmedImages] = useState<Record<string, boolean>>({});
  // Candidates = PMS imports (seeded from the prop) plus anything uploaded here.
  // Both go through the same confirmation gate.
  const [images, setImages] = useState<ImportedPmsImage[]>(importedImages ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      // Strip metadata in the browser before the bytes ever leave the machine;
      // the route re-verifies and fails closed.
      const { blob } = await stripImageMetadata(file);
      const body = new FormData();
      body.append('image', blob, 'clinical.jpg');
      const res = await fetch('/api/pde/cases/upload-image', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data?.error || 'The image could not be uploaded.');
        return;
      }
      const uploaded = data.image as ImportedPmsImage;
      setImages((prev) => [...prev, { ...uploaded, seq: prev.length + 1 }]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'The image could not be uploaded.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const weightsSum = (Object.values(weights) as number[]).reduce((a, b) => a + b, 0);
  const weightsValid = Math.abs(weightsSum - 100) < 0.5;

  const setScenarioField = <K extends keyof ClinicalCaseScenario>(
    key: K,
    value: ClinicalCaseScenario[K]
  ) => setScenario((s) => ({ ...s, [key]: value }));

  const addQuestion = () =>
    setQuestions((qs) => [...qs, NEW_QUESTION(qs.length)]);

  const removeQuestion = (i: number) =>
    setQuestions((qs) => qs.filter((_q, idx) => idx !== i).map((q, idx) => ({
      ...q,
      order_index: idx + 1,
      metadata: { ...q.metadata, q_number: idx + 1 },
    })));

  const updateQuestion = (i: number, next: CreateClinicalQuestionInput) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? next : q)));

  // ── Stages ────────────────────────────────────────────────────────────────
  // A question points at its stage by INDEX, so reordering or deleting a stage
  // has to re-point the questions in the same breath. Getting this wrong would
  // silently move a question into the wrong stage — and in a staged case the
  // wrong stage can be one that states the answer.

  const addStage = () =>
    setStages((ss) => [
      ...ss,
      { title: `Stage ${ss.length + 1}`, scenario_text: '', image_url: null, order_index: ss.length + 1 },
    ]);

  const updateStage = (i: number, patch: Partial<CreateClinicalCaseStageInput>) =>
    setStages((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const removeStage = (i: number) => {
    setStages((ss) => ss.filter((_s, idx) => idx !== i).map((s, idx) => ({ ...s, order_index: idx + 1 })));
    setQuestions((qs) =>
      qs.map((q) => {
        if (typeof q.stage_index !== 'number') return q;
        if (q.stage_index === i) return { ...q, stage_index: null }; // orphaned — validate() catches it
        return q.stage_index > i ? { ...q, stage_index: q.stage_index - 1 } : q;
      })
    );
  };

  const moveStage = (i: number, delta: -1 | 1) => {
    const target = i + delta;
    if (target < 0 || target >= stages.length) return;
    setStages((ss) => {
      const next = [...ss];
      [next[i], next[target]] = [next[target], next[i]];
      return next.map((s, idx) => ({ ...s, order_index: idx + 1 }));
    });
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.stage_index === i) return { ...q, stage_index: target };
        if (q.stage_index === target) return { ...q, stage_index: i };
        return q;
      })
    );
  };

  const moveQuestion = (i: number, delta: -1 | 1) => {
    setQuestions((qs) => {
      const target = i + delta;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[target]] = [next[target], next[i]];
      return next.map((q, idx) => ({
        ...q,
        order_index: idx + 1,
        metadata: { ...q.metadata, q_number: idx + 1 },
      }));
    });
  };

  const validate = (): string | null => {
    if (!courseId) return 'Select a cohort/course.';
    if (!title.trim()) return 'Title is required.';
    if (!scenario.patient_name) return 'Patient name is required.';
    if (!scenario.chief_complaint) return 'Chief complaint is required.';
    if (!scenario.hopi) return 'History of presenting illness (HOPI) is required.';
    if (!weightsValid) return `Domain weights must sum to 100 (currently ${weightsSum.toFixed(1)}).`;
    if (questions.length === 0) return 'At least one question is required.';
    for (let i = 0; i < stages.length; i++) {
      if (!stages[i].title.trim()) return `Stage ${i + 1}: a title is required.`;
      if (!(stages[i].scenario_text || '').trim()) {
        return `Stage ${i + 1}: this stage needs its own clinical scenario text.`;
      }
      if (!questions.some((q) => q.stage_index === i)) {
        return `Stage ${i + 1} has no questions. A learner cannot pass a stage with nothing to answer.`;
      }
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text.trim()) return `Q${i + 1}: question text is required.`;
      if (!q.metadata.ground_truth.trim()) return `Q${i + 1}: ground truth is required.`;
      if (stages.length > 0) {
        if (
          typeof q.stage_index !== 'number' ||
          q.stage_index < 0 ||
          q.stage_index >= stages.length
        ) {
          return `Q${i + 1}: choose which stage this question belongs to.`;
        }
      }
      if (q.question_type === 'mcq_warmup') {
        if (!q.options || q.options.length < 2) return `Q${i + 1}: MCQ requires at least 2 options.`;
        if (!q.options.some((o) => o.is_correct)) return `Q${i + 1}: mark one option as correct.`;
      }
      if (q.question_type === 'image_tag') {
        if (!q.question_media_url) return `Q${i + 1}: image URL is required for image-tag.`;
        if (!q.expected_regions || q.expected_regions.length === 0) {
          return `Q${i + 1}: draw at least one region on the image.`;
        }
      }
      // The three progressive-vignette formats are checked by the same function
      // the API uses, so the editor and the server cannot drift apart on what
      // counts as a well-formed answer key.
      const fmtErr = validateClinicalQuestion(q, `Q${i + 1}`);
      if (fmtErr) return fmtErr;
    }
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    await onSave({
      course_id: courseId,
      title: title.trim(),
      description: description.trim() || undefined,
      case_scenario: scenario,
      metadata: {
        domain_weights: weights,
        discipline: discipline || undefined,
      },
      time_limit_minutes: timeLimit ?? undefined,
      pass_threshold: passThreshold,
      questions,
      stages,
    });
  };

  // External callers (e.g. JSON import) can drive the entire state by passing
  // a new initialValue — but here we expose a helper as well to keep the API
  // clean. Currently this is unused; left for future.

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="flex w-full justify-start gap-1 overflow-x-auto sm:grid sm:grid-cols-5 sm:gap-0 sm:overflow-visible mb-4">
              <TabsTrigger value="patient">Patient Details</TabsTrigger>
              <TabsTrigger value="stages">
                Stages {stages.length > 0 ? `(${stages.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
              <TabsTrigger value="weights">
                Weights {weightsValid ? '✓' : '⚠'}
              </TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>

            {/* Patient Details */}
            <TabsContent value="patient" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cohort / Course</Label>
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cohort…" />
                    </SelectTrigger>
                    <SelectContent>
                      {courseOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code ? `${c.code} — ${c.name}` : c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Case Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Oral Lichen Planus — Mrs. Lalitha, 52F"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Description (faculty notes)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Patient Name</Label>
                  <Input
                    value={scenario.patient_name}
                    onChange={(e) => setScenarioField('patient_name', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Age</Label>
                  <Input
                    type="number"
                    min={0}
                    value={scenario.age || ''}
                    onChange={(e) =>
                      setScenarioField('age', Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Gender</Label>
                  <Input
                    value={scenario.gender}
                    onChange={(e) => setScenarioField('gender', e.target.value)}
                    placeholder="Female / Male / Other"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Occupation (optional)</Label>
                <Input
                  value={scenario.occupation || ''}
                  onChange={(e) => setScenarioField('occupation', e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs">Chief Complaint</Label>
                <Textarea
                  value={scenario.chief_complaint}
                  onChange={(e) => setScenarioField('chief_complaint', e.target.value)}
                  rows={2}
                />
              </div>

              <div>
                <Label className="text-xs">History of Presenting Illness (HOPI)</Label>
                <Textarea
                  value={scenario.hopi}
                  onChange={(e) => setScenarioField('hopi', e.target.value)}
                  rows={4}
                />
              </div>

              <div>
                <Label className="text-xs">Medical History</Label>
                <Textarea
                  value={scenario.medical_history || ''}
                  onChange={(e) =>
                    setScenarioField('medical_history', e.target.value)
                  }
                  rows={3}
                />
              </div>

              <div>
                <Label className="text-xs">Additional Clinical Details</Label>
                <Textarea
                  value={scenario.additional_clinical_details || ''}
                  onChange={(e) =>
                    setScenarioField('additional_clinical_details', e.target.value)
                  }
                  rows={3}
                />
              </div>

              <div>
                <Label className="text-xs">Optional patient image URL</Label>
                <Input
                  value={scenario.image_url || ''}
                  onChange={(e) => setScenarioField('image_url', e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-3 border rounded-md p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Clinical images {images.length > 0 ? `(${images.length})` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUpload(e.target.files?.[0])}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Preparing…
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-1" /> Upload an image
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Camera, location, and timestamp data is removed from every uploaded
                  image before it leaves your device, and the image is converted to JPEG.
                </p>

                {uploadError ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{uploadError}</AlertDescription>
                  </Alert>
                ) : null}

                {images.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      File metadata has been removed, but identifiers can still be{' '}
                      <strong>burned into the pixels</strong> — patient names or IDs in
                      imaging-software panels, <strong>date or time stamps</strong> (including
                      a clock or notification bar in a photographed monitor), and stamps at
                      the edges. Inspect each image closely, corners included; it can only be
                      used after you confirm it is clean.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No images yet. Upload one, or use the “Import from PMS” tab to pull
                    de-identified images from a casesheet.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {images.map((img) => {
                      const confirmed = !!confirmedImages[img.url];
                      const inUse = scenario.image_url === img.url;
                      return (
                        <div key={img.url} className="border rounded-md p-2 space-y-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={`Imported clinical image ${img.seq}`}
                            className="w-full h-40 object-contain bg-muted rounded"
                          />
                          <div className="text-xs text-muted-foreground">
                            {img.kind.replace(/_/g, ' ')}
                            {img.taken_at ? ` · ${img.taken_at}` : ''}
                          </div>
                          <label className="flex items-start gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={confirmed}
                              onChange={(e) => {
                                const ok = e.target.checked;
                                setConfirmedImages((m) => ({ ...m, [img.url]: ok }));
                                // Withdrawing confirmation also withdraws the image from use.
                                if (!ok && scenario.image_url === img.url) {
                                  setScenarioField('image_url', '');
                                }
                                // Record the judgement (and any reversal) for audit.
                                // Deliberately fire-and-forget: a failed audit write
                                // must never block the reviewer, or people learn to
                                // route around the gate itself.
                                void fetch('/api/pde/cases/image-review', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    image_url: img.url,
                                    decision: ok ? 'confirmed_clean' : 'withdrawn',
                                    source: img.kind === 'uploaded' ? 'upload' : 'pms_import',
                                  }),
                                }).catch(() => {});
                              }}
                            />
                            <span>
                              I checked — no patient name, ID, date of birth, or other
                              identifying detail is visible in this image.
                            </span>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={inUse ? 'secondary' : 'outline'}
                              disabled={!confirmed || inUse}
                              onClick={() => setScenarioField('image_url', img.url)}
                            >
                              {inUse ? 'In use as patient image' : 'Use as patient image'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!confirmed}
                              onClick={() => navigator.clipboard?.writeText(img.url)}
                            >
                              Copy URL
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
                {images.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    “Copy URL” lets you paste a confirmed image into an image-tag question on
                    the Questions tab.
                  </p>
                ) : null}
              </div>
            </TabsContent>

            {/* Stages */}
            <TabsContent value="stages" className="space-y-3">
              <Alert>
                <AlertDescription className="text-xs">
                  Stages are optional. With none, this case is a single scenario followed by
                  its questions — how clinical cases have always worked. Add stages to build a
                  progressive vignette: each stage gets its own scenario text and figure, and a
                  learner must pass one stage before the next opens. Use that when a later
                  stage states a finding the earlier one asks about.
                </AlertDescription>
              </Alert>

              {stages.map((s, i) => (
                <div key={i} className="border rounded-md p-4 bg-card space-y-3">
                  <div className="flex justify-between items-center gap-3">
                    <p className="text-sm font-medium">Stage {i + 1}</p>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Move stage ${i + 1} earlier`}
                        disabled={i === 0}
                        onClick={() => moveStage(i, -1)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Move stage ${i + 1} later`}
                        disabled={i === stages.length - 1}
                        onClick={() => moveStage(i, 1)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove stage ${i + 1}`}
                        onClick={() => removeStage(i)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Stage title</Label>
                    <Input
                      value={s.title}
                      onChange={(e) => updateStage(i, { title: e.target.value })}
                      placeholder="e.g. Clinical presentation"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Learners see this title only once the stage opens, so it is safe for it to
                      name the finding.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs">Clinical scenario for this stage</Label>
                    <Textarea
                      rows={4}
                      value={s.scenario_text || ''}
                      onChange={(e) => updateStage(i, { scenario_text: e.target.value })}
                      placeholder="e.g. A punch biopsy is performed from the perilesional mucosa. Tzanck smear preparation reveals acantholytic cells."
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Figure for this stage (image URL, optional)</Label>
                    <Input
                      value={s.image_url || ''}
                      onChange={(e) => updateStage(i, { image_url: e.target.value || null })}
                      placeholder="https://… — copy a confirmed image URL from Patient Details"
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {questions.filter((q) => q.stage_index === i).length} question(s) in this
                    stage. Assign questions on the Questions tab.
                  </p>
                </div>
              ))}

              <Button variant="outline" onClick={addStage} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                {stages.length === 0 ? 'Turn this into a staged case' : 'Add another stage'}
              </Button>
            </TabsContent>

            {/* Questions */}
            <TabsContent value="questions" className="space-y-3">
              {questions.map((q, i) => (
                <QuestionEditor
                  key={i}
                  index={i}
                  total={questions.length}
                  question={q}
                  onChange={(next) => updateQuestion(i, next)}
                  onRemove={() => removeQuestion(i)}
                  onMove={(delta) => moveQuestion(i, delta)}
                  stageTitles={stages.map((s) => s.title)}
                />
              ))}
              <Button variant="outline" onClick={addQuestion} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add another question
              </Button>
            </TabsContent>

            {/* Domain Weights */}
            <TabsContent value="weights">
              <DomainWeightSliders value={weights} onChange={setWeights} />
              {weightsValid ? (
                <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Weights valid (sum = 100).
                </p>
              ) : null}
            </TabsContent>

            {/* Metadata */}
            <TabsContent value="metadata" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Discipline</Label>
                  <Input
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    placeholder="e.g. oral_medicine"
                  />
                </div>
                <div>
                  <Label className="text-xs">Time limit (minutes, optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={timeLimit ?? ''}
                    onChange={(e) =>
                      setTimeLimit(e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Pass threshold (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={passThreshold}
                    onChange={(e) => setPassThreshold(Number(e.target.value) || 60)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Capability slug is locked to <code>clinical_reasoning</code> (set at substrate
                level). Faculty cannot author cases against other capabilities from this UI.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0">{extraActions}</div>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-[#0b6d41] hover:bg-[#0b6d41]/90 shrink-0"
        >
          {saving ? 'Saving…' : saveLabel}
        </Button>
      </div>
    </div>
  );
}
