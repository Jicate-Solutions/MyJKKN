'use client';

// ============================================================================
// Choose Your Menu — Mode C admin: Special-Day / Festival picker + review queue
// ----------------------------------------------------------------------------
// Propose a festival menu (date · meal · tier · gender · occasion · dishes from
// the library) -> super-admin/menu.publish approves -> the approve RPC marks the
// matching mess_menus cell is_special_day + confers 'proposal_approved'
// recognition on every resident who upvoted a dish in the proposal (Mode B
// votes). Reuses useVotableDishes (Mode B) for the dish picker. Native selects
// (Radix Select flakes under CFT — page precedent). Ships dark.
// ============================================================================

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CalendarHeart, Check, Loader2, Search } from 'lucide-react';
import { useVotableDishes } from '@/hooks/campus-living/use-choose-your-menu';
import {
  useSpecialDays,
  useCanPropose,
  useProposeSpecialDay,
  useApproveSpecialDay,
  useRejectSpecialDay,
} from '@/hooks/campus-living/use-mess-special-day';

const MEALS = ['breakfast', 'lunch', 'tea', 'dinner'] as const;
const TIERS = ['classic', 'premium', 'premium_plus'] as const;
const GENDERS = ['boys', 'girls'] as const;

const PROPOSE_ERROR: Record<string, string> = {
  feature_disabled: 'Choose Your Menu is switched off right now.',
  special_day_disabled: 'Special days are switched off right now.',
  not_authorized: 'You are not allowed to propose festival menus.',
  no_items: 'Pick at least one dish.',
  invalid_items: 'One of the picked dishes is no longer available.',
};
const REVIEW_ERROR: Record<string, string> = {
  not_authorized: 'You need menu-publish permission to review proposals.',
  already_reviewed: 'That proposal was already reviewed.',
  not_found: 'Proposal not found.',
};

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SpecialDayCard() {
  const { data: canPropose } = useCanPropose();
  const { data: proposals, isLoading } = useSpecialDays(null);
  const propose = useProposeSpecialDay();
  const approve = useApproveSpecialDay();
  const reject = useRejectSpecialDay();

  const [date, setDate] = useState(tomorrowISO());
  const [meal, setMeal] = useState<string>('lunch');
  const [tier, setTier] = useState<string>('classic');
  const [gender, setGender] = useState<'boys' | 'girls'>('boys');
  const [occasion, setOccasion] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({}); // id -> name
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: dishes } = useVotableDishes(search, !!canPropose);
  const pickedCount = Object.keys(picked).length;

  const pendingProposals = useMemo(
    () => (proposals ?? []).filter((p) => p.status === 'pending'),
    [proposals]
  );

  function togglePick(id: string, name: string) {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = name;
      return next;
    });
  }

  async function handlePropose() {
    if (pickedCount === 0) {
      toast.error('Pick at least one dish.');
      return;
    }
    try {
      const res = await propose.mutateAsync({
        specialDate: date,
        mealType: meal,
        tierKey: tier,
        gender,
        itemIds: Object.keys(picked),
        occasion: occasion || undefined,
      });
      if (res.ok) {
        toast.success(`Proposed ${occasion || 'special day'} for ${date}. Awaiting approval.`);
        setPicked({});
        setOccasion('');
      } else {
        toast.error(PROPOSE_ERROR[res.error ?? ''] ?? `Could not propose (${res.error}).`);
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
  }

  async function handleReview(id: string, action: 'approve' | 'reject') {
    setPendingId(id);
    try {
      const res = action === 'approve'
        ? await approve.mutateAsync({ proposalId: id })
        : await reject.mutateAsync({ proposalId: id });
      if (res.ok) {
        if (action === 'approve') {
          toast.success(
            `Approved “${res.occasion ?? 'special day'}” — ${res.cells_marked ?? 0} menu cell(s) marked, ${res.recognised ?? 0} resident(s) recognised.`
          );
        } else {
          toast.success('Proposal rejected.');
        }
      } else {
        toast.error(REVIEW_ERROR[res.error ?? ''] ?? `Could not ${action} (${res.error}).`);
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarHeart className="h-5 w-5 text-rose-600" />
          Choose Your Menu — special days
        </CardTitle>
        <CardDescription>
          Propose a festival menu from the library; an approver confirms it onto
          the day’s menu and everyone who voted for those dishes is recognised.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Propose form (only for proposer roles / admins) */}
        {canPropose && (
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-medium">Propose a special day</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm">
                <span className="text-muted-foreground">Date</span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">Meal</span>
                <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={meal} onChange={(e) => setMeal(e.target.value)}>
                  {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">Occasion</span>
                <Input placeholder="e.g. Pongal special" value={occasion} onChange={(e) => setOccasion(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">Mess plan</span>
                <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={tier} onChange={(e) => setTier(e.target.value)}>
                  {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">Gender</span>
                <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={gender} onChange={(e) => setGender(e.target.value as 'boys' | 'girls')}>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            </div>

            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search dishes to add…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {(dishes ?? []).map((d) => {
                  const on = !!picked[d.item_id];
                  return (
                    <Badge
                      key={d.item_id}
                      variant={on ? 'default' : 'outline'}
                      className="cursor-pointer gap-1"
                      onClick={() => togglePick(d.item_id, d.dish)}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {d.dish}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{pickedCount} dish(es) selected</span>
              <Button size="sm" onClick={handlePropose} disabled={propose.isPending || pickedCount === 0}>
                {propose.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Propose'}
              </Button>
            </div>
          </div>
        )}

        {/* Review queue */}
        <div>
          <p className="text-sm font-medium mb-2">
            Proposals {pendingProposals.length > 0 && <Badge variant="secondary">{pendingProposals.length} pending</Badge>}
          </p>
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !proposals || proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No special-day proposals yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Occasion</TableHead>
                  <TableHead>Meal · Plan · Gender</TableHead>
                  <TableHead>Dishes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.special_date}</TableCell>
                    <TableCell>{p.occasion_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {p.meal_type} · {p.tier_key} · {p.gender}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="text-xs">{(p.dishes ?? []).join(', ') || '—'}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'approved' ? 'secondary' : p.status === 'rejected' ? 'outline' : 'default'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === 'pending' ? (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" disabled={pendingId === p.id} onClick={() => handleReview(p.id, 'approve')}>
                            {pendingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={pendingId === p.id} onClick={() => handleReview(p.id, 'reject')}>
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{p.reviewed_at ? 'reviewed' : '—'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
