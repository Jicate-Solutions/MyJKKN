'use client';

// Marathon — Mandatory Hosteler Registration Tracking
// Shows which hostelers have/haven't registered for the marathon,
// broken down by institution with drill-down lists for wardens.
//
// Data source: cross-reference learners_profiles (accommodation_type = 'HOSTEL')
// with events_registrations (event_id = marathon event) by phone match.

import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  RefreshCw,
  Search,
  School,
  Users,
  CheckCircle2,
  AlertCircle,
  Phone,
  Download,
  Filter,
  XCircle,
  ArrowRight,
  UserCheck,
  UserX,
} from 'lucide-react';

const supabase = createClientSupabaseClient() as any;

// ============================================================================
// Types
// ============================================================================

interface Hosteler {
  id: string;
  full_name: string;
  roll_number: string | null;
  student_mobile: string | null;
  student_email: string | null;
  gender: string | null;
  hostel_type: string | null;
  father_name: string | null;
  father_mobile: string | null;
  mother_name: string | null;
  mother_mobile: string | null;
  institution_id: string;
  institution_name: string;
  lifecycle_status: string | null;
  is_registered: boolean;
  phone_quality: 'valid' | 'fake' | 'missing';
}

interface InstitutionStats {
  institution_id: string;
  institution_name: string;
  total: number;
  registered: number;
  pending: number;
  pct_complete: number;
  valid_phones: number;
  fake_phones: number;
  missing_phones: number;
  male: number;
  female: number;
}

// ============================================================================
// Helper functions
// ============================================================================

function classifyPhone(phone: string | null): 'valid' | 'fake' | 'missing' {
  if (!phone || phone.trim() === '') return 'missing';
  if (phone.startsWith('98765432')) return 'fake';
  return 'valid';
}

function exportToCsv(data: Hosteler[], filename: string) {
  const headers = [
    'Institution',
    'Name',
    'Roll No',
    'Gender',
    'Hostel Type',
    'Mobile',
    'Email',
    'Father Name',
    'Father Mobile',
    'Mother Name',
    'Mother Mobile',
    'Registered',
    'Phone Quality',
  ];
  const rows = data.map((h) => [
    h.institution_name,
    h.full_name,
    h.roll_number || '',
    h.gender || '',
    h.hostel_type || '',
    h.student_mobile || '',
    h.student_email || '',
    h.father_name || '',
    h.father_mobile || '',
    h.mother_name || '',
    h.mother_mobile || '',
    h.is_registered ? 'YES' : 'NO',
    h.phone_quality,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Main Page
// ============================================================================

export default function MandatoryHostelersPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [hostelers, setHostelers] = useState<Hosteler[]>([]);
  const [filterInst, setFilterInst] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'registered'>('pending');
  const [filterPhone, setFilterPhone] = useState<'all' | 'valid' | 'fake' | 'missing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load data
  async function loadHostelers() {
    setLoading(true);
    try {
      // 1. Get all hostelers from learners_profiles
      const { data: learnerData, error: learnerError } = await supabase
        .from('learners_profiles')
        .select(`
          id,
          first_name,
          last_name,
          roll_number,
          student_mobile,
          student_email,
          gender,
          hostel_type,
          father_name,
          father_mobile,
          mother_name,
          mother_mobile,
          institution_id,
          lifecycle_status,
          institutions!institution_id(name)
        `)
        .eq('accommodation_type', 'HOSTEL');

      if (learnerError) throw learnerError;

      // 2. Get registered phone numbers for this event
      const { data: regData, error: regError } = await supabase
        .from('events_registrations')
        .select('participant_phone')
        .eq('event_id', eventId)
        .not('participant_phone', 'is', null);

      if (regError) throw regError;

      const registeredPhones = new Set((regData || []).map((r: any) => r.participant_phone));

      // 3. Merge and classify
      const merged: Hosteler[] = (learnerData || []).map((row: any) => ({
        id: row.id,
        full_name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        roll_number: row.roll_number,
        student_mobile: row.student_mobile,
        student_email: row.student_email,
        gender: row.gender,
        hostel_type: row.hostel_type,
        father_name: row.father_name,
        father_mobile: row.father_mobile,
        mother_name: row.mother_name,
        mother_mobile: row.mother_mobile,
        institution_id: row.institution_id,
        institution_name: row.institutions?.name || 'Unknown',
        lifecycle_status: row.lifecycle_status,
        is_registered: row.student_mobile ? registeredPhones.has(row.student_mobile) : false,
        phone_quality: classifyPhone(row.student_mobile),
      }));

      setHostelers(merged);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[mandatory-hostelers] Failed to load', err);
    } finally {
      setLoading(false);
    }
  }

  // Initial load + auto-refresh every 30 seconds for live race-day tracking
  useEffect(() => {
    loadHostelers();
    const interval = setInterval(() => {
      loadHostelers();
    }, 30000); // 30 seconds
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Institution-level stats
  const institutionStats = useMemo<InstitutionStats[]>(() => {
    const byInst = new Map<string, Hosteler[]>();
    hostelers.forEach((h) => {
      if (!byInst.has(h.institution_id)) byInst.set(h.institution_id, []);
      byInst.get(h.institution_id)!.push(h);
    });

    return Array.from(byInst.entries())
      .map(([inst_id, rows]) => ({
        institution_id: inst_id,
        institution_name: rows[0].institution_name,
        total: rows.length,
        registered: rows.filter((r) => r.is_registered).length,
        pending: rows.filter((r) => !r.is_registered).length,
        pct_complete:
          rows.length > 0 ? Math.round((rows.filter((r) => r.is_registered).length / rows.length) * 100) : 0,
        valid_phones: rows.filter((r) => !r.is_registered && r.phone_quality === 'valid').length,
        fake_phones: rows.filter((r) => !r.is_registered && r.phone_quality === 'fake').length,
        missing_phones: rows.filter((r) => !r.is_registered && r.phone_quality === 'missing').length,
        male: rows.filter((r) => !r.is_registered && r.gender === 'MALE').length,
        female: rows.filter((r) => !r.is_registered && r.gender === 'FEMALE').length,
      }))
      .sort((a, b) => b.pending - a.pending);
  }, [hostelers]);

  // Filtered list
  const filteredHostelers = useMemo(() => {
    return hostelers.filter((h) => {
      if (filterInst !== 'all' && h.institution_id !== filterInst) return false;
      if (filterStatus === 'pending' && h.is_registered) return false;
      if (filterStatus === 'registered' && !h.is_registered) return false;
      if (filterPhone !== 'all' && h.phone_quality !== filterPhone) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hay = `${h.full_name} ${h.roll_number || ''} ${h.student_mobile || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [hostelers, filterInst, filterStatus, filterPhone, searchQuery]);

  // Grand totals
  const totals = useMemo(() => {
    const t = {
      total: hostelers.length,
      registered: hostelers.filter((h) => h.is_registered).length,
      pending: hostelers.filter((h) => !h.is_registered).length,
      valid_phones: hostelers.filter((h) => !h.is_registered && h.phone_quality === 'valid').length,
      fake_phones: hostelers.filter((h) => !h.is_registered && h.phone_quality === 'fake').length,
      missing_phones: hostelers.filter((h) => !h.is_registered && h.phone_quality === 'missing').length,
    };
    return {
      ...t,
      pct_complete: t.total > 0 ? Math.round((t.registered / t.total) * 100) : 0,
    };
  }, [hostelers]);

  if (loading && hostelers.length === 0) {
    return (
      <ContentLayout title="Mandatory Hostelers">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Mandatory Hosteler Registration">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mandatory Hosteler Tracking</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Hostelers must register for the marathon. Track who still needs to sign up.
            </p>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live · Last updated: {lastUpdated.toLocaleTimeString()} · Auto-refreshes every 30s
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadHostelers} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1.5">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCsv(filteredHostelers, `hostelers-${filterStatus}-${Date.now()}.csv`)}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Grand total cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Hostelers</span>
              </div>
              <div className="text-3xl font-bold mt-2">{totals.total}</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-700 uppercase tracking-wide">Registered</span>
              </div>
              <div className="text-3xl font-bold text-green-700 mt-2">{totals.registered}</div>
              <div className="text-xs text-green-600 mt-1">{totals.pct_complete}% complete</div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <UserX className="h-4 w-4 text-orange-600" />
                <span className="text-xs text-orange-700 uppercase tracking-wide">Pending</span>
              </div>
              <div className="text-3xl font-bold text-orange-700 mt-2">{totals.pending}</div>
              <div className="text-xs text-orange-600 mt-1">Need to register</div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-blue-700 uppercase tracking-wide">Reachable</span>
              </div>
              <div className="text-3xl font-bold text-blue-700 mt-2">{totals.valid_phones}</div>
              <div className="text-xs text-blue-600 mt-1">
                {totals.fake_phones + totals.missing_phones} bad numbers
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Progress bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Registration Progress</span>
              <span className="text-sm font-bold">
                {totals.registered} / {totals.total}
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all"
                style={{ width: `${totals.pct_complete}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {totals.pending} hostelers still need to register. Follow up via warden outreach or
              bulk auto-register.
            </p>
          </CardContent>
        </Card>

        {/* Institution-level breakdown cards */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <School className="h-5 w-5" />
            By Institution
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {institutionStats.map((inst) => {
              const priority = inst.pending > 50 ? 'HIGH' : inst.pending > 10 ? 'MEDIUM' : 'LOW';
              const priorityColor =
                priority === 'HIGH'
                  ? 'bg-red-100 text-red-700 border-red-200'
                  : priority === 'MEDIUM'
                  ? 'bg-orange-100 text-orange-700 border-orange-200'
                  : 'bg-green-100 text-green-700 border-green-200';

              return (
                <Card
                  key={inst.institution_id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setFilterInst(inst.institution_id)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm leading-tight">{inst.institution_name}</h3>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${priorityColor}`}>
                        {priority}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div>
                        <div className="text-2xl font-bold">{inst.total}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">Total</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">{inst.registered}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">Done</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-orange-600">{inst.pending}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">Pending</div>
                      </div>
                    </div>

                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{inst.pct_complete}% complete</span>
                        <span className="text-muted-foreground">
                          M:{inst.male} F:{inst.female}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            inst.pct_complete >= 80
                              ? 'bg-green-500'
                              : inst.pct_complete >= 50
                              ? 'bg-blue-500'
                              : 'bg-orange-500'
                          }`}
                          style={{ width: `${inst.pct_complete}%` }}
                        />
                      </div>
                    </div>

                    {inst.fake_phones > 0 || inst.missing_phones > 0 ? (
                      <div className="flex items-center gap-1 text-xs text-orange-600">
                        <AlertCircle className="h-3 w-3" />
                        <span>
                          {inst.fake_phones + inst.missing_phones} unreachable (
                          {inst.fake_phones} fake, {inst.missing_phones} missing)
                        </span>
                      </div>
                    ) : null}

                    <Button variant="outline" size="sm" className="w-full h-8 text-xs">
                      View {inst.pending} pending <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Filters</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <Select value={filterInst} onValueChange={setFilterInst}>
                <SelectTrigger>
                  <SelectValue placeholder="Institution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Institutions</SelectItem>
                  {institutionStats.map((inst) => (
                    <SelectItem key={inst.institution_id} value={inst.institution_id}>
                      {inst.institution_name} ({inst.pending})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending Only</SelectItem>
                  <SelectItem value="registered">Registered Only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPhone} onValueChange={(v) => setFilterPhone(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Phone Quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Phones</SelectItem>
                  <SelectItem value="valid">Valid Only</SelectItem>
                  <SelectItem value="fake">Fake Only</SelectItem>
                  <SelectItem value="missing">Missing Only</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search name, roll, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Hostelers ({filteredHostelers.length})</span>
              {filteredHostelers.length !== hostelers.length && (
                <Badge variant="outline" className="text-xs">
                  Filtered from {hostelers.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Roll</th>
                    <th className="px-3 py-2 font-medium">Gender</th>
                    <th className="px-3 py-2 font-medium">Mobile</th>
                    <th className="px-3 py-2 font-medium">Institution</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHostelers.slice(0, 500).map((h) => (
                    <tr key={h.id} className="border-t hover:bg-muted/50">
                      <td className="px-3 py-2">
                        {h.is_registered ? (
                          <Badge className="bg-green-600 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600 border-orange-300 text-[10px]">
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">{h.full_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{h.roll_number || '—'}</td>
                      <td className="px-3 py-2 text-xs">{h.gender || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {h.student_mobile ? (
                          <div className="flex items-center gap-1">
                            <span>{h.student_mobile}</span>
                            {h.phone_quality === 'fake' && (
                              <Badge variant="outline" className="text-[9px] text-red-600 border-red-300">
                                Fake
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-red-500 text-[10px]">MISSING</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                        {h.institution_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredHostelers.length > 500 && (
                <div className="p-3 text-center text-xs text-muted-foreground bg-muted">
                  Showing first 500 of {filteredHostelers.length}. Use filters or export CSV for full list.
                </div>
              )}
              {filteredHostelers.length === 0 && (
                <div className="p-12 text-center">
                  <XCircle className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No hostelers match your filters</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
