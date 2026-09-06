'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMentorRollups } from '@/hooks/cdc/use-cdc-mentor-rollups';
import { ArrowLeft, Activity } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { useTabParam } from '@/hooks/use-tab-param';

const MENTOR_ROLLUPS_TABS = ['mentors', 'mentees'] as const;

function fmtMinutes(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString() : '—';
}

function MentorRollupsPageInner() {
  const { data, isLoading, error } = useMentorRollups();
  const [activeTab, setActiveTab] = useTabParam('mentors', MENTOR_ROLLUPS_TABS);

  return (
    <PermissionGuard module="cdc.mentors" action="view">
      <ContentLayout title="Mentoring Activity">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/cdc">CDC</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/cdc/mentors">Mentor Pairings</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Activity</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Activity className="w-6 h-6 text-blue-600" />
              Mentoring Activity
            </h1>
            <Button variant="outline" asChild>
              <Link href="/cdc/mentors"><ArrowLeft className="w-4 h-4 mr-1" />Back to Pairings</Link>
            </Button>
          </div>
          <p className="text-sm text-gray-500">
            Sessions rolled up per mentor and per mentee across all their pairings. These totals stay
            scoped to your college; the{' '}
            <Link href="/cdc/mentors" className="underline hover:text-gray-700">Pairings list</Link>{' '}
            shows pairings across all colleges.
          </p>

          {isLoading && (
            <div className="flex justify-center py-12"><BeatLoader color="#3b82f6" /></div>
          )}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="py-4 text-red-700">
                Failed to load activity: {error.message}
              </CardContent>
            </Card>
          )}

          {!isLoading && !error && data && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList>
                <TabsTrigger value="mentors">
                  Mentors ({data.peerMentors.length + data.industryMentors.length})
                </TabsTrigger>
                <TabsTrigger value="mentees">Mentees ({data.mentees.length})</TabsTrigger>
              </TabsList>

              {/* ── Mentors ── */}
              <TabsContent value="mentors" className="space-y-6">
                <section>
                  <h2 className="text-sm font-semibold text-gray-700 mb-2">Peer Mentors</h2>
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mentor</TableHead>
                            <TableHead className="text-right">Mentees</TableHead>
                            <TableHead className="text-right">Active</TableHead>
                            <TableHead className="text-right">Sessions</TableHead>
                            <TableHead className="text-right">Time</TableHead>
                            <TableHead className="text-right">Last session</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.peerMentors.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">No peer mentoring recorded yet.</TableCell></TableRow>
                          ) : data.peerMentors.map((m) => (
                            <TableRow key={m.mentor_learner_id}>
                              <TableCell>
                                <div className="font-medium">{m.name}</div>
                                {m.register_number && <div className="text-xs text-gray-500">{m.register_number}</div>}
                              </TableCell>
                              <TableCell className="text-right">{m.mentee_count}</TableCell>
                              <TableCell className="text-right">{m.active_pairing_count}</TableCell>
                              <TableCell className="text-right">{m.session_count}</TableCell>
                              <TableCell className="text-right">{fmtMinutes(m.total_minutes)}</TableCell>
                              <TableCell className="text-right">{fmtDate(m.last_session_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </section>

                <section>
                  <h2 className="text-sm font-semibold text-gray-700 mb-2">Industry Mentors</h2>
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mentor</TableHead>
                            <TableHead className="text-right">Mentees</TableHead>
                            <TableHead className="text-right">Active</TableHead>
                            <TableHead className="text-right">Sessions</TableHead>
                            <TableHead className="text-right">Time</TableHead>
                            <TableHead className="text-right">Last session</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.industryMentors.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">No industry mentoring recorded yet.</TableCell></TableRow>
                          ) : data.industryMentors.map((m) => (
                            <TableRow key={m.industry_mentor_id}>
                              <TableCell>
                                <div className="font-medium">{m.mentor_name}</div>
                                {m.company_name && <div className="text-xs text-gray-500">{m.company_name}</div>}
                              </TableCell>
                              <TableCell className="text-right">{m.mentee_count}</TableCell>
                              <TableCell className="text-right">{m.active_pairing_count}</TableCell>
                              <TableCell className="text-right">{m.session_count}</TableCell>
                              <TableCell className="text-right">{fmtMinutes(m.total_minutes)}</TableCell>
                              <TableCell className="text-right">{fmtDate(m.last_session_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </section>
              </TabsContent>

              {/* ── Mentees ── */}
              <TabsContent value="mentees">
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mentee</TableHead>
                          <TableHead className="text-right">Peer mentors</TableHead>
                          <TableHead className="text-right">Industry mentors</TableHead>
                          <TableHead className="text-right">Sessions</TableHead>
                          <TableHead className="text-right">Time</TableHead>
                          <TableHead className="text-right">Last session</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.mentees.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">No mentoring received yet.</TableCell></TableRow>
                        ) : data.mentees.map((m) => (
                          <TableRow key={m.mentee_learner_id}>
                            <TableCell>
                              <div className="font-medium">{m.name}</div>
                              {m.register_number && <div className="text-xs text-gray-500">{m.register_number}</div>}
                            </TableCell>
                            <TableCell className="text-right">{m.peer_mentor_count}</TableCell>
                            <TableCell className="text-right">{m.industry_mentor_count}</TableCell>
                            <TableCell className="text-right">{m.total_session_count}</TableCell>
                            <TableCell className="text-right">{fmtMinutes(m.total_minutes)}</TableCell>
                            <TableCell className="text-right">{fmtDate(m.last_session_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function MentorRollupsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <MentorRollupsPageInner />
    </Suspense>
  );
}
