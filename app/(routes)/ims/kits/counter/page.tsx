'use client';

// Store Kits — counter handover screen (storekeepers, decision 4/6/7/8/18/19/20/23).
// Find the person → see entitled-vs-collected → record handover (partial OK)
// → same-day void. Proof: QR scanned at counter, or name-lookup fallback
// (recorded as the lower 'staff_verified' evidence tier).

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, PackageCheck, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useKitEntitlements, useKitCollections, useRecordKitCollection,
  useVoidKitCollection, useKitStores,
} from '@/hooks/ims/use-ims-kits';
import { ImsKitService, type KitPerson, type KitEntitlement } from '@/lib/services/ims/kit-service';

export default function KitCounterPage() {
  return (
    <ImsPageGuard module="ims.kits" action="handover">
      <ContentLayout title="Store Kits — Counter">
        <CounterInner />
      </ContentLayout>
    </ImsPageGuard>
  );
}

function CounterInner() {
  const [audience, setAudience] = useState<'learner' | 'staff'>('learner');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<KitPerson[]>([]);
  const [person, setPerson] = useState<KitPerson | null>(null);
  const { data: entitlements = [], isLoading } = useKitEntitlements(person);

  const search = async () => {
    try {
      setResults(await ImsKitService.searchPeople(term, audience));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Search failed');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Who is collecting?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={audience} onValueChange={(v) => { setAudience(v as 'learner' | 'staff'); setResults([]); setPerson(null); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="learner">Learner</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="flex-1 min-w-0 sm:min-w-64"
              placeholder={audience === 'learner' ? 'Scan QR / type register number or name…' : 'Type staff name…'}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            />
            <Button onClick={search}><Search className="h-4 w-4 mr-1" /> Find</Button>
          </div>
          {results.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {results.map((p) => (
                <button
                  key={p.id}
                  className={`rounded border p-2 text-left text-sm hover:bg-muted ${person?.id === p.id ? 'border-primary bg-muted' : ''}`}
                  onClick={() => setPerson(p)}
                >
                  <span className="font-medium">{p.name}</span>
                  {p.register_number && <span className="text-muted-foreground"> · {p.register_number}</span>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {person && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Kit for {person.name}{person.register_number ? ` (${person.register_number})` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && entitlements.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No kit entitlements found. Grant them from the Rules page first.
              </p>
            )}
            {entitlements.map((e) => (
              <EntitlementRow key={e.id} ent={e} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EntitlementRow({ ent }: { ent: KitEntitlement }) {
  const owed = ent.qty_entitled - ent.qty_collected;
  const collectable = (ent.status === 'open' || ent.status === 'reopened') && owed > 0;
  const [collectOpen, setCollectOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="rounded border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium">{ent.item?.name ?? ent.item_id}</span>
          {ent.anchor_year_level && <span className="text-muted-foreground text-sm"> · Year {ent.anchor_year_level}</span>}
          <div className="text-sm text-muted-foreground">
            Entitled {ent.qty_entitled} · Collected {ent.qty_collected} ·{' '}
            <span className={owed > 0 ? 'text-amber-600 font-medium' : ''}>Owed {owed}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={ent.status === 'open' || ent.status === 'reopened' ? 'default' : 'secondary'}>
            {ent.status}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen((v) => !v)}>History</Button>
          <Button size="sm" disabled={!collectable && ent.qty_collected === 0} onClick={() => setCollectOpen(true)}>
            <PackageCheck className="h-4 w-4 mr-1" /> Hand over
          </Button>
        </div>
      </div>
      {historyOpen && <CollectionHistory entitlementId={ent.id} />}
      <CollectDialog ent={ent} open={collectOpen} onOpenChange={setCollectOpen} maxNormalQty={owed} />
    </div>
  );
}

function CollectionHistory({ entitlementId }: { entitlementId: string }) {
  const { data: collections = [] } = useKitCollections(entitlementId);
  const voidCollection = useVoidKitCollection();
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // D30: default to "returned" — stock is only restored when the item is back.
  const [itemReturned, setItemReturned] = useState(true);

  return (
    <div className="mt-3 space-y-2 border-t pt-2">
      {collections.length === 0 && <p className="text-xs text-muted-foreground">No collections yet.</p>}
      {collections.map((c) => (
        <div key={c.id} className={`flex flex-wrap items-center justify-between gap-2 text-sm ${c.voided_at ? 'opacity-50 line-through' : ''}`}>
          <span>
            {new Date(c.collected_at).toLocaleString()} · ×{c.qty} · {c.kind} ·{' '}
            <Badge variant="outline" className="text-xs">{c.proof_type}</Badge> · by {c.collector_name}
            {c.voided_at && <span className="ml-1 no-underline">(voided: {c.void_reason})</span>}
          </span>
          {!c.voided_at && (
            voidingId === c.id ? (
              <span className="flex flex-wrap items-center gap-2">
                <Input className="h-8 w-48" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <span className="flex items-center gap-1">
                  <Checkbox id={`ret-${c.id}`} checked={itemReturned} onCheckedChange={(v) => setItemReturned(v === true)} />
                  <Label htmlFor={`ret-${c.id}`} className="text-xs whitespace-nowrap">Item returned to store</Label>
                </span>
                <Button size="sm" variant="destructive" disabled={voidCollection.isPending} onClick={async () => {
                  if (!reason.trim()) { toast.error('A reason is required'); return; }
                  try {
                    await voidCollection.mutateAsync({ collectionId: c.id, reason: reason.trim(), itemReturned });
                    toast.success(itemReturned ? 'Entry voided, stock restored' : 'Entry voided — recorded as a loss (stock not restored)');
                    setVoidingId(null); setReason(''); setItemReturned(true);
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : 'Void failed');
                  }
                }}>{voidCollection.isPending ? 'Voiding…' : 'Void'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setVoidingId(null)}>Cancel</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => { setVoidingId(c.id); setReason(''); setItemReturned(true); }}>
                <Undo2 className="h-3 w-3 mr-1" /> Void
              </Button>
            )
          )}
        </div>
      ))}
    </div>
  );
}

function CollectDialog({
  ent, open, onOpenChange, maxNormalQty,
}: { ent: KitEntitlement; open: boolean; onOpenChange: (v: boolean) => void; maxNormalQty: number }) {
  const record = useRecordKitCollection();
  const { data: stores = [] } = useKitStores();
  const [qty, setQty] = useState('1');
  const [kind, setKind] = useState<'normal' | 'defect_swap'>('normal');
  const [proof, setProof] = useState<'qr' | 'staff_verified'>('qr');
  const [collectorName, setCollectorName] = useState('');
  const [collectorReg, setCollectorReg] = useState('');
  const [storeId, setStoreId] = useState('');
  const [lateApproved, setLateApproved] = useState(false);
  const [returnedDefective, setReturnedDefective] = useState(true);

  // Derived default (was a setState-in-render — #2000 review LOW-5): when the
  // storekeeper hasn't picked a store, fall back to the central one. Purely
  // computed — no effect, no cascading renders.
  const central = stores.find((s: { id: string; is_central_supply_store: boolean }) => s.is_central_supply_store);
  const effectiveStoreId = storeId || (central ?? stores[0])?.id || '';

  const submit = async () => {
    const n = Number(qty);
    if (!n || n < 1) { toast.error('Quantity must be at least 1'); return; }
    if (kind === 'normal' && n > maxNormalQty) { toast.error(`Only ${maxNormalQty} owed`); return; }
    if (!collectorName.trim()) { toast.error('Collector name is required'); return; }
    if (!effectiveStoreId) { toast.error('Pick the store'); return; }
    try {
      const res = await record.mutateAsync({
        entitlement_id: ent.id,
        qty: n,
        collector_name: collectorName.trim(),
        proof_type: proof,
        store_id: effectiveStoreId,
        collector_register_no: collectorReg.trim() || undefined,
        kind,
        late_approved: lateApproved,
        returned_defective: kind === 'defect_swap' ? returnedDefective : false,
      });
      toast.success(kind === 'normal' ? `Handed over — ${res.remaining} still owed` : 'Recorded');
      onOpenChange(false);
      setCollectorName(''); setCollectorReg(''); setQty('1'); setKind('normal'); setLateApproved(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Handover failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hand over — {ent.item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Kit handover</SelectItem>
                  <SelectItem value="defect_swap">Defect swap (store fault, within 7 days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity{kind === 'normal' ? ` (owed: ${maxNormalQty})` : ''}</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Collector name (person at the counter)</Label>
            <Input value={collectorName} onChange={(e) => setCollectorName(e.target.value)} placeholder="Student or proxy name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Collector register no. (optional)</Label>
              <Input value={collectorReg} onChange={(e) => setCollectorReg(e.target.value)} />
            </div>
            <div>
              <Label>Proof</Label>
              <Select value={proof} onValueChange={(v) => setProof(v as typeof proof)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="qr">QR scanned</SelectItem>
                  <SelectItem value="staff_verified">Name lookup (staff verified)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Store</Label>
            <Select value={effectiveStoreId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue placeholder="Pick store" /></SelectTrigger>
              <SelectContent>
                {stores.map((s: { id: string; name: string }) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === 'normal' && (
            <div className="flex items-center gap-2">
              <Checkbox id="late" checked={lateApproved} onCheckedChange={(v) => setLateApproved(v === true)} />
              <Label htmlFor="late" className="text-sm">Approve late collection (outside window)</Label>
            </div>
          )}
          {kind === 'defect_swap' && (
            <div className="flex items-center gap-2">
              <Checkbox id="returned" checked={returnedDefective} onCheckedChange={(v) => setReturnedDefective(v === true)} />
              <Label htmlFor="returned" className="text-sm">Defective unit returned to store</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={record.isPending}>
            {record.isPending ? 'Recording…' : 'Record handover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
