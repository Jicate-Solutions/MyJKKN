// app/(routes)/accreditation/naac/committees/page.tsx
// ============================================================================
// /accreditation/naac/committees — IQAC committee list (PR-A8 commit 2).
//
// Scopes:
//   - super_admin sees all committees across all 8 JKKN colleges
//   - institution users see their own institution's committees
//   - RLS on accreditation_committees + role_has_institution_access() enforces
//
// Body-hard-coded to NAAC here. Same component shape will be copy-tweaked for
// PR-A9 (NIRF committees), PR-A10 (NBA cells), A12-A14 (inspection panels),
// A15 (NCTE/AICTE coordinators).
// ============================================================================

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Plus,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Building2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useNAACCommittees,
  useCreateNAACCommittee,
} from '@/hooks/accreditation/use-naac-committees';
import { usePermissions } from '@/hooks/use-permissions';
import type { CommitteeType } from '@/lib/services/accreditation/accreditation-committee-service';
import { toast } from 'sonner';

interface Institution {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string;
}

function useJKKNInstitutions() {
  return useQuery({
    queryKey: ['institutions', 'jkkn-iqac'],
    queryFn: async (): Promise<Institution[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .not('iqac_code', 'is', null)
        .order('iqac_code');
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

const COMMITTEE_TYPE_LABELS: Record<CommitteeType, string> = {
  main: 'Main IQAC',
  sub: 'Sub-committee',
  inspection: 'Inspection panel',
  ad_hoc: 'Ad-hoc',
  review: 'Review',
};

export default function NAACCommitteesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin, userProfile, can, isLoading: permsLoading } =
    usePermissions();

  const canView = isSuperAdmin || can('accreditation.naac.committees.view');
  const canCreate = isSuperAdmin || can('accreditation.naac.committees.create');

  const { data: institutions } = useJKKNInstitutions();

  // Filter state: URL param ?college=<id> or 'all' (super_admin default)
  const urlCollege = searchParams.get('college');
  const defaultScope = isSuperAdmin
    ? urlCollege ?? 'all'
    : userProfile?.institution_id ?? '';
  const [scope, setScope] = useState<string>(defaultScope);

  const effectiveScope = isSuperAdmin ? scope : userProfile?.institution_id ?? '';

  const { data: committees, isLoading } = useNAACCommittees(
    effectiveScope === '' ? 'all' : effectiveScope,
  );

  const activeInstitutionName = useMemo(() => {
    if (effectiveScope === 'all') return 'All 8 colleges';
    return institutions?.find((i) => i.id === effectiveScope)?.name ?? '—';
  }, [effectiveScope, institutions]);

  const handleScopeChange = (value: string) => {
    setScope(value);
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('college');
    else params.set('college', value);
    router.replace(`/accreditation/naac/committees?${params.toString()}`);
  };

  if (permsLoading) {
    return (
      <ContentLayout title="NAAC IQAC Committees">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="NAAC IQAC Committees">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You do not have permission to view IQAC committees.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="NAAC IQAC Committees">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'Committees', href: '/accreditation/naac/committees' },
        ]}
      />

      <div className="space-y-6">
        {/* Header + filters */}
        <Card className="border-2 border-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/20">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <ShieldCheck className="h-6 w-6 text-indigo-600" />
                  IQAC Committees
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Internal Quality Assurance Cell per NAAC mandate. Principal IS
                  the IQAC Chairman; HoDs are Department IQAC Coordinators.
                  External members (industry, alumni, practitioners) supported.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isSuperAdmin && (
                  <Select value={scope} onValueChange={handleScopeChange}>
                    <SelectTrigger className="min-w-[240px] bg-card">
                      <SelectValue placeholder="Select college" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All 8 colleges</SelectItem>
                      {(institutions ?? []).map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {canCreate && (
                  <CreateCommitteeDialog
                    defaultInstitutionId={
                      effectiveScope === 'all' || effectiveScope === ''
                        ? undefined
                        : effectiveScope
                    }
                    institutions={institutions ?? []}
                    isSuperAdmin={isSuperAdmin}
                  />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Scope</div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {activeInstitutionName}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Committees</div>
                <div className="text-2xl font-bold">
                  {isLoading ? '—' : committees?.length ?? 0}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Total active members</div>
                <div className="text-2xl font-bold">
                  {isLoading
                    ? '—'
                    : (committees ?? []).reduce((s, c) => s + c.member_count, 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Committees</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (committees ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                No committees yet.{' '}
                {canCreate
                  ? 'Click “New committee” to form the first IQAC.'
                  : 'Ask your IQAC chairman to form a committee.'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Formed</TableHead>
                    <TableHead>Term end</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(committees ?? []).map((c) => {
                    const institution = institutions?.find(
                      (i) => i.id === c.institution_id,
                    );
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium">{c.committee_name}</div>
                          {institution && (
                            <div className="text-xs text-muted-foreground">
                              {institution.iqac_code
                                ? `[${institution.iqac_code}] `
                                : ''}
                              {institution.name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px]">
                            {COMMITTEE_TYPE_LABELS[c.committee_type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {c.formed_at}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.term_end ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{c.member_count}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/accreditation/naac/committees/${c.id}`}>
                            <Button size="sm" variant="outline">
                              Manage
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

// ----------------------------------------------------------------------------
// Create-committee dialog
// ----------------------------------------------------------------------------

function CreateCommitteeDialog({
  defaultInstitutionId,
  institutions,
  isSuperAdmin,
}: {
  defaultInstitutionId?: string;
  institutions: Institution[];
  isSuperAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<CommitteeType>('main');
  const [institutionId, setInstitutionId] = useState<string>(
    defaultInstitutionId ?? '',
  );
  const [formedAt, setFormedAt] = useState<string>(
    new Date().toISOString().split('T')[0] ?? '',
  );
  const [termEnd, setTermEnd] = useState<string>('');
  const [notes, setNotes] = useState('');

  const create = useCreateNAACCommittee();

  const handleSubmit = async () => {
    if (!name.trim() || !institutionId || !formedAt) {
      toast.error('Committee name, institution, and formed date are required');
      return;
    }
    try {
      await create.mutateAsync({
        institution_id: institutionId,
        body_code: 'NAAC',
        committee_name: name.trim(),
        committee_type: type,
        formed_at: formedAt,
        term_end: termEnd || null,
        metadata: notes.trim() ? { notes: notes.trim() } : null,
      });
      toast.success('Committee created');
      setOpen(false);
      setName('');
      setNotes('');
      setTermEnd('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create committee';
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New committee
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Form new IQAC committee</DialogTitle>
          <DialogDescription>
            NAAC mandates one main IQAC per college, with the Principal as
            Chairman. Sub-committees handle attribute-specific work.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {isSuperAdmin && (
            <div className="space-y-1.5">
              <Label>Institution</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select college" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Committee name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main IQAC – Academic Year 2026"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as CommitteeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(COMMITTEE_TYPE_LABELS) as CommitteeType[]).map(
                  (t) => (
                    <SelectItem key={t} value={t}>
                      {COMMITTEE_TYPE_LABELS[t]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Formed on</Label>
              <Input
                type="date"
                value={formedAt}
                onChange={(e) => setFormedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Term end (optional)</Label>
              <Input
                type="date"
                value={termEnd}
                onChange={(e) => setTermEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Purpose, scope, terms of reference..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create committee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
