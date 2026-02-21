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
import { Download, ArrowLeft, IndianRupee, TrendingUp, AlertCircle, CheckCircle2, Search, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useExportReport } from '@/hooks/campus-living/use-campus-living-reports';

export default function FeeCollectionReportPage() {
  const { profile } = useAuth();
  const exportReport = useExportReport();
  const formatCurrency = (amount: number) =>
    amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  const summaryStats = [
    { label: 'Total Billed', value: formatCurrency(1_28_40_000), icon: IndianRupee, color: 'text-blue-600' },
    { label: 'Collected', value: formatCurrency(1_05_60_000), icon: CheckCircle2, color: 'text-green-600' },
    { label: 'Outstanding', value: formatCurrency(22_80_000), icon: AlertCircle, color: 'text-red-600' },
    { label: 'Collection Rate', value: '82.2%', icon: TrendingUp, color: 'text-primary' },
  ];

  const studentData = [
    { name: 'Arun Kumar', regNo: 'CSE21001', block: 'Block A', room: 'A-201', feeType: 'Hostel + Mess', billed: 121000, paid: 121000, balance: 0, status: 'Paid' },
    { name: 'Neha Sharma', regNo: 'ECE21034', block: 'Block C', room: 'C-105', feeType: 'Hostel + Mess', billed: 106000, paid: 80000, balance: 26000, status: 'Partial' },
    { name: 'Ravi Patel', regNo: 'MECH21015', block: 'Block B', room: 'B-312', feeType: 'Hostel + Mess', billed: 96000, paid: 96000, balance: 0, status: 'Paid' },
    { name: 'Karthik R', regNo: 'IT21042', block: 'Block A', room: 'A-108', feeType: 'Hostel Only', billed: 45000, paid: 0, balance: 45000, status: 'Unpaid' },
    { name: 'Fatima Khan', regNo: 'CSE22018', block: 'Block C', room: 'C-210', feeType: 'Hostel + Mess', billed: 106000, paid: 106000, balance: 0, status: 'Paid' },
    { name: 'Divya R', regNo: 'ECE22009', block: 'Block C', room: 'C-303', feeType: 'Hostel + Mess', billed: 121000, paid: 60000, balance: 61000, status: 'Partial' },
    { name: 'Sathish V', regNo: 'MECH22021', block: 'Block B', room: 'B-205', feeType: 'Mess Only', billed: 54000, paid: 54000, balance: 0, status: 'Paid' },
    { name: 'Manoj M', regNo: 'IT22033', block: 'Block A', room: 'A-415', feeType: 'Hostel + Mess', billed: 96000, paid: 0, balance: 96000, status: 'Unpaid' },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
      case 'Partial':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Partial</Badge>;
      case 'Unpaid':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Unpaid</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Fee Collection Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/campus-living/reports">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Fee Collection Report</h1>
              <p className="text-muted-foreground">Hostel and mess fee collection summary with defaulter tracking</p>
            </div>
          </div>
          <Button
            disabled={exportReport.isPending}
            onClick={() => exportReport.mutate({
              institutionId: profile?.institution_id ?? '',
              reportType: 'fee-collection',
              format: 'json',
            })}
          >
            {exportReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Report
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryStats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
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
                <Input type="date" defaultValue="2026-01-01" />
              </div>
              <div className="flex-1">
                <Input type="date" defaultValue="2026-02-21" />
              </div>
              <Select defaultValue="all-blocks">
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Block" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-blocks">All Blocks</SelectItem>
                  <SelectItem value="block-a">Block A</SelectItem>
                  <SelectItem value="block-b">Block B</SelectItem>
                  <SelectItem value="block-c">Block C</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all-fees">
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Fee Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-fees">All Fees</SelectItem>
                  <SelectItem value="hostel">Hostel Only</SelectItem>
                  <SelectItem value="mess">Mess Only</SelectItem>
                  <SelectItem value="both">Hostel + Mess</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all-status">
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-status">All Status</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search student..." className="pl-9" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student Fee Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              Student-wise Fee Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Reg No</TableHead>
                  <TableHead>Block / Room</TableHead>
                  <TableHead>Fee Type</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentData.map((row) => (
                  <TableRow key={row.regNo}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-mono text-sm">{row.regNo}</TableCell>
                    <TableCell>{row.block} / {row.room}</TableCell>
                    <TableCell>{row.feeType}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.billed)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.paid)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {row.balance > 0 ? (
                        <span className="text-red-600">{formatCurrency(row.balance)}</span>
                      ) : (
                        formatCurrency(0)
                      )}
                    </TableCell>
                    <TableCell className="text-center">{getStatusBadge(row.status)}</TableCell>
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
