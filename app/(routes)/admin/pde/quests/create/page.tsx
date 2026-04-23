'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateQuest,
  useUpdateQuest,
  useQuestDetail,
  useAllCapabilities,
} from '@/hooks/pde/use-pde-phase2';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import { ArrowLeft, Save, Target } from 'lucide-react';
import type {

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/admin/pde/quests',
} as const;

  CreateQuestInput,
  QuestType,
  QuestDifficulty,
  QuestSourceType,
  QuestStatus,
  PDECapability,
} from '@/types/pde';

// ============================================
// Constants
// ============================================

const QUEST_TYPES: { value: QuestType; label: string }[] = [
  { value: 'solo', label: 'Solo (Individual)' },
  { value: 'team', label: 'Team (2-5 Learners)' },
  { value: 'cross_dept', label: 'Cross-Department' },
  { value: 'community', label: 'Community Service' },
  { value: 'industry', label: 'Industry Partner' },
];

const DIFFICULTIES: { value: QuestDifficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

const SOURCE_TYPES: { value: QuestSourceType; label: string }[] = [
  { value: 'solutions_dept', label: 'Solutions Department' },
  { value: 'jicate_client', label: 'JICATE Client' },
  { value: 'nif', label: 'NIF' },
  { value: 'industry', label: 'Industry Partner' },
  { value: 'community', label: 'Community Need' },
  { value: 'faculty', label: 'Senior Learner' },
  { value: 'learner', label: 'Learner-Proposed' },
];

const STATUSES: { value: QuestStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

// ============================================
// Main Page
// ============================================

export default function CreateQuestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const isEdit = !!editId;

  const { profile: user } = useAuth();
  const { data: existingQuest, isLoading: loadingExisting } = useQuestDetail(editId || undefined);
  const { data: allCapabilities } = useAllCapabilities();
  const createQuest = useCreateQuest();
  const updateQuest = useUpdateQuest();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [questType, setQuestType] = useState<QuestType>('solo');
  const [difficulty, setDifficulty] = useState<QuestDifficulty>('beginner');
  const [sourceType, setSourceType] = useState<QuestSourceType>('solutions_dept');
  const [sourceDepartment, setSourceDepartment] = useState('');
  const [sourceContact, setSourceContact] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [maxTeamSize, setMaxTeamSize] = useState('1');
  const [reputationPoints, setReputationPoints] = useState('100');
  const [deliverableDescription, setDeliverableDescription] = useState('');
  const [solutionsHubEligible, setSolutionsHubEligible] = useState(false);
  const [nifEligible, setNifEligible] = useState(false);
  const [status, setStatus] = useState<QuestStatus>('draft');
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);

  // Populate form when editing
  useEffect(() => {
    if (existingQuest) {
      setTitle(existingQuest.title || '');
      setDescription(existingQuest.description || '');
      setProblemStatement(existingQuest.problem_statement || '');
      setQuestType(existingQuest.quest_type || 'solo');
      setDifficulty(existingQuest.difficulty || 'beginner');
      setSourceType(existingQuest.source_type || 'solutions_dept');
      setSourceDepartment(existingQuest.source_department || '');
      setSourceContact(existingQuest.source_contact || '');
      setEstimatedHours(existingQuest.estimated_hours?.toString() || '');
      setMaxTeamSize(existingQuest.max_team_size?.toString() || '1');
      setReputationPoints(existingQuest.reputation_points?.toString() || '100');
      setDeliverableDescription(existingQuest.deliverable_description || '');
      setSolutionsHubEligible(existingQuest.solutions_hub_eligible || false);
      setNifEligible(existingQuest.nif_eligible || false);
      setStatus(existingQuest.status || 'draft');
      if (existingQuest.required_capabilities) {
        setSelectedCapabilities(
          existingQuest.required_capabilities.map((c: { capability_id: string }) => c.capability_id)
        );
      }
    }
  }, [existingQuest]);

  const handleSubmit = async () => {
    const input: CreateQuestInput = {
      title: title.trim(),
      description: description.trim(),
      problem_statement: problemStatement.trim(),
      quest_type: questType,
      difficulty,
      source_type: sourceType,
      source_department: sourceDepartment.trim() || undefined,
      source_contact: sourceContact.trim() || undefined,
      estimated_hours: estimatedHours ? parseInt(estimatedHours) : undefined,
      max_team_size: parseInt(maxTeamSize) || 1,
      reputation_points: parseInt(reputationPoints) || 100,
      solutions_hub_eligible: solutionsHubEligible,
      nif_eligible: nifEligible,
      deliverable_description: deliverableDescription.trim(),
      status,
      created_by: user?.id,
      required_capabilities: selectedCapabilities.map((capId) => ({
        capability_id: capId,
        min_level: 1,
      })),
    };

    try {
      if (isEdit && editId) {
        await updateQuest.mutateAsync({ id: editId, input });
      } else {
        await createQuest.mutateAsync(input);
      }
      router.push('/admin/pde/quests');
    } catch {
      // mutation handles error
    }
  };

  const isPending = createQuest.isPending || updateQuest.isPending;
  const isValid = title.trim() && problemStatement.trim() && deliverableDescription.trim();

  if (isEdit && loadingExisting) {
    return (
      <ContentLayout title="Loading...">
        <div className="flex justify-center py-12">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={isEdit ? 'Edit Quest' : 'Create Quest'}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'Quests', href: '/admin/pde/quests' },
          { label: isEdit ? 'Edit' : 'Create' },
        ]}
      />

      <div className="space-y-6 mt-4 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">{isEdit ? 'Edit Quest' : 'Create New Quest'}</h1>
            <p className="text-sm text-muted-foreground">
              Define a real-world problem for Learners to solve
            </p>
          </div>
        </div>

        {/* Core Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quest Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Drug Interaction Alert System"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="problem">Problem Statement *</Label>
              <Textarea
                id="problem"
                placeholder="The real-world problem to solve..."
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Full description, context, and goals..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quest Type *</Label>
                <Select value={questType} onValueChange={(v) => setQuestType(v as QuestType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUEST_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as QuestDifficulty)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estimated Hours</Label>
                <Input
                  type="number"
                  placeholder="e.g., 40"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Team Size</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={maxTeamSize}
                  onChange={(e) => setMaxTeamSize(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as QuestStatus)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as QuestSourceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  placeholder="e.g., Pharmacy Practice"
                  value={sourceDepartment}
                  onChange={(e) => setSourceDepartment(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact</Label>
                <Input
                  placeholder="e.g., Dr. Ranjith"
                  value={sourceContact}
                  onChange={(e) => setSourceContact(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Required Capabilities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Required Capabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Select capabilities Learners need to complete this quest
            </p>
            {!allCapabilities || allCapabilities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No capabilities defined yet. Create capabilities first.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                {allCapabilities.map((cap: PDECapability) => {
                  const isSelected = selectedCapabilities.includes(cap.id);
                  return (
                    <button
                      key={cap.id}
                      onClick={() => {
                        setSelectedCapabilities((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== cap.id)
                            : [...prev, cap.id]
                        );
                      }}
                      className={`flex items-center gap-2 p-2 rounded-md border text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-primary/10 border-primary/30'
                          : 'border-muted hover:bg-muted/50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected ? 'bg-primary border-primary text-white' : 'border-muted-foreground/30'
                      }`}>
                        {isSelected && <span className="text-[10px]">&#10003;</span>}
                      </div>
                      <span className="truncate">{cap.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">L{cap.level}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rewards & Deliverables */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rewards & Deliverables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Reputation Points</Label>
              <Input
                type="number"
                min="0"
                value={reputationPoints}
                onChange={(e) => setReputationPoints(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deliverable">Deliverable Description *</Label>
              <Textarea
                id="deliverable"
                placeholder="What must Learners submit to complete this quest?"
                value={deliverableDescription}
                onChange={(e) => setDeliverableDescription(e.target.value)}
                rows={3}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label>Solutions Hub Eligible</Label>
                <p className="text-xs text-muted-foreground">
                  Exceptional solutions can be added to the Solutions Hub
                </p>
              </div>
              <Switch checked={solutionsHubEligible} onCheckedChange={setSolutionsHubEligible} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>NIF Eligible</Label>
                <p className="text-xs text-muted-foreground">
                  Solutions may enter Nattraja Incubation Forum pipeline
                </p>
              </div>
              <Switch checked={nifEligible} onCheckedChange={setNifEligible} />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !isValid}>
            {isPending ? (
              <BeatLoader color="#fff" size={8} />
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isEdit ? 'Update Quest' : 'Create Quest'}
              </>
            )}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
