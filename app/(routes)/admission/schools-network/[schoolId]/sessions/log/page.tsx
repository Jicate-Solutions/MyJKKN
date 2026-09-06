'use client';

/**
 * Schools Network — Log Session form.
 *
 * Calls POST /api/schools-network/schools/:id/sessions per spec §7.5.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarCheck, Loader2 } from 'lucide-react';

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

import { listSessionTypes, logSession } from '../../../_lib/api';
import type { CreateSessionInput } from '../../../_lib/types';

function LogSessionForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const typesQuery = useQuery({
    queryKey: ['schools-network', 'session-types'],
    queryFn: () => listSessionTypes(),
  });

  const [sessionTypeCode, setSessionTypeCode] = useState<string>('');
  const [conductedAt, setConductedAt] = useState<string>(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [attendeeCount, setAttendeeCount] = useState<string>('0');
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: (input: CreateSessionInput) => logSession(schoolId, input),
    onSuccess: () => {
      toast.success('Session logged');
      queryClient.invalidateQueries({ queryKey: ['schools-network'] });
      router.push(`/admission/schools-network/${schoolId}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to log session');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTypeCode) {
      toast.error('Pick a session type');
      return;
    }
    mutation.mutate({
      sessionTypeCode,
      conductedAt: new Date(conductedAt).toISOString(),
      attendeeCount: Math.max(0, parseInt(attendeeCount, 10) || 0),
      topic: topic.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const types = typesQuery.data?.rows ?? [];

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
            <CalendarCheck className="h-5 w-5" /> Log a session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sessionType">Session type *</Label>
              <Select value={sessionTypeCode} onValueChange={setSessionTypeCode}>
                <SelectTrigger id="sessionType">
                  <SelectValue placeholder="Pick a type" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.code}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="conductedAt">When *</Label>
                <Input
                  id="conductedAt"
                  type="datetime-local"
                  value={conductedAt}
                  onChange={(e) => setConductedAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendeeCount">Attendee count</Label>
                <Input
                  id="attendeeCount"
                  type="number"
                  min={0}
                  value={attendeeCount}
                  onChange={(e) => setAttendeeCount(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic">Topic (optional)</Label>
              <Input
                id="topic"
                placeholder="e.g. Career counselling for class 12"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={5}
                placeholder="What happened, who from JKKN attended, follow-ups..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
                Log session
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LogSessionPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params?.schoolId ?? '';

  return (
    <PermissionGuard module="schools_network.sessions" action="create">
      <ContentLayout title="Log Session">
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
              <BreadcrumbPage>Log Session</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <LogSessionForm schoolId={schoolId} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
