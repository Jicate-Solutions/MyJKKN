'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface ProgramOption {
  id: string;
  program_name: string;
  display_name: string | null;
}

interface ProgramChipPickerProps {
  institutionId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  maxSelection?: number;
}

export function ProgramChipPicker({
  institutionId,
  selectedIds,
  onChange,
  disabled = false,
  maxSelection = 3,
}: ProgramChipPickerProps) {
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!institutionId) return;

    let cancelled = false;
    const fetchPrograms = async () => {
      setIsLoading(true);
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('programs')
        .select('id, program_name, display_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('program_name');

      if (!cancelled) {
        if (error) {
          console.error('[expo-capture] Failed to fetch programs:', error.message);
          setPrograms([]);
        } else {
          setPrograms(data || []);
        }
        setIsLoading(false);
      }
    };

    fetchPrograms();
    return () => { cancelled = true; };
  }, [institutionId]);

  const toggleProgram = (programId: string) => {
    if (disabled) return;
    if (selectedIds.includes(programId)) {
      onChange(selectedIds.filter((id) => id !== programId));
    } else if (selectedIds.length < maxSelection) {
      onChange([...selectedIds, programId]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2 mt-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  if (programs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground mt-1">
        No programs found for this institution.
      </p>
    );
  }

  return (
    <div className="space-y-2 mt-1">
      <div className="flex flex-wrap gap-2">
        {programs.map((program) => {
          const isSelected = selectedIds.includes(program.id);
          const isFirst = selectedIds[0] === program.id;
          const atLimit = selectedIds.length >= maxSelection && !isSelected;

          return (
            <Badge
              key={program.id}
              variant={isSelected ? 'default' : 'outline'}
              className={`
                cursor-pointer px-3 py-2 text-sm transition-all select-none
                ${isSelected && isFirst ? 'ring-2 ring-primary ring-offset-1' : ''}
                ${atLimit ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary/10'}
                ${disabled ? 'pointer-events-none opacity-50' : ''}
              `}
              onClick={() => !atLimit && toggleProgram(program.id)}
            >
              {program.display_name || program.program_name}
              {isFirst && isSelected && (
                <span className="ml-1 text-[10px] opacity-70">(primary)</span>
              )}
            </Badge>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length}/{maxSelection} selected — first selected = primary interest
        </p>
      )}
    </div>
  );
}
