'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Plus,
  Users,
  Star,
  ArrowRight,
  UserCheck,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { useMentors, useMentorDashboard, useCreateMentor } from '@/hooks/startup-studio';

// ─── Badge config ────────────────────────────────────────────────────────────

const MENTOR_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  resident:        { label: 'Resident',        color: 'bg-purple-100 text-purple-800' },
  visiting:        { label: 'Visiting',         color: 'bg-blue-100 text-blue-800' },
  industry_expert: { label: 'Industry Expert',  color: 'bg-amber-100 text-amber-800' },
  academic:        { label: 'Academic',          color: 'bg-emerald-100 text-emerald-800' },
  investor:        { label: 'Investor',          color: 'bg-cyan-100 text-cyan-800' },
  alumni:          { label: 'Alumni',            color: 'bg-indigo-100 text-indigo-800' },
  functional:      { label: 'Functional',        color: 'bg-gray-100 text-gray-800' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  prospect:   { label: 'Prospect',   color: 'bg-gray-100 text-gray-700' },
  screening:  { label: 'Screening',  color: 'bg-yellow-100 text-yellow-800' },
  onboarded:  { label: 'Onboarded',  color: 'bg-green-100 text-green-800' },
  inactive:   { label: 'Inactive',   color: 'bg-orange-100 text-orange-800' },
  retired:    { label: 'Retired',    color: 'bg-red-100 text-red-800' },
};

const MENTOR_TYPES = ['all', 'resident', 'visiting', 'industry_expert', 'academic', 'investor', 'alumni', 'functional'];
const STATUSES     = ['all', 'prospect', 'screening', 'onboarded', 'inactive', 'retired'];

// ─── Add Mentor Dialog ────────────────────────────────────────────────────────

function AddMentorDialog() {
  const [open, setOpen] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    mentor_type: '',
    designation: '',
    organization: '',
    source: '',
  });

  const createMentor = useCreateMentor();

  const handleDomainKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = domainInput.trim();
      if (val && !domains.includes(val)) {
        setDomains((prev) => [...prev, val]);
      }
      setDomainInput('');
    }
  };

  const removeDomain = (d: string) => setDomains((prev) => prev.filter((x) => x !== d));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMentor.mutateAsync({
      ...form,
      domain_expertise: domains,
    });
    setOpen(false);
    setForm({ name: '', email: '', phone: '', mentor_type: '', designation: '', organization: '', source: '' });
    setDomains([]);
    setDomainInput('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Mentor
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Mentor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Dr. Ramesh Kumar"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="mentor@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mentor_type">Mentor Type *</Label>
              <Select
                required
                value={form.mentor_type}
                onValueChange={(v) => setForm((p) => ({ ...p, mentor_type: v }))}
              >
                <SelectTrigger id="mentor_type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {MENTOR_TYPES.filter((t) => t !== 'all').map((t) => (
                    <SelectItem key={t} value={t}>
                      {MENTOR_TYPE_CONFIG[t]?.label ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="designation">Designation</Label>
              <Input
                id="designation"
                value={form.designation}
                onChange={(e) => setForm((p) => ({ ...p, designation: e.target.value }))}
                placeholder="CTO, Founder, Professor..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="organization">Organization</Label>
              <Input
                id="organization"
                value={form.organization}
                onChange={(e) => setForm((p) => ({ ...p, organization: e.target.value }))}
                placeholder="Company or institution"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                value={form.source}
                onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                placeholder="Alumni network, referral, LinkedIn..."
              />
            </div>
          </div>

          {/* Domain expertise tag input */}
          <div className="space-y-1.5">
            <Label htmlFor="domain">Domain Expertise</Label>
            <Input
              id="domain"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyDown={handleDomainKeyDown}
              placeholder="Type a domain and press Enter (e.g. FinTech, AI/ML)"
            />
            {domains.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {domains.map((d) => (
                  <Badge
                    key={d}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => removeDomain(d)}
                  >
                    {d} &times;
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Press Enter or comma to add each domain</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMentor.isPending}>
              {createMentor.isPending ? 'Adding...' : 'Add Mentor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCards({ isLoading, dashboard }: { isLoading: boolean; dashboard: any }) {
  const stats = [
    {
      label: 'Total Mentors',
      value: dashboard?.total_mentors ?? dashboard?.total ?? 0,
      icon: Users,
    },
    {
      label: 'Active Mentors',
      value: dashboard?.active_mentors ?? dashboard?.active ?? 0,
      icon: Activity,
    },
    {
      label: 'Avg Rating',
      value: dashboard?.avg_rating != null
        ? Number(dashboard.avg_rating).toFixed(1)
        : '—',
      icon: Star,
    },
    {
      label: 'Capacity Available',
      value: dashboard?.available_capacity ?? dashboard?.capacity_available ?? '—',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Mentor Card ──────────────────────────────────────────────────────────────

function MentorCard({ mentor }: { mentor: any }) {
  const typeConfig   = MENTOR_TYPE_CONFIG[mentor.mentor_type] ?? MENTOR_TYPE_CONFIG.functional;
  const statusConfig = STATUS_CONFIG[mentor.status]           ?? STATUS_CONFIG.prospect;
  const domains: string[] = Array.isArray(mentor.domain_expertise)
    ? mentor.domain_expertise
    : [];

  return (
    <Link href={`/startup-studio/mentors/${mentor.id}`}>
      <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">{mentor.name ?? 'Unnamed Mentor'}</p>
              {mentor.designation && (
                <p className="text-xs text-muted-foreground truncate">{mentor.designation}</p>
              )}
              {mentor.organization && (
                <p className="text-xs text-muted-foreground truncate">{mentor.organization}</p>
              )}
            </div>
            <Badge variant="outline" className={`shrink-0 ${statusConfig.color}`}>
              {statusConfig.label}
            </Badge>
          </div>

          <Badge variant="outline" className={typeConfig.color}>
            {typeConfig.label}
          </Badge>

          {domains.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {domains.slice(0, 3).map((d) => (
                <Badge key={d} variant="secondary" className="text-xs">
                  {d}
                </Badge>
              ))}
              {domains.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{domains.length - 3}
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              {mentor.total_sessions ?? 0} sessions
            </span>
            {mentor.avg_rating != null && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {Number(mentor.avg_rating).toFixed(1)}
              </span>
            )}
            <ArrowRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Skeleton cards ───────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardContent className="pt-5 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MentorDirectory() {
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatus]     = useState('all');
  const [typeFilter, setType]         = useState('all');

  const filters: Record<string, any> = {};
  if (statusFilter !== 'all') filters.status = statusFilter;
  if (typeFilter   !== 'all') filters.mentor_type = typeFilter;

  const { data: rawMentors,   isLoading: mentorsLoading }   = useMentors(filters);
  const { data: rawDashboard, isLoading: dashboardLoading } = useMentorDashboard();

  const mentors:   any   = rawMentors;
  const dashboard: any   = rawDashboard;

  const mentorsList: any[] = Array.isArray(mentors) ? mentors : mentors?.data ?? [];

  const filtered = mentorsList.filter((m: any) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (m.name ?? '').toLowerCase().includes(term) ||
      (m.organization ?? '').toLowerCase().includes(term) ||
      (m.designation ?? '').toLowerCase().includes(term) ||
      (Array.isArray(m.domain_expertise) ? m.domain_expertise : []).some((d: string) =>
        d.toLowerCase().includes(term)
      )
    );
  });

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <KpiCards isLoading={dashboardLoading} dashboard={dashboard} />

      {/* Search + Add */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search mentors by name, org, or domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <AddMentorDialog />
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatus(s)}
            className="capitalize text-xs h-7"
          >
            {s === 'all' ? 'All Statuses' : STATUS_CONFIG[s]?.label ?? s}
          </Button>
        ))}
      </div>

      {/* Mentor type filter pills */}
      <div className="flex flex-wrap gap-2">
        {MENTOR_TYPES.map((t) => (
          <Button
            key={t}
            variant={typeFilter === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType(t)}
            className="text-xs h-7"
          >
            {t === 'all' ? 'All Types' : MENTOR_TYPE_CONFIG[t]?.label ?? t}
          </Button>
        ))}
      </div>

      {/* Grid */}
      {mentorsLoading ? (
        <SkeletonCards />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">
              {search || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'No mentors match your filters'
                : 'No mentors in the network yet'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {search || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Add your first mentor to get started'}
            </p>
            {!search && statusFilter === 'all' && typeFilter === 'all' && (
              <AddMentorDialog />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mentor: any) => (
            <MentorCard key={mentor.id} mentor={mentor} />
          ))}
        </div>
      )}
    </div>
  );
}
