'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { InstitutionPicker, type InstitutionOption } from '../../_components/institution-picker';
import { CourseForm } from '../_components/course-form';
import { useCreateBosCourse } from '@/hooks/bos/use-bos-courses';
import { useBosRegulationOptions } from '@/hooks/bos/use-bos-scheme-options';
import { institutionSkipsPartLevel } from '@/lib/services/bos/courses-schemas';
import { resolveAcademicModel } from '@/lib/services/bos/academic-model';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { useInstitutionContextsByIds } from '@/hooks/use-institution-context';

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

  // Multi-institution membership picker.
  // When a faculty serves on boards across institutions, institutionsOf has
  // more than one id. We resolve each to its full context and render a
  // visible picker so the user can choose which institution to create under.
  // The default `<InstitutionPicker>` only resolves the user's primary
  // institution, so without this they'd be stuck on that one.
  const memberInstitutionIds = useMemo(
    () => (boardScope.isSuperAdmin ? [] : Array.from(boardScope.institutionsOf)),
    [boardScope.isSuperAdmin, boardScope.institutionsOf],
  );
  const memberInstitutions = useInstitutionContextsByIds(memberInstitutionIds);
  const showMultiInstitutionPicker = !isSuperAdmin && memberInstitutionIds.length > 1;

  // Auto-select the first member institution when only one is present, or
  // when the user lands on the page without anything chosen yet. Mirrors the
  // InstitutionPicker auto-select so the rest of the form unblocks immediately.
  useEffect(() => {
    if (isSuperAdmin) return;
    if (institutionId) return;
    if (memberInstitutions.isLoading) return;
    if (memberInstitutions.data.length === 0) return;
    const first = memberInstitutions.data[0];
    setInstitutionId(first.myjkkn_id);
    setInstitutionCode(first.institution_code);
    setMyjkknIds(first.myjkkn_institution_ids);
  }, [isSuperAdmin, institutionId, memberInstitutions.data, memberInstitutions.isLoading]);

  // Use MyJKKN IDs if available (CAS Aided+Self); fall back to COE institution UUID.
  const lookupIds = myjkknIds.length > 0 ? myjkknIds : institutionId;
  const { data: regulationsData, isLoading: regulationsLoading } = useBosRegulationOptions(lookupIds);
  const regulations = regulationsData?.data ?? [];

  const ready =
    !!institutionId &&
    institutionCode.trim().length > 0 &&
    boardCode.trim().length > 0 &&
    regulationCode.trim().length > 0;

  // Academic model for the selected board (COP hosts B.Pharm + Pharm.D as
  // separate boards). Drives the year-based field relaxations in CourseForm and
  // the COE payload (see toCoeCreatePayload). Defaults to 'anna_univ'.
  const selectedBoard = boards?.find((b) => b.id === boardId);
  const academicModel = resolveAcademicModel({
    institutionCode,
    boardId,
    boardName: selectedBoard?.board_name,
    boardCode: selectedBoard?.board_code,
  });

  // Board membership IS the authorization for BoS write actions — mirrors
  // the list page's canCreate gate ([feedback_bos_membership_is_authorization]).
  // Role-perm grants (academic.bos-courses.create) drift out of sync with
  // composition membership: faculty who are valid board members often lack
  // the perm grant in custom_roles.permissions and would be blocked by the
  // standard <PermissionGuard>. Server still enforces via
  // guardCourseInstitutionWrite + boardsOf check.
  const canCreate = boardScope.isSuperAdmin || boardScope.memberOf.size > 0;

  if (boardScope.isLoading) {
    return (
      <Card>
        <CardContent className='p-6'>
          <Skeleton className='h-96 w-full' />
        </CardContent>
      </Card>
    );
  }
  if (!canCreate) {
    return (
      <Card>
        <CardContent className='p-6 space-y-2'>
          <p className='text-sm font-medium'>You don't have access to create courses.</p>
          <p className='text-sm text-muted-foreground'>
            Courses are scoped to BoS compositions. Ask an administrator to add you as a
            member of a composition for your board, then this page will become available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>New Course</CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='flex gap-3 flex-wrap items-end'>
            {/* Super-admin → full InstitutionPicker.
                Non-super-admin with multiple board memberships → custom
                picker showing only the institutions where they serve on a
                board (institutionsOf). Single membership → hidden picker
                (auto-selects primary institution as before). */}
            {isSuperAdmin && (
              <InstitutionPicker
                value={institutionId}
                onChange={setInstitutionId}
                onSelect={handleInstitutionSelect}
                hideLabel
              />
            )}
            {!isSuperAdmin && showMultiInstitutionPicker && (
              <div className='space-y-1'>
             
                <SearchableSelect
                  value={institutionId ?? ''}
                  onValueChange={(picked) => {
                    setInstitutionId(picked);
                    const ctx = memberInstitutions.data.find((c) => c.myjkkn_id === picked);
                    if (ctx) {
                      setInstitutionCode(ctx.institution_code);
                      setMyjkknIds(ctx.myjkkn_institution_ids);
                    }
                  }}
                  options={memberInstitutions.data.map((c) => ({
                    value: c.myjkkn_id,
                    label: `${c.institution_code} — ${c.display_name || c.name}`,
                  }))}
                  loading={memberInstitutions.isLoading}
                  placeholder='Select institution'
                  searchPlaceholder='Search institution…'
                  className='w-[260px]'
                />
              </div>
            )}
            {!isSuperAdmin && !showMultiInstitutionPicker && (
              <div className='hidden'>
                <InstitutionPicker
                  value={institutionId}
                  onChange={setInstitutionId}
                  onSelect={handleInstitutionSelect}
                />
              </div>
            )}

            {/* Board dropdown — enabled once institution is resolved.
                Required so the new course is tagged with board_code, otherwise
                the board-scope filter on /bos/courses hides it from non-admins. */}
            <div className='space-y-1'>
              
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
              boards={boards}
              boardsLoading={boardsLoading}
              // Lock the form's Board to the scope-strip selection so the
              // duplicate inner Board picker is hidden and the two can never
              // drift apart at submit time.
              lockedBoardId={boardId}
              hidePartLevel={institutionSkipsPartLevel(institutionCode)}
              academicModel={academicModel}
              onSubmit={async (form) => {
                try {
                  // Resolve human-readable board_code from the picked board_id so
                  // COE persists both lookup keys (defensive — see toCoeCreatePayload).
                  const board_code = boards?.find((b) => b.id === form.board_id)?.board_code;
                  await create.mutateAsync({
                    form,
                    context: {
                      institution_id: institutionId!,
                      institution_code: institutionCode,
                      regulation_code: regulationCode,
                      board_id: boardId,
                      board_code: boardCode,
                      academic_model: academicModel,
                    },
                  });
                  toast.success('Course created');
                  router.push('/bos/courses');
                } catch (e) {
                  // Server returns 409 with a descriptive message when course_code
                  // collides — surface that verbatim so the user knows to pick a
                  // unique code or open the existing course to edit it.
                  toast.error((e as Error).message);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}