'use client';

import { useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardCheck,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePrivilegeGroup,
  usePrivilegeMembers,
  useCreateReview,
} from '@/hooks/academic/use-privileges';
import toast from 'react-hot-toast';
import type { PrivilegeMember } from '@/types/privileges';

type Decision = 'keep' | 'under_review' | 'revoke';

interface MemberDecision {
  member_id: string;
  decision: Decision;
  notes: string;
}

export default function PrivilegeReviewPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const { userProfile } = usePermissions();

  const { data: group, isLoading: groupLoading } = usePrivilegeGroup(groupId);
  const { data: membersData, isLoading: membersLoading } = usePrivilegeMembers(groupId, {
    status: 'active',
  });
  const createReview = useCreateReview(groupId);

  // Handle both array and paginated shapes
  const activeMembers: PrivilegeMember[] = Array.isArray(membersData)
    ? membersData
    : (membersData as { data?: PrivilegeMember[] })?.data ?? [];

  // Decision state per member
  const [decisions, setDecisions] = useState<Record<string, MemberDecision>>({});
  const [reviewNotes, setReviewNotes] = useState('');

  const getDecision = (memberId: string): Decision => {
    return decisions[memberId]?.decision || 'keep';
  };

  const getMemberNotes = (memberId: string): string => {
    return decisions[memberId]?.notes || '';
  };

  const setMemberDecision = (memberId: string, decision: Decision) => {
    setDecisions((prev) => ({
      ...prev,
      [memberId]: {
        member_id: memberId,
        decision,
        notes: prev[memberId]?.notes || '',
      },
    }));
  };

  const setMemberNotes = (memberId: string, notes: string) => {
    setDecisions((prev) => ({
      ...prev,
      [memberId]: {
        member_id: memberId,
        decision: prev[memberId]?.decision || 'keep',
        notes,
      },
    }));
  };

  // Summary counts
  const summary = useMemo(() => {
    const memberDecisions = activeMembers.map((m) => getDecision(m.id));
    return {
      keep: memberDecisions.filter((d) => d === 'keep').length,
      under_review: memberDecisions.filter((d) => d === 'under_review').length,
      revoke: memberDecisions.filter((d) => d === 'revoke').length,
      total: activeMembers.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembers, decisions]);

  const handleSubmit = () => {
    if (activeMembers.length === 0) {
      toast.error('No active members to review');
      return;
    }

    const memberDecisionsList = activeMembers.map((m) => ({
      member_id: m.id,
      decision: getDecision(m.id),
      notes: getMemberNotes(m.id) || undefined,
      revoke_reason:
        getDecision(m.id) === 'revoke' ? getMemberNotes(m.id) || undefined : undefined,
    }));

    createReview.mutate(
      {
        group_id: groupId,
        reviewer_id: userProfile?.id || '',
        notes: reviewNotes.trim() || undefined,
        member_decisions: memberDecisionsList,
      },
      {
        onSuccess: () => {
          router.push(`/academic/privileges/${groupId}`);
        },
      }
    );
  };

  const isLoading = groupLoading || membersLoading;

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Semester Review${group ? ` - ${group.name}` : ''}`}>
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic/privileges">Privileges</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/academic/privileges/${groupId}`}>
                {group?.name || 'Group'}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Review</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Review Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Review Active Members ({activeMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeMembers.length === 0 ? (
              <div className="text-center py-8">
                <ClipboardCheck className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No active members to review.
                </p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Learner Name</TableHead>
                      <TableHead className="min-w-[120px]">Roll Number</TableHead>
                      <TableHead className="min-w-[280px]">Decision</TableHead>
                      <TableHead className="min-w-[200px]">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeMembers.map((member) => {
                      const name =
                        member.learner?.full_name ||
                        `${member.learner?.first_name || ''} ${member.learner?.last_name || ''}`.trim() ||
                        'Unknown';
                      const currentDecision = getDecision(member.id);
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.learner?.roll_number || '-'}
                          </TableCell>
                          <TableCell>
                            <RadioGroup
                              value={currentDecision}
                              onValueChange={(v) =>
                                setMemberDecision(member.id, v as Decision)
                              }
                              className="flex items-center gap-4"
                            >
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem value="keep" id={`keep-${member.id}`} />
                                <Label
                                  htmlFor={`keep-${member.id}`}
                                  className="text-sm font-normal cursor-pointer text-green-700"
                                >
                                  Keep
                                </Label>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem
                                  value="under_review"
                                  id={`review-${member.id}`}
                                />
                                <Label
                                  htmlFor={`review-${member.id}`}
                                  className="text-sm font-normal cursor-pointer text-yellow-700"
                                >
                                  Under Review
                                </Label>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem
                                  value="revoke"
                                  id={`revoke-${member.id}`}
                                />
                                <Label
                                  htmlFor={`revoke-${member.id}`}
                                  className="text-sm font-normal cursor-pointer text-red-700"
                                >
                                  Revoke
                                </Label>
                              </div>
                            </RadioGroup>
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Optional notes..."
                              value={getMemberNotes(member.id)}
                              onChange={(e) =>
                                setMemberNotes(member.id, e.target.value)
                              }
                              className="h-8 text-sm"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Review Notes + Summary */}
        {activeMembers.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Overall Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Add overall notes for this review..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={4}
                />
              </CardContent>
            </Card>

            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Keep</span>
                    </div>
                    <span className="text-sm font-medium text-green-600">
                      {summary.keep}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">Under Review</span>
                    </div>
                    <span className="text-sm font-medium text-yellow-600">
                      {summary.under_review}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm">Revoke</span>
                    </div>
                    <span className="text-sm font-medium text-red-600">
                      {summary.revoke}
                    </span>
                  </div>
                  <div className="border-t pt-3 flex items-center justify-between">
                    <span className="text-sm font-medium">Total Reviewed</span>
                    <span className="text-sm font-medium">{summary.total}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Submit */}
        {activeMembers.length > 0 && (
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => router.push(`/academic/privileges/${groupId}`)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createReview.isPending}
            >
              {createReview.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Submit Review
            </Button>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
