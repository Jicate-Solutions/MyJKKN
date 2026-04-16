'use client';

// app/(routes)/faculty/innovation/collab-request/page.tsx
// Request Cross-College Collaboration page.
// Faculty selects target institution + department, adds description.
// Routes notification to target HOD + source Dean + Director (all CC'd).
// Creates a collaboration_request JSONB field on the selected initiative.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users2, ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  useMyFacultyInitiatives,
  useFacultyInitiativeMutations,
} from '@/hooks/faculty-innovation/use-faculty-initiatives';
import { useAuth } from '@/hooks/use-auth';
import { FacultyInitiativeService } from '@/lib/services/faculty-innovation/faculty-initiative-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// Fetch institutions and departments for the selectors
function useInstitutions() {
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetch = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      setInstitutions(data ?? []);
      setLoaded(true);
    } catch {
      console.warn('[faculty-innovation/collab] Failed to fetch institutions');
    } finally {
      setLoading(false);
    }
  };

  return { institutions, loading, fetch };
}

function useDepartments(institutionId?: string) {
  const [departments, setDepartments] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  const fetch = async (instId: string) => {
    setLoading(true);
    try {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('departments')
        .select('id, name')
        .eq('institution_id', instId)
        .eq('is_active', true)
        .order('name');
      setDepartments(data ?? []);
    } catch {
      console.warn('[faculty-innovation/collab] Failed to fetch departments');
    } finally {
      setLoading(false);
    }
  };

  return { departments, loading, fetch };
}

export default function CollabRequestPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { initiatives, isLoading: loadingInit } = useMyFacultyInitiatives({
    limit: 50,
  });

  const instHook = useInstitutions();
  const deptHook = useDepartments();

  const [selectedInitiativeId, setSelectedInitiativeId] = useState('');
  const [targetInstitutionId, setTargetInstitutionId] = useState('');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load institutions on first render of selector
  const handleInstOpen = () => {
    instHook.fetch();
  };

  const handleInstitutionChange = (instId: string) => {
    setTargetInstitutionId(instId);
    setTargetDepartmentId('');
    deptHook.fetch(instId);
  };

  const handleSubmit = async () => {
    if (!selectedInitiativeId) {
      toast.error('Please select an initiative');
      return;
    }
    if (!targetInstitutionId) {
      toast.error('Please select a target institution');
      return;
    }
    if (!description.trim()) {
      toast.error('Please describe what you need from the collaborator');
      return;
    }

    setSubmitting(true);
    try {
      await FacultyInitiativeService.submitCollabRequest(
        selectedInitiativeId,
        {
          target_institution_id: targetInstitutionId,
          target_department_id: targetDepartmentId || undefined,
          description: description.trim(),
        }
      );
      toast.success('Collaboration request submitted');
      router.push('/faculty/innovation/portfolio');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to submit collaboration request');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter to active/non-rejected initiatives that don't already have a collab request
  const eligibleInitiatives = initiatives.filter(
    (i) =>
      i.is_active &&
      !['rejected', 'terminated'].includes(i.status) &&
      !i.collaboration_request
  );

  return (
    <ContentLayout title="Request Collaboration">
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
            <BreadcrumbPage>Request Collaboration</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PermissionGuard
        module="faculty_innovation"
        action="collab_request.create"
      >
        <div className="mt-6 max-w-2xl space-y-6">
          <Card className="border-violet-200/50 bg-gradient-to-br from-violet-50/30 via-background to-background">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-violet-100 p-3">
                  <Users2 className="h-5 w-5 text-violet-700" />
                </div>
                <div>
                  <CardTitle>Cross-College Collaboration</CardTitle>
                  <CardDescription className="mt-1">
                    Invite another JKKN college to partner on your initiative.
                    The target HOD, your Dean, and the Director will all be
                    notified.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardContent className="space-y-5 pt-6">
              {/* Select Initiative */}
              <div className="space-y-2">
                <Label htmlFor="initiative">Initiative</Label>
                <Select
                  value={selectedInitiativeId}
                  onValueChange={setSelectedInitiativeId}
                >
                  <SelectTrigger id="initiative">
                    <SelectValue
                      placeholder={
                        loadingInit
                          ? 'Loading...'
                          : 'Select an initiative'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleInitiatives.map((init) => (
                      <SelectItem key={init.id} value={init.id}>
                        {init.title}
                      </SelectItem>
                    ))}
                    {eligibleInitiatives.length === 0 && !loadingInit && (
                      <SelectItem value="__none" disabled>
                        No eligible initiatives
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Institution */}
              <div className="space-y-2">
                <Label htmlFor="target-institution">
                  Target Institution (College)
                </Label>
                <Select
                  value={targetInstitutionId}
                  onValueChange={handleInstitutionChange}
                  onOpenChange={(open) => open && handleInstOpen()}
                >
                  <SelectTrigger id="target-institution">
                    <SelectValue
                      placeholder={
                        instHook.loading
                          ? 'Loading...'
                          : 'Select target college'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {instHook.institutions
                      .filter((i) => i.id !== profile?.institution_id)
                      .map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Department (optional) */}
              {targetInstitutionId && (
                <div className="space-y-2">
                  <Label htmlFor="target-department">
                    Target Department (optional)
                  </Label>
                  <Select
                    value={targetDepartmentId}
                    onValueChange={setTargetDepartmentId}
                  >
                    <SelectTrigger id="target-department">
                      <SelectValue
                        placeholder={
                          deptHook.loading
                            ? 'Loading...'
                            : 'Select department (optional)'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">
                        Any department
                      </SelectItem>
                      {deptHook.departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">
                  What do you need from the collaborator?
                </Label>
                <Textarea
                  id="description"
                  rows={5}
                  placeholder="Describe the collaboration opportunity: what expertise you need, expected outcomes, timeline, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" asChild>
                  <Link href="/faculty/innovation">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                  </Link>
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    !selectedInitiativeId ||
                    !targetInstitutionId ||
                    !description.trim()
                  }
                  className="gap-1"
                >
                  <Send className="h-4 w-4" />
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
