'use client';

import { useState, useEffect, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import {
  HealthSportsService,
  isMissingColumnError,
} from '@/lib/services/health/health-sports-service';
import type {
  HealthSportsAchievement,
  SportLevel,
  AchievementType,
  AchievementCategory,
} from '@/types/health-sports';
import {
  JKKN_SPORTS,
  SPORT_LEVELS,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_CATEGORY_LABELS,
} from '@/types/health-sports';
import {
  Trophy,
  BadgeCheck,
  Plus,
  AlertTriangle,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { CertificateUpload } from './_components/certificate-upload';
import { VerificationPanel } from './_components/verification-panel';
import { uploadCertificate } from './_actions/upload-certificate';
import {
  composeDescription,
  parseDescription,
  isFutureDate,
  todayIsoDate,
} from './_lib/outbound';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Achievement type config ──────────────────────────────────────────────────

const ACHIEVEMENT_TYPES: {
  value: AchievementType;
  label: string;
  emoji: string;
}[] = [
  { value: 'gold', label: 'Gold Medal', emoji: '🥇' },
  { value: 'silver', label: 'Silver Medal', emoji: '🥈' },
  { value: 'bronze', label: 'Bronze Medal', emoji: '🥉' },
  { value: 'participation', label: 'Participation', emoji: '🏅' },
  { value: 'record', label: 'Record Broken', emoji: '📈' },
  { value: 'best_player', label: 'Best Player', emoji: '⭐' },
  { value: 'captain', label: 'Captain', emoji: '🎖️' },
  { value: 'other', label: 'Other', emoji: '🏆' },
];

const MEDAL_CARD_STYLE: Record<
  AchievementType,
  { border: string; bg: string; ring: string; shadow: string }
> = {
  gold: {
    border: 'border-amber-300',
    bg: 'bg-gradient-to-br from-amber-50 to-yellow-50',
    ring: 'ring-amber-200',
    shadow: 'shadow-amber-100',
  },
  silver: {
    border: 'border-gray-300',
    bg: 'bg-gradient-to-br from-gray-50 to-slate-50',
    ring: 'ring-gray-200',
    shadow: 'shadow-gray-100',
  },
  bronze: {
    border: 'border-orange-300',
    bg: 'bg-gradient-to-br from-orange-50 to-amber-50',
    ring: 'ring-orange-200',
    shadow: 'shadow-orange-100',
  },
  participation: {
    border: 'border-blue-200',
    bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    ring: 'ring-blue-100',
    shadow: 'shadow-blue-50',
  },
  record: {
    border: 'border-purple-200',
    bg: 'bg-gradient-to-br from-purple-50 to-fuchsia-50',
    ring: 'ring-purple-100',
    shadow: 'shadow-purple-50',
  },
  best_player: {
    border: 'border-emerald-200',
    bg: 'bg-gradient-to-br from-emerald-50 to-teal-50',
    ring: 'ring-emerald-100',
    shadow: 'shadow-emerald-50',
  },
  captain: {
    border: 'border-rose-200',
    bg: 'bg-gradient-to-br from-rose-50 to-pink-50',
    ring: 'ring-rose-100',
    shadow: 'shadow-rose-50',
  },
  other: {
    border: 'border-gray-200',
    bg: 'bg-gradient-to-br from-gray-50 to-zinc-50',
    ring: 'ring-gray-100',
    shadow: 'shadow-gray-50',
  },
};

const LEVEL_BADGE: Record<SportLevel, { label: string; color: string; bg: string; border: string }> = {
  intra_college: {
    label: 'Intra-College',
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
  inter_college: {
    label: 'Inter-College',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  district: {
    label: 'District',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
  },
  state: {
    label: 'State',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
  },
  national: {
    label: 'National',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  international: {
    label: 'International',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
  },
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  emoji,
  value,
  label,
  accent,
}: {
  emoji: string;
  value: string | number;
  label: string;
  accent: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 text-center ${accent} shadow-sm`}
    >
      <div className="text-2xl mb-1">{emoji}</div>
      <p className="text-2xl font-bold text-gray-900 break-words">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Medal Card ───────────────────────────────────────────────────────────────

function MedalCard({ achievement }: { achievement: HealthSportsAchievement }) {
  const typeInfo = ACHIEVEMENT_TYPES.find(
    (t) => t.value === achievement.achievement_type,
  );
  const style = MEDAL_CARD_STYLE[achievement.achievement_type];
  const levelInfo = LEVEL_BADGE[achievement.event_level];
  // D11's reserve flag still lives in the structured leading lines of
  // description (see _lib/outbound.ts). The organiser no longer does: D14 made
  // `host_institution` a real column, so it is preferred here. The parsed value
  // is the fallback for rows written before that column existed — and for rows
  // written after the UI deployed but before the migration was applied.
  //
  // `??` alone is not enough: an empty or whitespace column value is not null,
  // so it would win over a real legacy "Hosted by:" line and render a blank
  // host. Blank in the column means "no host recorded here", so it falls
  // through — this must not depend on every writer normalising '' to NULL.
  const { host: legacyHost, isReserve } = parseDescription(achievement.description);
  const host = achievement.host_institution?.trim() || legacyHost;

  return (
    <div
      className={`rounded-2xl border ${style.border} ${style.bg} shadow ${style.shadow} p-4 flex flex-col gap-2 relative overflow-hidden`}
    >
      {/* Verified badge */}
      {achievement.verified && (
        <div className="absolute top-2 right-2">
          <BadgeCheck className="h-4 w-4 text-emerald-500" />
        </div>
      )}

      {/* Medal icon */}
      <div className="text-4xl leading-none">{typeInfo?.emoji || '🏆'}</div>

      {/* Sport (or award category for academic / cultural / other awards) */}
      <p className="text-sm font-bold text-gray-900 leading-tight">
        {achievement.sport ??
          ACHIEVEMENT_CATEGORY_LABELS[achievement.category ?? 'other']}
      </p>

      {/* Event */}
      <p className="text-xs text-gray-600 leading-snug line-clamp-2">
        {achievement.event_name}
      </p>

      {/* External host / organiser — only for outbound events that recorded one */}
      {host && (
        <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">
          Hosted by {host}
        </p>
      )}

      {/* Level badge */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${levelInfo.color} ${levelInfo.bg} ${levelInfo.border}`}
        >
          {levelInfo.label}
        </span>
        <span className="text-[10px] text-gray-400">
          {formatDate(achievement.achievement_date)}
        </span>
      </div>

      {/* Achievement type label */}
      <p className="text-xs font-medium text-gray-500">
        {typeInfo?.label}
      </p>

      {/* D11: a reserve counts as having taken part — the headcount stays true —
          but the card says plainly that they did not play, so this row can never
          be read later as having competed. */}
      {isReserve && (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-slate-700 bg-slate-50 border-slate-200 self-start">
          Reserve — travelled, did not play
        </span>
      )}

      {/* Verification state, stated plainly: an unverified entry is a claim the
          IQAC team has not confirmed, and must never read as proven evidence. */}
      {achievement.verified ? (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-emerald-700 bg-emerald-50 border-emerald-200 self-start flex items-center gap-1">
          <BadgeCheck className="h-3 w-3" />
          Verified by IQAC
        </span>
      ) : (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200 self-start flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Pending IQAC verification
        </span>
      )}
    </div>
  );
}

// ─── Level Pyramid ────────────────────────────────────────────────────────────

const PYRAMID_ORDER: SportLevel[] = [
  'international',
  'national',
  'state',
  'district',
  'inter_college',
  'intra_college',
];

function LevelPyramid({
  achievements,
}: {
  achievements: HealthSportsAchievement[];
}) {
  const countByLevel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of achievements) {
      map[a.event_level] = (map[a.event_level] || 0) + 1;
    }
    return map;
  }, [achievements]);

  const maxCount = Math.max(...Object.values(countByLevel), 1);

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-indigo-500" />
          Level Progression
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {PYRAMID_ORDER.map((level) => {
            const count = countByLevel[level] || 0;
            const info = LEVEL_BADGE[level];
            const widthPct = count === 0 ? 8 : Math.max(16, (count / maxCount) * 100);

            return (
              <div key={level} className="flex items-center gap-3">
                <span
                  className={`text-[10px] font-semibold w-24 text-right shrink-0 ${info.color}`}
                >
                  {info.label}
                </span>
                <div className="flex-1 relative h-6 bg-gray-50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${info.bg} border ${info.border}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-700 w-5 text-right shrink-0">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 mt-3 text-center">
          Achievements by competition level
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Add Achievement Form ─────────────────────────────────────────────────────

function AddAchievementForm({
  learnerId,
  onSuccess,
}: {
  learnerId: string;
  onSuccess: () => void;
}) {
  const [date, setDate] = useState(todayIsoDate());
  const [category, setCategory] = useState<AchievementCategory>('sports');
  const [sport, setSport] = useState('');
  const [eventName, setEventName] = useState('');
  const [hostInstitution, setHostInstitution] = useState('');
  const [level, setLevel] = useState<SportLevel | ''>('');
  const [achievementType, setAchievementType] = useState<AchievementType | ''>('');
  const [isReserve, setIsReserve] = useState(false);
  const [description, setDescription] = useState('');
  const [certificateUrl, setCertificateUrl] = useState('');
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificateError, setCertificateError] = useState<string | null>(null);
  // What the picker held before Reserve forced 'participation', so unticking can
  // put it back instead of leaving a silent, unchosen value behind.
  const [typeBeforeReserve, setTypeBeforeReserve] = useState<AchievementType | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // D11: a reserve travelled with the squad and did not play, so the honest
  // record is participation. Forcing the type here (rather than trusting the
  // picker) is what stops a reserve ever being written as a medal winner.
  // Unticking restores whatever was chosen before — otherwise 'participation'
  // stays behind as an answer nobody gave.
  function handleReserveChange(next: boolean) {
    setIsReserve(next);
    if (next) {
      setTypeBeforeReserve(achievementType);
      setAchievementType('participation');
    } else {
      setAchievementType(typeBeforeReserve);
      setTypeBeforeReserve('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!eventName || !level || !achievementType || (category === 'sports' && !sport)) {
      setError(
        category === 'sports'
          ? 'Sport, event name, level, and achievement type are required.'
          : 'Event / award name, level, and achievement type are required.',
      );
      return;
    }
    // D5: any past date is accepted so old tournaments can be backfilled for
    // accreditation — only an impossible future date is refused.
    if (isFutureDate(date)) {
      setError('The achievement date cannot be in the future.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const basePayload = {
        achievement_date: date,
        event_name: eventName,
        // D11 again, at the write itself: a reserve is stored as participation
        // whatever the picker last held.
        achievement_type: (isReserve
          ? 'participation'
          : achievementType) as AchievementType,
        event_level: level as SportLevel,
        // Only a link the learner pasted. An uploaded scan is attached AFTER
        // this insert, by the server action, which authorizes the caller against
        // the row it is attaching to — see _actions/upload-certificate.ts.
        certificate_url: certificateUrl || undefined,
        // Never self-verified: only the accreditation / IQAC team may set this,
        // through the server action in _actions/verify-achievement.ts.
        verified: false,
        // Deploy-order safety (same pattern as PR #2403's new-column handling):
        // the `category` column ships in migration 20260726114500, which is
        // Director-gated and may apply AFTER this UI deploys. Sports entries
        // keep the EXACT legacy payload shape (no `category` key) so today's
        // flow keeps working pre-migration — the DB default 'sports' backfills
        // category once the column exists. Non-sports categories require the
        // new column and fail with a clear message until the migration is
        // applied (see catch below).
        ...(category === 'sports' ? { sport } : { category, sport: null }),
      };

      // D14: the host is a REAL column now, so it stops being folded into the
      // description — buried prose cannot be counted or filtered, which is the
      // whole complaint. The description carries only the D11 reserve marker
      // and the learner's own notes.
      //
      // That column ships in a Director-gated migration that neither merge nor
      // deploy applies, so if it is not there yet we fall back to exactly
      // today's behaviour (host in the description) rather than failing the
      // save. The reader prefers the column and falls back to the prose, so a
      // row written either way displays identically.
      let created;
      try {
        created = await HealthSportsService.addAchievement(learnerId, {
          ...basePayload,
          host_institution: hostInstitution.trim() || null,
          description: composeDescription('', description, isReserve),
        });
      } catch (err) {
        if (!isMissingColumnError(err, 'host_institution')) throw err;
        created = await HealthSportsService.addAchievement(learnerId, {
          ...basePayload,
          description: composeDescription(hostInstitution, description, isReserve),
        });
      }

      // The scan goes up only now that there is a row to attach it to — the
      // action refuses anyone who is not that row's learner, the IQAC team, or
      // an admin. A failure here is reported plainly rather than swallowed: the
      // achievement is already saved, and the learner needs to know the evidence
      // did not land with it.
      let attachWarning = '';
      if (certificateFile) {
        const body = new FormData();
        body.append('achievementId', created.id);
        body.append('file', certificateFile);
        const res = await uploadCertificate(body);
        if (!res.ok) {
          attachWarning = `Achievement saved, but the certificate did not attach: ${res.error ?? 'upload failed'} You can add it again as a link.`;
        }
      }

      setCategory('sports');
      setSport('');
      setEventName('');
      setHostInstitution('');
      setLevel('');
      setAchievementType('');
      setTypeBeforeReserve('');
      setIsReserve(false);
      setDescription('');
      setCertificateUrl('');
      setCertificateFile(null);
      setCertificateError(null);
      setError(attachWarning);
      onSuccess();
    } catch (err) {
      const msg =
        typeof (err as { message?: unknown } | null)?.message === 'string'
          ? (err as { message: string }).message
          : '';
      // Pre-migration, PostgREST rejects the unknown `category` column
      // (PGRST204 "Could not find the 'category' column ... in the schema
      // cache") — surface what is actually wrong instead of a generic error.
      if (category !== 'sports' && /category|schema cache/i.test(msg)) {
        setError(
          'Academic, cultural and other awards are not enabled on this server yet (database update pending). Sports achievements still save normally.',
        );
      } else {
        setError('Failed to save achievement. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-amber-100 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
          <Plus className="h-4 w-4" />
          Add Achievement
        </CardTitle>
        <p className="text-xs text-amber-700">
          Record any event you took part in — including tournaments you travelled
          to at another institution. Taking part counts: choose
          &ldquo;Participation&rdquo; when there was no medal. Past years can be
          entered. The IQAC team verifies each entry afterwards.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Date</Label>
              <Input
                type="date"
                value={date}
                max={todayIsoDate()}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as AchievementCategory)}
              >
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {ACHIEVEMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.emoji} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {category === 'sports' && (
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
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Event / Award Name
            </Label>
            <Input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder={
                category === 'sports'
                  ? 'e.g. FORZAHS State Level Paramedical Sports Tournament'
                  : 'e.g. State-Level Paper Presentation Award 2026'
              }
              className="h-9 bg-white"
            />
          </div>

          {/* Outbound events: the institution that HOSTED it. Blank for events
              held on our own campus. */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Hosted by (leave blank if held at JKKN)
            </Label>
            <Input
              type="text"
              value={hostInstitution}
              onChange={(e) => setHostInstitution(e.target.value)}
              placeholder="e.g. Vinayaka Missions Research Foundation, Salem"
              className="h-9 bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                Competition Level
              </Label>
              <Select value={level} onValueChange={(v) => setLevel(v as SportLevel)}>
                <SelectTrigger className="h-9 bg-white">
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

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                Achievement Type
              </Label>
              <Select
                value={achievementType}
                onValueChange={(v) => setAchievementType(v as AchievementType)}
                disabled={isReserve}
              >
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ACHIEVEMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* D11: reserve / bench learners COUNT, but are marked as such. */}
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isReserve}
              onChange={(e) => handleReserveChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-600"
            />
            <span className="text-xs text-gray-700">
              <span className="font-medium">
                Reserve — travelled with the squad but did not play
              </span>
              <span className="block text-[11px] text-gray-500 mt-0.5">
                You still count as having taken part, and the entry says plainly
                that you did not compete. Recorded as Participation.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">
              Description (optional)
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any details about this achievement..."
              className="min-h-[60px] bg-white resize-none text-sm"
            />
          </div>

          <CertificateUpload
            url={certificateUrl}
            file={certificateFile}
            onUrlChange={setCertificateUrl}
            onFileChange={setCertificateFile}
            error={certificateError}
            onError={setCertificateError}
            disabled={saving}
          />

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white h-9"
          >
            {saving ? 'Saving...' : 'Add Achievement'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AchievementsPage() {
  const { profile } = useAuth();
  const learnerId = profile?.learner_id ?? undefined;

  const [achievements, setAchievements] = useState<HealthSportsAchievement[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAchievements() {
    // Staff (IQAC, physical director, admins) have no learner record of their
    // own. Land them on a settled page instead of an endless skeleton — the
    // verification panel below is their half of this surface.
    if (!learnerId) {
      setAchievements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await HealthSportsService.getAchievements(learnerId);
      setAchievements(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAchievements();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerId]);

  // Stats
  const stats = useMemo(() => {
    const medals = achievements.filter((a) =>
      ['gold', 'silver', 'bronze'].includes(a.achievement_type),
    ).length;

    const levelOrder: SportLevel[] = [
      'intra_college',
      'inter_college',
      'district',
      'state',
      'national',
      'international',
    ];
    const highestLevel = achievements.reduce<SportLevel | null>((best, a) => {
      if (!best) return a.event_level;
      return levelOrder.indexOf(a.event_level) > levelOrder.indexOf(best)
        ? a.event_level
        : best;
    }, null);

    const verified = achievements.filter((a) => a.verified).length;
    return { medals, highestLevel, verified };
  }, [achievements]);

  // Group by achievement type for the medal wall
  const medalTypes: AchievementType[] = [
    'gold',
    'silver',
    'bronze',
    'participation',
    'best_player',
    'captain',
    'record',
    'other',
  ];
  const hasMedalWall = achievements.length > 0;

  return (
    <ContentLayout title="Achievements">
      <div className="max-w-2xl mx-auto px-4 pb-10 space-y-6">

        {/* ── IQAC Verification (renders only for the accreditation team) ─── */}
        <VerificationPanel />

        {/* ── Achievement Summary ─────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-24 animate-pulse bg-gray-100 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              emoji="🏅"
              value={stats.medals}
              label="Total Medals"
              accent="bg-amber-50 border-amber-200"
            />
            <StatCard
              emoji="🎯"
              value={
                stats.highestLevel
                  ? LEVEL_BADGE[stats.highestLevel].label
                  : '—'
              }
              label="Highest Level"
              accent="bg-indigo-50 border-indigo-200"
            />
            <StatCard
              emoji="✅"
              value={`${stats.verified}/${achievements.length}`}
              label="IQAC-Verified"
              accent="bg-emerald-50 border-emerald-200"
            />
          </div>
        )}

        {/* ── Medal Wall ──────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Medal Wall
          </h2>

          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-40 animate-pulse bg-gray-100 rounded-2xl"
                />
              ))}
            </div>
          ) : !hasMedalWall ? (
            <div className="text-center py-12 bg-amber-50/50 rounded-2xl border border-amber-100">
              <div className="text-5xl mb-3">🏆</div>
              {learnerId ? (
                <>
                  <p className="text-sm font-semibold text-amber-800">
                    Your wall is empty — for now!
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Add your first achievement below.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-amber-800">
                    This wall shows your own achievements
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Your account is not linked to a learner record, so there is
                    nothing to show here.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Group medals by type for ordering — gold/silver/bronze first */}
              {medalTypes
                .filter((t) =>
                  achievements.some((a) => a.achievement_type === t),
                )
                .map((type) => {
                  const group = achievements.filter(
                    (a) => a.achievement_type === type,
                  );
                  const typeInfo = ACHIEVEMENT_TYPES.find(
                    (t) => t.value === type,
                  );
                  return (
                    <div key={type} className="mb-5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <span>{typeInfo?.emoji}</span>
                        {typeInfo?.label} ({group.length})
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {group.map((a) => (
                          <MedalCard key={a.id} achievement={a} />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </>
          )}
        </div>

        {/* ── Add Achievement Form ────────────────────────────────────────── */}
        {learnerId && (
          <AddAchievementForm learnerId={learnerId} onSuccess={loadAchievements} />
        )}

        {/* ── Level Progression Pyramid ───────────────────────────────────── */}
        {!loading && achievements.length > 0 && (
          <LevelPyramid achievements={achievements} />
        )}
      </div>
    </ContentLayout>
  );
}
