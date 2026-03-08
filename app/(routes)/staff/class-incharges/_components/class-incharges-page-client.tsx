'use client';

import { useState } from 'react';
import { ClassInchargeFilters } from '@/types/staff';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ClassInchargesFilters } from './class-incharges-filters';
import { ClassInchargesList } from './class-incharges-list';

export function ClassInchargesPageClient() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const [filters, setFilters] = useState<ClassInchargeFilters>({
    institution_id: isSuperAdmin ? undefined : profile?.institution_id ?? undefined,
    page: 1,
    limit: 20,
  });

  function handleFiltersChange(updated: Partial<ClassInchargeFilters>) {
    setFilters((prev) => ({ ...prev, ...updated, page: 1 }));
  }

  function handlePageChange(page: number) {
    setFilters((prev) => ({ ...prev, page }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Class Incharges</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assign and manage class incharges for sections
          </p>
        </div>
      </div>

      <ClassInchargesFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      <ClassInchargesList
        filters={filters}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
