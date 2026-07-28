'use client';

// Department Playbook panel — three AI-drafted artifacts (organogram / SOP /
// workflow) per department, each drafted on the ₹0 Max lane and approved by a
// human manager. Self-contained: it reads /api/mba/dept-artifacts, triggers a
// draft + polls the collect route, and (for managers) calls the approve /
// request-changes RPCs directly. Dropped into each area section of the analytics
// dashboard; harmless when nothing is drafted yet (shows a "Draft with AI" cta).

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Check,
  RefreshCw,
  Loader2,
  FileText,
  GitBranch,
  Network,
  Eye,
  History,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { EditArtifactDialog } from './edit-artifact-dialog';
import {
  ViewPlaybookDialog,
  RequestChangesDialog,
  HistoryDialog,
  ConfirmDeleteDialog,
} from './playbook-dialogs';

// Kept inline so this panel builds standalone (the matching backend types live
// in lib/services/mba-dept-artifacts, shipped in the drafting-engine PR).
const ARTIFACT_TYPES = ['organogram', 'sop', 'workflow'] as const;
type ArtifactType = (typeof ARTIFACT_TYPES)[number];
const ARTIFACT_LABEL: Record<ArtifactType, string> = {
  organogram: 'Organogram',
  sop: 'Standard Operating Procedure',
  workflow: 'Workflow',
};
interface MbaDeptArtifact {
  id: string;
  area_id: string;
  artifact_type: ArtifactType;
  content: Record<string, unknown>;
  status: 'ai_drafted' | 'approved' | 'needs_changes';
  version: number;
  ai_model: string | null;
  ai_drafted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  updated_at: string | null;
}

interface Props {
  areaId: string;
  areaLabel: string;
  canManage: boolean;
}

const TYPE_ICON: Record<ArtifactType, typeof FileText> = {
  organogram: Network,
  sop: FileText,
  workflow: GitBranch,
};

const STATUS_STYLE: Record<string, string> = {
  ai_drafted: 'border-blue-200 bg-blue-50 text-blue-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  needs_changes: 'border-amber-200 bg-amber-50 text-amber-700',
};
const STATUS_LABEL: Record<string, string> = {
  ai_drafted: 'AI draft — awaiting review',
  approved: 'Approved',
  needs_changes: 'Changes requested',
};

// Approved playbooks are nudged for re-review after ~6 months.
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182;
function isStale(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > SIX_MONTHS_MS;
}

export function DeptPlaybookPanel({ areaId, areaLabel, canManage }: Props) {
  const [byType, setByType] = useState<Partial<Record<ArtifactType, MbaDeptArtifact>>>({});
  const [busy, setBusy] = useState<Partial<Record<ArtifactType, string>>>({});
  // A string holds a specific server-supplied reason; `true` is the generic
  // "AI couldn't draft" fallback; absent/undefined means no failure.
  const [failed, setFailed] = useState<Partial<Record<ArtifactType, string | boolean>>>({});

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/mba/dept-artifacts?area_id=${encodeURIComponent(areaId)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { artifacts: MbaDeptArtifact[] };
      const map: Partial<Record<ArtifactType, MbaDeptArtifact>> = {};
      for (const a of json.artifacts ?? []) map[a.artifact_type] = a;
      setByType(map);
    } catch {
      /* keep last state */
    }
  }, [areaId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const draft = useCallback(
    async (type: ArtifactType) => {
      const before = byType[type]?.version ?? 0;
      setFailed((f) => ({ ...f, [type]: undefined }));
      setBusy((b) => ({ ...b, [type]: 'Drafting…' }));
      let landed = false;
      try {
        const res = await fetch('/api/mba/dept-artifacts/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ area_id: areaId, artifact_type: type }),
        });
        if (!res.ok) {
          // Surface the server's specific reason when it sent one, instead of
          // only the generic banner below.
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (j.error) setFailed((f) => ({ ...f, [type]: j.error }));
          return; // landed stays false -> failure shown below
        }
        // Poll the collect route until the draft lands (Mac seat drains in ~seconds).
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 4000));
          await fetch('/api/mba/dept-artifacts/collect', { method: 'POST' }).catch(() => {});
          const res2 = await fetch(
            `/api/mba/dept-artifacts?area_id=${encodeURIComponent(areaId)}`,
          );
          if (res2.ok) {
            const json = (await res2.json()) as { artifacts: MbaDeptArtifact[] };
            const found = (json.artifacts ?? []).find((a) => a.artifact_type === type);
            if (found && found.version > before) {
              const map: Partial<Record<ArtifactType, MbaDeptArtifact>> = {};
              for (const a of json.artifacts ?? []) map[a.artifact_type] = a;
              setByType(map);
              landed = true;
              break;
            }
          }
        }
      } finally {
        setBusy((b) => ({ ...b, [type]: undefined }));
        // The AI couldn't produce a usable draft in time — offer a retry.
        // Keep any specific server reason already captured above.
        if (!landed) setFailed((f) => ({ ...f, [type]: f[type] ?? true }));
      }
    },
    [areaId, byType],
  );

  // Cast: these RPCs are new and not yet in the generated DB types (codebase
  // idiom, e.g. mba-rotation-tick). Anon-locked, granted to authenticated.
  function rpcClient() {
    return createClientSupabaseClient() as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  }

  // Reopen unlocks an approved artifact (approve happens inside the edit dialog;
  // request-changes happens inside the note dialog).
  const reopen = useCallback(
    async (type: ArtifactType) => {
      setBusy((b) => ({ ...b, [type]: 'Reopening…' }));
      try {
        const { error } = await rpcClient().rpc('fn_mba_dept_artifact_reopen', {
          p_area_id: areaId,
          p_artifact_type: type,
        });
        if (error) {
          toast.error(`Couldn't reopen — ${errMsg(error) || 'please try again.'}`);
          return;
        }
        await refetch();
      } finally {
        setBusy((b) => ({ ...b, [type]: undefined }));
      }
    },
    [areaId, refetch],
  );

  const requestChanges = useCallback(
    async (type: ArtifactType, note: string) => {
      const { error } = await rpcClient().rpc('fn_mba_dept_artifact_request_changes', {
        p_area_id: areaId,
        p_artifact_type: type,
        p_review_notes: note || 'Changes requested.',
      });
      if (error) {
        // Toast + re-throw so the note dialog stays open (it closes on resolve)
        // and the manager can retry without retyping.
        toast.error(`Couldn't request changes — ${errMsg(error) || 'please try again.'}`);
        throw error instanceof Error ? error : new Error('request_changes_failed');
      }
      await refetch();
    },
    [areaId, refetch],
  );

  // Draft all three at once — handy for a brand-new department. Skips locked
  // (approved) ones and runs the rest concurrently, reusing draft()'s per-type
  // busy + failure handling.
  const draftAll = useCallback(async () => {
    await Promise.all(
      ARTIFACT_TYPES.filter((t) => byType[t]?.status !== 'approved').map((t) => draft(t)),
    );
  }, [byType, draft]);

  const deleteArtifact = useCallback(
    async (type: ArtifactType) => {
      const { error } = await rpcClient().rpc('fn_mba_dept_artifact_delete', {
        p_area_id: areaId,
        p_artifact_type: type,
      });
      if (error) {
        // Keep the confirm dialog open (delType stays set) so it's retryable.
        toast.error(`Couldn't delete — ${errMsg(error) || 'please try again.'}`);
        return;
      }
      setDelType(null);
      await refetch();
    },
    [areaId, refetch],
  );

  const anyBusy = Object.values(busy).some(Boolean);

  // Which artifact type has a dialog open (null = none).
  const [editType, setEditType] = useState<ArtifactType | null>(null);
  const [viewType, setViewType] = useState<ArtifactType | null>(null);
  const [reqType, setReqType] = useState<ArtifactType | null>(null);
  const [histType, setHistType] = useState<ArtifactType | null>(null);
  const [delType, setDelType] = useState<ArtifactType | null>(null);

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold">Department Playbook</h3>
            <Badge variant="outline" className="text-xs">
              AI draft · human approves
            </Badge>
          </div>
          {canManage && ARTIFACT_TYPES.some((t) => byType[t]?.status !== 'approved') && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-xs"
              disabled={anyBusy}
              onClick={() => void draftAll()}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Draft all three
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          AI proposes a starter organogram, SOP and workflow for {areaLabel}. A
          manager reviews and completes each before it becomes official.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 pt-0 md:grid-cols-3">
        {ARTIFACT_TYPES.map((type) => {
          const art = byType[type];
          const Icon = TYPE_ICON[type];
          const status = art?.status;
          const working = busy[type];
          return (
            <div key={type} className="flex flex-col rounded-md border p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Icon className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">{ARTIFACT_LABEL[type]}</span>
              </div>

              {status && (
                <Badge
                  variant="outline"
                  className={`mb-2 w-fit text-[11px] ${STATUS_STYLE[status] ?? ''}`}
                >
                  {STATUS_LABEL[status] ?? status}
                </Badge>
              )}

              {status === 'needs_changes' && art?.review_notes && (
                <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                  Changes requested: {art.review_notes}
                </p>
              )}

              {status === 'approved' && art?.reviewed_at && (
                <p className="text-muted-foreground mb-2 text-[11px]">
                  Approved {new Date(art.reviewed_at).toLocaleDateString()}
                  {isStale(art.reviewed_at) && (
                    <span className="ml-1 font-medium text-amber-600">· time to review</span>
                  )}
                </p>
              )}

              {art ? (
                <ArtifactPreview type={type} content={art.content} />
              ) : (
                <p className="text-muted-foreground mb-3 text-xs">Not drafted yet.</p>
              )}

              {failed[type] && !working && (
                <p className="mb-2 flex items-start gap-1 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  {typeof failed[type] === 'string'
                    ? failed[type]
                    : "The AI couldn't produce a draft this time. Please try again."}
                </p>
              )}

              <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                {/* Drafting is manager-only and blocked on approved (locked). */}
                {canManage && status !== 'approved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={Boolean(working)}
                    onClick={() => draft(type)}
                  >
                    {working === 'Drafting…' ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    {failed[type] ? 'Retry' : art ? 'Re-draft' : 'Draft with AI'}
                  </Button>
                )}

                {canManage && art && status !== 'approved' && (
                  <>
                    <Button
                      size="sm"
                      className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700"
                      disabled={Boolean(working)}
                      onClick={() => setEditType(type)}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Review &amp; approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={Boolean(working)}
                      onClick={() => setReqType(type)}
                    >
                      Request changes
                    </Button>
                  </>
                )}

                {/* Approved: anyone with access can View / download; managers can Reopen. */}
                {art && status === 'approved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setViewType(type)}
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    View / download
                  </Button>
                )}
                {art && status === 'approved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setHistType(type)}
                  >
                    <History className="mr-1 h-3 w-3" />
                    History
                  </Button>
                )}
                {canManage && status === 'approved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={Boolean(working)}
                    onClick={() => reopen(type)}
                  >
                    {working === 'Reopening…' ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    Reopen to edit
                  </Button>
                )}

                {!canManage && !art && (
                  <p className="text-muted-foreground text-[11px]">
                    A manager can draft this.
                  </p>
                )}

                {canManage && art && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive ml-auto h-7 px-2 text-xs"
                    onClick={() => setDelType(type)}
                    aria-label="Delete this playbook"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>

      {editType && byType[editType] && (
        <EditArtifactDialog
          areaId={areaId}
          areaLabel={areaLabel}
          artifactType={editType}
          content={byType[editType]!.content}
          open={editType !== null}
          onOpenChange={(o) => {
            if (!o) setEditType(null);
          }}
          onApproved={() => {
            setEditType(null);
            void refetch();
          }}
        />
      )}

      {viewType && byType[viewType] && (
        <ViewPlaybookDialog
          areaLabel={areaLabel}
          artifactType={viewType}
          content={byType[viewType]!.content}
          open={viewType !== null}
          onOpenChange={(o) => {
            if (!o) setViewType(null);
          }}
        />
      )}

      {reqType && (
        <RequestChangesDialog
          open={reqType !== null}
          onOpenChange={(o) => {
            if (!o) setReqType(null);
          }}
          onSubmit={(note) => requestChanges(reqType, note)}
        />
      )}

      {histType && (
        <HistoryDialog
          areaId={areaId}
          areaLabel={areaLabel}
          artifactType={histType}
          open={histType !== null}
          onOpenChange={(o) => {
            if (!o) setHistType(null);
          }}
        />
      )}

      {delType && (
        <ConfirmDeleteDialog
          areaLabel={areaLabel}
          artifactType={delType}
          open={delType !== null}
          onOpenChange={(o) => {
            if (!o) setDelType(null);
          }}
          onConfirm={() => deleteArtifact(delType)}
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-type content preview — defensive: unknown shapes fall back to nothing.  */
/* -------------------------------------------------------------------------- */

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return str((e as { message?: unknown }).message);
  }
  return str(e);
}

function ArtifactPreview({
  type,
  content,
}: {
  type: ArtifactType;
  content: Record<string, unknown>;
}) {
  const note = str(content.note);
  const proposed = content.proposed === true;

  let rows: string[] = [];
  if (type === 'organogram') {
    rows = asArray(content.roles).map((r) =>
      `${str(r.title)}${r.reports_to ? ` → ${str(r.reports_to)}` : ''}`.trim(),
    );
  } else if (type === 'sop') {
    rows = asArray(content.steps).map((s) => `${str(s.n)}. ${str(s.title)}`.trim());
  } else {
    rows = asArray(content.stages).map((s) => `${str(s.n)}. ${str(s.name)}`.trim());
  }
  rows = rows.filter(Boolean).slice(0, 5);

  return (
    <div className="mb-3 space-y-1">
      {proposed && (
        <p className="text-[11px] font-medium text-violet-600">Proposed — not yet official</p>
      )}
      {note && <p className="text-muted-foreground line-clamp-2 text-xs">{note}</p>}
      {rows.length > 0 && (
        <ul className="text-muted-foreground list-inside space-y-0.5 text-[11px]">
          {rows.map((r, i) => (
            <li key={i} className="truncate">
              • {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
