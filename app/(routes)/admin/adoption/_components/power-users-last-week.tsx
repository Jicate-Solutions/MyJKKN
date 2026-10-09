// ============================================================================
// Power users last week — the weekly report on the super-admin adoption page
// ============================================================================
// Reads the latest adoption_power_user_weeks row (written Mondays 10:50 IST by
// /api/cron/adoption-weekly-power-users) plus each top-10 person's chat agenda
// from ai_jobs.result. The page loads both through loadPowerUsersLastWeek AFTER
// its super-admin check; this component only draws them.
//
// Names appear here and nowhere else (privacy ruling 7: names across colleges
// are for super admins only). Learners who came on one day are COUNTS per
// college, never names.
// ============================================================================

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { ChatAgenda, PowerUser, PowerUsersWeekView } from '@/lib/adoption/power-users';

function college(person: { institution_name: string | null }): string {
  return person.institution_name ?? 'College not recorded';
}

function Agenda({ agenda }: { agenda: ChatAgenda | null | undefined }) {
  if (!agenda) {
    return <span className="text-xs text-muted-foreground">Agenda not ready yet</span>;
  }
  return (
    <div className="space-y-1 text-xs">
      <ol className="list-decimal space-y-0.5 pl-4 text-foreground">
        {agenda.questions.map((question, index) => (
          <li key={`${index}-${question}`}>{question}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1">
        {agenda.topics.map((topic, index) => (
          <span key={`${index}-${topic}`} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            {topic}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PowerUsersLastWeek({ week, agendas, error }: PowerUsersWeekView) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Power users last week</h2>
        <p className="text-xs text-muted-foreground">
          {week
            ? `Week starting Monday ${week.week_start} (IST). Worked out on ${week.computed_at.slice(0, 10)}.`
            : 'Worked out every Monday at 10:50 IST for the week that just ended.'}{' '}
          Ranked by how many different parts of MyJKKN each person used, then records saved.
          Super admins, test accounts and the colleges left out in the platform policy
          <code className="mx-1 rounded bg-muted px-1 py-0.5">
            adoption.power_users.exclude_institution_ids
          </code>
          are not counted. The chat agendas are written by the AI from each person&rsquo;s own
          usage only.
        </p>
      </div>

      {error ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Part of this report could not be read: {error}
        </p>
      ) : null}

      {!week ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          No weekly report yet. The first one is made on a Monday at 10:50 IST.
        </div>
      ) : (
        <>
          {week.payload.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody used MyJKKN that week.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>College</TableHead>
                    <TableHead className="text-right">Features used</TableHead>
                    <TableHead className="text-right">Records saved</TableHead>
                    <TableHead className="text-right">Active days</TableHead>
                    <TableHead>Chat agenda</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {week.payload.top.map((person: PowerUser, index: number) => (
                    <TableRow key={person.user_id}>
                      <TableCell className="align-top text-sm tabular-nums">{index + 1}</TableCell>
                      <TableCell className="align-top text-sm">
                        <span className="font-medium text-foreground">
                          {person.full_name ?? 'Name not recorded'}
                        </span>
                        {person.is_new ? (
                          <Badge variant="outline" className="ml-2 text-green-700 dark:text-emerald-400">
                            NEW
                          </Badge>
                        ) : null}
                        {person.role ? (
                          <div className="text-xs text-muted-foreground">{person.role}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top text-sm">{college(person)}</TableCell>
                      <TableCell className="align-top text-right text-sm tabular-nums">
                        {person.features_used}
                      </TableCell>
                      <TableCell className="align-top text-right text-sm tabular-nums">
                        {person.records_saved}
                      </TableCell>
                      <TableCell className="align-top text-right text-sm tabular-nums">
                        {person.active_days}
                      </TableCell>
                      <TableCell className="min-w-64 align-top">
                        <Agenda agenda={agendas[person.user_id]} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-foreground">Came on one day only</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Up to 5 people outside the learner role: one active day that week, an account
                older than a week, and not back since.
              </p>
              {week.payload.one_day_staff.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody this week.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {week.payload.one_day_staff.map((person) => (
                    <li key={person.user_id}>
                      <span className="font-medium text-foreground">
                        {person.full_name ?? 'Name not recorded'}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {college(person)} · {person.features_used} features
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Learners who came on one day</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Counts per college only — no names.
              </p>
              {week.payload.one_day_learners_by_college.length === 0 ? (
                <p className="text-sm text-muted-foreground">None this week.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {week.payload.one_day_learners_by_college.map((row) => (
                    <li key={row.institution_id ?? 'none'} className="flex justify-between gap-4">
                      <span className="text-foreground">{college(row)}</span>
                      <span className="tabular-nums text-muted-foreground">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
