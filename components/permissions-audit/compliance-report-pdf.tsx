// components/permissions-audit/compliance-report-pdf.tsx
// ============================================================================
// React-PDF document for the MyJKKN Permissions Compliance Report.
// Rendered server-side via @react-pdf/renderer's renderToBuffer(). Styles use
// its StyleSheet API — NO Tailwind/CSS, only the inline style subset.
// ============================================================================

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import type { ComplianceReportData } from '@/lib/services/permissions-audit/compliance-report-service';

const colors = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  accent: '#4f46e5',
  accentBg: '#eef2ff',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  warn: '#d97706',
  warnBg: '#fef3c7',
  ok: '#16a34a',
  okBg: '#dcfce7',
  zebra: '#f8fafc',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: colors.ink,
    lineHeight: 1.4,
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.accent,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 10,
    color: colors.muted,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 6,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: 3,
  },
  paragraph: {
    marginBottom: 6,
    color: colors.ink,
  },
  mutedParagraph: {
    marginBottom: 6,
    color: colors.muted,
    fontSize: 9,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  kpiCard: {
    width: '23%',
    padding: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 4,
    marginRight: '2%',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 8,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.ink,
  },
  kpiValueAccent: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.accent,
  },
  kpiValueDanger: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.danger,
  },
  kpiValueWarn: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.warn,
  },
  tableContainer: {
    marginTop: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 3,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  tableRowAlt: {
    flexDirection: 'row',
    backgroundColor: colors.zebra,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.accentBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tableCellHeader: {
    fontWeight: 'bold',
    fontSize: 9,
    padding: 5,
    color: colors.accent,
  },
  tableCell: {
    fontSize: 9,
    padding: 5,
    color: colors.ink,
  },
  tableCellMuted: {
    fontSize: 9,
    padding: 5,
    color: colors.muted,
  },
  pillOk: {
    fontSize: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: colors.okBg,
    color: colors.ok,
    borderRadius: 2,
  },
  pillWarn: {
    fontSize: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: colors.warnBg,
    color: colors.warn,
    borderRadius: 2,
  },
  pillDanger: {
    fontSize: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: colors.dangerBg,
    color: colors.danger,
    borderRadius: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: colors.muted,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 6,
  },
  signatureSection: {
    marginTop: 25,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 3,
    backgroundColor: colors.zebra,
  },
  signatureLine: {
    marginTop: 22,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    width: 200,
  },
});

function Kpi({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'accent' | 'danger' | 'warn';
}) {
  const valueStyle =
    tone === 'accent'
      ? styles.kpiValueAccent
      : tone === 'danger'
      ? styles.kpiValueDanger
      : tone === 'warn'
      ? styles.kpiValueWarn
      : styles.kpiValue;
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={valueStyle}>{value}</Text>
    </View>
  );
}

function TableHeaderRow({ cells }: { cells: Array<{ label: string; width: string }> }) {
  return (
    <View style={styles.tableHeader}>
      {cells.map((c) => (
        <Text key={c.label} style={[styles.tableCellHeader, { width: c.width }]}>
          {c.label}
        </Text>
      ))}
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

export function ComplianceReportPdf({ data }: { data: ComplianceReportData }) {
  const { totals } = data;
  const hasIssues = totals.orphans > 0 || totals.mismatches > 0;

  return (
    <Document
      title={`MyJKKN Permissions Compliance Report — ${data.generatedAt.slice(0, 10)}`}
      author="MyJKKN Permissions Audit"
      subject="Permissions, roles, and RLS policy compliance report"
    >
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Page 1 — Cover + Executive Summary                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>MyJKKN Permissions Compliance Report</Text>
          <Text style={styles.headerSub}>
            Generated {formatDate(data.generatedAt)}
          </Text>
          <Text style={styles.headerSub}>
            By {data.generatedBy.fullName || '—'}{' '}
            ({data.generatedBy.email})
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <Text style={styles.paragraph}>
          This report captures the state of the MyJKKN role and permission
          system at a point in time. It covers user-to-role assignments, the
          synchronisation between profile roles and role memberships,
          Row-Level Security (RLS) policy coverage at the database layer, and
          per-role permission coverage.
        </Text>
        {hasIssues ? (
          <Text style={[styles.paragraph, { color: colors.danger }]}>
            Attention: {totals.orphans} users have no role assignment, and{' '}
            {totals.mismatches} users have a profile role that does not match
            their primary role-membership record. See Sections 3 and 4.
          </Text>
        ) : (
          <Text style={[styles.paragraph, { color: colors.ok }]}>
            No orphan users or role mismatches detected. Role assignments are
            in sync.
          </Text>
        )}

        <View style={styles.kpiRow}>
          <Kpi label="Total users" value={totals.users} tone="accent" />
          <Kpi label="Roles" value={totals.roles} tone="accent" />
          <Kpi label="Super admins" value={totals.superAdmins} tone="accent" />
          <Kpi label="RLS policies" value={totals.rlsPolicies} tone="accent" />
          <Kpi
            label="Orphan users"
            value={totals.orphans}
            tone={totals.orphans > 0 ? 'danger' : 'default'}
          />
          <Kpi
            label="Role mismatches"
            value={totals.mismatches}
            tone={totals.mismatches > 0 ? 'danger' : 'default'}
          />
          <Kpi
            label="Tables with RLS"
            value={totals.tablesWithRls}
            tone="accent"
          />
          <Kpi
            label="Permission flags"
            value={data.permissionCoverage.filter((p) => p.flagged).length}
            tone={
              data.permissionCoverage.some((p) => p.flagged) ? 'warn' : 'default'
            }
          />
        </View>

        <Text style={styles.sectionTitle}>1. Role Distribution</Text>
        <Text style={styles.mutedParagraph}>
          Users are counted per role using both their profile.role (legacy
          single-role field) and user_roles (many-to-many). A non-zero delta
          indicates the two are out of sync.
        </Text>
        <View style={styles.tableContainer}>
          <TableHeaderRow
            cells={[
              { label: 'Role', width: '40%' },
              { label: 'Type', width: '15%' },
              { label: 'Profiles', width: '15%' },
              { label: 'user_roles', width: '15%' },
              { label: 'Delta', width: '15%' },
            ]}
          />
          {data.roleDistribution.map((r, idx) => (
            <View
              key={r.roleKey}
              style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            >
              <Text style={[styles.tableCell, { width: '40%' }]}>
                {r.roleName}{'\n'}
                <Text style={{ color: colors.muted, fontSize: 8 }}>{r.roleKey}</Text>
              </Text>
              <Text style={[styles.tableCellMuted, { width: '15%' }]}>
                {r.isSystemRole ? 'System' : 'Custom'}
              </Text>
              <Text style={[styles.tableCell, { width: '15%' }]}>
                {r.profileCount}
              </Text>
              <Text style={[styles.tableCell, { width: '15%' }]}>
                {r.userRolesCount}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: '15%' },
                  r.delta !== 0 ? { color: colors.danger } : null,
                ]}
              >
                {r.delta > 0 ? `+${r.delta}` : r.delta}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>MyJKKN Permissions Compliance Report</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Page 2 — Orphans + Mismatches                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>
          2. Orphan Users ({totals.orphans})
        </Text>
        <Text style={styles.mutedParagraph}>
          Users with a profile row but no entry in user_roles. They will fall
          back to the legacy profile.role field for access. Remediation: assign
          a role via Role Management.
        </Text>
        {data.orphanUsers.length === 0 ? (
          <Text style={[styles.paragraph, { color: colors.ok }]}>
            None. All profiles have at least one role membership.
          </Text>
        ) : (
          <View style={styles.tableContainer}>
            <TableHeaderRow
              cells={[
                { label: 'Email', width: '45%' },
                { label: 'Name', width: '35%' },
                { label: 'Profile role', width: '20%' },
              ]}
            />
            {data.orphanUsers.map((u, idx) => (
              <View
                key={`${u.email}-${idx}`}
                style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
              >
                <Text style={[styles.tableCell, { width: '45%' }]}>
                  {u.email || '—'}
                </Text>
                <Text style={[styles.tableCell, { width: '35%' }]}>
                  {u.fullName || '—'}
                </Text>
                <Text style={[styles.tableCellMuted, { width: '20%' }]}>
                  {u.role || '—'}
                </Text>
              </View>
            ))}
          </View>
        )}
        {data.orphanUsersTruncated > 0 && (
          <Text style={styles.mutedParagraph}>
            …and {data.orphanUsersTruncated} more. Full list available via the
            System Health tab.
          </Text>
        )}

        <Text style={styles.sectionTitle}>
          3. Role Mismatches ({totals.mismatches})
        </Text>
        <Text style={styles.mutedParagraph}>
          Users where profile.role (legacy field) does NOT match the role_key
          of their primary user_roles entry. This typically happens when a
          user's role is updated in one table but the sync trigger fails.
        </Text>
        {data.roleMismatches.length === 0 ? (
          <Text style={[styles.paragraph, { color: colors.ok }]}>
            None. All profile roles match their primary role membership.
          </Text>
        ) : (
          <View style={styles.tableContainer}>
            <TableHeaderRow
              cells={[
                { label: 'Email', width: '40%' },
                { label: 'Name', width: '25%' },
                { label: 'profile.role', width: '17.5%' },
                { label: 'primary role', width: '17.5%' },
              ]}
            />
            {data.roleMismatches.map((u, idx) => (
              <View
                key={`${u.email}-${idx}`}
                style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
              >
                <Text style={[styles.tableCell, { width: '40%' }]}>
                  {u.email || '—'}
                </Text>
                <Text style={[styles.tableCell, { width: '25%' }]}>
                  {u.fullName || '—'}
                </Text>
                <Text
                  style={[styles.tableCell, { width: '17.5%', color: colors.danger }]}
                >
                  {u.profileRole || '—'}
                </Text>
                <Text style={[styles.tableCell, { width: '17.5%' }]}>
                  {u.actualRoleKey || '—'}
                </Text>
              </View>
            ))}
          </View>
        )}
        {data.roleMismatchesTruncated > 0 && (
          <Text style={styles.mutedParagraph}>
            …and {data.roleMismatchesTruncated} more.
          </Text>
        )}

        <View style={styles.footer} fixed>
          <Text>MyJKKN Permissions Compliance Report</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Page 3 — RLS coverage + Permission coverage                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>
          4. RLS Policy Coverage ({totals.rlsPolicies} policies across{' '}
          {totals.tablesWithRls} tables)
        </Text>
        <Text style={styles.mutedParagraph}>
          Row-Level Security policies enforced at the database level.
          Breakdown by command type and the ten tables with the most policies.
        </Text>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
          <View style={{ width: '40%' }}>
            <Text
              style={{ fontWeight: 'bold', fontSize: 10, marginBottom: 4 }}
            >
              Policies by command
            </Text>
            <View style={styles.tableContainer}>
              <TableHeaderRow
                cells={[
                  { label: 'Command', width: '60%' },
                  { label: 'Count', width: '40%' },
                ]}
              />
              {Object.entries(data.rlsCoverage.policiesByCommand)
                .sort((a, b) => b[1] - a[1])
                .map(([cmd, count], idx) => (
                  <View
                    key={cmd}
                    style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
                  >
                    <Text style={[styles.tableCell, { width: '60%' }]}>{cmd}</Text>
                    <Text style={[styles.tableCell, { width: '40%' }]}>
                      {count}
                    </Text>
                  </View>
                ))}
            </View>
          </View>

          <View style={{ width: '58%' }}>
            <Text
              style={{ fontWeight: 'bold', fontSize: 10, marginBottom: 4 }}
            >
              Top {data.rlsCoverage.topTablesByPolicyCount.length} tables by
              policy count
            </Text>
            <View style={styles.tableContainer}>
              <TableHeaderRow
                cells={[
                  { label: 'Table', width: '70%' },
                  { label: 'Policies', width: '30%' },
                ]}
              />
              {data.rlsCoverage.topTablesByPolicyCount.map((t, idx) => (
                <View
                  key={t.table}
                  style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
                >
                  <Text style={[styles.tableCell, { width: '70%' }]}>
                    {t.table}
                  </Text>
                  <Text style={[styles.tableCell, { width: '30%' }]}>
                    {t.count}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>5. Permission Coverage per Role</Text>
        <Text style={styles.mutedParagraph}>
          For each role, how many permission keys are defined and what
          percentage are granted. Roles with fewer than 10% granted out of 10+
          defined permissions are flagged as potentially under-provisioned.
        </Text>
        <View style={styles.tableContainer}>
          <TableHeaderRow
            cells={[
              { label: 'Role', width: '35%' },
              { label: 'Defined', width: '15%' },
              { label: 'Granted', width: '15%' },
              { label: '% Granted', width: '20%' },
              { label: 'Status', width: '15%' },
            ]}
          />
          {data.permissionCoverage
            .sort((a, b) => a.grantedPercent - b.grantedPercent)
            .map((p, idx) => (
              <View
                key={p.roleKey}
                style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
              >
                <Text style={[styles.tableCell, { width: '35%' }]}>
                  {p.roleName}
                  {p.isSystemRole && (
                    <Text style={{ color: colors.muted, fontSize: 8 }}>
                      {' '}(system)
                    </Text>
                  )}
                </Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>
                  {p.totalDefined}
                </Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>
                  {p.granted}
                </Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>
                  {p.grantedPercent}%
                </Text>
                <View style={{ width: '15%', padding: 5 }}>
                  {p.flagged ? (
                    <Text style={styles.pillWarn}>Flagged</Text>
                  ) : p.grantedPercent === 100 ? (
                    <Text style={styles.pillOk}>Full</Text>
                  ) : (
                    <Text style={styles.pillOk}>OK</Text>
                  )}
                </View>
              </View>
            ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>MyJKKN Permissions Compliance Report</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* Page 4 — Super admins + Sign-off                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>
          6. Super Administrators ({totals.superAdmins})
        </Text>
        <Text style={styles.mutedParagraph}>
          Users flagged with super_admin role or is_super_admin=true. These
          accounts bypass RLS; reviewing this list is a control requirement.
        </Text>
        <View style={styles.tableContainer}>
          <TableHeaderRow
            cells={[
              { label: 'Email', width: '35%' },
              { label: 'Name', width: '25%' },
              { label: 'Active', width: '10%' },
              { label: 'Role row', width: '10%' },
              { label: 'Last login', width: '20%' },
            ]}
          />
          {data.superAdmins.map((sa, idx) => (
            <View
              key={`${sa.email}-${idx}`}
              style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            >
              <Text style={[styles.tableCell, { width: '35%' }]}>
                {sa.email || '—'}
              </Text>
              <Text style={[styles.tableCell, { width: '25%' }]}>
                {sa.fullName || '—'}
              </Text>
              <View style={{ width: '10%', padding: 5 }}>
                {sa.isActive ? (
                  <Text style={styles.pillOk}>Yes</Text>
                ) : (
                  <Text style={styles.pillDanger}>No</Text>
                )}
              </View>
              <View style={{ width: '10%', padding: 5 }}>
                {sa.hasUserRolesEntry ? (
                  <Text style={styles.pillOk}>Yes</Text>
                ) : (
                  <Text style={styles.pillWarn}>No</Text>
                )}
              </View>
              <Text style={[styles.tableCellMuted, { width: '20%' }]}>
                {formatDateShort(sa.lastLogin)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Sign-off</Text>
        <Text style={styles.paragraph}>
          By signing below, the reviewer confirms that this compliance report
          has been reviewed and any flagged items (orphan users, role
          mismatches, under-provisioned roles) will be addressed per MyJKKN's
          internal access-control policy.
        </Text>
        <View style={styles.signatureSection}>
          <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Reviewed by:
          </Text>
          <View style={styles.signatureLine} />
          <Text style={[styles.mutedParagraph, { marginTop: 3 }]}>
            Signature / Name / Designation
          </Text>
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Date:</Text>
            <View style={styles.signatureLine} />
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>MyJKKN Permissions Compliance Report</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
