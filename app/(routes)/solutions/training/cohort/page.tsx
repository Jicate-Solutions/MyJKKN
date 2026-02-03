import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Users, Star, GraduationCap, Wallet } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Cohort Management | Solutions Hub',
  description: 'Manage training cohort members',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CohortPage() {
  // Placeholder data
  const cohortMembers = [
    {
      id: '1',
      name: 'Dr. Sarah Wilson',
      email: 'sarah@jkkn.ac.in',
      department: { name: 'Computer Science' },
      level: 'master',
      track: 'AI/ML',
      sessions_led: 45,
      sessions_co_led: 20,
      total_earnings: 320000,
      is_active: true,
    },
    {
      id: '2',
      name: 'Prof. James Kumar',
      email: 'james@jkkn.ac.in',
      department: { name: 'IT' },
      level: 'lead',
      track: 'Web Development',
      sessions_led: 28,
      sessions_co_led: 15,
      total_earnings: 180000,
      is_active: true,
    },
    {
      id: '3',
      name: 'Ms. Priya Sharma',
      email: 'priya@jkkn.ac.in',
      department: { name: 'ECE' },
      level: 'co_lead',
      track: 'IoT',
      sessions_led: 5,
      sessions_co_led: 22,
      total_earnings: 75000,
      is_active: true,
    },
    {
      id: '4',
      name: 'Mr. Ravi Patel',
      email: 'ravi@jkkn.ac.in',
      department: { name: 'Computer Science' },
      level: 'observer',
      track: 'Data Science',
      sessions_led: 0,
      sessions_co_led: 8,
      total_earnings: 12000,
      is_active: true,
    },
  ];

  const levelConfig: Record<string, { label: string; color: string }> = {
    observer: { label: 'Observer', color: 'bg-gray-100 text-gray-800' },
    co_lead: { label: 'Co-Lead', color: 'bg-blue-100 text-blue-800' },
    lead: { label: 'Lead', color: 'bg-green-100 text-green-800' },
    master: { label: 'Master', color: 'bg-purple-100 text-purple-800' },
  };

  const stats = {
    total: cohortMembers.length,
    masters: cohortMembers.filter((m) => m.level === 'master').length,
    leads: cohortMembers.filter((m) => m.level === 'lead').length,
    totalEarnings: cohortMembers.reduce((sum, m) => sum + m.total_earnings, 0),
  };

  return (
    <ContentLayout title="Cohort Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Training', href: '/solutions/training' },
          { label: 'Cohort' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Cohort Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage training cohort members and their progress
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Member
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Members</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Star className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{stats.masters}</p>
                <p className="text-sm text-muted-foreground">Masters</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <GraduationCap className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.leads}</p>
                <p className="text-sm text-muted-foreground">Leads</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Wallet className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalEarnings)}</p>
                <p className="text-sm text-muted-foreground">Total Paid</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Cohort Members</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Track</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-center">Sessions Led</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohortMembers.map((member) => {
                  const level = levelConfig[member.level];
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {member.name.split(' ').map((n) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-sm text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{member.department.name}</TableCell>
                      <TableCell>{member.track}</TableCell>
                      <TableCell>
                        <Badge className={level.color}>{level.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div>
                          <span className="font-medium">{member.sessions_led}</span>
                          <span className="text-muted-foreground"> led, </span>
                          <span>{member.sessions_co_led}</span>
                          <span className="text-muted-foreground"> co-led</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(member.total_earnings)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.is_active ? 'default' : 'secondary'}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
