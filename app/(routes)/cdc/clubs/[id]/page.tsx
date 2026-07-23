'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { useClubById, useClubMembers, useAddMember, useRemoveMember, useUpdateClub } from '@/hooks/cdc/use-cdc-clubs';
import { useLearnersForPicker } from '@/hooks/cdc/use-cdc-pickers';
import { ClubInitiativesCard } from './_components/club-initiatives-card';
import { BeatLoader } from 'react-spinners';
import { Users, Plus, Trash2, ArrowLeft, UserCheck } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ClubDetailPage(props: PageProps) {
  return (
    <PermissionGuard module="cdc.clubs" action="view">
      <ClubDetailContent {...props} />
    </PermissionGuard>
  );
}

function ClubDetailContent({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: club, isLoading, error } = useClubById(id);
  const { data: members, isLoading: membersLoading } = useClubMembers(id);
  const addMember = useAddMember(id);
  const removeMember = useRemoveMember(id);
  const updateClub = useUpdateClub(id);
  const { data: learnerOptions, isLoading: learnersLoading } = useLearnersForPicker();

  const [newLearnerId, setNewLearnerId] = useState('');

  const handleAddMember = async () => {
    if (!newLearnerId.trim()) return;
    await addMember.mutateAsync({ learner_id: newLearnerId.trim() });
    setNewLearnerId('');
  };

  const handleToggleActive = async () => {
    if (!club) return;
    await updateClub.mutateAsync({ is_active: !club.is_active });
  };

  if (isLoading) {
    return (
      <ContentLayout title="Club">
        <div className="flex justify-center py-20"><BeatLoader color="#3b82f6" /></div>
      </ContentLayout>
    );
  }

  if (error || !club) {
    return (
      <ContentLayout title="Club">
        <p className="text-red-600 mt-6">{error?.message ?? 'Club not found'}</p>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={club.name}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/cdc/clubs">Clubs</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{club.name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <button
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
              onClick={() => router.push('/cdc/clubs')}
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{club.name}</h1>
              {!club.is_active && (
                <Badge variant="outline" className="text-gray-500">Inactive</Badge>
              )}
            </div>
            {club.club_type && (
              <p className="text-sm text-gray-500 capitalize">{club.club_type}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleActive}
            disabled={updateClub.isPending}
          >
            {club.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>

        {/* Club info */}
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm text-gray-700">
            {club.description && <p>{club.description}</p>}
            <div className="flex gap-4 text-gray-500">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" /> {club.member_count} active members
              </span>
              {club.formed_on && (
                <span>Founded {new Date(club.formed_on).toLocaleDateString()}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Members */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="w-4 h-4" /> Members
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add member */}
            <div className="flex gap-2">
              <SearchableSelect
                value={newLearnerId}
                onValueChange={setNewLearnerId}
                options={learnerOptions ?? []}
                loading={learnersLoading}
                placeholder="Search learner by name or register number…"
                className="w-full"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAddMember}
                disabled={addMember.isPending || !newLearnerId.trim()}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>

            {membersLoading && (
              <div className="flex justify-center py-4"><BeatLoader color="#3b82f6" size={8} /></div>
            )}

            {!membersLoading && (members ?? []).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No members yet</p>
            )}

            {!membersLoading && (members ?? []).map(m => {
              const learner = m.learner as { name?: string; roll_number?: string } | null;
              return (
                <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{learner?.name ?? m.learner_id}</p>
                    {learner?.roll_number && (
                      <p className="text-xs text-gray-400">{learner.roll_number}</p>
                    )}
                    <Badge variant={m.role === 'lead' ? 'default' : 'secondary'} className="text-xs mt-1">
                      {m.role}
                    </Badge>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove member?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will mark {learner?.name ?? 'this learner'} as inactive in the club.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removeMember.mutate(m.learner_id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Initiatives (BUG-004299) */}
        <ClubInitiativesCard clubId={id} institutionId={club.institution_id} />
      </div>
    </ContentLayout>
  );
}
