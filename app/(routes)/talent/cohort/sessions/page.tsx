'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, MapPin, HandMetal, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
  useCohortProfile,
  useAvailableSessions,
  useClaimSessionMutation,
} from '@/hooks/solutions/use-cohort-portal';

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

type CohortRole = 'observer' | 'co_lead' | 'lead';

const ROLE_LABELS: Record<CohortRole, string> = {
  observer: 'Observer - Watch and learn',
  co_lead: 'Co-Lead - Lead with supervision',
  lead: 'Lead - Full session leadership',
};

interface AvailableSession {
  id: string;
  title: string;
  session_date: string;
  program_id: string;
}

export default function AvailableSessionsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const [claimSession, setClaimSession] = useState<AvailableSession | null>(null);
  const [selectedRole, setSelectedRole] = useState<CohortRole>('observer');

  // Get cohort member profile
  const { data: cohortProfile, isLoading: profileLoading } = useCohortProfile(profile?.id || '');
  const memberId = cohortProfile?.id;
  const memberLevel = cohortProfile?.level || 0;

  // Get available sessions
  const { data: sessions, isLoading: sessionsLoading } = useAvailableSessions(memberId || '', memberLevel);

  // Claim mutation
  const claimMutation = useClaimSessionMutation();

  const isLoading = authLoading || profileLoading || sessionsLoading;

  const getEligibleRoles = (level: number): CohortRole[] => {
    const roles: CohortRole[] = ['observer'];
    if (level >= 1) roles.push('co_lead');
    if (level >= 2) roles.push('lead');
    return roles;
  };

  const handleClaim = async () => {
    if (!claimSession || !memberId) return;

    try {
      await claimMutation.mutateAsync({
        sessionId: claimSession.id,
        memberId,
        role: selectedRole as 'observer' | 'co_lead' | 'lead',
      });
      toast.success(`Successfully claimed session as ${selectedRole}!`);
      setClaimSession(null);
    } catch (error) {
      toast.error('Failed to claim session');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (!cohortProfile) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Cohort Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your cohort member profile has not been set up yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const eligibleRoles = getEligibleRoles(memberLevel);
  const typedSessions = (sessions || []) as AvailableSession[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Available Sessions</h1>
        <p className="text-muted-foreground">
          Browse and claim training sessions based on your level ({memberLevel}).
          Higher levels unlock more roles.
        </p>
      </div>

      {/* Level Info Banner */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Your Level: {memberLevel}</p>
              <p className="text-sm text-muted-foreground">
                Available roles: {eligibleRoles.join(', ')}
              </p>
            </div>
            <Badge variant="outline">
              {typedSessions.length} sessions available
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Grid */}
      {typedSessions.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {typedSessions.map((session) => (
            <Card key={session.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {session.title || 'Training Session'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Session Details */}
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatDateTime(session.session_date)}
                  </div>
                </div>

                {/* Eligible Roles */}
                <div className="flex flex-wrap gap-1">
                  {eligibleRoles.map((role) => (
                    <Badge key={role} variant="secondary" className="text-xs">
                      {role}
                    </Badge>
                  ))}
                </div>

                {/* Claim Button */}
                <Button
                  className="w-full"
                  onClick={() => {
                    setClaimSession(session);
                    setSelectedRole(eligibleRoles[eligibleRoles.length - 1]);
                  }}
                >
                  <HandMetal className="h-4 w-4 mr-2" />
                  Claim Session
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No available sessions</h3>
            <p className="text-muted-foreground">
              There are no training sessions available to claim at the moment.
              Check back later for new sessions.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Claim Dialog */}
      <Dialog open={!!claimSession} onOpenChange={() => setClaimSession(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Claim Training Session</DialogTitle>
            <DialogDescription>
              Select the role you want to take for this session. Your level ({memberLevel})
              determines which roles are available.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Session Info */}
            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="font-semibold">
                {claimSession?.title || 'Training Session'}
              </h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDateTime(claimSession?.scheduled_at || null)}
                </div>
              </div>
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <Label>Select Your Role</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as CohortRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eligibleRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Your level {memberLevel} allows you to claim as: {eligibleRoles.join(', ')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimSession(null)}>
              Cancel
            </Button>
            <Button onClick={handleClaim} disabled={claimMutation.isPending}>
              {claimMutation.isPending ? 'Claiming...' : 'Confirm Claim'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
