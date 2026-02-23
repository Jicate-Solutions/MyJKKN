'use client'

import { useState } from 'react'
import Link from 'next/link'
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
  Plus,
  Search,
  Loader2,
  Shirt,
  ArrowLeft,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useLaundryOrders } from '@/hooks/campus-living/use-laundry'
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks'
import { LAUNDRY_ORDER_STATUS } from '@/types/campus-living'
import type { HostelLaundryOrder, LaundryOrderFilters } from '@/types/campus-living'

function statusBadgeClass(status: string) {
  switch (status) {
    case 'submitted': return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'collected': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'washing': return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'ready': return 'bg-green-100 text-green-700 border-green-200'
    case 'delivered': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'disputed': return 'bg-red-100 text-red-700 border-red-200'
    default: return ''
  }
}

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  collected: 'Collected',
  washing: 'Washing',
  ready: 'Ready',
  delivered: 'Delivered',
  disputed: 'Disputed',
}

export default function LaundryOrdersPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [blockFilter, setBlockFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filters: LaundryOrderFilters = {
    ...(statusFilter !== 'all' ? { status: statusFilter as any } : {}),
    ...(blockFilter !== 'all' ? { block_id: blockFilter } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  }

  const { data: ordersData, isLoading } = useLaundryOrders(institutionId, filters)
  const { data: blocks } = useHostelBlocks(institutionId)

  const allOrders = (ordersData as any)?.data ?? (ordersData ?? [])

  // Client-side search filter by student name
  const orders = search.trim()
    ? (allOrders as any[]).filter((o: any) =>
        (o.learner?.full_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : (allOrders as any[])

  return (
    <ContentLayout title="Laundry Orders">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/laundry">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Laundry Orders</h1>
              <p className="text-muted-foreground">
                All laundry orders across blocks
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/campus-living/laundry/orders/new">
              <Plus className="mr-2 h-4 w-4" />
              New Order
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by student name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(LAUNDRY_ORDER_STATUS).map(([key, value]) => (
                    <SelectItem key={key} value={value}>
                      {STATUS_LABELS[value] ?? value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Blocks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {(blocks ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                placeholder="From date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />

              <Input
                type="date"
                placeholder="To date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shirt className="h-5 w-5" />
              Orders ({orders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Shirt className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No orders found</p>
                {(search || statusFilter !== 'all' || blockFilter !== 'all') && (
                  <p className="text-sm mt-1">Try adjusting your filters</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Block</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Collected</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order: any) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-sm">
                          {order.order_number}
                        </TableCell>
                        <TableCell>{order.learner?.full_name ?? '-'}</TableCell>
                        <TableCell>{order.block?.name ?? '-'}</TableCell>
                        <TableCell className="text-center">{order.total_items}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(order.status)}
                          >
                            {STATUS_LABELS[order.status] ?? order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {order.collected_at
                            ? new Date(order.collected_at).toLocaleDateString()
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {order.delivered_at
                            ? new Date(order.delivered_at).toLocaleDateString()
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/campus-living/laundry/orders/${order.id}`}>
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  )
}
