'use client';

/**
 * Schools Network — Add School form.
 *
 * Calls POST /api/schools-network/schools per spec §7.2.
 */

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { createSchool, listInstitutions } from '../_lib/api';
import {
  OWNERSHIP_LABEL,
  STATUS_LABEL,
  type CreateSchoolInput,
  type SchoolOwnership,
  type SchoolStatus,
} from '../_lib/types';

const OWNERSHIPS: SchoolOwnership[] = ['external', 'internal'];
const STATUSES: SchoolStatus[] = ['active', 'sustaining', 'dormant', 'inactive'];

function NewSchoolForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Adopt flow: the feeder-discovery panel links here with ?name=<school>
  const searchParams = useSearchParams();
  const [name, setName] = useState(searchParams.get('name') ?? '');
  const [ownership, setOwnership] = useState<SchoolOwnership>('external');
  const [institutionId, setInstitutionId] = useState('');
  const [status, setStatus] = useState<SchoolStatus>('active');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('Tamil Nadu');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');
  const [intakeYear, setIntakeYear] = useState<string>(
    new Date().getFullYear().toString()
  );

  // Same source + query key as other admin forms (internships/vehicles) so
  // the list is shared from the React Query cache. Only fetched when the
  // Internal branch actually needs it.
  const institutionsQuery = useQuery({
    queryKey: ['institutions', 'simple'],
    queryFn: listInstitutions,
    enabled: ownership === 'internal',
    staleTime: 10 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (input: CreateSchoolInput) => createSchool(input),
    onSuccess: (data) => {
      toast.success('School added');
      queryClient.invalidateQueries({ queryKey: ['schools-network'] });
      router.push(`/admission/schools-network/${data.id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add school');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (ownership === 'internal' && !institutionId) {
      toast.error('Institution is required for JKKN (internal) schools');
      return;
    }
    mutation.mutate({
      name: name.trim(),
      ownership,
      institutionId: ownership === 'internal' ? institutionId : undefined,
      status,
      district: district.trim() || undefined,
      state: state.trim() || undefined,
      pincode: pincode.trim() || undefined,
      address: address.trim() || undefined,
      intakeYear: intakeYear ? parseInt(intakeYear, 10) : undefined,
    });
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link
          href="/admission/schools-network"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Schools Network
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SchoolIcon className="h-5 w-5" /> Add a school
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
                <Label htmlFor="ownership">Ownership *</Label>
                <Select
                  value={ownership}
                  onValueChange={(v) => {
                    const next = v as SchoolOwnership;
                    setOwnership(next);
                    // Institution only applies to internal schools — drop any
                    // picked value when switching back to external.
                    if (next === 'external') setInstitutionId('');
                  }}
                >
                  <SelectTrigger id="ownership">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OWNERSHIPS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {OWNERSHIP_LABEL[o]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ownership === 'internal'
                    ? "JKKN's own school — pick the institution it belongs to below."
                    : 'External partner school in the community.'}
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

            {ownership === 'internal' && (
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
              <Link href="/admission/schools-network">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Add school
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewSchoolPage() {
  return (
    <PermissionGuard module="schools_network.schools" action="create">
      <ContentLayout title="Add School">
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
              <BreadcrumbPage>Add School</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <Suspense fallback={null}>
            <NewSchoolForm />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
