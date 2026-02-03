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
import { Plus, Users, Video, Palette, FileText, Wallet } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Production Learners | Solutions Hub',
  description: 'Manage content production learners',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ProductionLearnersPage() {
  // Placeholder data
  const learners = [
    {
      id: '1',
      name: 'Alex Chen',
      email: 'alex@jkkn.ac.in',
      division: 'video',
      skill_level: 'advanced',
      orders_completed: 32,
      total_earnings: 85000,
      is_active: true,
    },
    {
      id: '2',
      name: 'Priya Patel',
      email: 'priya@jkkn.ac.in',
      division: 'design',
      skill_level: 'expert',
      orders_completed: 56,
      total_earnings: 145000,
      is_active: true,
    },
    {
      id: '3',
      name: 'Raj Kumar',
      email: 'raj@jkkn.ac.in',
      division: 'writing',
      skill_level: 'intermediate',
      orders_completed: 18,
      total_earnings: 42000,
      is_active: true,
    },
    {
      id: '4',
      name: 'Sara Johnson',
      email: 'sara@jkkn.ac.in',
      division: 'video',
      skill_level: 'beginner',
      orders_completed: 5,
      total_earnings: 8000,
      is_active: true,
    },
  ];

  const divisionConfig: Record<string, { icon: React.ElementType; color: string }> = {
    video: { icon: Video, color: 'text-blue-600' },
    design: { icon: Palette, color: 'text-purple-600' },
    writing: { icon: FileText, color: 'text-green-600' },
    animation: { icon: Video, color: 'text-orange-600' },
  };

  const levelConfig: Record<string, { label: string; color: string }> = {
    beginner: { label: 'Beginner', color: 'bg-gray-100 text-gray-800' },
    intermediate: { label: 'Intermediate', color: 'bg-blue-100 text-blue-800' },
    advanced: { label: 'Advanced', color: 'bg-green-100 text-green-800' },
    expert: { label: 'Expert', color: 'bg-purple-100 text-purple-800' },
  };

  const stats = {
    total: learners.length,
    active: learners.filter((l) => l.is_active).length,
    totalOrders: learners.reduce((sum, l) => sum + l.orders_completed, 0),
    totalEarnings: learners.reduce((sum, l) => sum + l.total_earnings, 0),
  };

  return (
    <ContentLayout title="Production Learners">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content', href: '/solutions/content' },
          { label: 'Production Learners' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Production Learners</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage content production talent
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Learner
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Learners</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Video className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <FileText className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
                <p className="text-sm text-muted-foreground">Orders Completed</p>
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
            <CardTitle>Production Learners</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>Skill Level</TableHead>
                  <TableHead className="text-center">Completed</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {learners.map((learner) => {
                  const division = divisionConfig[learner.division];
                  const DivisionIcon = division?.icon || FileText;
                  const level = levelConfig[learner.skill_level];

                  return (
                    <TableRow key={learner.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {learner.name.split(' ').map((n) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{learner.name}</p>
                            <p className="text-sm text-muted-foreground">{learner.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DivisionIcon className={`h-4 w-4 ${division?.color}`} />
                          <span className="capitalize">{learner.division}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={level.color}>{level.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {learner.orders_completed}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(learner.total_earnings)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={learner.is_active ? 'default' : 'secondary'}>
                          {learner.is_active ? 'Active' : 'Inactive'}
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
