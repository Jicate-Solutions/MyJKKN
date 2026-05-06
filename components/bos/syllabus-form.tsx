'use client';

import React, { useState, useEffect } from 'react';
import { useCreateBosSyllabus, useUpdateBosSyllabus, useBosSyllabus } from '@/hooks/bos/use-bos-syllabi';
import { useBosTaxonomy } from '@/hooks/bos/use-bos-taxonomy';
import { usePermissions } from '@/hooks/use-permissions';
import { BosCourseSyllabus, CreateBosSyllabusDto, UpdateBosSyllabusDto } from '@/types/bos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Institution { id: string; name: string; }
interface Regulation { id: string; title: string; }

interface SyllabusFormProps {
  syllabusId?: string;
  onSuccess?: (syllabus: BosCourseSyllabus) => void;
}

export function SyllabusForm({
  syllabusId,
  onSuccess,
}: SyllabusFormProps) {
  const { data: existingSyllabus } = useBosSyllabus(syllabusId);
  const createMutation = useCreateBosSyllabus();
  const updateMutation = useUpdateBosSyllabus(syllabusId || '');
  const { userProfile, isSuperAdmin } = usePermissions();

  const [activeTab, setActiveTab] = useState('basic');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [regulations, setRegulations] = useState<Regulation[]>([]);
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

  const { data: taxonomy } = useBosTaxonomy(formData.regulation_id || '');

  const isEditing = !!syllabusId;
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleSaveAndNext = async (nextTab: string) => {
    try {
      if (isEditing && syllabusId) {
        await updateMutation.mutateAsync(formData as UpdateBosSyllabusDto);
      } else {
        const result = await createMutation.mutateAsync(formData as CreateBosSyllabusDto);
        // Update form with returned data (including ID from server)
        setFormData((prev) => ({ ...prev, id: result.id }));
      }
      setActiveTab(nextTab);
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

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
      if (isEditing && syllabusId) {
        await updateMutation.mutateAsync(formData as UpdateBosSyllabusDto);
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
        `/api/bos/syllabi?courseCode=${encodeURIComponent(code)}&institutionsId=${formData.institutions_id}&regulationId=${formData.regulation_id}&limit=1`
      );
      if (res.ok) {
        const { data } = await res.json();
        if (data && data.length > 0 && data[0].id !== syllabusId) {
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
              <div className="grid grid-cols-2 gap-4">
                {isSuperAdmin && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Institution *</label>
                    <Select value={formData.institutions_id || ''} onValueChange={(val) => updateField('institutions_id', val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select institution" />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}


                <div>
                  <label className="block text-sm font-medium mb-1">Regulation *</label>
                  <Select value={formData.regulation_id || ''} onValueChange={(val) => updateField('regulation_id', val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select regulation" />
                    </SelectTrigger>
                    <SelectContent>
                      {regulations.map((reg) => (
                        <SelectItem key={reg.id} value={reg.id}>
                          {reg.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Course Code (alphanumeric only)</label>
                  <Input
                    value={formData.course_code || ''}
                    onChange={(e) => {
                      // Keep only alphanumeric characters and convert to uppercase
                      const code = e.target.value.replace(/[^A-Z0-9]/g, '').toUpperCase();
                      updateField('course_code', code);
                      validateCourseCode(code);
                    }}
                    onBlur={() => validateCourseCode(formData.course_code || '')}
                    required
                    disabled={isEditing}
                    placeholder="e.g., 24UGTA01"
                    className={courseCodeError ? 'border-red-500' : ''}
                  />
                  {courseCodeError && <p className="text-sm text-red-600 mt-1">{courseCodeError}</p>}
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
                  disabled={!formData.course_code || !formData.course_name || !formData.institutions_id || !formData.regulation_id || !!courseCodeError || isLoading}
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
              {taxonomy && (
                <Alert>
                  <AlertDescription>
                    Available K-values: {Object.keys(taxonomy.k_values).join(', ')}
                  </AlertDescription>
                </Alert>
              )}
              <CloEditor
                clos={formData.course_learning_outcomes as any}
                kValues={taxonomy?.k_values || {}}
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
              <CardDescription>Units, chapters, and topics</CardDescription>
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
                  pos={taxonomy.pos}
                  psos={taxonomy.psos}
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
                {Object.keys(kValues).map((k) => (
                  <label key={k} className="flex items-center gap-1">
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
                    <span className="text-sm">{k}</span>
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
  const units = content?.units || [];
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

  return (
    <div className="space-y-3">
      {units.map((unit: any, unitIdx: number) => (
        <Card key={unitIdx} className="p-4">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Unit ID"
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
                  <div className="text-sm font-medium">Chapter {ch.chapter_number}</div>
                  <Input
                    placeholder="Chapter title"
                    value={ch.title}
                    onChange={(e) => {
                      const newChapters = [...unit.chapters];
                      newChapters[chIdx].title = e.target.value;
                      updateUnit(unitIdx, 'chapters', newChapters);
                    }}
                    size="sm"
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
                + Chapter
              </Button>
            </div>
          </div>
        </Card>
      ))}
      <Button type="button" variant="outline" onClick={addUnit} className="w-full">
        + Add Unit
      </Button>
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
