'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SchemeFilters } from '@/hooks/bos/use-bos-course-scheme';

export function SchemeFiltersBar({
  institutionId, value, onChange,
}: {
  institutionId: string;
  value: SchemeFilters | null;
  onChange: (v: SchemeFilters | null) => void;
}) {
  const [program, setProgram] = useState(value?.program_code ?? '');
  const [regulation, setRegulation] = useState(value?.regulation_code ?? '');
  const [batch, setBatch] = useState(value?.batch_code ?? '');

  const apply = (p = program, r = regulation, b = batch) => {
    if (!p || !r) return onChange(null);
    onChange({
      institution_id: institutionId,
      program_code: p,
      regulation_code: r,
      batch_code: b || undefined,
    });
  };

  return (
    <div className='flex gap-3 flex-wrap items-end'>
      <div className='space-y-1'>
        <Label className='text-xs'>Program</Label>
        <Input
          value={program}
          onChange={(e) => setProgram(e.target.value.toUpperCase())}
          onBlur={() => apply()}
          placeholder='e.g. UCS'
          className='w-[140px]'
        />
      </div>
      <div className='space-y-1'>
        <Label className='text-xs'>Regulation</Label>
        <Input
          value={regulation}
          onChange={(e) => setRegulation(e.target.value.toUpperCase())}
          onBlur={() => apply()}
          placeholder='R-2024'
          className='w-[140px]'
        />
      </div>
      <div className='space-y-1'>
        <Label className='text-xs'>Batch (optional)</Label>
        <Input
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          onBlur={() => apply()}
          placeholder='2024'
          className='w-[120px]'
        />
      </div>
    </div>
  );
}
