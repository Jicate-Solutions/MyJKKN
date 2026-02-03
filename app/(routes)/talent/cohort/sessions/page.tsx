'use client';

import { useEffect, useState } from 'react';
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
import { Calendar, Clock, MapPin, Users, HandMetal, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

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

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

type CohortRole = 'observer' | 'support' | 'co_lead' | 'lead';

const ROLE_LABELS: Record<CohortRole, string> = {
  observer: 'Observer - Watch and learn',
  support: 'Support - Assist the lead',
  co_lead: 'Co-Lead - Lead with supervision',
  lead: 'Lead - Full session leadership',
};

interface AvailableSession {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  location: string | null;
  program?: {
    title: string;
    track: string;
    solution?: {
      title: string;
      client?: {
        name: string;
      };
    };
  };
}

export default function AvailableSessionsPage() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberLevel, setMemberLevel] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [sessions, setSessions] = useState<AvailableSession[]>([]);
  const [claimSession, setClaimSession] = useState<AvailableSession | null>(null);
  const [selectedRole, setSelectedRole] = useState<CohortRole>('observer');
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: member } = await (supabase as any).from('sh_cohort_members')
        .select('id, level')
        .eq('user_id', user.id)
        .single();

      if (!member) {
        setIsLoading(false);
        return;
      }

      setMemberId(member.id);
      setMemberLevel(member.level || 0);

      // Fetch available sessions
      const { data } = await (supabase as any).from('sh_training_sessions')
        .select(`
          id, title, session_date, start_time, location,
          program:sh_training_programs(
            title, track,
            solution:sh_solutions(
              title,
              client:sh_clients(name)
            )
          )
        `)
        .eq('status', 'scheduled')
        .gte('session_date', new Date().toISOString().split('T')[0])
        .order('session_date', { ascending: true });

      setSessions((data as AvailableSession[]) || []);
      setIsLoading(false);
    }

    fetchData();
  }, []);

  const getEligibleRoles = (level: number): CohortRole[] => {
    const roles: CohortRole[] = ['observer', 'support'];
    if (level >= 1) roles.push('co_lead');
    if (level >= 2) roles.push('lead');
    return roles;
  };

  const handleClaim = async () => {
    if (!claimSession || !memberId) return;

    setIsClaiming(true);
    const supabase = createClient();

    const { error } = await (supabase as any).from('sh_cohort_assignments').insert({
      session_id: claimSession.id,
      cohort_member_id: memberId,
      role: selectedRole,
    });

    if (error) {
      toast.error(error.message || 'Failed to claim session');
    } else {
      toast.success(`Successfully claimed session as ${selectedRole}!`);
      // Remove from list
      setSessions(prev => prev.filter(s => s.id !== claimSession.id));
    }

    setIsClaiming(false);
    setClaimSession(null);
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

  const eligibleRoles = getEligibleRoles(memberLevel);

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
              {sessions.length} sessions available
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Grid */}
      {sessions.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <Card key={session.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {session.title || 'Training Session'}
                    </CardTitle>
                    {session.program?.solution && (
                      <CardDescription className="mt-1">
                        {session.program.solution.title}
                        <span className="block text-xs">
                          Client: {session.program.solution.client?.name || 'N/A'}
                        </span>
                      </CardDescription>
                    )}
                  </div>
                  {session.program?.track && (
                    <Badge variant="outline" className="shrink-0">
                      {session.program.track === 'track_a' ? 'Track A' : 'Track B'}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Session Details */}
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatDateTime(session.session_date)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {session.start_time || 'TBD'}
                  </div>
                  {session.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {session.location}
                    </div>
                  )}
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
                  {formatDateTime(claimSession?.session_date || null)}
                </div>
                {claimSession?.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {claimSession.location}
                  </div>
                )}
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
            <Button onClick={handleClaim} disabled={isClaiming}>
              {isClaiming ? 'Claiming...' : 'Confirm Claim'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
