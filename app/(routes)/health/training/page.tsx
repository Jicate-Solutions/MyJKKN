'use client';

import { useState, useEffect, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { HealthSportsService } from '@/lib/services/health/health-sports-service';
import type {
  HealthTrainingLog,
  HealthSportsInjury,
  TrainingType,
  TrainingIntensity,
} from '@/types/health-sports';
import {
  TRAINING_TYPES,
  JKKN_SPORTS,
  BODY_PARTS,
  INJURY_TYPES,
} from '@/types/health-sports';
import {
  Activity,
  Dumbbell,
  Clock,
  Flame,
  Star,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Calendar,
  Shield,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2);
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function daysSince(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 86400000,
  );
}

// ─── Intensity config ────────────────────────────────────────────────────────

const INTENSITY_CONFIG: Record<
  TrainingIntensity,
  { label: string; color: string; bg: string; border: string }
> = {
  low: {
    label: 'Low',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  moderate: {
    label: 'Moderate',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  high: {
    label: 'High',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  max: {
    label: 'Max',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

const SEVERITY_CONFIG = {
  minor: {
    label: 'Minor',
    color: 'text-yellow-700',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
  },
  moderate: {
    label: 'Moderate',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  severe: {
    label: 'Severe',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

const BODY_PART_ICONS: Record<string, string> = {
  Ankle: '🦶',
  Knee: '🦵',
  Shoulder: '💪',
  Wrist: '✋',
  Head: '🧠',
  Back: '🫀',
  Hip: '🦴',
  Elbow: '💪',
  Finger: '👆',
  Hamstring: '🦵',
  Other: '🤕',
};

// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readOnly,
}: {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={`text-lg transition-transform ${readOnly ? '' : 'hover:scale-110'} focus:outline-none`}
        >
          <Star
            className={`h-5 w-5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Weekly Heatmap ───────────────────────────────────────────────────────────

function WeekHeatmap({ logs }: { logs: HealthTrainingLog[] }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });

  const logsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const log of logs) {
      map[log.training_date] = (map[log.training_date] || 0) + log.duration_minutes;
    }
    return map;
  }, [logs]);

  return (
    <div className="flex gap-2 justify-between mt-3">
      {days.map((d) => {
        const key = isoDate(d);
        const minutes = logsByDate[key] || 0;
        const isToday = key === isoDate(today);
        const intensity =
          minutes === 0
            ? 'bg-gray-100'
            : minutes < 30
              ? 'bg-emerald-200'
              : minutes < 60
                ? 'bg-emerald-400'
                : 'bg-emerald-600';

        return (
          <div key={key} className="flex flex-col items-center gap-1 flex-1">
            <div
              className={`w-full aspect-square rounded-md ${intensity} border ${isToday ? 'ring-2 ring-emerald-500 ring-offset-1' : 'border-transparent'} transition-colors`}
              title={minutes > 0 ? `${minutes} min` : 'No training'}
            />
            <span className="text-[10px] text-gray-500 font-medium">
              {dayLabel(d)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Training Form ────────────────────────────────────────────────────────────

function AddTrainingForm({
  learnerId,
  onSuccess,
}: {
  learnerId: string;
  onSuccess: () => void;
}) {
  const [sport, setSport] = useState('');
  const [type, setType] = useState<TrainingType | ''>('');
  const [duration, setDuration] = useState('');
  const [intensity, setIntensity] = useState<TrainingIntensity | null>(null);
  const [rating, setRating] = useState(3);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sport || !type || !duration) {
      setError('Sport, type, and duration are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await HealthSportsService.addTrainingLog(learnerId, {
        sport,
        training_type: type as TrainingType,
        duration_minutes: parseInt(duration, 10),
        intensity: intensity || undefined,
        self_rating: rating,
        notes: notes || undefined,
        training_date: new Date().toISOString().split('T')[0],
      });
      setSport('');
      setType('');
      setDuration('');
      setIntensity(null);
      setRating(3);
      setNotes('');
      onSuccess();
    } catch {
      setError('Failed to save training log. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-emerald-100 bg-emerald-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
          <Plus className="h-4 w-4" />
          Log Training Session
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Sport</Label>
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger className="h-9 bg-white">
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

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                Session Type
              </Label>
              <Select value={type} onValueChange={(v) => setType(v as TrainingType)}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Duration (minutes)
            </Label>
            <Input
              type="number"
              min="1"
              max="480"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 60"
              className="h-9 bg-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Intensity
            </Label>
            <div className="flex gap-2 flex-wrap">
              {(['low', 'moderate', 'high', 'max'] as TrainingIntensity[]).map(
                (lvl) => {
                  const cfg = INTENSITY_CONFIG[lvl];
                  const active = intensity === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setIntensity(active ? null : lvl)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        active
                          ? `${cfg.color} ${cfg.bg} ${cfg.border} shadow-sm`
                          : 'text-gray-500 bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Self Rating
            </Label>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Notes (optional)
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it go? Any observations..."
              className="min-h-[72px] bg-white resize-none text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-9"
          >
            {saving ? 'Saving...' : 'Save Training Log'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Training Entries List ────────────────────────────────────────────────────

function TrainingEntries({ logs }: { logs: HealthTrainingLog[] }) {
  const grouped = useMemo(() => {
    const map: Record<string, HealthTrainingLog[]> = {};
    for (const log of logs) {
      if (!map[log.training_date]) map[log.training_date] = [];
      map[log.training_date].push(log);
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [logs]);

  if (grouped.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <Dumbbell className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No training logs yet. Add your first session above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([date, entries]) => (
        <div key={date}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            {formatDate(date)}
          </p>
          <div className="space-y-2">
            {entries.map((log) => {
              const typeInfo = TRAINING_TYPES.find(
                (t) => t.value === log.training_type,
              );
              const intensityCfg = log.intensity
                ? INTENSITY_CONFIG[log.intensity]
                : null;

              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3 shadow-sm"
                >
                  <div className="text-2xl shrink-0">{typeInfo?.emoji || '📝'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">
                        {log.sport}
                      </span>
                      <span className="text-xs text-gray-500">
                        {typeInfo?.label}
                      </span>
                      {intensityCfg && (
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${intensityCfg.color} ${intensityCfg.bg} ${intensityCfg.border}`}
                        >
                          {intensityCfg.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {log.duration_minutes} min
                      </span>
                      {log.self_rating && (
                        <StarRating value={log.self_rating} readOnly />
                      )}
                    </div>
                    {log.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {log.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Injury Form ─────────────────────────────────────────────────────────────

function ReportInjuryForm({
  learnerId,
  onSuccess,
}: {
  learnerId: string;
  onSuccess: () => void;
}) {
  const [injuryDate, setInjuryDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [sport, setSport] = useState('');
  const [injuryType, setInjuryType] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [severity, setSeverity] = useState<'minor' | 'moderate' | 'severe' | null>(null);
  const [description, setDescription] = useState('');
  const [treatment, setTreatment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!injuryType || !bodyPart || !severity) {
      setError('Injury type, body part, and severity are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await HealthSportsService.addInjury(learnerId, {
        injury_date: injuryDate,
        sport: sport || undefined,
        injury_type: injuryType,
        body_part: bodyPart,
        severity,
        description: description || undefined,
        treatment: treatment || undefined,
        recovery_status: 'recovering',
        cleared_to_play: false,
      });
      setInjuryType('');
      setBodyPart('');
      setSeverity(null);
      setDescription('');
      setTreatment('');
      onSuccess();
    } catch {
      setError('Failed to report injury. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-red-100 bg-red-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-red-800">
          <AlertTriangle className="h-4 w-4" />
          Report an Injury
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                Injury Date
              </Label>
              <Input
                type="date"
                value={injuryDate}
                onChange={(e) => setInjuryDate(e.target.value)}
                className="h-9 bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                Sport (optional)
              </Label>
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger className="h-9 bg-white">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                Injury Type
              </Label>
              <Select value={injuryType} onValueChange={setInjuryType}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {INJURY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                Body Part
              </Label>
              <Select value={bodyPart} onValueChange={setBodyPart}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="Select part" />
                </SelectTrigger>
                <SelectContent>
                  {BODY_PARTS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {BODY_PART_ICONS[p] || '🩹'} {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Severity
            </Label>
            <div className="flex gap-2">
              {(['minor', 'moderate', 'severe'] as const).map((s) => {
                const cfg = SEVERITY_CONFIG[s];
                const active = severity === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(active ? null : s)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                      active
                        ? `${cfg.color} ${cfg.bg} ${cfg.border} shadow-sm`
                        : 'text-gray-500 bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Description (optional)
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="How did the injury happen?"
              className="min-h-[60px] bg-white resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Treatment / First Aid (optional)
            </Label>
            <Textarea
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              placeholder="Ice applied, physiotherapy, rest..."
              className="min-h-[60px] bg-white resize-none text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={saving}
            className="w-full bg-red-600 hover:bg-red-700 text-white h-9"
          >
            {saving ? 'Reporting...' : 'Report Injury'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Active Injury Card ───────────────────────────────────────────────────────

function ActiveInjuryCard({ injury }: { injury: HealthSportsInjury }) {
  const cfg = SEVERITY_CONFIG[injury.severity];
  const days = daysSince(injury.injury_date);
  const icon = BODY_PART_ICONS[injury.body_part] || '🩹';

  return (
    <div
      className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex gap-3 items-start`}
    >
      <div className="text-2xl shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {injury.body_part} — {injury.injury_type}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {injury.sport ? `${injury.sport} · ` : ''}
              {days === 0 ? 'Today' : `${days} day${days > 1 ? 's' : ''} ago`}
            </p>
          </div>
          <Badge
            className={`text-[10px] font-medium border ${cfg.color} ${cfg.bg} ${cfg.border} capitalize`}
          >
            {injury.severity}
          </Badge>
        </div>
        {injury.description && (
          <p className="text-xs text-gray-500 mt-1">{injury.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          {injury.cleared_to_play ? (
            <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <CheckCircle className="h-3 w-3" />
              Cleared to Play
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
              <Shield className="h-3 w-3" />
              Not Cleared
            </span>
          )}
          <span
            className={`text-xs capitalize px-2 py-0.5 rounded-full border font-medium ${
              injury.recovery_status === 'chronic'
                ? 'text-purple-700 bg-purple-50 border-purple-200'
                : 'text-blue-700 bg-blue-50 border-blue-200'
            }`}
          >
            {injury.recovery_status}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Injury History Row ───────────────────────────────────────────────────────

function InjuryHistoryRow({ injury }: { injury: HealthSportsInjury }) {
  const cfg = SEVERITY_CONFIG[injury.severity];
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-base">{BODY_PART_ICONS[injury.body_part] || '🩹'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700">
          {injury.body_part} — {injury.injury_type}
        </p>
        <p className="text-[11px] text-gray-400">{formatDate(injury.injury_date)}</p>
      </div>
      <Badge
        className={`text-[10px] capitalize border ${cfg.color} ${cfg.bg} ${cfg.border}`}
      >
        {injury.severity}
      </Badge>
      <span className="text-[10px] text-emerald-600 font-medium">Recovered</span>
    </div>
  );
}

// ─── Injury History Collapsible ───────────────────────────────────────────────

function InjuryHistory({ injuries }: { injuries: HealthSportsInjury[] }) {
  const [open, setOpen] = useState(false);
  if (injuries.length === 0) return null;

  return (
    <Card className="border-gray-100">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-semibold text-gray-700">
          Injury History ({injuries.length})
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {open && (
        <CardContent className="pt-0">
          {injuries.map((inj) => (
            <InjuryHistoryRow key={inj.id} injury={inj} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const { profile } = useAuth();
  const learnerId = profile?.learner_id ?? undefined;

  const [trainingLogs, setTrainingLogs] = useState<HealthTrainingLog[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<{
    total_minutes: number;
    sessions: number;
    sports: string[];
  } | null>(null);
  const [injuries, setInjuries] = useState<HealthSportsInjury[]>([]);
  const [loadingTraining, setLoadingTraining] = useState(true);
  const [loadingInjuries, setLoadingInjuries] = useState(true);

  async function loadTraining() {
    if (!learnerId) return;
    setLoadingTraining(true);
    try {
      const [logs, summary] = await Promise.all([
        HealthSportsService.getTrainingLogs(learnerId, 30),
        HealthSportsService.getWeeklyTrainingSummary(learnerId),
      ]);
      setTrainingLogs(logs);
      setWeeklySummary(summary);
    } finally {
      setLoadingTraining(false);
    }
  }

  async function loadInjuries() {
    if (!learnerId) return;
    setLoadingInjuries(true);
    try {
      const data = await HealthSportsService.getInjuries(learnerId);
      setInjuries(data);
    } finally {
      setLoadingInjuries(false);
    }
  }

  useEffect(() => {
    loadTraining();
    loadInjuries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerId]);

  const activeInjuries = injuries.filter(
    (i) => i.recovery_status !== 'recovered',
  );
  const recoveredInjuries = injuries.filter(
    (i) => i.recovery_status === 'recovered',
  );

  // Week heatmap uses last 7 days from all training logs
  const weekLogs = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split('T')[0];
    return trainingLogs.filter((l) => l.training_date >= weekAgo);
  }, [trainingLogs]);

  return (
    <ContentLayout title="Training Log">
      <div className="max-w-2xl mx-auto px-4 pb-10 space-y-6">
        <Tabs defaultValue="training">
          <TabsList className="w-full grid grid-cols-2 mb-2">
            <TabsTrigger value="training" className="flex items-center gap-1.5">
              <Dumbbell className="h-4 w-4" />
              Training Log
            </TabsTrigger>
            <TabsTrigger value="injuries" className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Injury Log
            </TabsTrigger>
          </TabsList>

          {/* ── Training Log Tab ────────────────────────────────────────── */}
          <TabsContent value="training" className="space-y-5 mt-4">
            {/* This Week Summary */}
            <Card className="border-emerald-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  This Week
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingTraining ? (
                  <div className="h-16 animate-pulse bg-gray-100 rounded-lg" />
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-emerald-700">
                          {weeklySummary?.total_minutes ?? 0}
                        </p>
                        <p className="text-[11px] text-gray-500 flex items-center justify-center gap-0.5">
                          <Clock className="h-3 w-3" /> minutes
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-emerald-700">
                          {weeklySummary?.sessions ?? 0}
                        </p>
                        <p className="text-[11px] text-gray-500 flex items-center justify-center gap-0.5">
                          <Flame className="h-3 w-3" /> sessions
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-emerald-700">
                          {weeklySummary?.sports.length ?? 0}
                        </p>
                        <p className="text-[11px] text-gray-500">sports</p>
                      </div>
                    </div>
                    <WeekHeatmap logs={weekLogs} />
                    {weeklySummary && weeklySummary.sports.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {weeklySummary.sports.map((s) => (
                          <span
                            key={s}
                            className="text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Add Training Form */}
            {learnerId && (
              <AddTrainingForm learnerId={learnerId} onSuccess={loadTraining} />
            )}

            {/* Recent Entries */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Recent Entries (30 days)
              </h3>
              {loadingTraining ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="h-16 animate-pulse bg-gray-100 rounded-xl"
                    />
                  ))}
                </div>
              ) : (
                <TrainingEntries logs={trainingLogs} />
              )}
            </div>
          </TabsContent>

          {/* ── Injury Log Tab ───────────────────────────────────────────── */}
          <TabsContent value="injuries" className="space-y-5 mt-4">
            {/* Active Injuries */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Active Injuries
                {activeInjuries.length > 0 && (
                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">
                    {activeInjuries.length}
                  </Badge>
                )}
              </h3>
              {loadingInjuries ? (
                <div className="h-24 animate-pulse bg-gray-100 rounded-xl" />
              ) : activeInjuries.length === 0 ? (
                <div className="text-center py-8 bg-emerald-50 rounded-xl border border-emerald-100">
                  <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-emerald-700">
                    No active injuries
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    You are cleared to train.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeInjuries.map((inj) => (
                    <ActiveInjuryCard key={inj.id} injury={inj} />
                  ))}
                </div>
              )}
            </div>

            {/* Report Injury Form */}
            {learnerId && (
              <ReportInjuryForm learnerId={learnerId} onSuccess={loadInjuries} />
            )}

            {/* Injury History */}
            {!loadingInjuries && (
              <InjuryHistory injuries={recoveredInjuries} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
