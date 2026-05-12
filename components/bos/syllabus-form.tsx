'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
} from '@/types/bos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { X, Trash2, BookOpen, Plus, FlaskConical, BookText, Check } from 'lucide-react';

interface Institution { id: string; name: string; myjkkn_institution_ids: string[]; display_name?: string; }
interface Regulation { id: string; title: string; regulation_code: string; regulation_year?: string; }

const DEFAULT_K_VALUES: Record<string, string> = {
  K1: 'Remember',
  K2: 'Understand',
  K3: 'Apply',
  K4: 'Analyze',
  K5: 'Evaluate',
  K6: 'Create',
};

interface SyllabusFormProps {
  syllabusId?: string;
  syllabus?: BosCourseSyllabus;
  isEditing?: boolean;
  onSuccess?: (syllabus: BosCourseSyllabus) => void;
}

export function SyllabusForm({
  syllabusId,
  syllabus: syllabusProp,
  isEditing: isEditingProp = false,
  onSuccess,
}: SyllabusFormProps) {
  // If the caller already loaded the syllabus (edit page), skip the fetch.
  const { data: fetchedSyllabus } = useBosSyllabus(syllabusProp ? undefined : syllabusId);
  const existingSyllabus = syllabusProp ?? fetchedSyllabus;
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

  const [formData, setFormData] = useState<Partial<BosCourseSyllabus>>(
    existingSyllabus || {
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
    }
  );

  // Initialize with passed ID, or fall back to syllabusProp.id (edit page passes syllabus but not syllabusId)
  const [currentUpdateId, setCurrentUpdateId] = useState<string>(syllabusId || syllabusProp?.id || '');
  const updateMutation = useUpdateBosSyllabus(currentUpdateId);

  // Seed composition picker when an existing syllabus is passed directly as prop.
  useEffect(() => {
    if (syllabusProp?.composition_id) setSelectedCompositionId(syllabusProp.composition_id);
  }, [syllabusProp?.composition_id]);

  const { data: taxonomy } = useBosTaxonomy(formData.regulation_id || '', formData.institutions_id || undefined);

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

  const { data: coursesData, isLoading: coursesLoading } = useBosCourses(
    formData.institutions_id && regulation_code
      ? { institution_id: formData.institutions_id, regulation_code, limit: 200, is_active: 'true' }
      : undefined,
  );
  const courseOptions = coursesData?.data ?? [];

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
    }
  };

  // Populate form when the syllabus loads via hook (edit-by-id path)
  useEffect(() => {
    if (fetchedSyllabus && !syllabusProp) {
      setFormData(fetchedSyllabus);
      setCurrentUpdateId(fetchedSyllabus.id);
      if (fetchedSyllabus.composition_id) setSelectedCompositionId(fetchedSyllabus.composition_id);
    }
  }, [fetchedSyllabus, syllabusProp]);

  // Auto-seed institution for regular users on new-form path
  useEffect(() => {
    if (isSuperAdmin || isEditingProp || syllabusProp || !institutionCtx) return;
    setFormData((prev) => ({
      ...prev,
      institutions_id: prev.institutions_id || institutionCtx.myjkkn_id,
    }));
  }, [isSuperAdmin, isEditingProp, syllabusProp, institutionCtx]);

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
  // Super-admin: pass all CAS sibling UUIDs via institutionIds= to avoid missing records.
  // Non-admin: server uses resolveBosAccess scope automatically (no params needed).
  useEffect(() => {
    const fetchCompositions = async () => {
      try {
        const url = new URL('/api/bos/compositions', window.location.origin);
        if (isSuperAdmin) {
          const instOption = institutions.find((i) => i.id === formData.institutions_id);
          const ids = instOption?.myjkkn_institution_ids ?? (formData.institutions_id ? [formData.institutions_id] : []);
          if (ids.length > 1) url.searchParams.set('institutionIds', ids.join(','));
          else if (ids.length === 1) url.searchParams.set('institutionsId', ids[0]);
        } else if (institutionCtx?.myjkkn_institution_ids && institutionCtx.myjkkn_institution_ids.length > 1) {
          // CAS non-admin: pass COE-authoritative sibling IDs so the server doesn't
          // miss compositions stored under the other institution UUID (Aided vs Self).
          url.searchParams.set('institutionIds', institutionCtx.myjkkn_institution_ids.join(','));
        }
        // In edit mode fetch all compositions (including inactive) so the linked
        // one is always visible in the dropdown regardless of its current status.
        if (!isEditingProp) {
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
    // In edit mode the composition is pre-seeded from the loaded syllabus — don't clear it.
    if (!isEditingProp) {
      setSelectedCompositionId('');
      setMeetings([]);
    }
  // institutionCtx is async — it may resolve after institutions_id is already set,
  // so both must be deps to trigger the single fetch once ctx is ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.institutions_id, institutionCtx]);

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

  // Fetch regulations filtered by institution
  useEffect(() => {
    const fetchRegulations = async () => {
      try {
        const url = new URL('/api/bos/regulations', window.location.origin);
        if (formData.institutions_id) {
          url.searchParams.set('institutionId', formData.institutions_id);
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

    fetchRegulations();
  }, [formData.institutions_id]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isEditing && currentSyllabusId) {
        const result = await updateMutation.mutateAsync(formData as UpdateBosSyllabusDto);
        onSuccess?.(result);
      } else {
        const result = await createMutation.mutateAsync(formData as CreateBosSyllabusDto);
        onSuccess?.(result);
      }
    } catch (error) {
      console.error('Failed to save syllabus:', error);
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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="objectives">Objectives</TabsTrigger>
          <TabsTrigger value="clo">Course Outcomes</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="pedagogy">Pedagogy</TabsTrigger>
          <TabsTrigger value="mappings">PO Mappings</TabsTrigger>
        </TabsList>

        {/* Basic Information */}
        <TabsContent value="basic" className="space-y-4">
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
                    disabled={!formData.institutions_id}
                    className='w-full'
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Board</label>
                  <Input
                    value={
                      boards.find(b => b.id === formData.board_id)?.board_name ||
                      compositions.find(c => c.id === formData.composition_id)?.board?.board_name ||
                      ''
                    }
                    disabled
                    placeholder="Auto-filled from composition"
                    className="bg-muted/50"
                  />
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
                    options={courseOptions.map((c) => ({
                      value: c.course_code,
                      label: `${c.course_code} — ${c.course_name || c.course_title || ''}`,
                    }))}
                    placeholder={formData.institutions_id && regulation_code ? 'Select course' : 'Select institution & regulation first'}
                    searchPlaceholder='Search by code or name…'
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
                <Button
                  type="button"
                  onClick={() => handleSaveAndNext('objectives')}
                  disabled={!formData.course_code || !formData.course_name || !formData.institutions_id || !formData.regulation_id || !formData.composition_id || !formData.board_id || !!courseCodeError || isLoading}
                  title={!formData.composition_id ? 'Select a meeting first' : undefined}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? 'Saving...' : 'Save & Next'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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
          <Card>
            <CardHeader>
              <CardTitle>Course Content</CardTitle>
              <CardDescription>Units and topics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ContentEditor
                content={formData.course_content as any}
                onChange={(val) => updateField('course_content', val)}
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
                boardId={formData.board_id || ''}
                courseOutcomes={((formData.course_learning_outcomes as any)?.clos ?? []) as BosCourseLearnOutcome[]}
                onChange={(val) => updateField('po_mappings', val)}
              />
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab('pedagogy')}>
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? 'Saving...' : isEditing ? 'Update Syllabus' : 'Create Syllabus'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {(createMutation.error || updateMutation.error) && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            {(createMutation.error || updateMutation.error)?.message || 'An error occurred'}
          </AlertDescription>
        </Alert>
      )}
    </form>
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

function ContentEditor({ content, onChange }: any) {
  const isPractical = !!content?.is_practical;
  const units = content?.units || [];
  const topics: { number: number; title: string }[] = content?.topics || [];

  // Migrate legacy single-letter unit IDs (A, B, C…) to Roman numerals (I, II, III…).
  // Safe to re-run: Roman numerals don't match /^[A-Z]$/ so the effect is a no-op
  // after the first conversion.
  useEffect(() => {
    if (!units.length) return;
    const hasLegacyIds = units.some((u: any) => /^[A-Z]$/.test(u.unit_id));
    if (!hasLegacyIds) return;
    onChange({
      ...content,
      units: units.map((u: any) => ({
        ...u,
        unit_id: /^[A-Z]$/.test(u.unit_id)
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

  const toggleMode = () => {
    if (!isPractical) {
      // Theory → Practical: collect all chapters from all units as flat topics
      const allChapters = units.flatMap((u: any) => u.chapters || []);
      const flatTopics = allChapters.map((ch: any, i: number) => ({
        number: i + 1,
        title: ch.title || '',
      }));
      onChange({ is_practical: true, topics: flatTopics.length > 0 ? flatTopics : [] });
    } else {
      // Practical → Theory: move topics back into a single unit
      const chapters = topics.map((t, i) => ({
        chapter_number: i + 1,
        title: t.title,
        sections: '',
      }));
      onChange({
        is_practical: false,
        units: [{ unit_id: 'A', unit_title: '', chapters }],
      });
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
      { chapter_number: (newUnits[unitIdx].chapters?.length || 0) + 1, title: '', sections: '' },
    ];
    onChange({ ...content, units: newUnits });
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

  return (
    <div className="space-y-4">
      {/* ── Mode toggle ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content Type</span>
        <div className="flex rounded-lg border bg-muted/40 p-0.5 text-sm gap-0.5">
          <button
            type="button"
            onClick={() => isPractical && toggleMode()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium ${
              !isPractical
                ? 'bg-white dark:bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookText className="h-3.5 w-3.5" />
            Theory
          </button>
          <button
            type="button"
            onClick={() => !isPractical && toggleMode()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium ${
              isPractical
                ? 'bg-white dark:bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Practical
          </button>
        </div>
      </div>

      {isPractical ? (
        /* ── Practical mode ──────────────────────────────────────── */
        <div className="space-y-2">
          {topics.map((topic, idx) => (
            <div key={idx} className="flex items-start gap-2.5">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {topic.number}
              </span>
              <MathInput
                placeholder="Topic title"
                value={topic.title}
                onChange={(v) => updateTopic(idx, v)}
                className="flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeTopic(idx)}
                className="mt-2 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
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
              {/* Unit header */}
              <div className="flex items-center gap-3 bg-primary/5 dark:bg-primary/10 border-b px-4 py-3">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Unit</span>
                  <Input
                    value={unit.unit_id}
                    onChange={(e) => updateUnit(unitIdx, 'unit_id', e.target.value)}
                    maxLength={6}
                    className="h-7 w-14 border-0 bg-transparent p-0 text-center text-base font-bold text-primary focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <div className="h-5 w-px bg-primary/20" />
                <Input
                  placeholder="Unit Title"
                  value={unit.unit_title}
                  onChange={(e) => updateUnit(unitIdx, 'unit_title', e.target.value)}
                  className="h-7 flex-1 border-0 bg-transparent px-0 text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
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

const ALIGNMENT_LEVELS = [
  { value: '' as const,  label: '-', bg: 'bg-gray-50',     text: 'text-gray-400',   desc: 'No Mapping' },
  { value: 'L' as const, label: 'L', bg: 'bg-yellow-100',  text: 'text-yellow-700', desc: 'Low' },
  { value: 'M' as const, label: 'M', bg: 'bg-orange-100',  text: 'text-orange-700', desc: 'Medium' },
  { value: 'H' as const, label: 'H', bg: 'bg-green-100',   text: 'text-green-700',  desc: 'High' },
] as const;
type AlignmentLevel = '' | 'L' | 'M' | 'H';

interface PoMappingsEditorProps {
  mappings: BosPOMappingsData | undefined;
  regulationId: string;
  boardId: string;
  courseOutcomes: BosCourseLearnOutcome[];
  onChange: (val: BosPOMappingsData) => void;
}

function PoMappingsEditor({ mappings, regulationId, boardId, courseOutcomes, onChange }: PoMappingsEditorProps) {
  const [programmes, setProgrammes] = useState<BosBoardProgramme[]>([]);
  const [selectedProgramme, setSelectedProgramme] = useState('');
  const [pos, setPos] = useState<BosProgrammeOutcome[]>([]);
  const [psos, setPsos] = useState<BosProgrammeSpecificOutcome[]>([]);
  const [loadingPos, setLoadingPos] = useState(false);

  // Derive the CO→outcome→level matrix directly from the mappings prop.
  // No separate matrix state — avoids stale state when parent re-renders.
  const matrix = useMemo<Record<string, Record<string, AlignmentLevel>>>(() => {
    const m: Record<string, Record<string, AlignmentLevel>> = {};
    for (const mapping of (mappings?.mappings ?? [])) {
      m[mapping.co_id] = {
        ...Object.fromEntries(Object.entries(mapping.pos  ?? {}).map(([k, v]) => [k, v as AlignmentLevel])),
        ...Object.fromEntries(Object.entries(mapping.psos ?? {}).map(([k, v]) => [k, v as AlignmentLevel])),
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
  }, [boardId, regulationId]);

  // Fetch POs + PSOs for the selected programme
  useEffect(() => {
    if (!regulationId || !selectedProgramme) { setPos([]); setPsos([]); return; }
    setLoadingPos(true);
    Promise.all([
      fetch(`/api/bos/taxonomy/${regulationId}/programmes/${selectedProgramme}/pos`).then(r => r.json()),
      fetch(`/api/bos/taxonomy/${regulationId}/programmes/${selectedProgramme}/psos`).then(r => r.json()),
    ])
      .then(([posRes, psosRes]) => { setPos(posRes.data ?? []); setPsos(psosRes.data ?? []); })
      .catch(() => { setPos([]); setPsos([]); })
      .finally(() => setLoadingPos(false));
  }, [regulationId, selectedProgramme]);

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
      const poEntries  = Object.fromEntries(pos.filter(p => cell[p.po_code]).map(p => [p.po_code,  cell[p.po_code]])) as Record<string, 'H' | 'M' | 'L'>;
      const psoEntries = Object.fromEntries(psos.filter(p => cell[p.pso_code]).map(p => [p.pso_code, cell[p.pso_code]])) as Record<string, 'H' | 'M' | 'L'>;
      return { co_id: key, pos: poEntries, psos: psoEntries };
    });

    onChange({ mappings: newMappings });
  };

  const getCellLevel = (coCode: string, outcomeCode: string): AlignmentLevel =>
    (matrix[coCode]?.[outcomeCode] as AlignmentLevel) ?? '';

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
                            <span className={`text-xs font-bold ${style.text}`}>{style.label}</span>
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
                            <span className={`text-xs font-bold ${style.text}`}>{style.label}</span>
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
                  <span className={`text-xs font-bold ${level.text}`}>{level.label}</span>
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
