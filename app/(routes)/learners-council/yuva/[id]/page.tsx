/**
 * YUVA Chapter Detail Page
 * Shows chapter leadership, verticals, stakeholders, and member assignments
 *
 * CHAPTER LEADERSHIP SOURCE
 * -------------------------
 * Chair and Co-Chair are read from lc_members joined to lc_positions where
 * tier = 'yuva_chapter' — the same source the YUVA Chapter Leaders directory
 * at /learners-council/yuva/members uses, and the same source the
 * _resolver_privilege_yuva_chapter_chairs view uses to grant chapter-chair
 * privileges.
 *
 * This page previously read leadership from yuva_vertical_members, which has
 * never held a row on production. Every chapter therefore rendered its Chair
 * and both Co-Chairs as "Vacant" while the directory listed the very same
 * people as sitting leaders — two surfaces stating opposite facts. The seats
 * themselves come from lc_positions for this chapter's institution, so
 * "Vacant" now marks a seat that genuinely has no active holder.
 *
 * yuva_vertical_members still backs the Verticals and Stakeholder Verticals
 * sections below; that is its own membership space and is left untouched.
 */

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Building2,
  Crown,
  Users,
  Layers,
  UserCheck,
  ArrowLeft,
  Shield,
  Heart,
  Sprout,
  Mountain
} from 'lucide-react';
import { VerticalMembersPanel } from '../_components/vertical-members-panel';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** An lc_positions row of tier 'yuva_chapter' — one leadership seat. */
interface LeadershipSeat {
  id: string;
  title: string;
  category: string;
  tier: string;
  sort_order: number | null;
}

/** An active lc_members row sitting in one of those seats. */
interface LeadershipHolder {
  id: string;
  status: string;
  institution_id: string | null;
  position: LeadershipSeat | null;
  user: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

export default async function YUVAChapterDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, full_name, avatar_url, email')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }

  // Fetch chapter details
  const { data: chapter } = await supabase
    .from('yuva_chapters')
    .select(`
      *,
      institution:institutions(id, name)
    `)
    .eq('id', id)
    .maybeSingle();

  if (!chapter) {
    notFound();
  }

  const chapterInstitutionId = (chapter.institution_id as string | null) ?? null;

  // Fetch verticals, vertical members, and chapter leadership in parallel.
  // Leadership comes from lc_members + lc_positions (tier = 'yuva_chapter'),
  // scoped to this chapter's institution — mirrors /yuva/members.
  const [
    { data: verticals },
    { data: members },
    { data: leadershipSeats },
    { data: leadershipHolders }
  ] = await Promise.all([
    supabase
      .from('yuva_verticals')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('yuva_vertical_members')
      .select(`
        *,
        vertical:yuva_verticals(id, name, type, icon),
        user:profiles(id, full_name, email, avatar_url)
      `)
      .eq('chapter_id', id)
      .eq('is_active', true),
    chapterInstitutionId
      ? supabase
          .from('lc_positions')
          .select('id, title, category, tier, sort_order')
          .eq('tier', 'yuva_chapter')
          .eq('institution_id', chapterInstitutionId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as LeadershipSeat[] }),
    chapterInstitutionId
      ? supabase
          .from('lc_members')
          .select(`
            id, status, institution_id,
            position:lc_positions!inner(id, title, category, tier, sort_order),
            user:profiles(id, full_name, email, avatar_url)
          `)
          .eq('position.tier', 'yuva_chapter')
          .eq('institution_id', chapterInstitutionId)
          .eq('status', 'active')
      : Promise.resolve({ data: [] as LeadershipHolder[] })
  ]);

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  // One active holder per seat. A seat with no entry here is genuinely unfilled.
  const holderByPositionId = new Map<string, LeadershipHolder>(
    ((leadershipHolders as unknown as LeadershipHolder[]) || [])
      .filter((m) => m.position?.id)
      .map((m) => [m.position!.id, m] as [string, LeadershipHolder])
  );

  const seats = ((leadershipSeats as unknown as LeadershipSeat[]) || []).filter(
    (p) => p.category === 'yuva_chair' || p.category === 'yuva_co_chair'
  );

  // When the chapter's institution has no yuva_chapter positions defined — or
  // RLS returns nothing, which is silent and indistinguishable from empty —
  // fall back to the standard one-Chair-two-Co-Chair shape, all unfilled.
  const chairSeats: LeadershipSeat[] = seats.filter((p) => p.category === 'yuva_chair');
  const coChairSeats: LeadershipSeat[] = seats.filter((p) => p.category === 'yuva_co_chair');
  const chairSlots: (LeadershipSeat | null)[] = chairSeats.length > 0 ? chairSeats : [null];
  const coChairSlots: (LeadershipSeat | null)[] =
    seats.length > 0 ? coChairSeats : [null, null];

  // Group members by vertical
  const membersByVertical: Record<string, any[]> = {};
  for (const m of members || []) {
    if (m.role === 'chapter_chair' || m.role === 'chapter_co_chair') continue;
    const vid = m.vertical_id;
    if (!membersByVertical[vid]) membersByVertical[vid] = [];
    membersByVertical[vid].push(m);
  }

  // Separate stakeholder verticals from regular verticals
  const stakeholderVerticals = (verticals || []).filter((v: any) => v.type === 'stakeholder');
  const regularVerticals = (verticals || []).filter((v: any) => v.type === 'vertical');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/learners-council/yuva">
              <Button variant="ghost" size="sm" className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back to Chapters
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-600" />
            {chapter.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            {(chapter.institution as any)?.name || 'Unknown Institution'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {chapter.academic_year}
          </Badge>
          {chapter.is_active ? (
            <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-gray-500">Inactive</Badge>
          )}
        </div>
      </div>

      {chapter.description && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{chapter.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Chapter Leadership */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-600" />
          Chapter Leadership
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Chair seats */}
          {chairSlots.map((seat, index) => {
            const holder = seat ? holderByPositionId.get(seat.id) : undefined;
            return (
              <Card
                key={seat?.id || `chair-${index}`}
                className={`border-2 ${holder ? 'border-amber-200' : 'border-dashed border-gray-200'}`}
              >
                <CardContent className="p-4">
                  <Badge variant="outline" className="mb-3 bg-amber-50 text-amber-800 border-amber-200">
                    Chapter Chair
                  </Badge>
                  {holder ? (
                    <div className="flex items-center gap-3 mt-2">
                      <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-sm font-medium text-amber-800">
                        {holder.user?.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{holder.user?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{holder.user?.email || ''}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic mt-2">Vacant</p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Co-Chair seats */}
          {coChairSlots.map((seat, index) => {
            const holder = seat ? holderByPositionId.get(seat.id) : undefined;
            return (
              <Card
                key={seat?.id || `co-chair-${index}`}
                className={holder ? 'border border-amber-100' : 'border-dashed'}
              >
                <CardContent className="p-4">
                  <Badge
                    variant="outline"
                    className={
                      holder
                        ? 'mb-3 bg-amber-50/50 text-amber-700 border-amber-200'
                        : 'mb-3 text-gray-500'
                    }
                  >
                    Co-Chair
                  </Badge>
                  {holder ? (
                    <div className="flex items-center gap-3 mt-2">
                      <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center text-sm font-medium text-amber-700">
                        {holder.user?.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{holder.user?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{holder.user?.email || ''}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic mt-2">Vacant</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Chapter Chair and Co-Chairs are held in the council position records.{' '}
          <Link
            href="/learners-council/yuva/members"
            className="underline hover:text-foreground"
          >
            View or reassign them in the YUVA Chapter Leaders directory
          </Link>
          .
        </p>
      </div>

      {/* Verticals */}
      {regularVerticals.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-600" />
            Verticals
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {regularVerticals.map((v: any) => {
              const vMembers = membersByVertical[v.id] || [];

              return (
                <Card key={v.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Layers className="h-4 w-4 text-blue-600" />
                      </div>
                      {v.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {v.description && (
                      <p className="text-xs text-muted-foreground mb-3">{v.description}</p>
                    )}
                    <VerticalMembersPanel
                      chapterId={id}
                      verticalId={v.id}
                      verticalName={v.name}
                      verticalType={v.type}
                      academicYear={chapter.academic_year}
                      members={vMembers.map((m: any) => ({
                        id: m.id,
                        role: m.role,
                        full_name: (m.user as any)?.full_name ?? null
                      }))}
                      canManage={isStaffOrAdmin}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Stakeholder Verticals */}
      {stakeholderVerticals.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            Stakeholder Verticals
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stakeholderVerticals.map((v: any) => {
              const vMembers = membersByVertical[v.id] || [];

              return (
                <Card key={v.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center">
                        {v.name?.toLowerCase().includes('membership') ? (
                          <Users className="h-4 w-4 text-purple-600" />
                        ) : v.name?.toLowerCase().includes('thalir') ? (
                          <Sprout className="h-4 w-4 text-purple-600" />
                        ) : v.name?.toLowerCase().includes('rural') ? (
                          <Mountain className="h-4 w-4 text-purple-600" />
                        ) : (
                          <Heart className="h-4 w-4 text-purple-600" />
                        )}
                      </div>
                      {v.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {v.description && (
                      <p className="text-xs text-muted-foreground mb-3">{v.description}</p>
                    )}
                    <VerticalMembersPanel
                      chapterId={id}
                      verticalId={v.id}
                      verticalName={v.name}
                      verticalType={v.type}
                      academicYear={chapter.academic_year}
                      members={vMembers.map((m: any) => ({
                        id: m.id,
                        role: m.role,
                        full_name: (m.user as any)?.full_name ?? null
                      }))}
                      canManage={isStaffOrAdmin}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Staff Actions */}
      {isStaffOrAdmin && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Management Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Link href={`/learners-council/yuva?chapter=${id}`}>
                <Button variant="outline" size="sm">
                  <Users className="h-4 w-4 mr-1" />
                  Manage Members
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
