'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateMentorPairing } from '@/hooks/cdc/use-cdc-mentors';
import { useLearnersForPicker } from '@/hooks/cdc/use-cdc-pickers';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// Self-contained read of the cdc_mentorship_categories config-master
// (BUG-004094). Kept inline here — NOT in the shared cdc-pickers hook —
// so this form owns its own data source and stays conflict-free with the
// other CDC config-master wirings landing in sibling PRs. RLS on the
// master allows any authenticated user to SELECT (auth.uid() IS NOT NULL),
// so the session-scoped browser anon client reads it directly.
//
// The client is narrowed to the plain (untyped) SupabaseClient before the
// query: cdc_mentorship_categories is not yet in the generated Database
// type (types/supabase.ts), and calling .from() for an unknown table on the
// typed client trips TS2589 "excessively deep instantiation". This mirrors
// the foundation's cdc-admin-service, which types its master reads with the
// plain SupabaseClient for the same reason.
function useMentorshipCategoryOptions() {
  return useQuery<SearchableSelectOption[]>({
    queryKey: ['cdc-mentorship-category-options'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as unknown as SupabaseClient;
      const { data, error } = await supabase
        .from('cdc_mentorship_categories')
        .select('id, display_name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ id: string; display_name: string }>).map((row) => ({
        value: row.id,
        label: row.display_name,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function NewMentorPairingPage() {
  const router = useRouter();
  const createPairing = useCreateMentorPairing();
  const { data: learnerOptions = [], isLoading: learnersLoading } = useLearnersForPicker();
  const { data: categoryOptions = [], isLoading: categoriesLoading } = useMentorshipCategoryOptions();

  const [mentorId, setMentorId] = useState('');
  const [menteeId, setMenteeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');

  const sameIds = mentorId.trim() !== '' && mentorId.trim() === menteeId.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mentorId.trim() || !menteeId.trim() || !categoryId.trim() || sameIds) return;

    await createPairing.mutateAsync({
      mentor_learner_id: mentorId.trim(),
      mentee_learner_id: menteeId.trim(),
      mentorship_category_id: categoryId.trim(),
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
          Pair a peer mentor with a fresher learner (mentee) for peer mentoring.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Pairing Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="mentor_id">Peer Mentor <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  value={mentorId}
                  onValueChange={setMentorId}
                  options={learnerOptions}
                  placeholder="Search the peer mentor…"
                  searchPlaceholder="Type to search learners…"
                  emptyMessage="No matching learners"
                  loading={learnersLoading}
                  className="w-full"
                />
                <p className="text-xs text-gray-400">This is the peer mentor who will guide the mentee.</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="mentee_id">Mentee (fresher learner) <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  value={menteeId}
                  onValueChange={setMenteeId}
                  options={learnerOptions}
                  placeholder="Search the fresher learner…"
                  searchPlaceholder="Type to search learners…"
                  emptyMessage="No matching learners"
                  loading={learnersLoading}
                  className="w-full"
                />
                <p className="text-xs text-gray-400">This is the fresher learner receiving guidance.</p>
              </div>

              {sameIds && (
                <p className="text-sm text-red-600">Mentor and mentee must be different learners.</p>
              )}

              <div className="space-y-1">
                <Label htmlFor="category_id">Mentorship category <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  value={categoryId}
                  onValueChange={setCategoryId}
                  options={categoryOptions}
                  placeholder="Select the mentorship category…"
                  searchPlaceholder="Type to search categories…"
                  emptyMessage="No matching categories"
                  loading={categoriesLoading}
                  className="w-full"
                />
                <p className="text-xs text-gray-400">The domain this mentorship covers (Academic, Career, Technical, Entrepreneurship).</p>
              </div>

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
              disabled={createPairing.isPending || !mentorId.trim() || !menteeId.trim() || !categoryId.trim() || sameIds}
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
