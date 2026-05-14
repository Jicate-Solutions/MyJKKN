'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { InstitutionPicker, type InstitutionOption } from '../../_components/institution-picker';
import { CourseForm } from '../_components/course-form';
import { useCreateBosCourse } from '@/hooks/bos/use-bos-courses';
import { useBosRegulationOptions } from '@/hooks/bos/use-bos-scheme-options';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';

interface CoeBoard {
  id: string;
  board_code: string;
  board_name: string;
  board_type?: string | null;
}

export default function NewCoursePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin } = usePermissions();

  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const [institutionCode, setInstitutionCode] = useState(searchParams.get('institution_code') ?? '');
  const [myjkknIds, setMyjkknIds] = useState<string[]>([]);
  const [boardId, setBoardId] = useState(searchParams.get('board_id') ?? '');
  const [boardCode, setBoardCode] = useState(searchParams.get('board_code') ?? '');
  const [regulationCode, setRegulationCode] = useState(searchParams.get('regulation_code') ?? '');
  const create = useCreateBosCourse();

  // Skip resetting board+regulation on the very first institution auto-selection.
  const institutionInitialized = useRef(false);
  useEffect(() => {
    if (!institutionInitialized.current) {
      institutionInitialized.current = true;
      return;
    }
    setBoardId('');
    setBoardCode('');
    setRegulationCode('');
  }, [institutionId]);

  // Load boards for the selected institution.
  // Then narrow to the user's bos_members-derived boards (via useBosBoardScope)
  // so an HOD only sees the boards they actually serve on. Super-admin sees all.
  const boardScope = useBosBoardScope();
  const { data: boardsData, isLoading: boardsLoading } = useQuery<{ data: CoeBoard[] }>({
    queryKey: ['bos', 'boards', institutionId],
    enabled: !!institutionId,
    queryFn: async () => {
      const res = await fetch(`/api/bos/boards?institutionsId=${institutionId}`);
      if (!res.ok) return { data: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const allBoards = boardsData?.data ?? [];
  // Filter to the user's own boards (from bos_members → bos_compositions.board_id).
  // Super-admin / principal: all boards. Members/chairman: only theirs.
  const boards = (boardScope.isSuperAdmin || boardScope.isPrincipal)
    ? allBoards
    : allBoards.filter((b) => boardScope.boardsOf.has(b.id));

  // Auto-select when the user has exactly one board.
  useEffect(() => {
    if (boardsLoading || boardScope.isLoading) return;
    if (boardId) return; // already picked / URL-prefilled
    if (boards.length === 1) {
      setBoardId(boards[0].id);
      setBoardCode(boards[0].board_code);
    }
  }, [boards, boardId, boardsLoading, boardScope.isLoading]);

  const handleInstitutionSelect = (opt: InstitutionOption) => {
    setInstitutionCode(opt.institution_code);
    setMyjkknIds(opt.myjkkn_institution_ids);
  };

  // Use MyJKKN IDs if available (CAS Aided+Self); fall back to COE institution UUID.
  const lookupIds = myjkknIds.length > 0 ? myjkknIds : institutionId;
  const { data: regulationsData, isLoading: regulationsLoading } = useBosRegulationOptions(lookupIds);
  const regulations = regulationsData?.data ?? [];

  const ready =
    !!institutionId &&
    institutionCode.trim().length > 0 &&
    boardCode.trim().length > 0 &&
    regulationCode.trim().length > 0;

  return (
    <PermissionGuard module='academic.bos-courses' action='create'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>New Course</CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='flex gap-3 flex-wrap items-end'>
            {/* Visible for super-admins; mounted-but-hidden for others to trigger auto-select. */}
            <div className={isSuperAdmin ? '' : 'hidden'}>
              <InstitutionPicker
                value={institutionId}
                onChange={setInstitutionId}
                onSelect={handleInstitutionSelect}
              />
            </div>

            {/* Board dropdown — enabled once institution is resolved.
                Required so the new course is tagged with board_code, otherwise
                the board-scope filter on /bos/courses hides it from non-admins. */}
            <div className='space-y-1'>
              <Label className='text-xs'>Board</Label>
              <SearchableSelect
                value={boardId}
                onValueChange={(v) => {
                  setBoardId(v);
                  const picked = boards.find((b) => b.id === v);
                  setBoardCode(picked?.board_code ?? '');
                }}
                options={boards.map((b) => ({
                  value: b.id,
                  label: `${b.board_name} (${b.board_code})`,
                }))}
                loading={boardsLoading}
                disabled={!institutionId || (boards.length === 0 && !boardsLoading)}
                placeholder={!institutionId ? 'Select institution first' : 'Select board'}
                searchPlaceholder='Search board…'
                className='w-[220px]'
              />
            </div>

            {/* Regulation dropdown — enabled once institution is resolved. */}
            <div className='space-y-1'>
              <Label className='text-xs'>Regulation</Label>
              <SearchableSelect
                value={regulationCode}
                onValueChange={setRegulationCode}
                options={regulations.map((r) => ({
                  value: r.regulation_code,
                  label: r.regulation_year
                    ? `${r.regulation_code} (${r.regulation_year})`
                    : r.regulation_code,
                }))}
                loading={regulationsLoading}
                disabled={!institutionId || (regulations.length === 0 && !regulationsLoading)}
                placeholder={!institutionId ? 'Select institution first' : 'Select regulation'}
                searchPlaceholder='Search regulation…'
                className='w-[200px]'
              />
            </div>
          </div>

          {!ready && (
            <p className='text-sm text-muted-foreground'>
              {isSuperAdmin
                ? 'Pick an institution and select a regulation to enable the form.'
                : 'Select a regulation to enable the form.'}
            </p>
          )}

          {ready && (
            <CourseForm
              submitting={create.isPending}
              submitLabel='Create Course'
              onSubmit={async (form) => {
                try {
                  const result = await create.mutateAsync({
                    form,
                    context: {
                      institution_id: institutionId!,
                      institution_code: institutionCode,
                      regulation_code: regulationCode,
                      board_id: boardId,
                      board_code: boardCode,
                    },
                  }) as { _upsertAction?: string };
                  toast.success(
                    result?._upsertAction === 'updated'
                      ? 'Course already existed — updated successfully'
                      : 'Course created'
                  );
                  router.push('/bos/courses');
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
