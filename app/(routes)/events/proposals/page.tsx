/**
 * Event Proposals — list / management view
 *
 * RLS on `event_proposals` already filters visibility:
 *   - is_super_admin() OR is_admin() → see all
 *   - proposer_id = auth.uid()       → see own
 *   - user_has_permission('events.proposals.view') AND
 *     role_has_institution_access(institution_id) → see scoped
 *
 * So we just SELECT * and let the database do the gating.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, CalendarDays } from 'lucide-react';
import { ProposalsClient } from './_components/proposals-client';

export default async function EventProposalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ContentLayout title="Event Proposals">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Please sign in to view proposals.</p>
        </div>
      </ContentLayout>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, full_name, email')
    .eq('id', user.id)
    .single();

  const isAdminRole =
    profile?.role === 'super_admin' || profile?.role === 'admin';

  // RLS gates this — no need for app-level institution filtering.
  const { data: proposals, error } = await supabase
    .from('event_proposals')
    .select(`
      id, title, status, event_date, venue, audience,
      expected_attendance, budget_band, decision_notes,
      decided_at, created_at, institution_id, proposer_id,
      sender_email, sender_role,
      institution:institutions(id, name),
      proposer:profiles!proposer_id(id, full_name, email)
    `)
    .order('created_at', { ascending: false });

  return (
    <ContentLayout title="Event Proposals">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/events">Events</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Proposals</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between mb-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/events"><ArrowLeft className="mr-1 h-4 w-4" />Back to Events</Link>
          </Button>
          <h1 className="text-2xl font-bold">Event Proposals</h1>
          <p className="text-sm text-muted-foreground">
            {isAdminRole
              ? 'Review and decide on event proposals across institutions.'
              : 'Track the proposals you have submitted.'}
          </p>
        </div>
        <Button asChild>
          <Link href="/events/propose">
            <Plus className="h-4 w-4 mr-1.5" />
            New Proposal
          </Link>
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Failed to load proposals: {error.message}
          </CardContent>
        </Card>
      ) : !proposals || proposals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No proposals yet</p>
            <p className="text-sm mt-1">Submit a proposal to get started.</p>
            <Button asChild className="mt-4">
              <Link href="/events/propose">
                <Plus className="h-4 w-4 mr-1.5" />
                Create First Proposal
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ProposalsClient
          initialProposals={proposals as never[]}
          isAdminRole={isAdminRole}
          currentUserId={profile?.id ?? user.id}
        />
      )}
    </ContentLayout>
  );
}
