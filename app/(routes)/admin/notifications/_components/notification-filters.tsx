'use client';

import { useCallback } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';

interface NotificationFiltersProps {
  onSearchChange: (search: string) => void;
}

export function NotificationFilters({
  onSearchChange
}: NotificationFiltersProps) {
  const debouncedSearch = useDebounce((value: string) => {
    onSearchChange(value);
  }, 500);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  return (
    <div className='flex items-center gap-4 w-full sm:w-auto'>
      <div className='relative w-full sm:max-w-sm'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Search notifications...'
          onChange={handleSearchChange}
          className='pl-10 h-9'
        />
      </div>
      {/* Other filters can be added here in the future */}
    </div>
  );
}
