'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useCreateClub } from '@/hooks/cdc/use-cdc-clubs';

const CLUB_TYPES = [
  { value: 'technical', label: 'Technical' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'sports', label: 'Sports' },
  { value: 'literary', label: 'Literary' },
  { value: 'social', label: 'Social Service' },
  { value: 'entrepreneurship', label: 'Entrepreneurship' },
  { value: 'other', label: 'Other' },
];

export default function NewClubPage() {
  const router = useRouter();
  const createClub = useCreateClub();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clubType, setClubType] = useState('');
  const [formedOn, setFormedOn] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await createClub.mutateAsync({
      name: name.trim(),
      description: description || undefined,
      club_type: clubType || undefined,
      formed_on: formedOn || undefined,
    });

    router.push('/cdc/clubs');
  };

  return (
    <PermissionGuard module="cdc.clubs" action="create">
    <ContentLayout title="New Club">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/cdc/clubs">Clubs</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>New Club</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-lg">
        <h1 className="text-2xl font-semibold mb-6">Create Club</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Club Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="name">Club Name <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Robotics Club"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="club_type">Type</Label>
                <Select onValueChange={setClubType}>
                  <SelectTrigger id="club_type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLUB_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What is this club about?"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="formed_on">Founded On</Label>
                <Input
                  id="formed_on"
                  type="date"
                  value={formedOn}
                  onChange={e => setFormedOn(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" disabled={createClub.isPending || !name.trim()}>
              {createClub.isPending ? 'Creating...' : 'Create Club'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push('/cdc/clubs')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
