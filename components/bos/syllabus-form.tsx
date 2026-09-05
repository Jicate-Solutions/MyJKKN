'use client';

import React, { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import { useCreateBosSyllabus, useUpdateBosSyllabus, useBosSyllabus } from '@/hooks/bos/use-bos-syllabus';
import { useBosTaxonomy } from '@/hooks/bos/use-bos-taxonomy';
import { usePermissions } from '@/hooks/use-permissions';
import {
  BosCourseSyllabus,
  CreateBosSyllabusDto,
  UpdateBosSyllabusDto,
  BosBoardProgramme,
  BosCourseLearnOutcome,
  BosProgrammeOutcome,
  BosProgrammeSpecificOutcome,
  BosPOMappingsData,
  BosPoMapping,
  BosConceptApplicationsData,
  BosAssessmentPatternData,
  BosCapstoneProjectData,
  BosCapstoneRubricData,
  BosLlcConferenceData,
} from '@/types/bos';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { useBosInstitutionScope } from '@/hooks/bos/use-bos-institution-scope';
import { X, Trash2, BookOpen, Plus, FlaskConical, BookText, Check, Upload, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  SyllabusImportIssuesDialog,
  type ImportWarning,
  type ImportSummaryCounts,
} from '@/components/bos/syllabus-import-issues-dialog';
import {
  PharmacyScopeCard,
  PharmacyExamSchemeCard,
  PharmacyInternshipCard,
  AhsContentCard,
} from '@/components/bos/syllabus-pharmacy-tabs';
import {
  NursingWorkloadCard,
  NursingClinicalOutlineCard,
  NursingCompetencyMappingCard,
} from '@/components/bos/syllabus-nursing-tabs';
import {
  resolveAcademicModel,
  isPharmacyModel,
  isNursingModel,
  isBdsModel,
  modelHasOutcomes,
  modelUsesAhsContent,
} from '@/lib/services/bos/academic-model';
import { BdsContentCard } from '@/components/bos/bds-content-card';
import type { AcademicModel } from '@/types/bos';

interface Institution { id: string; name: string; institution_code: string; myjkkn_institution_ids: string[]; display_name?: string; }
interface Regulation { id: string; title: string; regulation_code: string; regulation_year?: string; }

const DEFAULT_K_VALUES: Record<string, string> = {
  K1: 'Remember',
  K2: 'Understand',
  K3: 'Apply',
  K4: 'Analyze',
  K5: 'Evaluate',
  K6: 'Create',
};

// v1.2 Assessment Structure (Total 100) — seeded for new syllabi. Editable.
const DEFAULT_ASSESSMENT_STRUCTURE = {
  components: [
    { sno: 1, component: 'Continuous Internal Assessment (CIA) — written tests, formative quizzes, attendance', marks: 15 },
    { sno: 2, component: 'Concept Application activities (Mode-mapped per v1.2 Spec) — 5 CAs, one per Unit', marks: 5 },
    { sno: 3, component: 'Principal-Agent Public Exhibition (choose ONE of FIVE Capstones)', marks: 10 },
    { sno: 4, component: 'External (End-Semester Examination)', marks: 70 },
  ],
  concept_applications_note: '',
  exhibition_note: '',
  capstones: [] as Array<{ title: string; subject?: string; artifacts?: string; give_back?: string }>,
};

// ── v3.5 Fink's formative + Capstone defaults — seeded for new syllabi. ──────
// Pattern / rubric / LLC text are the standard v3.5 boilerplate (editable);
// the course-specific blocks (concept applications, capstone options) start
// empty so faculty author them per course.
const DEFAULT_ASSESSMENT_PATTERN: BosAssessmentPatternData = {
  internal_marks: 30,
  external_marks: 70,
  components: [
    { sno: 1, component: 'CIA I, CIA II & Model Examination', marks: 15 },
    { sno: 2, component: 'Activities*', marks: 5 },
    { sno: 3, component: 'Capstone Project (see below)', marks: 10 },
  ],
  activities_note:
    '* Activities: Assignment / Case study / Field survey / PPT / Group discussion / Subject Viva / Report Writing / Mind map / Flow chart / Model making / Debate / Surprise test / Open book test.',
  note: "The Concept Applications are formative Fink's-shaped practice. The summative Fink's assessment is the Capstone Project (10 marks).",
};

const DEFAULT_CAPSTONE_RUBRIC: BosCapstoneRubricData = {
  total_marks: 10,
  note: '10 marks · common to all capstone options',
  criteria: [
    { sno: 1, criterion: 'Specificity of lived engagement (not generic; named places, named people, real measurements, real data)', marks: 2 },
    { sno: 2, criterion: 'Quality of disciplinary craft (course-appropriate technique — reasoning, measurement rigour, code, analysis — in service of the subject)', marks: 3 },
    { sno: 3, criterion: 'Honest self-reflection (pre-conceptions named, shift documented, courage in saying what is hard)', marks: 2 },
    { sno: 4, criterion: 'Continuing commitment OR ethical care (subject consent, give-back, named follow-through where applicable)', marks: 2 },
    { sno: 5, criterion: 'Authentic voice + LLC presentation (clarity, ownership, ability to answer questions; AI use declared if any — Humans are Principals, AI are Agents)', marks: 1 },
  ],
};

const DEFAULT_LLC_CONFERENCE: BosLlcConferenceData = {
  title: 'End-of-Course Learners Led Conference',
  subtitle: 'cohort audience · faculty + Senior Learner facilitate · no outside guest required',
  description:
    "In the final fortnight of the semester, the cohort convenes a Learners Led Conference — JKKN's established learner-run session format — in which every Learner presents their Capstone: a 5–7 minute talk showing what they made, measured, built, or found (the object, the data table, the hand-drawn graph, the running program, the quoted voice, the photograph of the named place) and answering two or three questions from peers and faculty. The Learner is the Principal of the session. Faculty and the Senior Learner facilitate and assess the presentation dimension of the Capstone rubric.",
};

interface SyllabusFormProps {
  syllabusId?: string;
  syllabus?: BosCourseSyllabus;
  isEditing?: boolean;
  /**
   * Source syllabus to duplicate. When set, the form opens in "Duplicate to
   * Regulation" mode: it pre-fills the content sections + institution /
   * composition / board / regulation from this source, blanks the course code
   * (so the user picks a NEW one — which auto-fills name / hours / credits from
   * the COE course master), and submits via the normal create path as a fresh
   * v1 row. `revised_from_syllabus_id` is stamped with the source id to record
   * provenance (mirrors the reference duplicate SQL).
   */
  duplicateFrom?: BosCourseSyllabus;
  /**
   * Compact clone mode (popup): render ONLY the Basic Info / Course Information
   * card — no tabs, no content editors. Submitting posts the Basic Info to the
   * server clone endpoint, which copies every content section from the source.
   * Only meaningful together with `duplicateFrom`.
   */
  compact?: boolean;
  /**
   * Set when rendering inside a Radix Dialog so the cascade's SearchableSelect
   * popovers portal into the dialog (otherwise their clicks die — see
   * SearchableSelect.modal).
   */
  modal?: boolean;
  onSuccess?: (syllabus: BosCourseSyllabus) => void;
}

/**
 * Build the initial form state for "Duplicate to Regulation". Copies every
 * content section verbatim from the source and defaults the identity fields to
 * the source's, but intentionally leaves the course code (and its derived
 * name / hours / credits) blank so the user must pick a new course — the SQL's
 * "insert with new course code" intent, done through the form's native
 * course-code dropdown.
 */
function buildDuplicateSeed(src: BosCourseSyllabus): Partial<BosCourseSyllabus> {
  return {
    institutions_id: src.institutions_id,
    composition_id: src.composition_id,
    board_id: src.board_id,
    regulation_id: src.regulation_id,
    // Course identity is intentionally blank — picking a new code repopulates
    // course_name / total_hours / contact_hours / course_credits from COE.
    course_code: '',
    course_name: '',
    course_id: undefined,
    total_hours: undefined,
    contact_hours: undefined,
    course_credits: undefined,
    stream: src.stream,
    notes: src.notes,
    // Content sections copied as-is from the source syllabus.
    course_objectives: src.course_objectives ?? { objectives: [] },
    course_learning_outcomes: src.course_learning_outcomes ?? { clos: [] },
    course_content: src.course_content ?? { units: [] },
    textbooks: src.textbooks ?? { primary: [], references: [] },
    web_resources: src.web_resources ?? { resources: [] },
    pedagogy: src.pedagogy ?? { methods: [] },
    po_mappings: src.po_mappings ?? { mappings: [] },
    assessment_structure: src.assessment_structure ?? undefined,
    concept_applications: src.concept_applications ?? undefined,
    assessment_pattern: src.assessment_pattern ?? undefined,
    capstone_project: src.capstone_project ?? undefined,
    capstone_rubric: src.capstone_rubric ?? undefined,
    llc_conference: src.llc_conference ?? undefined,
    // Provenance: which syllabus this copy was duplicated from.
    revised_from_syllabus_id: src.id,
  };
}

export function SyllabusForm({
  syllabusId,
  syllabus: syllabusProp,
  isEditing: isEditingProp = false,
  duplicateFrom,
  compact = false,
  modal = false,
  onSuccess,
}: SyllabusFormProps) {
  // Duplicate mode pre-fills like an edit but submits like a create. Identity
  // fields seeded from the source must survive the on-mount fetch effects
  // (which otherwise clear composition/meeting on the create path).
  const isDuplicate = !!duplicateFrom;
  const preserveSeededIdentity = isEditingProp || isDuplicate;
  // Compact clone popup: only the Basic Info card, submit hits the clone endpoint.
  const isCloneMode = compact && isDuplicate;
  const [cloning, setCloning] = useState(false);

  // If the caller already loaded the syllabus (edit page), skip the fetch.
  const { data: fetchedSyllabus } = useBosSyllabus(syllabusProp ? undefined : syllabusId);
  const existingSyllabus = syllabusProp ?? fetchedSyllabus;

  // Superseded-version detection: a syllabus that's been overtaken by a later
  // version has is_latest=false and isn't archived. Per the 2026-05-20 auto-fork
  // workflow (forkSyllabiOnMinutesApproval), once a meeting's minutes are
  // approved the referenced V1 rows flip to is_latest=false and a fresh V2 is
  // created. Opening V1 after that should be a read-only experience so users
  // can browse / download the historical snapshot but can't accidentally
  // modify it. Archived rows fall through to the existing soft-delete logic.
  const isSupersededVersion =
    !!existingSyllabus &&
    existingSyllabus.is_latest === false &&
    !existingSyllabus.is_archived;
  const createMutation = useCreateBosSyllabus();
  const { userProfile, isSuperAdmin } = usePermissions();
  const { data: institutionCtx } = useInstitutionContext();

  const [activeTab, setActiveTab] = useState('basic');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [boards, setBoards] = useState<{ id: string; board_name: string; board_code?: string }[]>([]);
  const [compositions, setCompositions] = useState<{
    id: string;
    composition_title: string;
    board_id: string;
    academic_year: string;
    institutions_id: string;
    board?: { board_name: string; board_code: string; board_type?: string | null } | null;
    // Multi-board: a composition may govern several boards; the syllabus picks one.
    boards?: { id: string; board_name: string; board_code: string }[];
    board_ids?: string[];
  }[]>([]);
  const [selectedCompositionId, setSelectedCompositionId] = useState('');
  const [meetings, setMeetings] = useState<{
    id: string;
    meeting_title: string;
    composition_id: string;
    board_id: string;
    institutions_id: string;
    bos_compositions: { composition_title: string; academic_year: string } | null;
  }[]>([]);
  const [courseCodeError, setCourseCodeError] = useState<string | null>(null);

  // ── Import-from-document state ─────────────────────────────────────────────
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importIssuesOpen, setImportIssuesOpen] = useState(false);
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>([]);
  const [importCounts, setImportCounts] = useState<ImportSummaryCounts>({});
  const importInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<BosCourseSyllabus>>(
    duplicateFrom
      ? buildDuplicateSeed(duplicateFrom)
      : existingSyllabus || {
          institutions_id: userProfile?.institution_id || '',
          board_id: '',
          regulation_id: '',
          course_objectives: { objectives: [] },
          course_learning_outcomes: { clos: [] },
          course_content: { units: [] },
          textbooks: { primary: [], references: [] },
          web_resources: { resources: [] },
          pedagogy: { methods: [] },
          po_mappings: { mappings: [] },
          assessment_structure: DEFAULT_ASSESSMENT_STRUCTURE,
          concept_applications: { intro_note: '', activities: [] },
          assessment_pattern: DEFAULT_ASSESSMENT_PATTERN,
          capstone_project: { intro_note: '', options: [] },
          capstone_rubric: DEFAULT_CAPSTONE_RUBRIC,
          llc_conference: DEFAULT_LLC_CONFERENCE,
        }
  );

  // Initialize with passed ID, or fall back to syllabusProp.id (edit page passes
  // syllabus but not syllabusId). Never seed from duplicateFrom — a duplicate
  // must submit as a NEW create, not update the source row.
  const [currentUpdateId, setCurrentUpdateId] = useState<string>(syllabusId || syllabusProp?.id || '');
  const updateMutation = useUpdateBosSyllabus(currentUpdateId);

  // Seed composition picker from the directly-passed source (edit prop or the
  // duplicate source) so the cascade starts on the right board/composition.
  useEffect(() => {
    const seedCompositionId = (syllabusProp ?? duplicateFrom)?.composition_id;
    if (seedCompositionId) setSelectedCompositionId(seedCompositionId);
  }, [syllabusProp?.composition_id, duplicateFrom]);

  // Board-aware: resolves the selected board's framework, falling back to the
  // regulation-wide taxonomy (board_id NULL) when the board has no override.
  const { data: taxonomy } = useBosTaxonomy(
    formData.regulation_id || '',
    formData.institutions_id || undefined,
    formData.board_id || undefined,
  );

  // v3.5 tab gating: the Assessment and Capstone & LLC tabs are Fink's-framework
  // sections. They only appear when the resolved board taxonomy is Fink's; on
  // Bloom's (or no taxonomy configured) the flow ends at PO Mappings, which
  // becomes the final-save tab.
  // TEMP (2026-07-22): both tabs hidden for ALL boards on request while the
  // v3.5 sections are not in use. Underlying data/columns are untouched —
  // flip HIDE_FINKS_TABS to false to restore them.
  const HIDE_FINKS_TABS = true;
  // JABT boards get the added-half tabs too: A1-A3 ARE Fink's dimensions, renamed.
  const isFinksBoard =
    !HIDE_FINKS_TABS &&
    (taxonomy?.taxonomy_type === 'finks' || taxonomy?.taxonomy_type === 'jkkn_advanced');

  // If the taxonomy resolves to non-Fink's while the user sits on a Fink's-only
  // tab (e.g. regulation/board changed mid-edit), bounce back to PO Mappings —
  // otherwise the hidden panel leaves a blank form body.
  useEffect(() => {
    if (!isFinksBoard && (activeTab === 'assessment' || activeTab === 'capstone')) {
      setActiveTab('mappings');
    }
  }, [isFinksBoard, activeTab]);

  // ── Academic model (COP pharmacy support) ─────────────────────────────
  // COP hosts BOTH B.Pharm (pci_pharm) and Pharm.D (mgr_pharmd) as separate
  // BoS boards, so the model is resolved from the SELECTED BOARD (name/code),
  // not the institution_code. Computed live from the board; injected into the
  // save payload (never stored in formData so a board change re-resolves).
  // While the board list is still loading on an edit, trust the persisted
  // academic_model so pharmacy tabs don't flicker to the Anna set.
  const selectedBoardMeta = useMemo(
    () => boards.find((b) => b.id === formData.board_id),
    [boards, formData.board_id],
  );
  const institutionCode = useMemo(
    () => institutions.find((i) => i.id === formData.institutions_id)?.institution_code,
    [institutions, formData.institutions_id],
  );
  const academicModel: AcademicModel = useMemo(() => {
    if (!selectedBoardMeta && existingSyllabus?.academic_model) {
      return existingSyllabus.academic_model;
    }
    return resolveAcademicModel({
      institutionCode,
      boardId: formData.board_id,
      boardName: selectedBoardMeta?.board_name,
      boardCode: selectedBoardMeta?.board_code,
    });
  }, [selectedBoardMeta, existingSyllabus?.academic_model, institutionCode, formData.board_id]);

  const isPharmacy = isPharmacyModel(academicModel);
  const isBPharm = academicModel === 'pci_pharm';
  const isPharmD = academicModel === 'mgr_pharmd';
  // AHS (Dr. MGR Allied Health Sciences): year/paper, no CO-PO/Bloom. Shares the
  // Pharm.D content/exam/internship shape (ahs_content / exam_scheme /
  // internship_postings) via modelUsesAhsContent — so the same editors render.
  const isAhs = academicModel === 'mgr_ahs';
  const isAhsShaped = modelUsesAhsContent(academicModel); // mgr_ahs || mgr_pharmd
  // Nursing (INC B.Sc Nursing): competency-based, no CO-PO/PSO/Bloom. Keeps a
  // "Competencies" tab (the CLO editor, relabelled) but replaces PO Mappings +
  // Pedagogy + Objectives with Clinical Outline + Competency Mapping.
  const isNursing = isNursingModel(academicModel);
  // Dental (BDS / DCI): year-based competency model. Content lives in bds_content
  // (goal/objectives/competencies/MUST-DESIRABLE-NICE grid) + exam_scheme, NOT the
  // Anna course_content/units — so the Content tab renders a dedicated read-only
  // BdsContentCard and the Anna Objectives/CLO/Pedagogy/PO tabs are hidden.
  const isBds = isBdsModel(academicModel);
  // Pharmacy models carry no CO/PO/PSO/Bloom — hide those tabs entirely.
  const showOutcomeTabs = modelHasOutcomes(academicModel);

  // If the user is parked on an outcome tab when the model resolves to a
  // pharmacy model (board changed mid-edit), bounce to a visible tab so the
  // body isn't blank.
  useEffect(() => {
    if ((isPharmacy || isAhs) && ['clo', 'pedagogy', 'mappings'].includes(activeTab)) {
      setActiveTab('content');
    }
  }, [isPharmacy, isAhs, activeTab]);

  // Nursing hides objectives/pedagogy/mappings; bounce off them if parked there.
  useEffect(() => {
    if (isNursing && ['objectives', 'pedagogy', 'mappings'].includes(activeTab)) {
      setActiveTab('content');
    }
  }, [isNursing, activeTab]);

  // BDS hides objectives/clo/pedagogy/mappings (all captured in bds_content);
  // bounce off them to the single Content tab if parked there.
  useEffect(() => {
    if (isBds && ['objectives', 'clo', 'pedagogy', 'mappings'].includes(activeTab)) {
      setActiveTab('content');
    }
  }, [isBds, activeTab]);

  // CO ids for the competency-mapping tab (from the Competencies/CLO list).
  const nursingCoIds = useMemo(() => {
    const clos = (formData.course_learning_outcomes as { clos?: { clo_number: number }[] } | undefined)?.clos ?? [];
    return clos.map((c) => `CO${c.clo_number}`);
  }, [formData.course_learning_outcomes]);

  // Update mutation's ID when we get one from creation
  const currentSyllabusId = syllabusId || formData.id;

  const isEditing = isEditingProp || !!currentSyllabusId;
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const regulation_code = useMemo(
    () => regulations.find((r) => r.id === formData.regulation_id)?.regulation_code ?? '',
    [regulations, formData.regulation_id],
  );

  const effectiveKValues = useMemo(
    () => (taxonomy && Object.keys(taxonomy.k_values).length > 0) ? taxonomy.k_values : DEFAULT_K_VALUES,
    [taxonomy],
  );

  // Scope the course list to the SELECTED composition's board (institution +
  // regulation), not the creator's own board memberships — otherwise a user on
  // a different board sees that board's courses (e.g. 24PCAC) and the picked
  // board's courses (e.g. 24UCSC) are dropped. composition_id drives the
  // institution-scoped, board-specific fetch in /api/bos/courses-master.
  const { data: coursesData, isLoading: coursesLoading } = useBosCourses(
    formData.institutions_id && regulation_code && formData.composition_id
      ? {
          institution_id: formData.institutions_id,
          regulation_code,
          composition_id: formData.composition_id,
          // Multi-board: scope to the specifically chosen board (defaults to the
          // composition's primary when single-board).
          board_id: formData.board_id || undefined,
          limit: 200,
          is_active: 'true',
        }
      : undefined,
  );
  const courseOptions = coursesData?.data ?? [];

  // Course category (Theory / Practical / Project / Theory + Practical / …) of
  // the currently-selected course. Drives which Content-Type tabs are enabled in
  // the Content tab. Resolved by matching the saved/selected course_code against
  // the (institution + regulation + board)-scoped course list. When the course
  // isn't in the list (synthetic-option fallback on edit) this is undefined and
  // ContentEditor leaves all tabs enabled rather than blocking the user.
  const selectedCourseCategory = (courseOptions.find(
    (c) => c.course_code === formData.course_code,
  ) as any)?.course_category as string | undefined;

  // Read sessionStorage handoff from the list page Import button — runs once
  // on mount, consume-and-delete so a refresh doesn't replay the data.
  useEffect(() => {
    if (isEditingProp || syllabusProp || duplicateFrom) return;
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem('bos.syllabus.import.handoff');
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        data: any;
        summary: Record<string, number>;
        warnings?: ImportWarning[];
      };
      sessionStorage.removeItem('bos.syllabus.import.handoff');
      if (payload.warnings && payload.warnings.length > 0) {
        setImportWarnings(payload.warnings);
        setImportCounts(payload.summary as ImportSummaryCounts);
        setImportIssuesOpen(true);
      }
      setFormData((prev) => ({
        ...prev,
        course_objectives: payload.data.course_objectives ?? prev.course_objectives,
        course_learning_outcomes:
          payload.data.course_learning_outcomes ?? prev.course_learning_outcomes,
        course_content: payload.data.course_content ?? prev.course_content,
        textbooks: payload.data.textbooks ?? prev.textbooks,
        web_resources: payload.data.web_resources ?? prev.web_resources,
        pedagogy: payload.data.pedagogy ?? prev.pedagogy,
        po_mappings: payload.data.po_mappings ?? prev.po_mappings,
      }));
      const s = payload.summary ?? {};
      const parts: string[] = [];
      if (s.objectives) parts.push(`${s.objectives} objectives`);
      if (s.clos) parts.push(`${s.clos} COs`);
      if (s.units) parts.push(`${s.units} units`);
      if (s.practical_topics) parts.push(`${s.practical_topics} practical topics`);
      if (s.textbooks) parts.push(`${s.textbooks} textbooks`);
      if (s.references) parts.push(`${s.references} references`);
      if (s.web_resources) parts.push(`${s.web_resources} web resources`);
      if (s.pedagogy) parts.push(`${s.pedagogy} pedagogy methods`);
      if (s.po_mapping_rows) parts.push(`PO mapping (${s.po_mapping_rows} rows)`);
      if (parts.length > 0) {
        setImportSummary(`Imported: ${parts.join(', ')}. Fill Basic Info and Save.`);
      }
    } catch {
      sessionStorage.removeItem('bos.syllabus.import.handoff');
    }
  }, [isEditingProp, syllabusProp]);

  // Per-form import handler used by the upload card on the Basic Info tab.
  // Non-destructive merge — only fills sections that are currently empty.
  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);
    setImportSummary(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/bos/syllabus/extract', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to extract syllabus');

      const { data, summary, warnings } = json as {
        data: any;
        summary: Record<string, number>;
        warnings?: ImportWarning[];
      };

      if (warnings && warnings.length > 0) {
        setImportWarnings(warnings);
        setImportCounts(summary as ImportSummaryCounts);
        setImportIssuesOpen(true);
      }

      setFormData((prev) => {
        const isEmpty = (val: any, listKey: string) =>
          !val || !Array.isArray(val[listKey]) || val[listKey].length === 0;
        return {
          ...prev,
          course_objectives:
            isEmpty(prev.course_objectives, 'objectives')
              ? data.course_objectives
              : prev.course_objectives,
          course_learning_outcomes:
            isEmpty(prev.course_learning_outcomes, 'clos')
              ? data.course_learning_outcomes
              : prev.course_learning_outcomes,
          course_content:
            isEmpty(prev.course_content, 'units') && isEmpty(prev.course_content, 'topics')
              ? data.course_content
              : prev.course_content,
          textbooks:
            isEmpty(prev.textbooks, 'primary') && isEmpty(prev.textbooks, 'references')
              ? data.textbooks
              : prev.textbooks,
          web_resources:
            isEmpty(prev.web_resources, 'resources')
              ? data.web_resources
              : prev.web_resources,
          pedagogy:
            isEmpty(prev.pedagogy, 'methods')
              ? data.pedagogy
              : prev.pedagogy,
          po_mappings:
            isEmpty(prev.po_mappings, 'mappings')
              ? data.po_mappings
              : prev.po_mappings,
        };
      });

      const parts: string[] = [];
      if (summary.objectives) parts.push(`${summary.objectives} objectives`);
      if (summary.clos) parts.push(`${summary.clos} COs`);
      if (summary.units) parts.push(`${summary.units} units`);
      if (summary.practical_topics) parts.push(`${summary.practical_topics} practical topics`);
      if (summary.textbooks) parts.push(`${summary.textbooks} textbooks`);
      if (summary.references) parts.push(`${summary.references} references`);
      if (summary.web_resources) parts.push(`${summary.web_resources} web resources`);
      if (summary.pedagogy) parts.push(`${summary.pedagogy} pedagogy methods`);
      if (summary.po_mapping_rows) parts.push(`PO mapping (${summary.po_mapping_rows} rows)`);

      setImportSummary(
        parts.length > 0
          ? `Imported: ${parts.join(', ')}`
          : 'No recognisable sections were found in the document.',
      );
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import syllabus');
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleSaveAndNext = async (nextTab: string) => {
    try {
      // Validate required fields before submission
      if (!formData.course_code || !formData.course_name || !formData.institutions_id) {
        console.error('Missing required fields:', {
          course_code: formData.course_code,
          course_name: formData.course_name,
          institutions_id: formData.institutions_id
        });
        return;
      }

      if (isEditing && currentSyllabusId) {
        await updateMutation.mutateAsync(formData as UpdateBosSyllabusDto);
      } else {
        const result = await createMutation.mutateAsync(formData as CreateBosSyllabusDto);
        // Update form with returned data (including ID from server)
        setFormData((prev) => ({ ...prev, id: result.id }));
        setCurrentUpdateId(result.id);
      }
      setActiveTab(nextTab);
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error((error as Error).message || 'Failed to save syllabus');
    }
  };

  // Populate form when the syllabus loads via hook (edit-by-id path). Never on
  // the duplicate path — that seeds from duplicateFrom and must stay a create.
  useEffect(() => {
    if (fetchedSyllabus && !syllabusProp && !duplicateFrom) {
      setFormData(fetchedSyllabus);
      setCurrentUpdateId(fetchedSyllabus.id);
      if (fetchedSyllabus.composition_id) setSelectedCompositionId(fetchedSyllabus.composition_id);
    }
  }, [fetchedSyllabus, syllabusProp, duplicateFrom]);

  // Auto-seed institution for regular users on new-form path. Duplicate mode
  // already seeds the source's institution, so skip it there too.
  useEffect(() => {
    if (isSuperAdmin || isEditingProp || syllabusProp || isDuplicate || !institutionCtx) return;
    setFormData((prev) => ({
      ...prev,
      institutions_id: prev.institutions_id || institutionCtx.myjkkn_id,
    }));
  }, [isSuperAdmin, isEditingProp, syllabusProp, institutionCtx]);

  // Super-admin edit path: the syllabus may store any CAS sibling UUID, but the
  // Institution dropdown's option values are `inst.id` (the FIRST sibling UUID
  // returned by /api/bos/institutions). SearchableSelect matches strictly by
  // ===, so a stored Self-Financed UUID against an Aided-keyed option shows
  // the placeholder. Normalise to the option's `inst.id` once the list loads.
  useEffect(() => {
    if (!isSuperAdmin) return;
    if (!formData.institutions_id) return;
    if (institutions.length === 0) return;
    if (institutions.some((i) => i.id === formData.institutions_id)) return;
    const match = institutions.find((i) =>
      i.myjkkn_institution_ids?.includes(formData.institutions_id ?? '')
    );
    if (match && match.id !== formData.institutions_id) {
      setFormData((prev) => ({ ...prev, institutions_id: match.id }));
    }
  }, [isSuperAdmin, institutions, formData.institutions_id]);

  // Fetch institutions
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const res = await fetch('/api/bos/institutions');
        if (res.ok) {
          const data = await res.json();
          setInstitutions(data || []);
        }
      } catch (err) {
        console.error('Failed to fetch institutions:', err);
      }
    };

    if (isSuperAdmin) {
      fetchInstitutions();
    }
  }, [isSuperAdmin]);

  // Edit path: the syllabus may reference an institution that the COE-driven
  // /api/bos/institutions list omits (e.g. an engineering college whose MyJKKN
  // UUID isn't mapped into any COE institution's myjkkn_institution_ids). Without
  // a matching option the Institution SearchableSelect shows only its
  // placeholder — even though formData.institutions_id is set — which reads as
  // "institution missing". Resolve the name from the MyJKKN institutions table
  // and inject a display-only option so the record's institution shows and is
  // retained on save. The server still authorises the write via guardSyllabusEdit.
  useEffect(() => {
    if (!isEditingProp && !syllabusProp) return;
    const instId = formData.institutions_id;
    if (!instId) return;
    if (institutions.some((i) => i.id === instId || i.myjkkn_institution_ids?.includes(instId))) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/institutions');
        if (!res.ok) return;
        const json = await res.json();
        const rows = (json?.data ?? []) as Array<{ id: string; name: string; display_name?: string }>;
        const match = rows.find((r) => r.id === instId);
        if (cancelled || !match) return;
        setInstitutions((prev) =>
          prev.some((i) => i.id === instId)
            ? prev
            : [
                ...prev,
                {
                  id: instId,
                  name: match.display_name || match.name,
                  // Left blank so the composition fetch keeps using the
                  // institutionsId fallback (unchanged from the no-option case).
                  institution_code: '',
                  myjkkn_institution_ids: [instId],
                },
              ],
        );
      } catch {
        /* non-fatal — dropdown simply stays on its placeholder */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditingProp, syllabusProp, institutions, formData.institutions_id]);

  // Fetch boards
  useEffect(() => {
    const fetchBoards = async () => {
      try {
        const res = await fetch('/api/bos/boards');
        if (res.ok) {
          const { data } = await res.json();
          setBoards(data || []);
        }
      } catch (err) {
        console.error('Failed to fetch boards:', err);
      }
    };

    fetchBoards();
  }, []);

  // Step 1: fetch compositions for the selected institution.
  // Filter by institution_code (= counselling_code), the authoritative single
  // identifier for one real-world institution. The server resolves the matching
  // MyJKKN sibling UUIDs (CAS Aided + Self) so neither variant's compositions
  // are dropped — the client doesn't need to know about the split.
  useEffect(() => {
    const fetchCompositions = async () => {
      try {
        const url = new URL('/api/bos/compositions', window.location.origin);
        if (isSuperAdmin) {
          // Match by myjkkn_institution_ids.includes(), not i.id ===, because
          // formData.institutions_id may be ANY of a CAS pair while i.id is only
          // the first UUID in the list.
          const instOption = institutions.find((i) =>
            i.myjkkn_institution_ids?.includes(formData.institutions_id ?? '')
          );
          if (instOption?.institution_code) {
            url.searchParams.set('institutionCode', instOption.institution_code);
          } else if (formData.institutions_id) {
            url.searchParams.set('institutionsId', formData.institutions_id);
          }
        } else if (institutionCtx?.institution_code) {
          // Non-admin: pass the resolved code so the server can hydrate sibling
          // UUIDs from the COE MDM (Aided + Self for CAS) without client juggling.
          url.searchParams.set('institutionCode', institutionCtx.institution_code);
        }
        // In edit/duplicate mode fetch all compositions (including inactive) so
        // the seeded one is always visible in the dropdown regardless of status.
        if (!preserveSeededIdentity) {
          url.searchParams.set('isActive', 'true');
        }
        url.searchParams.set('limit', '100');
        const res = await fetch(url.toString());
        if (res.ok) {
          const { data } = await res.json();
          setCompositions(data || []);
        }
      } catch (err) {
        console.error('Failed to fetch compositions:', err);
      }
    };

    if (formData.institutions_id) {
      // Non-admin: wait for institutionCtx before fetching so CAS sibling IDs are
      // available. Avoids a wasted first fetch that returns incomplete results.
      if (!isSuperAdmin && institutionCtx === undefined) return;
      fetchCompositions();
    }
    // In edit/duplicate mode the composition is pre-seeded from the source — don't clear it.
    if (!preserveSeededIdentity) {
      setSelectedCompositionId('');
      setMeetings([]);
    }
  // institutionCtx is async — it may resolve after institutions_id is already set,
  // so both must be deps to trigger the single fetch once ctx is ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.institutions_id, institutionCtx]);

  // Edit-mode safety net: the /api/bos/compositions list paginates at limit=100
  // sorted by term_start_date desc, so an older composition the syllabus is
  // linked to can drop out of the page and the dropdown shows the placeholder
  // even though every other field is fine. Fetch the linked composition by ID
  // and merge it in so the dropdown can always render the saved value.
  useEffect(() => {
    if (!preserveSeededIdentity) return;
    const linkedId = (existingSyllabus ?? duplicateFrom)?.composition_id;
    if (!linkedId) return;
    if (compositions.some((c) => c.id === linkedId)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bos/compositions/${linkedId}`);
        if (!res.ok) return;
        const comp = await res.json();
        if (cancelled || !comp?.id) return;
        setCompositions((prev) =>
          prev.some((c) => c.id === comp.id)
            ? prev
            : [
                {
                  id: comp.id,
                  composition_title: comp.composition_title,
                  board_id: comp.board_id,
                  academic_year: comp.academic_year,
                  institutions_id: comp.institutions_id,
                  board: comp.board ?? null,
                },
                ...prev,
              ],
        );
      } catch (err) {
        console.error('Failed to fetch linked composition:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preserveSeededIdentity, existingSyllabus?.composition_id, duplicateFrom, compositions]);

  // Step 2: fetch meetings for the selected composition.
  // Filtering by compositionId avoids CAS institution-UUID mismatch entirely.
  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        const url = new URL('/api/bos/meetings', window.location.origin);
        url.searchParams.set('compositionId', selectedCompositionId);
        url.searchParams.set('limit', '100');
        url.searchParams.set('sortBy', 'scheduled_date');
        url.searchParams.set('sortOrder', 'desc');
        const res = await fetch(url.toString());
        if (res.ok) {
          const { data } = await res.json();
          setMeetings(data || []);
        }
      } catch (err) {
        console.error('Failed to fetch meetings:', err);
      }
    };

    if (selectedCompositionId) {
      fetchMeetings();
    } else {
      setMeetings([]);
    }
  }, [selectedCompositionId]);

  // Resolve board_id from the loaded compositions list if it isn't set.
  // Handles syllabi saved before board_id was persisted, or the edit path where
  // board_id wasn't stored on the record.
  useEffect(() => {
    if (formData.board_id || !formData.composition_id || compositions.length === 0) return;
    const comp = compositions.find(c => c.id === formData.composition_id);
    if (comp?.board_id) {
      setFormData(prev => ({ ...prev, board_id: comp.board_id }));
    }
  }, [formData.board_id, formData.composition_id, compositions]);

  // Fetch regulations filtered by institution.
  // For CAS (Aided + Self share a counselling_code), pass BOTH sibling UUIDs so
  // regulations created against either institution variant are included.
  // The /api/bos/regulations route deduplicates by regulation_code.
  useEffect(() => {
    const fetchRegulations = async () => {
      try {
        const url = new URL('/api/bos/regulations', window.location.origin);
        if (isSuperAdmin) {
          const instOption = institutions.find((i) =>
            i.myjkkn_institution_ids?.includes(formData.institutions_id ?? '')
          );
          const ids = instOption?.myjkkn_institution_ids ?? (formData.institutions_id ? [formData.institutions_id] : []);
          if (ids.length > 1) url.searchParams.set('institutionIds', ids.join(','));
          else if (ids.length === 1) url.searchParams.set('institutionId', ids[0]);
        } else if (institutionCtx?.myjkkn_institution_ids && institutionCtx.myjkkn_institution_ids.length > 0) {
          if (institutionCtx.myjkkn_institution_ids.length > 1) {
            url.searchParams.set('institutionIds', institutionCtx.myjkkn_institution_ids.join(','));
          } else {
            url.searchParams.set('institutionId', institutionCtx.myjkkn_institution_ids[0]);
          }
        } else if (formData.institutions_id) {
          url.searchParams.set('institutionId', formData.institutions_id);
        }
        // On edit/duplicate, ensure the dedup-by-code in /api/bos/regulations
        // keeps the exact row the source syllabus references (CAS Aided+Self
        // share codes, otherwise the dropdown shows the placeholder). Use the
        // source value so this stays stable across user edits.
        const preferRegulationId = (existingSyllabus ?? duplicateFrom)?.regulation_id;
        if (preserveSeededIdentity && preferRegulationId) {
          url.searchParams.set('preferId', preferRegulationId);
        }
        const res = await fetch(url.toString());
        if (res.ok) {
          const { data } = await res.json();
          setRegulations(data || []);
        } else {
          console.warn('Regulations endpoint not available');
        }
      } catch (err) {
        console.warn('Failed to fetch regulations:', err);
      }
    };

    if (formData.institutions_id) {
      if (!isSuperAdmin && institutionCtx === undefined) return;
      fetchRegulations();
    }
  }, [formData.institutions_id, institutions, institutionCtx, isSuperAdmin]);

  // Auto-derive regulation_id from the selected composition's academic_year.
  // The composition record doesn't store regulation_id directly, but its
  // academic_year (e.g. "2024-2027" or "2024-25") naturally aligns with the
  // regulation's regulation_year. Match the start year as the common case.
  //
  // Only fills an EMPTY regulation_id — never overrides a manual selection.
  // (The composition onChange below explicitly clears regulation_id on change,
  //  letting this effect re-fire to derive the new default.)
  useEffect(() => {
    if (formData.regulation_id) return;
    if (!formData.composition_id) return;
    if (regulations.length === 0) return;
    const comp = compositions.find((c) => c.id === formData.composition_id);
    if (!comp?.academic_year) return;
    const startYear = comp.academic_year.split('-')[0];
    const matched = regulations.find(
      (r) =>
        r.regulation_year === comp.academic_year ||
        r.regulation_year === startYear ||
        r.regulation_year?.startsWith(startYear),
    );
    if (matched) {
      setFormData((prev) => ({ ...prev, regulation_id: matched.id }));
    }
  }, [formData.composition_id, formData.regulation_id, compositions, regulations]);


  // Clone popup submit: send ONLY Basic Info to the clone endpoint, which copies
  // every content section from the source server-side.
  const handleCloneSubmit = async () => {
    if (!duplicateFrom) return;
    setCloning(true);
    try {
      const payload = {
        institutions_id: formData.institutions_id,
        board_id: formData.board_id || null,
        regulation_id: formData.regulation_id,
        composition_id: formData.composition_id || null,
        course_id: formData.course_id || null,
        course_code: formData.course_code,
        course_name: formData.course_name,
        course_credits: formData.course_credits,
        total_hours: formData.total_hours,
        contact_hours: formData.contact_hours,
        stream: formData.stream || null,
        notes: formData.notes || null,
      };
      const res = await fetch(`/api/bos/syllabus/${duplicateFrom.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to clone syllabus');
      toast.success(`Cloned to ${formData.course_code}`);
      onSuccess?.(json as BosCourseSyllabus);
    } catch (error) {
      console.error('Failed to clone syllabus:', error);
      toast.error((error as Error).message || 'Failed to clone syllabus');
    } finally {
      setCloning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isCloneMode) {
      await handleCloneSubmit();
      return;
    }

    try {
      // Inject the resolved academic model so pharmacy/AHS rows persist their
      // discriminator (it's computed from the board, not stored in formData, so
      // a board change always re-resolves). Anna rows get 'anna_univ' — a no-op
      // vs the DB default.
      const payload = { ...formData, academic_model: academicModel };
      if (isEditing && currentSyllabusId) {
        const result = await updateMutation.mutateAsync(payload as UpdateBosSyllabusDto);
        onSuccess?.(result);
      } else {
        const result = await createMutation.mutateAsync(payload as CreateBosSyllabusDto);
        onSuccess?.(result);
      }
    } catch (error) {
      console.error('Failed to save syllabus:', error);
      toast.error((error as Error).message || 'Failed to save syllabus');
    }
  };

  const updateField = (path: string, value: unknown) => {
    const keys = path.split('.');
    setFormData((prev) => {
      const updated = { ...prev };
      let current: any = updated;
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return updated;
    });
  };

  // Validate course code uniqueness per institution and regulation
  const validateCourseCode = async (code: string) => {
    if (!code || !formData.institutions_id || !formData.regulation_id) {
      setCourseCodeError(null);
      return true;
    }

    try {
      const res = await fetch(
        `/api/bos/syllabus?courseCode=${encodeURIComponent(code)}&institutionsId=${formData.institutions_id}&regulationId=${formData.regulation_id}&limit=1`
      );
      if (res.ok) {
        const { data } = await res.json();
        if (data && data.length > 0 && data[0].id !== currentSyllabusId) {
          setCourseCodeError(`Course code "${code}" already exists in this institution and regulation`);
          return false;
        }
        setCourseCodeError(null);
        return true;
      }
    } catch (err) {
      console.error('Failed to validate course code:', err);
    }
    return true;
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Superseded-version banner.
          Shown when the loaded syllabus is no longer the latest version (a
          newer V2+ exists). The form below is wrapped in <fieldset disabled>
          which cascades to all native inputs/buttons — so users can browse
          every tab and field but can't submit. Download/PDF/DOCX from the
          parent list page still work for archival reference. */}
      {isSupersededVersion && existingSyllabus && (
        <Alert className='mb-4 border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-600'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>
            <span className='font-semibold'>
              Superseded by Version {(existingSyllabus.version_number ?? 1) + 1}
              {' '}— this syllabus is read-only.
            </span>
            <br />
            <span className='text-xs'>
              This is Version {existingSyllabus.version_number ?? 1} of{' '}
              <span className='font-mono'>{existingSyllabus.course_code}</span>.
              The current active version was created when meeting minutes were
              approved. Use Syllabus History (from the syllabus list) to open
              the latest version for editing.
            </span>
          </AlertDescription>
        </Alert>
      )}
      <fieldset disabled={isSupersededVersion} className='contents'>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Clone popup shows only Basic Info — hide the tab chrome entirely. */}
        {!compact && (
          <TabsList
            className={`grid w-full ${
              isBds ? 'grid-cols-2' : isNursing ? 'grid-cols-6' : (isPharmacy || isAhs) ? 'grid-cols-6' : isFinksBoard ? 'grid-cols-9' : 'grid-cols-7'
            }`}
          >
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            {/* B.Pharm carries a "Scope" paragraph before Objectives. */}
            {isBPharm && <TabsTrigger value="scope">Scope</TabsTrigger>}
            {/* Nursing folds the DESCRIPTION into Basic Info; BDS folds objectives
                into the bds_content card — no separate Objectives tab. */}
            {!isNursing && !isBds && <TabsTrigger value="objectives">Objectives</TabsTrigger>}
            {/* Outcome tabs (CO/PO/PSO, Pedagogy) — Anna models only; pharmacy has none.
                Nursing keeps the CLO editor, relabelled "Competencies". */}
            {(showOutcomeTabs || isNursing) && (
              <TabsTrigger value="clo">{isNursing ? 'Competencies' : 'Course Outcomes'}</TabsTrigger>
            )}
            <TabsTrigger value="content">{isPharmD ? 'Lecture Topics' : isBds ? 'Syllabus' : 'Content'}</TabsTrigger>
            {/* Nursing clinical outline + skill-lab practicum. */}
            {isNursing && <TabsTrigger value="clinical">Clinical</TabsTrigger>}
            {/* BDS folds textbooks into the syllabus card — no separate Resources tab. */}
            {!isBds && <TabsTrigger value="resources">Resources</TabsTrigger>}
            {showOutcomeTabs && <TabsTrigger value="pedagogy">Pedagogy</TabsTrigger>}
            {showOutcomeTabs && <TabsTrigger value="mappings">PO Mappings</TabsTrigger>}
            {/* Nursing maps outcomes to the 10 INC core competencies (no PO/PSO). */}
            {isNursing && <TabsTrigger value="competency">Competency Map</TabsTrigger>}
            {/* Pharmacy / AHS exam scheme (PCI / Dr. MGR) replaces the outcome mapping. */}
            {(isPharmacy || isAhs) && <TabsTrigger value="exam">Exam Scheme</TabsTrigger>}
            {/* Pharm.D 6th-year / AHS internship postings. */}
            {(isPharmD || isAhs) && <TabsTrigger value="internship">Internship</TabsTrigger>}
            {/* Fink's-only tabs — Bloom's boards end the flow at PO Mappings */}
            {isFinksBoard && (
              <>
                <TabsTrigger value="assessment">Assessment</TabsTrigger>
                <TabsTrigger value="capstone">Capstone &amp; LLC</TabsTrigger>
              </>
            )}
          </TabsList>
        )}

        {/* ── Pharmacy (COP) tabs — pci_pharm (B.Pharm) / mgr_pharmd (Pharm.D) ── */}
        {isBPharm && (
          <TabsContent value="scope" className="space-y-4">
            <PharmacyScopeCard
              value={formData.scope}
              onChange={(v) => updateField('scope', v)}
            />
          </TabsContent>
        )}
        {(isPharmacy || isAhs) && (
          <TabsContent value="exam" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Program placement</CardTitle>
                <CardDescription>
                  {isBPharm
                    ? 'Which semester this course belongs to (B.Pharm 1–8).'
                    : isAhs
                      ? 'Which academic year this paper belongs to (AHS 1–3).'
                      : 'Which academic year this subject belongs to (Pharm.D 1–5).'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {isBPharm && (
                  <div>
                    <label className="text-xs text-muted-foreground">Semester (1–8)</label>
                    <Input
                      inputMode="numeric"
                      value={formData.semester ?? ''}
                      onChange={(e) =>
                        updateField('semester', e.target.value === '' ? undefined : Number(e.target.value))
                      }
                    />
                  </div>
                )}
                {(isPharmD || isAhs) && (
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {isAhs ? 'Academic year (1–3)' : 'Academic year (1–5)'}
                    </label>
                    <Input
                      inputMode="numeric"
                      value={formData.academic_year ?? ''}
                      onChange={(e) =>
                        updateField('academic_year', e.target.value === '' ? undefined : Number(e.target.value))
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>
            <PharmacyExamSchemeCard
              value={formData.exam_scheme}
              onChange={(v) => updateField('exam_scheme', v)}
              showQuestionPattern={isBPharm || isAhs}
            />
          </TabsContent>
        )}
        {(isPharmD || isAhs) && (
          <TabsContent value="internship" className="space-y-4">
            <PharmacyInternshipCard
              value={formData.internship_postings}
              onChange={(v) => updateField('internship_postings', v)}
            />
          </TabsContent>
        )}

        {/* ── Nursing (CNR / INC B.Sc Nursing) tabs ── */}
        {isNursing && (
          <TabsContent value="clinical" className="space-y-4">
            <NursingClinicalOutlineCard
              value={formData.clinical_outline}
              onChange={(v) => updateField('clinical_outline', v)}
            />
          </TabsContent>
        )}
        {isNursing && (
          <TabsContent value="competency" className="space-y-4">
            <NursingCompetencyMappingCard
              value={formData.competency_mappings}
              onChange={(v) => updateField('competency_mappings', v)}
              coIds={nursingCoIds}
            />
          </TabsContent>
        )}

        {/* Basic Information */}
        <TabsContent value="basic" className="space-y-4">
          {/* ── Import from Document — fresh-create flow only; hidden on edit
               and on duplicate (the content is already seeded from the source) ── */}
          {!isEditing && !isDuplicate && (
            <Card className="border-dashed border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Import from Document
                </CardTitle>
                <CardDescription>
                  Upload a syllabus PDF, Word, or Excel file to auto-fill Objectives,
                  COs, Content, Resources, Pedagogy, and PO Mappings. Basic Info
                  fields stay manual. Existing entries are preserved (non-destructive).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".pdf,.docx,.xlsx,.xls"
                    onChange={handleImportFile}
                    disabled={isImporting}
                    className="hidden"
                    id="syllabus-import-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => importInputRef.current?.click()}
                    disabled={isImporting}
                    className="gap-2"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        Choose file (.pdf / .docx / .xlsx)
                      </>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">Max 10 MB</span>
                </div>

                {importSummary && (
                  <Alert className="border-green-300 bg-green-50 dark:bg-green-950/30">
                    <AlertDescription className="text-sm text-green-800 dark:text-green-200 flex items-start justify-between gap-2">
                      <span>{importSummary}</span>
                      <button
                        type="button"
                        onClick={() => setImportSummary(null)}
                        className="text-green-700 hover:text-green-900 shrink-0"
                        aria-label="Dismiss"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </AlertDescription>
                  </Alert>
                )}

                {importError && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-sm flex items-start justify-between gap-2">
                      <span>{importError}</span>
                      <button
                        type="button"
                        onClick={() => setImportError(null)}
                        className="shrink-0 hover:opacity-80"
                        aria-label="Dismiss"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Course Information</CardTitle>
              <CardDescription>Basic details about the course</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Institution (super-admin only) */}
              {isSuperAdmin && (
                <div>
                  <label className="block text-sm font-medium mb-1">Institution *</label>
                  <SearchableSelect
                    value={formData.institutions_id || ''}
                    onValueChange={(val) => {
                      updateField('institutions_id', val);
                      updateField('composition_id', '');
                      updateField('board_id', '');
                      updateField('regulation_id', '');
                    }}
                    options={institutions.map((inst) => ({ value: inst.id, label: inst.name }))}
                    placeholder='Select institution'
                    searchPlaceholder='Search institution…'
                    modal={modal}
                    className='w-full'
                  />
                </div>
              )}

              {/* Row 2: Composition + Meeting */}
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className="block text-sm font-medium mb-1">Composition *</label>
                  <SearchableSelect
                    value={selectedCompositionId}
                    onValueChange={(val) => {
                      setSelectedCompositionId(val);
                      updateField('composition_id', val);
                      updateField('board_id', compositions.find(c => c.id === val)?.board_id || '');
                      updateField('regulation_id', '');
                    }}
                    options={compositions.map((c) => ({
                      value: c.id,
                      label: c.composition_title,
                    }))}
                    placeholder={formData.institutions_id ? 'Select composition' : 'Select institution first'}
                    searchPlaceholder='Search composition…'
                    modal={modal}
                    disabled={!formData.institutions_id}
                    className='w-full'
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Meeting *</label>
                  <SearchableSelect
                    value={formData.composition_id ? (meetings.find(m => m.composition_id === formData.composition_id)?.id || '') : ''}
                    onValueChange={(val) => {
                      const meeting = meetings.find(m => m.id === val);
                      if (!meeting) return;
                      updateField('composition_id', meeting.composition_id);
                      updateField('board_id', meeting.board_id);
                      if (isSuperAdmin) updateField('institutions_id', meeting.institutions_id);
                      const academicYear = meeting.bos_compositions?.academic_year;
                      if (academicYear) {
                        const startYear = academicYear.split('-')[0];
                        const matched = regulations.find(r => r.regulation_year === startYear);
                        if (matched) updateField('regulation_id', matched.id);
                      }
                    }}
                    options={meetings.map((m) => ({
                      value: m.id,
                      label: m.meeting_title,
                    }))}
                    placeholder={selectedCompositionId ? 'Select meeting' : 'Select composition first'}
                    searchPlaceholder='Search meeting…'
                    modal={modal}
                    disabled={!selectedCompositionId}
                    className='w-full'
                  />
                </div>
              </div>

              {/* Row 2: Regulation + Board */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Regulation *</label>
                  <SearchableSelect
                    value={formData.regulation_id || ''}
                    onValueChange={(val) => updateField('regulation_id', val)}
                    options={regulations.map((reg) => ({ value: reg.id, label: reg.title }))}
                    placeholder={formData.institutions_id ? 'Select regulation' : 'Select institution first'}
                    searchPlaceholder='Search regulation…'
                    modal={modal}
                    disabled={!formData.institutions_id}
                    className='w-full'
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Board</label>
                  {(() => {
                    const comp = compositions.find(c => c.id === formData.composition_id);
                    const compBoards = comp?.boards ?? [];
                    // Multi-board composition → let the user pick which board this
                    // syllabus belongs to (a syllabus has one board_id). Single-board
                    // → keep the read-only auto-fill.
                    if (compBoards.length > 1) {
                      return (
                        <SearchableSelect
                          value={formData.board_id || ''}
                          onValueChange={(val) => updateField('board_id', val)}
                          options={compBoards.map((b) => ({
                            value: b.id,
                            label: `${b.board_name} (${b.board_code})`,
                          }))}
                          placeholder='Select board'
                          searchPlaceholder='Search board…'
                          modal={modal}
                          className='w-full'
                        />
                      );
                    }
                    return (
                      <Input
                        value={
                          boards.find(b => b.id === formData.board_id)?.board_name ||
                          comp?.board?.board_name ||
                          compBoards[0]?.board_name ||
                          ''
                        }
                        disabled
                        placeholder="Auto-filled from composition"
                        className="bg-muted/50"
                      />
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Course Code *</label>
                  <SearchableSelect
                    value={formData.course_code || ''}
                    onValueChange={(val) => {
                      const course = courseOptions.find((c) => c.course_code === val);
                      if (!course) return;
                      // Anchor on the stable COE course id; course_code/name are
                      // snapshots COE may later rename.
                      updateField('course_id', course.id || '');
                      updateField('course_code', course.course_code);
                      updateField('course_name', course.course_name || course.course_title || '');
                      // COE returns `credits` (plural) in list responses and `credit` (singular)
                      // in single-record responses — handle both field names.
                      const c = course as any;
                      updateField('course_credits', c.credit ?? c.credits ?? 0);
                      const th = Number(c.theory_hours ?? 0);
                      const ph = Number(c.practical_hours ?? 0);
                      updateField('total_hours', th + ph);
                      updateField('contact_hours', Number(c.class_hours ?? (th + ph)));
                      validateCourseCode(course.course_code);
                    }}
                    options={(() => {
                      const opts = courseOptions.map((c) => ({
                        value: c.course_code,
                        label: `${c.course_code} — ${c.course_name || c.course_title || ''}`,
                      }));
                      // On edit, the courses list is filtered by institution + regulation
                      // and may not include the saved row yet (or at all). Prepend a
                      // synthetic option using the form's own course_code/name so the
                      // disabled field still displays its saved value.
                      if (
                        formData.course_code &&
                        !opts.some((o) => o.value === formData.course_code)
                      ) {
                        opts.unshift({
                          value: formData.course_code,
                          label: `${formData.course_code}${formData.course_name ? ` — ${formData.course_name}` : ''}`,
                        });
                      }
                      return opts;
                    })()}
                    placeholder={formData.institutions_id && regulation_code ? 'Select course' : 'Select institution & regulation first'}
                    searchPlaceholder='Search by code or name…'
                    modal={modal}
                    loading={coursesLoading}
                    disabled={isEditing || !formData.institutions_id || !regulation_code}
                    className={`w-full${courseCodeError ? ' border-red-500' : ''}`}
                  />
                  {courseCodeError && <p className='text-sm text-red-600 mt-1'>{courseCodeError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Course Name</label>
                  <Input
                    value={formData.course_name || ''}
                    readOnly
                    placeholder="Auto-filled from course code"
                    className="bg-muted/50 text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Total Hours</label>
                  <Input
                    type="number"
                    value={formData.total_hours ?? ''}
                    readOnly
                    placeholder="Auto-filled"
                    className="bg-muted/50 text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Hours</label>
                  <Input
                    type="number"
                    value={formData.contact_hours ?? ''}
                    readOnly
                    placeholder="Auto-filled"
                    className="bg-muted/50 text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Credits</label>
                  <Input
                    type="number"
                    value={formData.course_credits ?? ''}
                    readOnly
                    placeholder="Auto-filled"
                    className="bg-muted/50 text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Stream</label>
                <Input
                  value={formData.stream || ''}
                  onChange={(e) => updateField('stream', e.target.value)}
                  placeholder="e.g., Engineering, Pharmacy"
                />
              </div>
              {/* Nursing (INC): DESCRIPTION paragraph + Theory/Lab/Clinical workload. */}
              {isNursing && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <Textarea
                      value={formData.course_description || ''}
                      onChange={(e) => updateField('course_description', e.target.value)}
                      placeholder="The course is designed to…"
                      rows={4}
                    />
                  </div>
                  <NursingWorkloadCard
                    value={formData.nursing_workload}
                    onChange={(v) => updateField('nursing_workload', v)}
                  />
                </>
              )}
              {/* NAAC-2024 coverage tags — counted live for metrics 1.4 / 1.6 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_skill_based"
                    checked={formData.is_skill_based ?? false}
                    onCheckedChange={(v) => updateField('is_skill_based', v === true)}
                  />
                  <label htmlFor="is_skill_based" className="text-sm font-medium cursor-pointer">
                    Skill/apprenticeship-focused course
                    <span className="ml-1 text-xs text-muted-foreground">(NAAC 1.4)</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_iks"
                    checked={formData.is_iks ?? false}
                    onCheckedChange={(v) => updateField('is_iks', v === true)}
                  />
                  <label htmlFor="is_iks" className="text-sm font-medium cursor-pointer">
                    Contains Indian Knowledge System content
                    <span className="ml-1 text-xs text-muted-foreground">(NAAC 1.6)</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <Textarea
                  value={formData.notes || ''}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="Additional notes about this course"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                {compact ? (
                  // Clone popup: a single submit that posts Basic Info to the
                  // clone endpoint (content is copied from the source server-side).
                  <Button
                    type="submit"
                    disabled={!formData.course_code || !formData.course_name || !formData.institutions_id || !formData.regulation_id || !formData.composition_id || !formData.board_id || !!courseCodeError || cloning}
                    title={!formData.composition_id ? 'Select a meeting first' : undefined}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {cloning ? 'Cloning...' : 'Clone'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => handleSaveAndNext('objectives')}
                    disabled={!formData.course_code || !formData.course_name || !formData.institutions_id || !formData.regulation_id || !formData.composition_id || !formData.board_id || !!courseCodeError || isLoading}
                    title={!formData.composition_id ? 'Select a meeting first' : undefined}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isLoading ? 'Saving...' : 'Save & Next'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content tabs are hidden in the compact clone popup — every content
            section is copied from the source syllabus server-side. */}
        {!compact && (<>
        {/* Course Objectives */}
        <TabsContent value="objectives" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Course Objectives</CardTitle>
              <CardDescription>What students will learn</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ObjectivesEditor
                objectives={formData.course_objectives as any}
                onChange={(val) => updateField('course_objectives', val)}
              />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab('basic')}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveAndNext('clo')}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? 'Saving...' : 'Save & Next'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Course Outcomes */}
        <TabsContent value="clo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Course Outcomes (COs)</CardTitle>
              <CardDescription>Measurable outcomes aligned with K-values from the regulation taxonomy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* K-Values reference panel — sourced from bos_regulation_taxonomies */}
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">K-Values</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(effectiveKValues).map(([k, desc]) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs bg-background">
                      <span className="font-mono font-bold">{k}</span>
                      <span className="text-muted-foreground">— {String(desc)}</span>
                    </span>
                  ))}
                </div>
                {!formData.regulation_id && (
                  <p className="text-xs text-amber-600 mt-2">Select a regulation to load configured K-values.</p>
                )}
              </div>
              <CloEditor
                clos={formData.course_learning_outcomes as any}
                kValues={effectiveKValues}
                onChange={(val) => updateField('course_learning_outcomes', val)}
              />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab('objectives')}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveAndNext('content')}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? 'Saving...' : 'Save & Next'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Course Content */}
        <TabsContent value="content" className="space-y-4">
          {isBds ? (
            /* Dental (BDS/DCI): goal/objectives/competencies/MUST-DESIRABLE-NICE
               grid + exam scheme live in bds_content/exam_scheme (course_content
               is NULL) — render the dedicated read-only card. */
            <BdsContentCard
              content={(formData as any).bds_content}
              examScheme={formData.exam_scheme}
              textbooks={formData.textbooks}
            />
          ) : isAhsShaped ? (
            /* AHS / Pharm.D: year → paper/subject → topics|units tree (ahs_content). */
            <AhsContentCard
              value={formData.ahs_content}
              onChange={(v) => updateField('ahs_content', v)}
            />
          ) : (
          <Card>
            <CardHeader>
              <CardTitle>Course Content</CardTitle>
              <CardDescription>Units and topics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ContentEditor
                content={formData.course_content as any}
                onChange={(val) => updateField('course_content', val)}
                courseCode={formData.course_code}
                courseCategory={selectedCourseCategory}
              />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab('clo')}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveAndNext('resources')}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? 'Saving...' : 'Save & Next'}
                </Button>
              </div>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        {/* Resources */}
        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Textbooks & Web Resources</CardTitle>
              <CardDescription>Primary textbooks, references, and online resources</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TextbooksEditor
                textbooks={formData.textbooks as any}
                onChange={(val) => updateField('textbooks', val)}
              />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Web Resources</h4>
                <ResourcesEditor
                  resources={formData.web_resources as any}
                  onChange={(val) => updateField('web_resources', val)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                <Button type="button" variant="outline" onClick={() => setActiveTab('content')}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveAndNext('pedagogy')}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? 'Saving...' : 'Save & Next'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pedagogy */}
        <TabsContent value="pedagogy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pedagogical Methods</CardTitle>
              <CardDescription>Teaching and learning methods</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PedagogyEditor
                methods={formData.pedagogy as any}
                onChange={(val) => updateField('pedagogy', val)}
              />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab('resources')}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveAndNext('mappings')}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? 'Saving...' : 'Save & Next'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PO Mappings */}
        <TabsContent value="mappings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Programme Outcome Mappings</CardTitle>
              <CardDescription>Align COs with Programme Outcomes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PoMappingsEditor
                mappings={formData.po_mappings as BosPOMappingsData | undefined}
                regulationId={formData.regulation_id || ''}
                institutionsIds={formData.institutions_id || ''}
                boardId={formData.board_id || ''}
                // The selected board's code = its programme code in this system;
                // scopes the PO/PSO Programme list to just this board.
                boardProgrammeCode={
                  compositions
                    .find(c => c.id === formData.composition_id)
                    ?.boards?.find(b => b.id === formData.board_id)?.board_code
                }
                courseOutcomes={((formData.course_learning_outcomes as any)?.clos ?? []) as BosCourseLearnOutcome[]}
                onChange={(val) => updateField('po_mappings', val)}
              />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab('pedagogy')}>
                  Back
                </Button>
                {isFinksBoard ? (
                  <Button
                    type="button"
                    onClick={() => handleSaveAndNext('assessment')}
                    disabled={isLoading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isLoading ? 'Saving...' : 'Save & Next'}
                  </Button>
                ) : (
                  // Bloom's boards: PO Mappings is the last tab — final save here.
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isLoading
                      ? 'Saving...'
                      : isEditing
                        ? 'Update Syllabus'
                        : isDuplicate
                          ? 'Create Clone'
                          : 'Create Syllabus'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fink's-only panels — hidden entirely for Bloom's / unconfigured boards */}
        {isFinksBoard && (<>
        {/* Assessment Structure (v1.2) */}
        <TabsContent value="assessment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Assessment Structure</CardTitle>
              <CardDescription>
                Components (Total 100), Concept Applications, and Principal-Agent
                Public Exhibition capstones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AssessmentEditor
                assessment={formData.assessment_structure as any}
                onChange={(val) => updateField('assessment_structure', val)}
              />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab('mappings')}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveAndNext('capstone')}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? 'Saving...' : 'Save & Next'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fink's Formative + Capstone (v3.5) */}
        <TabsContent value="capstone" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Concept Applications (Formative Learning Activities)</CardTitle>
              <CardDescription>
                Fink&apos;s-shaped formative activities anchored to the course units —
                not separately graded; may credit toward the Activities row
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConceptApplicationsEditor
                value={formData.concept_applications}
                onChange={(val) => updateField('concept_applications', val)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assessment Pattern</CardTitle>
              <CardDescription>Internal / External split and internal component rows</CardDescription>
            </CardHeader>
            <CardContent>
              <AssessmentPatternEditor
                value={formData.assessment_pattern}
                onChange={(val) => updateField('assessment_pattern', val)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capstone Project</CardTitle>
              <CardDescription>
                Choose ONE of FIVE — AI-proof primary deliverable, ~400-word support,
                presented at the Learners Led Conference
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CapstoneProjectEditor
                value={formData.capstone_project}
                onChange={(val) => updateField('capstone_project', val)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capstone Rubric</CardTitle>
              <CardDescription>Common to all capstone options</CardDescription>
            </CardHeader>
            <CardContent>
              <CapstoneRubricEditor
                value={formData.capstone_rubric}
                onChange={(val) => updateField('capstone_rubric', val)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>End-of-Course Learners Led Conference</CardTitle>
              <CardDescription>The cohort-facing session where every Capstone is presented</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <LlcConferenceEditor
                value={formData.llc_conference}
                onChange={(val) => updateField('llc_conference', val)}
              />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab('assessment')}>
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading
                    ? 'Saving...'
                    : isEditing
                      ? 'Update Syllabus'
                      : isDuplicate
                        ? 'Create Clone'
                        : 'Create Syllabus'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        </>)}
        </>)}
      </Tabs>
      </fieldset>

      {(createMutation.error || updateMutation.error) && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            {(createMutation.error || updateMutation.error)?.message || 'An error occurred'}
          </AlertDescription>
        </Alert>
      )}

      <SyllabusImportIssuesDialog
        open={importIssuesOpen}
        onOpenChange={setImportIssuesOpen}
        warnings={importWarnings}
        summary={importCounts}
      />
    </form>
  );
}

// ── AssessmentEditor: v1.2 Assessment Structure (Total 100) ──────────────────
function AssessmentEditor({ assessment, onChange }: {
  assessment?: {
    components?: Array<{ id?: string; sno?: number; component: string; marks: number }>;
    concept_applications_note?: string;
    exhibition_note?: string;
    capstones?: Array<{ id?: string; title: string; subject?: string; artifacts?: string; give_back?: string }>;
  };
  onChange: (val: any) => void;
}) {
  const data = assessment ?? {};
  const components = data.components ?? [];
  const capstones = data.capstones ?? [];
  const total = components.reduce((s, c) => s + (Number(c.marks) || 0), 0);

  const update = (patch: any) => onChange({ ...data, ...patch });

  const addComponent = () =>
    update({ components: [...components, { sno: components.length + 1, component: '', marks: 0 }] });
  const updateComponent = (idx: number, field: 'component' | 'marks', value: string) =>
    update({
      components: components.map((c, i) =>
        i === idx ? { ...c, [field]: field === 'marks' ? Number(value) || 0 : value } : c,
      ),
    });
  const removeComponent = (idx: number) =>
    update({
      components: components.filter((_, i) => i !== idx).map((c, i) => ({ ...c, sno: i + 1 })),
    });

  const addCapstone = () =>
    update({ capstones: [...capstones, { title: '', subject: '', artifacts: '', give_back: '' }] });
  const updateCapstone = (idx: number, field: 'title' | 'subject' | 'artifacts' | 'give_back', value: string) =>
    update({ capstones: capstones.map((c, i) => (i === idx ? { ...c, [field]: value } : c)) });
  const removeCapstone = (idx: number) =>
    update({ capstones: capstones.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-6">
      {/* Components table (Total 100) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Assessment Structure (Total 100)
          </h4>
          <Button type="button" variant="outline" size="sm" onClick={addComponent} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add Component
          </Button>
        </div>
        <div className="rounded-md border divide-y">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
            <span className="w-8 shrink-0">S.No</span>
            <span className="flex-1">Component</span>
            <span className="w-20 shrink-0 text-right">Marks</span>
            <span className="w-8 shrink-0" />
          </div>
          {components.map((c, idx) => (
            <div key={c.id ?? idx} className="flex items-start gap-2 px-3 py-2">
              <span className="w-8 shrink-0 pt-2 text-sm text-muted-foreground">{c.sno ?? idx + 1}</span>
              <Textarea
                value={c.component}
                onChange={(e) => updateComponent(idx, 'component', e.target.value)}
                placeholder="Component description"
                rows={2}
                className="flex-1"
              />
              <Input
                type="number"
                value={c.marks ?? ''}
                onChange={(e) => updateComponent(idx, 'marks', e.target.value)}
                className="w-20 shrink-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeComponent(idx)}
                className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                aria-label="Remove component"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {components.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No components yet — add one.
            </div>
          )}
          <div className="flex items-center justify-end gap-2 px-3 py-2 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">Total</span>
            <span className={`text-sm font-semibold ${total === 100 ? 'text-green-600' : 'text-amber-600'}`}>
              {total}
            </span>
            {total !== 100 && (
              <span className="text-xs text-amber-600">(should be 100)</span>
            )}
          </div>
        </div>
      </div>

      {/* Concept Applications note */}
      <div>
        <label className="block text-sm font-medium mb-1">Concept Applications (Mode-Mapped per v1.2 Spec)</label>
        <Textarea
          value={data.concept_applications_note ?? ''}
          onChange={(e) => update({ concept_applications_note: e.target.value })}
          placeholder="e.g., Five Fink's-shaped Concept Applications, one per Unit. CA-I locked to Mode 1, CA-III to Mode 3…"
          rows={3}
        />
      </div>

      {/* Exhibition note */}
      <div>
        <label className="block text-sm font-medium mb-1">Principal-Agent Public Exhibition</label>
        <Textarea
          value={data.exhibition_note ?? ''}
          onChange={(e) => update({ exhibition_note: e.target.value })}
          placeholder="e.g., choose ONE of FIVE Capstones — see below."
          rows={2}
        />
      </div>

      {/* Capstones */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Capstone Projects
          </h4>
          <Button type="button" variant="outline" size="sm" onClick={addCapstone} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add Capstone
          </Button>
        </div>
        <div className="space-y-3">
          {capstones.map((cap, idx) => (
            <Card key={cap.id ?? idx} className="border-muted">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={cap.title}
                    onChange={(e) => updateCapstone(idx, 'title', e.target.value)}
                    placeholder="Capstone title — e.g., The Graph in My Town"
                    className="flex-1 font-medium"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCapstone(idx)}
                    className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                    aria-label="Remove capstone"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Subject</label>
                  <Textarea
                    value={cap.subject ?? ''}
                    onChange={(e) => updateCapstone(idx, 'subject', e.target.value)}
                    placeholder="What the student models / does"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Artifacts on display</label>
                  <Textarea
                    value={cap.artifacts ?? ''}
                    onChange={(e) => updateCapstone(idx, 'artifacts', e.target.value)}
                    placeholder="e.g., 3 best CAs + adjacency-matrix Excel + 1500-word essay + 500-word reflection"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Give-back (Hook 3)</label>
                  <Textarea
                    value={cap.give_back ?? ''}
                    onChange={(e) => updateCapstone(idx, 'give_back', e.target.value)}
                    placeholder="Hand findings back to the people in the system and record their response"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          {capstones.length === 0 && (
            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground text-center">
              No capstones yet — add the FIVE exhibition options (or just the chosen one).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── v3.5 Fink's Formative + Capstone editors ─────────────────────────────────

// Concept Applications (Formative Learning Activities): intro note + one row
// per unit-anchored, Fink's-dimension-shaped activity.
function ConceptApplicationsEditor({ value, onChange }: {
  value?: BosConceptApplicationsData;
  onChange: (val: BosConceptApplicationsData) => void;
}) {
  const data = value ?? {};
  const activities = data.activities ?? [];
  const update = (patch: Partial<BosConceptApplicationsData>) => onChange({ ...data, ...patch });

  const addActivity = () =>
    update({
      activities: [
        ...activities,
        { sno: activities.length + 1, unit: '', finks_dimension: '', task: '', deliverable_notes: '' },
      ],
    });
  const updateActivity = (idx: number, field: 'unit' | 'finks_dimension' | 'task' | 'deliverable_notes', val: string) =>
    update({ activities: activities.map((a, i) => (i === idx ? { ...a, [field]: val } : a)) });
  const removeActivity = (idx: number) =>
    update({
      activities: activities.filter((_, i) => i !== idx).map((a, i) => ({ ...a, sno: i + 1 })),
    });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Intro note</label>
        <Textarea
          value={data.intro_note ?? ''}
          onChange={(e) => update({ intro_note: e.target.value })}
          placeholder="e.g., Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester…"
          rows={3}
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Activities
          </h4>
          <Button type="button" variant="outline" size="sm" onClick={addActivity} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add Activity
          </Button>
        </div>
        <div className="space-y-3">
          {activities.map((act, idx) => (
            <Card key={act.id ?? idx} className="border-muted">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-sm text-muted-foreground">{act.sno ?? idx + 1}</span>
                  <Input
                    value={act.unit}
                    onChange={(e) => updateActivity(idx, 'unit', e.target.value)}
                    placeholder="Unit — e.g., Word Tasks 1-2"
                    className="flex-1"
                  />
                  <Input
                    value={act.finks_dimension}
                    onChange={(e) => updateActivity(idx, 'finks_dimension', e.target.value)}
                    placeholder="Fink's dimension — e.g., Foundational Knowledge"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeActivity(idx)}
                    className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                    aria-label="Remove activity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Task</label>
                  <Textarea
                    value={act.task}
                    onChange={(e) => updateActivity(idx, 'task', e.target.value)}
                    placeholder="The activity brief — what the Learner does with THEIR real content"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Deliverable &amp; notes</label>
                  <Textarea
                    value={act.deliverable_notes}
                    onChange={(e) => updateActivity(idx, 'deliverable_notes', e.target.value)}
                    placeholder="The evidence + the 3-4 sentence reflection prompt"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          {activities.length === 0 && (
            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground text-center">
              No activities yet — add one per unit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Assessment Pattern: internal/external split + internal component rows.
function AssessmentPatternEditor({ value, onChange }: {
  value?: BosAssessmentPatternData;
  onChange: (val: BosAssessmentPatternData) => void;
}) {
  const data = value ?? {};
  const components = data.components ?? [];
  const internal = data.internal_marks ?? 0;
  const total = components.reduce((s, c) => s + (Number(c.marks) || 0), 0);
  const update = (patch: Partial<BosAssessmentPatternData>) => onChange({ ...data, ...patch });

  const addComponent = () =>
    update({ components: [...components, { sno: components.length + 1, component: '', marks: 0 }] });
  const updateComponent = (idx: number, field: 'component' | 'marks', val: string) =>
    update({
      components: components.map((c, i) =>
        i === idx ? { ...c, [field]: field === 'marks' ? Number(val) || 0 : val } : c,
      ),
    });
  const removeComponent = (idx: number) =>
    update({
      components: components.filter((_, i) => i !== idx).map((c, i) => ({ ...c, sno: i + 1 })),
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Internal marks</label>
          <Input
            type="number"
            value={data.internal_marks ?? ''}
            onChange={(e) => update({ internal_marks: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">External marks</label>
          <Input
            type="number"
            value={data.external_marks ?? ''}
            onChange={(e) => update({ external_marks: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Internal Components
          </h4>
          <Button type="button" variant="outline" size="sm" onClick={addComponent} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add Component
          </Button>
        </div>
        <div className="rounded-md border divide-y">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
            <span className="w-8 shrink-0">S.No</span>
            <span className="flex-1">Component</span>
            <span className="w-20 shrink-0 text-right">Marks</span>
            <span className="w-8 shrink-0" />
          </div>
          {components.map((c, idx) => (
            <div key={c.id ?? idx} className="flex items-start gap-2 px-3 py-2">
              <span className="w-8 shrink-0 pt-2 text-sm text-muted-foreground">{c.sno ?? idx + 1}</span>
              <Textarea
                value={c.component}
                onChange={(e) => updateComponent(idx, 'component', e.target.value)}
                placeholder="Component description"
                rows={2}
                className="flex-1"
              />
              <Input
                type="number"
                value={c.marks ?? ''}
                onChange={(e) => updateComponent(idx, 'marks', e.target.value)}
                className="w-20 shrink-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeComponent(idx)}
                className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                aria-label="Remove component"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {components.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No components yet — add one.
            </div>
          )}
          <div className="flex items-center justify-end gap-2 px-3 py-2 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">Total Internal</span>
            <span className={`text-sm font-semibold ${total === internal ? 'text-green-600' : 'text-amber-600'}`}>
              {total}
            </span>
            {total !== internal && (
              <span className="text-xs text-amber-600">(should be {internal})</span>
            )}
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Activities note</label>
        <Textarea
          value={data.activities_note ?? ''}
          onChange={(e) => update({ activities_note: e.target.value })}
          placeholder="* Activities: Assignment / Case study / Field survey / PPT / Group discussion…"
          rows={2}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Note</label>
        <Textarea
          value={data.note ?? ''}
          onChange={(e) => update({ note: e.target.value })}
          placeholder="e.g., The Concept Applications are formative practice; the summative Fink's assessment is the Capstone Project."
          rows={2}
        />
      </div>
    </div>
  );
}

// Capstone Project: intro note + "choose ONE of FIVE" option cards.
function CapstoneProjectEditor({ value, onChange }: {
  value?: BosCapstoneProjectData;
  onChange: (val: BosCapstoneProjectData) => void;
}) {
  const data = value ?? {};
  const options = data.options ?? [];
  const update = (patch: Partial<BosCapstoneProjectData>) => onChange({ ...data, ...patch });

  const addOption = () =>
    update({
      options: [...options, { option_no: options.length + 1, title: '', primary: '', support: '', llc: '' }],
    });
  const updateOption = (idx: number, field: 'title' | 'primary' | 'support' | 'llc', val: string) =>
    update({ options: options.map((o, i) => (i === idx ? { ...o, [field]: val } : o)) });
  const removeOption = (idx: number) =>
    update({
      options: options.filter((_, i) => i !== idx).map((o, i) => ({ ...o, option_no: i + 1 })),
    });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Intro note</label>
        <Textarea
          value={data.intro_note ?? ''}
          onChange={(e) => update({ intro_note: e.target.value })}
          placeholder="e.g., choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference…"
          rows={3}
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Options
          </h4>
          <Button type="button" variant="outline" size="sm" onClick={addOption} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add Option
          </Button>
        </div>
        <div className="space-y-3">
          {options.map((opt, idx) => (
            <Card key={opt.id ?? idx} className="border-muted">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    Option {opt.option_no ?? idx + 1}
                  </span>
                  <Input
                    value={opt.title}
                    onChange={(e) => updateOption(idx, 'title', e.target.value)}
                    placeholder='Title — e.g., "The Document Kit for a Real Event"'
                    className="flex-1 font-medium"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(idx)}
                    className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                    aria-label="Remove option"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Primary (AI-proof)</label>
                  <Textarea
                    value={opt.primary ?? ''}
                    onChange={(e) => updateOption(idx, 'primary', e.target.value)}
                    placeholder="The real measured object / named-source deliverable an AI cannot fabricate"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Support (~400 words)</label>
                  <Textarea
                    value={opt.support ?? ''}
                    onChange={(e) => updateOption(idx, 'support', e.target.value)}
                    placeholder="What the short reflection covers"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">LLC demonstration</label>
                  <Textarea
                    value={opt.llc ?? ''}
                    onChange={(e) => updateOption(idx, 'llc', e.target.value)}
                    placeholder="What is shown live at the Learners Led Conference"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          {options.length === 0 && (
            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground text-center">
              No options yet — add the FIVE capstone options.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Capstone Rubric: criterion rows common to all capstone options.
function CapstoneRubricEditor({ value, onChange }: {
  value?: BosCapstoneRubricData;
  onChange: (val: BosCapstoneRubricData) => void;
}) {
  const data = value ?? {};
  const criteria = data.criteria ?? [];
  const rubricTotal = data.total_marks ?? 0;
  const total = criteria.reduce((s, c) => s + (Number(c.marks) || 0), 0);
  const update = (patch: Partial<BosCapstoneRubricData>) => onChange({ ...data, ...patch });

  const addCriterion = () =>
    update({ criteria: [...criteria, { sno: criteria.length + 1, criterion: '', marks: 0 }] });
  const updateCriterion = (idx: number, field: 'criterion' | 'marks', val: string) =>
    update({
      criteria: criteria.map((c, i) =>
        i === idx ? { ...c, [field]: field === 'marks' ? Number(val) || 0 : val } : c,
      ),
    });
  const removeCriterion = (idx: number) =>
    update({
      criteria: criteria.filter((_, i) => i !== idx).map((c, i) => ({ ...c, sno: i + 1 })),
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Total marks</label>
          <Input
            type="number"
            value={data.total_marks ?? ''}
            onChange={(e) => update({ total_marks: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Note</label>
          <Input
            value={data.note ?? ''}
            onChange={(e) => update({ note: e.target.value })}
            placeholder="e.g., 10 marks · common to all 5 options"
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Criteria
          </h4>
          <Button type="button" variant="outline" size="sm" onClick={addCriterion} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add Criterion
          </Button>
        </div>
        <div className="rounded-md border divide-y">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
            <span className="w-8 shrink-0">S.No</span>
            <span className="flex-1">Criterion</span>
            <span className="w-20 shrink-0 text-right">Marks</span>
            <span className="w-8 shrink-0" />
          </div>
          {criteria.map((c, idx) => (
            <div key={c.id ?? idx} className="flex items-start gap-2 px-3 py-2">
              <span className="w-8 shrink-0 pt-2 text-sm text-muted-foreground">{c.sno ?? idx + 1}</span>
              <Textarea
                value={c.criterion}
                onChange={(e) => updateCriterion(idx, 'criterion', e.target.value)}
                placeholder="Criterion description"
                rows={2}
                className="flex-1"
              />
              <Input
                type="number"
                value={c.marks ?? ''}
                onChange={(e) => updateCriterion(idx, 'marks', e.target.value)}
                className="w-20 shrink-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCriterion(idx)}
                className="h-8 w-8 shrink-0 text-red-500 hover:text-red-600"
                aria-label="Remove criterion"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {criteria.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No criteria yet — add one.
            </div>
          )}
          <div className="flex items-center justify-end gap-2 px-3 py-2 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">Total</span>
            <span className={`text-sm font-semibold ${total === rubricTotal ? 'text-green-600' : 'text-amber-600'}`}>
              {total}
            </span>
            {total !== rubricTotal && (
              <span className="text-xs text-amber-600">(should be {rubricTotal})</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// End-of-Course Learners Led Conference: title / subtitle / description block.
function LlcConferenceEditor({ value, onChange }: {
  value?: BosLlcConferenceData;
  onChange: (val: BosLlcConferenceData) => void;
}) {
  const data = value ?? {};
  const update = (patch: Partial<BosLlcConferenceData>) => onChange({ ...data, ...patch });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <Input
          value={data.title ?? ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="End-of-Course Learners Led Conference"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Subtitle</label>
        <Input
          value={data.subtitle ?? ''}
          onChange={(e) => update({ subtitle: e.target.value })}
          placeholder="cohort audience · faculty + Senior Learner facilitate · no outside guest required"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <Textarea
          value={data.description ?? ''}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="How the conference runs, who facilitates, and what each Learner presents"
          rows={5}
        />
      </div>
    </div>
  );
}

// ── MathInput: text input with a categorised math/Greek symbol picker ────────
const MATH_SYMBOL_GROUPS = [
  { label: 'Greek', syms: ['θ','α','β','γ','δ','φ','ψ','ω','π','Σ','Δ','Ω','Λ','μ','λ','ε','ζ','η','ι','κ','ν','ξ','ρ','σ','τ','χ'] },
  { label: 'Ops',   syms: ['√','∞','±','×','÷','≤','≥','≠','≈','∫','∑','∏','∂','∇','∝'] },
  { label: 'Super', syms: ['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹','ⁿ','ᵐ'] },
  { label: 'Sub',   syms: ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'] },
  { label: 'Sets',  syms: ['∈','∉','⊂','⊃','∪','∩','∅','ℝ','ℤ','ℕ','ℚ'] },
  { label: 'Misc',  syms: ['…','→','←','↔','⇒','⇔','∴','∵','°','′','″'] },
];

function MathInput({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const insertAtCursor = (sym: string) => {
    const input = inputRef.current;
    if (!input) { onChange(value + sym); return; }
    const start = input.selectionStart ?? value.length;
    const end   = input.selectionEnd   ?? value.length;
    const next  = value.substring(0, start) + sym + value.substring(end);
    onChange(next);
    requestAnimationFrame(() => {
      input.setSelectionRange(start + sym.length, start + sym.length);
      input.focus();
    });
  };

  return (
    <div className="w-full">
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={className}
      />
      {focused && (
        <div className="mt-1 border rounded-lg bg-card shadow-sm overflow-hidden z-10">
          {MATH_SYMBOL_GROUPS.map((group) => (
            <div key={group.label} className="flex items-center gap-1 px-2 py-1 border-b last:border-0 hover:bg-muted/30 transition-colors">
              <span className="text-[10px] font-semibold text-muted-foreground w-9 shrink-0 uppercase tracking-wide">{group.label}</span>
              <div className="flex flex-wrap gap-0.5">
                {group.syms.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertAtCursor(sym); }}
                    className="w-7 h-7 flex items-center justify-center rounded font-mono text-sm hover:bg-primary/15 hover:text-primary transition-colors"
                    title={sym}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sub-components for each section

function ObjectivesEditor({ objectives, onChange }: any) {
  const objs = objectives?.objectives || [];
  const addObjective = () => {
    onChange({
      ...objectives,
      objectives: [...objs, { number: objs.length + 1, description: '' }],
    });
  };
  const updateObjective = (idx: number, description: string) => {
    onChange({
      ...objectives,
      objectives: objs.map((o: any, i: number) => (i === idx ? { ...o, description } : o)),
    });
  };
  const removeObjective = (idx: number) => {
    onChange({
      ...objectives,
      objectives: objs.filter((_: any, i: number) => i !== idx),
    });
  };

  return (
    <div className="space-y-2">
      {objs.map((obj: any, idx: number) => (
        <div key={idx} className="flex gap-2">
          <span className="text-sm font-semibold pt-2 min-w-fit">O{obj.number}:</span>
          <Textarea
            value={obj.description}
            onChange={(e) => updateObjective(idx, e.target.value)}
            placeholder="Objective description"
            rows={2}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeObjective(idx)}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addObjective} className="w-full">
        + Add Objective
      </Button>
    </div>
  );
}

function CloEditor({ clos, kValues, onChange }: any) {
  const coList = clos?.clos || [];
  const addCo = () => {
    onChange({
      ...clos,
      clos: [
        ...coList,
        { clo_number: coList.length + 1, description: '', k_values: [] },
      ],
    });
  };
  const updateCo = (idx: number, field: string, value: any) => {
    onChange({
      ...clos,
      clos: coList.map((c: any, i: number) =>
        i === idx ? { ...c, [field]: value } : c
      ),
    });
  };
  const removeCo = (idx: number) => {
    onChange({
      ...clos,
      clos: coList.filter((_: any, i: number) => i !== idx),
    });
  };

  return (
    <div className="space-y-3">
      {coList.map((co: any, idx: number) => (
        <Card key={idx} className="p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground min-w-[36px]">
                CO{co.clo_number ?? idx + 1}
              </span>
              <Input
                placeholder="Describe this course outcome…"
                value={co.description}
                onChange={(e) => updateCo(idx, 'description', e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeCo(idx)}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                Remove
              </Button>
            </div>
            <div className="ml-[44px]">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground">K-Values</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateCo(idx, 'k_values', Object.keys(kValues))}
                    className="text-xs text-primary hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={() => updateCo(idx, 'k_values', [])}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(kValues).map(([k, desc]) => {
                  const checked = co.k_values?.includes(k) || false;
                  return (
                    <label
                      key={k}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...(co.k_values || []), k]
                            : (co.k_values || []).filter((v: string) => v !== k);
                          updateCo(idx, 'k_values', updated);
                        }}
                      />
                      <span className="font-mono font-bold">{k}</span>
                      {desc && <span className="opacity-80">— {String(desc)}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      ))}
      <Button type="button" variant="outline" onClick={addCo} className="w-full">
        + Add CO
      </Button>
    </div>
  );
}

function ContentEditor({ content, onChange, courseCode, courseCategory }: any) {
  const isPractical = !!content?.is_practical;
  const isProject = !!content?.is_project;
  const activeMode: 'theory' | 'practical' | 'project' = isProject
    ? 'project'
    : isPractical
    ? 'practical'
    : 'theory';

  // Escape hatch for courses whose COE category doesn't describe how the
  // syllabus is actually written — e.g. a "Practical" lab course whose approved
  // document is unit-wise (UNIT I … UNIT VI with hours) rather than a numbered
  // experiment list. Without this the Theory tab is disabled and the author is
  // forced to flatten those units into topics, which is exactly how they are
  // then exported. Session-local: what persists is the mode the author picks
  // (is_practical + the populated shape), so no schema change is needed.
  const [allowAnyMode, setAllowAnyMode] = useState(false);

  // Which Content-Type tabs the course category permits. The category strings
  // ("Theory", "Practical", "Project", "Theory + Practical", "Theory + Project",
  // "Group Project", …) are matched by substring so combined types light up both
  // tabs. Non-content categories ("Non Academic", "Field Work", "Community
  // Service") match nothing → we fall back to enabling everything rather than
  // stranding the user with no editable tab. The currently-active mode is always
  // kept enabled so existing data can never be hidden behind a disabled tab.
  const allowedModes = (() => {
    const c = (courseCategory || '').toLowerCase();
    const modes = {
      theory: c.includes('theory'),
      practical: c.includes('practical'),
      project: c.includes('project'),
    };
    if (!c || (!modes.theory && !modes.practical && !modes.project)) {
      modes.theory = modes.practical = modes.project = true;
    }
    if (allowAnyMode) {
      modes.theory = modes.practical = modes.project = true;
    }
    modes[activeMode] = true;
    return modes;
  })();
  // Only worth offering when the category actually locks a tab.
  const categoryRestricts = !(allowedModes.theory && allowedModes.practical && allowedModes.project);

  const units = content?.units || [];
  const topics: {
    number: number;
    title: string;
    subtopics?: { number: number; title: string }[];
  }[] = content?.topics || [];
  const projectUnits = content?.project_units || [];

  // Migrate legacy single-letter unit IDs (A, B, C…) to Roman numerals (I, II, III…).
  // The regex excludes I, V, X — those are valid Roman numerals already and must
  // not be mistaken for legacy letters 9/22/24.
  const LEGACY_LETTER = /^[A-HJ-UWY-Z]$/;
  useEffect(() => {
    if (!units.length) return;
    const hasLegacyIds = units.some((u: any) => LEGACY_LETTER.test(u.unit_id));
    if (!hasLegacyIds) return;
    onChange({
      ...content,
      units: units.map((u: any) => ({
        ...u,
        unit_id: LEGACY_LETTER.test(u.unit_id)
          ? (() => {
              const n = u.unit_id.charCodeAt(0) - 64; // A=1, B=2, …
              const vals = [10,9,5,4,1], syms = ['X','IX','V','IV','I'];
              let r = '', rem = n;
              for (let i = 0; i < vals.length; i++) while (rem >= vals[i]) { r += syms[i]; rem -= vals[i]; }
              return r;
            })()
          : u.unit_id,
      })),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchToMode = (targetMode: 'theory' | 'practical' | 'project') => {
    // Guard: never enter a mode the course category disallows.
    if (!allowedModes[targetMode]) return;
    // No-op if we're already there.
    if (targetMode === activeMode) return;

    // Switching mode ONLY flips the two view flags. Each mode's data lives under
    // its own key (theory→units, practical→topics, project→project_units), so we
    // spread `...content` to keep ALL of them intact. This is what fixes the
    // data-loss bug: cycling Theory→Practical→Project→Theory no longer wipes the
    // keys the previous switch didn't name.
    if (targetMode === 'theory') {
      onChange({ ...content, is_practical: false, is_project: false });
    } else if (targetMode === 'practical') {
      // Seed practical topics from theory chapters ONLY when practical has no
      // topics yet — a one-time convenience that never overwrites existing
      // topics and never drops units/project_units.
      const patch: any = { ...content, is_practical: true, is_project: false };
      if (!topics.length && units.length) {
        const allChapters = units.flatMap((u: any) => u.chapters || []);
        patch.topics = allChapters.map((ch: any, i: number) => ({
          number: i + 1,
          title: ch.title || '',
        }));
      }
      onChange(patch);
    } else {
      onChange({ ...content, is_practical: false, is_project: true });
    }
  };

  const toRoman = (n: number): string => {
    const vals = [10, 9, 5, 4, 1];
    const syms = ['X', 'IX', 'V', 'IV', 'I'];
    let result = '';
    let rem = n;
    for (let i = 0; i < vals.length; i++) {
      while (rem >= vals[i]) { result += syms[i]; rem -= vals[i]; }
    }
    return result;
  };

  const addUnit = () => {
    onChange({
      ...content,
      units: [...units, { unit_id: toRoman(units.length + 1), unit_title: '', chapters: [], remarks: '' }],
    });
  };

  const removeUnit = (idx: number) => {
    const updated = units
      .filter((_: any, i: number) => i !== idx)
      .map((u: any, i: number) => ({ ...u, unit_id: toRoman(i + 1) }));
    onChange({ ...content, units: updated });
  };

  const updateUnit = (idx: number, field: string, value: any) => {
    onChange({
      ...content,
      units: units.map((u: any, i: number) =>
        i === idx ? { ...u, [field]: value } : u
      ),
    });
  };

  const addChapter = (unitIdx: number) => {
    const newUnits = [...units];
    newUnits[unitIdx].chapters = [
      ...(newUnits[unitIdx].chapters || []),
      { chapter_number: (newUnits[unitIdx].chapters?.length || 0) + 1, title: '', sections: '', subtopics: [] },
    ];
    onChange({ ...content, units: newUnits });
  };

  const addSubtopic = (unitIdx: number, chIdx: number) => {
    const newChapters = [...(units[unitIdx].chapters || [])];
    const existing = newChapters[chIdx].subtopics || [];
    newChapters[chIdx] = {
      ...newChapters[chIdx],
      subtopics: [...existing, { number: existing.length + 1, title: '' }],
    };
    updateUnit(unitIdx, 'chapters', newChapters);
  };

  const updateSubtopic = (unitIdx: number, chIdx: number, stIdx: number, title: string) => {
    const newChapters = [...(units[unitIdx].chapters || [])];
    const subtopics = (newChapters[chIdx].subtopics || []).map((s: any, i: number) =>
      i === stIdx ? { ...s, title } : s
    );
    newChapters[chIdx] = { ...newChapters[chIdx], subtopics };
    updateUnit(unitIdx, 'chapters', newChapters);
  };

  const removeSubtopic = (unitIdx: number, chIdx: number, stIdx: number) => {
    const newChapters = [...(units[unitIdx].chapters || [])];
    const subtopics = (newChapters[chIdx].subtopics || [])
      .filter((_: any, i: number) => i !== stIdx)
      .map((s: any, i: number) => ({ ...s, number: i + 1 }));
    newChapters[chIdx] = { ...newChapters[chIdx], subtopics };
    updateUnit(unitIdx, 'chapters', newChapters);
  };

  const addTopic = () => {
    onChange({ ...content, topics: [...topics, { number: topics.length + 1, title: '' }] });
  };

  const updateTopic = (idx: number, title: string) => {
    onChange({
      ...content,
      topics: topics.map((t, i) => (i === idx ? { ...t, title } : t)),
    });
  };

  const removeTopic = (idx: number) => {
    const updated = topics
      .filter((_, i) => i !== idx)
      .map((t, i) => ({ ...t, number: i + 1 }));
    onChange({ ...content, topics: updated });
  };

  const addPracticalSubtopic = (topicIdx: number) => {
    const updated = topics.map((t, i) => {
      if (i !== topicIdx) return t;
      const existing = t.subtopics ?? [];
      return { ...t, subtopics: [...existing, { number: existing.length + 1, title: '' }] };
    });
    onChange({ ...content, topics: updated });
  };

  const updatePracticalSubtopic = (topicIdx: number, stIdx: number, title: string) => {
    const updated = topics.map((t, i) => {
      if (i !== topicIdx) return t;
      const subs = (t.subtopics ?? []).map((s, j) => (j === stIdx ? { ...s, title } : s));
      return { ...t, subtopics: subs };
    });
    onChange({ ...content, topics: updated });
  };

  const removePracticalSubtopic = (topicIdx: number, stIdx: number) => {
    const updated = topics.map((t, i) => {
      if (i !== topicIdx) return t;
      const subs = (t.subtopics ?? [])
        .filter((_, j) => j !== stIdx)
        .map((s, j) => ({ ...s, number: j + 1 }));
      return { ...t, subtopics: subs };
    });
    onChange({ ...content, topics: updated });
  };

  // Project mode helpers
  const addProjectUnit = () => {
    onChange({
      ...content,
      project_units: [...projectUnits, { unit_id: toRoman(projectUnits.length + 1), unit_title: '', rules: [], remarks: '' }],
    });
  };

  const removeProjectUnit = (idx: number) => {
    const updated = projectUnits
      .filter((_: any, i: number) => i !== idx)
      .map((u: any, i: number) => ({ ...u, unit_id: toRoman(i + 1) }));
    onChange({ ...content, project_units: updated });
  };

  const updateProjectUnit = (idx: number, field: string, value: any) => {
    onChange({
      ...content,
      project_units: projectUnits.map((u: any, i: number) =>
        i === idx ? { ...u, [field]: value } : u
      ),
    });
  };

  const addProjectRule = (unitIdx: number) => {
    const newUnits = [...projectUnits];
    newUnits[unitIdx].rules = [
      ...(newUnits[unitIdx].rules || []),
      { unit_of_experiment: '', content: '' },
    ];
    onChange({ ...content, project_units: newUnits });
  };

  const updateProjectRule = (unitIdx: number, ruleIdx: number, field: string, value: string) => {
    const newUnits = [...projectUnits];
    const rules = newUnits[unitIdx].rules || [];
    rules[ruleIdx] = { ...rules[ruleIdx], [field]: value };
    newUnits[unitIdx].rules = rules;
    onChange({ ...content, project_units: newUnits });
  };

  const removeProjectRule = (unitIdx: number, ruleIdx: number) => {
    const newUnits = [...projectUnits];
    newUnits[unitIdx].rules = (newUnits[unitIdx].rules || []).filter((_: any, i: number) => i !== ruleIdx);
    onChange({ ...content, project_units: newUnits });
  };

  return (
    <div className="space-y-4">
      {/* ── Mode toggle ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content Type</span>
        <div className="flex rounded-lg border bg-muted/40 p-0.5 text-sm gap-0.5">
          {([
            { mode: 'theory' as const, label: 'Theory', Icon: BookText, active: !isPractical && !isProject },
            { mode: 'practical' as const, label: 'Practical', Icon: FlaskConical, active: isPractical },
            { mode: 'project' as const, label: 'Project', Icon: BookOpen, active: isProject },
          ]).map(({ mode, label, Icon, active }) => {
            const enabled = allowedModes[mode];
            return (
              <button
                key={mode}
                type="button"
                onClick={() => switchToMode(mode)}
                disabled={!enabled}
                title={enabled ? undefined : `This course type does not include a ${label} component`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium ${
                  active
                    ? 'bg-white dark:bg-card shadow-sm text-foreground'
                    : enabled
                    ? 'text-muted-foreground hover:text-foreground'
                    : 'text-muted-foreground/40 cursor-not-allowed'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
        {courseCategory ? (
          <span className="text-[11px] text-muted-foreground">
            {courseCode ? <span className="font-mono">{courseCode}</span> : null} · {courseCategory}
          </span>
        ) : null}
        {/* Unlock the tabs the course category disables — for a practical course
            whose approved syllabus is written unit-wise (and vice versa). The
            export follows whatever shape ends up populated. */}
        {(categoryRestricts || allowAnyMode) && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <Checkbox
              checked={allowAnyMode}
              onCheckedChange={(v) => setAllowAnyMode(v === true)}
              aria-label="Allow all content types for this course"
            />
            Written differently? Allow all content types
          </label>
        )}
      </div>

      {isProject ? (
        /* ── Project mode ────────────────────────────────────────── */
        <div className="space-y-3">
          {projectUnits.map((unit: any, unitIdx: number) => (
            <div key={unitIdx} className="rounded-xl border bg-card overflow-hidden shadow-sm">
              {/* Unit header */}
              <div className="flex items-center gap-3 bg-primary/5 dark:bg-primary/10 border-b px-4 py-3">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Unit</span>
                  <span className="inline-flex h-7 min-w-[2.5rem] items-center justify-center px-1 text-base font-bold text-primary tabular-nums">
                    {unit.unit_id || toRoman(unitIdx + 1)}
                  </span>
                </div>
                <div className="h-5 w-px bg-primary/20" />
                <Input
                  placeholder="Unit Title (e.g., Timeline & Submission)"
                  value={unit.unit_title}
                  onChange={(e) => updateProjectUnit(unitIdx, 'unit_title', e.target.value)}
                  className="h-7 flex-1 border-0 bg-transparent px-0 text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  onClick={() => removeProjectUnit(unitIdx)}
                  className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Remove unit"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Rules */}
              <div className="px-4 py-3 space-y-2">
                {unit.rules?.map((rule: any, ruleIdx: number) => (
                  <div key={ruleIdx} className="space-y-2 p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit of Experiment</span>
                      <Input
                        placeholder="e.g., Project Assignment & Submission"
                        value={rule.unit_of_experiment || ''}
                        onChange={(e) => updateProjectRule(unitIdx, ruleIdx, 'unit_of_experiment', e.target.value)}
                        className="flex-1 h-8 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeProjectRule(unitIdx, ruleIdx)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Remove rule"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Textarea
                      placeholder="Rule content/guideline (the paragraph from the PDF)"
                      value={rule.content || ''}
                      onChange={(e) => updateProjectRule(unitIdx, ruleIdx, 'content', e.target.value)}
                      rows={3}
                      className="text-sm bg-transparent border-muted resize-none"
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addProjectRule(unitIdx)}
                  className="flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors mt-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Rule
                </button>
              </div>

              {/* Remarks */}
              <div className="px-4 pb-4">
                <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Remarks</span>
                  </div>
                  <Textarea
                    placeholder="Additional notes or remarks for this unit"
                    value={unit.remarks || ''}
                    onChange={(e) => updateProjectUnit(unitIdx, 'remarks', e.target.value)}
                    rows={2}
                    className="text-xs bg-transparent border-muted resize-none"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addProjectUnit}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Unit
          </button>

          {/* Instructions */}
          <div className="px-4 py-3 space-y-2">
            <Textarea
              placeholder="General instructions or guidelines for the project work"
              value={content.instruction || ''}
              onChange={(e) => onChange({ ...content, instruction: e.target.value })}
              rows={3}
              className="text-sm bg-transparent border-muted resize-none"
            />
          </div>
        </div>
      ) : isPractical ? (
        /* ── Practical mode ──────────────────────────────────────── */
        <div className="space-y-2">
          {/* PDF numbering toggle — when checked (default), the exported
              "List of Experiments" prints the inline number ("1. Zener diode
              …") on each experiment; unchecking drops the prefix (the S.No
              column still numbers the rows). Stored on course_content so the
              PDF/DOCX/HTML exporters can read it. */}
          <label className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary"
              checked={content?.number_practical_topics !== false}
              onChange={(e) =>
                onChange({ ...content, number_practical_topics: e.target.checked })
              }
            />
            Number experiments in PDF (print “1.”, “2.” … before each experiment)
          </label>
          {topics.map((topic, idx) => (
            <div key={idx} className="flex items-start gap-2.5 group">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {topic.number}
              </span>
              <div className="flex-1 space-y-1">
                <MathInput
                  placeholder="Topic heading (e.g. MAJOR PRACTICALS)"
                  value={topic.title}
                  onChange={(v) => updateTopic(idx, v)}
                  className="text-sm"
                />

                {/* Sub-topics — mirror of theory-mode subtopic block */}
                {(topic.subtopics?.length ?? 0) > 0 && (
                  <div className="mt-2 ml-3 space-y-1.5 border-l-2 border-muted pl-3">
                    {topic.subtopics!.map((st, stIdx) => (
                      <div key={stIdx} className="flex items-start gap-2 group/sub">
                        <span className="mt-1.5 shrink-0 text-[10px] font-semibold text-muted-foreground tabular-nums">
                          {topic.number}.{st.number}
                        </span>
                        <MathInput
                          placeholder="Sub-topic title"
                          value={st.title}
                          onChange={(v) => updatePracticalSubtopic(idx, stIdx, v)}
                          className="flex-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removePracticalSubtopic(idx, stIdx)}
                          className="mt-1 rounded p-0.5 text-muted-foreground opacity-0 group-hover/sub:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                          title="Remove sub-topic"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => addPracticalSubtopic(idx)}
                  className="mt-1 inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add Sub-topic
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeTopic(idx)}
                className="mt-2 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                title="Remove topic"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addTopic}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Topic
          </button>
        </div>
      ) : (
        /* ── Theory mode ─────────────────────────────────────────── */
        <div className="space-y-3">
          {units.map((unit: any, unitIdx: number) => (
            <div key={unitIdx} className="rounded-xl border bg-card overflow-hidden shadow-sm">
              {/* Unit header — unit_id is auto-generated (I, II, III …) and read-only. */}
              <div className="flex items-center gap-3 bg-primary/5 dark:bg-primary/10 border-b px-4 py-3">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Unit</span>
                  <span
                    className="inline-flex h-7 min-w-[2.5rem] items-center justify-center px-1 text-base font-bold text-primary tabular-nums"
                    aria-label={`Unit ${unit.unit_id || toRoman(unitIdx + 1)}`}
                  >
                    {unit.unit_id || toRoman(unitIdx + 1)}
                  </span>
                </div>
                <div className="h-5 w-px bg-primary/20" />
                <Input
                  placeholder="Unit Title"
                  value={unit.unit_title}
                  onChange={(e) => updateUnit(unitIdx, 'unit_title', e.target.value)}
                  className="h-7 flex-1 border-0 bg-transparent px-0 text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
                />
                {/* Hours (e.g. "9 + 3") — optional, not required for any unit. */}
                <Input
                  placeholder="Hours"
                  value={unit.hours || ''}
                  onChange={(e) => updateUnit(unitIdx, 'hours', e.target.value)}
                  title="Hours (optional, e.g. 9 + 3)"
                  className="h-7 w-20 shrink-0 rounded-md border bg-background px-2 text-center text-sm font-semibold tabular-nums placeholder:font-normal placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  onClick={() => removeUnit(unitIdx)}
                  className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Remove unit"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Topics */}
              <div className="px-4 py-3 space-y-2">
                {unit.chapters?.map((ch: any, chIdx: number) => (
                  <div key={chIdx} className="flex items-start gap-2.5 group">
                    <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                      {ch.chapter_number}
                    </span>
                    <div className="flex-1 space-y-1">
                      <MathInput
                        placeholder="Topic title"
                        value={ch.title}
                        onChange={(v) => {
                          const newChapters = [...unit.chapters];
                          newChapters[chIdx].title = v;
                          updateUnit(unitIdx, 'chapters', newChapters);
                        }}
                        className="text-sm"
                      />
                      <Input
                        placeholder="Sections (e.g. 6.1, 6.2, 6.3)"
                        value={ch.sections || ''}
                        onChange={(e) => {
                          const newChapters = [...unit.chapters];
                          newChapters[chIdx].sections = e.target.value;
                          updateUnit(unitIdx, 'chapters', newChapters);
                        }}
                        className="h-7 text-xs text-muted-foreground bg-muted/30 border-muted"
                      />

                      {/* Sub-topics */}
                      {(ch.subtopics?.length ?? 0) > 0 && (
                        <div className="mt-2 ml-3 space-y-1.5 border-l-2 border-muted pl-3">
                          {ch.subtopics.map((st: any, stIdx: number) => (
                            <div key={stIdx} className="flex items-start gap-2 group/sub">
                              <span className="mt-1.5 shrink-0 text-[10px] font-semibold text-muted-foreground tabular-nums">
                                {ch.chapter_number}.{st.number}
                              </span>
                              <MathInput
                                placeholder="Sub-topic title"
                                value={st.title}
                                onChange={(v) => updateSubtopic(unitIdx, chIdx, stIdx, v)}
                                className="flex-1 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => removeSubtopic(unitIdx, chIdx, stIdx)}
                                className="mt-1 rounded p-0.5 text-muted-foreground opacity-0 group-hover/sub:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                                title="Remove sub-topic"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => addSubtopic(unitIdx, chIdx)}
                        className="mt-1 inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Add Sub-topic
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newChapters = unit.chapters
                          .filter((_: any, i: number) => i !== chIdx)
                          .map((c: any, i: number) => ({ ...c, chapter_number: i + 1 }));
                        updateUnit(unitIdx, 'chapters', newChapters);
                      }}
                      className="mt-2 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addChapter(unitIdx)}
                  className="flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors mt-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Topic
                </button>
              </div>

              {/* Remarks */}
              <div className="px-4 pb-4">
                <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Remarks</span>
                  </div>
                  <Textarea
                    placeholder="e.g. Book 3: Chapter 6: Sections 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8"
                    value={unit.remarks || ''}
                    onChange={(e) => updateUnit(unitIdx, 'remarks', e.target.value)}
                    rows={2}
                    className="text-xs bg-transparent border-muted resize-none"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addUnit}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Unit
          </button>

          {/* Total Hours — mirrors the PDF's bottom-right "TOTAL: 30+30 PERIODS".
              Optional: a course-content total, not required to save. */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Hours</span>
            <Input
              placeholder="e.g. 30 + 30"
              value={content.total_hours || ''}
              onChange={(e) => onChange({ ...content, total_hours: e.target.value })}
              title="Total Hours (optional, e.g. 30 + 30)"
              className="h-7 w-28 shrink-0 rounded-md border bg-background px-2 text-center text-sm font-semibold tabular-nums placeholder:font-normal placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Instructions — displayed after all units */}
          <div className="px-4 py-3 space-y-2">
            <Textarea
              placeholder="e.g. Important instructions for students, teaching guidance, special notes about this course content"
              value={content.instruction || ''}
              onChange={(e) => onChange({ ...content, instruction: e.target.value })}
              rows={3}
              className="text-sm bg-transparent border-muted resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TextbooksEditor({ textbooks, onChange }: any) {
  const primary = textbooks?.primary || [];
  const references = textbooks?.references || [];

  const addPrimary = () => {
    onChange({ ...textbooks, primary: [...primary, { title: '', author: '' }] });
  };
  const updatePrimary = (idx: number, field: string, value: string) => {
    onChange({ ...textbooks, primary: primary.map((t: any, i: number) => i === idx ? { ...t, [field]: value } : t) });
  };
  const removePrimary = (idx: number) => {
    onChange({ ...textbooks, primary: primary.filter((_: any, i: number) => i !== idx) });
  };

  const addReference = () => {
    onChange({ ...textbooks, references: [...references, { title: '', author: '' }] });
  };
  const updateReference = (idx: number, field: string, value: string) => {
    onChange({ ...textbooks, references: references.map((r: any, i: number) => i === idx ? { ...r, [field]: value } : r) });
  };
  const removeReference = (idx: number) => {
    onChange({ ...textbooks, references: references.filter((_: any, i: number) => i !== idx) });
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Textbooks</h4>
        <div className="space-y-2">
          {primary.map((book: any, idx: number) => (
            <div key={idx} className="flex gap-2">
              <Input
                placeholder="Title"
                value={book.title}
                onChange={(e) => updatePrimary(idx, 'title', e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Author"
                value={book.author}
                onChange={(e) => updatePrimary(idx, 'author', e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => removePrimary(idx)}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addPrimary} className="w-full">
            + Add Textbook
          </Button>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Reference Books</h4>
        <div className="space-y-2">
          {references.map((book: any, idx: number) => (
            <div key={idx} className="flex gap-2">
              <Input
                placeholder="Title"
                value={book.title}
                onChange={(e) => updateReference(idx, 'title', e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Author"
                value={book.author}
                onChange={(e) => updateReference(idx, 'author', e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => removeReference(idx)}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addReference} className="w-full">
            + Add Reference Book
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResourcesEditor({ resources, onChange }: any) {
  const list = resources?.resources || [];
  const addResource = () => {
    onChange({
      ...resources,
      resources: [...list, { title: '', url: '' }],
    });
  };
  const updateResource = (idx: number, field: string, value: string) => {
    onChange({
      ...resources,
      resources: list.map((r: any, i: number) =>
        i === idx ? { ...r, [field]: value } : r
      ),
    });
  };

  return (
    <div className="space-y-2">
      {list.map((res: any, idx: number) => (
        <div key={idx} className="flex gap-2">
          <Input
            placeholder="Title"
            value={res.title}
            onChange={(e) => updateResource(idx, 'title', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="URL"
            value={res.url}
            onChange={(e) => updateResource(idx, 'url', e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({
              ...resources,
              resources: list.filter((_: any, i: number) => i !== idx),
            })}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addResource} className="w-full">
        + Add Resource
      </Button>
    </div>
  );
}

const PEDAGOGY_COMMON = [
  'Chalk and talk',
  'PowerPoint presentation',
  'E-content / Digital learning',
  'Group discussion',
  'Case study',
  'Problem-based learning (PBL)',
  'Project-based learning',
  'Simulation',
];

const PEDAGOGY_ADDITIONAL = [
  'Seminar presentation',
  'Tutorial method',
  'Brainstorming sessions',
  'Role play',
  'Experiential learning',
  'Collaborative learning',
  'Peer learning / Peer teaching',
  'Flipped classroom',
  'Inquiry-based learning',
  'Activity-based learning',
  'Demonstration method',
  'Workshop method',
  'Field visit / Industrial visit',
  'Laboratory experiments',
  'Quiz and gamification',
  'Team-based learning',
  'Concept mapping',
  'Think–Pair–Share',
  'Debate method',
  'Blended learning',
  'Self-directed learning',
  'MOOC / Online learning integration',
  'Interactive whiteboard teaching',
  'Storytelling method',
  'Reflective learning',
  'Design thinking approach',
  'Hands-on training',
  'Competency-based learning',
  'Microlearning',
  'Mentoring and coaching sessions',
];

function PedagogyEditor({ methods, onChange }: any) {
  const list: string[] = methods?.methods || [];
  const [customInput, setCustomInput] = useState('');

  const allPredefined = [...PEDAGOGY_COMMON, ...PEDAGOGY_ADDITIONAL];
  const customMethods = list.filter((m: string) => !allPredefined.includes(m));

  const toggle = (method: string) => {
    const next = list.includes(method)
      ? list.filter((m: string) => m !== method)
      : [...list, method];
    onChange({ ...methods, methods: next });
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed || list.includes(trimmed)) return;
    onChange({ ...methods, methods: [...list, trimmed] });
    setCustomInput('');
  };

  const MethodChip = ({ method }: { method: string }) => {
    const active = list.includes(method);
    return (
      <button
        type="button"
        onClick={() => toggle(method)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
          active
            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
            : 'border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground'
        }`}
      >
        {active && <Check className="h-3 w-3 shrink-0" />}
        {method}
      </button>
    );
  };

  const SectionDivider = ({ label }: { label: string }) => (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Selection summary */}
      {list.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shrink-0">
            {list.length}
          </span>
          <span className="text-xs text-muted-foreground flex-1">
            {list.length === 1 ? '1 method selected' : `${list.length} methods selected`}
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...methods, methods: [] })}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Common Methods */}
      <div>
        <SectionDivider label="Common Methods" />
        <div className="flex flex-wrap gap-2">
          {PEDAGOGY_COMMON.map((m) => <MethodChip key={m} method={m} />)}
        </div>
      </div>

      {/* Additional Methods */}
      <div>
        <SectionDivider label="Additional Methods" />
        <div className="flex flex-wrap gap-2">
          {PEDAGOGY_ADDITIONAL.map((m) => <MethodChip key={m} method={m} />)}
        </div>
      </div>

      {/* Custom methods (user-added) */}
      {customMethods.length > 0 && (
        <div>
          <SectionDivider label="Custom" />
          <div className="flex flex-wrap gap-2">
            {customMethods.map((m: string) => <MethodChip key={m} method={m} />)}
          </div>
        </div>
      )}

      {/* Add custom method */}
      <div className="flex gap-2 pt-1">
        <Input
          placeholder="Add a custom teaching method…"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          className="text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCustom}
          disabled={!customInput.trim() || list.includes(customInput.trim())}
          className="shrink-0"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

// Stored values stay 'L'/'M'/'H' (JSONB + exports depend on them); only the
// DISPLAYED label varies by institution type:
//   • Engineering (non-CAS, e.g. CET) → numeric 1/2/3  (ALIGNMENT_LEVELS.label)
//   • CAS (Arts & Science, Aided+SF pair) → letters L/M/H (the value itself)
// The `label` field below is the engineering/numeric form; labelFor() in the
// editor picks numeric vs letters using scope.isCAS.
const ALIGNMENT_LEVELS = [
  { value: '' as const,  label: '-', bg: 'bg-gray-50',     text: 'text-gray-400',   desc: 'No Correlation' },
  { value: 'L' as const, label: '1', bg: 'bg-yellow-100',  text: 'text-yellow-700', desc: 'Low' },
  { value: 'M' as const, label: '2', bg: 'bg-orange-100',  text: 'text-orange-700', desc: 'Medium' },
  { value: 'H' as const, label: '3', bg: 'bg-green-100',   text: 'text-green-700',  desc: 'High' },
] as const;
type AlignmentLevel = '' | 'L' | 'M' | 'H';

// Canonicalize a stored correlation value to 'L'/'M'/'H'. Records may hold
// EITHER letters ('H'/'M'/'L') or numeric strings ('3'/'2'/'1') depending on
// how they were created — the docx importer writes numbers straight from
// engineering curriculum PDFs, while the editor writes letters. Without this,
// a numerically-stored mapping renders as an all-"–" (no correlation) table.
const normalizeLevel = (v: unknown): AlignmentLevel => {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'H' || s === '3') return 'H';
  if (s === 'M' || s === '2') return 'M';
  if (s === 'L' || s === '1') return 'L';
  return '';
};

interface PoMappingsEditorProps {
  mappings: BosPOMappingsData | undefined;
  regulationId: string;
  institutionsIds: string;
  boardId: string;
  /**
   * The selected board's programme code (= its board_code in this system). When
   * provided, the editor lists ONLY this programme instead of every programme
   * that has POs — scopes PO/PSO to the chosen board.
   */
  boardProgrammeCode?: string;
  courseOutcomes: BosCourseLearnOutcome[];
  onChange: (val: BosPOMappingsData) => void;
}

function PoMappingsEditor({ mappings, regulationId, institutionsIds, boardId, boardProgrammeCode, courseOutcomes, onChange }: PoMappingsEditorProps) {
  const [programmes, setProgrammes] = useState<BosBoardProgramme[]>([]);
  const [selectedProgramme, setSelectedProgramme] = useState('');
  const [pos, setPos] = useState<BosProgrammeOutcome[]>([]);
  const [psos, setPsos] = useState<BosProgrammeSpecificOutcome[]>([]);
  const [loadingPos, setLoadingPos] = useState(false);

  // Expand institution_id to full CAS pair (Aided + Self) if needed
  const scope = useBosInstitutionScope(institutionsIds || null);
  const resolvedInstitutionsIds = scope.csv;

  // Derive the CO→outcome→level matrix directly from the mappings prop.
  // No separate matrix state — avoids stale state when parent re-renders.
  const matrix = useMemo<Record<string, Record<string, AlignmentLevel>>>(() => {
    const m: Record<string, Record<string, AlignmentLevel>> = {};
    for (const mapping of (mappings?.mappings ?? [])) {
      m[mapping.co_id] = {
        ...Object.fromEntries(Object.entries(mapping.pos  ?? {}).map(([k, v]) => [k, normalizeLevel(v)])),
        ...Object.fromEntries(Object.entries(mapping.psos ?? {}).map(([k, v]) => [k, normalizeLevel(v)])),
      };
    }
    return m;
  }, [mappings]);

  // Fetch programmes for the board.
  // Fallback: if the board has no entries in bos_board_programmes, query
  // bos_programme_outcomes directly for any programme that already has POs
  // configured — avoids a dead end when board-programme assignment is missing.
  useEffect(() => {
    if (!boardId) { setProgrammes([]); setSelectedProgramme(''); return; }
    // Board-scoped: when the caller knows the board's programme code (its
    // board_code), list ONLY that programme — not every programme with POs.
    if (boardProgrammeCode) {
      const code = boardProgrammeCode.toUpperCase();
      setProgrammes([{
        id: code, board_id: boardId, institutions_id: '',
        programme_code: code, programme_name: code,
        is_active: true, created_at: '', updated_at: '',
      }]);
      setSelectedProgramme(code);
      return;
    }
    fetch(`/api/bos/boards/${boardId}/programmes`)
      .then(r => r.json())
      .then(({ data }) => {
        const progs: BosBoardProgramme[] = data ?? [];
        if (progs.length > 0) {
          setProgrammes(progs);
          setSelectedProgramme(progs.length === 1 ? progs[0].programme_code : '');
          return;
        }
        // Board has no programme rows — fall back to programmes with POs defined
        if (!regulationId) { setProgrammes([]); setSelectedProgramme(''); return; }
        return fetch(`/api/bos/taxonomy/${regulationId}/po-programmes`)
          .then(r => r.json())
          .then(({ data: poCodes }) => {
            const fallback: BosBoardProgramme[] = (poCodes ?? []).map(
              (p: { programme_code: string }) => ({
                id: p.programme_code,
                board_id: boardId,
                institutions_id: '',
                programme_code: p.programme_code,
                programme_name: p.programme_code,
                is_active: true,
                created_at: '',
                updated_at: '',
              })
            );
            setProgrammes(fallback);
            setSelectedProgramme(fallback.length === 1 ? fallback[0].programme_code : '');
          });
      })
      .catch(() => { setProgrammes([]); setSelectedProgramme(''); });
  }, [boardId, regulationId, boardProgrammeCode]);

  // Fetch POs + PSOs for the selected programme
  useEffect(() => {
    if (!regulationId || !selectedProgramme) { setPos([]); setPsos([]); return; }
    // Don't fetch until institution scope is resolved (csv is null while loading)
    if (scope.isLoading) return;
    setLoadingPos(true);
    const qs = resolvedInstitutionsIds ? `?institutionsIds=${encodeURIComponent(resolvedInstitutionsIds)}` : '';
    Promise.all([
      fetch(`/api/bos/taxonomy/${regulationId}/programmes/${selectedProgramme}/pos${qs}`).then(r => r.json()),
      fetch(`/api/bos/taxonomy/${regulationId}/programmes/${selectedProgramme}/psos${qs}`).then(r => r.json()),
    ])
      .then(([posRes, psosRes]) => { setPos(posRes.data ?? []); setPsos(psosRes.data ?? []); })
      .catch(() => { setPos([]); setPsos([]); })
      .finally(() => setLoadingPos(false));
  }, [regulationId, selectedProgramme, resolvedInstitutionsIds, scope.isLoading]);

  const handleCellClick = (coCode: string, outcomeCode: string) => {
    const current: AlignmentLevel = matrix[coCode]?.[outcomeCode] ?? '';
    const idx = ALIGNMENT_LEVELS.findIndex(l => l.value === current);
    const next = ALIGNMENT_LEVELS[(idx + 1) % ALIGNMENT_LEVELS.length].value;

    const updatedMatrix = {
      ...matrix,
      [coCode]: { ...matrix[coCode], [outcomeCode]: next },
    };

    const newMappings: BosPoMapping[] = courseOutcomes.map(clo => {
      const key = `CO${clo.clo_number}`;
      const cell = updatedMatrix[key] ?? {};
      const poEntries  = Object.fromEntries(pos.filter(p => cell[p.po_code]).map(p => [p.po_code,  serializeLevel(cell[p.po_code])])) as Record<string, 'H' | 'M' | 'L'>;
      const psoEntries = Object.fromEntries(psos.filter(p => cell[p.pso_code]).map(p => [p.pso_code, serializeLevel(cell[p.pso_code])])) as Record<string, 'H' | 'M' | 'L'>;
      return { co_id: key, pos: poEntries, psos: psoEntries };
    });

    onChange({ mappings: newMappings });
  };

  const getCellLevel = (coCode: string, outcomeCode: string): AlignmentLevel =>
    (matrix[coCode]?.[outcomeCode] as AlignmentLevel) ?? '';

  // Display label per institution type. CAS colleges (Aided+SF pair → isCAS)
  // notate correlation as L/M/H; engineering (single-row, e.g. CET) as 1/2/3.
  const labelFor = (level: typeof ALIGNMENT_LEVELS[number]): string =>
    level.value === '' ? level.label : scope.isCAS ? level.value : level.label;

  // Persist in the institution's own notation so the raw-printing PDF/DOCX
  // exporters stay correct: CAS stores letters (L/M/H), engineering stores
  // numbers (1/2/3). Reads are tolerant of both via normalizeLevel().
  const serializeLevel = (level: AlignmentLevel): string =>
    level === '' ? '' : scope.isCAS ? level : { L: '1', M: '2', H: '3' }[level];

  if (!boardId || !regulationId) {
    return <p className="text-sm text-muted-foreground">Select a board and regulation to load programme outcomes.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Programme selector — only shown when the board covers multiple programmes */}
      {programmes.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium whitespace-nowrap">Programme</span>
          <SearchableSelect
            options={programmes.map(p => ({
              value: p.programme_code,
              label: `${p.programme_code}${p.programme_name ? ` – ${p.programme_name}` : ''}`,
            }))}
            value={selectedProgramme}
            onValueChange={setSelectedProgramme}
            placeholder="Select programme…"
            className="w-64"
          />
        </div>
      )}

      {!selectedProgramme ? (
        <p className="text-sm text-muted-foreground">
          {programmes.length === 0
            ? 'No programme outcomes configured for this regulation yet. Add them in the Taxonomy section.'
            : 'Select a programme to view its outcomes.'}
        </p>
      ) : loadingPos ? (
        <p className="text-sm text-muted-foreground">Loading outcomes…</p>
      ) : pos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No programme outcomes defined for {selectedProgramme}. Add them in the Taxonomy section.
        </p>
      ) : courseOutcomes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No course outcomes defined. Add them in the Course Outcomes tab first.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b border-r p-2 text-left font-medium min-w-[200px] text-xs">Course Outcome</th>
                  {pos.map(po => (
                    <th
                      key={po.id}
                      className="border-b border-r p-2 text-center font-medium min-w-[56px] text-xs"
                      title={po.description ?? ''}
                    >
                      {po.po_code}
                    </th>
                  ))}
                  {psos.map(pso => (
                    <th
                      key={pso.id}
                      className="border-b border-r p-2 text-center font-medium min-w-[56px] text-xs bg-blue-50"
                      title={pso.description ?? ''}
                    >
                      {pso.pso_code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courseOutcomes.map(clo => {
                  const coCode = `CO${clo.clo_number}`;
                  return (
                    <tr key={coCode} className="hover:bg-gray-50/50">
                      <td className="border-b border-r p-2 min-w-[200px]">
                        <div className="font-semibold text-xs">{coCode}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{clo.description}</div>
                      </td>
                      {pos.map(po => {
                        const level = getCellLevel(coCode, po.po_code);
                        const style = ALIGNMENT_LEVELS.find(l => l.value === level) ?? ALIGNMENT_LEVELS[0];
                        return (
                          <td
                            key={po.id}
                            className={`border-b border-r p-1 text-center cursor-pointer select-none hover:opacity-75 transition-opacity ${style.bg}`}
                            onClick={() => handleCellClick(coCode, po.po_code)}
                            title={`${coCode} → ${po.po_code}: ${style.desc}`}
                          >
                            <span className={`text-xs font-bold ${style.text}`}>{labelFor(style)}</span>
                          </td>
                        );
                      })}
                      {psos.map(pso => {
                        const level = getCellLevel(coCode, pso.pso_code);
                        const style = ALIGNMENT_LEVELS.find(l => l.value === level) ?? ALIGNMENT_LEVELS[0];
                        return (
                          <td
                            key={pso.id}
                            className={`border-b border-r p-1 text-center cursor-pointer select-none hover:opacity-75 transition-opacity ${style.bg}`}
                            onClick={() => handleCellClick(coCode, pso.pso_code)}
                            title={`${coCode} → ${pso.pso_code}: ${style.desc}`}
                          >
                            <span className={`text-xs font-bold ${style.text}`}>{labelFor(style)}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 pt-2 border-t">
            {ALIGNMENT_LEVELS.map(level => (
              <div key={level.value || 'none'} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded border flex items-center justify-center ${level.bg}`}>
                  <span className={`text-xs font-bold ${level.text}`}>{labelFor(level)}</span>
                </div>
                <span className="text-xs text-muted-foreground">{level.desc}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}