'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useCreateBosSyllabus, useUpdateBosSyllabus, useBosSyllabus } from '@/hooks/bos/use-bos-syllabus';
import { useBosTaxonomy, flattenPos } from '@/hooks/bos/use-bos-taxonomy';
import { usePermissions } from '@/hooks/use-permissions';
import { BosCourseSyllabus, CreateBosSyllabusDto, UpdateBosSyllabusDto } from '@/types/bos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import { useInstitutionContext } from '@/hooks/use-institution-context';

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

  // Initialize with passed ID or empty string (will be set when we create)
  const [currentUpdateId, setCurrentUpdateId] = useState<string>(syllabusId || '');
  const updateMutation = useUpdateBosSyllabus(currentUpdateId);

  const { data: taxonomy } = useBosTaxonomy(formData.regulation_id || '');

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

  // Fetch meetings filtered by institution (with members only) for syllabus linking.
  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        const url = new URL('/api/bos/meetings', window.location.origin);
        // Use primary institution ID; server-side resolveBosAccess handles CAS scope.
        url.searchParams.set('institutionsId', formData.institutions_id!);
        url.searchParams.set('withMembers', 'true');
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

    if (formData.institutions_id) {
      fetchMeetings();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.institutions_id]);

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
          <TabsTrigger value="clo">Learning Outcomes</TabsTrigger>
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
              {/* Row 1: Institution + Composition */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Institution *</label>
                  {isSuperAdmin ? (
                    <SearchableSelect
                      value={formData.institutions_id || ''}
                      onValueChange={(val) => {
                        updateField('institutions_id', val);
                        // Clear dependent fields when institution changes
                        updateField('composition_id', '');
                        updateField('board_id', '');
                        updateField('regulation_id', '');
                        const opt = institutions.find((i) => i.id === val);
                      }}
                      options={institutions.map((inst) => ({ value: inst.id, label: inst.name }))}
                      placeholder='Select institution'
                      searchPlaceholder='Search institution…'
                      className='w-full'
                    />
                  ) : (
                    <Input
                      value={institutionCtx?.name || institutionCtx?.display_name || formData.institutions_id || ''}
                      disabled
                      className="bg-muted/50"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Meeting *</label>
                  <SearchableSelect
                    value={formData.composition_id ? meetings.find(m => m.composition_id === formData.composition_id)?.id || '' : ''}
                    onValueChange={(val) => {
                      const meeting = meetings.find(m => m.id === val);
                      if (!meeting) return;
                      updateField('composition_id', meeting.composition_id);
                      updateField('board_id', meeting.board_id);
                      if (isSuperAdmin) updateField('institutions_id', meeting.institutions_id);
                      // Auto-match regulation from composition academic year
                      const academicYear = meeting.bos_compositions?.academic_year;
                      if (academicYear) {
                        const startYear = academicYear.split('-')[0];
                        const matched = regulations.find(r => r.regulation_year === startYear);
                        if (matched) updateField('regulation_id', matched.id);
                      }
                    }}
                    options={meetings.map((m) => ({
                      value: m.id,
                      label: `${m.meeting_title}${m.bos_compositions ? ` — ${m.bos_compositions.composition_title}` : ''}`,
                    }))}
                    placeholder={formData.institutions_id ? 'Select meeting' : 'Select institution first'}
                    searchPlaceholder='Search meeting…'
                    disabled={!formData.institutions_id}
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
                    value={boards.find(b => b.id === formData.board_id)?.board_name || ''}
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
                      updateField('course_credits', course.credit);
                      updateField('total_hours', (course.theory_hours ?? 0) + (course.practical_hours ?? 0));
                      updateField('contact_hours', course.class_hours ?? 0);
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
                    onChange={(e) => updateField('course_name', e.target.value.toUpperCase())}
                    required
                    placeholder="Course name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Total Hours</label>
                  <Input
                    type="number"
                    value={formData.total_hours || ''}
                    onChange={(e) => updateField('total_hours', parseInt(e.target.value) || 0)}
                    placeholder="e.g., 60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Hours</label>
                  <Input
                    type="number"
                    value={formData.contact_hours || ''}
                    onChange={(e) => updateField('contact_hours', parseInt(e.target.value) || 0)}
                    placeholder="e.g., 45"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Credits</label>
                  <Input
                    type="number"
                    value={formData.course_credits || ''}
                    onChange={(e) => updateField('course_credits', parseInt(e.target.value) || 0)}
                    placeholder="e.g., 4"
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

        {/* Course Learning Outcomes */}
        <TabsContent value="clo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Course Learning Outcomes (CLOs)</CardTitle>
              <CardDescription>Measurable outcomes aligned with K-values</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert>
                <AlertDescription>
                  <span className='font-medium'>Taxonomy K-values: </span>
                  {Object.entries(effectiveKValues).map(([k, desc]) => (
                    <span key={k} className='mr-3 text-xs'><span className='font-mono font-semibold'>{k}</span> — {String(desc)}</span>
                  ))}
                </AlertDescription>
              </Alert>
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
              <div>
                <h3 className="text-sm font-semibold mb-2">Textbooks</h3>
                <TextbooksEditor
                  textbooks={formData.textbooks as any}
                  onChange={(val) => updateField('textbooks', val)}
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Web Resources</h3>
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
              <CardDescription>Align CLOs with Programme Outcomes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {taxonomy && (
                <PoMappingsEditor
                  mappings={formData.po_mappings as any}
                  pos={flattenPos(taxonomy.pos)}
                  psos={taxonomy.psos ? flattenPos(taxonomy.psos) : undefined}
                  onChange={(val) => updateField('po_mappings', val)}
                />
              )}
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
  const cloList = clos?.clos || [];
  const addClo = () => {
    onChange({
      ...clos,
      clos: [
        ...cloList,
        { clo_number: cloList.length + 1, description: '', k_values: [] },
      ],
    });
  };
  const updateClo = (idx: number, field: string, value: any) => {
    onChange({
      ...clos,
      clos: cloList.map((c: any, i: number) =>
        i === idx ? { ...c, [field]: value } : c
      ),
    });
  };
  const removeClo = (idx: number) => {
    onChange({
      ...clos,
      clos: cloList.filter((_: any, i: number) => i !== idx),
    });
  };

  return (
    <div className="space-y-3">
      {cloList.map((clo: any, idx: number) => (
        <Card key={idx} className="p-4">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="CLO description"
                value={clo.description}
                onChange={(e) => updateClo(idx, 'description', e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeClo(idx)}
              >
                Remove
              </Button>
            </div>
            <div>
              <label className="text-sm font-medium">K-Values</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(kValues).map(([k, desc]) => (
                  <label key={k} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clo.k_values?.includes(k) || false}
                      onChange={(e) => {
                        const newKValues = e.target.checked
                          ? [...(clo.k_values || []), k]
                          : (clo.k_values || []).filter((v: string) => v !== k);
                        updateClo(idx, 'k_values', newKValues);
                      }}
                    />
                    <span className="text-sm font-mono font-medium">{k}</span>
                    {desc && <span className="text-xs text-muted-foreground">— {String(desc)}</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ))}
      <Button type="button" variant="outline" onClick={addClo} className="w-full">
        + Add CLO
      </Button>
    </div>
  );
}

function ContentEditor({ content, onChange }: any) {
  const isPractical = !!content?.is_practical;
  const units = content?.units || [];
  const topics: { number: number; title: string }[] = content?.topics || [];

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

  const addUnit = () => {
    onChange({
      ...content,
      units: [...units, { unit_id: String.fromCharCode(65 + units.length), unit_title: '', chapters: [] }],
    });
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
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-3 pb-1 border-b">
        <span className="text-sm font-medium text-muted-foreground">Content type:</span>
        <div className="flex rounded-md border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => isPractical && toggleMode()}
            className={`px-3 py-1 transition-colors ${!isPractical ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            Theory (Units)
          </button>
          <button
            type="button"
            onClick={() => !isPractical && toggleMode()}
            className={`px-3 py-1 transition-colors ${isPractical ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            Practical (Topics only)
          </button>
        </div>
      </div>

      {isPractical ? (
        /* ── Practical mode: flat topic list ───────────────────────── */
        <div className="space-y-2">
          {topics.map((topic, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground min-w-[28px]">
                {topic.number}.
              </span>
              <Input
                placeholder="Topic title"
                value={topic.title}
                onChange={(e) => updateTopic(idx, e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeTopic(idx)}
                className="text-muted-foreground hover:text-destructive"
              >
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addTopic} className="w-full">
            + Add Topic
          </Button>
        </div>
      ) : (
        /* ── Theory mode: unit → topics hierarchy ──────────────────── */
        <>
          {units.map((unit: any, unitIdx: number) => (
            <Card key={unitIdx} className="p-4">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Unit ID (e.g. A)"
                    value={unit.unit_id}
                    onChange={(e) => updateUnit(unitIdx, 'unit_id', e.target.value)}
                    maxLength={2}
                  />
                  <Input
                    placeholder="Unit Title"
                    value={unit.unit_title}
                    onChange={(e) => updateUnit(unitIdx, 'unit_title', e.target.value)}
                  />
                </div>
                <div className="ml-4 space-y-2">
                  {unit.chapters?.map((ch: any, chIdx: number) => (
                    <div key={chIdx} className="border-l-2 pl-2 py-2">
                      <div className="text-sm font-medium text-muted-foreground">Topic {ch.chapter_number}</div>
                      <Input
                        placeholder="Topic title"
                        value={ch.title}
                        onChange={(e) => {
                          const newChapters = [...unit.chapters];
                          newChapters[chIdx].title = e.target.value;
                          updateUnit(unitIdx, 'chapters', newChapters);
                        }}
                        className="text-sm mt-1"
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addChapter(unitIdx)}
                  >
                    + Topic
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          <Button type="button" variant="outline" onClick={addUnit} className="w-full">
            + Add Unit
          </Button>
        </>
      )}
    </div>
  );
}

function TextbooksEditor({ textbooks, onChange }: any) {
  const primary = textbooks?.primary || [];
  const addTextbook = () => {
    onChange({
      ...textbooks,
      primary: [...primary, { title: '', author: '', publication_year: new Date().getFullYear(), publisher: '' }],
    });
  };
  const updateTextbook = (idx: number, field: string, value: any) => {
    onChange({
      ...textbooks,
      primary: primary.map((t: any, i: number) =>
        i === idx ? { ...t, [field]: value } : t
      ),
    });
  };

  return (
    <div className="space-y-2">
      {primary.map((book: any, idx: number) => (
        <div key={idx} className="flex gap-2">
          <Input
            placeholder="Title"
            value={book.title}
            onChange={(e) => updateTextbook(idx, 'title', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Author"
            value={book.author}
            onChange={(e) => updateTextbook(idx, 'author', e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({
              ...textbooks,
              primary: primary.filter((_: any, i: number) => i !== idx),
            })}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addTextbook} className="w-full">
        + Add Textbook
      </Button>
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

function PedagogyEditor({ methods, onChange }: any) {
  const list = methods?.methods || [];
  const commonMethods = [
    'Chalk and talk',
    'PowerPoint',
    'E-content',
    'Group discussion',
    'Case study',
    'Problem-based learning',
    'Project-based learning',
    'Simulation',
  ];

  const addMethod = (method?: string) => {
    onChange({
      ...methods,
      methods: list.includes(method) ? list : [...list, method || ''],
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Common Methods</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {commonMethods.map((method) => (
            <Button
              key={method}
              type="button"
              variant={list.includes(method) ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                const newList = list.includes(method)
                  ? list.filter((m: string) => m !== method)
                  : [...list, method];
                onChange({ ...methods, methods: newList });
              }}
            >
              {method}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PoMappingsEditor({ mappings, pos, psos, onChange }: any) {
  const list = mappings?.mappings || [];
  const addMapping = () => {
    onChange({
      ...mappings,
      mappings: [...list, { co_id: '', pos: {}, psos: {} }],
    });
  };
  const updateMapping = (idx: number, field: string, value: any) => {
    onChange({
      ...mappings,
      mappings: list.map((m: any, i: number) =>
        i === idx ? { ...m, [field]: value } : m
      ),
    });
  };

  return (
    <div className="space-y-3">
      {list.map((mapping: any, idx: number) => (
        <Card key={idx} className="p-4">
          <div className="space-y-2">
            <Input
              placeholder="CO/CLO ID"
              value={mapping.co_id}
              onChange={(e) => updateMapping(idx, 'co_id', e.target.value)}
            />
            <div>
              <label className="text-sm font-medium">PO Alignment (H/M/L)</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {Object.entries(pos).map(([poCode, poDesc]) => (
                  <div key={poCode} className="text-xs">
                    <div className="font-medium">{poCode}</div>
                    <select
                      value={mapping.pos?.[poCode] || ''}
                      onChange={(e) => {
                        const newPos = { ...mapping.pos, [poCode]: e.target.value };
                        updateMapping(idx, 'pos', newPos);
                      }}
                      className="w-full text-xs"
                    >
                      <option value="">-</option>
                      <option value="H">High</option>
                      <option value="M">Medium</option>
                      <option value="L">Low</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ))}
      <Button type="button" variant="outline" onClick={addMapping} className="w-full">
        + Add Mapping
      </Button>
    </div>
  );
}
