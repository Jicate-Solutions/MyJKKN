'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
  Search,
  LogIn,
  LogOut,
  AlertTriangle,
  Download,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useHostelAccessLogs } from '@/hooks/campus-living/use-hostel-access-log';
import { BlockSelector } from '@/components/campus-living/block-selector';

export default function AccessLogPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const filters = useMemo(
    () => ({
      block_id: blockFilter !== 'all' ? blockFilter : undefined,
      direction:
        typeFilter === 'entry' || typeFilter === 'exit' ? typeFilter : undefined,
      is_flagged: typeFilter === 'flagged' ? true : undefined,
      date_from: selectedDate || undefined,
      date_to: selectedDate || undefined,
    }),
    [blockFilter, typeFilter, selectedDate]
  );

  const { data, isLoading } = useHostelAccessLogs(institutionId, filters);
  const records = data?.data ?? [];

  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    const q = searchQuery.toLowerCase();
    return records.filter((r) => {
      return (
        (r.person_name ?? '').toLowerCase().includes(q) ||
        (r.person_id ?? '').toLowerCase().includes(q) ||
        (r.gate_id ?? '').toLowerCase().includes(q)
      );
    });
  }, [records, searchQuery]);

  const stats = useMemo(
    () => ({
      entries: records.filter((r) => r.direction === 'entry').length,
      exits: records.filter((r) => r.direction === 'exit').length,
      flagged: records.filter((r) => r.is_flagged).length,
    }),
    [records]
  );

  return (
    <ContentLayout title="Access Log">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Gate Access Log</h1>
            <p className="text-muted-foreground">
              Entry and exit records for all hostel gates
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              toast.info('Access-log export ships next.', {
                description:
                  'CSV export will be available once the report endpoint is live.',
              })
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Export Log
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Entries</p>
              <p className="text-2xl font-bold">{stats.entries}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Exits</p>
              <p className="text-2xl font-bold">{stats.exits}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Currently Outside</p>
              <p className="text-2xl font-bold text-blue-600">
                {Math.max(stats.exits - stats.entries, 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Flagged Entries</p>
              <p className="text-2xl font-bold text-red-600">{stats.flagged}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, ID, or gate..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-[180px]"
              />
              {institutionId && (
                <BlockSelector
                  institutionId={institutionId}
                  value={blockFilter}
                  onValueChange={setBlockFilter}
                />
              )}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="entry">Entry Only</SelectItem>
                  <SelectItem value="exit">Exit Only</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading access log…
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No access log entries for the selected filters.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Person Type</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Gate</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Flag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow
                      key={record.id}
                      className={record.is_flagged ? 'bg-red-50' : ''}
                    >
                      <TableCell className="font-medium">
                        {record.person_name ?? '—'}
                      </TableCell>
                      <TableCell className="capitalize text-sm">
                        {record.person_type}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            record.direction === 'entry' ? 'default' : 'secondary'
                          }
                        >
                          {record.direction === 'entry' ? (
                            <LogIn className="mr-1 h-3 w-3" />
                          ) : (
                            <LogOut className="mr-1 h-3 w-3" />
                          )}
                          {record.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize text-sm">
                        {record.method.replace('_', ' ')}
                      </TableCell>
                      <TableCell>{record.gate_id ?? '—'}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(record.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {record.is_flagged && (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {record.flag_reason || 'Flagged'}
                          </Badge>
                        )}
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
