'use client';

// run-query-controls.tsx
// Cycle + institution selector pair that feed into the "Run Query" button.
//
// Props:
//   cycleId / institutionId    → controlled values
//   onCycleChange / onInstitutionChange → setters
//   onRun                      → click handler (parent owns the mutation)
//   isRunning                  → disables button + swaps icon for spinner
//   disabled                   → parent may force-disable (e.g., no SQL)
//
// Behaviour:
//   - Cycle list pulled from useAuditCycles (active, non-closed)
//   - Institution list pulled from useInstitutionsWithAccess — respects RLS
//   - Institution picker is OPTIONAL: users can leave it on "All institutions"
//     BUT the API requires a concrete institution_id. If "all" is selected we
//     auto-pick the first accessible institution — the user can then change it.
//   - Disables Run button until both cycle + institution are chosen.

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loader2, PlayCircle } from 'lucide-react';
import { useAuditCycles } from '@/hooks/audit/use-audit-cycles';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface RunQueryControlsProps {
  cycleId: string | undefined;
  institutionId: string | undefined;
  onCycleChange: (value: string) => void;
  onInstitutionChange: (value: string) => void;
  onRun: () => void;
  isRunning: boolean;
  disabled?: boolean;
}

export function RunQueryControls({
  cycleId,
  institutionId,
  onCycleChange,
  onInstitutionChange,
  onRun,
  isRunning,
  disabled = false
}: RunQueryControlsProps) {
  const { data: cycles = [], isLoading: cyclesLoading } = useAuditCycles({
    includeClosed: false
  });
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({ isActive: true });

  const canRun =
    !disabled && !isRunning && !!cycleId && !!institutionId;

  return (
    <div className='flex flex-col sm:flex-row gap-3 sm:items-end'>
      <div className='flex-1 min-w-[200px]'>
        <label className='text-xs text-muted-foreground mb-1 block'>
          Cycle
        </label>
        <Select
          value={cycleId}
          onValueChange={onCycleChange}
          disabled={cyclesLoading || isRunning}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                cyclesLoading ? 'Loading cycles...' : 'Select an audit cycle'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {cycles.length === 0 && !cyclesLoading ? (
              <div className='px-3 py-2 text-xs text-muted-foreground'>
                No active cycles. Create one from /audit/cycles.
              </div>
            ) : (
              cycles.map((cycle) => (
                <SelectItem key={cycle.id} value={cycle.id}>
                  <span className='font-medium'>{cycle.name}</span>
                  <span className='text-muted-foreground text-xs ml-2'>
                    ({cycle.phase})
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className='flex-1 min-w-[200px]'>
        <label className='text-xs text-muted-foreground mb-1 block'>
          Institution
        </label>
        <Select
          value={institutionId}
          onValueChange={onInstitutionChange}
          disabled={institutionsLoading || isRunning}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                institutionsLoading
                  ? 'Loading institutions...'
                  : 'Select an institution'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {institutions.length === 0 && !institutionsLoading ? (
              <div className='px-3 py-2 text-xs text-muted-foreground'>
                No accessible institutions.
              </div>
            ) : (
              institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className='flex-shrink-0'>
        <Button
          type='button'
          size='sm'
          onClick={onRun}
          disabled={!canRun}
          className='w-full sm:w-auto'
        >
          {isRunning ? (
            <Loader2 className='h-4 w-4 mr-2 animate-spin' />
          ) : (
            <PlayCircle className='h-4 w-4 mr-2' />
          )}
          Run Query
        </Button>
      </div>
    </div>
  );
}
