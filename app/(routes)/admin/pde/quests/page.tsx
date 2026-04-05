'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminQuests, useUpdateQuestStatus } from '@/hooks/pde/use-pde-phase2';
import { BeatLoader } from 'react-spinners';
import {
  Plus,
  Search,
  Target,
  Users,
  Building2,
  Lightbulb,
  Filter,
  MoreHorizontal,
  Pencil,
  Archive,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { PDEQuest, QuestType, QuestDifficulty, QuestStatus } from '@/types/pde';

// ============================================
// Constants
// ============================================

const QUEST_TYPE_CONFIG: Record<QuestType, { label: string; color: string }> = {
  solo: { label: 'Solo', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  team: { label: 'Team', color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' },
  cross_dept: { label: 'Cross-Dept', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' },
  community: { label: 'Community', color: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  industry: { label: 'Industry', color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
};

const DIFFICULTY_CONFIG: Record<QuestDifficulty, { label: string; color: string }> = {
  beginner: { label: 'Beginner', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40' },
  intermediate: { label: 'Intermediate', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40' },
  advanced: { label: 'Advanced', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40' },
  expert: { label: 'Expert', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40' },
};

const STATUS_CONFIG: Record<QuestStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700 dark:bg-slate-950/40' },
  open: { label: 'Open', color: 'bg-green-100 text-green-700 dark:bg-green-950/40' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-600 dark:bg-gray-950/40' },
};

// ============================================
// Main Page
// ============================================

export default function AdminQuestsPage() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const { data: quests, isLoading } = useAdminQuests({
    status: filterStatus !== 'all' ? (filterStatus as QuestStatus) : undefined,
    quest_type: filterType !== 'all' ? (filterType as QuestType) : undefined,
  });
  const updateStatus = useUpdateQuestStatus();

  const filtered = (quests || []).filter((q: PDEQuest) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return q.title.toLowerCase().includes(s) || q.description.toLowerCase().includes(s);
  });

  return (
    <ContentLayout title="Quest Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'PDE', href: '/admin/pde/assessments' },
          { label: 'Quests' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Quest Management</h1>
            <p className="text-sm text-muted-foreground">
              Create and manage real-world problem quests for Learners
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/pde/quests/create">
              <Plus className="mr-2 h-4 w-4" />
              Create Quest
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search quests..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(QUEST_TYPE_CONFIG).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Quests Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#00e902" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Target className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground mb-4">
                  {search || filterStatus !== 'all' || filterType !== 'all'
                    ? 'No quests match your filters'
                    : 'No quests created yet'}
                </p>
                {!search && filterStatus === 'all' && filterType === 'all' && (
                  <Button asChild variant="outline">
                    <Link href="/admin/pde/quests/create">
                      <Plus className="mr-2 h-4 w-4" />
                      Create First Quest
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Difficulty</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Points</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Hours</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((quest: PDEQuest) => {
                    const typeConfig = QUEST_TYPE_CONFIG[quest.quest_type];
                    const diffConfig = quest.difficulty ? DIFFICULTY_CONFIG[quest.difficulty] : null;
                    const statusConfig = STATUS_CONFIG[quest.status];

                    return (
                      <TableRow key={quest.id}>
                        <TableCell>
                          <div>
                            <Link
                              href={`/admin/pde/quests/create?edit=${quest.id}`}
                              className="font-medium hover:underline"
                            >
                              {quest.title}
                            </Link>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {quest.problem_statement}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs', typeConfig.color)}>
                            {typeConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {diffConfig ? (
                            <Badge variant="outline" className={cn('text-xs', diffConfig.color)}>
                              {diffConfig.label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn('text-xs', statusConfig.color)}>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {quest.reputation_points}
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          {quest.estimated_hours ? `${quest.estimated_hours}h` : '--'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/pde/quests/create?edit=${quest.id}`}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              {quest.status === 'draft' && (
                                <DropdownMenuItem
                                  onClick={() => updateStatus.mutate({ id: quest.id, status: 'open' })}
                                >
                                  <Target className="mr-2 h-4 w-4" />
                                  Publish (Open)
                                </DropdownMenuItem>
                              )}
                              {quest.status === 'open' && (
                                <DropdownMenuItem
                                  onClick={() => updateStatus.mutate({ id: quest.id, status: 'archived' })}
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  Archive
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
