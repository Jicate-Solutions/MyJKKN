'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Hammer,
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  Building2,
  IndianRupee,
} from 'lucide-react';
import { toast } from 'sonner';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getPhaseStatusBadge(status: string) {
  const statusColors: Record<string, string> = {
    prd_writing: 'bg-blue-100 text-blue-800',
    prototype_building: 'bg-purple-100 text-purple-800',
    revisions: 'bg-yellow-100 text-yellow-800',
    deploying: 'bg-green-100 text-green-800',
    training: 'bg-indigo-100 text-indigo-800',
  };

  const statusLabels: Record<string, string> = {
    prd_writing: 'PRD Writing',
    prototype_building: 'Prototyping',
    revisions: 'Revisions',
    deploying: 'Deploying',
    training: 'Training',
  };

  return (
    <Badge className={statusColors[status] || 'bg-gray-100 text-gray-800'}>
      {statusLabels[status] || status}
    </Badge>
  );
}

interface AvailablePhase {
  id: string;
  title: string;
  description: string | null;
  status: string;
  estimated_value: number | null;
  solution?: {
    solution_code: string;
    title: string;
    client?: {
      name: string;
    };
  };
}

// Threshold for self-claim (3L = 300000)
const SELF_CLAIM_THRESHOLD = 300000;

export default function AvailablePhasesPage() {
  const [builderId, setBuilderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [phases, setPhases] = useState<AvailablePhase[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPhase, setSelectedPhase] = useState<AvailablePhase | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: builder } = await (supabase as any).from('sh_builders')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!builder) {
        setIsLoading(false);
        return;
      }

      setBuilderId(builder.id);

      // Fetch available phases (not yet assigned to this builder)
      const { data } = await (supabase as any).from('sh_solution_phases')
        .select(`
          id, title, description, status, estimated_value,
          solution:sh_solutions(
            solution_code, title,
            client:sh_clients(name)
          )
        `)
        .in('status', ['prd_writing', 'prototype_building', 'revisions', 'deploying', 'training'])
        .order('created_at', { ascending: false });

      setPhases((data as AvailablePhase[]) || []);
      setIsLoading(false);
    }

    fetchData();
  }, []);

  const handleClaimPhase = async () => {
    if (!selectedPhase || !builderId) return;

    setIsClaiming(true);
    const supabase = createClient();

    const canSelfClaim = !selectedPhase.estimated_value || selectedPhase.estimated_value <= SELF_CLAIM_THRESHOLD;

    const { error } = await (supabase as any).from('sh_builder_assignments').insert({
      phase_id: selectedPhase.id,
      builder_id: builderId,
      role: 'contributor',
      status: canSelfClaim ? 'approved' : 'requested',
      requested_at: new Date().toISOString(),
    });

    if (error) {
      toast.error('Failed to claim phase. Please try again.');
    } else {
      if (canSelfClaim) {
        toast.success('Phase claimed successfully! You can start working.');
      } else {
        toast.success('Phase claim request submitted. Awaiting MD approval.');
      }
      // Remove from available list
      setPhases(prev => prev.filter(p => p.id !== selectedPhase.id));
    }

    setIsClaiming(false);
    setSelectedPhase(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  // Filter phases
  const filteredPhases = phases.filter((phase) => {
    const matchesSearch =
      searchQuery === '' ||
      phase.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      phase.solution?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      phase.solution?.client?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || phase.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const uniqueStatuses = [...new Set(phases.map((p) => p.status))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Available Phases</h1>
        <p className="text-muted-foreground">
          Browse and claim phases you want to work on
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search phases, solutions, or clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {uniqueStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Phases Grid */}
      {filteredPhases.length === 0 ? (
        <div className="text-center py-12">
          <Hammer className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No available phases</h3>
          <p className="text-muted-foreground">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Check back later for new phases to claim'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPhases.map((phase) => {
            const canSelfClaim = !phase.estimated_value || phase.estimated_value <= SELF_CLAIM_THRESHOLD;

            return (
              <Card key={phase.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{phase.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {phase.solution?.solution_code} - {phase.solution?.title}
                      </CardDescription>
                    </div>
                    {getPhaseStatusBadge(phase.status)}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="space-y-3 flex-1">
                    {/* Client */}
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{phase.solution?.client?.name || 'No Client'}</span>
                    </div>

                    {/* Value */}
                    <div className="flex items-center gap-2 text-sm">
                      <IndianRupee className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {phase.estimated_value
                          ? formatCurrency(phase.estimated_value)
                          : 'Value not set'}
                      </span>
                    </div>

                    {/* Approval Info */}
                    <div className="flex items-center gap-2 text-sm">
                      {canSelfClaim ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-green-700">Instant claim</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4 text-yellow-500" />
                          <span className="text-yellow-700">Requires MD approval</span>
                        </>
                      )}
                    </div>

                    {phase.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {phase.description}
                      </p>
                    )}
                  </div>

                  <Button
                    className="w-full mt-4"
                    onClick={() => setSelectedPhase(phase)}
                  >
                    <Hammer className="mr-2 h-4 w-4" />
                    Claim Phase
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Claim Confirmation Dialog */}
      <AlertDialog open={!!selectedPhase} onOpenChange={() => setSelectedPhase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Claim This Phase?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  You are about to claim <strong>{selectedPhase?.title}</strong>
                </p>

                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Solution:</span>
                    <span>{selectedPhase?.solution?.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Client:</span>
                    <span>{selectedPhase?.solution?.client?.name || 'No Client'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Value:</span>
                    <span>
                      {selectedPhase?.estimated_value
                        ? formatCurrency(selectedPhase.estimated_value)
                        : 'Not set'}
                    </span>
                  </div>
                </div>

                {(!selectedPhase?.estimated_value || selectedPhase.estimated_value <= SELF_CLAIM_THRESHOLD) ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg text-green-800">
                    <CheckCircle className="h-5 w-5" />
                    <span>This phase will be claimed instantly.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-800">
                    <Clock className="h-5 w-5" />
                    <span>
                      This phase requires MD approval. You will be notified once approved.
                    </span>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClaimPhase} disabled={isClaiming}>
              {isClaiming ? 'Claiming...' : 'Claim Phase'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
