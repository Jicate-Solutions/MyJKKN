'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ClassInchargeFilters } from '@/types/staff';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ClassInchargesFilters } from './class-incharges-filters';
import { ClassInchargesList } from './class-incharges-list';

export function ClassInchargesPageClient() {
  const router = useRouter();
  const { profile } = useAuth();
  const {
    isSuperAdmin,
    isInstitutionScoped,
    canAccess,
    isLoading: permsLoading,
  } = usePermissions([], { waitForLoad: true });

  const canViewClassIncharges =
    isSuperAdmin || canAccess('staff.class_incharges', 'view');

  useEffect(() => {
    if (!permsLoading && !canViewClassIncharges) {
      router.replace('/unauthorized');
    }
  }, [permsLoading, canViewClassIncharges, router]);

  // Default the institution filter for institution-scoped users only.
  // Cross-scoped roles (super_admin, scope='all') see everything by default.
  const [filters, setFilters] = useState<ClassInchargeFilters>({
    institution_id: isInstitutionScoped ? profile?.institution_id ?? undefined : undefined,
    page: 1,
    limit: 20,
  });

  function handleFiltersChange(updated: Partial<ClassInchargeFilters>) {
    setFilters((prev) => ({ ...prev, ...updated, page: 1 }));
  }

  function handlePageChange(page: number) {
    setFilters((prev) => ({ ...prev, page }));
  }

  function handlePageSizeChange(size: number) {
    setFilters((prev) => ({ ...prev, limit: size, page: 1 }));
  }

  if (permsLoading || !canViewClassIncharges) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <Loader2 className='h-8 w-8 animate-spin' />
      </div>
    );
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
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
}
