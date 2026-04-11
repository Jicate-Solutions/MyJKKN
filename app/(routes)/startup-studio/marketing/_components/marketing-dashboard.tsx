'use client';

import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
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
  Megaphone,
  Eye,
  Users,
  FileText,
  TrendingUp,
  Calendar,
  IndianRupee,
  Pencil,
} from 'lucide-react';
import {
  useMarketingActivities,
  useMarketingDashboard,
  useCreateMarketingActivity,
  useUpdateMarketingActivity,
} from '@/hooks/startup-studio/use-ss-marketing';
import type { MarketingActivityType, MarketingActivityStatus } from '@/types/startup-studio';

// ─── Config ─────────────────────────────────────────────────────────────────

const ACTIVITY_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  awareness_campaign: { label: 'Awareness Campaign', color: 'bg-blue-100 text-blue-800' },
  workshop:           { label: 'Workshop',            color: 'bg-purple-100 text-purple-800' },
  demo_day:           { label: 'Demo Day',             color: 'bg-amber-100 text-amber-800' },
  media_coverage:     { label: 'Media Coverage',       color: 'bg-rose-100 text-rose-800' },
  social_media:       { label: 'Social Media',         color: 'bg-pink-100 text-pink-800' },
  website_update:     { label: 'Website Update',       color: 'bg-teal-100 text-teal-800' },
  brochure:           { label: 'Brochure',             color: 'bg-orange-100 text-orange-800' },
  newsletter:         { label: 'Newsletter',           color: 'bg-cyan-100 text-cyan-800' },
  podcast:            { label: 'Podcast',              color: 'bg-violet-100 text-violet-800' },
  webinar:            { label: 'Webinar',              color: 'bg-indigo-100 text-indigo-800' },
  conference:         { label: 'Conference',           color: 'bg-emerald-100 text-emerald-800' },
  stakeholder_visit:  { label: 'Stakeholder Visit',    color: 'bg-lime-100 text-lime-800' },
  other:              { label: 'Other',                color: 'bg-gray-100 text-gray-800' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  planned:     { label: 'Planned',     color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  completed:   { label: 'Completed',   color: 'bg-green-100 text-green-800' },
  cancelled:   { label: 'Cancelled',   color: 'bg-red-100 text-red-800' },
};

const ACTIVITY_TYPES: MarketingActivityType[] = [
  'awareness_campaign', 'workshop', 'demo_day', 'media_coverage',
  'social_media', 'website_update', 'brochure', 'newsletter',
  'podcast', 'webinar', 'conference', 'stakeholder_visit', 'other',
];

const STATUSES: MarketingActivityStatus[] = ['planned', 'in_progress', 'completed', 'cancelled'];

// Filter tab configs (type filter includes "all")
const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'workshop', label: 'Workshops' },
  { value: 'demo_day', label: 'Demo Days' },
  { value: 'media_coverage', label: 'Media' },
  { value: 'social_media', label: 'Social' },
  { value: 'webinar', label: 'Webinars' },
];

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

// ─── KPI Cards ──────────────────────────────────────────────────────────────

function KpiCards({ isLoading, dashboard }: { isLoading: boolean; dashboard: any }) {
  const stats = [
    {
      label: 'Total Activities',
      value: dashboard?.total_activities ?? 0,
      icon: Megaphone,
    },
    {
      label: 'Total Reach',
      value: dashboard?.total_reach != null
        ? dashboard.total_reach.toLocaleString()
        : '0',
      icon: Eye,
    },
    {
      label: 'Leads Generated',
      value: dashboard?.total_leads ?? 0,
      icon: Users,
    },
    {
      label: 'Applications',
      value: dashboard?.total_applications ?? 0,
      icon: FileText,
    },
    {
      label: 'Avg ROI',
      value: dashboard?.avg_roi != null
        ? `${dashboard.avg_roi}x`
        : '0x',
      icon: TrendingUp,
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

// ─── Activity Form (shared by Add and Edit) ─────────────────────────────────

interface ActivityFormData {
  title: string;
  activity_type: string;
  description: string;
  target_audience: string;
  date_start: string;
  date_end: string;
  budget: string;
  status: string;
}

const EMPTY_FORM: ActivityFormData = {
  title: '',
  activity_type: '',
  description: '',
  target_audience: '',
  date_start: '',
  date_end: '',
  budget: '',
  status: 'planned',
};

function ActivityForm({
  initialData,
  onSubmit,
  isPending,
  submitLabel,
}: {
  initialData: ActivityFormData;
  onSubmit: (data: ActivityFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<ActivityFormData>(initialData);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          required
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="e.g. Annual Demo Day 2026"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="activity_type">Activity Type *</Label>
          <Select
            required
            value={form.activity_type}
            onValueChange={(v) => setForm((p) => ({ ...p, activity_type: v }))}
          >
            <SelectTrigger id="activity_type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ACTIVITY_TYPE_CONFIG[t]?.label ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select
            value={form.status}
            onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}
          >
            <SelectTrigger id="status">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_CONFIG[s]?.label ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Describe the marketing activity..."
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="target_audience">Target Audience</Label>
        <Input
          id="target_audience"
          value={form.target_audience}
          onChange={(e) => setForm((p) => ({ ...p, target_audience: e.target.value }))}
          placeholder="e.g. Engineering students, Potential investors"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="date_start">Start Date</Label>
          <Input
            id="date_start"
            type="date"
            value={form.date_start}
            onChange={(e) => setForm((p) => ({ ...p, date_start: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date_end">End Date</Label>
          <Input
            id="date_end"
            type="date"
            value={form.date_end}
            onChange={(e) => setForm((p) => ({ ...p, date_end: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="budget">Budget (INR)</Label>
        <Input
          id="budget"
          type="number"
          min="0"
          step="100"
          value={form.budget}
          onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
          placeholder="e.g. 50000"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Add Activity Dialog ─────────────────────────────────────────────────────

function AddActivityDialog() {
  const [open, setOpen] = useState(false);
  const createActivity = useCreateMarketingActivity();

  const handleSubmit = async (form: ActivityFormData) => {
    await createActivity.mutateAsync({
      title: form.title,
      activity_type: form.activity_type,
      description: form.description || undefined,
      target_audience: form.target_audience || undefined,
      date_start: form.date_start || undefined,
      date_end: form.date_end || undefined,
      budget: form.budget ? Number(form.budget) : undefined,
      status: form.status as MarketingActivityStatus,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Activity
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Marketing Activity</DialogTitle>
        </DialogHeader>
        <ActivityForm
          initialData={EMPTY_FORM}
          onSubmit={handleSubmit}
          isPending={createActivity.isPending}
          submitLabel="Add Activity"
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Activity Dialog ────────────────────────────────────────────────────

function EditActivityDialog({ activity }: { activity: any }) {
  const [open, setOpen] = useState(false);
  const updateActivity = useUpdateMarketingActivity();

  const initialData: ActivityFormData = {
    title: activity.title ?? '',
    activity_type: activity.activity_type ?? '',
    description: activity.description ?? '',
    target_audience: activity.target_audience ?? '',
    date_start: activity.date_start ? activity.date_start.split('T')[0] : '',
    date_end: activity.date_end ? activity.date_end.split('T')[0] : '',
    budget: activity.budget != null ? String(activity.budget) : '',
    status: activity.status ?? 'planned',
  };

  const handleSubmit = async (form: ActivityFormData) => {
    await updateActivity.mutateAsync({
      id: activity.id,
      data: {
        title: form.title,
        activity_type: form.activity_type,
        description: form.description || undefined,
        target_audience: form.target_audience || undefined,
        date_start: form.date_start || undefined,
        date_end: form.date_end || undefined,
        budget: form.budget ? Number(form.budget) : undefined,
        status: form.status as MarketingActivityStatus,
      },
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Activity</DialogTitle>
        </DialogHeader>
        <ActivityForm
          initialData={initialData}
          onSubmit={handleSubmit}
          isPending={updateActivity.isPending}
          submitLabel="Save Changes"
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Update Button ────────────────────────────────────────────────────

function StatusUpdateSelect({ activity }: { activity: any }) {
  const updateActivity = useUpdateMarketingActivity();

  const handleStatusChange = (newStatus: string) => {
    updateActivity.mutate({
      id: activity.id,
      data: { status: newStatus as MarketingActivityStatus },
    });
  };

  return (
    <Select
      value={activity.status}
      onValueChange={handleStatusChange}
      disabled={updateActivity.isPending}
    >
      <SelectTrigger className="h-7 text-xs w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_CONFIG[s]?.label ?? s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Activity Card ───────────────────────────────────────────────────────────

function ActivityCard({ activity }: { activity: any }) {
  const typeConfig   = ACTIVITY_TYPE_CONFIG[activity.activity_type] ?? ACTIVITY_TYPE_CONFIG.other;
  const statusConfig = STATUS_CONFIG[activity.status]               ?? STATUS_CONFIG.planned;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <Card className="hover:bg-muted/50 transition-colors h-full">
      <CardContent className="pt-5 space-y-3">
        {/* Header: title + edit */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{activity.title}</p>
            {activity.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {activity.description}
              </p>
            )}
          </div>
          <EditActivityDialog activity={activity} />
        </div>

        {/* Badges: type + status */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={typeConfig.color}>
            {typeConfig.label}
          </Badge>
          <Badge variant="outline" className={statusConfig.color}>
            {statusConfig.label}
          </Badge>
        </div>

        {/* Date */}
        {(activity.date_start || activity.date_end) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {formatDate(activity.date_start)}
              {activity.date_end && activity.date_start ? ' - ' : ''}
              {activity.date_end && formatDate(activity.date_end)}
            </span>
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="text-center">
            <p className="text-lg font-bold">{(activity.reach_count ?? 0).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Reach</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{activity.leads_generated ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Leads</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">
              {activity.budget != null ? (
                <span className="flex items-center justify-center">
                  <IndianRupee className="h-3.5 w-3.5" />
                  {activity.budget.toLocaleString()}
                </span>
              ) : (
                '--'
              )}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Budget</p>
          </div>
        </div>

        {/* Status update */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          {activity.target_audience && (
            <p className="text-[11px] text-muted-foreground truncate max-w-[55%]">
              {activity.target_audience}
            </p>
          )}
          <div className="ml-auto">
            <StatusUpdateSelect activity={activity} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton Cards ──────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardContent className="pt-5 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MarketingDashboard() {
  const [search, setSearch]         = useState('');
  const [typeFilter, setType]       = useState('all');
  const [statusFilter, setStatus]   = useState('all');

  const filters: Record<string, any> = {};
  if (typeFilter   !== 'all') filters.type   = typeFilter;
  if (statusFilter !== 'all') filters.status = statusFilter;
  if (search) filters.search = search;

  const { data: rawActivities, isLoading: activitiesLoading } = useMarketingActivities(filters);
  const { data: rawDashboard,  isLoading: dashboardLoading }  = useMarketingDashboard();

  const dashboard:  any   = rawDashboard;
  const activities: any[] = Array.isArray(rawActivities) ? rawActivities : rawActivities?.data ?? [];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <KpiCards isLoading={dashboardLoading} dashboard={dashboard} />

      {/* Search + Add */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activities by title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <AddActivityDialog />
      </div>

      {/* Activity type filter tabs */}
      <div className="flex flex-wrap gap-2">
        {TYPE_TABS.map((t) => (
          <Button
            key={t.value}
            variant={typeFilter === t.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType(t.value)}
            className="text-xs h-7"
          >
            {t.label}
          </Button>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <Button
            key={s.value}
            variant={statusFilter === s.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatus(s.value)}
            className="text-xs h-7"
          >
            {s.label}
          </Button>
        ))}
      </div>

      {/* Activities grid */}
      {activitiesLoading ? (
        <SkeletonCards />
      ) : activities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">
              {search || typeFilter !== 'all' || statusFilter !== 'all'
                ? 'No activities match your filters'
                : 'No marketing activities yet'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {search || typeFilter !== 'all' || statusFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Add your first marketing activity to get started'}
            </p>
            {!search && typeFilter === 'all' && statusFilter === 'all' && (
              <AddActivityDialog />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((activity: any) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
}
