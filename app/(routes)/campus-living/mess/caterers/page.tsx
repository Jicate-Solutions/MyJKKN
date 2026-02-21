'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Search,
  ChefHat,
  Star,
  FileText,
  Phone,
} from 'lucide-react';
import { useState } from 'react';

export default function CaterersPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // TODO: Replace with actual hook
  // const { data: caterers, isLoading } = useMessCaterers();

  const caterers = [
    {
      id: '1',
      name: 'Annapurna Catering Services',
      contact_person: 'Rajesh Kumar',
      phone: '+91 98765 43210',
      fssai_number: 'FSSAI-12345678901234',
      fssai_expiry: '2027-03-15',
      contract_start: '2025-06-01',
      contract_end: '2026-05-31',
      status: 'active',
      assigned_blocks: ['Block A', 'Block B'],
      performance_score: 4.2,
      monthly_rate: 4500,
    },
    {
      id: '2',
      name: 'Sri Lakshmi Foods',
      contact_person: 'Meena Devi',
      phone: '+91 87654 32109',
      fssai_number: 'FSSAI-23456789012345',
      fssai_expiry: '2026-11-20',
      contract_start: '2025-01-01',
      contract_end: '2025-12-31',
      status: 'active',
      assigned_blocks: ['Block C'],
      performance_score: 3.8,
      monthly_rate: 4200,
    },
    {
      id: '3',
      name: 'Fresh Bites Catering',
      contact_person: 'Suresh Patel',
      phone: '+91 76543 21098',
      fssai_number: 'FSSAI-34567890123456',
      fssai_expiry: '2025-08-10',
      contract_start: '2024-07-01',
      contract_end: '2025-06-30',
      status: 'expiring_soon',
      assigned_blocks: ['Block D', 'Block E'],
      performance_score: 3.5,
      monthly_rate: 4000,
    },
  ];

  const filteredCaterers = caterers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contact_person.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
      case 'expiring_soon':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Expiring Soon</Badge>;
      case 'expired':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Expired</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Caterers">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Caterers</h1>
            <p className="text-muted-foreground">
              Manage catering vendors, contracts, and FSSAI compliance
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/mess/caterers/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Caterer
            </Link>
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Caterers</CardTitle>
              <ChefHat className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{caterers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg. Performance</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(caterers.reduce((sum, c) => sum + c.performance_score, 0) / caterers.length).toFixed(1)}
                <span className="text-sm text-muted-foreground font-normal"> / 5</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {caterers.filter((c) => c.status === 'expiring_soon').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search caterers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caterer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>FSSAI</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Blocks</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCaterers.map((caterer) => (
                  <TableRow key={caterer.id}>
                    <TableCell>
                      <div className="font-medium">{caterer.name}</div>
                      <div className="text-sm text-muted-foreground">{caterer.contact_person}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3" />
                        {caterer.phone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{caterer.fssai_number}</div>
                      <div className="text-xs text-muted-foreground">
                        Exp: {new Date(caterer.fssai_expiry).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(caterer.contract_start).toLocaleDateString()} -{' '}
                        {new Date(caterer.contract_end).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {caterer.assigned_blocks.map((block) => (
                          <Badge key={block} variant="outline" className="text-xs">
                            {block}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-medium">{caterer.performance_score}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(caterer.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/campus-living/mess/caterers/${caterer.id}`}>View</Link>
                      </Button>
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
