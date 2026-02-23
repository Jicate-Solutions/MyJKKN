'use client'

import { useState, useMemo, useCallback } from 'react'
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
import Link from 'next/link'
import {
  ArrowLeft,
  BarChart3,
  AlertCircle,
  Play,
  Save,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Layers,
  Calculator,
  History,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useRegulatoryFrameworks,
  useSimulationData,
  useSaveSimulation,
  useSavedSimulations,
  useDeleteSimulation,
} from '@/hooks/regulatory'
import toast from 'react-hot-toast'

interface SimulationOverride {
  criteria_id: string
  criteria_code: string
  criteria_name: string
  original_score: number
  overridden_score: number
  max_score: number
  weight: number
}

export default function SimulationsPage() {
  const { profile } = useAuth()
  const { isSuperAdmin } = usePermissions()
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id

  const [selectedFramework, setSelectedFramework] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [simulationName, setSimulationName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)

  const {
    data: frameworks,
    isLoading: frameworksLoading,
  } = useRegulatoryFrameworks({ institution_id: institutionId })

  const {
    data: simulationData,
    isLoading: dataLoading,
  } = useSimulationData({
    framework_id: selectedFramework || undefined,
    institution_id: institutionId,
    academic_year: selectedYear || undefined,
    enabled: !!selectedFramework,
  })

  const {
    data: savedSimulations,
    isLoading: savedLoading,
  } = useSavedSimulations({
    framework_id: selectedFramework || undefined,
    institution_id: institutionId,
    enabled: !!selectedFramework && showHistoryDialog,
  })

  const saveSimulationMutation = useSaveSimulation()
  const deleteSimulationMutation = useDeleteSimulation()

  // Generate year options
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const start = currentYear - i
    return `${start}-${start + 1}`
  })

  // Calculate simulated scores
  const simulatedCriteria = useMemo(() => {
    if (!simulationData?.criteria) return []

    return simulationData.criteria.map((c: any) => {
      const overriddenScore = overrides[c.id] ?? c.current_score
      const delta = overriddenScore - (c.current_score || 0)
      const isOverridden = overrides[c.id] !== undefined

      return {
        ...c,
        original_score: c.current_score || 0,
        overridden_score: overriddenScore,
        delta,
        isOverridden,
        weighted_original: ((c.current_score || 0) / (c.max_score || 1)) * (c.weight || 0),
        weighted_simulated: (overriddenScore / (c.max_score || 1)) * (c.weight || 0),
      }
    })
  }, [simulationData, overrides])

  // Compute total scores
  const totalOriginal = useMemo(() => {
    return simulatedCriteria.reduce((sum: number, c: any) => sum + c.weighted_original, 0)
  }, [simulatedCriteria])

  const totalSimulated = useMemo(() => {
    return simulatedCriteria.reduce((sum: number, c: any) => sum + c.weighted_simulated, 0)
  }, [simulatedCriteria])

  const totalDelta = totalSimulated - totalOriginal
  const hasOverrides = Object.keys(overrides).length > 0

  // Max possible weighted score
  const totalMaxWeighted = useMemo(() => {
    return simulatedCriteria.reduce((sum: number, c: any) => sum + (c.weight || 0), 0)
  }, [simulatedCriteria])

  const handleOverrideChange = useCallback((criteriaId: string, value: string) => {
    const numVal = parseFloat(value)
    if (isNaN(numVal)) {
      const newOverrides = { ...overrides }
      delete newOverrides[criteriaId]
      setOverrides(newOverrides)
    } else {
      setOverrides((prev) => ({ ...prev, [criteriaId]: numVal }))
    }
  }, [overrides])

  const handleReset = () => {
    setOverrides({})
    toast.success('All overrides reset')
  }

  const handleSave = async () => {
    if (!simulationName.trim()) {
      toast.error('Please enter a simulation name')
      return
    }
    try {
      await saveSimulationMutation.mutateAsync({
        framework_id: selectedFramework,
        institution_id: institutionId,
        name: simulationName.trim(),
        academic_year: selectedYear,
        overrides,
        total_original: totalOriginal,
        total_simulated: totalSimulated,
      })
      toast.success('Simulation saved')
      setShowSaveDialog(false)
      setSimulationName('')
    } catch {
      toast.error('Failed to save simulation')
    }
  }

  const handleLoadSimulation = (sim: any) => {
    if (sim.overrides) {
      setOverrides(sim.overrides)
      toast.success(`Loaded simulation: ${sim.name}`)
    }
    setShowHistoryDialog(false)
  }

  const handleDeleteSimulation = async (simId: string) => {
    try {
      await deleteSimulationMutation.mutateAsync({ simulation_id: simId })
      toast.success('Simulation deleted')
    } catch {
      toast.error('Failed to delete simulation')
    }
  }

  return (
    <ContentLayout title="Score Simulator">
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
              <h1 className="text-xl font-bold">Score Simulator</h1>
              <p className="text-sm text-muted-foreground">
                What-if analysis for regulatory framework scores
              </p>
            </div>
          </div>

          {selectedFramework && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistoryDialog(true)}
              >
                <History className="h-4 w-4 mr-2" />
                Saved Simulations
              </Button>
              {hasOverrides && (
                <>
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button size="sm" onClick={() => setShowSaveDialog(true)}>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Framework & Year Selection */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="space-y-2 flex-1 w-full sm:w-auto">
                <label className="text-sm font-medium">Framework</label>
                <Select value={selectedFramework} onValueChange={(v) => {
                  setSelectedFramework(v)
                  setOverrides({})
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a framework to simulate" />
                  </SelectTrigger>
                  <SelectContent>
                    {frameworksLoading ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      frameworks?.map((fw: any) => (
                        <SelectItem key={fw.id} value={fw.id}>
                          {fw.name} ({fw.body})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 w-full sm:w-48">
                <label className="text-sm font-medium">Academic Year</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
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
          </CardContent>
        </Card>

        {/* No Framework Selected */}
        {!selectedFramework && (
          <Card>
            <CardContent className="pt-12 pb-12">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium mb-2">Select a Framework</h3>
                <p className="text-sm max-w-md mx-auto">
                  Choose a regulatory framework above to start a what-if simulation.
                  You can override scores for each criteria and see the projected impact.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {selectedFramework && dataLoading && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
            <Skeleton className="h-[400px] w-full" />
          </div>
        )}

        {/* Simulation Content */}
        {selectedFramework && !dataLoading && simulationData && (
          <>
            {/* Score Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Original Score */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Current Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-full bg-gray-100">
                      <Target className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-bold text-2xl">
                        {totalOriginal.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        out of {totalMaxWeighted.toFixed(0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Simulated Score */}
              <Card className={hasOverrides ? 'border-blue-200 bg-blue-50/30' : ''}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Simulated Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-full bg-blue-100">
                      <Calculator className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold text-2xl text-blue-700">
                        {totalSimulated.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {hasOverrides
                          ? `${Object.keys(overrides).length} override${Object.keys(overrides).length !== 1 ? 's' : ''} applied`
                          : 'no overrides'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Delta */}
              <Card className={
                totalDelta > 0 ? 'border-emerald-200 bg-emerald-50/30' :
                totalDelta < 0 ? 'border-red-200 bg-red-50/30' : ''
              }>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Score Impact
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-full ${
                      totalDelta > 0 ? 'bg-emerald-100' :
                      totalDelta < 0 ? 'bg-red-100' : 'bg-gray-100'
                    }`}>
                      {totalDelta > 0 ? (
                        <TrendingUp className="h-5 w-5 text-emerald-600" />
                      ) : totalDelta < 0 ? (
                        <TrendingDown className="h-5 w-5 text-red-600" />
                      ) : (
                        <Minus className="h-5 w-5 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <p className={`font-bold text-2xl ${
                        totalDelta > 0 ? 'text-emerald-600' :
                        totalDelta < 0 ? 'text-red-600' : 'text-muted-foreground'
                      }`}>
                        {totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {totalDelta === 0 ? 'no change' :
                         totalDelta > 0 ? 'improvement' : 'decrease'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Criteria Table with Overrides */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Score Breakdown by Criteria
                </CardTitle>
                <CardDescription>
                  Edit the &ldquo;Simulated&rdquo; column to see how score changes affect the total.
                </CardDescription>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Code</TableHead>
                      <TableHead>Criteria</TableHead>
                      <TableHead className="w-[80px] text-right">Weight</TableHead>
                      <TableHead className="w-[80px] text-right">Max</TableHead>
                      <TableHead className="w-[100px] text-right">Current</TableHead>
                      <TableHead className="w-[120px] text-right">Simulated</TableHead>
                      <TableHead className="w-[90px] text-right">Delta</TableHead>
                      <TableHead className="w-[100px] text-right hidden md:table-cell">Weighted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simulatedCriteria.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          <Layers className="h-6 w-6 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No criteria data available for this framework</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      simulatedCriteria.map((c: any) => (
                        <TableRow key={c.id} className={c.isOverridden ? 'bg-blue-50/50' : ''}>
                          <TableCell>
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                              {c.code}
                            </span>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium line-clamp-1">{c.name}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm">{c.weight}%</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm text-muted-foreground">
                              {c.max_score}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium">
                              {(c.original_score || 0).toFixed(1)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max={c.max_score}
                              value={overrides[c.id] !== undefined ? overrides[c.id] : ''}
                              placeholder={c.original_score?.toFixed(1) || '0.0'}
                              onChange={(e) => handleOverrideChange(c.id, e.target.value)}
                              className={`h-7 w-20 text-right text-sm ml-auto ${
                                c.isOverridden ? 'border-blue-300 bg-blue-50' : ''
                              }`}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {c.delta !== 0 ? (
                              <span className={`text-sm font-medium flex items-center justify-end gap-1 ${
                                c.delta > 0 ? 'text-emerald-600' : 'text-red-600'
                              }`}>
                                {c.delta > 0 ? (
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                ) : (
                                  <ArrowDownRight className="h-3.5 w-3.5" />
                                )}
                                {c.delta > 0 ? '+' : ''}{c.delta.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right hidden md:table-cell">
                            <span className={`text-sm font-medium ${
                              c.isOverridden ? 'text-blue-700' : ''
                            }`}>
                              {c.weighted_simulated.toFixed(2)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}

                    {/* Totals Row */}
                    {simulatedCriteria.length > 0 && (
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={2}>
                          <span className="font-semibold">Total</span>
                        </TableCell>
                        <TableCell className="text-right">{totalMaxWeighted.toFixed(0)}%</TableCell>
                        <TableCell className="text-right">--</TableCell>
                        <TableCell className="text-right">{totalOriginal.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-blue-700">
                          {totalSimulated.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={
                            totalDelta > 0 ? 'text-emerald-600' :
                            totalDelta < 0 ? 'text-red-600' : ''
                          }>
                            {totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {totalSimulated.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}

        {/* No Data for Selected Framework */}
        {selectedFramework && !dataLoading && !simulationData && (
          <Card>
            <CardContent className="pt-12 pb-12">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <h3 className="font-medium mb-1">No Simulation Data</h3>
                <p className="text-sm">
                  Could not load score data for this framework. Make sure metrics and scores have been entered.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Save Dialog */}
        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Simulation</DialogTitle>
              <DialogDescription>
                Give your simulation a name to save it for future reference and comparison.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Simulation Name</label>
                <Input
                  placeholder="e.g., Best case Q4 improvements"
                  value={simulationName}
                  onChange={(e) => setSimulationName(e.target.value)}
                />
              </div>
              <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                <p>Current Score: <span className="font-medium">{totalOriginal.toFixed(2)}</span></p>
                <p>Simulated Score: <span className="font-medium text-blue-700">{totalSimulated.toFixed(2)}</span></p>
                <p>Impact: <span className={`font-medium ${totalDelta > 0 ? 'text-emerald-600' : totalDelta < 0 ? 'text-red-600' : ''}`}>
                  {totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(2)}
                </span></p>
                <p>Overrides: <span className="font-medium">{Object.keys(overrides).length}</span></p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveSimulationMutation.isPending || !simulationName.trim()}
              >
                {saveSimulationMutation.isPending ? 'Saving...' : 'Save Simulation'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Saved Simulations</DialogTitle>
              <DialogDescription>
                Load a previously saved simulation or compare results.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 max-h-96 overflow-y-auto">
              {savedLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : !savedSimulations || savedSimulations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No saved simulations yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedSimulations.map((sim: any) => (
                    <div
                      key={sim.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{sim.name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>
                            Score: {sim.total_original?.toFixed(1)} &rarr; {sim.total_simulated?.toFixed(1)}
                          </span>
                          {sim.created_at && (
                            <span>
                              {new Date(sim.created_at).toLocaleDateString('en-IN')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => handleLoadSimulation(sim)}
                        >
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteSimulation(sim.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  )
}
