'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Video,
  Palette,
  FileText,
  GraduationCap,
  Languages,
  Search,
  Clock,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useProductionProfile,
  useAvailableWork,
  useClaimWork,
} from '@/hooks/solutions/use-production-portal';

const divisionIcons: Record<string, typeof Video> = {
  video: Video,
  graphics: Palette,
  content: FileText,
  education: GraduationCap,
  translation: Languages,
  research: Search,
};

const divisionColors: Record<string, string> = {
  video: 'bg-red-100 text-red-800',
  graphics: 'bg-purple-100 text-purple-800',
  content: 'bg-blue-100 text-blue-800',
  education: 'bg-green-100 text-green-800',
  translation: 'bg-orange-100 text-orange-800',
  research: 'bg-yellow-100 text-yellow-800',
};

interface AvailableWork {
  id: string;
  title: string;
  notes: string | null;
  order?: {
    division: string;
    due_date: string | null;
  };
}

export default function ProductionQueuePage() {
  const { profile, isLoading: authLoading } = useAuth();

  // Get production learner profile
  const { data: productionProfile, isLoading: profileLoading } = useProductionProfile(profile?.id || '');
  const learnerId = productionProfile?.id;
  const learnerDivision = productionProfile?.division || '';

  // Get available work
  const { data: availableWork, isLoading: workLoading } = useAvailableWork(learnerId || '');

  // Claim mutation
  const claimMutation = useClaimWork();

  const isLoading = authLoading || profileLoading || workLoading;

  const handleClaim = async (deliverableId: string) => {
    if (!learnerId) return;

    try {
      await claimMutation.mutateAsync({ deliverableId, learnerId });
      toast.success('Deliverable claimed successfully');
    } catch (error) {
      toast.error('Failed to claim deliverable');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (!productionProfile) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your production learner profile has not been set up yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const typedWork = (availableWork || []) as AvailableWork[];

  // Filter for my division
  const myDivisionWork = typedWork.filter(
    (d) => (d.order as Record<string, unknown>)?.division === learnerDivision
  );

  // Group all by division
  const byDivision: Record<string, AvailableWork[]> = {};
  typedWork.forEach((d) => {
    const division = (d.order as Record<string, unknown>)?.division as string || 'other';
    if (!byDivision[division]) byDivision[division] = [];
    byDivision[division].push(d);
  });

  const renderWorkCard = (work: AvailableWork) => {
    const division = (work.order as Record<string, unknown>)?.division as string || 'other';
    const DivisionIcon = divisionIcons[division] || FileText;

    return (
      <Card key={work.id} className="hover:border-primary transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{work.title}</CardTitle>
              <CardDescription className="mt-1">
                Order #{work.id.slice(-8)}
              </CardDescription>
            </div>
            <Badge className={divisionColors[division] || ''}>
              <DivisionIcon className="h-3 w-3 mr-1" />
              {division}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {work.notes && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {work.notes}
            </p>
          )}

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-4 w-4" />
                {(work.order as Record<string, unknown>)?.due_date
                  ? new Date((work.order as Record<string, unknown>).due_date as string).toLocaleDateString()
                  : 'No deadline'}
              </span>
              <span className="flex items-center gap-1 text-green-600">
                <DollarSign className="h-4 w-4" />
                Est. 500 - 2,000
              </span>
            </div>
          </div>

          <Button
            onClick={() => handleClaim(work.id)}
            disabled={claimMutation.isPending}
            className="w-full"
          >
            {claimMutation.isPending ? 'Claiming...' : 'Claim This Work'}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Available Work</h1>
        <p className="text-muted-foreground">
          Browse and claim deliverables to work on
        </p>
      </div>

      <Tabs defaultValue="my-division">
        <TabsList>
          <TabsTrigger value="my-division">
            My Division ({myDivisionWork.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            All Divisions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-division" className="mt-6">
          {myDivisionWork.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {myDivisionWork.map(renderWorkCard)}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Available Work</h3>
                <p className="text-muted-foreground mt-1">
                  There are no unclaimed deliverables in your division ({learnerDivision}) right now.
                  Check back later or browse other divisions.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          <div className="space-y-8">
            {Object.entries(byDivision).map(([division, work]) => {
              if (!work || work.length === 0) return null;
              const DivisionIcon = divisionIcons[division] || FileText;

              return (
                <div key={division}>
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <DivisionIcon className="h-5 w-5" />
                    {division.charAt(0).toUpperCase() + division.slice(1)}
                    <Badge variant="secondary">{work.length}</Badge>
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {work.map(renderWorkCard)}
                  </div>
                </div>
              );
            })}

            {Object.values(byDivision).every((w) => !w || w.length === 0) && (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Available Work</h3>
                  <p className="text-muted-foreground mt-1">
                    There are no unclaimed deliverables across any division.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
