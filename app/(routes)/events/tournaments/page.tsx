'use client';

// Student-facing tournament browse + register page (2026-07-10).
// Shows tournaments the learner may enter — never entries, payments, budget or
// sponsors (those live on the admin subtree behind sports.tournaments.view).
// Registration hands off to the existing public self-service endpoint, which
// enforces the open window and eligibility (students-only / gender / age)
// server-side and auto-links a logged-in learner's profile.

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Trophy,
  Calendar,
  MapPin,
  Search,
  Globe,
  Building2,
  ChevronDown,
  ChevronUp,
  Users,
  User,
  IndianRupee,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { useOpenTournaments, type OpenTournament } from '@/hooks/events/use-open-tournaments';
import { TEAM_SPORTS } from '@/types/health-sports';

function divisionLabel(d: OpenTournament['divisions'][number]): string {
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
    .filter(Boolean)
    .join(' · ');
}

function RegistrationBadge({ t }: { t: OpenTournament }) {
  if (t.is_registration_open) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        Open for registration
      </Badge>
    );
  }
  const notYet =
    t.registration_open_date && new Date(t.registration_open_date) > new Date();
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" />
      {notYet ? 'Opens soon' : 'Registration closed'}
    </Badge>
  );
}

function TournamentCard({ t }: { t: OpenTournament }) {
  const [open, setOpen] = useState(false);
  const divisions = t.divisions ?? [];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/50">
            <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold leading-tight">{t.name}</h3>
              <RegistrationBadge t={t} />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {t.start_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(t.start_date), 'd MMM yyyy')}
                  {t.end_date && t.end_date !== t.start_date &&
                    ` – ${format(new Date(t.end_date), 'd MMM yyyy')}`}
                </span>
              )}
              {t.venue && (
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3" />
                  {t.venue}
                </span>
              )}
              <span className="flex items-center gap-1">
                {t.scope === 'all_jkkn' ? (
                  <>
                    <Globe className="h-3 w-3" /> All JKKN
                  </>
                ) : (
                  <>
                    <Building2 className="h-3 w-3" /> Institution
                  </>
                )}
              </span>
              {t.registration_close_date && t.is_registration_open && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Closes {format(new Date(t.registration_close_date), 'd MMM')}
                </span>
              )}
            </div>

            {t.description && (
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={!t.is_registration_open}
                onClick={() => window.open(`/p/tournament/${t.id}/register`, '_blank', 'noopener')}
                title={
                  t.is_registration_open
                    ? 'Open the registration form'
                    : 'Registration is not open for this tournament'
                }
              >
                Register
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`/p/tournament/${t.id}`, '_blank', 'noopener')}
              >
                Scoreboard
              </Button>
              {divisions.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-xs"
                  aria-expanded={open}
                  onClick={() => setOpen((v) => !v)}
                >
                  {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {divisions.length} {divisions.length === 1 ? 'category' : 'categories'}
                </Button>
              )}
            </div>

            {open && divisions.length > 0 && (
              <div className="mt-3 divide-y rounded-lg border">
                {divisions.map((d) => {
                  const isTeam = (TEAM_SPORTS as readonly string[]).includes(d.sport);
                  return (
                    <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      {isTeam ? (
                        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{divisionLabel(d)}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                        {d.format.replace('_', ' ')}
                      </Badge>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {d.entry_fee > 0 ? (
                          <span className="flex items-center">
                            <IndianRupee className="h-3 w-3" />
                            {d.entry_fee.toLocaleString('en-IN')}
                          </span>
                        ) : (
                          'Free'
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BrowseTournamentsPage() {
  const { data: tournaments, isLoading, error } = useOpenTournaments();
  const [search, setSearch] = useState('');

  const { open, upcoming } = useMemo(() => {
    const list = tournaments ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.venue ?? '').toLowerCase().includes(q) ||
            (t.divisions ?? []).some((d) => d.sport.toLowerCase().includes(q))
        )
      : list;
    return {
      open: filtered.filter((t) => t.is_registration_open),
      upcoming: filtered.filter((t) => !t.is_registration_open),
    };
  }, [tournaments, search]);

  return (
    <ContentLayout title="Tournaments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Tournaments' },
        ]}
      />

      <div className="mt-4 space-y-5">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, sport or venue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center text-destructive">
              Could not load tournaments. Please refresh and try again.
            </CardContent>
          </Card>
        ) : open.length === 0 && upcoming.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Trophy className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No tournaments right now</p>
                <p className="text-sm text-muted-foreground">
                  When your institution opens a tournament, it will appear here.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {open.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Open for registration ({open.length})
                </h2>
                {open.map((t) => (
                  <TournamentCard key={t.id} t={t} />
                ))}
              </section>
            )}
            {upcoming.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Other tournaments ({upcoming.length})
                </h2>
                {upcoming.map((t) => (
                  <TournamentCard key={t.id} t={t} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
