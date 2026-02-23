'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
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
  BookOpen,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  GraduationCap,
  Layers,
} from 'lucide-react'

interface Syllabus {
  id: string
  course_code: string
  course_name: string
  department?: string
  program?: string
  revision_year?: string
  completion_pct?: number
  co_po_mapping_status?: 'not_started' | 'in_progress' | 'completed' | 'approved'
  bloom_taxonomy_mapped?: boolean
  cos_defined?: number
  cos_total?: number
  pos_mapped?: number
  pos_total?: number
  syllabus_file_url?: string
  status?: 'draft' | 'active' | 'archived'
}

interface SyllabusTableProps {
  syllabi: Syllabus[]
  institutionId?: string
}

const mappingStatusConfig: Record<string, {
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  label: string
  icon: React.ReactNode
}> = {
  not_started: {
    variant: 'outline',
    label: 'Not Started',
    icon: <Clock className="h-3 w-3" />,
  },
  in_progress: {
    variant: 'secondary',
    label: 'In Progress',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  completed: {
    variant: 'default',
    label: 'Completed',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  approved: {
    variant: 'default',
    label: 'Approved',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
}

export function SyllabusTable({ syllabi, institutionId }: SyllabusTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [mappingFilter, setMappingFilter] = useState<string>('all')

  // Unique departments
  const departments = useMemo(() => {
    return [...new Set(syllabi.map((s) => s.department).filter(Boolean))] as string[]
  }, [syllabi])

  // Filtered syllabi
  const filteredSyllabi = useMemo(() => {
    return syllabi.filter((s) => {
      const matchesSearch = searchQuery === '' ||
        s.course_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.course_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.program && s.program.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesDept = departmentFilter === 'all' || s.department === departmentFilter
      const matchesMapping = mappingFilter === 'all' || s.co_po_mapping_status === mappingFilter

      return matchesSearch && matchesDept && matchesMapping
    })
  }, [syllabi, searchQuery, departmentFilter, mappingFilter])

  // Summary stats
  const completedMapping = syllabi.filter(
    (s) => s.co_po_mapping_status === 'completed' || s.co_po_mapping_status === 'approved'
  ).length
  const avgCompletion = syllabi.length > 0
    ? Math.round(
        syllabi.reduce((sum, s) => sum + (s.completion_pct || 0), 0) / syllabi.length
      )
    : 0

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm font-semibold">{syllabi.length}</p>
                <p className="text-xs text-muted-foreground">Total Courses</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">{completedMapping}</p>
                <p className="text-xs text-muted-foreground">CO-PO Mapped</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-sm font-semibold">{departments.length}</p>
                <p className="text-xs text-muted-foreground">Departments</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">{avgCompletion}%</p>
                <p className="text-xs text-muted-foreground">Avg Completion</p>
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
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label="Search courses"
          />
        </div>

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mappingFilter} onValueChange={setMappingFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="CO-PO Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filteredSyllabi.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <h3 className="font-medium mb-1">No Courses Found</h3>
              <p className="text-sm">
                {searchQuery || departmentFilter !== 'all' || mappingFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'No course syllabi have been configured yet.'}
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
                  <TableHead className="w-[100px]">Code</TableHead>
                  <TableHead>Course Name</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Program</TableHead>
                  <TableHead className="w-[130px]">Completion</TableHead>
                  <TableHead className="w-[130px]">CO-PO Mapping</TableHead>
                  <TableHead className="hidden sm:table-cell w-[80px]">COs</TableHead>
                  <TableHead className="hidden sm:table-cell w-[80px]">POs</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSyllabi.map((syllabus) => {
                  const mappingConf = syllabus.co_po_mapping_status
                    ? mappingStatusConfig[syllabus.co_po_mapping_status]
                    : null

                  return (
                    <TableRow key={syllabus.id}>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {syllabus.course_code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium line-clamp-1">
                            {syllabus.course_name}
                          </p>
                          {syllabus.revision_year && (
                            <p className="text-xs text-muted-foreground">
                              Rev. {syllabus.revision_year}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {syllabus.department || '--'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {syllabus.program || '--'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Done</span>
                            <span className={`font-medium ${
                              (syllabus.completion_pct || 0) >= 80 ? 'text-emerald-600' :
                              (syllabus.completion_pct || 0) >= 50 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {syllabus.completion_pct || 0}%
                            </span>
                          </div>
                          <Progress value={syllabus.completion_pct || 0} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell>
                        {mappingConf ? (
                          <Badge variant={mappingConf.variant} className="text-xs">
                            {mappingConf.icon}
                            <span className="ml-1">{mappingConf.label}</span>
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center">
                        {syllabus.cos_defined != null ? (
                          <span className="text-sm">
                            {syllabus.cos_defined}
                            {syllabus.cos_total ? `/${syllabus.cos_total}` : ''}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center">
                        {syllabus.pos_mapped != null ? (
                          <span className="text-sm">
                            {syllabus.pos_mapped}
                            {syllabus.pos_total ? `/${syllabus.pos_total}` : ''}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {syllabus.syllabus_file_url && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                            <a href={syllabus.syllabus_file_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Footer Count */}
      {filteredSyllabi.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {filteredSyllabi.length} of {syllabi.length} courses
        </p>
      )}
    </div>
  )
}
