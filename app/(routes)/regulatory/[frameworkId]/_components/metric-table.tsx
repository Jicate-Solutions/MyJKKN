'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  RefreshCw,
  Upload,
  Edit3,
  Check,
  X,
  Search,
  Filter,
  Zap,
  Pencil,
  FileText,
} from 'lucide-react'
import { useUpdateMetricValue, useRefreshAutoMetric } from '@/hooks/regulatory'
import toast from 'react-hot-toast'

interface MetricValue {
  id: string
  metric_id: string
  metric_code: string
  metric_name: string
  criteria_code?: string
  criteria_name?: string
  data_type: 'number' | 'percentage' | 'text' | 'boolean' | 'ratio'
  source_type: 'auto' | 'manual'
  current_value: string | number | null
  previous_value?: string | number | null
  unit?: string
  weight?: number
  max_score?: number
  score?: number
  last_updated_at?: string
  last_updated_by?: string
}

interface MetricTableProps {
  metrics: MetricValue[]
  frameworkId: string
  institutionId?: string
}

export function MetricTable({ metrics, frameworkId, institutionId }: MetricTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [dataTypeFilter, setDataTypeFilter] = useState<string>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [uploadDialogMetric, setUploadDialogMetric] = useState<MetricValue | null>(null)

  const updateMetricMutation = useUpdateMetricValue()
  const refreshAutoMutation = useRefreshAutoMetric()

  // Filter metrics
  const filteredMetrics = useMemo(() => {
    return metrics.filter((m) => {
      const matchesSearch = searchQuery === '' ||
        m.metric_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.metric_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.criteria_code && m.criteria_code.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesSource = sourceFilter === 'all' || m.source_type === sourceFilter
      const matchesType = dataTypeFilter === 'all' || m.data_type === dataTypeFilter

      return matchesSearch && matchesSource && matchesType
    })
  }, [metrics, searchQuery, sourceFilter, dataTypeFilter])

  // Unique data types
  const dataTypes = useMemo(() => {
    return [...new Set(metrics.map((m) => m.data_type))].sort()
  }, [metrics])

  // Auto vs manual counts
  const autoCount = metrics.filter((m) => m.source_type === 'auto').length
  const manualCount = metrics.filter((m) => m.source_type === 'manual').length

  const handleStartEdit = (metric: MetricValue) => {
    setEditingId(metric.id)
    setEditValue(metric.current_value?.toString() || '')
  }

  const handleSaveEdit = async (metric: MetricValue) => {
    try {
      await updateMetricMutation.mutateAsync({
        metric_id: metric.metric_id,
        framework_id: frameworkId,
        institution_id: institutionId,
        value: editValue,
      })
      toast.success(`Updated ${metric.metric_code}`)
      setEditingId(null)
      setEditValue('')
    } catch {
      toast.error('Failed to update metric value')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  const handleRefreshAuto = async (metric: MetricValue) => {
    try {
      await refreshAutoMutation.mutateAsync({
        metric_id: metric.metric_id,
        framework_id: frameworkId,
        institution_id: institutionId,
      })
      toast.success(`Refreshed ${metric.metric_code}`)
    } catch {
      toast.error('Failed to refresh metric')
    }
  }

  const handleRefreshAll = async () => {
    const autoMetrics = metrics.filter((m) => m.source_type === 'auto')
    if (autoMetrics.length === 0) {
      toast.error('No auto-calculated metrics to refresh')
      return
    }

    try {
      await Promise.all(
        autoMetrics.map((m) =>
          refreshAutoMutation.mutateAsync({
            metric_id: m.metric_id,
            framework_id: frameworkId,
            institution_id: institutionId,
          })
        )
      )
      toast.success(`Refreshed ${autoMetrics.length} auto metrics`)
    } catch {
      toast.error('Some metrics failed to refresh')
    }
  }

  const formatValue = (value: string | number | null, dataType: string, unit?: string) => {
    if (value == null || value === '') return '--'
    if (dataType === 'percentage') return `${value}%`
    if (dataType === 'boolean') return value === 'true' || value === true ? 'Yes' : 'No'
    if (dataType === 'ratio') return String(value)
    if (unit) return `${value} ${unit}`
    return String(value)
  }

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search metrics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="auto">Auto ({autoCount})</SelectItem>
            <SelectItem value="manual">Manual ({manualCount})</SelectItem>
          </SelectContent>
        </Select>

        <Select value={dataTypeFilter} onValueChange={setDataTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Data Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {dataTypes.map((dt) => (
              <SelectItem key={dt} value={dt}>
                {dt.charAt(0).toUpperCase() + dt.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAll}
          disabled={refreshAutoMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshAutoMutation.isPending ? 'animate-spin' : ''}`} />
          Refresh All Auto
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>Showing {filteredMetrics.length} of {metrics.length} metrics</span>
        <Badge variant="outline" className="text-xs">
          <Zap className="h-3 w-3 mr-1" />
          {autoCount} auto
        </Badge>
        <Badge variant="outline" className="text-xs">
          <Pencil className="h-3 w-3 mr-1" />
          {manualCount} manual
        </Badge>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead className="hidden md:table-cell">Criteria</TableHead>
                <TableHead className="w-[80px]">Type</TableHead>
                <TableHead className="w-[100px]">Source</TableHead>
                <TableHead className="w-[120px] text-right">Value</TableHead>
                <TableHead className="w-[80px] text-right">Score</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMetrics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Filter className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No metrics match your filters</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMetrics.map((metric) => (
                  <TableRow key={metric.id}>
                    <TableCell>
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        {metric.metric_code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium line-clamp-1">{metric.metric_name}</p>
                        {metric.last_updated_at && (
                          <p className="text-xs text-muted-foreground">
                            Updated {new Date(metric.last_updated_at).toLocaleDateString('en-IN')}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {metric.criteria_code && (
                        <span className="text-xs text-muted-foreground">
                          {metric.criteria_code}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {metric.data_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={metric.source_type === 'auto' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {metric.source_type === 'auto' ? (
                          <>
                            <Zap className="h-3 w-3 mr-1" />
                            Auto
                          </>
                        ) : (
                          <>
                            <Pencil className="h-3 w-3 mr-1" />
                            Manual
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === metric.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-7 w-24 text-right text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(metric)
                              if (e.key === 'Escape') handleCancelEdit()
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleSaveEdit(metric)}
                            disabled={updateMetricMutation.isPending}
                          >
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={handleCancelEdit}
                          >
                            <X className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <span className="font-medium text-sm">
                          {formatValue(metric.current_value, metric.data_type, metric.unit)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`text-sm font-medium ${
                        metric.score != null && metric.max_score
                          ? metric.score / metric.max_score >= 0.7
                            ? 'text-emerald-600'
                            : metric.score / metric.max_score >= 0.4
                            ? 'text-amber-600'
                            : 'text-red-600'
                          : 'text-muted-foreground'
                      }`}>
                        {metric.score != null ? metric.score.toFixed(1) : '--'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {metric.source_type === 'manual' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleStartEdit(metric)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleRefreshAuto(metric)}
                            disabled={refreshAutoMutation.isPending}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshAutoMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setUploadDialogMetric(metric)}
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Evidence Upload Dialog */}
      <Dialog open={!!uploadDialogMetric} onOpenChange={(open) => !open && setUploadDialogMetric(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Evidence</DialogTitle>
            <DialogDescription>
              Upload supporting documents for metric{' '}
              <span className="font-mono font-medium">{uploadDialogMetric?.metric_code}</span>
              {' '}&mdash; {uploadDialogMetric?.metric_name}
            </DialogDescription>
          </DialogHeader>
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag and drop files here, or click to browse
            </p>
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Choose Files
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogMetric(null)}>
              Cancel
            </Button>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
