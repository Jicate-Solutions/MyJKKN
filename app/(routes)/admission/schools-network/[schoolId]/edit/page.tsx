'use client';

/**
 * Schools Network — Edit School form.
 *
 * Registered in MENU_PERMISSIONS ('/admission/schools-network/[schoolId]/edit'
 * → schools_network.schools.edit) and linked from the detail page's "Edit"
 * button, but never built → 404 in prod. Mirrors ../../new/page.tsx (Add
 * School). Prefills from getSchoolDetail(schoolId).school and PATCHes via
 * updateSchool(schoolId, patch) per spec §7.3.
 *
 * Ownership is intentionally read-only here: flipping internal ↔ external has
 * institutionId implications (an internal school MUST link to an institution)
 * that belong in a dedicated flow, not this quick-edit form. For schools that
 * are ALREADY internal, an Institution picker is shown (prefilled from the
 * school) so the required linkage can be corrected without leaving the form.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, School as SchoolIcon } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { getSchoolDetail, listInstitutions, updateSchool } from '../../_lib/api';
import {
  OWNERSHIP_COLOR,
  OWNERSHIP_LABEL,
  STATUS_LABEL,
  type CreateSchoolInput,
  type SchoolStatus,
} from '../../_lib/types';

const STATUSES: SchoolStatus[] = ['active', 'sustaining', 'dormant', 'inactive'];

function EditSchoolForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ['schools-network', 'detail', schoolId],
    queryFn: () => getSchoolDetail(schoolId),
  });
  const school = detailQuery.data?.school;

  const [name, setName] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [status, setStatus] = useState<SchoolStatus>('active');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');
  const [intakeYear, setIntakeYear] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Prefill once from the fetched school — guarded so a background refetch
  // doesn't clobber in-progress edits.
  // Institutions lookup — same source + query key as other admin forms
  // (internships/vehicles). Only needed for internal schools.
  const institutionsQuery = useQuery({
    queryKey: ['institutions', 'simple'],
    queryFn: listInstitutions,
    enabled: school?.ownership === 'internal',
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (school && !hydrated) {
      setName(school.name ?? '');
      setInstitutionId(school.institutionId ?? '');
      setStatus(school.status);
      setDistrict(school.district ?? '');
      setState(school.state ?? '');
      setPincode(school.pincode ?? '');
      setAddress(school.address ?? '');
      setIntakeYear(school.intakeYear != null ? String(school.intakeYear) : '');
      setHydrated(true);
    }
  }, [school, hydrated]);

  const mutation = useMutation({
    mutationFn: (patch: Partial<CreateSchoolInput>) => updateSchool(schoolId, patch),
    onSuccess: () => {
      toast.success('School updated');
      queryClient.invalidateQueries({ queryKey: ['schools-network'] });
      router.push(`/admission/schools-network/${schoolId}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update school');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    // Require an institution for internal schools — but never let a FAILED
    // institutions lookup brick unrelated edits: if the list errored and the
    // school had no institution to begin with, allow the save (the picker is
    // empty through no fault of the user; review fix).
    if (
      school.ownership === 'internal' &&
      !institutionId &&
      !institutionsQuery.isError
    ) {
      toast.error('Institution is required for JKKN (internal) schools');
      return;
    }
    // Send trimmed values so "what you see is what you save" — the server
    // applies only fields present, and empty strings clear text columns.
    // institutionId is only sent for internal schools (external schools never
    // carry one, and omitting it leaves the column untouched server-side).
    mutation.mutate({
      name: name.trim(),
      status,
      district: district.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      address: address.trim(),
      intakeYear: intakeYear ? parseInt(intakeYear, 10) : undefined,
      // Only send institutionId when a real value is picked — an empty
      // string would fail the uuid cast server-side; omitting leaves the
      // column untouched (keeps the degraded-lookup save path functional).
      ...(school.ownership === 'internal' && institutionId ? { institutionId } : {}),
    });
  };

  if (detailQuery.isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detailQuery.error || !school) {
    return (
      <div className="max-w-2xl text-center py-12">
        <SchoolIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">School not found</h3>
        <p className="text-muted-foreground mb-4">
          {(detailQuery.error as Error)?.message ??
            "This school couldn't be loaded — it may have been removed or you may not have access."}
        </p>
        <Link href="/admission/schools-network">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Schools Network
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link
          href={`/admission/schools-network/${schoolId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to school
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SchoolIcon className="h-5 w-5" /> Edit school
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">School name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bharat Matric. Hr. Sec. School"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ownership</Label>
                <div className="flex h-10 items-center">
                  <Badge className={OWNERSHIP_COLOR[school.ownership]}>
                    {OWNERSHIP_LABEL[school.ownership]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ownership can&apos;t be changed here — it affects institution
                  linkage.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as SchoolStatus)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {school.ownership === 'internal' && (
              <div className="space-y-2">
                <Label htmlFor="institution">Institution *</Label>
                <Select value={institutionId} onValueChange={setInstitutionId}>
                  <SelectTrigger id="institution">
                    <SelectValue
                      placeholder={
                        institutionsQuery.isLoading
                          ? 'Loading institutions…'
                          : 'Select the JKKN institution'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(institutionsQuery.data ?? []).map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {institutionsQuery.error ? (
                  <p className="text-xs text-destructive">
                    Couldn&apos;t load institutions — reload the page and try
                    again.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The JKKN institution this school is part of.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="district">District</Label>
                <Input
                  id="district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Namakkal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pincode">Pincode</Label>
                <Input
                  id="pincode"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="6-digit"
                  maxLength={6}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="intakeYear">Intake year</Label>
              <Input
                id="intakeYear"
                type="number"
                min={2000}
                max={2100}
                value={intakeYear}
                onChange={(e) => setIntakeYear(e.target.value)}
                placeholder="Year added to JKKN's network"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Link href={`/admission/schools-network/${schoolId}`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EditSchoolPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params?.schoolId ?? '';

  return (
    <PermissionGuard module="schools_network.schools" action="edit">
      <ContentLayout title="Edit School">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/schools-network">
                Schools Network
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/admission/schools-network/${schoolId}`}>
                Detail
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Edit</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <EditSchoolForm schoolId={schoolId} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
