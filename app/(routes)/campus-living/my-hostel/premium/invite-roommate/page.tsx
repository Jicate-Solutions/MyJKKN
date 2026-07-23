// ============================================================================
// PREMIUM STAY — INVITE ROOMMATE (learner-facing, Phase 2)
// ============================================================================
// Created: 2026-05-19
//
// Flow:
//   1. Learner arrives here after reserving a premium bed
//      (?allocation=<id>) OR directly from /campus-living/my-hostel/premium
//      to send an invite for an existing premium allocation.
//   2. Search learners by name / register_number (same-institution scope).
//   3. Select a learner → send invite via fn_premium_create_invite RPC.
//   4. Existing pending/historical invites for this learner are shown
//      below in an invites table (sent + received).
//   5. Received invites show Accept / Decline buttons.
// ============================================================================

'use client';

export const navMeta = {
  label: 'Premium Stay — Invite Roommate',
  icon: 'Users',
  invokedFrom: '/campus-living/my-hostel/premium',
} as const;

import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useInviteRoommate,
  useConfirmRoommate,
  useDeclineRoommate,
  useLearnerPremiumInvites,
} from '@/hooks/campus-living/use-premium-allocation';
import {
  Users,
  Search,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface LearnerSearchResult {
  id: string;
  full_name: string | null;
  email: string;
  register_number: string | null;
  gender: string | null;
}

const inviteStatusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <Badge variant='secondary'><Clock className='h-3 w-3 mr-1' />Pending</Badge>;
    case 'accepted':
      return <Badge variant='success'><CheckCircle2 className='h-3 w-3 mr-1' />Accepted</Badge>;
    case 'declined':
      return <Badge variant='outline'><XCircle className='h-3 w-3 mr-1' />Declined</Badge>;
    case 'expired':
      return <Badge variant='outline'>Expired</Badge>;
    case 'cancelled':
      return <Badge variant='outline'>Cancelled</Badge>;
    default:
      return <Badge variant='outline'>{status}</Badge>;
  }
};

export default function InviteRoommatePage() {
  const searchParams = useSearchParams();
  const allocationIdParam = searchParams.get('allocation');
  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const institutionId = profile?.institution_id ?? null;

  // Find inviter's active premium allocation (param-provided OR auto-discover)
  const { data: allocations, isLoading: allocLoading } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', userId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(userId, true),
    enabled: !!userId,
  });

  const activeAllocation = useMemo(() => {
    const list = (allocations ?? []) as any[];
    if (allocationIdParam) {
      return list.find((a) => a.id === allocationIdParam) ?? list[0];
    }
    return list[0];
  }, [allocations, allocationIdParam]);

  // Learner search
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedTerm(searchTerm.trim()), 250);
    return () => clearTimeout(id);
  }, [searchTerm]);

  const { data: searchResults, isFetching: searchLoading } = useQuery<LearnerSearchResult[]>({
    queryKey: ['premium-invite-learner-search', institutionId, debouncedTerm],
    queryFn: async () => {
      if (!institutionId || debouncedTerm.length < 2) return [];
      const supabase = createClientSupabaseClient();
      // Join profiles + learners_profiles to get register_number + gender.
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, learner_id, learners_profiles!profiles_learner_id_fkey(register_number, gender)')
        .eq('institution_id', institutionId)
        .neq('id', userId)
        .or(`full_name.ilike.%${debouncedTerm}%,email.ilike.%${debouncedTerm}%`)
        .limit(15);
      if (error) throw error;
      return ((data ?? []) as any[]).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        register_number: p.learners_profiles?.register_number ?? null,
        gender: p.learners_profiles?.gender ?? null,
      }));
    },
    enabled: !!institutionId && debouncedTerm.length >= 2,
  });

  const inviteMutation = useInviteRoommate();
  const confirmMutation = useConfirmRoommate();
  const declineMutation = useDeclineRoommate();

  const { data: invites, isLoading: invitesLoading } =
    useLearnerPremiumInvites(userId);

  async function handleInvite(invited: LearnerSearchResult) {
    if (!activeAllocation?.id) return;
    await inviteMutation.mutateAsync({
      allocationId: activeAllocation.id,
      inviterLearnerId: userId,
      invitedLearnerId: invited.id,
    });
    setSearchTerm('');
  }

  if (allocLoading) {
    return (
      <ContentLayout title='Premium Stay — Invite Roommate'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  // No active allocation → block invite form, but still show received invites.
  const isPremiumAllocation = !!activeAllocation?.tier_id;

  return (
    <ContentLayout title='Premium Stay — Invite Roommate'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'My Hostel', href: '/campus-living/my-hostel' },
          { label: 'Premium Stay', href: '/campus-living/my-hostel/premium' },
          { label: 'Invite Roommate' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex items-start gap-3'>
          <Users className='h-7 w-7 text-primary mt-1' />
          <div>
            <h1 className='text-2xl font-bold py-1'>Invite a Roommate</h1>
            <p className='text-sm text-muted-foreground max-w-2xl'>
              Invite a same-gender, same-college learner to share your premium
              room. Invites expire after 48 hours and you have up to 2 retries
              per learner.
            </p>
          </div>
        </div>

        {/* Inviter form */}
        {!isPremiumAllocation ? (
          <Card className='border-amber-200 bg-amber-50/50'>
            <CardContent className='p-4 flex items-start gap-3'>
              <AlertCircle className='h-5 w-5 text-amber-600 mt-0.5' />
              <div className='text-sm'>
                <p className='font-medium text-amber-900'>
                  You don't have an active premium allocation.
                </p>
                <p className='text-amber-700 mt-1'>
                  Pick a premium room first.{' '}
                  <Link
                    href='/campus-living/my-hostel/premium'
                    className='underline underline-offset-2'
                  >
                    Browse premium tiers
                  </Link>
                  .
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Send a new invite</CardTitle>
              <CardDescription>
                Search by name or email. Only same-gender, same-college
                learners without an existing premium allocation can be invited.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div>
                <Label htmlFor='learnerSearch'>Search learners</Label>
                <div className='relative'>
                  <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                  <Input
                    id='learnerSearch'
                    placeholder='Type at least 2 characters…'
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className='pl-9'
                  />
                </div>
              </div>

              {debouncedTerm.length >= 2 && (
                <div className='rounded-md border'>
                  {searchLoading ? (
                    <div className='p-6 text-center text-sm text-muted-foreground'>
                      <Loader2 className='h-4 w-4 animate-spin mx-auto mb-1' />
                      Searching…
                    </div>
                  ) : !searchResults || searchResults.length === 0 ? (
                    <div className='p-6 text-center text-sm text-muted-foreground'>
                      No matching learners
                    </div>
                  ) : (
                    <div className='divide-y'>
                      {searchResults.map((learner) => (
                        <div
                          key={learner.id}
                          className='flex items-center justify-between p-3 hover:bg-muted/40'
                        >
                          <div>
                            <div className='font-medium text-sm'>
                              {learner.full_name ?? '(no name)'}
                            </div>
                            <div className='text-xs text-muted-foreground'>
                              {learner.email}
                              {learner.register_number && (
                                <span> • {learner.register_number}</span>
                              )}
                              {learner.gender && (
                                <span className='ml-1 capitalize'>
                                  • {learner.gender}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            size='sm'
                            disabled={inviteMutation.isPending}
                            onClick={() => handleInvite(learner)}
                          >
                            {inviteMutation.isPending ? (
                              <Loader2 className='h-4 w-4 animate-spin' />
                            ) : (
                              <>
                                <Send className='h-4 w-4 mr-1.5' />
                                Invite
                              </>
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Invites table */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Your invites</CardTitle>
            <CardDescription>
              Sent + received. Accept/decline a received invite below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitesLoading ? (
              <div className='flex items-center justify-center py-6'>
                <Loader2 className='h-5 w-5 animate-spin text-primary' />
              </div>
            ) : !invites || invites.length === 0 ? (
              <div className='p-6 text-center text-sm text-muted-foreground'>
                No invites yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Direction</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className='text-right'>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => {
                    const isInbound = invite.invited_learner_id === userId;
                    const counterpartyId = isInbound
                      ? invite.inviter_learner_id
                      : invite.invited_learner_id;
                    return (
                      <TableRow key={invite.id}>
                        <TableCell>
                          <Badge variant={isInbound ? 'default' : 'outline'}>
                            {isInbound ? 'Received' : 'Sent'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <code className='text-[11px]'>{counterpartyId.slice(0, 8)}…</code>
                        </TableCell>
                        <TableCell>{inviteStatusBadge(invite.status)}</TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {formatDistanceToNow(new Date(invite.created_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {invite.status === 'pending'
                            ? formatDistanceToNow(new Date(invite.expires_at), {
                                addSuffix: true,
                              })
                            : '—'}
                        </TableCell>
                        <TableCell className='text-right'>
                          {isInbound && invite.status === 'pending' && (
                            <div className='inline-flex gap-1'>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={confirmMutation.isPending}
                                onClick={() =>
                                  confirmMutation.mutate({
                                    inviteToken: invite.invite_token,
                                    actingLearnerId: userId,
                                  })
                                }
                              >
                                Accept
                              </Button>
                              <Button
                                size='sm'
                                variant='ghost'
                                disabled={declineMutation.isPending}
                                onClick={() =>
                                  declineMutation.mutate({
                                    inviteToken: invite.invite_token,
                                    actingLearnerId: userId,
                                  })
                                }
                              >
                                Decline
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Back to my-hostel */}
        <div>
          <Button asChild variant='outline' size='sm'>
            <Link href='/campus-living/my-hostel'>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back to My Hostel
            </Link>
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
