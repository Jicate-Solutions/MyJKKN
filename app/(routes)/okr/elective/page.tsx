'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import {
  Target,
  Plus,
  Search,
  Calendar,
  TrendingUp,
  MoreHorizontal,
  Edit2,
  Trash2,
  Eye,
  Info,
  ArrowRight
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useMyElectiveOKRs, useDeleteElectiveOKR } from '@/hooks/okr/use-learner-okrs';
import { KRStatus, LearnerElectiveOKR } from '@/types/okr';
import { format } from 'date-fns';
import { toast } from 'sonner';

const statusBadgeConfig: Record<KRStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  not_started: { variant: 'outline', label: 'Not Started' },
  on_track: { variant: 'default', label: 'On Track' },
  at_risk: { variant: 'secondary', label: 'At Risk' },
  behind: { variant: 'destructive', label: 'Behind' },
  blocked: { variant: 'destructive', label: 'Blocked' },
  completed: { variant: 'default', label: 'Completed' }
};

function ElectiveOKRCard({ okr }: { okr: LearnerElectiveOKR }) {
  const deleteElective = useDeleteElectiveOKR();
  const statusConfig = statusBadgeConfig[okr.status] || statusBadgeConfig.not_started;

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to deactivate this elective OKR?')) return;
    try {
      await deleteElective.mutateAsync(okr.id);
      toast.success('Elective OKR deactivated');
    } catch {
      toast.error('Failed to deactivate');
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-amber-600" />
              <Badge variant="outline" className="text-xs">Elective</Badge>
              <Badge variant={statusConfig.variant} className="text-xs">
                {statusConfig.label}
              </Badge>
            </div>
            <h3 className="font-semibold text-lg">{okr.title}</h3>
            {okr.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{okr.description}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/okr/elective/${okr.id}`}>
                  <Eye className="mr-2 h-4 w-4" /> View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/okr/elective/${okr.id}/edit`}>
                  <Edit2 className="mr-2 h-4 w-4" /> Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Deactivate
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{Math.round(okr.progress)}%</span>
            </div>
            <Progress value={okr.progress} className="h-2" />
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            {okr.deadline && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>Due {format(new Date(okr.deadline), 'MMM d, yyyy')}</span>
              </div>
            )}
            {okr.target_value !== null && (
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>{okr.current_value} / {okr.target_value} {okr.unit || ''}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ElectiveOKRPage() {
  const { data: electives, isLoading, error } = useMyElectiveOKRs();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredElectives = electives?.filter(okr =>
    okr.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    okr.description?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <ContentLayout title="Elective OKRs">
      <div className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Transitioning to Learning Paths</AlertTitle>
          <AlertDescription>
            Elective OKRs are being replaced by the Learning Paths module for a more structured approach to self-directed learning goals.
            <Link href="/learning-paths" className="inline-flex items-center gap-1 ml-1 font-medium underline">
              Go to Learning Paths <ArrowRight className="h-3 w-3" />
            </Link>
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">My Elective OKRs</h2>
            <p className="text-muted-foreground">
              Self-defined objectives and key results
            </p>
          </div>
          <Button asChild>
            <Link href="/okr/elective/new">
              <Plus className="mr-2 h-4 w-4" /> New Elective OKR
            </Link>
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search elective OKRs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="pt-6 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <p>Failed to load elective OKRs. Please try again later.</p>
            </CardContent>
          </Card>
        ) : filteredElectives.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Target className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <CardTitle className="text-lg mb-2">No Elective OKRs Yet</CardTitle>
              <CardDescription className="mb-4">
                Create your own objectives and key results to track personal learning goals.
              </CardDescription>
              <Button asChild>
                <Link href="/okr/elective/new">
                  <Plus className="mr-2 h-4 w-4" /> Create Your First Elective OKR
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredElectives.map(okr => (
              <ElectiveOKRCard key={okr.id} okr={okr} />
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
