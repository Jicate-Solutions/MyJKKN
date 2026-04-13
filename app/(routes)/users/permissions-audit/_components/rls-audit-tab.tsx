'use client';

import { useEffect, useState } from 'react';
import { BeatLoader } from 'react-spinners';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle,
  Building,
  ChevronDown,
  ChevronRight,
  Code,
  Database,
  Key,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  Unlock,
  User,
  Users
} from 'lucide-react';

import type { RlsAuditResponse, RlsPolicy } from '@/types/permissions-audit';
import type { AccessType } from '@/lib/utils/rls-expression-parser';

// ─── Access Type Config ──────────────────────────────────────────────────────

const ACCESS_TYPE_CONFIG: Record<
  AccessType,
  { label: string; icon: React.ReactNode; className: string }
> = {
  role_check: {
    label: 'Role Check',
    icon: <Users className="h-3 w-3" />,
    className:
      'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400'
  },
  permission_based: {
    label: 'Permission Based',
    icon: <Key className="h-3 w-3" />,
    className:
      'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400'
  },
  super_admin: {
    label: 'Super Admin',
    icon: <Shield className="h-3 w-3" />,
    className: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400'
  },
  institution_scoped: {
    label: 'Institution Scoped',
    icon: <Building className="h-3 w-3" />,
    className:
      'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-400'
  },
  self_only: {
    label: 'Self Only',
    icon: <User className="h-3 w-3" />,
    className:
      'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400'
  },
  service_role: {
    label: 'Service Role',
    icon: <Server className="h-3 w-3" />,
    className:
      'text-gray-600 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400'
  },
  all_authenticated: {
    label: 'All Authenticated',
    icon: <Users className="h-3 w-3" />,
    className:
      'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400'
  },
  permissive: {
    label: 'Permissive',
    icon: <Unlock className="h-3 w-3" />,
    className:
      'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400'
  },
  complex: {
    label: 'Complex',
    icon: <Code className="h-3 w-3" />,
    className:
      'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400'
  }
};

// ─── Stat Card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger';
}

function StatCard({ label, value, icon, variant = 'default' }: StatCardProps) {
  const bgMap = {
    default: 'bg-slate-50 dark:bg-slate-900',
    warning: 'bg-amber-50 dark:bg-amber-950',
    danger: 'bg-red-50 dark:bg-red-950'
  };
  const textMap = {
    default: 'text-slate-700 dark:text-slate-300',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400'
  };

  return (
    <Card
      className={`relative overflow-hidden ${bgMap[variant]} hover:shadow-md transition-shadow`}
    >
      <CardContent className="pt-6 pb-5">
        <div className="absolute top-4 right-4 opacity-60">{icon}</div>
        <p
          className={`text-3xl font-bold tracking-tight ${textMap[variant]}`}
        >
          {value.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          {label}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Access Type Badge ───────────────────────────────────────────────────────

function AccessTypeBadge({ accessType }: { accessType: AccessType }) {
  const config = ACCESS_TYPE_CONFIG[accessType];
  if (!config) return <Badge variant="outline">{accessType}</Badge>;

  return (
    <Badge
      variant="secondary"
      className={`gap-1 font-medium ${config.className}`}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RlsAuditTab() {
  const [data, setData] = useState<RlsAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedExpression, setExpandedExpression] = useState<string | null>(
    null
  );

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users/permissions-audit/rls-policies');
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const json: RlsAuditResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <BeatLoader size={10} color="hsl(var(--primary))" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription className="flex items-center gap-2">
          {error}
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  // ── Derive modules ──

  const modules = Array.from(
    new Set(data.tables.map((t) => t.module))
  ).sort();

  // ── Filter tables ──

  const filteredTables = data.tables.filter((t) => {
    if (moduleFilter !== 'all' && t.module !== moduleFilter) return false;
    if (typeFilter !== 'all') {
      // Keep table if any policy matches the type filter
      const hasMatchingPolicy = t.policies.some(
        (p) => p.parsed.accessType === typeFilter
      );
      // Also keep tables with no policies (they should still be visible)
      if (!hasMatchingPolicy && t.policies.length > 0) return false;
    }
    return true;
  });

  // ── Group by module ──

  const groupedByModule: Record<
    string,
    RlsAuditResponse['tables']
  > = {};
  for (const table of filteredTables) {
    if (!groupedByModule[table.module]) {
      groupedByModule[table.module] = [];
    }
    groupedByModule[table.module].push(table);
  }

  const sortedModules = Object.keys(groupedByModule).sort();

  return (
    <div className="space-y-6">
      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Tables"
          value={data.stats.totalTables}
          icon={<Database className="h-5 w-5" />}
        />
        <StatCard
          label="Policies"
          value={data.stats.totalPolicies}
          icon={<Shield className="h-5 w-5" />}
        />
        <StatCard
          label="Modules"
          value={data.stats.totalModules}
          icon={<Building className="h-5 w-5" />}
        />
        <StatCard
          label="Unmapped"
          value={data.stats.unmappedTables}
          icon={<AlertCircle className="h-5 w-5" />}
          variant={data.stats.unmappedTables > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="No Policies"
          value={data.stats.tablesWithoutPolicies}
          icon={<Unlock className="h-5 w-5" />}
          variant={
            data.stats.tablesWithoutPolicies > 0 ? 'danger' : 'default'
          }
        />
      </div>

      {/* ── Filter Row ── */}
      <div className="flex gap-3">
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(Object.keys(ACCESS_TYPE_CONFIG) as AccessType[]).map((key) => (
              <SelectItem key={key} value={key}>
                {ACCESS_TYPE_CONFIG[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Module Sections ── */}
      {sortedModules.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No results</AlertTitle>
          <AlertDescription>
            No tables match the current filters.
          </AlertDescription>
        </Alert>
      )}

      {sortedModules.map((moduleName) => {
        const tables = groupedByModule[moduleName];
        const totalPolicies = tables.reduce(
          (acc, t) => acc + t.policies.length,
          0
        );

        return (
          <Card key={moduleName}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-muted-foreground" />
                {moduleName}
                <Badge variant="secondary" className="ml-2">
                  {tables.length} table{tables.length !== 1 ? 's' : ''}
                </Badge>
                <Badge variant="outline">
                  {totalPolicies} polic{totalPolicies !== 1 ? 'ies' : 'y'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Table</TableHead>
                    <TableHead className="w-[80px]">Op</TableHead>
                    <TableHead>Policy Name</TableHead>
                    <TableHead className="w-[150px]">Access Type</TableHead>
                    <TableHead className="w-[100px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((table) => {
                    if (table.policies.length === 0) {
                      // Table with no policies
                      return (
                        <TableRow
                          key={table.tableName}
                          className="bg-red-50/50 dark:bg-red-950/20"
                        >
                          <TableCell className="font-mono text-xs align-top">
                            {table.tableName}
                            {table.missingOperations.length > 0 && (
                              <div className="mt-1">
                                <Badge
                                  variant="outline"
                                  className="text-amber-600 border-amber-300 dark:text-amber-400 text-[10px]"
                                >
                                  No{' '}
                                  {table.missingOperations.join('/')}
                                </Badge>
                              </div>
                            )}
                          </TableCell>
                          <TableCell
                            colSpan={4}
                            className="italic text-red-600 dark:text-red-400 text-sm"
                          >
                            No policies defined — RLS enabled but no access
                            rules
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return table.policies.map(
                      (policy: RlsPolicy, pIdx: number) => {
                        const expressionKey = `${table.tableName}-${policy.policyName}`;
                        const isExpanded =
                          expandedExpression === expressionKey;
                        const isFirstRow = pIdx === 0;

                        return (
                          <TableRow key={expressionKey}>
                            {isFirstRow && (
                              <TableCell
                                className="font-mono text-xs align-top"
                                rowSpan={table.policies.length}
                              >
                                {table.tableName}
                                {table.missingOperations.length > 0 && (
                                  <div className="mt-1">
                                    <Badge
                                      variant="outline"
                                      className="text-amber-600 border-amber-300 dark:text-amber-400 text-[10px]"
                                    >
                                      No{' '}
                                      {table.missingOperations.join('/')}
                                    </Badge>
                                  </div>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="w-[80px]">
                              <Badge variant="outline" className="font-mono text-xs">
                                {policy.command}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {policy.policyName}
                            </TableCell>
                            <TableCell className="w-[150px]">
                              <AccessTypeBadge
                                accessType={policy.parsed.accessType}
                              />
                            </TableCell>
                            <TableCell className="w-[100px]">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() =>
                                  setExpandedExpression(
                                    isExpanded ? null : expressionKey
                                  )
                                }
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronDown className="h-3 w-3 mr-1" />
                                    Hide SQL
                                  </>
                                ) : (
                                  <>
                                    <ChevronRight className="h-3 w-3 mr-1" />
                                    View SQL
                                  </>
                                )}
                              </Button>
                              {isExpanded && (
                                <pre className="mt-2 bg-muted p-2 rounded text-[10px] max-w-md overflow-x-auto whitespace-pre-wrap">
                                  {policy.usingExpression && (
                                    <>
                                      <span className="font-semibold text-muted-foreground">
                                        USING:
                                      </span>
                                      {'\n'}
                                      {policy.usingExpression}
                                    </>
                                  )}
                                  {policy.usingExpression &&
                                    policy.withCheckExpression && (
                                      <>
                                        {'\n\n'}
                                      </>
                                    )}
                                  {policy.withCheckExpression && (
                                    <>
                                      <span className="font-semibold text-muted-foreground">
                                        WITH CHECK:
                                      </span>
                                      {'\n'}
                                      {policy.withCheckExpression}
                                    </>
                                  )}
                                </pre>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      }
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
