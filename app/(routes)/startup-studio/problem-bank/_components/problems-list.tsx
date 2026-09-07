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
import { ApiError } from '@/lib/api/client';
import { PROBLEM_THEMES, type ProblemTheme } from '@/types/startup-studio';

// Built from the enum itself — see PROBLEM_THEMES. The previous hardcoded
// list offered four themes the database has never had (fintech, logistics,
// social, energy), each of which returned HTTP 500 when selected, and hid
// three it does have (community, operations, productivity).
const THEMES = ['all', ...PROBLEM_THEMES];

const STATUSES = ['all', 'open', 'claimed', 'in_progress', 'solved', 'archived'];

// One colour per real enum value. Record<ProblemTheme, string> (not
// Record<string, string>) so adding a theme to the enum without a colour is a
// compile error rather than an unstyled chip discovered in production.
const THEME_COLORS: Record<ProblemTheme, string> = {
  healthcare: 'bg-red-100 text-red-800',
  education: 'bg-blue-100 text-blue-800',
  agriculture: 'bg-green-100 text-green-800',
  environment: 'bg-emerald-100 text-emerald-800',
  community: 'bg-pink-100 text-pink-800',
  operations: 'bg-purple-100 text-purple-800',
  productivity: 'bg-amber-100 text-amber-800',
  other: 'bg-gray-100 text-gray-800',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  claimed: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  solved: 'bg-purple-100 text-purple-800',
  archived: 'bg-gray-100 text-gray-800',
};

// Every failure used to render "Failed to load problems. Please try
// refreshing the page." — including the failures where refreshing can never
// work: a signed-out session, a missing permission, or a filter naming a
// value the problem bank has no such thing as. Telling someone to refresh a
// request that is structurally impossible costs them minutes and costs
// support a ticket. So say which of the two it is, and say what went wrong.
function describeLoadError(error: unknown): {
  headline: string;
  detail: string;
} {
  const status = error instanceof ApiError ? error.status : undefined;
  const serverMessage =
    error instanceof Error && error.message ? ` (${error.message})` : '';

  // No status at all means the request never reached the server.
  if (status === undefined) {
    return {
      headline: 'Could not reach the server.',
      detail: 'Check your internet connection, then try again.',
    };
  }
  if (status === 401) {
    return {
      headline: 'You have been signed out.',
      detail: 'Sign in again to open the problem bank. Refreshing will not help.',
    };
  }
  if (status === 403) {
    return {
      headline: 'Your account cannot open the problem bank.',
      detail:
        'This page needs the Startup Studio problem-bank permission. Ask a ' +
        'Startup Studio coordinator to grant it — refreshing will not help.',
    };
  }
  if (status < 500) {
    return {
      headline: 'This search cannot be run.',
      detail:
        `The filters being asked for do not exist in the problem bank${serverMessage}. ` +
        'Clear the filters and search again — refreshing will not help.',
    };
  }
  return {
    headline: 'The problem bank could not be loaded.',
    detail:
      `Something went wrong on our side, not yours${serverMessage}. Trying ` +
      'again in a minute may work; if it keeps failing, report it.',
  };
}

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
    const { headline, detail } = describeLoadError(error);
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <span className="font-medium">{headline}</span> {detail}
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
                        {problem.severity_rating ?? '-'}
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
