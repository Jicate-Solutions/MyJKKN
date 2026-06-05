'use client';

// block-colleges-card.tsx
//
// Manages which colleges share a hostel block (hostel_block_institutions).
// This is the SINGLE institution-access surface for hostel rooms since
// 2026-06-03 — it replaces the retired per-room "Manage Access" dialog
// (room_institution_access). A learner can be allocated to any room in a
// block linked to their college here; cohort-level reservations live
// separately under Program Eligibility → Physical Rooms.
//
// Per memory `feedback_institution_dropdowns_use_local_not_jkkn_api`, the
// picker reads the local `institutions` table (not the JKKN API) so the ids
// are real UUIDs that fit hostel_block_institutions.institution_id.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2, Star, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useBlockInstitutions,
  useAddBlockInstitution,
  useRemoveBlockInstitution,
  useSetPrimaryBlockInstitution,
} from '@/hooks/campus-living/use-hostel-blocks';

interface InstitutionRow {
  id: string;
  name: string;
}

export function BlockCollegesCard({ blockId }: { blockId: string }) {
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');

  const { data: colleges, isLoading } = useBlockInstitutions(blockId);
  const addMutation = useAddBlockInstitution(blockId);
  const removeMutation = useRemoveBlockInstitution(blockId);
  const setPrimaryMutation = useSetPrimaryBlockInstitution(blockId);

  // Local institutions catalog for the picker (super-admin sees all; scoped
  // admins see their accessible set — RLS handles it).
  const { data: institutions, isLoading: institutionsLoading } = useQuery<InstitutionRow[]>({
    queryKey: ['institutions', 'for-block-colleges-picker'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data ?? []) as InstitutionRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const linkedIds = useMemo(
    () => new Set((colleges ?? []).map((c) => c.institution_id)),
    [colleges],
  );

  const addableInstitutions = useMemo(
    () => (institutions ?? []).filter((i) => !linkedIds.has(i.id)),
    [institutions, linkedIds],
  );

  const handleAdd = () => {
    if (!selectedInstitutionId || addMutation.isPending) return;
    addMutation.mutate(selectedInstitutionId, {
      onSuccess: () => setSelectedInstitutionId(''),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-blue-600" />
          Colleges using this block
        </CardTitle>
        <CardDescription>
          Learners from a linked college can be allocated to any room in this
          block. Reserve specific rooms or floors for a cohort under{' '}
          <span className="font-medium">Settings → Program Eligibility → Physical Rooms</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current colleges */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : (colleges ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No colleges linked yet. Rooms in this block are not allocatable to
            any college until you add one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {(colleges ?? []).map((c) => (
              <li
                key={c.institution_id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {c.institution_name ?? c.institution_id}
                  </span>
                  {c.is_primary && (
                    <Badge variant="secondary" className="gap-1">
                      <Star className="h-3 w-3 fill-current" /> Primary
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!c.is_primary && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (setPrimaryMutation.isPending) return;
                        setPrimaryMutation.mutate(c.institution_id);
                      }}
                      disabled={setPrimaryMutation.isPending}
                    >
                      <Star className="mr-1 h-3 w-3" /> Make primary
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove college"
                    className="h-8 w-8 hover:bg-destructive/10"
                    onClick={() => {
                      if (removeMutation.isPending) return;
                      removeMutation.mutate(c.institution_id);
                    }}
                    disabled={removeMutation.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add a college */}
        <div className="flex gap-2 border-t pt-4">
          <Select
            value={selectedInstitutionId}
            onValueChange={setSelectedInstitutionId}
            disabled={institutionsLoading || addableInstitutions.length === 0}
          >
            <SelectTrigger className="flex-1">
              <SelectValue
                placeholder={
                  institutionsLoading
                    ? 'Loading colleges…'
                    : addableInstitutions.length === 0
                      ? 'All colleges already linked'
                      : 'Select a college to add…'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {addableInstitutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={!selectedInstitutionId || addMutation.isPending}
          >
            {addMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : null}
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
