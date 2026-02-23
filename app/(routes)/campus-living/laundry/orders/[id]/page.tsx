'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Loader2,
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Shirt,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useLaundryOrder,
  useCollectLaundryOrder,
  useMarkLaundryReady,
  useDeliverLaundryOrder,
  useConfirmLaundryDelivery,
  useRaiseLaundryDispute,
} from '@/hooks/campus-living/use-laundry'
import type { LaundryItem } from '@/types/campus-living'

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

const ITEM_TYPE_LABELS: Record<string, string> = {
  shirt: 'Shirt',
  pant: 'Pant',
  tshirt: 'T-Shirt',
  shorts: 'Shorts',
  bedsheet: 'Bedsheet',
  towel: 'Towel',
  uniform: 'Uniform',
  traditional: 'Traditional',
  innerwear: 'Innerwear',
  other: 'Other',
}

const STATUS_STEPS = ['submitted', 'collected', 'washing', 'ready', 'delivered']

export default function LaundryOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { profile } = useAuth()
  const { data: orderData, isLoading } = useLaundryOrder(id)

  const collectOrder = useCollectLaundryOrder()
  const markReady = useMarkLaundryReady()
  const deliverOrder = useDeliverLaundryOrder()
  const confirmDelivery = useConfirmLaundryDelivery()
  const raiseDispute = useRaiseLaundryDispute()

  // Deliver form state
  const [showDeliverForm, setShowDeliverForm] = useState(false)
  const [returnedItems, setReturnedItems] = useState<LaundryItem[]>([])

  // Dispute form state
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')

  const order = orderData as any

  if (isLoading || !order) {
    return (
      <ContentLayout title="Order Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  const currentStepIndex = STATUS_STEPS.indexOf(order.status)
  const isDisputed = order.status === 'disputed'

  const handleCollect = () => collectOrder.mutate(id)

  const handleMarkReady = () => markReady.mutate(id)

  const handleStartDeliver = () => {
    // Initialize returned items from order items
    const initial: LaundryItem[] = (order.items ?? []).map((item: LaundryItem) => ({
      type: item.type,
      quantity: item.quantity,
      returned: item.quantity, // default all returned
      damaged: 0,
    }))
    setReturnedItems(initial)
    setShowDeliverForm(true)
  }

  const handleDeliver = () => {
    deliverOrder.mutate(
      { id, returnedItems },
      { onSuccess: () => setShowDeliverForm(false) }
    )
  }

  const handleConfirmDelivery = () => confirmDelivery.mutate(id)

  const handleRaiseDispute = () => {
    if (!disputeReason.trim()) return
    raiseDispute.mutate(
      { id, reason: disputeReason.trim() },
      { onSuccess: () => { setShowDisputeForm(false); setDisputeReason('') } }
    )
  }

  const updateReturnedItem = (index: number, field: 'returned' | 'damaged', value: number) => {
    setReturnedItems(
      returnedItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    )
  }

  return (
    <ContentLayout title={`Order #${order.order_number}`}>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/laundry/orders">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                Order #{order.order_number}
                <Badge
                  variant="outline"
                  className={statusBadgeClass(order.status)}
                >
                  {STATUS_LABELS[order.status] ?? order.status}
                </Badge>
              </h1>
              <p className="text-muted-foreground">
                {order.learner?.full_name ?? 'Unknown Student'} &middot; {order.block?.name ?? '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Status Progression */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {STATUS_STEPS.map((step, index) => {
                const isActive = index <= currentStepIndex && !isDisputed
                const isCurrent = step === order.status
                return (
                  <div key={step} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors ${
                          isActive
                            ? 'bg-primary text-primary-foreground border-primary'
                            : isDisputed && step === order.status
                            ? 'bg-red-500 text-white border-red-500'
                            : 'bg-muted text-muted-foreground border-muted'
                        }`}
                      >
                        {isActive ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <span
                        className={`text-xs mt-1 capitalize ${
                          isCurrent ? 'font-semibold text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                    {index < STATUS_STEPS.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 mx-1 ${
                          index < currentStepIndex && !isDisputed
                            ? 'bg-primary'
                            : 'bg-muted'
                        }`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            {isDisputed && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">Dispute Raised</p>
                  <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                    {order.dispute_reason || 'No reason provided'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Student</p>
                <p className="font-medium">{order.learner?.full_name ?? '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Block</p>
                <p className="font-medium">{order.block?.name ?? '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="font-medium">{order.total_items}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="font-medium">{order.student_confirmed ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="font-medium">
                  {new Date(order.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Collected</p>
                <p className="font-medium">
                  {order.collected_at
                    ? new Date(order.collected_at).toLocaleString()
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ready</p>
                <p className="font-medium">
                  {order.ready_at
                    ? new Date(order.ready_at).toLocaleString()
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Delivered</p>
                <p className="font-medium">
                  {order.delivered_at
                    ? new Date(order.delivered_at).toLocaleString()
                    : '-'}
                </p>
              </div>
            </div>
            {order.notes && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Notes</p>
                <p className="text-sm">{order.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shirt className="h-5 w-5" />
              Items ({order.total_items} total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Submitted</TableHead>
                  <TableHead className="text-center">Returned</TableHead>
                  <TableHead className="text-center">Damaged</TableHead>
                  <TableHead className="text-center">Missing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(order.items ?? []).map((item: LaundryItem, index: number) => {
                  const missing = Math.max(0, item.quantity - item.returned - item.damaged)
                  return (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {ITEM_TYPE_LABELS[item.type] ?? item.type}
                      </TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-center">{item.returned}</TableCell>
                      <TableCell className="text-center">
                        {item.damaged > 0 ? (
                          <span className="text-orange-600 font-medium">{item.damaged}</span>
                        ) : (
                          item.damaged
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {missing > 0 ? (
                          <span className="text-red-600 font-medium">{missing}</span>
                        ) : (
                          missing
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {/* Summary row */}
            <div className="mt-4 pt-4 border-t grid grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <p className="text-muted-foreground">Total Items</p>
                <p className="font-bold text-lg">{order.total_items}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Returned</p>
                <p className="font-bold text-lg">{order.total_returned}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Damaged</p>
                <p className="font-bold text-lg text-orange-600">{order.total_damaged}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Missing</p>
                <p className="font-bold text-lg text-red-600">{order.total_missing}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Deliver Form (inline) */}
        {showDeliverForm && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Delivery - Enter Returned Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Submitted</TableHead>
                    <TableHead className="w-32">Returned</TableHead>
                    <TableHead className="w-32">Damaged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnedItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {ITEM_TYPE_LABELS[item.type] ?? item.type}
                      </TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={item.returned}
                          onChange={(e) =>
                            updateReturnedItem(index, 'returned', parseInt(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={item.damaged}
                          onChange={(e) =>
                            updateReturnedItem(index, 'damaged', parseInt(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex justify-end gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowDeliverForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeliver}
                  disabled={deliverOrder.isPending}
                >
                  {deliverOrder.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Confirm Delivery
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dispute Form (inline) */}
        {showDisputeForm && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Raise Dispute
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="disputeReason">Reason for dispute</Label>
                  <Textarea
                    id="disputeReason"
                    placeholder="Describe the issue (e.g., items missing, damaged, wrong items returned)"
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => { setShowDisputeForm(false); setDisputeReason('') }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRaiseDispute}
                    disabled={raiseDispute.isPending || !disputeReason.trim()}
                  >
                    {raiseDispute.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Submit Dispute
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        {!showDeliverForm && !showDisputeForm && (
          <div className="flex flex-wrap gap-3">
            {order.status === 'submitted' && (
              <Button onClick={handleCollect} disabled={collectOrder.isPending}>
                {collectOrder.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <Package className="mr-2 h-4 w-4" />
                Mark Collected
              </Button>
            )}

            {(order.status === 'collected' || order.status === 'washing') && (
              <Button onClick={handleMarkReady} disabled={markReady.isPending}>
                {markReady.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark Ready
              </Button>
            )}

            {order.status === 'ready' && (
              <Button onClick={handleStartDeliver}>
                <Truck className="mr-2 h-4 w-4" />
                Deliver
              </Button>
            )}

            {order.status === 'delivered' && !order.student_confirmed && (
              <>
                <Button onClick={handleConfirmDelivery} disabled={confirmDelivery.isPending}>
                  {confirmDelivery.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Receipt
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowDisputeForm(true)}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Raise Dispute
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </ContentLayout>
  )
}
