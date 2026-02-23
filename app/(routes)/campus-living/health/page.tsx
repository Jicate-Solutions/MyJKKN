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
  Plus,
  Search,
  Loader2,
  HeartPulse,
  Activity,
  AlertTriangle,
  Siren,
  Thermometer,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useHealthCases, useHealthStats } from '@/hooks/campus-living/use-health-cases'

const SEVERITY_BADGE: Record<string, { className: string; label: string }> = {
  minor: { className: 'bg-blue-100 text-blue-800 hover:bg-blue-100', label: 'Minor' },
  moderate: { className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100', label: 'Moderate' },
  serious: { className: 'bg-orange-100 text-orange-800 hover:bg-orange-100', label: 'Serious' },
  emergency: { className: 'bg-red-100 text-red-800 hover:bg-red-100', label: 'Emergency' },
}

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  reported: { className: 'bg-gray-100 text-gray-800 hover:bg-gray-100', label: 'Reported' },
  first_aid: { className: 'bg-blue-100 text-blue-800 hover:bg-blue-100', label: 'First Aid' },
  doctor_referred: { className: 'bg-purple-100 text-purple-800 hover:bg-purple-100', label: 'Doctor Referred' },
  hospitalized: { className: 'bg-red-100 text-red-800 hover:bg-red-100', label: 'Hospitalized' },
  recovering: { className: 'bg-orange-100 text-orange-800 hover:bg-orange-100', label: 'Recovering' },
  cleared: { className: 'bg-green-100 text-green-800 hover:bg-green-100', label: 'Cleared' },
  closed: { className: 'bg-gray-100 text-gray-600 hover:bg-gray-100', label: 'Closed' },
}

export default function HealthCasesPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [blockFilter, setBlockFilter] = useState('all')

  const { data: casesData, isLoading } = useHealthCases(institutionId)
  const { data: statsData } = useHealthStats(institutionId)
  const cases: any[] = (casesData as any[]) || []
  const stats = (statsData as any) || {}

  const filteredCases = cases.filter((c: any) => {
    const matchesSearch =
      searchQuery === '' ||
      (c.symptoms || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.case_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.learner?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSeverity = severityFilter === 'all' || c.severity === severityFilter
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    const matchesBlock = blockFilter === 'all' || c.block_id === blockFilter
    return matchesSearch && matchesSeverity && matchesStatus && matchesBlock
  })

  const totalActive = stats.total_active ?? 0
  const minorCount = stats.minor ?? 0
  const moderateCount = stats.moderate ?? 0
  const seriousCount = stats.serious ?? 0
  const emergencyCount = stats.emergency ?? 0

  if (isLoading) {
    return (
      <ContentLayout title="Student Health">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Student Health">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Student Health Cases</h1>
            <p className="text-muted-foreground">
              Track and manage student health incidents across campus
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/health/new">
              <Plus className="mr-2 h-4 w-4" />
              Report Case
            </Link>
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Active</CardTitle>
              <HeartPulse className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalActive}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Minor</CardTitle>
              <Activity className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{minorCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Moderate</CardTitle>
              <Thermometer className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{moderateCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Serious</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{seriousCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Emergency</CardTitle>
              <Siren className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{emergencyCount}</div>
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
                  placeholder="Search by symptoms, case #, student..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="serious">Serious</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="reported">Reported</SelectItem>
                  <SelectItem value="first_aid">First Aid</SelectItem>
                  <SelectItem value="doctor_referred">Doctor Referred</SelectItem>
                  <SelectItem value="hospitalized">Hospitalized</SelectItem>
                  <SelectItem value="recovering">Recovering</SelectItem>
                  <SelectItem value="cleared">Cleared</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Block" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filteredCases.length === 0 ? (
              <div className="text-center py-12">
                <HeartPulse className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No health cases found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {cases.length === 0
                    ? 'No health cases have been reported yet.'
                    : 'Try adjusting your filters to find what you are looking for.'}
                </p>
                {cases.length === 0 && (
                  <Button className="mt-4" asChild>
                    <Link href="/campus-living/health/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Report Case
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case #</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Symptoms</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Parent Notified</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCases.map((healthCase: any) => {
                    const severity = SEVERITY_BADGE[healthCase.severity] || { className: '', label: healthCase.severity }
                    const status = STATUS_BADGE[healthCase.status] || { className: '', label: healthCase.status }
                    return (
                      <TableRow key={healthCase.id}>
                        <TableCell className="font-medium">
                          {healthCase.case_number || healthCase.id?.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{healthCase.learner?.full_name ?? '-'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm line-clamp-2 max-w-[200px]">
                            {healthCase.symptoms || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={severity.className}>{severity.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={status.className}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {healthCase.parent_notified_at ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-400" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {healthCase.created_at
                            ? new Date(healthCase.created_at).toLocaleDateString()
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/campus-living/health/${healthCase.id}`}>
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
