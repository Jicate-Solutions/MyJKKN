'use client';

// Department Playbook panel — four artifacts per department (organogram / SOP /
// workflow / policy), each drafted on the ₹0 Max lane and approved by a human.
// Self-contained: it reads /api/mba/dept-artifacts, triggers a draft + polls the
// collect route, and (for managers) calls the approve / request-changes RPCs
// directly. Dropped into each area section of the analytics dashboard; harmless
// when nothing is drafted yet (shows a "Draft with AI" cta).
//
// The POLICY card is the one that behaves differently:
//   • An officer (CEO / CAO / EAO) can UPLOAD the department's real policy
//     document. That upload IS the policy — the AI draft becomes history, and
//     the card stops offering a re-draft.
//   • Only officers can upload or sign off a policy. Managers draft and read it.
//   • Documents live in a private bucket and open through a signed URL that the
//     server mints per click; there is no shareable link.

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
  Users,
  ShieldCheck,
  FileUp,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { EditArtifactDialog } from './edit-artifact-dialog';
import {
  ViewPlaybookDialog,
  RequestChangesDialog,
  HistoryDialog,
  ConfirmDeleteDialog,
  UploadPolicyDialog,
  openPolicyDocument,
} from './playbook-dialogs';

// Kept inline so this panel builds standalone (the matching backend types live
// in lib/services/mba-dept-artifacts, shipped in the drafting-engine PR).
const ARTIFACT_TYPES = ['organogram', 'sop', 'workflow', 'policy'] as const;
type ArtifactType = (typeof ARTIFACT_TYPES)[number];
const ARTIFACT_LABEL: Record<ArtifactType, string> = {
  organogram: 'Organogram',
  sop: 'Standard Operating Procedure',
  workflow: 'Workflow',
  policy: 'Department Policy',
};
/** Officer-only: upload the real policy document, or sign a drafted one off. */
const POLICY_PERMISSION = 'improvement.area_policy.approve';
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
  /** 'upload' means a real document is on file and it IS the artifact. */
  source: 'ai_draft' | 'upload';
  file_name: string | null;
  uploaded_at: string | null;
}

/** A standing organogram role holder (hr_additional_roles, area-scoped). */
interface RoleAssignment {
  role_type: string;
  staff_id: string | null;
  holder_name: string | null;
  holder_email: string | null;
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
  policy: ShieldCheck,
};

/**
 * The AI fills every unnamed role with a bracketed placeholder ("[Manager to
 * complete]"). Printed as-is it reads like a person's name, so a role nobody
 * holds looks assigned. Anything bracketed, or empty, is nobody.
 */
function isUnfilledHolder(v: string | null | undefined): boolean {
  const s = (v ?? '').trim();
  return s === '' || /^\[[^\]]*\]$/.test(s);
}

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

  // Who currently holds each organogram role. Real rows, not the artifact's JSON —
  // this is what survives a re-draft, so it is worth showing on its own.
  const [holders, setHolders] = useState<RoleAssignment[]>([]);
  const refetchHolders = useCallback(async () => {
    if (!canManage) return; // the read is manager-gated; don't fake an empty list
    try {
      const res = await fetch(
        `/api/mba/dept-artifacts/role-assignments?area_id=${encodeURIComponent(areaId)}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as { assignments?: RoleAssignment[] };
      setHolders(json.assignments ?? []);
    } catch {
      /* keep last state */
    }
  }, [areaId, canManage]);

  // Uploading or signing off a policy is an officer action (CEO / CAO / EAO) held
  // under its own key. The DB enforces it; this only decides which controls to
  // render, so nobody is offered a button the server will refuse.
  const [canPolicy, setCanPolicy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient() as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
    };
    supabase
      .rpc('user_has_permission', { permission_name: POLICY_PERMISSION })
      .then(({ data }) => {
        if (!cancelled) setCanPolicy(data === true);
      })
      .catch(() => {
        if (!cancelled) setCanPolicy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refetch();
    void refetchHolders();
  }, [refetch, refetchHolders]);

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

  // Draft everything at once — handy for a brand-new department. Skips locked
  // (approved) ones and anything satisfied by an uploaded document, and runs the
  // rest concurrently, reusing draft()'s per-type busy + failure handling.
  const draftable = useCallback(
    (t: ArtifactType) => byType[t]?.status !== 'approved' && byType[t]?.source !== 'upload',
    [byType],
  );
  const draftAll = useCallback(async () => {
    await Promise.all(ARTIFACT_TYPES.filter(draftable).map((t) => draft(t)));
  }, [draftable, draft]);

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
  const [uploadOpen, setUploadOpen] = useState(false);

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
          {canManage && ARTIFACT_TYPES.some(draftable) && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-xs"
              disabled={anyBusy}
              onClick={() => void draftAll()}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Draft all
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          AI proposes a starter organogram, SOP, workflow and policy for {areaLabel}. A
          manager reviews and completes each before it becomes official. The policy can
          instead be satisfied by uploading the department&apos;s real document — an
          uploaded document always takes precedence.
        </p>

        {holders.length > 0 && (
          <div className="mt-2 rounded-md border bg-muted/40 p-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Users className="text-muted-foreground h-3.5 w-3.5" />
              <span className="text-xs font-medium">Who holds what</span>
              <Badge variant="outline" className="text-[10px]">
                {holders.filter((h) => h.staff_id || !isUnfilledHolder(h.holder_name)).length} of{' '}
                {holders.length} named
              </Badge>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {holders.map((h) => {
                // A role whose "holder" is still the AI's bracketed placeholder has
                // nobody in it. Saying so plainly is the difference between an
                // organogram that is honest and one that looks fully staffed.
                const unfilled = !h.staff_id && isUnfilledHolder(h.holder_name);
                return (
                  <li key={h.role_type} className="text-[11px] leading-tight">
                    <span className="text-muted-foreground">{h.role_type}: </span>
                    {unfilled ? (
                      <span className="text-muted-foreground italic">Not assigned yet</span>
                    ) : (
                      <>
                        <span className="font-medium">{h.holder_name ?? 'Unnamed'}</span>
                        {!h.staff_id && (
                          <span className="text-muted-foreground"> (not a MyJKKN record)</span>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-3 pt-0 sm:grid-cols-2 xl:grid-cols-4">
        {ARTIFACT_TYPES.map((type) => {
          const art = byType[type];
          const Icon = TYPE_ICON[type];
          const status = art?.status;
          const working = busy[type];
          // An uploaded document is the record: no re-draft, no approve, no reopen.
          const uploaded = art?.source === 'upload';
          const isPolicy = type === 'policy';
          // Officers own the policy; managers own the other three.
          const canReview = isPolicy ? canPolicy : canManage;
          return (
            <div key={type} className="flex flex-col rounded-md border p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Icon className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">{ARTIFACT_LABEL[type]}</span>
              </div>

              {status && (
                <Badge
                  variant="outline"
                  className={`mb-2 w-fit text-[11px] ${
                    uploaded
                      ? 'border-slate-200 bg-slate-50 text-slate-700'
                      : (STATUS_STYLE[status] ?? '')
                  }`}
                >
                  {uploaded ? 'Uploaded document — official' : (STATUS_LABEL[status] ?? status)}
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

              {art && uploaded ? (
                <div className="mb-3 space-y-1">
                  <p className="truncate text-xs font-medium" title={art.file_name ?? ''}>
                    {art.file_name || 'Policy document'}
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {art.uploaded_at
                      ? `Uploaded ${new Date(art.uploaded_at).toLocaleDateString()}`
                      : 'Uploaded document'}
                    {' · this document is the policy'}
                  </p>
                </div>
              ) : art ? (
                <ArtifactPreview type={type} content={art.content} />
              ) : (
                <p className="text-muted-foreground mb-3 text-xs">
                  {isPolicy ? 'No policy on file yet.' : 'Not drafted yet.'}
                </p>
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
                {/* Uploaded document: open it. The URL is minted per click. */}
                {uploaded && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => void openPolicyDocument(areaId)}
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Open document
                  </Button>
                )}

                {/* Only officers put a policy document on file, or replace one. */}
                {isPolicy && canPolicy && (
                  <Button
                    size="sm"
                    variant={uploaded ? 'outline' : 'default'}
                    className="h-7 text-xs"
                    disabled={Boolean(working)}
                    onClick={() => setUploadOpen(true)}
                  >
                    <FileUp className="mr-1 h-3 w-3" />
                    {uploaded ? 'Replace document' : 'Upload document'}
                  </Button>
                )}

                {/* Drafting is manager-driven, blocked on approved (locked), and
                    pointless once a real document is on file. Officers can draft a
                    policy too — otherwise the people who sign it off could not
                    produce a starting point (the draft route allows both). */}
                {(canManage || (isPolicy && canPolicy)) && status !== 'approved' && !uploaded && (
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

                {canReview && art && status !== 'approved' && !uploaded && (
                  <>
                    <Button
                      size="sm"
                      className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700"
                      disabled={Boolean(working)}
                      onClick={() => setEditType(type)}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      {isPolicy ? 'Review & sign off' : 'Review & approve'}
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

                {/* A drafted policy a manager may read but not sign off. */}
                {isPolicy && !canPolicy && art && status !== 'approved' && !uploaded && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setEditType(type)}
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    Read the draft
                  </Button>
                )}

                {/* Approved: anyone with access can View / download; managers can Reopen. */}
                {art && status === 'approved' && !uploaded && (
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
                {art && (status === 'approved' || uploaded) && (
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
                {canReview && status === 'approved' && !uploaded && (
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

                {isPolicy && !canPolicy && (art?.status === 'approved' || uploaded) && (
                  <p className="text-muted-foreground text-[11px]">
                    Only the CEO, CAO or Executive Administrative Officer can change this.
                  </p>
                )}

                {(isPolicy ? canPolicy : canManage) && art && (
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
            void refetchHolders();
          }}
        />
      )}

      {viewType && byType[viewType] && (
        <ViewPlaybookDialog
          areaId={areaId}
          areaLabel={areaLabel}
          artifactType={viewType}
          content={byType[viewType]!.content}
          open={viewType !== null}
          onOpenChange={(o) => {
            if (!o) setViewType(null);
          }}
        />
      )}

      {uploadOpen && (
        <UploadPolicyDialog
          areaId={areaId}
          areaLabel={areaLabel}
          hasExisting={byType.policy?.source === 'upload'}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploaded={() => {
            setUploadOpen(false);
            void refetch();
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
  } else if (type === 'policy') {
    rows = asArray(content.clauses).map((c) => `${str(c.n)}. ${str(c.title)}`.trim());
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
