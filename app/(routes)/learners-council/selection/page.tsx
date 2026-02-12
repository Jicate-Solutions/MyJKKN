/**
 * LC-005: Selection & Elections - Active Elections Page
 * Lists current elections with status, timelines, and nomination counts
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Vote, Calendar, Users, Trophy, Clock } from 'lucide-react';
import Link from 'next/link';
import { SelectionClientActions } from './_components/selection-client-actions';
import { canManageElections, getLCRole } from '@/lib/learners-council/lc-roles';

/** Status badge styling helper */
function getStatusConfig(status: string) {
  switch (status) {
    case 'nominations_open':
      return { label: 'Nominations Open', variant: 'default' as const, color: 'bg-blue-100 text-blue-800' };
    case 'voting_open':
      return { label: 'Voting Open', variant: 'default' as const, color: 'bg-green-100 text-green-800' };
    case 'voting_closed':
      return { label: 'Voting Closed', variant: 'secondary' as const, color: 'bg-yellow-100 text-yellow-800' };
    case 'results_declared':
      return { label: 'Results Declared', variant: 'outline' as const, color: 'bg-purple-100 text-purple-800' };
    default:
      return { label: status, variant: 'outline' as const, color: 'bg-gray-100 text-gray-800' };
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'yuva_selection': return 'YUVA Selection';
    case 'lc_progression': return 'LC Progression';
    case 'executive_rotation': return 'Executive Rotation';
    default: return type;
  }
}

export default async function SelectionPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/');
  }

  const supabase = await createClient();

  // Fetch all elections with nomination counts
  const { data: elections, error } = await supabase
    .from('lc_elections')
    .select(`
      *,
      nominations:lc_nominations(id, status),
      term:lc_terms(id, name, start_date, end_date)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[lc/selection] Error fetching elections:', error);
  }

  const electionsList = elections || [];

  const lcRole = getLCRole(profile.role || null, null);
  const showManageActions = canManageElections(lcRole);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Vote className="h-6 w-6 text-primary" />
            Selection & Elections
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage nominations, interviews, and elections for Learners Council positions
          </p>
        </div>
        {showManageActions && (
          <SelectionClientActions userId={profile.id} />
        )}
      </div>

      {/* Elections Grid */}
      {electionsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Vote className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No Elections Yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              There are no active or past elections. Elections will appear here once created by administrators.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {electionsList.map((election: any) => {
            const statusConfig = getStatusConfig(election.status);
            const nominationCount = election.nominations?.length || 0;
            const shortlistedCount = election.nominations?.filter(
              (n: any) => n.status === 'shortlisted' || n.status === 'selected'
            ).length || 0;

            const now = new Date();
            const nomOpen = new Date(election.nominations_open_at);
            const nomClose = new Date(election.nominations_close_at);
            const voteOpen = election.voting_open_at ? new Date(election.voting_open_at) : null;
            const voteClose = election.voting_close_at ? new Date(election.voting_close_at) : null;

            return (
              <Card key={election.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base leading-tight">
                      {election.title}
                    </CardTitle>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {getTypeLabel(election.type)}
                    </Badge>
                    {election.term && (
                      <Badge variant="secondary" className="text-xs">
                        {election.term.name}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Timeline */}
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        Nominations: {nomOpen.toLocaleDateString()} - {nomClose.toLocaleDateString()}
                      </span>
                    </div>
                    {voteOpen && voteClose && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          Voting: {voteOpen.toLocaleDateString()} - {voteClose.toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Nomination Stats */}
                  <div className="flex items-center gap-4 pt-2 border-t text-sm">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">{nominationCount}</span>
                      <span className="text-muted-foreground">Nominations</span>
                    </div>
                    {shortlistedCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Trophy className="h-4 w-4 text-amber-600" />
                        <span className="font-medium">{shortlistedCount}</span>
                        <span className="text-muted-foreground">Shortlisted</span>
                      </div>
                    )}
                  </div>

                  {/* Action Link */}
                  <div className="pt-2">
                    <Link
                      href={`/learners-council/selection/nominations?election=${election.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {election.status === 'nominations_open'
                        ? 'View & Submit Nominations'
                        : election.status === 'voting_open'
                          ? 'Cast Your Vote'
                          : election.status === 'results_declared'
                            ? 'View Results'
                            : 'View Details'}
                       &rarr;
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
