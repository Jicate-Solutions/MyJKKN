'use client';

import { useState, useMemo } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronDown,
  Check,
  Search,
  X,
  Info,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMetricPicker, useMetricValue } from '@/hooks/okr/use-okr-metrics';
import type { MetricPickerOption, MetricScope, MetricContext } from '@/types/okr';

// ============================================================================
// Types
// ============================================================================

interface MetricPickerProps {
  value?: string;
  onChange: (metricKey: string | undefined, metric?: MetricPickerOption) => void;
  role?: string;
  scope?: MetricScope;
  context?: MetricContext;
  placeholder?: string;
  disabled?: boolean;
  showPreview?: boolean;
}

interface MetricCardProps {
  metric: MetricPickerOption;
  isSelected: boolean;
  onSelect: () => void;
  context?: MetricContext;
  showValue?: boolean;
}

// ============================================================================
// Module color mapping for badges
// ============================================================================

const moduleColors: Record<string, string> = {
  attendance: 'bg-blue-100 text-blue-700 border-blue-200',
  billing: 'bg-green-100 text-green-700 border-green-200',
  learners: 'bg-purple-100 text-purple-700 border-purple-200',
  staff: 'bg-orange-100 text-orange-700 border-orange-200',
  academic: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  admissions: 'bg-pink-100 text-pink-700 border-pink-200',
  resources: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  external: 'bg-gray-100 text-gray-700 border-gray-200',
  timetable: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  courses: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

// ============================================================================
// MetricCard Component
// ============================================================================

function MetricCard({ metric, isSelected, onSelect, context, showValue = false }: MetricCardProps) {
  const { data: result, isLoading } = useMetricValue(
    showValue ? metric.metric_key : undefined,
    context || {},
    { enabled: showValue }
  );

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        isSelected && 'ring-2 ring-primary border-primary'
      )}
      onClick={onSelect}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium truncate">
              {metric.display_name}
            </CardTitle>
            <CardDescription className="text-xs line-clamp-2 mt-1">
              {metric.description || 'No description'}
            </CardDescription>
          </div>
          {isSelected && (
            <div className="flex-shrink-0">
              <Check className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            <Badge
              variant="outline"
              className={cn('text-xs', moduleColors[metric.module] || moduleColors.external)}
            >
              {metric.module}
            </Badge>
            {metric.unit && (
              <Badge variant="secondary" className="text-xs">
                {metric.unit}
              </Badge>
            )}
          </div>
          {showValue && (
            <div className="text-right">
              {isLoading ? (
                <Skeleton className="h-4 w-12" />
              ) : result?.value != null ? (
                <span className="text-sm font-medium">
                  {Number(result.value).toFixed(1)}{metric.unit}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </div>
          )}
        </div>
        {metric.default_target && (
          <div className="mt-2 text-xs text-muted-foreground">
            Target: {metric.default_target}{metric.unit}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MetricPicker Component
// ============================================================================

export function MetricPicker({
  value,
  onChange,
  role = 'learner',
  scope,
  context,
  placeholder = 'Select a metric...',
  disabled = false,
  showPreview = true,
}: MetricPickerProps) {
  const [open, setOpen] = useState(false);

  const {
    searchQuery,
    selectedModule,
    setSearchQuery,
    setSelectedModule,
    options,
    optionsByModule,
    modules,
    isLoading,
  } = useMetricPicker({ role, scope });

  const selectedMetric = useMemo(() => {
    return options.find(m => m.metric_key === value);
  }, [options, value]);

  const handleSelect = (metric: MetricPickerOption) => {
    onChange(metric.metric_key, metric);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(undefined);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between',
              !value && 'text-muted-foreground'
            )}
            disabled={disabled}
          >
            {selectedMetric ? (
              <div className="flex items-center gap-2 truncate">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span className="truncate">{selectedMetric.display_name}</span>
                <Badge
                  variant="outline"
                  className={cn('text-xs ml-auto', moduleColors[selectedMetric.module])}
                >
                  {selectedMetric.module}
                </Badge>
              </div>
            ) : (
              <span>{placeholder}</span>
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[95vw] max-w-[500px] p-0" align="start">
          <Tabs defaultValue="browse" className="w-full">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <TabsList className="h-8">
                <TabsTrigger value="browse" className="text-xs">Browse</TabsTrigger>
                <TabsTrigger value="search" className="text-xs">Search</TabsTrigger>
              </TabsList>
              {value && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleClear}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            <TabsContent value="browse" className="m-0">
              <div className="flex border-b">
                <ScrollArea className="w-[150px] border-r">
                  <div className="p-2 space-y-1">
                    <Button
                      variant={!selectedModule ? 'secondary' : 'ghost'}
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => setSelectedModule(undefined)}
                    >
                      All Modules
                    </Button>
                    {modules.map(module => (
                      <Button
                        key={module}
                        variant={selectedModule === module ? 'secondary' : 'ghost'}
                        size="sm"
                        className="w-full justify-start text-xs capitalize"
                        onClick={() => setSelectedModule(module)}
                      >
                        {module}
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          {optionsByModule[module]?.length || 0}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
                <ScrollArea className="flex-1 h-[350px]">
                  <div className="p-2 space-y-2">
                    {isLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => (
                          <Skeleton key={i} className="h-24 w-full" />
                        ))}
                      </div>
                    ) : (
                      <>
                        {(selectedModule ? optionsByModule[selectedModule] : options)?.map(metric => (
                          <MetricCard
                            key={metric.metric_key}
                            metric={metric}
                            isSelected={value === metric.metric_key}
                            onSelect={() => handleSelect(metric)}
                            context={context}
                            showValue={showPreview}
                          />
                        ))}
                        {options.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No metrics available for your role</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="search" className="m-0">
              <Command className="border-0">
                <CommandInput
                  placeholder="Search metrics..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList className="max-h-[350px]">
                  <CommandEmpty>
                    <div className="py-6 text-center text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No metrics found</p>
                      <p className="text-xs">Try a different search term</p>
                    </div>
                  </CommandEmpty>
                  {Object.entries(optionsByModule).map(([module, metrics]) => (
                    <CommandGroup key={module} heading={module.charAt(0).toUpperCase() + module.slice(1)}>
                      {metrics.map(metric => (
                        <CommandItem
                          key={metric.metric_key}
                          value={metric.metric_key}
                          onSelect={() => handleSelect(metric)}
                          className="flex items-center gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {metric.display_name}
                              </span>
                              {metric.unit && (
                                <Badge variant="outline" className="text-[10px]">
                                  {metric.unit}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {metric.description}
                            </p>
                          </div>
                          {value === metric.metric_key && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </TabsContent>
          </Tabs>

          {/* Footer with info */}
          <div className="border-t px-3 py-2 bg-muted/50">
            <p className="text-[10px] text-muted-foreground">
              Auto-tracked metrics update automatically. No manual data entry required.
            </p>
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected metric preview */}
      {selectedMetric && showPreview && (
        <MetricPreview
          metricKey={selectedMetric.metric_key}
          metric={selectedMetric}
          context={context}
        />
      )}
    </div>
  );
}

// ============================================================================
// MetricPreview Component
// ============================================================================

interface MetricPreviewProps {
  metricKey: string;
  metric: MetricPickerOption;
  context?: MetricContext;
}

function MetricPreview({ metricKey, metric, context }: MetricPreviewProps) {
  const { data: result, isLoading, error } = useMetricValue(metricKey, context || {});

  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Current Value:</span>
          </div>
          <div className="text-right">
            {isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : error || result?.error ? (
              <span className="text-sm text-destructive" title={result?.error || (error as Error)?.message}>
                Error loading
              </span>
            ) : result?.value != null ? (
              <span className="text-lg font-bold">
                {Number(result.value).toFixed(metric.unit === '%' ? 1 : 0)}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  {metric.unit}
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">No data</span>
            )}
          </div>
        </div>
        {result?.was_cached && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Cached value (last updated: {new Date(result.executed_at).toLocaleString()})
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MetricValueDisplay Component - For showing metric in KR cards
// ============================================================================

interface MetricValueDisplayProps {
  metricKey: string;
  context: MetricContext;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function MetricValueDisplay({
  metricKey,
  context,
  showLabel = false,
  size = 'md',
}: MetricValueDisplayProps) {
  const { data: result, isLoading } = useMetricValue(metricKey, context, {
    refetchInterval: 60000, // Refresh every minute
  });

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl font-bold',
  };

  if (isLoading) {
    return <Skeleton className={cn('h-6 w-16', size === 'sm' && 'h-4 w-12')} />;
  }

  if (result?.error || result?.value == null) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {showLabel && (
        <span className="text-xs text-muted-foreground">Live:</span>
      )}
      <span className={cn(sizeClasses[size])}>
        {Number(result.value).toFixed(1)}
      </span>
    </div>
  );
}

export default MetricPicker;
