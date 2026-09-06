'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RiskTier } from '@/services/learner-risk-service';

interface Department {
  id: string;
  name: string;
}

interface Section {
  id: string;
  name: string;
}

interface RiskFiltersProps {
  departments: Department[];
  sections: Section[];
  selectedDepartment: string | undefined;
  selectedSection: string | undefined;
  selectedTier: RiskTier | 'all';
  onDepartmentChange: (value: string | undefined) => void;
  onSectionChange: (value: string | undefined) => void;
  onTierChange: (value: RiskTier | 'all') => void;
  /** Show department filter (only for Director / super_admin) */
  showDepartmentFilter: boolean;
}

const TIER_OPTIONS: { value: RiskTier | 'all'; label: string }[] = [
  { value: 'all', label: 'All Risk Levels' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'low', label: 'Low' },
  { value: 'healthy', label: 'Healthy' },
];

export function RiskFilters({
  departments,
  sections,
  selectedDepartment,
  selectedSection,
  selectedTier,
  onDepartmentChange,
  onSectionChange,
  onTierChange,
  showDepartmentFilter,
}: RiskFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {showDepartmentFilter && (
        <Select
          value={selectedDepartment ?? '__all__'}
          onValueChange={(v) =>
            onDepartmentChange(v === '__all__' ? undefined : v)
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={selectedSection ?? '__all__'}
        onValueChange={(v) =>
          onSectionChange(v === '__all__' ? undefined : v)
        }
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Sections" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Sections</SelectItem>
          {sections.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedTier}
        onValueChange={(v) => onTierChange(v as RiskTier | 'all')}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Risk Levels" />
        </SelectTrigger>
        <SelectContent>
          {TIER_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
