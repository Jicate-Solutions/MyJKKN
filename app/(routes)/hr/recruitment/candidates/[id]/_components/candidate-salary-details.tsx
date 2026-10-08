'use client';

/**
 * "Details for the suggested salary" on the candidate page: the official job
 * title, the department, and the years of experience before JKKN. These are
 * the three inputs the suggested salary needs; role_title stays as it is.
 *
 * Saving here changes no package and no pay. It only changes what the
 * Suggested salary box in Propose Package works out.
 */

import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  useCandidateSalaryDetails,
  useSaveCandidateSalaryDetails,
  type CandidateSalaryDetailsPayload,
} from '@/hooks/hr/use-candidate-salary-suggestion';

interface Props {
  candidateId: string;
  /** Holds hr.recruitment.edit (or is a super admin). */
  canEdit: boolean;
}

function nameOf(list: Array<{ id: string; name: string }>, id: string | null): string {
  if (!id) return 'Not picked';
  return list.find((o) => o.id === id)?.name ?? 'Recorded (not in your list)';
}

function yearsText(years: number | null): string {
  if (years === null) return 'Not recorded';
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

export function CandidateSalaryDetails({ candidateId, canEdit }: Props) {
  const { data, isLoading, error } = useCandidateSalaryDetails(candidateId, { enabled: true });
  const [open, setOpen] = useState(false);

  return (
    <div className='mb-4 rounded-md border bg-muted/30 p-3' data-testid='candidate-salary-details'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-xs font-medium text-muted-foreground'>Details for the suggested salary</p>
        {canEdit && data && (
          <Button type='button' size='sm' variant='outline' onClick={() => setOpen(true)}>
            <Pencil className='mr-1 h-3 w-3' /> Edit details
          </Button>
        )}
      </div>
      {isLoading && (
        <p className='mt-2 flex items-center gap-2 text-xs text-muted-foreground'>
          <Loader2 className='h-3 w-3 animate-spin' /> Loading…
        </p>
      )}
      {error && <p className='mt-2 text-xs text-destructive'>{error.message}</p>}
      {data && (
        <dl className='mt-2 grid gap-2 text-sm sm:grid-cols-3'>
          <div>
            <dt className='text-xs text-muted-foreground'>Official job title</dt>
            <dd className='font-medium'>{nameOf(data.designations, data.details.designation_id)}</dd>
          </div>
          <div>
            <dt className='text-xs text-muted-foreground'>Department</dt>
            <dd className='font-medium'>{nameOf(data.departments, data.details.department_id)}</dd>
          </div>
          <div>
            <dt className='text-xs text-muted-foreground'>Years of experience before JKKN</dt>
            <dd className='font-medium'>{yearsText(data.details.prior_experience_years)}</dd>
          </div>
        </dl>
      )}
      {data && open && (
        <EditDialog candidateId={candidateId} data={data} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function EditDialog({
  candidateId,
  data,
  onClose,
}: {
  candidateId: string;
  data: CandidateSalaryDetailsPayload;
  onClose: () => void;
}) {
  const save = useSaveCandidateSalaryDetails(candidateId);
  // Start on the recorded job title, else on the one the role title names exactly.
  const preselected = data.details.designation_id ?? data.roleTitleMatchId;
  const [designationId, setDesignationId] = useState<string>(preselected ?? '');
  const [departmentId, setDepartmentId] = useState<string>(data.details.department_id ?? '');
  const [years, setYears] = useState<string>(
    data.details.prior_experience_years === null ? '' : String(data.details.prior_experience_years)
  );
  const matchedFromRoleTitle = !data.details.designation_id && data.roleTitleMatchId !== null;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = years.trim();
    const n = raw === '' ? null : Number(raw);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 999.9)) {
      toast.error('Years of experience before JKKN must be 0 or more, or left blank');
      return;
    }
    try {
      await save.mutateAsync({
        designation_id: designationId || null,
        department_id: departmentId || null,
        prior_experience_years: n,
      });
      toast.success('Details saved');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the details');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Details for the suggested salary</DialogTitle>
          <DialogDescription>
            The pay band is looked up by the official job title. The role title
            {data.roleTitle ? ` "${data.roleTitle}"` : ''} is kept as it is.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSave} className='space-y-3'>
          <div className='space-y-1'>
            <Label>Official job title</Label>
            <div className='flex gap-2'>
              <SearchableSelect
                modal
                className='w-full'
                value={designationId}
                onValueChange={setDesignationId}
                options={data.designations.map((d) => ({ value: d.id, label: d.name }))}
                placeholder='Pick a job title'
                searchPlaceholder='Search job titles…'
                emptyMessage='No job title matches.'
              />
              {designationId && (
                <Button type='button' variant='ghost' size='sm' onClick={() => setDesignationId('')}>
                  Clear
                </Button>
              )}
            </div>
            {matchedFromRoleTitle && designationId === data.roleTitleMatchId && (
              <p className='text-xs text-muted-foreground'>Picked because the role title is exactly this job title.</p>
            )}
            {data.designations.length === 0 && (
              <p className='text-xs text-muted-foreground'>
                No job titles are visible to you for this candidate&apos;s HR organisation. A super admin can pick it.
              </p>
            )}
          </div>
          <div className='space-y-1'>
            <Label>Department</Label>
            <div className='flex gap-2'>
              <SearchableSelect
                modal
                className='w-full'
                value={departmentId}
                onValueChange={setDepartmentId}
                options={data.departments.map((d) => ({ value: d.id, label: d.name }))}
                placeholder='Pick a department'
                searchPlaceholder='Search departments…'
                emptyMessage='No department matches.'
                disabled={!data.hasCollege}
              />
              {departmentId && (
                <Button type='button' variant='ghost' size='sm' onClick={() => setDepartmentId('')}>
                  Clear
                </Button>
              )}
            </div>
            {!data.hasCollege && (
              <p className='text-xs text-muted-foreground'>This candidate has no college recorded, so no department can be picked.</p>
            )}
          </div>
          <div className='space-y-1'>
            <Label htmlFor='priorExperienceYears'>Years of experience before JKKN</Label>
            <Input
              id='priorExperienceYears'
              type='number'
              min='0'
              max='999.9'
              step='0.1'
              value={years}
              onChange={(e) => setYears(e.target.value)}
              placeholder='e.g. 3'
            />
            <p className='text-xs text-muted-foreground'>Leave blank if not known. 0 means none.</p>
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>Cancel</Button>
            <Button type='submit' disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save details'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
