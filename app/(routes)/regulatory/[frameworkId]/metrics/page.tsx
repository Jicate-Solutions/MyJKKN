'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  AlertCircle,
  Search,
  RefreshCw,
  Edit3,
  Check,
  X,
  Upload,
  Zap,
  Pencil,
  Filter,
  FileText,
  Layers,
  Download,
  CheckCircle2,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useFrameworkDetail,
  useFrameworkMetricValues,
  useFrameworkCriteria,
  useUpdateMetricValue,
  useRefreshAutoMetric,
  useBulkRefreshAutoMetrics,
} from '@/hooks/regulatory'
import toast from 'react-hot-toast'

export default function MetricEntryPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const frameworkId = params.frameworkId as string
  const initialCriteria = searchParams.get('criteria') || 'all'

  const { profile } = useAuth()
  const { isSuperAdmin } = usePermissions()
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id

  const [searchQuery, setSearchQuery] = useState('')
  const [criteriaFilter, setCriteriaFilter] = useState<string>(initialCriteria)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [dataTypeFilter, setDataTypeFilter] = useState<string>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [uploadDialogMetricId, setUploadDialogMetricId] = useState<string | null>(null)

  const {
    data: framework,
    isLoading: frameworkLoading,
  } = useFrameworkDetail({ framework_id: frameworkId, institution_id: institutionId })

  const {
    data: metricValues,
    isLoading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useFrameworkMetricValues({ framework_id: frameworkId, institution_id: institutionId })

  const {
    data: criteria,
    isLoading: criteriaLoading,
  } = useFrameworkCriteria({ framework_id: frameworkId })

  const updateMetricMutation = useUpdateMetricValue()
  const refreshAutoMutation = useRefreshAutoMetric()
  const bulkRefreshMutation = useBulkRefreshAutoMetrics()

  const isLoading = frameworkLoading || metricsLoading || criteriaLoading

  // Criteria options for filter
  const criteriaOptions = useMemo(() => {
    if (!criteria) return []
    return criteria
      .filter((c: any) => !c.parent_id) // Top-level criteria
      .map((c: any) => ({ id: c.id, code: c.code, name: c.name }))
      .sort((a: any, b: any) => a.code.localeCompare(b.code))
  }, [criteria])

  // Data type options
  const dataTypeOptions = useMemo(() => {
    if (!metricValues) return []
    return [...new Set(metricValues.map((m: any) => m.data_type))].sort()
  }, [metricValues])

  // Filtered metrics
  const filteredMetrics = useMemo(() => {
    if (!metricValues) return []
    return metricValues.filter((m: any) => {
      const matchesSearch = searchQuery === '' ||
        m.metric_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.metric_code.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCriteria = criteriaFilter === 'all' || m.criteria_id === criteriaFilter
      const matchesSource = sourceFilter === 'all' || m.source_type === sourceFilter
      const matchesType = dataTypeFilter === 'all' || m.data_type === dataTypeFilter

      return matchesSearch && matchesCriteria && matchesSource && matchesType
    })
  }, [metricValues, searchQuery, criteriaFilter, sourceFilter, dataTypeFilter])

  // Counts
  const autoCount = metricValues?.filter((m: any) => m.source_type === 'auto').length ?? 0
  const manualCount = metricValues?.filter((m: any) => m.source_type === 'manual').length ?? 0
  const filledCount = metricValues?.filter((m: any) => m.current_value != null && m.current_value !== '').length ?? 0
  const totalCount = metricValues?.length ?? 0

  const handleStartEdit = (metric: any) => {
    setEditingId(metric.id)
    setEditValue(metric.current_value?.toString() || '')
  }

  const handleSaveEdit = async (metric: any) => {
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

  const handleRefreshAuto = async (metric: any) => {
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

  const handleBulkRefresh = async () => {
    try {
      await bulkRefreshMutation.mutateAsync({
        framework_id: frameworkId,
        institution_id: institutionId,
      })
      toast.success('All auto metrics refreshed')
    } catch {
      toast.error('Failed to refresh auto metrics')
    }
  }

  const formatValue = (value: any, dataType: string, unit?: string) => {
    if (value == null || value === '') return '--'
    if (dataType === 'percentage') return `${value}%`
    if (dataType === 'boolean') return value === 'true' || value === true ? 'Yes' : 'No'
    if (unit) return `${value} ${unit}`
    return String(value)
  }

  return (
    <ContentLayout title={framework?.name ? `${framework.name} - Metrics` : 'Metric Entry'}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/regulatory/${frameworkId}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold">Metric Entry</h1>
              {framework && (
                <p className="text-sm text-muted-foreground">
                  {framework.name} ({framework.body})
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchMetrics()}
              disabled={metricsLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${metricsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkRefresh}
              disabled={bulkRefreshMutation.isPending}
            >
              <Zap className={`h-4 w-4 mr-2 ${bulkRefreshMutation.isPending ? 'animate-pulse' : ''}`} />
              Refresh All Auto
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Error State */}
        {metricsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load metrics</AlertTitle>
            <AlertDescription>
              {(metricsError as Error).message || 'An unexpected error occurred.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-100">
                  <Layers className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xl font-semibold">{totalCount}</p>
                  <p className="text-xs text-muted-foreground">Total Metrics</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xl font-semibold">{filledCount}</p>
                  <p className="text-xs text-muted-foreground">Filled</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-purple-100">
                  <Zap className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xl font-semibold">{autoCount}</p>
                  <p className="text-xs text-muted-foreground">Auto-Calculated</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-100">
                  <Pencil className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xl font-semibold">{manualCount}</p>
                  <p className="text-xs text-muted-foreground">Manual Entry</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search metrics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Search metrics"
            />
          </div>

          <Select value={criteriaFilter} onValueChange={setCriteriaFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Criteria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Criteria</SelectItem>
              {criteriaOptions.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dataTypeFilter} onValueChange={setDataTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Data Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {dataTypeOptions.map((dt: string) => (
                <SelectItem key={dt} value={dt}>
                  {dt.charAt(0).toUpperCase() + dt.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Metrics Table */}
        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : filteredMetrics.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12">
              <div className="text-center text-muted-foreground">
                <Filter className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <h3 className="font-medium mb-1">No Metrics Found</h3>
                <p className="text-sm">
                  {searchQuery || criteriaFilter !== 'all' || sourceFilter !== 'all' || dataTypeFilter !== 'all'
                    ? 'Try adjusting your filters to see more metrics.'
                    : 'No metrics have been defined for this framework.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Code</TableHead>
                    <TableHead>Metric Name</TableHead>
                    <TableHead className="hidden lg:table-cell">Criteria</TableHead>
                    <TableHead className="w-[80px]">Type</TableHead>
                    <TableHead className="w-[90px]">Source</TableHead>
                    <TableHead className="w-[130px] text-right">Current Value</TableHead>
                    <TableHead className="w-[100px] text-right hidden sm:table-cell">Previous</TableHead>
                    <TableHead className="w-[70px] text-right">Score</TableHead>
                    <TableHead className="w-[90px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMetrics.map((metric: any) => (
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
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {metric.criteria_code || '--'}
                        </span>
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
                            <><Zap className="h-3 w-3 mr-1" />Auto</>
                          ) : (
                            <><Pencil className="h-3 w-3 mr-1" />Manual</>
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
                      <TableCell className="text-right hidden sm:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {formatValue(metric.previous_value, metric.data_type, metric.unit)}
                        </span>
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
                              title="Edit value"
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
                              title="Refresh auto value"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${refreshAutoMutation.isPending ? 'animate-spin' : ''}`} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setUploadDialogMetricId(metric.id)}
                            title="Upload evidence"
                          >
                            <Upload className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* Showing count */}
        {!isLoading && filteredMetrics.length > 0 && (
          <p className="text-sm text-muted-foreground text-center">
            Showing {filteredMetrics.length} of {totalCount} metrics
          </p>
        )}

        {/* Upload Evidence Dialog */}
        <Dialog open={!!uploadDialogMetricId} onOpenChange={(open) => !open && setUploadDialogMetricId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Evidence</DialogTitle>
              <DialogDescription>
                Upload supporting documents for this metric.
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
              <Button variant="outline" onClick={() => setUploadDialogMetricId(null)}>
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
    </ContentLayout>
  )
}
