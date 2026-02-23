'use client'

import { useState, useMemo } from 'react'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  ClipboardList,
  AlertCircle,
  Search,
  Calendar,
  Clock,
  ChevronRight,
  FileText,
  CheckCircle2,
  CircleDot,
  Circle,
  CircleCheck,
  Send,
  Filter,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useAllSubmissions,
  useRegulatoryFrameworks,
  useCreateSubmission,
} from '@/hooks/regulatory'
import { SubmissionWorkflow } from './_components/submission-workflow'
import toast from 'react-hot-toast'

// Status configuration
const statusConfig: Record<string, {
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  label: string
  color: string
  icon: React.ReactNode
}> = {
  draft: {
    variant: 'outline',
    label: 'Draft',
    color: 'text-gray-600',
    icon: <Circle className="h-3.5 w-3.5 text-gray-400" />,
  },
  data_collection: {
    variant: 'secondary',
    label: 'Data Collection',
    color: 'text-blue-600',
    icon: <CircleDot className="h-3.5 w-3.5 text-blue-500" />,
  },
  in_review: {
    variant: 'default',
    label: 'In Review',
    color: 'text-amber-600',
    icon: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  },
  approved: {
    variant: 'default',
    label: 'Approved',
    color: 'text-emerald-600',
    icon: <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />,
  },
  submitted: {
    variant: 'default',
    label: 'Submitted',
    color: 'text-blue-700',
    icon: <Send className="h-3.5 w-3.5 text-blue-600" />,
  },
}

const allStatuses = ['draft', 'data_collection', 'in_review', 'approved', 'submitted']

export default function SubmissionsPage() {
  const { profile } = useAuth()
  const { isSuperAdmin } = usePermissions()
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id

  const [searchQuery, setSearchQuery] = useState('')
  const [frameworkFilter, setFrameworkFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newSubmissionFramework, setNewSubmissionFramework] = useState<string>('')
  const [newSubmissionYear, setNewSubmissionYear] = useState<string>('')
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null)

  const {
    data: submissions,
    isLoading: submissionsLoading,
    error: submissionsError,
  } = useAllSubmissions({ institution_id: institutionId })

  const {
    data: frameworks,
    isLoading: frameworksLoading,
  } = useRegulatoryFrameworks({ institution_id: institutionId })

  const createSubmissionMutation = useCreateSubmission()

  const isLoading = submissionsLoading || frameworksLoading

  // Filter submissions
  const filteredSubmissions = useMemo(() => {
    if (!submissions) return []
    return submissions.filter((sub: any) => {
      const matchesSearch = searchQuery === '' ||
        (sub.framework_name && sub.framework_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sub.academic_year && sub.academic_year.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesFramework = frameworkFilter === 'all' || sub.framework_id === frameworkFilter
      const matchesStatus = statusFilter === 'all' || sub.status === statusFilter
      const matchesYear = yearFilter === 'all' || sub.academic_year === yearFilter

      return matchesSearch && matchesFramework && matchesStatus && matchesYear
    })
  }, [submissions, searchQuery, frameworkFilter, statusFilter, yearFilter])

  // Unique academic years
  const academicYears = useMemo(() => {
    if (!submissions) return []
    return [...new Set(submissions.map((s: any) => s.academic_year).filter(Boolean))].sort().reverse()
  }, [submissions])

  // Status counts
  const statusCounts = useMemo(() => {
    if (!submissions) return {}
    return submissions.reduce((acc: Record<string, number>, sub: any) => {
      acc[sub.status] = (acc[sub.status] || 0) + 1
      return acc
    }, {})
  }, [submissions])

  const handleCreateSubmission = async () => {
    if (!newSubmissionFramework || !newSubmissionYear) {
      toast.error('Please select a framework and academic year')
      return
    }
    try {
      await createSubmissionMutation.mutateAsync({
        framework_id: newSubmissionFramework,
        institution_id: institutionId || profile?.institution_id || '',
        academic_year: newSubmissionYear,
      })
      toast.success('Submission created successfully')
      setShowCreateDialog(false)
      setNewSubmissionFramework('')
      setNewSubmissionYear('')
    } catch {
      toast.error('Failed to create submission')
    }
  }

  // Generate academic year options
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const start = currentYear - i
    return `${start}-${start + 1}`
  })

  return (
    <ContentLayout title="Regulatory Submissions">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/regulatory">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold">Submissions</h1>
              <p className="text-sm text-muted-foreground">
                Track all regulatory submissions across frameworks
              </p>
            </div>
          </div>

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Submission
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Submission</DialogTitle>
                <DialogDescription>
                  Start a new regulatory submission by selecting a framework and academic year.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Framework</label>
                  <Select value={newSubmissionFramework} onValueChange={setNewSubmissionFramework}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select framework" />
                    </SelectTrigger>
                    <SelectContent>
                      {frameworks?.map((fw: any) => (
                        <SelectItem key={fw.id} value={fw.id}>
                          {fw.name} ({fw.body})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Academic Year</label>
                  <Select value={newSubmissionYear} onValueChange={setNewSubmissionYear}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateSubmission}
                  disabled={createSubmissionMutation.isPending || !newSubmissionFramework || !newSubmissionYear}
                >
                  {createSubmissionMutation.isPending ? 'Creating...' : 'Create Submission'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Error State */}
        {submissionsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load submissions</AlertTitle>
            <AlertDescription>
              {(submissionsError as Error).message || 'An unexpected error occurred.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Status Summary Cards */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          {allStatuses.map((status) => {
            const conf = statusConfig[status]
            const count = statusCounts[status] || 0
            return (
              <Card
                key={status}
                className={`cursor-pointer transition-colors ${
                  statusFilter === status ? 'border-primary' : 'hover:border-primary/50'
                }`}
                role="button"
                tabIndex={0}
                onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter(statusFilter === status ? 'all' : status) } }}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    {conf.icon}
                    <div>
                      <p className="text-lg font-semibold">{count}</p>
                      <p className="text-xs text-muted-foreground">{conf.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search submissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Framework" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Frameworks</SelectItem>
              {frameworks?.map((fw: any) => (
                <SelectItem key={fw.id} value={fw.id}>
                  {fw.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {academicYears.map((year: string) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(statusFilter !== 'all' || frameworkFilter !== 'all' || yearFilter !== 'all' || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('all')
                setFrameworkFilter('all')
                setYearFilter('all')
                setSearchQuery('')
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>

        {/* Submissions List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12">
              <div className="text-center text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium mb-2">No Submissions Found</h3>
                <p className="text-sm max-w-md mx-auto mb-4">
                  {searchQuery || frameworkFilter !== 'all' || statusFilter !== 'all' || yearFilter !== 'all'
                    ? 'No submissions match your current filters. Try adjusting your search criteria.'
                    : 'No regulatory submissions have been created yet. Start by creating your first submission.'}
                </p>
                {!searchQuery && frameworkFilter === 'all' && statusFilter === 'all' && (
                  <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Submission
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredSubmissions.map((sub: any) => {
              const conf = statusConfig[sub.status] || statusConfig.draft
              const isExpanded = expandedSubmission === sub.id

              return (
                <Card
                  key={sub.id}
                  className="hover:border-primary/30 transition-colors"
                >
                  <CardContent className="pt-5 pb-5">
                    {/* Main Row */}
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedSubmission(isExpanded ? null : sub.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedSubmission(isExpanded ? null : sub.id) } }}
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="p-2.5 rounded-lg bg-blue-50 shrink-0">
                          <ClipboardList className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">{sub.framework_name || 'Untitled'}</h3>
                            <Badge variant={conf.variant} className="text-xs">
                              {conf.icon}
                              <span className="ml-1">{conf.label}</span>
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            {sub.academic_year && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {sub.academic_year}
                              </span>
                            )}
                            {sub.body && (
                              <Badge variant="outline" className="text-xs">
                                {sub.body}
                              </Badge>
                            )}
                            {sub.updated_at && (
                              <span className="flex items-center gap-1 hidden sm:flex">
                                <Clock className="h-3.5 w-3.5" />
                                Updated {new Date(sub.updated_at).toLocaleDateString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        {sub.completeness_pct != null && (
                          <div className="text-right hidden md:block">
                            <p className={`text-sm font-semibold ${
                              sub.completeness_pct >= 80 ? 'text-emerald-600' :
                              sub.completeness_pct >= 50 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {sub.completeness_pct}%
                            </p>
                            <Progress value={sub.completeness_pct} className="h-1 w-24" />
                          </div>
                        )}

                        <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`} />
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-4">
                        {/* Workflow Visualization */}
                        <SubmissionWorkflow currentStatus={sub.status} />

                        {/* Details */}
                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Created</p>
                            <p className="text-sm font-medium">
                              {sub.created_at
                                ? new Date(sub.created_at).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                  })
                                : '--'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Due Date</p>
                            <p className="text-sm font-medium">
                              {sub.due_date
                                ? new Date(sub.due_date).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                  })
                                : '--'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Assigned To</p>
                            <p className="text-sm font-medium">{sub.assigned_to_name || '--'}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/regulatory/${sub.framework_id}`}>
                              <FileText className="h-4 w-4 mr-2" />
                              View Framework
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/regulatory/${sub.framework_id}/metrics`}>
                              Enter Metrics
                            </Link>
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Count */}
        {!isLoading && filteredSubmissions.length > 0 && (
          <p className="text-sm text-muted-foreground text-center">
            Showing {filteredSubmissions.length} of {submissions?.length ?? 0} submissions
          </p>
        )}
      </div>
    </ContentLayout>
  )
}
