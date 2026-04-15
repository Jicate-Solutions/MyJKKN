'use client';

// app/(routes)/faculty/innovation/submit/page.tsx
// Submit Initiative form — 4-branch form (IP / Clinical / Research / Publication)
// with auto-save to localStorage every 30 seconds (A9 file limits + draft resume).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Info, Save, Send, Trash2 } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useFacultyInitiativeMutations } from '@/hooks/faculty-innovation/use-faculty-initiatives';
import {
  CATEGORY_APPROVAL_AUTHORITY,
  CATEGORY_LABEL,
  type ClinicalDetails,
  type CreateFacultyInitiativeInput,
  type FacultyInitiativeCategory,
  type ResearchDetails,
} from '@/types/faculty-innovation';
import { CategoryBranchFields } from '../_components/category-branch-fields';
import { toast } from 'sonner';

const DRAFT_STORAGE_KEY = 'faculty-innovation:draft';
const AUTOSAVE_INTERVAL_MS = 30_000;

interface DraftState {
  title: string;
  abstract: string;
  description: string;
  category: FacultyInitiativeCategory;
  clinical_details: ClinicalDetails;
  research_details: ResearchDetails;
  sh_publication_id: string;
  updated_at: string;
}

const emptyDraft = (): DraftState => ({
  title: '',
  abstract: '',
  description: '',
  category: 'clinical',
  clinical_details: {},
  research_details: {},
  sh_publication_id: '',
  updated_at: new Date().toISOString(),
});

export default function SubmitInitiativePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { create } = useFacultyInitiativeMutations();

  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const draftRef = useRef<DraftState>(draft);
  draftRef.current = draft;

  // Load any prior draft on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftState;
        setDraft({ ...emptyDraft(), ...parsed });
        setLastSavedAt(parsed.updated_at ?? null);
      }
    } catch (err) {
      console.warn('[faculty-innovation] Failed to load draft from storage', err);
    }
  }, []);

  // Auto-save every 30 seconds if any change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const iv = setInterval(() => {
      const d = draftRef.current;
      if (!d.title && !d.abstract) return; // nothing worth saving yet
      const payload: DraftState = {
        ...d,
        updated_at: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      setLastSavedAt(payload.updated_at);
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);

  const saveDraftNow = useCallback(() => {
    if (typeof window === 'undefined') return;
    const payload: DraftState = {
      ...draftRef.current,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    setLastSavedAt(payload.updated_at);
    toast.success('Draft saved locally');
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraft(emptyDraft());
    setLastSavedAt(null);
    toast.success('Draft cleared');
  }, []);

  const approvalAuthority = useMemo(
    () => CATEGORY_APPROVAL_AUTHORITY[draft.category],
    [draft.category]
  );

  const canSubmit =
    draft.title.trim().length >= 5 &&
    draft.abstract.trim().length >= 20 &&
    !!draft.category &&
    !!profile?.institution_id;

  const handleSubmit = async (saveAs: 'draft' | 'submitted') => {
    if (!profile?.institution_id) {
      toast.error('No institution context — please refresh and try again.');
      return;
    }

    const input: CreateFacultyInitiativeInput = {
      institution_id: profile.institution_id,
      title: draft.title.trim(),
      abstract: draft.abstract.trim(),
      description: draft.description.trim() || undefined,
      category: draft.category,
      status: saveAs,
      clinical_details:
        draft.category === 'clinical' && Object.keys(draft.clinical_details).length > 0
          ? draft.clinical_details
          : undefined,
      research_details:
        (draft.category === 'research_grant' || draft.category === 'ip_bearing') &&
        Object.keys(draft.research_details).length > 0
          ? draft.research_details
          : undefined,
      sh_publication_id:
        draft.category === 'publication' && draft.sh_publication_id
          ? draft.sh_publication_id
          : undefined,
      source: 'manual',
    };

    try {
      const created = await create.mutateAsync(input);
      // Clear local draft after successful server save
      if (typeof window !== 'undefined') {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
      router.push(`/faculty/innovation/portfolio?initiative=${created.id}`);
    } catch (err) {
      console.error('[faculty-innovation] submit failed', err);
    }
  };

  return (
    <ContentLayout title="Submit Initiative">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/faculty/innovation">Faculty Innovation</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Submit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PermissionGuard module="faculty_innovation" action="initiative.submit">
        <div className="mt-6 space-y-6">
          {lastSavedAt && (
            <Alert>
              <Save className="h-4 w-4" />
              <AlertDescription>
                Draft auto-saved locally{' '}
                <span className="font-mono text-xs">
                  ({new Date(lastSavedAt).toLocaleTimeString()})
                </span>
                . It will not be visible to approvers until you click Submit.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Initiative details</CardTitle>
              <CardDescription>
                Start with the basics. You can save as draft and resume anytime.
                Approval will route to <strong>{approvalAuthority}</strong> based
                on the chosen category.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Title */}
              <div>
                <Label htmlFor="title">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, title: e.target.value }))
                  }
                  placeholder="Short, searchable title"
                  maxLength={500}
                />
              </div>

              {/* Abstract */}
              <div>
                <Label htmlFor="abstract">
                  Abstract <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="abstract"
                  rows={4}
                  value={draft.abstract}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, abstract: e.target.value }))
                  }
                  placeholder="Non-confidential summary. Minimum 20 characters."
                />
              </div>

              {/* Description (optional, long-form) */}
              <div>
                <Label htmlFor="description">Detailed description (optional)</Label>
                <Textarea
                  id="description"
                  rows={5}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, description: e.target.value }))
                  }
                  placeholder="Methodology, validation, risks, resource needs…"
                />
              </div>

              {/* Category (drives branch + approval routing) */}
              <div>
                <Label htmlFor="category">
                  Category <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      category: v as FacultyInitiativeCategory,
                    }))
                  }
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinical">
                      {CATEGORY_LABEL.clinical} (clinical prototype / device)
                    </SelectItem>
                    <SelectItem value="ip_bearing">
                      {CATEGORY_LABEL.ip_bearing} (patent / copyright / design)
                    </SelectItem>
                    <SelectItem value="research_grant">
                      {CATEGORY_LABEL.research_grant} (funded project)
                    </SelectItem>
                    <SelectItem value="publication">
                      {CATEGORY_LABEL.publication} (journal / conference)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  Approval routes to: <Badge variant="outline">{approvalAuthority}</Badge>
                </div>
              </div>

              {/* Branch-specific fields */}
              <CategoryBranchFields
                category={draft.category}
                clinicalDetails={draft.clinical_details}
                researchDetails={draft.research_details}
                shPublicationId={draft.sh_publication_id}
                onClinicalChange={(cd) =>
                  setDraft((d) => ({ ...d, clinical_details: cd }))
                }
                onResearchChange={(rd) =>
                  setDraft((d) => ({ ...d, research_details: rd }))
                }
                onShPublicationChange={(id) =>
                  setDraft((d) => ({ ...d, sh_publication_id: id }))
                }
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={saveDraftNow}
                disabled={create.isPending}
              >
                <Save className="mr-1 h-4 w-4" />
                Save draft locally
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDraft}
                disabled={create.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Clear draft
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => handleSubmit('draft')}
                disabled={!canSubmit || create.isPending}
              >
                Save as draft
              </Button>
              <Button
                onClick={() => handleSubmit('submitted')}
                disabled={!canSubmit || create.isPending}
              >
                <Send className="mr-1 h-4 w-4" />
                {create.isPending ? 'Submitting…' : 'Submit for review'}
              </Button>
            </div>
          </div>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
