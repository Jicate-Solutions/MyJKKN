'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import type { StakeholderType, SurveyStatus } from '@/types/stakeholder-nps';

const stakeholderOptions: { value: StakeholderType; label: string }[] = [
  { value: 'parent', label: 'Parents' },
  { value: 'learner', label: 'Learners' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'industry', label: 'Industry Partners' },
  { value: 'staff', label: 'Staff' }
];

const statusOptions: { value: SurveyStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' }
];

export function SurveyFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1'); // Reset to first page on filter change
    router.push(`?${params.toString()}`);
  }, [router, searchParams]);

  const clearFilters = useCallback(() => {
    router.push('?');
  }, [router]);

  const hasFilters = searchParams.has('search') ||
    searchParams.has('stakeholder_type') ||
    searchParams.has('status');

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search surveys..."
          defaultValue={searchParams.get('search') || ''}
          onChange={(e) => updateParams('search', e.target.value || null)}
          className="pl-9"
        />
      </div>

      <Select
        value={searchParams.get('stakeholder_type') || 'all'}
        onValueChange={(value) => updateParams('stakeholder_type', value)}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Stakeholder Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Stakeholders</SelectItem>
          {stakeholderOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('status') || 'all'}
        onValueChange={(value) => updateParams('status', value)}
      >
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="icon" onClick={clearFilters}>
          <X className="h-4 w-4" />
          <span className="sr-only">Clear filters</span>
        </Button>
      )}
    </div>
  );
}
