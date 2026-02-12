/**
 * LC Structure - Org Chart Overview
 * Shows the two-tier LC structure: JKKN-wide positions (top) and YUVA chapters (bottom)
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Crown,
  Users,
  Network,
  Building2,
  ChevronRight,
  Calendar,
  UserCheck,
  Layers
} from 'lucide-react';

// Status color map
const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  upcoming: 'bg-blue-100 text-blue-800',
  completed: 'bg-gray-100 text-gray-800',
  archived: 'bg-gray-100 text-gray-500'
};

// Category color map for positions
const categoryColors: Record<string, string> = {
  executive: 'bg-amber-100 text-amber-800 border-amber-200',
  institution_president: 'bg-blue-100 text-blue-800 border-blue-200',
  portfolio_head: 'bg-purple-100 text-purple-800 border-purple-200',
  at_large: 'bg-gray-100 text-gray-700 border-gray-200'
};

const categoryLabels: Record<string, string> = {
  executive: 'Executive',
  institution_president: 'Institution President',
  portfolio_head: 'Portfolio Head',
  at_large: 'At Large'
};

export default async function LCStructurePage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

  // Fetch active term, positions, members, and chapters in parallel
  const [
    { data: activeTerm },
    { data: positions },
    { data: members },
    { data: chapters }
  ] = await Promise.all([
    supabase
      .from('lc_terms')
      .select('*')
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('lc_positions')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('lc_members')
      .select(`
        *,
        position:lc_positions(id, title, category, tier),
        user:profiles(id, full_name, email, avatar_url)
      `)
      .eq('status', 'active'),
    supabase
      .from('yuva_chapters')
      .select(`
        *,
        institution:institutions(id, name)
      `)
      .eq('is_active', true)
      .order('name', { ascending: true })
  ]);

  // Build position-to-member lookup for active term
  const membersByPosition: Record<string, typeof members extends (infer T)[] | null ? T : never> = {};
  if (members && activeTerm) {
    for (const m of members) {
      if (m.term_id === activeTerm.id) {
        membersByPosition[m.position_id] = m;
      }
    }
  }

  // Group positions by category
  const positionsByCategory: Record<string, typeof positions> = {};
  if (positions) {
    for (const pos of positions) {
      if (!positionsByCategory[pos.category]) {
        positionsByCategory[pos.category] = [];
      }
      positionsByCategory[pos.category].push(pos);
    }
  }

  const categoryOrder = ['executive', 'institution_president', 'portfolio_head', 'at_large'];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            LC Organization Structure
          </h1>
          <p className="text-muted-foreground mt-1">
            Two-tier governance: JKKN-wide Learners Council and institution-level YUVA Chapters
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/learners-council/structure/terms">
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-1" />
              Manage Terms
            </Button>
          </Link>
          <Link href="/learners-council/structure/members">
            <Button variant="outline" size="sm">
              <Users className="h-4 w-4 mr-1" />
              All Members
            </Button>
          </Link>
        </div>
      </div>

      {/* Active Term Banner */}
      {activeTerm ? (
        <div className="rounded-lg border bg-gradient-to-r from-amber-50 to-yellow-50 p-4">
          <div className="flex items-center gap-3">
            <Crown className="h-6 w-6 text-amber-600" />
            <div>
              <h2 className="font-semibold">{activeTerm.name}</h2>
              <p className="text-sm text-muted-foreground">
                {new Date(activeTerm.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' '}to{' '}
                {new Date(activeTerm.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <Badge className="ml-auto bg-amber-600 text-white">Active Term</Badge>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p>No active term configured.</p>
          <Link href="/learners-council/structure/terms">
            <Button variant="link" size="sm">Create a term</Button>
          </Link>
        </div>
      )}

      {/* TIER 1: JKKN-Wide Positions */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-600" />
          Tier 1: JKKN-Wide Learners Council
        </h2>

        {positions && positions.length > 0 ? (
          <div className="space-y-6">
            {categoryOrder.map((category) => {
              const catPositions = positionsByCategory[category];
              if (!catPositions || catPositions.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                    {categoryLabels[category] || category}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {catPositions.map((pos) => {
                      const holder = membersByPosition[pos.id];
                      const colorClass = categoryColors[pos.category] || categoryColors.at_large;

                      return (
                        <Card key={pos.id} className={`border ${holder ? '' : 'border-dashed opacity-70'}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <Badge variant="outline" className={`text-xs ${colorClass}`}>
                                {categoryLabels[pos.category] || pos.category}
                              </Badge>
                              {pos.tier === 'jkkn_wide' && (
                                <span className="text-xs text-muted-foreground">JKKN</span>
                              )}
                            </div>
                            <h4 className="font-medium text-sm mb-2">{pos.title}</h4>
                            {holder ? (
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                  {(holder.user as any)?.full_name?.charAt(0) || '?'}
                                </div>
                                <div>
                                  <p className="text-sm font-medium">
                                    {(holder.user as any)?.full_name || 'Unknown'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {(holder.user as any)?.email || ''}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Vacant</p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-muted-foreground">
              <UserCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p>No positions configured yet.</p>
              <p className="text-xs mt-1">Positions are seeded via database setup.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* TIER 2: YUVA Chapters */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            Tier 2: YUVA Chapters (Institution-Level)
          </h2>
          <Link href="/learners-council/structure/yuva">
            <Button variant="outline" size="sm">
              <Layers className="h-4 w-4 mr-1" />
              Manage YUVA
            </Button>
          </Link>
        </div>

        {chapters && chapters.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {chapters.map((chapter) => (
              <Link key={chapter.id} href={`/learners-council/structure/yuva/${chapter.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{chapter.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {(chapter.institution as any)?.name || 'Unknown Institution'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        {chapter.academic_year}
                      </Badge>
                      {chapter.is_active && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          Active
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p>No YUVA chapters created yet.</p>
              <Link href="/learners-council/structure/yuva">
                <Button variant="link" size="sm">Create chapters</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
