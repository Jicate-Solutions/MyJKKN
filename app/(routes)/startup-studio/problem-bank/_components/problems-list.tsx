'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { useProblems } from '@/hooks/startup-studio';

const THEMES = [
  'all',
  'healthcare',
  'education',
  'agriculture',
  'fintech',
  'environment',
  'logistics',
  'social',
  'energy',
  'other',
];

const STATUSES = ['all', 'open', 'claimed', 'in_progress', 'solved', 'archived'];

const THEME_COLORS: Record<string, string> = {
  healthcare: 'bg-red-100 text-red-800',
  education: 'bg-blue-100 text-blue-800',
  agriculture: 'bg-green-100 text-green-800',
  fintech: 'bg-amber-100 text-amber-800',
  environment: 'bg-emerald-100 text-emerald-800',
  logistics: 'bg-purple-100 text-purple-800',
  social: 'bg-pink-100 text-pink-800',
  energy: 'bg-orange-100 text-orange-800',
  other: 'bg-gray-100 text-gray-800',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  claimed: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  solved: 'bg-purple-100 text-purple-800',
  archived: 'bg-gray-100 text-gray-800',
};

export function ProblemsList() {
  const [search, setSearch] = useState('');
  const [themeFilter, setThemeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filters: Record<string, any> = {};
  if (themeFilter !== 'all') filters.theme = themeFilter;
  if (statusFilter !== 'all') filters.status = statusFilter;

  const { data: problemsRaw, isLoading, error } = useProblems(filters);
  const problems = problemsRaw as any;

  const problemsList = Array.isArray(problems)
    ? problems
    : problems?.data ?? [];

  const filteredProblems = problemsList.filter((p: any) =>
    p.title?.toLowerCase().includes(search.toLowerCase())
  );

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load problems. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search problems by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 mr-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Theme:</span>
          </div>
          {THEMES.map((theme) => (
            <Button
              key={theme}
              variant={themeFilter === theme ? 'default' : 'outline'}
              size="sm"
              onClick={() => setThemeFilter(theme)}
              className="capitalize text-xs h-7"
            >
              {theme === 'all' ? 'All Themes' : theme}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 mr-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Status:</span>
          </div>
          {STATUSES.map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="capitalize text-xs h-7"
            >
              {status === 'all'
                ? 'All Statuses'
                : status.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </div>

      {/* Problems Table */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filteredProblems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No problems found</p>
            <p className="text-sm text-muted-foreground">
              {search
                ? 'Try adjusting your search or filters'
                : 'Problems will appear here once added'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Theme</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProblems.map((problem: any) => (
                  <TableRow
                    key={problem.id}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell>
                      <Link
                        href={`/startup-studio/problem-bank/${problem.id}`}
                        className="font-medium hover:underline"
                      >
                        {problem.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {problem.theme && (
                        <Badge
                          variant="outline"
                          className={
                            THEME_COLORS[problem.theme] ??
                            'bg-gray-100 text-gray-800'
                          }
                        >
                          {problem.theme}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {problem.status && (
                        <Badge
                          variant="outline"
                          className={
                            STATUS_COLORS[problem.status] ??
                            'bg-gray-100 text-gray-800'
                          }
                        >
                          {problem.status.replace('_', ' ')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="capitalize">
                        {problem.severity ?? '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {problem.attempts_count ?? problem.attempts?.length ?? 0}
                    </TableCell>
                    <TableCell>
                      <Link href={`/startup-studio/problem-bank/${problem.id}`}>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
