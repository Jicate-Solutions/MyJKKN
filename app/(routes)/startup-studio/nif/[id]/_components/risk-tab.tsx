'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  ShoppingCart,
  Users,
  DollarSign,
  PlusCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useRiskAssessments, useCreateRiskAssessment } from '@/hooks/startup-studio';
import { RiskRadarChart } from './risk-radar-chart';

// Risk level coloring per spec
function getRiskBadgeClass(avg: number) {
  if (avg >= 8) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (avg >= 5) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (avg >= 3) return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function getRiskLabel(avg: number) {
  if (avg >= 8) return 'Low';
  if (avg >= 5) return 'Moderate';
  if (avg >= 3) return 'High';
  return 'Critical';
}

// Score color strip for dimension cards
function scoreBarClass(score: number) {
  if (score >= 8) return 'bg-emerald-500';
  if (score >= 5) return 'bg-amber-500';
  if (score >= 3) return 'bg-orange-500';
  return 'bg-red-500';
}

const DIMENSION_CONFIG = [
  {
    key: 'magic',
    label: 'Magic',
    subtitle: 'Technology & IP',
    icon: Sparkles,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  {
    key: 'market',
    label: 'Market',
    subtitle: 'Customers & Competition',
    icon: ShoppingCart,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    key: 'management',
    label: 'Management',
    subtitle: 'Team & Execution',
    icon: Users,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    key: 'money',
    label: 'Money',
    subtitle: 'Funding & Financials',
    icon: DollarSign,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
];

interface RiskTabProps {
  candidateId: string;
}

// Usage:
// <RiskTab candidateId="uuid-of-candidate" />

export function RiskTab({ candidateId }: RiskTabProps) {
  const { data: rawData, isLoading } = useRiskAssessments(candidateId);
  const createRisk = useCreateRiskAssessment();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state — scores
  const [magicScore, setMagicScore] = useState('5');
  const [marketScore, setMarketScore] = useState('5');
  const [managementScore, setManagementScore] = useState('5');
  const [moneyScore, setMoneyScore] = useState('5');

  // Magic sub-fields
  const [magicIpStatus, setMagicIpStatus] = useState('');
  const [magicPrototypeMaturity, setMagicPrototypeMaturity] = useState('');
  const [magicHasTechAdvisory, setMagicHasTechAdvisory] = useState(false);
  const [magicNotes, setMagicNotes] = useState('');
  const [magicMitigation, setMagicMitigation] = useState('');

  // Market sub-fields
  const [marketCustomers, setMarketCustomers] = useState('');
  const [marketWtp, setMarketWtp] = useState('');
  const [marketCompetition, setMarketCompetition] = useState('');
  const [marketNotes, setMarketNotes] = useState('');
  const [marketMitigation, setMarketMitigation] = useState('');

  // Management sub-fields
  const [mgmtTeamSize, setMgmtTeamSize] = useState('');
  const [mgmtHasDomain, setMgmtHasDomain] = useState(false);
  const [mgmtHasTechLead, setMgmtHasTechLead] = useState(false);
  const [mgmtHasBizLead, setMgmtHasBizLead] = useState(false);
  const [mgmtNotes, setMgmtNotes] = useState('');
  const [mgmtMitigation, setMgmtMitigation] = useState('');

  // Money sub-fields
  const [moneyNotes, setMoneyNotes] = useState('');
  const [moneyMitigation, setMoneyMitigation] = useState('');

  // Priority risk
  const [priorityRisk, setPriorityRisk] = useState('');

  const assessments: any[] = Array.isArray(rawData) ? rawData : (rawData as any)?.data ?? [];
  const latest = assessments[0] ?? null;

  const currentScores = latest
    ? {
        magic: latest.magic_score ?? 0,
        market: latest.market_score ?? 0,
        management: latest.management_score ?? 0,
        money: latest.money_score ?? 0,
      }
    : { magic: 0, market: 0, management: 0, money: 0 };

  const avg =
    latest
      ? (currentScores.magic + currentScores.market + currentScores.management + currentScores.money) / 4
      : 0;

  // Trend data for line chart (oldest → newest)
  const trendData = [...assessments]
    .reverse()
    .map((a: any) => ({
      date: a.assessment_date
        ? new Date(a.assessment_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
        : new Date(a.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      avg: parseFloat(
        (
          ((a.magic_score ?? 0) + (a.market_score ?? 0) + (a.management_score ?? 0) + (a.money_score ?? 0)) /
          4
        ).toFixed(1)
      ),
    }));

  const resetForm = () => {
    setMagicScore('5'); setMarketScore('5'); setManagementScore('5'); setMoneyScore('5');
    setMagicIpStatus(''); setMagicPrototypeMaturity(''); setMagicHasTechAdvisory(false);
    setMagicNotes(''); setMagicMitigation('');
    setMarketCustomers(''); setMarketWtp(''); setMarketCompetition('');
    setMarketNotes(''); setMarketMitigation('');
    setMgmtTeamSize(''); setMgmtHasDomain(false); setMgmtHasTechLead(false);
    setMgmtHasBizLead(false); setMgmtNotes(''); setMgmtMitigation('');
    setMoneyNotes(''); setMoneyMitigation('');
    setPriorityRisk('');
  };

  const handleSubmit = async () => {
    await createRisk.mutateAsync({
      candidate_id: candidateId,
      magic_score: parseInt(magicScore, 10),
      market_score: parseInt(marketScore, 10),
      management_score: parseInt(managementScore, 10),
      money_score: parseInt(moneyScore, 10),
      magic_ip_status: magicIpStatus || null,
      magic_prototype_maturity: magicPrototypeMaturity || null,
      magic_has_tech_advisory: magicHasTechAdvisory,
      magic_notes: magicNotes || null,
      magic_mitigation_plan: magicMitigation || null,
      market_customers_validated: marketCustomers ? parseInt(marketCustomers, 10) : 0,
      market_willingness_to_pay: marketWtp || null,
      market_competition_level: marketCompetition || null,
      market_notes: marketNotes || null,
      market_mitigation_plan: marketMitigation || null,
      management_team_size: mgmtTeamSize ? parseInt(mgmtTeamSize, 10) : 1,
      management_has_domain_expert: mgmtHasDomain,
      management_has_tech_lead: mgmtHasTechLead,
      management_has_business_lead: mgmtHasBizLead,
      management_notes: mgmtNotes || null,
      management_mitigation_plan: mgmtMitigation || null,
      money_notes: moneyNotes || null,
      money_mitigation_plan: moneyMitigation || null,
      priority_risk_dimension: priorityRisk || null,
    });
    resetForm();
    setDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Radar + Overall Risk */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            4M Risk Assessment
          </CardTitle>
          <div className="flex items-center gap-3">
            {latest && (
              <Badge
                variant="outline"
                className={`${getRiskBadgeClass(avg)} border font-semibold`}
              >
                {getRiskLabel(avg)} Risk — {avg.toFixed(1)}/10
              </Badge>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Assess Risk
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New Risk Assessment (4M Framework)</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-2">
                  {/* Score overview */}
                  <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4">
                    {[
                      { label: 'Magic', score: magicScore, setter: setMagicScore },
                      { label: 'Market', score: marketScore, setter: setMarketScore },
                      { label: 'Management', score: managementScore, setter: setManagementScore },
                      { label: 'Money', score: moneyScore, setter: setMoneyScore },
                    ].map(({ label, score, setter }) => (
                      <div key={label} className="space-y-1.5">
                        <Label>{label} Score (1-10)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={score}
                            onChange={(e) => setter(e.target.value)}
                            className="w-20"
                          />
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${scoreBarClass(parseInt(score, 10))}`}
                              style={{ width: `${(parseInt(score, 10) / 10) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Magic section */}
                  <div className="space-y-3 border rounded-lg p-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-violet-600" />
                      Magic (Technology &amp; IP)
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>IP Status</Label>
                        <Select value={magicIpStatus} onValueChange={setMagicIpStatus}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="trade_secret">Trade Secret</SelectItem>
                            <SelectItem value="patent_filed">Patent Filed</SelectItem>
                            <SelectItem value="patent_granted">Patent Granted</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Prototype Maturity</Label>
                        <Select value={magicPrototypeMaturity} onValueChange={setMagicPrototypeMaturity}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="concept">Concept</SelectItem>
                            <SelectItem value="proof_of_concept">Proof of Concept</SelectItem>
                            <SelectItem value="alpha">Alpha</SelectItem>
                            <SelectItem value="beta">Beta</SelectItem>
                            <SelectItem value="production">Production</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={magicHasTechAdvisory}
                        onChange={(e) => setMagicHasTechAdvisory(e.target.checked)}
                        className="rounded"
                      />
                      Has technical advisory board
                    </label>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea rows={2} value={magicNotes} onChange={(e) => setMagicNotes(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Mitigation Plan</Label>
                      <Textarea rows={2} value={magicMitigation} onChange={(e) => setMagicMitigation(e.target.value)} />
                    </div>
                  </div>

                  {/* Market section */}
                  <div className="space-y-3 border rounded-lg p-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-blue-600" />
                      Market
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Validated Customers</Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={marketCustomers}
                          onChange={(e) => setMarketCustomers(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Willingness to Pay</Label>
                        <Select value={marketWtp} onValueChange={setMarketWtp}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unknown">Unknown</SelectItem>
                            <SelectItem value="interested">Interested</SelectItem>
                            <SelectItem value="verbal_commit">Verbal Commit</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="recurring">Recurring</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label>Competition Level</Label>
                        <Select value={marketCompetition} onValueChange={setMarketCompetition}>
                          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="blue_ocean">Blue Ocean</SelectItem>
                            <SelectItem value="few_competitors">Few Competitors</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="crowded">Crowded</SelectItem>
                            <SelectItem value="monopolized">Monopolized</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea rows={2} value={marketNotes} onChange={(e) => setMarketNotes(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Mitigation Plan</Label>
                      <Textarea rows={2} value={marketMitigation} onChange={(e) => setMarketMitigation(e.target.value)} />
                    </div>
                  </div>

                  {/* Management section */}
                  <div className="space-y-3 border rounded-lg p-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-600" />
                      Management (Team)
                    </h4>
                    <div className="space-y-1.5">
                      <Label>Team Size</Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="1"
                        value={mgmtTeamSize}
                        onChange={(e) => setMgmtTeamSize(e.target.value)}
                        className="w-24"
                      />
                    </div>
                    <div className="space-y-2">
                      {[
                        { label: 'Domain expert in team', value: mgmtHasDomain, setter: setMgmtHasDomain },
                        { label: 'Technical lead in team', value: mgmtHasTechLead, setter: setMgmtHasTechLead },
                        { label: 'Business lead in team', value: mgmtHasBizLead, setter: setMgmtHasBizLead },
                      ].map(({ label, value, setter }) => (
                        <label key={label} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={value}
                            onChange={(e) => setter(e.target.checked)}
                            className="rounded"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea rows={2} value={mgmtNotes} onChange={(e) => setMgmtNotes(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Mitigation Plan</Label>
                      <Textarea rows={2} value={mgmtMitigation} onChange={(e) => setMgmtMitigation(e.target.value)} />
                    </div>
                  </div>

                  {/* Money section */}
                  <div className="space-y-3 border rounded-lg p-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-amber-600" />
                      Money (Funding &amp; Financials)
                    </h4>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea rows={2} value={moneyNotes} onChange={(e) => setMoneyNotes(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Mitigation Plan</Label>
                      <Textarea rows={2} value={moneyMitigation} onChange={(e) => setMoneyMitigation(e.target.value)} />
                    </div>
                  </div>

                  {/* Priority Risk */}
                  <div className="space-y-1.5">
                    <Label>Biggest Risk Dimension</Label>
                    <Select value={priorityRisk} onValueChange={setPriorityRisk}>
                      <SelectTrigger><SelectValue placeholder="Which M needs most attention?" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="magic">Magic (Technology)</SelectItem>
                        <SelectItem value="market">Market</SelectItem>
                        <SelectItem value="management">Management</SelectItem>
                        <SelectItem value="money">Money</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={createRisk.isPending}>
                      {createRisk.isPending ? 'Saving...' : 'Save Assessment'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <div className="text-center py-10 space-y-3">
              <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">No risk assessment recorded yet.</p>
              <p className="text-sm text-muted-foreground">Click &quot;Assess Risk&quot; above to get started.</p>
            </div>
          ) : (
            <RiskRadarChart data={currentScores} />
          )}
        </CardContent>
      </Card>

      {/* Dimension Cards */}
      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DIMENSION_CONFIG.map(({ key, label, subtitle, icon: Icon, color, bg }) => {
            const score: number = (latest as any)[`${key}_score`] ?? 0;
            const notes: string = (latest as any)[`${key}_notes`] ?? '';
            const mitigation: string = (latest as any)[`${key}_mitigation_plan`] ?? '';
            const isPriority = latest.priority_risk_dimension === key;

            return (
              <Card key={key} className={`${isPriority ? 'border-destructive/60' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-2 ${color}`}>
                      <div className={`p-1.5 rounded-lg ${bg}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground">{subtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPriority && (
                        <Badge variant="destructive" className="text-xs">Priority</Badge>
                      )}
                      <span className="text-2xl font-bold">{score}</span>
                      <span className="text-xs text-muted-foreground">/10</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Score bar */}
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${scoreBarClass(score)}`}
                      style={{ width: `${(score / 10) * 100}%` }}
                    />
                  </div>
                  <Badge
                    variant="outline"
                    className={`${getRiskBadgeClass(score)} border text-xs`}
                  >
                    {getRiskLabel(score)}
                  </Badge>

                  {/* Magic-specific sub-indicators */}
                  {key === 'magic' && (
                    <div className="text-xs space-y-1 text-muted-foreground">
                      {latest.magic_ip_status && <p>IP: {latest.magic_ip_status.replace('_', ' ')}</p>}
                      {latest.magic_prototype_maturity && <p>Prototype: {latest.magic_prototype_maturity}</p>}
                      {latest.magic_has_tech_advisory && <p className="text-emerald-600">Has tech advisory</p>}
                    </div>
                  )}

                  {/* Market-specific sub-indicators */}
                  {key === 'market' && (
                    <div className="text-xs space-y-1 text-muted-foreground">
                      {latest.market_customers_validated > 0 && (
                        <p>{latest.market_customers_validated} validated customer(s)</p>
                      )}
                      {latest.market_willingness_to_pay && (
                        <p>WTP: {latest.market_willingness_to_pay.replace('_', ' ')}</p>
                      )}
                      {latest.market_competition_level && (
                        <p>Competition: {latest.market_competition_level.replace('_', ' ')}</p>
                      )}
                    </div>
                  )}

                  {/* Management sub-indicators */}
                  {key === 'management' && (
                    <div className="text-xs space-y-1 text-muted-foreground">
                      {latest.management_team_size > 0 && <p>Team size: {latest.management_team_size}</p>}
                      <div className="flex flex-wrap gap-2">
                        {latest.management_has_domain_expert && <span className="text-emerald-600">Domain expert</span>}
                        {latest.management_has_tech_lead && <span className="text-emerald-600">Tech lead</span>}
                        {latest.management_has_business_lead && <span className="text-emerald-600">Biz lead</span>}
                      </div>
                    </div>
                  )}

                  {notes && (
                    <p className="text-xs text-muted-foreground border-t pt-2">{notes}</p>
                  )}
                  {mitigation && (
                    <div className="text-xs bg-muted/50 rounded p-2">
                      <span className="font-medium">Mitigation: </span>
                      {mitigation}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Risk Trend Chart — only show if multiple assessments */}
      {assessments.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risk Score Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any) => [value, 'Avg Risk Score']}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
