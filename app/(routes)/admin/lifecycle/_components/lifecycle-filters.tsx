'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X } from 'lucide-react';

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
  // Fetch institutions for the super admin selector
  const { data: institutions } = useQuery({
    queryKey: ['institutions-list'],
    queryFn: async () => {
      const response = await fetch('/api/organizations/institutions');
      if (!response.ok) throw new Error('Failed to fetch institutions');
      const result = await response.json();
      return result.data || result || [];
    },
    enabled: isSuperAdmin,
    staleTime: 10 * 60 * 1000,
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
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Institutions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Institutions</SelectItem>
                  {(institutions || []).map((inst: { id: string; name: string }) => (
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
