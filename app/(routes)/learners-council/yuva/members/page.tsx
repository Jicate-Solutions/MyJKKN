/**
 * YUVA Members Directory
 * Flat roster of YUVA Chapter Chairs and Co-Chairs across all chapters.
 *
 * Backed by lc_members + lc_positions where tier='yuva_chapter'. For LC
 * proper members see /learners-council/structure/members.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Users, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',
  on_leave: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  graduated: 'bg-blue-100 text-blue-800 border-blue-200',
  removed: 'bg-red-100 text-red-800 border-red-200',
};

const categoryLabels: Record<string, string> = {
  yuva_chair: 'Chapter Chair',
  yuva_co_chair: 'Co-Chair',
};

interface YUVAMemberRow {
  id: string;
  status: string;
  appointed_at: string | null;
  ended_at: string | null;
  institution_id: string | null;
  position: {
    id: string;
    title: string;
    category: string;
    tier: string;
    sort_order: number | null;
  } | null;
  user: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  term: {
    id: string;
    name: string;
    status: string;
  } | null;
}

export default async function YUVAMembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Please sign in to access this page.</p>
      </div>
    );
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Please sign in to access this page.</p>
      </div>
    );
  }

  // Fetch YUVA members with embedded position + user + term
  // Inner join + tier filter ensures we only see yuva_chapter rows.
  const [{ data: members }, { data: institutions }] = await Promise.all([
    supabase
      .from('lc_members')
      .select(`
        id, status, appointed_at, ended_at, institution_id,
        position:lc_positions!inner(id, title, category, tier, sort_order),
        user:profiles(id, full_name, email, avatar_url),
        term:lc_terms(id, name, status)
      `)
      .eq('position.tier', 'yuva_chapter')
      .eq('status', 'active')
      .order('appointed_at', { ascending: false }),
    supabase.from('institutions').select('id, name'),
  ]);

  const institutionName = new Map<string, string>(
    (institutions || []).map((i: { id: string; name: string }) => [i.id, i.name])
  );

  // Group by institution for readable ordering
  const rows = ((members as unknown as YUVAMemberRow[]) || []).slice().sort((a, b) => {
    const instA = institutionName.get(a.institution_id || '') || '';
    const instB = institutionName.get(b.institution_id || '') || '';
    if (instA !== instB) return instA.localeCompare(instB);
    // Within an institution, Chair first then Co-Chairs
    const catOrder = (cat?: string) => (cat === 'yuva_chair' ? 0 : 1);
    const ca = catOrder(a.position?.category);
    const cb = catOrder(b.position?.category);
    if (ca !== cb) return ca - cb;
    return (a.position?.sort_order ?? 0) - (b.position?.sort_order ?? 0);
  });

  const chaptersCovered = new Set(rows.map((r) => r.institution_id)).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-blue-600" />
          YUVA Chapter Leaders
        </h1>
        <p className="text-muted-foreground mt-1">
          Chairs and Co-Chairs across all YUVA chapters. YUVA operates
          independently from the Learners Council —{' '}
          <Link href="/learners-council/structure/members" className="underline hover:text-foreground">
            see LC Member Directory
          </Link>{' '}
          for Council representatives.
        </p>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-3 text-sm">
        <Card>
          <CardContent className="px-4 py-3">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              Active leaders
            </div>
            <div className="text-xl font-semibold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              Chapters represented
            </div>
            <div className="text-xl font-semibold">{chaptersCovered}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No active YUVA leaders yet. Assign Chapter Chairs and Co-Chairs
            from the LC Positions page.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leader</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Chapter</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">
                        {row.user?.full_name || 'Unknown'}
                      </div>
                      {row.user?.email && (
                        <div className="text-xs text-muted-foreground">
                          {row.user.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                        {categoryLabels[row.position?.category || ''] || row.position?.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.institution_id ? (
                        <Link
                          href={`/learners-council/yuva`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {institutionName.get(row.institution_id) || '—'}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.term?.name || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors[row.status] || statusColors.inactive}
                      >
                        {row.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
