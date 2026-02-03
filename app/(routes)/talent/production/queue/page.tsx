'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

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
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [learnerDivision, setLearnerDivision] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [myDivisionWork, setMyDivisionWork] = useState<AvailableWork[]>([]);
  const [allWork, setAllWork] = useState<Record<string, AvailableWork[]>>({});
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: learner } = await (supabase as any).from('sh_production_learners')
        .select('id, division')
        .eq('user_id', user.id)
        .single();

      if (!learner) {
        setIsLoading(false);
        return;
      }

      setLearnerId(learner.id);
      setLearnerDivision(learner.division);

      // Fetch available deliverables (not yet claimed)
      const { data: deliverables } = await (supabase as any).from('sh_content_deliverables')
        .select(`
          id, title, notes,
          order:sh_content_orders(division, due_date)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const available = (deliverables as AvailableWork[]) || [];

      // Filter for my division
      const myDivision = available.filter(d => (d.order as any)?.division === learner.division);
      setMyDivisionWork(myDivision);

      // Group all by division
      const byDivision: Record<string, AvailableWork[]> = {};
      available.forEach(d => {
        const division = (d.order as any)?.division || 'other';
        if (!byDivision[division]) byDivision[division] = [];
        byDivision[division].push(d);
      });
      setAllWork(byDivision);

      setIsLoading(false);
    }

    fetchData();
  }, []);

  const handleClaim = async (deliverableId: string) => {
    if (!learnerId) return;

    setIsClaiming(true);
    const supabase = createClient();

    // Create assignment and update deliverable status
    const { error: assignError } = await (supabase as any).from('sh_production_assignments').insert({
      deliverable_id: deliverableId,
      learner_id: learnerId,
      role: 'creator',
    });

    if (assignError) {
      toast.error('Failed to claim deliverable');
      setIsClaiming(false);
      return;
    }

    const { error: updateError } = await (supabase as any).from('sh_content_deliverables')
      .update({ status: 'in_progress' })
      .eq('id', deliverableId);

    if (updateError) {
      toast.error('Claimed but status update failed');
    } else {
      toast.success('Deliverable claimed successfully');
      // Remove from lists
      setMyDivisionWork(prev => prev.filter(w => w.id !== deliverableId));
      setAllWork(prev => {
        const updated: Record<string, AvailableWork[]> = {};
        Object.entries(prev).forEach(([div, items]) => {
          updated[div] = items.filter(w => w.id !== deliverableId);
        });
        return updated;
      });
    }

    setIsClaiming(false);
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

  const renderWorkCard = (work: AvailableWork) => {
    const division = (work.order as any)?.division || 'other';
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
                {(work.order as any)?.due_date
                  ? new Date((work.order as any).due_date).toLocaleDateString()
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
            disabled={isClaiming}
            className="w-full"
          >
            {isClaiming ? 'Claiming...' : 'Claim This Work'}
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
            {Object.entries(allWork).map(([division, work]) => {
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

            {Object.values(allWork).every(w => !w || w.length === 0) && (
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
