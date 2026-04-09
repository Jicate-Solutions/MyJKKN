/**
 * YUVA Chapter Detail Page
 * Shows chapter leadership, verticals, stakeholders, and member assignments
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
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

const roleLabels: Record<string, string> = {
  chapter_chair: 'Chapter Chair',
  chapter_co_chair: 'Co-Chair',
  stakeholder_chair: 'Chair',
  stakeholder_co_chair: 'Co-Chair',
  vertical_chair: 'Chair',
  vertical_co_chair: 'Co-Chair'
};

const roleColors: Record<string, string> = {
  chapter_chair: 'bg-amber-100 text-amber-800 border-amber-200',
  chapter_co_chair: 'bg-amber-50 text-amber-700 border-amber-200',
  stakeholder_chair: 'bg-purple-100 text-purple-800 border-purple-200',
  stakeholder_co_chair: 'bg-purple-50 text-purple-700 border-purple-200',
  vertical_chair: 'bg-blue-100 text-blue-800 border-blue-200',
  vertical_co_chair: 'bg-blue-50 text-blue-700 border-blue-200'
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function YUVAChapterDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

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

  // Fetch verticals and members in parallel
  const [
    { data: verticals },
    { data: members }
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
      .eq('is_active', true)
  ]);

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  // Group members by role
  const chapterLeadership = (members || []).filter(
    (m: any) => m.role === 'chapter_chair' || m.role === 'chapter_co_chair'
  );
  const chair = chapterLeadership.find((m: any) => m.role === 'chapter_chair');
  const coChairs = chapterLeadership.filter((m: any) => m.role === 'chapter_co_chair');

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
            <Link href="/learners-council/structure/yuva">
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
          {/* Chair */}
          <Card className={`border-2 ${chair ? 'border-amber-200' : 'border-dashed border-gray-200'}`}>
            <CardContent className="p-4">
              <Badge variant="outline" className="mb-3 bg-amber-50 text-amber-800 border-amber-200">
                Chapter Chair
              </Badge>
              {chair ? (
                <div className="flex items-center gap-3 mt-2">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-sm font-medium text-amber-800">
                    {(chair.user as any)?.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{(chair.user as any)?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{(chair.user as any)?.email || ''}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic mt-2">Vacant</p>
              )}
            </CardContent>
          </Card>

          {/* Co-Chairs */}
          {coChairs.length > 0 ? (
            coChairs.map((cc: any) => (
              <Card key={cc.id} className="border border-amber-100">
                <CardContent className="p-4">
                  <Badge variant="outline" className="mb-3 bg-amber-50/50 text-amber-700 border-amber-200">
                    Co-Chair
                  </Badge>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center text-sm font-medium text-amber-700">
                      {(cc.user as any)?.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{(cc.user as any)?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{(cc.user as any)?.email || ''}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card className="border-dashed">
                <CardContent className="p-4">
                  <Badge variant="outline" className="mb-3 text-gray-500">Co-Chair</Badge>
                  <p className="text-sm text-muted-foreground italic mt-2">Vacant</p>
                </CardContent>
              </Card>
              <Card className="border-dashed">
                <CardContent className="p-4">
                  <Badge variant="outline" className="mb-3 text-gray-500">Co-Chair</Badge>
                  <p className="text-sm text-muted-foreground italic mt-2">Vacant</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
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
              const vChair = vMembers.find((m: any) => m.role === 'vertical_chair');
              const vCoChairs = vMembers.filter((m: any) => m.role === 'vertical_co_chair');

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
                    <div className="space-y-2">
                      {/* Vertical Chair */}
                      {vChair ? (
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-800">
                            {(vChair.user as any)?.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{(vChair.user as any)?.full_name}</p>
                            <Badge variant="outline" className={`text-[10px] ${roleColors.vertical_chair}`}>Chair</Badge>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Chair: Vacant</p>
                      )}

                      {/* Vertical Co-Chairs */}
                      {vCoChairs.map((cc: any) => (
                        <div key={cc.id} className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-blue-50 flex items-center justify-center text-xs font-medium text-blue-700">
                            {(cc.user as any)?.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{(cc.user as any)?.full_name}</p>
                            <Badge variant="outline" className={`text-[10px] ${roleColors.vertical_co_chair}`}>Co-Chair</Badge>
                          </div>
                        </div>
                      ))}

                      {vMembers.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No members assigned</p>
                      )}
                    </div>
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
              const vChair = vMembers.find((m: any) => m.role === 'stakeholder_chair');
              const vCoChairs = vMembers.filter((m: any) => m.role === 'stakeholder_co_chair');

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
                    <div className="space-y-2">
                      {vChair ? (
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-medium text-purple-800">
                            {(vChair.user as any)?.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{(vChair.user as any)?.full_name}</p>
                            <Badge variant="outline" className={`text-[10px] ${roleColors.stakeholder_chair}`}>Chair</Badge>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Chair: Vacant</p>
                      )}

                      {vCoChairs.map((cc: any) => (
                        <div key={cc.id} className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-purple-50 flex items-center justify-center text-xs font-medium text-purple-700">
                            {(cc.user as any)?.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{(cc.user as any)?.full_name}</p>
                            <Badge variant="outline" className={`text-[10px] ${roleColors.stakeholder_co_chair}`}>Co-Chair</Badge>
                          </div>
                        </div>
                      ))}

                      {vMembers.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No members assigned</p>
                      )}
                    </div>
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
              <Link href={`/learners-council/structure/yuva?chapter=${id}`}>
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
