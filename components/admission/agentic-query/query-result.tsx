'use client';

// components/admission/agentic-query/query-result.tsx
// Display component for agentic query results

import { useState } from 'react';
import {
  Hash,
  BarChart3,
  LayoutGrid,
  Table,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Download,
  Clock,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface AgenticQueryResult {
  success: boolean;
  query: string;
  intent?: {
    type: string;
    entities: string[];
    filters: any[];
    confidence: number;
  };
  data: any;
  summary: string;
  visualizationType?: 'table' | 'chart' | 'cards' | 'metric';
  error?: string;
  executionTimeMs: number;
}

interface QueryResultProps {
  result: AgenticQueryResult;
  className?: string;
  onRefresh?: () => void;
  showDetails?: boolean;
}

export function QueryResult({
  result,
  className,
  onRefresh,
  showDetails = true,
}: QueryResultProps) {
  const [showSourceData, setShowSourceData] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!result.success) {
    return (
      <Card className={cn('border-red-200 dark:border-red-900', className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
              <Zap className="h-5 w-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-red-600">Query Failed</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {result.error || 'An error occurred while processing your query.'}
              </p>
              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={onRefresh}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Try Again
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available in insecure contexts
      console.warn('Clipboard API unavailable');
    }
  };

  const handleExportCSV = () => {
    const records = result.data?.records || [];
    if (records.length === 0) return;

    const headers = Object.keys(records[0]);
    const csvContent = [
      headers.join(','),
      ...records.map((row: any) =>
        headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const visualizationType = result.visualizationType || 'table';

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        {/* Summary */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-base leading-relaxed">{result.summary}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            {result.data?.records?.length > 0 && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExportCSV}>
                <Download className="h-4 w-4" />
              </Button>
            )}
            {onRefresh && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{result.executionTimeMs}ms</span>
          </div>
          {result.intent && (
            <>
              <Badge variant="outline" className="text-xs">
                {result.intent.type}
              </Badge>
              <span>{(result.intent.confidence * 100).toFixed(0)}% confident</span>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Main visualization */}
        {visualizationType === 'metric' && (
          <MetricDisplay data={result.data} />
        )}

        {visualizationType === 'chart' && (
          <ChartDisplay data={result.data} />
        )}

        {visualizationType === 'cards' && (
          <CardsDisplay data={result.data} />
        )}

        {visualizationType === 'table' && (
          <TableDisplay data={result.data} />
        )}

        {/* Source data expandable */}
        {showDetails && result.data && (
          <Collapsible open={showSourceData} onOpenChange={setShowSourceData}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-4 text-muted-foreground hover:text-foreground"
              >
                {showSourceData ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" />
                    Hide source data
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    View source data
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <pre className="p-3 rounded-lg bg-muted text-xs overflow-auto max-h-[300px]">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

// Metric display for count queries
function MetricDisplay({ data }: { data: any }) {
  const count = data?.count ?? data?.totalCount ?? 0;

  return (
    <div className="flex items-center justify-center py-8">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Hash className="h-8 w-8 text-primary" />
          <span className="text-5xl font-bold text-primary">
            {count.toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Total count
        </p>
      </div>
    </div>
  );
}

// Chart display for aggregate/trend queries
function ChartDisplay({ data }: { data: any }) {
  // Simple bar chart visualization
  const items = data?.groups
    ? Object.entries(data.groups).map(([key, val]: [string, any]) => ({
        label: key,
        value: val.count,
      }))
    : data?.trends || [];

  if (items.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No data to display</div>;
  }

  const maxValue = Math.max(...items.map((i: any) => i.value || i.count || 0)) || 1;

  return (
    <div className="space-y-3 py-4">
      {items.slice(0, 10).map((item: any, index: number) => (
        <div key={index} className="flex items-center gap-3">
          <div className="w-32 text-sm truncate" title={item.label || item.date}>
            {item.label || item.date}
          </div>
          <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${((item.value || item.count) / maxValue) * 100}%` }}
            />
          </div>
          <div className="w-12 text-sm text-right font-medium">
            {(item.value || item.count).toLocaleString()}
          </div>
        </div>
      ))}
      {items.length > 10 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing top 10 of {items.length} items
        </p>
      )}
    </div>
  );
}

// Cards display for small result sets
function CardsDisplay({ data }: { data: any }) {
  const records = data?.records || [];

  if (records.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No records found</div>;
  }

  // Get key fields to display
  const keyFields = ['full_name', 'name', 'email', 'phone', 'funnel_stage', 'priority', 'source', 'score'];
  const displayFields = keyFields.filter((f) => records[0]?.[f] !== undefined);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {records.map((record: any, index: number) => (
        <Card key={record.id || index} className="p-3">
          <div className="space-y-1">
            <div className="font-medium">
              {record.full_name || record.name || `Record ${index + 1}`}
            </div>
            {displayFields.slice(1, 5).map((field) => (
              <div key={field} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground capitalize">
                  {field.replace(/_/g, ' ')}:
                </span>
                <span>{formatFieldValue(field, record[field])}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// Table display for list queries
function TableDisplay({ data }: { data: any }) {
  const records = data?.records || [];

  if (records.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No records found</div>;
  }

  // Determine columns to show (max 6)
  const allKeys = Object.keys(records[0]);
  const priorityFields = ['full_name', 'name', 'email', 'phone', 'funnel_stage', 'priority', 'source', 'score', 'created_at'];
  const columns = [
    ...priorityFields.filter((f) => allKeys.includes(f)),
    ...allKeys.filter((f) => !priorityFields.includes(f) && !f.includes('_id') && f !== 'id'),
  ].slice(0, 6);

  return (
    <div className="border rounded-lg overflow-hidden">
      <UITable>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col} className="capitalize">
                {col.replace(/_/g, ' ')}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.slice(0, 20).map((record: any, index: number) => (
            <TableRow key={record.id || index}>
              {columns.map((col) => (
                <TableCell key={col} className="max-w-[200px] truncate">
                  {formatFieldValue(col, record[col])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </UITable>
      {records.length > 20 && (
        <div className="p-2 text-center text-xs text-muted-foreground bg-muted/50">
          Showing 20 of {data.totalCount || records.length} records
        </div>
      )}
    </div>
  );
}

// Helper to format field values
function formatFieldValue(field: string, value: any): string | React.ReactNode {
  if (value === null || value === undefined) return '-';

  if (field === 'created_at' || field === 'updated_at' || field.includes('_at')) {
    return new Date(value).toLocaleDateString();
  }

  if (field === 'funnel_stage') {
    const colors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800',
      contacted: 'bg-yellow-100 text-yellow-800',
      qualified: 'bg-green-100 text-green-800',
      enrolled: 'bg-purple-100 text-purple-800',
      lost: 'bg-red-100 text-red-800',
    };
    return (
      <Badge variant="outline" className={cn('text-xs', colors[value])}>
        {value.replace(/_/g, ' ')}
      </Badge>
    );
  }

  if (field === 'priority') {
    const colors: Record<string, string> = {
      hot: 'bg-red-100 text-red-800',
      warm: 'bg-orange-100 text-orange-800',
      cold: 'bg-blue-100 text-blue-800',
    };
    return (
      <Badge variant="outline" className={cn('text-xs', colors[value])}>
        {value}
      </Badge>
    );
  }

  if (field === 'score') {
    const color = value >= 80 ? 'text-green-600' : value >= 50 ? 'text-yellow-600' : 'text-red-600';
    return <span className={cn('font-medium', color)}>{value}</span>;
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

// Visualization type selector
export function VisualizationTypeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: 'table' | 'chart' | 'cards' | 'metric';
  onChange: (type: 'table' | 'chart' | 'cards' | 'metric') => void;
  disabled?: boolean;
}) {
  const options = [
    { value: 'table', icon: Table, label: 'Table' },
    { value: 'chart', icon: BarChart3, label: 'Chart' },
    { value: 'cards', icon: LayoutGrid, label: 'Cards' },
    { value: 'metric', icon: Hash, label: 'Metric' },
  ] as const;

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {options.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8"
          onClick={() => onChange(option.value)}
          disabled={disabled}
        >
          <option.icon className="h-4 w-4 mr-1" />
          {option.label}
        </Button>
      ))}
    </div>
  );
}
