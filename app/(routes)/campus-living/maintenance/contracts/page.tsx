'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  XCircle,
  IndianRupee,
  Clock,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useAmcContracts } from '@/hooks/campus-living/use-amc-contracts'
import type { HostelAmcContract } from '@/types/campus-living'

const CATEGORY_LABELS: Record<string, string> = {
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  civil: 'Civil',
  pest_control: 'Pest Control',
  cleaning: 'Cleaning',
  internet: 'Internet',
  water_supply: 'Water Supply',
  furniture: 'Furniture',
  safety: 'Safety',
  other: 'Other',
}

export default function AmcContractsPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { data: contractsData, isLoading } = useAmcContracts(institutionId)
  const contracts: HostelAmcContract[] = (contractsData as HostelAmcContract[] | undefined) || []

  const today = new Date()
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(today.getDate() + 30)
  const todayStr = today.toISOString().split('T')[0]
  const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0]

  // Derive display status for each contract
  const getDisplayStatus = (c: HostelAmcContract): string => {
    if (c.status === 'cancelled') return 'cancelled'
    if (c.status === 'renewed') return 'renewed'
    if (c.end_date < todayStr) return 'expired'
    if (c.end_date <= thirtyDaysStr) return 'expiring_soon'
    return c.status
  }

  const filteredContracts = contracts.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.vendor_name.toLowerCase().includes(searchQuery.toLowerCase())
    const displayStatus = getDisplayStatus(c)
    const matchesStatus = statusFilter === 'all' || displayStatus === statusFilter
    const matchesCategory = categoryFilter === 'all' || c.category === categoryFilter
    return matchesSearch && matchesStatus && matchesCategory
  })

  const activeCount = contracts.filter((c) => c.status === 'active' && c.end_date >= todayStr && c.end_date > thirtyDaysStr).length
  const expiringCount = contracts.filter((c) => c.status === 'active' && c.end_date >= todayStr && c.end_date <= thirtyDaysStr).length
  const expiredCount = contracts.filter((c) => c.end_date < todayStr && c.status !== 'cancelled' && c.status !== 'renewed').length
  const totalAnnualCost = contracts
    .filter((c) => c.status === 'active' && c.end_date >= todayStr)
    .reduce((sum, c) => sum + (c.annual_cost || 0), 0)

  const getStatusBadge = (contract: HostelAmcContract) => {
    const displayStatus = getDisplayStatus(contract)
    switch (displayStatus) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Active</Badge>
      case 'expiring_soon':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><Clock className="mr-1 h-3 w-3" />Expiring Soon</Badge>
      case 'expired':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="mr-1 h-3 w-3" />Expired</Badge>
      case 'renewed':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><RefreshCw className="mr-1 h-3 w-3" />Renewed</Badge>
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Cancelled</Badge>
      default:
        return <Badge variant="outline">{displayStatus}</Badge>
    }
  }

  if (isLoading) {
    return (
      <ContentLayout title="AMC Contracts">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="AMC Contracts">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">AMC Contracts</h1>
            <p className="text-muted-foreground">
              Manage annual maintenance contracts with vendors
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/maintenance/contracts/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Contract
            </Link>
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Active</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{expiringCount}</div>
              <p className="text-xs text-muted-foreground">Within 30 days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Expired</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{expiredCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Annual Cost</CardTitle>
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAnnualCost.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title or vendor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="renewed">Renewed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="plumbing">Plumbing</SelectItem>
                  <SelectItem value="civil">Civil</SelectItem>
                  <SelectItem value="pest_control">Pest Control</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="internet">Internet</SelectItem>
                  <SelectItem value="water_supply">Water Supply</SelectItem>
                  <SelectItem value="furniture">Furniture</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filteredContracts.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No contracts found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {contracts.length === 0
                    ? 'Add your first AMC contract to get started.'
                    : 'Try adjusting your filters to find what you are looking for.'}
                </p>
                {contracts.length === 0 && (
                  <Button className="mt-4" asChild>
                    <Link href="/campus-living/maintenance/contracts/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Contract
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Annual Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.map((contract) => {
                    const isExpiringSoon = contract.status === 'active' && contract.end_date >= todayStr && contract.end_date <= thirtyDaysStr
                    const isExpired = contract.end_date < todayStr && contract.status !== 'cancelled' && contract.status !== 'renewed'
                    return (
                      <TableRow key={contract.id} className={isExpired ? 'bg-red-50' : isExpiringSoon ? 'bg-orange-50' : ''}>
                        <TableCell>
                          <div className="font-medium">{contract.title}</div>
                          {contract.contract_number && (
                            <div className="text-xs text-muted-foreground">
                              #{contract.contract_number}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{contract.vendor_name}</div>
                          {contract.vendor_phone && (
                            <div className="text-xs text-muted-foreground">{contract.vendor_phone}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {CATEGORY_LABELS[contract.category] || contract.category?.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(contract.start_date + 'T00:00:00').toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className={`text-sm ${isExpired ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-orange-600 font-medium' : ''}`}>
                            {new Date(contract.end_date + 'T00:00:00').toLocaleDateString()}
                          </div>
                          {isExpiringSoon && (
                            <span className="text-xs text-orange-600">Expiring soon</span>
                          )}
                          {isExpired && (
                            <span className="text-xs text-red-600">Expired</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {contract.annual_cost
                            ? Number(contract.annual_cost).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>{getStatusBadge(contract)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/campus-living/maintenance/contracts/${contract.id}`}>
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  )
}
