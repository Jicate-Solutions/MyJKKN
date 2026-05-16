'use client';

import { useEffect, useRef, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface Institution {
  id: string;
  name: string;
}

interface InstitutionFilterProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  label?: string;
}

export function InstitutionFilter({
  value,
  onChange,
  placeholder = 'All institutions',
  label = 'Institution',
}: InstitutionFilterProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const fetchInstitutions = async () => {
      try {
        const res = await fetch('/api/bos/institutions', {
          signal: abortControllerRef.current?.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setInstitutions(data || []);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to fetch institutions:', err);
        }
      }
    };

    fetchInstitutions();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return (
    <div>
      <Label className='text-sm font-medium block mb-2'>{label}</Label>
      <Select value={value || 'all'} onValueChange={(val) => onChange(val === 'all' ? undefined : val)}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{placeholder}</SelectItem>
          {institutions.map((inst) => (
            <SelectItem key={inst.id} value={inst.id}>
              {inst.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
