'use client';

/**
 * Schools Network — Add Contact form.
 *
 * Registered in MENU_PERMISSIONS ('/admission/schools-network/[schoolId]/
 * contacts/new' → schools_network.contacts.create) and linked from the detail
 * page's Contacts tab, but never built → 404 in prod. This was the blocker for
 * the HM portal: there was no way to record a headmaster's email, so no
 * magic-link login could be issued. Calls POST /api/schools-network/schools/
 * :id/contacts per spec §7.6.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';

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

import { createContact, listContactRoles } from '../../../_lib/api';
import type { CreateContactInput } from '../../../_lib/types';

function AddContactForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: ['schools-network', 'contact-roles'],
    queryFn: () => listContactRoles(),
  });
  const roles = rolesQuery.data?.rows ?? [];

  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isPrimary, setIsPrimary] = useState<'yes' | 'no'>('no');
  const [notes, setNotes] = useState('');

  const selectedRole = roles.find((r) => r.id === roleId);

  const mutation = useMutation({
    mutationFn: (input: CreateContactInput) => createContact(schoolId, input),
    onSuccess: () => {
      toast.success('Contact added');
      queryClient.invalidateQueries({ queryKey: ['schools-network'] });
      router.push(`/admission/schools-network/${schoolId}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add contact');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!roleId) {
      toast.error('Pick a role');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      toast.error('Enter at least an email or a phone number');
      return;
    }
    mutation.mutate({
      name: name.trim(),
      roleId,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      isPrimary: isPrimary === 'yes',
      notes: notes.trim() || undefined,
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
            <UserPlus className="h-5 w-5" /> Add a contact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Contact name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mr. R. Kumar"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger id="role">
                    <SelectValue
                      placeholder={
                        rolesQuery.isLoading ? 'Loading…' : 'Select role'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedRole?.canLoginToPortal && (
                  <p className="text-xs text-muted-foreground">
                    This role can sign in to the schools portal via magic-link —
                    an email is recommended.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="isPrimary">Primary contact?</Label>
                <Select
                  value={isPrimary}
                  onValueChange={(v) => setIsPrimary(v as 'yes' | 'no')}
                >
                  <SelectTrigger id="isPrimary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@school.edu"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter at least an email or a phone number.
            </p>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Best time to call, alternate number, relationship…"
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
                Add contact
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddContactPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params?.schoolId ?? '';

  return (
    <PermissionGuard module="schools_network.contacts" action="create">
      <ContentLayout title="Add Contact">
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
              <BreadcrumbPage>Add Contact</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <AddContactForm schoolId={schoolId} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
