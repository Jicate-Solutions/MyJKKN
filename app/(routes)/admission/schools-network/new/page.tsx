'use client';

/**
 * Schools Network — Add School form.
 *
 * Calls POST /api/schools-network/schools per spec §7.2.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

import { createSchool } from '../_lib/api';
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

  const [name, setName] = useState('');
  const [ownership, setOwnership] = useState<SchoolOwnership>('external');
  const [status, setStatus] = useState<SchoolStatus>('active');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('Tamil Nadu');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');
  const [intakeYear, setIntakeYear] = useState<string>(
    new Date().getFullYear().toString()
  );

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
    mutation.mutate({
      name: name.trim(),
      ownership,
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
                  onValueChange={(v) => setOwnership(v as SchoolOwnership)}
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
                    ? "JKKN's own school — must link to an institution. Set institution after creation."
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

            <div className="grid grid-cols-3 gap-4">
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
          <NewSchoolForm />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
