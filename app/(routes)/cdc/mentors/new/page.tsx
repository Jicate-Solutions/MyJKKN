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
import { useCreateMentorPairing } from '@/hooks/cdc/use-cdc-mentors';

export default function NewMentorPairingPage() {
  const router = useRouter();
  const createPairing = useCreateMentorPairing();

  const [mentorId, setMentorId] = useState('');
  const [menteeId, setMenteeId] = useState('');
  const [notes, setNotes] = useState('');

  const sameIds = mentorId.trim() !== '' && mentorId.trim() === menteeId.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mentorId.trim() || !menteeId.trim() || sameIds) return;

    await createPairing.mutateAsync({
      mentor_learner_id: mentorId.trim(),
      mentee_learner_id: menteeId.trim(),
      notes: notes || undefined,
    });

    router.push('/cdc/mentors');
  };

  return (
    <PermissionGuard module="cdc.mentors" action="create">
    <ContentLayout title="New Mentor Pairing">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/cdc/mentors">Mentor Pairings</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>New Pairing</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-lg">
        <h1 className="text-2xl font-semibold mb-6">Create Mentor Pairing</h1>
        <p className="text-sm text-gray-500 mb-6">
          Pair a senior learner (mentor) with a fresher learner (mentee) for peer mentoring.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Pairing Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="mentor_id">Mentor Learner ID <span className="text-red-500">*</span></Label>
                <Input
                  id="mentor_id"
                  value={mentorId}
                  onChange={e => setMentorId(e.target.value)}
                  placeholder="UUID of the senior learner (mentor)"
                  required
                />
                <p className="text-xs text-gray-400">This is the senior learner who will guide the mentee.</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="mentee_id">Mentee Learner ID <span className="text-red-500">*</span></Label>
                <Input
                  id="mentee_id"
                  value={menteeId}
                  onChange={e => setMenteeId(e.target.value)}
                  placeholder="UUID of the fresher learner (mentee)"
                  required
                />
                <p className="text-xs text-gray-400">This is the fresher learner receiving guidance.</p>
              </div>

              {sameIds && (
                <p className="text-sm text-red-600">Mentor and mentee must be different learners.</p>
              )}

              <div className="space-y-1">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any context for this pairing..."
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={createPairing.isPending || !mentorId.trim() || !menteeId.trim() || sameIds}
            >
              {createPairing.isPending ? 'Creating...' : 'Create Pairing'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push('/cdc/mentors')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
