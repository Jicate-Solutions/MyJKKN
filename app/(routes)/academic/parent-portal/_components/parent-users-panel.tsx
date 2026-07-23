'use client';

/**
 * Parent Portal admin — Parent User Data subtab (super_admin / principal only).
 *
 * Two modes:
 *  - page-filter (super_admin / staff): driven by the page's shared targeting
 *    (institution + class/section/learner) — no own dropdown (avoids a duplicate
 *    filter).
 *  - standalone (principal, who can't load the staff-only content filter): shows
 *    its own institution dropdown scoped to their institution.
 *
 * Passwords are scrypt-hashed (one-way) so the "Password" column shows the value
 * an admin last reset to, else the seed default JKKN@100.
 */
import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Building2, Download, KeyRound, Loader2, Search } from 'lucide-react';
import {
  ParentPortalAdminService,
  type PPInstitution,
  type PPTarget,
  type PPUserRow,
} from '@/lib/services/academic/parent-portal-admin-service';

const DEFAULT_PASSWORD = 'JKKN@100';

export function ParentUsersPanel({
  target,
  institutionName,
  standalone = false,
}: {
  target?: PPTarget;
  institutionName?: string;
  standalone?: boolean;
}) {
  const [institutions, setInstitutions] = useState<PPInstitution[]>([]);
  const [ownInstitutionId, setOwnInstitutionId] = useState(''); // standalone only
  const [users, setUsers] = useState<PPUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [resetRow, setResetRow] = useState<PPUserRow | null>(null);
  const [resetValue, setResetValue] = useState(DEFAULT_PASSWORD);
  const [saving, setSaving] = useState(false);

  // Active institution + name for export filename.
  const activeInstitutionId = standalone ? ownInstitutionId : target?.institutionId ?? '';
  const activeInstitutionName = standalone
    ? institutions.find((i) => i.id === ownInstitutionId)?.name ?? ''
    : institutionName ?? '';

  const load = useCallback(
    async (instOverride?: string) => {
      const query = standalone
        ? { institutionId: instOverride ?? ownInstitutionId }
        : target;
      if (!standalone && !target?.institutionId) {
        setUsers([]);
        return;
      }
      setLoading(true);
      try {
        const r = await ParentPortalAdminService.listParentUsers(query);
        setUsers(r.users ?? []);
        if (standalone) {
          setInstitutions(r.institutions ?? []);
          if (r.institutionId && !ownInstitutionId) setOwnInstitutionId(r.institutionId);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load parent users');
      } finally {
        setLoading(false);
      }
    },
    [standalone, target, ownInstitutionId]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone, target?.institutionId, target?.programIds, target?.sectionIds, target?.learnerIds]);

  const submitReset = async () => {
    if (!resetRow) return;
    if (resetValue.trim().length < 8) return toast.error('Password must be at least 8 characters.');
    setSaving(true);
    try {
      await ParentPortalAdminService.resetParentPassword(resetRow.accountId, resetValue.trim());
      toast.success(`Password reset for ${resetRow.learnerName}.`);
      setResetRow(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          u.learnerName.toLowerCase().includes(q) ||
          u.rollNumber.toLowerCase().includes(q) ||
          u.fatherMobile.includes(q) ||
          u.motherMobile.includes(q)
      )
    : users;

  const exportExcel = () => {
    if (!filtered.length) return toast.error('Nothing to export.');
    const rows = filtered.map((u, i) => ({
      'S.No': i + 1,
      'Roll Number': u.rollNumber,
      'Learner Name': u.learnerName,
      'Father Mobile Number': u.fatherMobile,
      'Mother Mobile Number': u.motherMobile,
      Password: u.password,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parent Users');
    XLSX.writeFile(wb, `${(activeInstitutionName || 'parent_users').replace(/[^\w]+/g, '_')}_parent_users.xlsx`);
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {standalone && (
          <div className="space-y-1.5 sm:max-w-xs sm:flex-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Institution
            </Label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={ownInstitutionId}
                disabled={institutions.length <= 1}
                onChange={(e) => {
                  setOwnInstitutionId(e.target.value);
                  load(e.target.value);
                }}
                className="w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-[#0b6d41] focus:outline-none focus:ring-1 focus:ring-[#0b6d41] disabled:opacity-60 dark:bg-neutral-900"
              >
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="relative sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, roll number or mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={exportExcel} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Export Excel
        </Button>
      </div>

      {!activeInstitutionId ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Pick an institution {standalone ? 'above' : 'in the filter above'}.
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No parent accounts found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">S.No</th>
                <th className="px-3 py-2">Roll No</th>
                <th className="px-3 py-2">Learner</th>
                <th className="px-3 py-2">Father Mobile</th>
                <th className="px-3 py-2">Mother Mobile</th>
                <th className="px-3 py-2">Password</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.accountId} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{u.rollNumber || '—'}</td>
                  <td className="px-3 py-2">{u.learnerName || '—'}</td>
                  <td className="px-3 py-2">{u.fatherMobile || '—'}</td>
                  <td className="px-3 py-2">{u.motherMobile || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono">{u.password}</span>
                    {!u.isAdminReset && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">(default)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-[#0b6d41]"
                      onClick={() => {
                        setResetRow(u);
                        setResetValue(DEFAULT_PASSWORD);
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Reset
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Passwords are one-way encrypted. The column shows the value an admin last reset to, or the
        default <span className="font-mono">{DEFAULT_PASSWORD}</span> for accounts never reset here.
        A parent&apos;s self-chosen password cannot be shown.
      </p>

      <Dialog open={!!resetRow} onOpenChange={(o) => !o && setResetRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          {resetRow && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Set a new password for{' '}
                <span className="font-medium text-foreground">{resetRow.learnerName}</span>
                {resetRow.rollNumber ? ` (${resetRow.rollNumber})` : ''}. The parent will use this to log in.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="reset-pw">New password</Label>
                <Input
                  id="reset-pw"
                  value={resetValue}
                  onChange={(e) => setResetValue(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetRow(null)} disabled={saving}>
              Cancel
            </Button>
            <Button className="bg-[#0b6d41] hover:bg-[#0a5733]" onClick={submitReset} disabled={saving}>
              {saving ? 'Resetting…' : 'Reset password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
