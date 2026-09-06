'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SchoolDefaultsFiltersProps {
  onSearchChange: (search: string) => void;
  onStatusChange: (status: string) => void;
  defaultSearch?: string;
  defaultStatus?: string;
}

export function SchoolDefaultsFilters({
  onSearchChange,
  onStatusChange,
  defaultSearch = '',
  defaultStatus = 'all',
}: SchoolDefaultsFiltersProps) {
  const [search, setSearch] = useState(defaultSearch);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    onSearchChange(value);
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-end">
      <Select defaultValue={defaultStatus} onValueChange={onStatusChange}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="configured">Configured</SelectItem>
          <SelectItem value="missing">Missing Defaults</SelectItem>
        </SelectContent>
      </Select>

      <Input
        placeholder="Search schools..."
        value={search}
        onChange={handleSearchChange}
        className="w-full"
      />
    </div>
  );
}
