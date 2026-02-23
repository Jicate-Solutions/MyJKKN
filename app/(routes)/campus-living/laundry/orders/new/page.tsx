'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useCreateLaundryOrder } from '@/hooks/campus-living/use-laundry'
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks'
import { LAUNDRY_ITEM_TYPE } from '@/types/campus-living'
import type { LaundryItem, LaundryItemType } from '@/types/campus-living'

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

interface ItemRow {
  type: LaundryItemType
  quantity: number
}

export default function NewLaundryOrderPage() {
  const router = useRouter()
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const { data: blocks } = useHostelBlocks(institutionId)
  const createOrder = useCreateLaundryOrder()

  const [learnerId, setLearnerId] = useState('')
  const [blockId, setBlockId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([
    { type: 'shirt', quantity: 1 },
  ])

  const addItemRow = () => {
    setItems([...items, { type: 'other', quantity: 1 }])
  }

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof ItemRow, value: string | number) => {
    setItems(
      items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    )
  }

  const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!learnerId.trim() || !blockId || items.length === 0 || totalItems === 0) return

    const laundryItems: LaundryItem[] = items.map((item) => ({
      type: item.type,
      quantity: item.quantity,
      returned: 0,
      damaged: 0,
    }))

    await createOrder.mutateAsync({
      institution_id: institutionId,
      learner_id: learnerId.trim(),
      block_id: blockId,
      items: laundryItems,
      total_items: totalItems,
      notes: notes.trim() || undefined,
    })

    router.push('/campus-living/laundry/orders')
  }

  return (
    <ContentLayout title="New Laundry Order">
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/campus-living/laundry/orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New Laundry Order</h1>
            <p className="text-muted-foreground">
              Create a laundry pickup order for a student
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Student & Block */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Student Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="learnerId">Student ID (Learner ID)</Label>
                  <Input
                    id="learnerId"
                    placeholder="Enter student/learner ID"
                    value={learnerId}
                    onChange={(e) => setLearnerId(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="block">Block</Label>
                  <Select value={blockId} onValueChange={setBlockId} required>
                    <SelectTrigger id="block">
                      <SelectValue placeholder="Select block" />
                    </SelectTrigger>
                    <SelectContent>
                      {(blocks ?? []).map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                Laundry Items ({totalItems} total)
              </CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-32">Quantity</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select
                          value={item.type}
                          onValueChange={(val) => updateItem(index, 'type', val)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(LAUNDRY_ITEM_TYPE).map(([key, value]) => (
                              <SelectItem key={key} value={value}>
                                {ITEM_TYPE_LABELS[value] ?? value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(index, 'quantity', parseInt(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItemRow(index)}
                          disabled={items.length <= 1}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Any special instructions or notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" asChild>
              <Link href="/campus-living/laundry/orders">Cancel</Link>
            </Button>
            <Button
              type="submit"
              disabled={
                createOrder.isPending ||
                !learnerId.trim() ||
                !blockId ||
                totalItems === 0
              }
            >
              {createOrder.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Order
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  )
}
