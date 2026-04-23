'use client';

import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Stethoscope,
  Plus,
  Search,
  Loader2,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Flame,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useHealthCases } from '@/hooks/campus-living/use-hostel-health';
import { BlockSelector } from '@/components/campus-living/block-selector';

export default function HealthPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const filters = useMemo(
    () => ({
      block_id: blockFilter !== 'all' ? blockFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      severity: severityFilter !== 'all' ? severityFilter : undefined,
    }),
    [blockFilter, statusFilter, severityFilter]
  );

  const { data, isLoading } = useHealthCases(institutionId, filters);
  const cases = data?.data ?? [];

  const filteredCases = cases.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.symptoms ?? '').toLowerCase().includes(q) ||
      (c.notes ?? '').toLowerCase().includes(q) ||
      (c.id ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(
    () => ({
      total: cases.length,
      open: cases.filter((c) => c.status === 'open' || c.status === 'under_treatment').length,
      critical: cases.filter((c) => c.severity === 'high' || c.severity === 'critical').length,
      recovered: cases.filter((c) => c.status === 'recovered' || c.status === 'closed').length,
    }),
    [cases]
  );

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><Flame className="mr-1 h-3 w-3" />Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><AlertTriangle className="mr-1 h-3 w-3" />High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Medium</Badge>;
      case 'low':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Low</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="outline"><AlertTriangle className="mr-1 h-3 w-3" />Open</Badge>;
      case 'under_treatment':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Activity className="mr-1 h-3 w-3" />Under Treatment</Badge>;
      case 'recovered':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Recovered</Badge>;
      case 'referred':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Referred</Badge>;
      case 'closed':
        return <Badge variant="outline" className="text-muted-foreground">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Health Cases">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Health' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Stethoscope className="h-6 w-6 text-primary" />
              Resident Health Cases
            </h1>
            <p className="text-muted-foreground">
              Log illnesses, track treatment and monitor recovery for hostel residents.
            </p>
          </div>
          <Button
            onClick={() =>
              toast.info('Inline log-case dialog ships next.', {
                description: 'Health-case logging UI is being wired in a follow-up PR.',
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Log Case
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Open / Under Treatment</p>
              <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">High / Critical</p>
              <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Recovered</p>
              <p className="text-2xl font-bold text-green-600">{stats.recovered}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cases…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <BlockSelector
                institutionId={institutionId}
                value={blockFilter}
                onValueChange={setBlockFilter}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="under_treatment">Under Treatment</SelectItem>
                  <SelectItem value="recovered">Recovered</SelectItem>
                  <SelectItem value="referred">Referred</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="py-16 text-center">
                <Stethoscope className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No health cases logged</h3>
                <p className="text-sm text-muted-foreground">
                  Log a case to start tracking a resident's treatment.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case ID</TableHead>
                    <TableHead>Symptoms</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reported</TableHead>
                    <TableHead>Recovered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.id.slice(0, 8)}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-sm">
                        {c.symptoms ?? '—'}
                      </TableCell>
                      <TableCell>{getSeverityBadge(c.severity)}</TableCell>
                      <TableCell>{getStatusBadge(c.status)}</TableCell>
                      <TableCell>
                        {c.reported_at
                          ? new Date(c.reported_at).toLocaleDateString()
                          : new Date(c.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {c.recovered_on ? new Date(c.recovered_on).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
