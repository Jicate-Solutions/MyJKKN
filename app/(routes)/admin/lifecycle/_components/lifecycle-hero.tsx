'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { LIFECYCLE_DATE_PRESETS } from '@/types/usage-analytics';

interface LifecycleHeroProps {
  lastUpdated: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  selectedPreset: number;
  onPresetChange: (days: number) => void;
}

export function LifecycleHero({
  lastUpdated,
  isRefreshing,
  onRefresh,
  selectedPreset,
  onPresetChange,
}: LifecycleHeroProps) {
  const [updatedText, setUpdatedText] = useState('');

  useEffect(() => {
    if (!lastUpdated) return;
    const update = () =>
      setUpdatedText(formatDistanceToNow(lastUpdated, { addSuffix: true }));
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Lifecycle Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Cross-institution usage tracking and module adoption
          </p>
        </div>
        <Badge
          variant="outline"
          className="flex items-center gap-1.5 text-xs"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          {updatedText ? `Updated ${updatedText}` : 'Live'}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={String(selectedPreset)}
          onValueChange={(v) => onPresetChange(Number(v))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            {LIFECYCLE_DATE_PRESETS.map((p) => (
              <SelectItem key={p.days} value={String(p.days)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>
    </div>
  );
}
