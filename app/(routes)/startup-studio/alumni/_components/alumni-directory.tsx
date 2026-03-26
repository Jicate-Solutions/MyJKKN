'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Users,
  Award,
  TrendingUp,
  DollarSign,
  Briefcase,
  Search,
  Building2,
  Star,
  CheckCircle,
  XCircle,
  UserCheck,
  BarChart3,
} from 'lucide-react';
import {
  useAlumniMetrics,
  useAlumniDirectory,
  useTrackAlumni,
} from '@/hooks/startup-studio';

// ─── Track Alumni Dialog ───────────────────────────────────────────────────────

interface TrackAlumniDialogProps {
  alumniId: string;
  startupName: string;
}

function TrackAlumniDialog({ alumniId, startupName }: TrackAlumniDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    year: new Date().getFullYear(),
    revenue: '',
    employees: '',
    customers: '',
    patents: '',
    awards: '',
    rating: '',
  });

  const trackAlumni = useTrackAlumni?.();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackAlumni) return;
    await trackAlumni.mutateAsync({
      id: alumniId,
      data: {
        year: form.year,
        annual_revenue: form.revenue ? Number(form.revenue) : undefined,
        employees: form.employees ? Number(form.employees) : undefined,
        customers: form.customers ? Number(form.customers) : undefined,
        patents: form.patents ? Number(form.patents) : undefined,
        awards: form.awards ? form.awards.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        satisfaction_rating: form.rating ? Number(form.rating) : undefined,
      },
    });
    setOpen(false);
    setForm({
      year: new Date().getFullYear(),
      revenue: '',
      employees: '',
      customers: '',
      patents: '',
      awards: '',
      rating: '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
          <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
          Track Alumni
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Annual Survey — {startupName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="year">Survey Year *</Label>
              <Input
                id="year"
                type="number"
                required
                min={2000}
                max={new Date().getFullYear()}
                value={form.year}
                onChange={(e) => setForm((p) => ({ ...p, year: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revenue">Annual Revenue (INR)</Label>
              <Input
                id="revenue"
                type="number"
                min={0}
                value={form.revenue}
                onChange={(e) => setForm((p) => ({ ...p, revenue: e.target.value }))}
                placeholder="e.g. 5000000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="employees">Employees</Label>
              <Input
                id="employees"
                type="number"
                min={0}
                value={form.employees}
                onChange={(e) => setForm((p) => ({ ...p, employees: e.target.value }))}
                placeholder="e.g. 12"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customers">Customers</Label>
              <Input
                id="customers"
                type="number"
                min={0}
                value={form.customers}
                onChange={(e) => setForm((p) => ({ ...p, customers: e.target.value }))}
                placeholder="e.g. 200"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patents">Patents Filed</Label>
              <Input
                id="patents"
                type="number"
                min={0}
                value={form.patents}
                onChange={(e) => setForm((p) => ({ ...p, patents: e.target.value }))}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="awards">Awards (comma separated)</Label>
              <Input
                id="awards"
                value={form.awards}
                onChange={(e) => setForm((p) => ({ ...p, awards: e.target.value }))}
                placeholder="e.g. NASSCOM Emerge 50, Best EdTech"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rating">Program Satisfaction Rating (1–5)</Label>
              <Input
                id="rating"
                type="number"
                min={1}
                max={5}
                step={0.5}
                value={form.rating}
                onChange={(e) => setForm((p) => ({ ...p, rating: e.target.value }))}
                placeholder="e.g. 4.5"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!trackAlumni || trackAlumni?.isPending}
            >
              {trackAlumni?.isPending ? 'Saving...' : 'Submit Survey'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCards({ isLoading, metrics }: { isLoading: boolean; metrics: any }) {
  const stats = [
    {
      label: 'Total Alumni',
      value: metrics?.total_alumni ?? metrics?.total ?? 0,
      icon: Users,
    },
    {
      label: 'Operational',
      value:
        metrics?.operational_rate != null
          ? `${Number(metrics.operational_rate).toFixed(0)}%`
          : metrics?.operational_percent != null
          ? `${Number(metrics.operational_percent).toFixed(0)}%`
          : '—',
      icon: TrendingUp,
    },
    {
      label: 'Total Revenue',
      value:
        metrics?.total_revenue != null
          ? `₹${(Number(metrics.total_revenue) / 1_00_000).toFixed(1)}L`
          : '—',
      icon: DollarSign,
    },
    {
      label: 'Jobs Created',
      value: metrics?.total_jobs_created ?? metrics?.total_employees ?? '—',
      icon: Briefcase,
    },
    {
      label: 'Give-Back Rate',
      value:
        metrics?.giveback_rate != null
          ? `${Number(metrics.giveback_rate).toFixed(0)}%`
          : '—',
      icon: UserCheck,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
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

// ─── Alumni Card ───────────────────────────────────────────────────────────────

function AlumniCard({ alumni }: { alumni: any }) {
  const router = useRouter();
  const isOperational = alumni.is_operational ?? alumni.operational ?? true;
  const isMentorBack = alumni.is_mentor_back ?? alumni.mentor_back ?? false;
  const isInvestorBack = alumni.is_investor_back ?? alumni.investor_back ?? false;
  const awards: string[] = Array.isArray(alumni.awards) ? alumni.awards : [];

  const handleCardClick = () => {
    const candidateId = alumni.candidate_id ?? alumni.nif_candidate_id ?? alumni.id;
    router.push(`/startup-studio/nif/${candidateId}`);
  };

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors h-full"
      onClick={handleCardClick}
    >
      <CardContent className="pt-5 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">
              {alumni.startup_name ?? alumni.name ?? 'Unnamed Startup'}
            </p>
            {alumni.graduation_year && (
              <p className="text-xs text-muted-foreground">
                Graduated {alumni.graduation_year}
              </p>
            )}
          </div>
          <Badge
            variant="outline"
            className={`shrink-0 ${
              isOperational
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {isOperational ? (
              <CheckCircle className="mr-1 h-3 w-3" />
            ) : (
              <XCircle className="mr-1 h-3 w-3" />
            )}
            {isOperational ? 'Operational' : 'Inactive'}
          </Badge>
        </div>

        {/* Give-back badges */}
        <div className="flex flex-wrap gap-1.5">
          {isMentorBack && (
            <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs">
              <Star className="mr-1 h-3 w-3" />
              Mentor Back
            </Badge>
          )}
          {isInvestorBack && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
              <Award className="mr-1 h-3 w-3" />
              Investor Back
            </Badge>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          {alumni.annual_revenue != null && (
            <div className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              <span>
                ₹{(Number(alumni.annual_revenue) / 1_00_000).toFixed(1)}L revenue
              </span>
            </div>
          )}
          {alumni.employees != null && (
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span>{alumni.employees} employees</span>
            </div>
          )}
          {alumni.funding_raised != null && alumni.funding_raised > 0 && (
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>
                ₹{(Number(alumni.funding_raised) / 1_00_000).toFixed(1)}L raised
              </span>
            </div>
          )}
          {alumni.sector && (
            <div className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate">{alumni.sector}</span>
            </div>
          )}
        </div>

        {/* Awards */}
        {awards.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {awards.slice(0, 2).map((award) => (
              <Badge key={award} variant="outline" className="text-xs">
                <Award className="mr-1 h-3 w-3 text-amber-500" />
                {award}
              </Badge>
            ))}
            {awards.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{awards.length - 2}
              </Badge>
            )}
          </div>
        )}

        {/* Track button */}
        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
          <TrackAlumniDialog
            alumniId={alumni.id}
            startupName={alumni.startup_name ?? alumni.name ?? 'Startup'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton cards ────────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardContent className="pt-5 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AlumniDirectory() {
  const [search, setSearch] = useState('');

  const { data: rawMetrics, isLoading: metricsLoading } = useAlumniMetrics?.() ?? {};
  const { data: rawAlumni, isLoading: alumniLoading } = useAlumniDirectory?.() ?? {};

  const metrics: any = rawMetrics?.data ?? rawMetrics ?? null;
  const alumniList: any[] = Array.isArray(rawAlumni)
    ? rawAlumni
    : (rawAlumni as any)?.data ?? [];

  const filtered = alumniList.filter((a: any) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (a.startup_name ?? a.name ?? '').toLowerCase().includes(term) ||
      (a.sector ?? '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <KpiCards isLoading={metricsLoading ?? false} metrics={metrics} />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search alumni by name or sector..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Grid */}
      {alumniLoading ? (
        <SkeletonCards />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Award className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">
              {search ? 'No alumni match your search' : 'No alumni yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {search
                ? 'Try a different search term'
                : 'Alumni appear here once startups graduate from the incubation program'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((alumni: any) => (
            <AlumniCard key={alumni.id} alumni={alumni} />
          ))}
        </div>
      )}
    </div>
  );
}
