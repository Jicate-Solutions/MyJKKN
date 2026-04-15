'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, ArrowLeft, UserPlus, Search, Users, Clock, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useExportReport } from '@/hooks/campus-living/use-campus-living-reports';

export default function VisitorRegisterReportPage() {
  const { profile } = useAuth();
  const exportReport = useExportReport();
  const summaryStats = [
    { label: 'Total Visitors Today', value: '24', icon: Users },
    { label: 'Currently Inside', value: '3', icon: UserPlus },
    { label: 'Avg Visit Duration', value: '47 min', icon: Clock },
  ];

  const visitorData = [
    { date: '2026-02-21', name: 'Rajesh Kumar', relation: 'Father', student: 'Arun Kumar (CSE-3A)', purpose: 'Parent Visit', checkIn: '09:15 AM', checkOut: '10:30 AM', duration: '1h 15m', block: 'Block A' },
    { date: '2026-02-21', name: 'Priya Sharma', relation: 'Mother', student: 'Neha Sharma (ECE-2B)', purpose: 'Medical Emergency', checkIn: '10:00 AM', checkOut: '11:45 AM', duration: '1h 45m', block: 'Block C' },
    { date: '2026-02-21', name: 'Suresh Patel', relation: 'Uncle', student: 'Ravi Patel (MECH-4A)', purpose: 'Document Delivery', checkIn: '11:30 AM', checkOut: '12:00 PM', duration: '30m', block: 'Block B' },
    { date: '2026-02-21', name: 'Lakshmi Devi', relation: 'Mother', student: 'Karthik R (IT-1A)', purpose: 'Parent Visit', checkIn: '02:00 PM', checkOut: '03:30 PM', duration: '1h 30m', block: 'Block A' },
    { date: '2026-02-20', name: 'Ahmed Khan', relation: 'Brother', student: 'Fatima Khan (CSE-2A)', purpose: 'Personal', checkIn: '09:30 AM', checkOut: '10:15 AM', duration: '45m', block: 'Block C' },
    { date: '2026-02-20', name: 'Meena R', relation: 'Mother', student: 'Divya R (ECE-3B)', purpose: 'Parent Visit', checkIn: '10:45 AM', checkOut: '12:30 PM', duration: '1h 45m', block: 'Block C' },
    { date: '2026-02-20', name: 'Venkatesh S', relation: 'Father', student: 'Sathish V (MECH-2A)', purpose: 'Fee Payment', checkIn: '01:00 PM', checkOut: '01:30 PM', duration: '30m', block: 'Block B' },
    { date: '2026-02-20', name: 'Geetha M', relation: 'Guardian', student: 'Manoj M (IT-3A)', purpose: 'Academic Discussion', checkIn: '03:00 PM', checkOut: '--', duration: 'In campus', block: 'Block A' },
  ];

  return (
    <ContentLayout title="Visitor Register Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/campus-living/reports">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Visitor Register Report</h1>
              <p className="text-muted-foreground">NCPCR-compliant visitor log with check-in/check-out records</p>
            </div>
          </div>
          <Button
            disabled={exportReport.isPending}
            onClick={() => exportReport.mutate({
              institutionId: profile?.institution_id ?? '',
              reportType: 'visitor',
              format: 'csv',
            })}
          >
            {exportReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {summaryStats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Input type="date" defaultValue="2026-02-15" />
              </div>
              <div className="flex-1">
                <Input type="date" defaultValue="2026-02-21" />
              </div>
              <Select defaultValue="all">
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Block" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  <SelectItem value="block-a">Block A</SelectItem>
                  <SelectItem value="block-b">Block B</SelectItem>
                  <SelectItem value="block-c">Block C</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search visitor or student..." className="pl-9" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Visitor Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Visitor Register
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Visitor Name</TableHead>
                  <TableHead>Relation</TableHead>
                  <TableHead>Student Visited</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitorData.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.relation}</TableCell>
                    <TableCell>{row.student}</TableCell>
                    <TableCell>{row.purpose}</TableCell>
                    <TableCell>{row.block}</TableCell>
                    <TableCell>{row.checkIn}</TableCell>
                    <TableCell>
                      {row.checkOut === '--' ? (
                        <Badge variant="outline" className="text-orange-600 border-orange-300">Still Inside</Badge>
                      ) : row.checkOut}
                    </TableCell>
                    <TableCell>
                      {row.duration === 'In campus' ? (
                        <Badge variant="outline" className="text-orange-600 border-orange-300">In campus</Badge>
                      ) : row.duration}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
