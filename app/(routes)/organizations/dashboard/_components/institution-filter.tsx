'use client';

import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface InstitutionFilterProps {
  onInstitutionChange: (institutionId: string | null) => void;
  selectedInstitution: string | null;
}

export function InstitutionFilter({
  onInstitutionChange,
  selectedInstitution
}: InstitutionFilterProps) {
  const { profile: user, isLoading: authLoading } = useAuth();
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({
      isActive: true,
      autoFetch: !!user
    });

  const isLoading = authLoading || institutionsLoading;
  const isSuperAdmin = user?.role === 'super_admin';

  if (isLoading) {
    return <div>Loading institutions...</div>;
  }

  // Regular users with no institution access shouldn't see the filter.
  if (!isSuperAdmin && institutions.length === 0) {
    return null;
  }

  // If a regular user has access to only one institution, don't show the filter.
  if (!isSuperAdmin && institutions.length === 1) {
    return null;
  }

  return (
    <div className='max-w-xs'>
      <Select
        onValueChange={(value) =>
          onInstitutionChange(value === 'all' ? null : value)
        }
        value={selectedInstitution || 'all'}
      >
        <SelectTrigger>
          <SelectValue placeholder='Filter by institution...' />
        </SelectTrigger>
        <SelectContent>
          {isSuperAdmin && (
            <SelectItem value='all'>All Institutions</SelectItem>
          )}
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
