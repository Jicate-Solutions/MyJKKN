'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Plus,
  Settings,
  Loader2,
  Pencil,
  Power,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useLaundryConfigs,
  useCreateLaundryConfig,
  useUpdateLaundryConfig,
} from '@/hooks/campus-living/use-laundry'
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks'
import { LAUNDRY_SERVICE_TYPE } from '@/types/campus-living'
import type { CreateLaundryConfigDTO, HostelLaundryConfig } from '@/types/campus-living'

const DAY_NAMES: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}

const DAYS = [1, 2, 3, 4, 5, 6, 7]

const SERVICE_TYPE_LABELS: Record<string, string> = {
  in_house: 'In-House',
  vendor: 'Vendor',
}

interface ConfigFormState {
  block_id: string
  service_type: string
  vendor_name: string
  vendor_phone: string
  collection_days: number[]
  delivery_days: number[]
  max_items_per_student: number
  cost_per_item: string
  is_included_in_fees: boolean
  is_active: boolean
}

const EMPTY_FORM: ConfigFormState = {
  block_id: '',
  service_type: 'in_house',
  vendor_name: '',
  vendor_phone: '',
  collection_days: [],
  delivery_days: [],
  max_items_per_student: 15,
  cost_per_item: '',
  is_included_in_fees: true,
  is_active: true,
}

export default function LaundrySettingsPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const { data: configs, isLoading } = useLaundryConfigs(institutionId)
  const { data: blocks } = useHostelBlocks(institutionId)
  const createConfig = useCreateLaundryConfig()
  const updateConfig = useUpdateLaundryConfig()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ConfigFormState>(EMPTY_FORM)

  const toggleDay = (
    field: 'collection_days' | 'delivery_days',
    day: number
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(day)
        ? prev[field].filter((d) => d !== day)
        : [...prev[field], day].sort(),
    }))
  }

  const openCreateForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEditForm = (config: HostelLaundryConfig) => {
    setEditingId(config.id)
    setForm({
      block_id: config.block_id ?? '',
      service_type: config.service_type,
      vendor_name: config.vendor_name ?? '',
      vendor_phone: config.vendor_phone ?? '',
      collection_days: config.collection_days ?? [],
      delivery_days: config.delivery_days ?? [],
      max_items_per_student: config.max_items_per_student,
      cost_per_item: config.cost_per_item != null ? String(config.cost_per_item) : '',
      is_included_in_fees: config.is_included_in_fees,
      is_active: config.is_active,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (editingId) {
      await updateConfig.mutateAsync({
        id: editingId,
        payload: {
          block_id: form.block_id || null,
          service_type: form.service_type as any,
          vendor_name: form.vendor_name || null,
          vendor_phone: form.vendor_phone || null,
          collection_days: form.collection_days,
          delivery_days: form.delivery_days,
          max_items_per_student: form.max_items_per_student,
          cost_per_item: form.cost_per_item ? parseFloat(form.cost_per_item) : null,
          is_included_in_fees: form.is_included_in_fees,
          is_active: form.is_active,
        },
      })
    } else {
      const payload: CreateLaundryConfigDTO = {
        institution_id: institutionId,
        block_id: form.block_id || null,
        service_type: form.service_type as any,
        vendor_name: form.vendor_name || null,
        vendor_phone: form.vendor_phone || null,
        vendor_contract_start: null,
        vendor_contract_end: null,
        collection_days: form.collection_days,
        delivery_days: form.delivery_days,
        max_items_per_student: form.max_items_per_student,
        cost_per_item: form.cost_per_item ? parseFloat(form.cost_per_item) : null,
        is_included_in_fees: form.is_included_in_fees,
        is_active: form.is_active,
      }
      await createConfig.mutateAsync(payload)
    }

    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleToggleActive = (config: HostelLaundryConfig) => {
    updateConfig.mutate({
      id: config.id,
      payload: { is_active: !config.is_active },
    })
  }

  const getBlockName = (blockId: string | null) => {
    if (!blockId) return 'All Blocks (Default)'
    const block = (blocks ?? []).find((b: any) => b.id === blockId)
    return (block as any)?.name ?? 'Unknown Block'
  }

  return (
    <ContentLayout title="Laundry Settings">
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
              <h1 className="text-2xl font-bold">Laundry Settings</h1>
              <p className="text-muted-foreground">
                Configure laundry schedules, vendors, and block assignments
              </p>
            </div>
          </div>
          {!showForm && (
            <Button onClick={openCreateForm}>
              <Plus className="mr-2 h-4 w-4" />
              Add Configuration
            </Button>
          )}
        </div>

        {/* Add / Edit Form */}
        {showForm && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-base">
                {editingId ? 'Edit Configuration' : 'New Configuration'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Block */}
                  <div className="space-y-2">
                    <Label>Block (optional)</Label>
                    <Select
                      value={form.block_id || '_none'}
                      onValueChange={(val) =>
                        setForm({ ...form, block_id: val === '_none' ? '' : val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All Blocks (Default)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">All Blocks (Default)</SelectItem>
                        {(blocks ?? []).map((b: any) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Service Type */}
                  <div className="space-y-2">
                    <Label>Service Type</Label>
                    <Select
                      value={form.service_type}
                      onValueChange={(val) =>
                        setForm({ ...form, service_type: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LAUNDRY_SERVICE_TYPE).map(([key, value]) => (
                          <SelectItem key={key} value={value}>
                            {SERVICE_TYPE_LABELS[value] ?? value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Vendor Name */}
                  <div className="space-y-2">
                    <Label>Vendor Name</Label>
                    <Input
                      placeholder="e.g., Clean Express"
                      value={form.vendor_name}
                      onChange={(e) =>
                        setForm({ ...form, vendor_name: e.target.value })
                      }
                    />
                  </div>

                  {/* Vendor Phone */}
                  <div className="space-y-2">
                    <Label>Vendor Phone</Label>
                    <Input
                      placeholder="e.g., +91 98765 43210"
                      value={form.vendor_phone}
                      onChange={(e) =>
                        setForm({ ...form, vendor_phone: e.target.value })
                      }
                    />
                  </div>

                  {/* Max Items */}
                  <div className="space-y-2">
                    <Label>Max Items per Student</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={form.max_items_per_student}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          max_items_per_student: parseInt(e.target.value) || 15,
                        })
                      }
                    />
                  </div>

                  {/* Cost Per Item */}
                  <div className="space-y-2">
                    <Label>Cost per Item (optional)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder="0.00"
                      value={form.cost_per_item}
                      onChange={(e) =>
                        setForm({ ...form, cost_per_item: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* Collection Days */}
                <div className="space-y-2">
                  <Label>Collection Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <Button
                        key={`col-${day}`}
                        type="button"
                        variant={form.collection_days.includes(day) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleDay('collection_days', day)}
                      >
                        {DAY_NAMES[day]}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Delivery Days */}
                <div className="space-y-2">
                  <Label>Delivery Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <Button
                        key={`del-${day}`}
                        type="button"
                        variant={form.delivery_days.includes(day) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleDay('delivery_days', day)}
                      >
                        {DAY_NAMES[day]}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isIncluded"
                      checked={form.is_included_in_fees}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, is_included_in_fees: !!checked })
                      }
                    />
                    <Label htmlFor="isIncluded" className="text-sm font-normal">
                      Included in hostel fees
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isActive"
                      checked={form.is_active}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, is_active: !!checked })
                      }
                    />
                    <Label htmlFor="isActive" className="text-sm font-normal">
                      Active
                    </Label>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false)
                      setEditingId(null)
                      setForm(EMPTY_FORM)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createConfig.isPending || updateConfig.isPending}
                  >
                    {(createConfig.isPending || updateConfig.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editingId ? 'Update Configuration' : 'Create Configuration'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Existing Configs */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (configs ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Settings className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No laundry configurations yet</p>
              <p className="text-sm mt-1">Add a configuration to set up laundry services</p>
              {!showForm && (
                <Button variant="outline" className="mt-4" onClick={openCreateForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Configuration
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(configs as HostelLaundryConfig[]).map((config) => (
              <Card key={config.id} className={!config.is_active ? 'opacity-60' : ''}>
                <CardHeader className="flex flex-row items-start justify-between pb-3 space-y-0">
                  <div>
                    <CardTitle className="text-base">
                      {getBlockName(config.block_id)}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">
                        {SERVICE_TYPE_LABELS[config.service_type] ?? config.service_type}
                      </Badge>
                      <Badge variant={config.is_active ? 'default' : 'secondary'}>
                        {config.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditForm(config)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleToggleActive(config)}
                      disabled={updateConfig.isPending}
                    >
                      <Power className={`h-4 w-4 ${config.is_active ? 'text-green-600' : 'text-muted-foreground'}`} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {config.vendor_name && (
                    <div>
                      <span className="text-muted-foreground">Vendor: </span>
                      <span className="font-medium">{config.vendor_name}</span>
                      {config.vendor_phone && (
                        <span className="text-muted-foreground ml-1">
                          ({config.vendor_phone})
                        </span>
                      )}
                    </div>
                  )}

                  <div>
                    <span className="text-muted-foreground">Collection: </span>
                    <span>
                      {(config.collection_days ?? []).map((d) => DAY_NAMES[d]).join(', ') || 'None'}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground">Delivery: </span>
                    <span>
                      {(config.delivery_days ?? []).map((d) => DAY_NAMES[d]).join(', ') || 'None'}
                    </span>
                  </div>

                  <div className="flex gap-4">
                    <div>
                      <span className="text-muted-foreground">Max items: </span>
                      <span className="font-medium">{config.max_items_per_student}</span>
                    </div>
                    {config.cost_per_item != null && config.cost_per_item > 0 && (
                      <div>
                        <span className="text-muted-foreground">Cost/item: </span>
                        <span className="font-medium">{config.cost_per_item}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <Badge variant={config.is_included_in_fees ? 'default' : 'outline'} className="text-xs">
                      {config.is_included_in_fees ? 'Included in fees' : 'Separate charge'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  )
}
