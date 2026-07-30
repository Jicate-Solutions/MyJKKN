'use client';

/**
 * Schools Network — Log Contribution form.
 *
 * Registered in MENU_PERMISSIONS ('/admission/schools-network/[schoolId]/
 * contributions/new' → schools_network.contributions.create) and linked from
 * the detail page's Contributions tab, but never built → 404 in prod. Calls
 * POST /api/schools-network/schools/:id/contributions per spec §7.9.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Gift, Loader2 } from 'lucide-react';

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

import { listPartners, logContribution } from '../../../_lib/api';
import type { ContributionKind, CreateContributionInput } from '../../../_lib/types';

const KINDS: { value: ContributionKind; label: string }[] = [
  { value: 'device', label: 'Device' },
  { value: 'branding', label: 'Branding' },
  { value: 'website', label: 'Website' },
  { value: 'fund', label: 'Fund' },
  { value: 'training_kit', label: 'Training kit' },
  { value: 'other', label: 'Other' },
];

function LogContributionForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const partnersQuery = useQuery({
    queryKey: ['schools-network', 'partners', 'picker'],
    queryFn: () => listPartners({ limit: 50 }),
  });
  const partners = partnersQuery.data?.rows ?? [];

  const [kind, setKind] = useState<ContributionKind>('device');
  const [description, setDescription] = useState('');
  const [valueInr, setValueInr] = useState('');
  const [deliveredAt, setDeliveredAt] = useState('');
  const [programPartnerId, setProgramPartnerId] = useState('');

  const mutation = useMutation({
    mutationFn: (input: CreateContributionInput) =>
      logContribution(schoolId, input),
    onSuccess: () => {
      toast.success('Contribution logged');
      queryClient.invalidateQueries({ queryKey: ['schools-network'] });
      router.push(`/admission/schools-network/${schoolId}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to log contribution');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }
    const parsedValue = valueInr ? Number(valueInr) : undefined;
    mutation.mutate({
      kind,
      description: description.trim(),
      valueInr:
        parsedValue != null && !Number.isNaN(parsedValue) && parsedValue >= 0
          ? parsedValue
          : undefined,
      deliveredAt: deliveredAt || undefined,
      programPartnerId: programPartnerId || undefined,
    });
  };

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
            <Gift className="h-5 w-5" /> Log a contribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="kind">Kind *</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => setKind(v as ContributionKind)}
                >
                  <SelectTrigger id="kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="valueInr">Value (₹)</Label>
                <Input
                  id="valueInr"
                  type="number"
                  min={0}
                  value={valueInr}
                  onChange={(e) => setValueInr(e.target.value)}
                  placeholder="Approx. value in rupees"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What was given — e.g. 10 refurbished laptops for the computer lab"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deliveredAt">Delivered on</Label>
                <Input
                  id="deliveredAt"
                  type="date"
                  value={deliveredAt}
                  onChange={(e) => setDeliveredAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner">Program partner</Label>
                <Select
                  value={programPartnerId}
                  onValueChange={setProgramPartnerId}
                >
                  <SelectTrigger id="partner">
                    <SelectValue
                      placeholder={
                        partnersQuery.isLoading
                          ? 'Loading…'
                          : 'Optional — who funded it'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                Log contribution
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LogContributionPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params?.schoolId ?? '';

  return (
    <PermissionGuard module="schools_network.contributions" action="create">
      <ContentLayout title="Log Contribution">
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
              <BreadcrumbPage>Log Contribution</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <LogContributionForm schoolId={schoolId} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
