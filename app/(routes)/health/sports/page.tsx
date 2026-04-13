'use client';

/**
 * health/sports/page.tsx
 * JKKN Health — Sports Profile
 *
 * Student's sports identity card. Shows:
 *  1. Sports Card  — primary sport, level, team, sports quota badge
 *  2. My Sports    — tag/chip-style list with add/remove per entry
 *  3. Coach Info   — name + tel link
 *  4. Scholarship  — amount, concessions, traffic-light verification status
 *  5. Credits This Semester — progress bar + category breakdown
 *  6. Tournament Permissions — 4-step approval status + request button
 *
 * Usage: /health/sports
 */

import { useState, useEffect, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Trophy,
  Phone,
  Plus,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  Medal,
  GraduationCap,
  Users,
  Star,
  Dumbbell,
  Calendar,
  ChevronRight,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { HealthSportsService } from '@/lib/services/health/health-sports-service';
import type {
  HealthSportsProfile,
  HealthSportsScholarship,
  HealthSportsCredit,
  HealthTournamentPermission,
  SportEntry,
  SportLevel,
  ApprovalStatus,
} from '@/types/health-sports';
import {
  JKKN_SPORTS,
  SPORT_LEVELS,
  FITNESS_CATEGORY_CONFIG,
} from '@/types/health-sports';
import { cn } from '@/lib/utils';

// ============================================================================
// Helpers
// ============================================================================

function sportLevelLabel(level: SportLevel): string {
  return SPORT_LEVELS.find((l) => l.value === level)?.label ?? level;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function scholarshipStatusConfig(status: string): {
  color: string;
  bg: string;
  border: string;
  dot: string;
  label: string;
} {
  switch (status) {
    case 'approved':
    case 'active':
      return {
        color: 'text-green-700',
        bg: 'bg-green-50',
        border: 'border-green-200',
        dot: 'bg-green-500',
        label: status === 'active' ? 'Active' : 'Approved',
      };
    case 'verified':
      return {
        color: 'text-yellow-700',
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        dot: 'bg-yellow-500',
        label: 'Verified',
      };
    default:
      return {
        color: 'text-red-700',
        bg: 'bg-red-50',
        border: 'border-red-200',
        dot: 'bg-red-500',
        label: 'Pending',
      };
  }
}

function approvalStepIcon(status: ApprovalStatus) {
  if (status === 'approved')
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === 'rejected')
    return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-slate-300" />;
}

// ============================================================================
// Sports Card — primary "player card" display
// ============================================================================

function SportsIdentityCard({
  profile,
  isLoading,
}: {
  profile: HealthSportsProfile | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }

  const primarySport = profile?.primary_sport ?? null;
  const primaryEntry = profile?.sports?.find(
    (s) => s.sport === primarySport
  ) ?? profile?.sports?.[0] ?? null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white shadow-lg">
      {/* Background decorative element */}
      <div className="absolute right-0 top-0 h-32 w-32 -translate-y-6 translate-x-6 rounded-full bg-white/5" />
      <div className="absolute bottom-0 right-8 h-20 w-20 translate-y-6 rounded-full bg-white/5" />

      <div className="relative">
        {/* Top row — title + quota badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-emerald-200">
                Sports Card
              </p>
              <p className="text-sm font-semibold text-white leading-tight">
                JKKN Institutions
              </p>
            </div>
          </div>
          {profile?.sports_quota && (
            <Badge className="bg-amber-400 text-amber-900 hover:bg-amber-400 border-0 font-bold text-xs shrink-0">
              <Star className="h-3 w-3 mr-1 fill-amber-900" />
              Sports Quota
            </Badge>
          )}
        </div>

        {/* Primary sport info */}
        <div className="mt-5">
          {primaryEntry ? (
            <>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">
                {primaryEntry.sport}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {primaryEntry.level && (
                  <Badge className="bg-white/20 text-white hover:bg-white/20 border-0 text-xs font-medium">
                    {sportLevelLabel(primaryEntry.level)}
                  </Badge>
                )}
                {primaryEntry.team && (
                  <Badge className="bg-white/20 text-white hover:bg-white/20 border-0 text-xs font-medium">
                    <Users className="h-3 w-3 mr-1" />
                    {primaryEntry.team}
                  </Badge>
                )}
                {primaryEntry.position && (
                  <Badge className="bg-white/20 text-white hover:bg-white/20 border-0 text-xs font-medium">
                    {primaryEntry.position}
                  </Badge>
                )}
              </div>
              {profile?.playing_since && (
                <p className="mt-3 text-xs text-emerald-200">
                  Playing since {profile.playing_since}
                </p>
              )}
            </>
          ) : (
            <div className="mt-2 text-center py-3">
              <p className="text-sm text-emerald-200">No sport added yet</p>
              <p className="text-xs text-emerald-300 mt-0.5">
                Add your sports below to set up your profile
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// My Sports section — chip-style list with inline add form
// ============================================================================

type SportFormState = {
  sport: string;
  position: string;
  level: SportLevel | '';
  team: string;
};

const EMPTY_FORM: SportFormState = {
  sport: '',
  position: '',
  level: '',
  team: '',
};

function MySportsSection({
  profile,
  isLoading,
  onProfileUpdated,
}: {
  profile: HealthSportsProfile | null;
  isLoading: boolean;
  onProfileUpdated: (updated: HealthSportsProfile) => void;
}) {
  const { profile: authProfile } = useAuth();
  const learnerId =
    authProfile?.learner_id ?? authProfile?.id ?? '';

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<SportFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const sports: SportEntry[] = profile?.sports ?? [];

  const handleAdd = async () => {
    if (!form.sport || !form.level || !learnerId) return;
    const newEntry: SportEntry = {
      sport: form.sport,
      position: form.position,
      level: form.level as SportLevel,
      team: form.team,
    };
    setSaving(true);
    try {
      const updated = await HealthSportsService.updateSportsProfile(learnerId, {
        sports: [...sports, newEntry],
        // Set first added sport as primary automatically
        primary_sport: sports.length === 0 ? form.sport : profile?.primary_sport,
      });
      onProfileUpdated(updated);
      setForm(EMPTY_FORM);
      setShowAddForm(false);
    } catch (err) {
      console.error('[health/sports] Failed to add sport', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (index: number) => {
    if (!learnerId) return;
    const updated = sports.filter((_, i) => i !== index);
    try {
      const result = await HealthSportsService.updateSportsProfile(learnerId, {
        sports: updated,
        primary_sport:
          profile?.primary_sport === sports[index].sport
            ? updated[0]?.sport ?? null
            : profile?.primary_sport,
      });
      onProfileUpdated(result);
    } catch (err) {
      console.error('[health/sports] Failed to remove sport', err);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-emerald-600" />
            My Sports
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Sport
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chips list */}
        {sports.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 border">
              <Trophy className="h-5 w-5 text-slate-300" />
            </div>
            <p className="text-sm text-slate-500">No sports added yet</p>
            <p className="text-xs text-slate-400">
              Add at least one sport to build your profile
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sports.map((entry, i) => (
              <div
                key={`${entry.sport}-${i}`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  entry.sport === profile?.primary_sport
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                )}
              >
                <span>{entry.sport}</span>
                {entry.level && (
                  <span className="text-xs text-slate-400">
                    · {sportLevelLabel(entry.level)}
                  </span>
                )}
                {entry.position && (
                  <span className="text-xs text-slate-400">· {entry.position}</span>
                )}
                <button
                  onClick={() => handleRemove(i)}
                  className="ml-0.5 rounded-full hover:bg-slate-200 p-0.5 transition-colors"
                  aria-label={`Remove ${entry.sport}`}
                >
                  <X className="h-3 w-3 text-slate-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Inline add form */}
        {showAddForm && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Add Sport</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Sport</Label>
                <Select
                  value={form.sport}
                  onValueChange={(v) => setForm((f) => ({ ...f, sport: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {JKKN_SPORTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Level</Label>
                <Select
                  value={form.level}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, level: v as SportLevel }))
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPORT_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Position / Role</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder="e.g. Captain, Striker"
                  value={form.position}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, position: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Team Name</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder="e.g. JKKN Lions"
                  value={form.team}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, team: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                  setShowAddForm(false);
                  setForm(EMPTY_FORM);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                disabled={!form.sport || !form.level || saving}
                onClick={handleAdd}
              >
                {saving ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Coach Info card
// ============================================================================

function CoachInfoCard({
  profile,
  isLoading,
}: {
  profile: HealthSportsProfile | null;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;

  if (!profile?.coach_name && !profile?.coach_phone) {
    return (
      <Card className="border-dashed border-slate-200">
        <CardContent className="flex items-center gap-3 py-4 px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 border">
            <GraduationCap className="h-4 w-4 text-slate-300" />
          </div>
          <p className="text-sm text-slate-400">No coach assigned yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-emerald-600" />
          Coach
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 border-2 border-emerald-100">
            <GraduationCap className="h-6 w-6 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800">
              {profile.coach_name ?? '—'}
            </p>
            {profile.coach_phone && (
              <a
                href={`tel:${profile.coach_phone}`}
                className="flex items-center gap-1 mt-0.5 text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                <Phone className="h-3.5 w-3.5" />
                {profile.coach_phone}
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Scholarship card — traffic-light status
// ============================================================================

function ScholarshipCard({
  scholarship,
  isLoading,
}: {
  scholarship: HealthSportsScholarship | null;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-44 w-full rounded-xl" />;
  if (!scholarship) return null;

  const statusCfg = scholarshipStatusConfig(scholarship.status);

  const verificationSteps = [
    { label: 'PE Director', done: scholarship.verified_by_pe_director },
    { label: 'Admission', done: scholarship.verified_by_admission },
    { label: 'Director', done: scholarship.verified_by_director },
  ];

  return (
    <Card
      className={cn(
        'border',
        statusCfg.border,
        statusCfg.bg
      )}
    >
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Medal className="h-4 w-4 text-amber-600" />
            Sports Scholarship
          </CardTitle>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border',
              statusCfg.border,
              statusCfg.color
            )}
          >
            <span
              className={cn('h-2 w-2 rounded-full', statusCfg.dot)}
            />
            {statusCfg.label}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        {/* Amount row */}
        <div className="flex items-center justify-between rounded-lg bg-white/60 px-4 py-3 border border-white/80">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              Scholarship Amount
            </p>
            <p className="text-2xl font-extrabold text-slate-800">
              {formatCurrency(scholarship.scholarship_amount)}
            </p>
          </div>
          <div className="text-right space-y-0.5">
            {scholarship.hostel_concession_pct > 0 && (
              <Badge
                variant="outline"
                className="text-xs border-blue-200 text-blue-700 bg-blue-50 block"
              >
                Hostel {scholarship.hostel_concession_pct}% off
              </Badge>
            )}
            {scholarship.bus_fee_waiver && (
              <Badge
                variant="outline"
                className="text-xs border-green-200 text-green-700 bg-green-50 block"
              >
                Bus Fee Waived
              </Badge>
            )}
          </div>
        </div>

        {/* Sport details */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-slate-400">Sport</p>
            <p className="font-medium text-slate-700">{scholarship.sport_name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Level</p>
            <p className="font-medium text-slate-700">{scholarship.competition_level}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Position</p>
            <p className="font-medium text-slate-700">{scholarship.position}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Academic Year</p>
            <p className="font-medium text-slate-700">{scholarship.academic_year}</p>
          </div>
        </div>

        {/* 3-step verification traffic lights */}
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Verification Status
          </p>
          <div className="flex items-center gap-2">
            {verificationSteps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
                )}
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border',
                    step.done
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  )}
                >
                  {step.done ? (
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                  ) : (
                    <Clock className="h-3 w-3 text-slate-300" />
                  )}
                  {step.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Credits This Semester card
// ============================================================================

function CreditsCard({
  credits,
  isLoading,
}: {
  credits: HealthSportsCredit | null;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-52 w-full rounded-xl" />;

  const maxCredits = 3;
  const earned = credits?.total_credits ?? 0;
  const progressPct = Math.min(100, (earned / maxCredits) * 100);
  const attendancePct = credits?.practice_attendance_pct ?? 0;
  const totalHours = credits
    ? credits.practice_hours + credits.tournament_days * 4
    : 0;

  const categories = credits
    ? [
        {
          label: 'Practice',
          credits: credits.practice_credits,
          color: 'bg-emerald-500',
        },
        {
          label: 'Tournament',
          credits: credits.tournament_credits,
          color: 'bg-blue-500',
        },
        {
          label: 'Winning',
          credits: credits.winning_credits,
          color: 'bg-amber-500',
        },
        {
          label: 'Leadership',
          credits: credits.leadership_credits,
          color: 'bg-purple-500',
        },
        {
          label: 'Sportsmanship',
          credits: credits.sportsmanship_credits,
          color: 'bg-rose-500',
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-emerald-600" />
          Credits This Semester
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        {!credits ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">No credit record for this semester</p>
          </div>
        ) : (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 py-3 px-2">
                <p className="text-xl font-extrabold text-emerald-700">
                  {earned.toFixed(1)}
                  <span className="text-sm font-normal text-emerald-500">/{maxCredits}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Credits</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 py-3 px-2">
                <p className="text-xl font-extrabold text-slate-700">{totalHours}</p>
                <p className="text-xs text-slate-400 mt-0.5">Hours</p>
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-100 py-3 px-2">
                <p className="text-xl font-extrabold text-blue-700">
                  {attendancePct.toFixed(0)}
                  <span className="text-sm font-normal text-blue-400">%</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Attendance</p>
              </div>
            </div>

            {/* Credit progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>Progress toward 3 credits</span>
                <span className="font-medium text-emerald-700">
                  {earned.toFixed(2)} / {maxCredits}
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Breakdown by category */}
            <div className="space-y-2">
              {categories
                .filter((c) => c.credits > 0)
                .map((cat) => (
                  <div key={cat.label} className="flex items-center gap-2">
                    <p className="w-24 text-xs text-slate-500 shrink-0">{cat.label}</p>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', cat.color)}
                        style={{
                          width: `${Math.min(100, (cat.credits / maxCredits) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="w-8 text-right text-xs font-medium text-slate-700">
                      {cat.credits.toFixed(2)}
                    </p>
                  </div>
                ))}
              {categories.every((c) => c.credits === 0) && (
                <p className="text-xs text-slate-400 text-center py-2">
                  No credits recorded yet this semester
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Permission request modal
// ============================================================================

type PermissionForm = {
  tournament_name: string;
  sport: string;
  tournament_level: SportLevel | '';
  start_date: string;
  end_date: string;
  travel_required: boolean;
  travel_details: string;
  justification: string;
};

const EMPTY_PERMISSION_FORM: PermissionForm = {
  tournament_name: '',
  sport: '',
  tournament_level: '',
  start_date: '',
  end_date: '',
  travel_required: false,
  travel_details: '',
  justification: '',
};

function RequestPermissionModal({
  open,
  onClose,
  learnerId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  learnerId: string;
  onCreated: (p: HealthTournamentPermission) => void;
}) {
  const [form, setForm] = useState<PermissionForm>(EMPTY_PERMISSION_FORM);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (
      !form.tournament_name ||
      !form.sport ||
      !form.tournament_level ||
      !form.start_date ||
      !form.end_date
    )
      return;
    setSubmitting(true);
    try {
      const result = await HealthSportsService.submitPermissionRequest(learnerId, {
        tournament_name: form.tournament_name,
        sport: form.sport,
        tournament_level: form.tournament_level as SportLevel,
        start_date: form.start_date,
        end_date: form.end_date,
        travel_required: form.travel_required,
        travel_details: form.travel_details || null,
        justification: form.justification || null,
        team_members: [],
      });
      onCreated(result);
      setForm(EMPTY_PERMISSION_FORM);
    } catch (err) {
      console.error('[health/sports] Failed to submit permission request', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Tournament Permission</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Tournament Name *</Label>
            <Input
              placeholder="e.g. SRM University Inter-College"
              value={form.tournament_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, tournament_name: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Sport *</Label>
              <Select
                value={form.sport}
                onValueChange={(v) => setForm((f) => ({ ...f, sport: v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {JKKN_SPORTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Level *</Label>
              <Select
                value={form.tournament_level}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    tournament_level: v as SportLevel,
                  }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {SPORT_LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start Date *</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, start_date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Date *</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, end_date: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Justification</Label>
            <Input
              placeholder="Why should this be approved?"
              value={form.justification}
              onChange={(e) =>
                setForm((f) => ({ ...f, justification: e.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={
              !form.tournament_name ||
              !form.sport ||
              !form.tournament_level ||
              !form.start_date ||
              !form.end_date ||
              submitting
            }
            onClick={handleSubmit}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Tournament Permissions card
// ============================================================================

const APPROVAL_STEP_LABELS = [
  'Sports Coordinator',
  'HOD',
  'Principal',
  'PE Director',
];

function approvalStepStatus(
  perm: HealthTournamentPermission,
  step: number
): ApprovalStatus {
  switch (step) {
    case 0:
      return perm.step1_sports_coordinator_status;
    case 1:
      return perm.step2_hod_status;
    case 2:
      return perm.step3_principal_status;
    case 3:
      return perm.step4_pe_director_status;
    default:
      return 'pending';
  }
}

function overallStatusBadge(status: HealthTournamentPermission['overall_status']) {
  switch (status) {
    case 'approved':
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 text-xs">
          Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 text-xs">
          Rejected
        </Badge>
      );
    case 'completed':
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 text-xs">
          Completed
        </Badge>
      );
    default:
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 text-xs">
          Pending
        </Badge>
      );
  }
}

function TournamentPermissionsCard({
  permissions,
  isLoading,
  learnerId,
  onPermissionCreated,
}: {
  permissions: HealthTournamentPermission[];
  isLoading: boolean;
  learnerId: string;
  onPermissionCreated: (p: HealthTournamentPermission) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" />
              Tournament Permissions
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Request
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          {permissions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Calendar className="h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400">No permission requests yet</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Submit a request before participating in any off-campus tournament
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {permissions.map((perm) => (
                <div
                  key={perm.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3"
                >
                  {/* Tournament header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-800 truncate">
                        {perm.tournament_name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <p className="text-xs text-slate-400">{perm.sport}</p>
                        <span className="text-slate-300">·</span>
                        <p className="text-xs text-slate-400">
                          {new Date(perm.start_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                          {' — '}
                          {new Date(perm.end_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    {overallStatusBadge(perm.overall_status)}
                  </div>

                  {/* 4-step approval pipeline */}
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">
                      Approval Steps
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {APPROVAL_STEP_LABELS.map((label, i) => {
                        const stepStatus = approvalStepStatus(perm, i);
                        return (
                          <div
                            key={label}
                            className={cn(
                              'rounded-lg border px-2 py-2 text-center',
                              stepStatus === 'approved'
                                ? 'bg-green-50 border-green-200'
                                : stepStatus === 'rejected'
                                ? 'bg-red-50 border-red-200'
                                : 'bg-white border-slate-100'
                            )}
                          >
                            <div className="flex justify-center mb-1">
                              {approvalStepIcon(stepStatus)}
                            </div>
                            <p
                              className={cn(
                                'text-xs font-medium leading-tight',
                                stepStatus === 'approved'
                                  ? 'text-green-700'
                                  : stepStatus === 'rejected'
                                  ? 'text-red-600'
                                  : 'text-slate-400'
                              )}
                            >
                              {label}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RequestPermissionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        learnerId={learnerId}
        onCreated={(p) => {
          onPermissionCreated(p);
          setModalOpen(false);
        }}
      />
    </>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function SportsProfilePage() {
  const { profile: authProfile, isLoading: authLoading } = useAuth();
  const learnerId = authProfile?.learner_id ?? authProfile?.id ?? '';

  const [sportsProfile, setSportsProfile] = useState<HealthSportsProfile | null>(null);
  const [scholarship, setScholarship] = useState<HealthSportsScholarship | null>(null);
  const [credits, setCredits] = useState<HealthSportsCredit | null>(null);
  const [permissions, setPermissions] = useState<HealthTournamentPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!learnerId) return;
    setLoading(true);
    try {
      const [profile, schol, perms] = await Promise.all([
        HealthSportsService.getOrCreateSportsProfile(learnerId),
        HealthSportsService.getScholarship(learnerId),
        HealthSportsService.getPermissions(learnerId),
      ]);
      setSportsProfile(profile);
      setScholarship(schol);
      setPermissions(perms);

      // Current semester credits (derive semester from current date — e.g. "ODD-2025")
      const now = new Date();
      const semester =
        now.getMonth() < 6
          ? `EVEN-${now.getFullYear()}`
          : `ODD-${now.getFullYear()}`;
      const creditRecord = await HealthSportsService.getCurrentSemesterCredits(
        learnerId,
        semester
      );
      setCredits(creditRecord);
    } catch (err) {
      console.error('[health/sports] Load error', err);
    } finally {
      setLoading(false);
    }
  }, [learnerId]);

  useEffect(() => {
    if (!authLoading && learnerId) {
      load();
    }
  }, [authLoading, learnerId, load]);

  const isLoading = authLoading || loading;

  return (
    <ContentLayout title="Sports Profile">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Sports' },
        ]}
      />

      <div className="mt-4 space-y-5 max-w-2xl pb-10">
        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sports Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your sports identity, credits, and scholarship at JKKN.
          </p>
        </div>

        {/* 1. Sports Identity Card */}
        <SportsIdentityCard profile={sportsProfile} isLoading={isLoading} />

        {/* 2. My Sports */}
        <MySportsSection
          profile={sportsProfile}
          isLoading={isLoading}
          onProfileUpdated={setSportsProfile}
        />

        {/* 3. Coach Info */}
        <CoachInfoCard profile={sportsProfile} isLoading={isLoading} />

        {/* 4. Scholarship */}
        {(isLoading || scholarship) && (
          <ScholarshipCard scholarship={scholarship} isLoading={isLoading} />
        )}

        {/* 5. Credits This Semester */}
        <CreditsCard credits={credits} isLoading={isLoading} />

        {/* 6. Tournament Permissions */}
        <TournamentPermissionsCard
          permissions={permissions}
          isLoading={isLoading}
          learnerId={learnerId}
          onPermissionCreated={(p) =>
            setPermissions((prev) => [p, ...prev])
          }
        />
      </div>
    </ContentLayout>
  );
}
