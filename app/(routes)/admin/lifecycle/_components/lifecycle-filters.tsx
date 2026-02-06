'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, Loader2 } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

interface LifecycleFiltersProps {
  institutionId?: string;
  onInstitutionChange: (id: string | undefined) => void;
  isSuperAdmin: boolean;
  onClose: () => void;
}

export function LifecycleFilters({
  institutionId,
  onInstitutionChange,
  isSuperAdmin,
  onClose,
}: LifecycleFiltersProps) {
  const { institutions, loading } = useInstitutionsWithAccess({
    isActive: true,
    autoFetch: true,
  });

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Filters</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          {isSuperAdmin && (
            <div className="w-[220px]">
              <Select
                value={institutionId || 'all'}
                onValueChange={(v) =>
                  onInstitutionChange(v === 'all' ? undefined : v)
                }
                disabled={loading}
              >
                <SelectTrigger>
                  {loading ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    <SelectValue placeholder="All Institutions" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Institutions</SelectItem>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
