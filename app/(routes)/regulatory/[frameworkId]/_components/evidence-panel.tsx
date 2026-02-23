'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  FileText,
  Download,
  Upload,
  Trash2,
  Search,
  ExternalLink,
  Image,
  File,
  FileSpreadsheet,
  FilePenLine,
  Calendar,
  User,
  FolderOpen,
} from 'lucide-react'
import { useDeleteEvidence, useUploadEvidence } from '@/hooks/regulatory'
import toast from 'react-hot-toast'

interface EvidenceItem {
  id: string
  file_name: string
  file_url?: string
  file_type?: string
  file_size_bytes?: number
  criteria_id?: string
  criteria_code?: string
  criteria_name?: string
  metric_id?: string
  metric_code?: string
  description?: string
  uploaded_by_name?: string
  uploaded_at?: string
  status?: 'pending' | 'approved' | 'rejected'
}

interface EvidencePanelProps {
  evidence: EvidenceItem[]
  frameworkId: string
  institutionId?: string
}

// File icon based on type
function getFileIcon(fileType?: string) {
  if (!fileType) return <File className="h-5 w-5 text-gray-500" />
  if (fileType.includes('image')) return <Image className="h-5 w-5 text-blue-500" />
  if (fileType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv'))
    return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
  if (fileType.includes('doc') || fileType.includes('word'))
    return <FilePenLine className="h-5 w-5 text-blue-600" />
  return <File className="h-5 w-5 text-gray-500" />
}

// Format file size
function formatFileSize(bytes?: number): string {
  if (bytes == null) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Status badge config
const evidenceStatusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending: { variant: 'outline', label: 'Pending Review' },
  approved: { variant: 'default', label: 'Approved' },
  rejected: { variant: 'destructive', label: 'Rejected' },
}

export function EvidencePanel({ evidence, frameworkId, institutionId }: EvidencePanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [criteriaFilter, setCriteriaFilter] = useState<string>('all')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadDescription, setUploadDescription] = useState('')

  const deleteEvidenceMutation = useDeleteEvidence()
  const uploadEvidenceMutation = useUploadEvidence()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files))
    }
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one file')
      return
    }
    // Evidence upload requires a metric_id or criteria_id — for now, show a message
    toast.error('Please upload evidence from a specific metric using the upload button in the Metrics tab')
    setShowUploadDialog(false)
    setSelectedFiles([])
    setUploadDescription('')
  }

  // Unique criteria for filter
  const criteriaOptions = useMemo(() => {
    const criteriaMap = new Map<string, string>()
    evidence.forEach((e) => {
      if (e.criteria_code && e.criteria_name) {
        criteriaMap.set(e.criteria_code, e.criteria_name)
      }
    })
    return Array.from(criteriaMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [evidence])

  // Group evidence by criteria
  const groupedEvidence = useMemo(() => {
    const filtered = evidence.filter((e) => {
      const matchesSearch = searchQuery === '' ||
        e.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (e.criteria_code && e.criteria_code.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesCriteria = criteriaFilter === 'all' || e.criteria_code === criteriaFilter

      return matchesSearch && matchesCriteria
    })

    const grouped: Record<string, { criteria_code: string; criteria_name: string; items: EvidenceItem[] }> = {}

    filtered.forEach((e) => {
      const key = e.criteria_code || 'uncategorized'
      if (!grouped[key]) {
        grouped[key] = {
          criteria_code: e.criteria_code || 'N/A',
          criteria_name: e.criteria_name || 'Uncategorized',
          items: [],
        }
      }
      grouped[key].items.push(e)
    })

    return grouped
  }, [evidence, searchQuery, criteriaFilter])

  const handleDelete = async (evidenceId: string) => {
    try {
      await deleteEvidenceMutation.mutateAsync({
        evidence_id: evidenceId,
        framework_id: frameworkId,
        institution_id: institutionId,
      })
      // Toast is handled by the useDeleteEvidence hook's onSuccess
      setDeleteConfirmId(null)
    } catch {
      // Error toast is handled by the useDeleteEvidence hook's onError
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search evidence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Search evidence"
            />
          </div>

          <Select value={criteriaFilter} onValueChange={setCriteriaFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Criteria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Criteria</SelectItem>
              {criteriaOptions.map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {code} - {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Upload Evidence
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Evidence Document</DialogTitle>
              <DialogDescription>
                Upload supporting documents for framework criteria. Accepted formats: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground mb-2">
                  Select files to upload as evidence
                </p>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="hidden"
                  id="evidence-file-input"
                />
                <label htmlFor="evidence-file-input">
                  <Button variant="outline" size="sm" asChild>
                    <span>Choose Files</span>
                  </Button>
                </label>
                {selectedFiles.length > 0 && (
                  <div className="mt-3 text-sm text-left">
                    {selectedFiles.map((f, i) => (
                      <p key={i} className="text-muted-foreground truncate">{f.name}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description (optional)</label>
                <Input
                  placeholder="Brief description of the evidence..."
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowUploadDialog(false)
                setSelectedFiles([])
                setUploadDescription('')
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploadEvidenceMutation.isPending || selectedFiles.length === 0}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadEvidenceMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <p className="text-sm text-muted-foreground">
        {evidence.length} document{evidence.length !== 1 ? 's' : ''} uploaded across{' '}
        {criteriaOptions.length} criteria
      </p>

      {/* Evidence grouped by criteria */}
      {Object.keys(groupedEvidence).length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-muted-foreground">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <h3 className="font-medium mb-1">No Evidence Found</h3>
              <p className="text-sm">
                {searchQuery || criteriaFilter !== 'all'
                  ? 'No documents match your filters. Try adjusting your search.'
                  : 'Upload supporting documents for your framework criteria.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEvidence).map(([key, group]) => (
            <div key={key} className="space-y-3">
              {/* Criteria Group Header */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium bg-muted px-1.5 py-0.5 rounded">
                  {group.criteria_code}
                </span>
                <h3 className="text-sm font-medium">{group.criteria_name}</h3>
                <Badge variant="secondary" className="text-xs">
                  {group.items.length} file{group.items.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Evidence Cards */}
              <div className="grid gap-3 md:grid-cols-2">
                {group.items.map((item) => {
                  const statusConf = item.status
                    ? evidenceStatusConfig[item.status]
                    : null

                  return (
                    <Card key={item.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start gap-3">
                          {/* File Icon */}
                          <div className="p-2 rounded-lg bg-muted shrink-0">
                            {getFileIcon(item.file_type)}
                          </div>

                          {/* File Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{item.file_name}</p>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              {statusConf && (
                                <Badge variant={statusConf.variant} className="text-xs shrink-0">
                                  {statusConf.label}
                                </Badge>
                              )}
                            </div>

                            {/* Meta Info */}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {item.file_size_bytes != null && (
                                <span>{formatFileSize(item.file_size_bytes)}</span>
                              )}
                              {item.metric_code && (
                                <span className="flex items-center gap-1">
                                  Metric: {item.metric_code}
                                </span>
                              )}
                              {item.uploaded_by_name && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {item.uploaded_by_name}
                                </span>
                              )}
                              {item.uploaded_at && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(item.uploaded_at).toLocaleDateString('en-IN')}
                                </span>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 mt-2">
                              {item.file_url && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                                  <a href={item.file_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    View
                                  </a>
                                </Button>
                              )}
                              {item.file_url && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                                  <a href={item.file_url} download>
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteConfirmId(item.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Evidence</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleteEvidenceMutation.isPending}
            >
              {deleteEvidenceMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
