'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Star,
  Phone,
  Mail,
  MapPin,
  FileText,
  CalendarDays,
  Edit,
  Building2,
} from 'lucide-react';

interface CatererDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CatererDetailPage({ params }: CatererDetailPageProps) {
  const { id } = use(params);

  // TODO: Replace with actual hook
  // const { data: caterer, isLoading } = useMessCaterer(id);

  const caterer = {
    id,
    name: 'Annapurna Catering Services',
    contact_person: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    email: 'rajesh@annapurna.com',
    address: '45, Industrial Area, Kovilpatti, Tamil Nadu - 628502',
    fssai_number: 'FSSAI-12345678901234',
    fssai_expiry: '2027-03-15',
    gst_number: 'GST33AABCT1234A1ZP',
    contract_start: '2025-06-01',
    contract_end: '2026-05-31',
    status: 'active',
    assigned_blocks: ['Block A', 'Block B'],
    performance_score: 4.2,
    monthly_rate: 4500,
    total_students: 320,
  };

  const performanceHistory = [
    { month: 'Jan 2026', score: 4.1, complaints: 3, meals_served: 9600 },
    { month: 'Dec 2025', score: 4.3, complaints: 1, meals_served: 9800 },
    { month: 'Nov 2025', score: 3.9, complaints: 5, meals_served: 9500 },
    { month: 'Oct 2025', score: 4.2, complaints: 2, meals_served: 9700 },
  ];

  const assignedBlocks = [
    { block: 'Block A', students: 180, meals: ['Breakfast', 'Lunch', 'Dinner'] },
    { block: 'Block B', students: 140, meals: ['Breakfast', 'Lunch', 'Dinner'] },
  ];

  return (
    <ContentLayout title="Caterer Details">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/mess/caterers">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{caterer.name}</h1>
              <p className="text-muted-foreground">{caterer.contact_person}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge className={caterer.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}>
              {caterer.status === 'active' ? 'Active' : caterer.status}
            </Badge>
            <Button variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Star className="h-4 w-4" />
                Performance Score
              </div>
              <div className="text-2xl font-bold">
                {caterer.performance_score}
                <span className="text-sm text-muted-foreground font-normal"> / 5</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Building2 className="h-4 w-4" />
                Assigned Blocks
              </div>
              <div className="text-2xl font-bold">{caterer.assigned_blocks.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CalendarDays className="h-4 w-4" />
                Contract Ends
              </div>
              <div className="text-lg font-bold">
                {new Date(caterer.contract_end).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                Monthly Rate
              </div>
              <div className="text-2xl font-bold">
                {caterer.monthly_rate.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="blocks">Assigned Blocks</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{caterer.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{caterer.email}</span>
                </div>
                <div className="flex items-start gap-2 sm:col-span-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>{caterer.address}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compliance & Licenses</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">FSSAI Number</p>
                  <p className="font-medium">{caterer.fssai_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">FSSAI Expiry</p>
                  <p className="font-medium">{new Date(caterer.fssai_expiry).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">GST Number</p>
                  <p className="font-medium">{caterer.gst_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contract Period</p>
                  <p className="font-medium">
                    {new Date(caterer.contract_start).toLocaleDateString()} -{' '}
                    {new Date(caterer.contract_end).toLocaleDateString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="blocks">
            <Card>
              <CardHeader>
                <CardTitle>Assigned Hostel Blocks</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Block</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead>Meals Covered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignedBlocks.map((block) => (
                      <TableRow key={block.block}>
                        <TableCell className="font-medium">{block.block}</TableCell>
                        <TableCell>{block.students}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {block.meals.map((meal) => (
                              <Badge key={meal} variant="outline">{meal}</Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance">
            <Card>
              <CardHeader>
                <CardTitle>Performance History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Complaints</TableHead>
                      <TableHead>Meals Served</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performanceHistory.map((record) => (
                      <TableRow key={record.month}>
                        <TableCell className="font-medium">{record.month}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            {record.score}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={record.complaints > 3 ? 'destructive' : 'outline'}>
                            {record.complaints}
                          </Badge>
                        </TableCell>
                        <TableCell>{record.meals_served.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
