'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Plus, Upload, Download } from 'lucide-react';

interface Props {
  // Called after recruiter(s) are created so the parent can react. For a single
  // add, the new recruiter's id is passed so the form can auto-select it.
  onCreated: (newRecruiterId?: string) => void;
}

interface CreateResponse {
  added: number;
  skipped: number;
  recruiters: Array<{ id: string; name: string }>;
}

const CSV_HEADER = 'name,website,contact_name,contact_email';
const CSV_TEMPLATE = `${CSV_HEADER}\nInfosys Limited,https://infosys.com,Priya Rao,priya.rao@infosys.com\nLocal Startup Pvt Ltd,,Arun Kumar,arun@localstartup.in\n`;

// Minimal CSV parse: one recruiter per line, comma-separated, optional header row.
// Recruiter names rarely contain commas; for those, use single add. Blank names
// are dropped. Returns the recruiter input objects.
function parseRecruiterCsv(text: string): Array<{
  name: string;
  website: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
}> {
  const out: Array<{ name: string; website: string | null; primary_contact_name: string | null; primary_contact_email: string | null }> = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cells = line.split(',').map((c) => c.trim());
    const name = cells[0] ?? '';
    // Skip a header row.
    if (name.toLowerCase() === 'name') continue;
    if (!name) continue;
    out.push({
      name,
      website: cells[1] || null,
      primary_contact_name: cells[2] || null,
      primary_contact_email: cells[3] || null,
    });
  }
  return out;
}

async function postRecruiters(body: unknown): Promise<CreateResponse> {
  const res = await fetch('/api/cdc/recruiters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (HTTP ${res.status})`);
  return json as CreateResponse;
}

export function RecruiterQuickAdd({ onCreated }: Props) {
  const qc = useQueryClient();

  // ── Single add ────────────────────────────────────────────────────────────
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  function resetNew() {
    setName('');
    setWebsite('');
    setContactName('');
    setContactEmail('');
  }

  async function handleCreateOne(e: React.FormEvent) {
    e.preventDefault();
    if (savingNew || !name.trim()) return;
    setSavingNew(true);
    try {
      const result = await postRecruiters({
        name: name.trim(),
        website: website.trim() || null,
        primary_contact_name: contactName.trim() || null,
        primary_contact_email: contactEmail.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ['cdc-lookups'] });
      if (result.added > 0) {
        toast.success(`Recruiter "${result.recruiters[0]?.name ?? name.trim()}" added`);
        onCreated(result.recruiters[0]?.id);
      } else {
        toast.info('That recruiter already exists — selecting it is enough');
        onCreated();
      }
      resetNew();
      setNewOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add recruiter');
    } finally {
      setSavingNew(false);
    }
  }

  // ── Bulk import ───────────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recruiters-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleImport() {
    if (importing) return;
    const recruiters = parseRecruiterCsv(csv);
    if (recruiters.length === 0) {
      toast.warning('No recruiter rows found — check the format (name in the first column)');
      return;
    }
    setImporting(true);
    try {
      const result = await postRecruiters({ recruiters });
      await qc.invalidateQueries({ queryKey: ['cdc-lookups'] });
      const parts = [`Added ${result.added}`];
      if (result.skipped) parts.push(`skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}`);
      const summary = parts.join(', ');
      if (result.added > 0) toast.success(summary);
      else toast.info(summary);
      onCreated();
      setCsv('');
      setImportOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import recruiters');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setNewOpen(true)}>
        <Plus className="w-3.5 h-3.5 mr-1" /> New
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setImportOpen(true)}>
        <Upload className="w-3.5 h-3.5 mr-1" /> Import
      </Button>

      {/* Single add */}
      <Dialog open={newOpen} onOpenChange={(o) => { if (!o) resetNew(); setNewOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Recruiter</DialogTitle>
            <DialogDescription>Add a company to the recruiter directory so you can pick it for this drive.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateOne} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rq_name">Name *</Label>
              <Input id="rq_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Infosys Limited" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq_website">Website</Label>
              <Input id="rq_website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rq_contact">Contact name</Label>
                <Input id="rq_contact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rq_email">Contact email</Label>
                <Input id="rq_email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { resetNew(); setNewOpen(false); }}>Cancel</Button>
              <Button type="submit" disabled={savingNew || !name.trim()}>
                {savingNew && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Recruiter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk import */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) setCsv(''); setImportOpen(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Import Recruiters</DialogTitle>
            <DialogDescription>
              One recruiter per line: <code className="text-xs">{CSV_HEADER}</code>. Only <strong>name</strong> is required. Duplicate names are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download template
              </Button>
              <label className="inline-flex">
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
                <span className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm cursor-pointer hover:bg-muted">
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload .csv
                </span>
              </label>
            </div>
            <Textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={`${CSV_HEADER}\nInfosys Limited,https://infosys.com,Priya Rao,priya.rao@infosys.com`}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setCsv(''); setImportOpen(false); }}>Cancel</Button>
            <Button type="button" onClick={handleImport} disabled={importing || csv.trim().length === 0}>
              {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
