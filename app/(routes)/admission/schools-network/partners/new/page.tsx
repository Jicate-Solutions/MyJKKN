'use client';

/**
 * Schools Network — Add Program Partner form.
 *
 * This page was registered in MENU_PERMISSIONS ('/admission/schools-network/
 * partners/new' → schools_network.partners.manage) but never built — the
 * [partnerId] dynamic route swallowed "new" as a partner id and rendered
 * "Partner not found". Mirrors ../new/page.tsx (Add School). Calls
 * POST /api/schools-network/program-partners per spec §7.8.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Handshake, Loader2 } from 'lucide-react';

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

import { createPartner, listPartnerTypes } from '../../_lib/api';
import {
  PARTNER_STATUS_LABEL,
  type ProgramPartnerStatus,
} from '../../_lib/types';

const STATUSES: ProgramPartnerStatus[] = ['active', 'sustaining', 'dormant'];

function NewPartnerForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [status, setStatus] = useState<ProgramPartnerStatus>('active');
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [notes, setNotes] = useState('');

  const typesQuery = useQuery({
    queryKey: ['schools-network', 'partner-types'],
    queryFn: () => listPartnerTypes(),
  });
  const types = typesQuery.data?.rows ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      createPartner({
        name: name.trim(),
        typeId,
        status,
        contactPerson: contactPerson.trim() || null,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (data) => {
      toast.success('Program partner added');
      queryClient.invalidateQueries({ queryKey: ['schools-network'] });
      router.push(`/admission/schools-network/partners/${data.id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add partner');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!typeId) {
      toast.error('Partner type is required');
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link
          href="/admission/schools-network/partners"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Partners
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" /> Add a program partner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Partner name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. HP (Creating Shared Values)"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="typeId">Partner type *</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger id="typeId">
                    <SelectValue
                      placeholder={
                        typesQuery.isLoading ? 'Loading…' : 'Select type'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as ProgramPartnerStatus)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {PARTNER_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactPerson">Contact person</Label>
                <Input
                  id="contactPerson"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. CSR programme manager"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Contact phone</Label>
                <Input
                  id="contactPhone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91…"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Contact email</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="name@partner.org"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website</Label>
                <Input
                  id="websiteUrl"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Context, grant history, relationship owner…"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/admission/schools-network/partners')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Add partner
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewPartnerPage() {
  return (
    <PermissionGuard module="schools_network.partners" action="manage">
      <ContentLayout title="Add Program Partner">
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
              <BreadcrumbLink href="/admission/schools-network/partners">
                Partners
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <NewPartnerForm />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
