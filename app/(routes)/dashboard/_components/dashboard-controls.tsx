'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DashboardConfiguration } from '@/types/dashboard';

interface DashboardControlsProps {
  configurations: DashboardConfiguration[];
  currentConfigurationId?: string;
}

export function DashboardControls({
  configurations,
  currentConfigurationId
}: DashboardControlsProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  if (configurations.length === 0) {
    return (
      <Button
        variant='outline'
        onClick={handleRefresh}
        disabled={isRefreshing}
        className='flex items-center gap-2 w-full sm:w-auto h-9'
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        <span className='hidden xs:inline'>Refresh</span>
        <span className='xs:hidden'>Refresh</span>
      </Button>
    );
  }

  return (
    <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 px-2 sm:px-4'>
      <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4'>
        <h1 className='text-lg sm:text-xl lg:text-2xl font-bold'>
          Analytics & Insights
        </h1>

        {configurations.length > 1 && (
          <Select
            value={currentConfigurationId}
            onValueChange={(value) => {
              // Trigger server action or navigation
              router.push(`/dashboard?config=${value}`);
            }}
          >
            <SelectTrigger className='w-full sm:w-[200px] h-9'>
              <SelectValue placeholder='Select dashboard' />
            </SelectTrigger>
            <SelectContent>
              {configurations.map((config) => (
                <SelectItem key={config.id} value={config.id}>
                  {config.configuration_name}
                  {config.is_default && (
                    <Badge variant='secondary' className='ml-2 text-xs'>
                      Default
                    </Badge>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Button
        variant='outline'
        onClick={handleRefresh}
        disabled={isRefreshing}
        className='flex items-center gap-2 w-full sm:w-auto h-9'
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        <span className='hidden xs:inline'>Refresh</span>
        <span className='xs:hidden'>Refresh</span>
      </Button>
    </div>
  );
}
