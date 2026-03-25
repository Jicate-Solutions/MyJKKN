'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Award,
  Users,
  Shield,
  ClipboardCheck,
  Plus,
  Save,
  Loader2,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  usePrivilegeReviews,
  useSaveAsTemplate,
} from '@/hooks/academic/use-privileges';
import toast from 'react-hot-toast';
import type { PrivilegeMemberStatus, PrivilegeMember, PrivilegeReview } from '@/types/privileges';

const memberStatusConfig: Record<
  PrivilegeMemberStatus,
  { label: string; className: string }
> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
  under_review: {
    label: 'Under Review',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  },
  revoked: { label: 'Revoked', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
};

const groupStatusConfig: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
  expired: { label: 'Expired', className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' },
  archived: { label: 'Archived', className: 'bg-gray-100 text-gray-800 hover:bg-gray-100' },
};

export default function PrivilegeGroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const { userProfile } = usePermissions();

  const { data: group, isLoading: groupLoading } = usePrivilegeGroup(groupId);
  const { data: membersData, isLoading: membersLoading } = usePrivilegeMembers(groupId);
  const { data: reviews, isLoading: reviewsLoading } = usePrivilegeReviews(groupId);
  const saveAsTemplate = useSaveAsTemplate();

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Handle both array and paginated response shapes
  const membersList: PrivilegeMember[] = Array.isArray(membersData)
    ? membersData
    : (membersData as { data?: PrivilegeMember[] })?.data ?? [];
  const reviewsList: PrivilegeReview[] = Array.isArray(reviews) ? reviews : [];

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    saveAsTemplate.mutate(
      { groupId, templateName: templateName.trim() },
      {
        onSuccess: () => {
          setTemplateDialogOpen(false);
          setTemplateName('');
        },
      }
    );
  };

  if (groupLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!group) {
    return (
      <ContentLayout title="Not Found">
        <div className="flex flex-col items-center justify-center py-16">
          <Award className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            Privilege group not found
          </h3>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/academic/privileges')}
          >
            Back to Groups
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const statusInfo = groupStatusConfig[group.status] || groupStatusConfig.active;

  return (
    <ContentLayout title={group.name}>
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
              <BreadcrumbPage>{group.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Header Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Award className="h-6 w-6 text-amber-600" />
                  <h2 className="text-2xl font-bold">{group.name}</h2>
                  <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                </div>
                {group.description && (
                  <p className="text-muted-foreground">{group.description}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    Code:{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      {group.reference_code}
                    </code>
                  </span>
                  <span>Members: {group.member_count ?? membersList.length}</span>
                  <span>Created: {format(new Date(group.created_at), 'dd MMM yyyy')}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/academic/privileges/${groupId}/members`)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Members
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/academic/privileges/${groupId}/review`)}
                >
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Start Review
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTemplateDialogOpen(true)}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save as Template
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members" className="gap-1.5">
              <Users className="h-4 w-4" />
              Members
            </TabsTrigger>
            <TabsTrigger value="privileges" className="gap-1.5">
              <Shield className="h-4 w-4" />
              Privileges
            </TabsTrigger>
            <TabsTrigger value="reviews" className="gap-1.5">
              <ClipboardCheck className="h-4 w-4" />
              Reviews
            </TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Members ({membersList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {membersLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : membersList.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No members yet.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() =>
                        router.push(`/academic/privileges/${groupId}/members`)
                      }
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Members
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Learner Name</TableHead>
                          <TableHead>Roll Number</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Start Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {membersList.map((member) => {
                          const mStatus =
                            memberStatusConfig[member.status] || memberStatusConfig.active;
                          return (
                            <TableRow key={member.id}>
                              <TableCell className="font-medium">
                                {member.learner?.full_name ||
                                  `${member.learner?.first_name || ''} ${member.learner?.last_name || ''}`.trim() ||
                                  'Unknown'}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {member.learner?.roll_number || '-'}
                              </TableCell>
                              <TableCell>
                                <Badge className={mStatus.className}>{mStatus.label}</Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(member.start_date), 'dd MMM yyyy')}
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
          </TabsContent>

          {/* Privileges Tab */}
          <TabsContent value="privileges" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Assigned Privilege Types ({group.privilege_types?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!group.privilege_types || group.privilege_types.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No privilege types assigned.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {group.privilege_types.map((pgt) => (
                      <div
                        key={pgt.id}
                        className="flex items-start gap-3 rounded-lg border p-4"
                      >
                        <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {pgt.privilege_type?.name || 'Unknown Type'}
                            </span>
                            {pgt.privilege_type?.category && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground capitalize">
                                {pgt.privilege_type.category}
                              </span>
                            )}
                          </div>
                          {pgt.privilege_type?.description && (
                            <p className="text-xs text-muted-foreground">
                              {pgt.privilege_type.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Review History ({reviewsList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reviewsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : reviewsList.length === 0 ? (
                  <div className="text-center py-8">
                    <ClipboardCheck className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No reviews yet.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() =>
                        router.push(`/academic/privileges/${groupId}/review`)
                      }
                    >
                      Start Review
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviewsList.map((review) => (
                      <div
                        key={review.id}
                        className="flex items-start gap-4 rounded-lg border p-4"
                      >
                        <div className="rounded-full bg-blue-100 p-2">
                          <ClipboardCheck className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              Review by {review.reviewer?.full_name || 'Unknown'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(review.review_date), 'dd MMM yyyy')}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-green-600">
                              {review.members_kept} kept
                            </span>
                            <span className="text-red-600">
                              {review.members_revoked} revoked
                            </span>
                            <span className="text-muted-foreground">
                              {review.members_reviewed} reviewed
                            </span>
                          </div>
                          {review.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {review.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Save as Template Dialog */}
        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save as Template</DialogTitle>
              <DialogDescription>
                Save this group configuration as a reusable template for future groups.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                placeholder="e.g., Standard AI Privilege Template"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTemplateDialogOpen(false)}
                disabled={saveAsTemplate.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAsTemplate}
                disabled={saveAsTemplate.isPending}
              >
                {saveAsTemplate.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
