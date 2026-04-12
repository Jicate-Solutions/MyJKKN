'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useQuests, useQuestSubmissions } from '@/hooks/pde/use-pde';
import { BeatLoader } from 'react-spinners';
import {
  Target,
  Users,
  FileCheck,
  Eye,
  Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PDEQuest, QuestStatus } from '@/types/pde';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

export default function FacultyQuestsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: quests, isLoading } = useQuests({
    status: (statusFilter || undefined) as QuestStatus | undefined,
  });

  return (
    <ContentLayout title="Quest Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/faculty/pde/dashboard' },
          { label: 'Quests' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
              Quest Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor quest progress and review Learner submissions
            </p>
          </div>
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quests Table */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#0b6d41" />
              </div>
            ) : !quests || quests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Target className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">No quests found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Quests will appear here when created by coordinators or the admin team.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quest Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Difficulty</TableHead>
                    <TableHead className="text-center">
                      <span className="flex items-center justify-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Enrolled
                      </span>
                    </TableHead>
                    <TableHead className="text-center">
                      <span className="flex items-center justify-center gap-1">
                        <FileCheck className="h-3.5 w-3.5" />
                        Submissions
                      </span>
                    </TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quests.map((quest: PDEQuest) => {
                    const statusConf = STATUS_CONFIG[quest.status] || STATUS_CONFIG.open;
                    const enrolledCount = (quest as PDEQuest & { enrolled_count?: number }).enrolled_count || 0;
                    return (
                      <TableRow key={quest.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {quest.status === 'open' && (
                              <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            )}
                            <span className="font-medium">{quest.title}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {quest.quest_type.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {quest.difficulty ? DIFFICULTY_LABELS[quest.difficulty] || quest.difficulty : '--'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">{enrolledCount}</TableCell>
                        <TableCell className="text-center">--</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn('text-xs', statusConf.color)}>
                            {statusConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Link href={`/learn/quests/${quest.id}`}>
                            <Button size="sm" variant="outline" className="text-xs h-7">
                              <Eye className="h-3 w-3 mr-1" />
                              Review
                            </Button>
                          </Link>
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
