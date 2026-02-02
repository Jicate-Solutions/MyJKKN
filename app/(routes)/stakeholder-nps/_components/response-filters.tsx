/**
 * Response Filters Component
 * Filters for NPS responses list
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { StakeholderType, NPSSegment } from '@/types/stakeholder-nps';

const stakeholderOptions: { value: StakeholderType; label: string }[] = [
  { value: 'student', label: 'Students' },
  { value: 'parent', label: 'Parents' },
  { value: 'staff', label: 'Staff' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'learner', label: 'Learners' },
  { value: 'industry', label: 'Industry Partners' },
  { value: 'employer', label: 'Employers' },
  { value: 'community', label: 'Community' },
];

const sentimentOptions: { value: NPSSegment; label: string }[] = [
  { value: 'promoter', label: 'Promoters (9-10)' },
  { value: 'passive', label: 'Passives (7-8)' },
  { value: 'detractor', label: 'Detractors (0-6)' },
];

export function ResponseFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const stakeholderType = searchParams.get('stakeholder_type') || '';
  const sentiment = searchParams.get('sentiment') || '';

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    // Reset to page 1 when filters change
    params.set('page', '1');

    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push(window.location.pathname);
  };

  const hasActiveFilters = stakeholderType || sentiment;

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <Select
        value={stakeholderType}
        onValueChange={(value) => updateFilter('stakeholder_type', value)}
      >
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="All Stakeholders" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Stakeholders</SelectItem>
          {stakeholderOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={sentiment}
        onValueChange={(value) => updateFilter('sentiment', value)}
      >
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="All Sentiments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Sentiments</SelectItem>
          {sentimentOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          onClick={clearFilters}
          className="w-full sm:w-auto"
        >
          <X className="mr-2 h-4 w-4" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
