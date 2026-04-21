# IMS Transfers — Inter-Store Supply Transfer System

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a `/ims/transfers` page where college stores request supplies from the central store and the central store reviews, approves, and dispatches them — all within the existing IMS, with no separate module.

**Architecture:** One URL, two contextual views driven by `currentStore.is_central_supply_store`. The database is fully built (`ims_indent_requests` with `request_scope`, `ims_supply_shipments`, all triggers). This is a UI-only implementation that extends the existing indent infrastructure with minimal additions. Stock deduction and batch creation happen via existing DB triggers — no service-side stock writes needed.

**Tech Stack:** Next.js 14 App Router, React Query (`@tanstack/react-query`), Zustand, Supabase (client-side), shadcn/ui, Tailwind CSS, TypeScript strict mode.

---

## V1 Scope

**Included:**
- College store raises a supply request from the central store catalog (non-bundle items only)
- Local approval step when `store.requires_local_approval = true`
- Central store approves / declines incoming requests
- Central store marks shipment dispatched → DB trigger deducts stock automatically
- College store confirms receipt → DB trigger creates stock batches at destination automatically
- KPI cards at top of page (clickable as filters)
- Mode badge (📤 Request Mode / 📥 Dispatch Mode)

**Excluded from V1 (defer):**
- Vehicle / driver / courier tracking fields
- Bundle items (`is_bundle = false` filter applied)
- Partial fulfillment UI
- Variance recording detail form

---

## Key Files Reference

| File | Role |
|---|---|
| `types/ims/indents.ts` | Extend `ImsIndentFilters` + `CreateImsIndentDto` |
| `types/ims/stores.ts` | Extend `ImsStoreFilters` |
| `types/ims/supply-transfers.ts` | **NEW** — shipment types |
| `types/ims/index.ts` | Add barrel export |
| `lib/services/ims/indent-service.ts` | Add 3 filter clauses + `localApproveIndent()` |
| `lib/services/ims/store-service.ts` | Add `is_central_supply_store` filter |
| `lib/services/ims/supply-transfer-service.ts` | **NEW** — shipment CRUD |
| `lib/services/ims/index.ts` | Add barrel export |
| `hooks/ims/use-ims-indents.ts` | Add `useLocalApproveImsIndent()` |
| `hooks/ims/use-ims-transfers.ts` | **NEW** — all transfer + shipment hooks |
| `hooks/ims/index.ts` | Add barrel export |
| `lib/sidebarMenuLink.ts` | Add Transfers menu entry (after Indents, before Sales) |
| `app/(routes)/ims/transfers/page.tsx` | **NEW** — main page |
| `app/(routes)/ims/transfers/[id]/page.tsx` | **NEW** — transfer detail |
| `app/(routes)/ims/transfers/_components/` | **NEW** — CollegeRequestView, CentralDispatchView, NewRequestSlideover, ReviewSlideover |

---

## Task 1: Extend Types

**Files:**
- Modify: `types/ims/indents.ts` lines 78–107
- Modify: `types/ims/stores.ts` lines 47–53
- Create: `types/ims/supply-transfers.ts`
- Modify: `types/ims/index.ts`

### Step 1: Extend `ImsIndentFilters` — add 3 new filter fields

In `types/ims/indents.ts`, replace the `ImsIndentFilters` interface (lines 78–90):

```typescript
export interface ImsIndentFilters {
  search?: string;
  status?: ImsIndentStatus;
  urgency?: ImsIndentUrgency;
  department_id?: string;
  requested_by?: string;
  institution_id?: string;
  store_id?: string;
  // Cross-store transfer filters (inter_institution scope)
  request_scope?: ImsRequestScope;
  source_store_id?: string;
  destination_store_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}
```

### Step 2: Extend `CreateImsIndentDto` — add cross-store fields

In `types/ims/indents.ts`, replace `CreateImsIndentDto` (lines 92–107):

```typescript
export type CreateImsIndentDto = {
  department_id?: string;           // optional for inter-institution (no dept required)
  required_date?: string;
  purpose: string;
  urgency: ImsIndentUrgency;
  is_emergency?: boolean;
  emergency_reason?: string;
  institution_id: string;
  store_id?: string;
  // Cross-store transfer fields
  request_scope?: ImsRequestScope;
  source_store_id?: string;
  destination_institution_id?: string;
  destination_store_id?: string;
  items: Array<{
    item_id: string;
    quantity: number;
    unit_id: string;
    notes?: string;
  }>;
};
```

### Step 3: Extend `ImsStoreFilters`

In `types/ims/stores.ts`, replace the `ImsStoreFilters` interface (lines 47–53):

```typescript
export interface ImsStoreFilters {
  search?: string;
  is_active?: boolean;
  institution_id?: string;
  is_central_supply_store?: boolean;   // NEW — for resolving central store
  page?: number;
  limit?: number;
}
```

### Step 4: Create `types/ims/supply-transfers.ts`

```typescript
/**
 * IMS Supply Transfer (Shipment) Types
 * Represents the physical dispatch from central store to a branch institution.
 */

export type ImsShipmentStatus =
  | 'preparing'
  | 'dispatched'
  | 'received'
  | 'received_with_variance'
  | 'cancelled';

export interface ImsSupplyShipment {
  id: string;
  shipment_no: string;
  request_id: string;
  source_store_id: string;
  destination_institution_id: string;
  destination_store_id: string | null;
  dispatched_at: string | null;
  dispatched_by: string | null;
  received_at: string | null;
  received_by: string | null;
  receipt_notes: string | null;
  status: ImsShipmentStatus;
  created_at: string;
  updated_at: string;
  // Joined
  source_store?: { id: string; name: string; code: string } | null;
  destination_institution?: { id: string; institution_name: string } | null;
  destination_store?: { id: string; name: string; code: string } | null;
  dispatched_by_profile?: { full_name: string } | null;
  items?: ImsSupplyShipmentItem[];
}

export interface ImsSupplyShipmentItem {
  id: string;
  shipment_id: string;
  item_id: string;
  requested_quantity: number;
  dispatched_quantity: number;
  received_quantity: number | null;
  variance_reason: string | null;
  unit_id: string;
  // Joined
  item?: { id: string; name: string; code: string } | null;
  unit?: { id: string; name: string; abbreviation: string } | null;
}

export type CreateShipmentDto = {
  request_id: string;
  source_store_id: string;
  destination_institution_id: string;
  destination_store_id?: string;
  items: Array<{
    item_id: string;
    dispatched_quantity: number;
    unit_id: string;
  }>;
};

export type DispatchShipmentDto = {
  dispatched_by: string;
};

export type ConfirmReceiptLine = {
  shipment_item_id: string;
  received_qty: number;
  variance_reason?: string | null;
};

export interface ImsShipmentFilters {
  request_id?: string;
  source_store_id?: string;
  destination_institution_id?: string;
  status?: ImsShipmentStatus;
  page?: number;
  limit?: number;
}
```

### Step 5: Add export to `types/ims/index.ts`

Append to the end of `types/ims/index.ts`:

```typescript
export * from './supply-transfers';
```

### Step 6: Verify TypeScript compiles

```bash
cd c:/Users/Admin/Documents/GitHub/MyJKKN
npx tsc --noEmit 2>&1 | head -30
```

Expected: No new errors from the type additions.

### Step 7: Commit

```bash
git add types/ims/indents.ts types/ims/stores.ts types/ims/supply-transfers.ts types/ims/index.ts
git commit -m "feat(ims): extend indent/store types + add supply-transfers types for inter-store flow"
```

---

## Task 2: Extend Indent Service

**File:** `lib/services/ims/indent-service.ts`

### Step 1: Add 3 cross-store filter clauses to `getIndents()`

After line 66 (after the `store_id / institution_id` block, before the date range block), insert:

```typescript
      // Cross-store scope filter
      if (filters.request_scope) {
        query = query.eq('request_scope', filters.request_scope);
      }

      // Source store filter (who raised the request)
      if (filters.source_store_id) {
        query = query.eq('source_store_id', filters.source_store_id);
      }

      // Destination store filter (who should fulfill it)
      if (filters.destination_store_id) {
        query = query.eq('destination_store_id', filters.destination_store_id);
      }
```

Also extend the `.select()` string on line 28 to join source/destination stores. Replace the select string:

```typescript
        .select(
          `*,
           department:departments(id,department_name),
           requested_by_profile:profiles!requested_by(full_name),
           approved_by_profile:profiles!approved_by(full_name),
           source_store:ims_stores!source_store_id(id,name,code),
           destination_store:ims_stores!destination_store_id(id,name,code),
           destination_institution:institutions!destination_institution_id(id,institution_name)`,
          { count: 'exact' }
        )
```

### Step 2: Add `localApproveIndent()` method

After the `rejectIndent()` method, add:

```typescript
  /**
   * Local (branch) approval for inter-institution requests.
   * Transitions: pending_local_approval → pending_approval
   */
  static async localApproveIndent(id: string, userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_indent_requests')
        .update({
          status: 'pending_approval',
          local_approved_by: userId,
          local_approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending_local_approval');   // guard: only from this status

      if (error) throw error;
    } catch (error) {
      console.error('[ImsIndentService] Error in localApproveIndent:', error);
      throw error;
    }
  }
```

### Step 3: Extend `createIndent()` insert to pass cross-store fields

Find the `.insert({...})` call inside `createIndent()` and add the optional fields:

```typescript
      const { data: indent, error: indentError } = await this.supabase
        .from('ims_indent_requests')
        .insert({
          // ... existing fields ...
          request_scope: data.request_scope ?? 'internal',
          ...(data.source_store_id ? { source_store_id: data.source_store_id } : {}),
          ...(data.destination_institution_id ? { destination_institution_id: data.destination_institution_id } : {}),
          ...(data.destination_store_id ? { destination_store_id: data.destination_store_id } : {}),
        })
        .select()
        .single();
```

### Step 4: Verify

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

### Step 5: Commit

```bash
git add lib/services/ims/indent-service.ts
git commit -m "feat(ims): extend indent service with cross-store filters and localApproveIndent"
```

---

## Task 3: Extend Store Service

**File:** `lib/services/ims/store-service.ts`

### Step 1: Add `is_central_supply_store` filter

After the `institution_id` filter block (after line 51), insert:

```typescript
      if (filters.is_central_supply_store !== undefined) {
        query = query.eq('is_central_supply_store', filters.is_central_supply_store);
      }
```

### Step 2: Verify + Commit

```bash
npx tsc --noEmit 2>&1 | head -20
git add lib/services/ims/store-service.ts
git commit -m "feat(ims): add is_central_supply_store filter to store service"
```

---

## Task 4: Create Supply Transfer Service

**File (new):** `lib/services/ims/supply-transfer-service.ts`

### Step 1: Create the file

```typescript
// lib/services/ims/supply-transfer-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsSupplyShipment,
  ImsShipmentFilters,
  CreateShipmentDto,
  DispatchShipmentDto,
  ConfirmReceiptLine,
} from '@/types/ims';

export class ImsSupplyTransferService {
  private static get supabase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  private static readonly SHIPMENT_SELECT = `
    *,
    source_store:ims_stores!source_store_id(id,name,code),
    destination_institution:institutions!destination_institution_id(id,institution_name),
    destination_store:ims_stores!destination_store_id(id,name,code),
    dispatched_by_profile:profiles!dispatched_by(full_name),
    items:ims_supply_shipment_items(
      *,
      item:ims_items(id,name,code),
      unit:ims_units(id,name,abbreviation)
    )
  `;

  /**
   * List shipments with optional filters.
   */
  static async getShipments(filters: ImsShipmentFilters = {}): Promise<{
    data: ImsSupplyShipment[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_supply_shipments')
        .select(this.SHIPMENT_SELECT, { count: 'exact' });

      if (filters.request_id) {
        query = query.eq('request_id', filters.request_id);
      }
      if (filters.source_store_id) {
        query = query.eq('source_store_id', filters.source_store_id);
      }
      if (filters.destination_institution_id) {
        query = query.eq('destination_institution_id', filters.destination_institution_id);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      query = query
        .range((page - 1) * limit, page * limit - 1)
        .order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        data: (data || []) as ImsSupplyShipment[],
        metadata: { total: count || 0, page, limit, totalPages: count ? Math.ceil(count / limit) : 0 },
      };
    } catch (error) {
      console.error('[ImsSupplyTransferService] getShipments error:', error);
      throw error;
    }
  }

  /**
   * Get shipments for a specific transfer request.
   */
  static async getShipmentsForRequest(requestId: string): Promise<ImsSupplyShipment[]> {
    try {
      const { data, error } = await this.supabase
        .from('ims_supply_shipments')
        .select(this.SHIPMENT_SELECT)
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ImsSupplyShipment[];
    } catch (error) {
      console.error('[ImsSupplyTransferService] getShipmentsForRequest error:', error);
      throw error;
    }
  }

  /**
   * Central store: create a shipment for an approved transfer request.
   * Status starts at 'preparing'. Stock is NOT deducted yet.
   */
  static async createShipment(dto: CreateShipmentDto): Promise<ImsSupplyShipment> {
    try {
      // Generate shipment_no: SHP-YYYYMMDD-XXXXX
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
      const shipmentNo = `SHP-${dateStr}-${rand}`;

      const { data: shipment, error: shipmentError } = await this.supabase
        .from('ims_supply_shipments')
        .insert({
          shipment_no: shipmentNo,
          request_id: dto.request_id,
          source_store_id: dto.source_store_id,
          destination_institution_id: dto.destination_institution_id,
          destination_store_id: dto.destination_store_id ?? null,
          status: 'preparing',
        })
        .select('id')
        .single();

      if (shipmentError) throw shipmentError;

      // Insert line items
      const lines = dto.items.map((item) => ({
        shipment_id: shipment.id,
        item_id: item.item_id,
        dispatched_quantity: item.dispatched_quantity,
        requested_quantity: item.dispatched_quantity, // same as dispatched in V1 (no partial)
        unit_id: item.unit_id,
        received_quantity: null,
      }));

      const { error: itemsError } = await this.supabase
        .from('ims_supply_shipment_items')
        .insert(lines);

      if (itemsError) throw itemsError;

      // Return full shipment with joins
      const { data: full, error: fullError } = await this.supabase
        .from('ims_supply_shipments')
        .select(this.SHIPMENT_SELECT)
        .eq('id', shipment.id)
        .single();

      if (fullError) throw fullError;
      return full as ImsSupplyShipment;
    } catch (error) {
      console.error('[ImsSupplyTransferService] createShipment error:', error);
      throw error;
    }
  }

  /**
   * Central store: mark shipment as dispatched.
   * DB trigger `trg_ims_apply_shipment_to_stock` fires on this update
   * and deducts stock from central store + sets request.status = 'shipped'.
   */
  static async dispatchShipment(shipmentId: string, dto: DispatchShipmentDto): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_supply_shipments')
        .update({
          status: 'dispatched',
          dispatched_at: new Date().toISOString(),
          dispatched_by: dto.dispatched_by,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipmentId)
        .eq('status', 'preparing');   // guard: only from 'preparing'

      if (error) throw error;
    } catch (error) {
      console.error('[ImsSupplyTransferService] dispatchShipment error:', error);
      throw error;
    }
  }

  /**
   * College store: confirm receipt of a dispatched shipment.
   * Calls the `ims_confirm_supply_receipt` RPC which:
   *   - Sets shipment.status = 'received' or 'received_with_variance'
   *   - Sets request.status = 'received' or 'received_with_variance'
   *   - Calls ims_create_branch_batches_from_shipment to create stock batches
   */
  static async confirmReceipt(
    shipmentId: string,
    receivedBy: string,
    notes: string,
    lines: ConfirmReceiptLine[]
  ): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('ims_confirm_supply_receipt', {
        p_shipment_id: shipmentId,
        p_received_by: receivedBy,
        p_receipt_notes: notes,
        p_lines: lines,
      });

      if (error) throw error;
    } catch (error) {
      console.error('[ImsSupplyTransferService] confirmReceipt error:', error);
      throw error;
    }
  }
}
```

### Step 2: Add export to `lib/services/ims/index.ts`

Append:

```typescript
export { ImsSupplyTransferService } from './supply-transfer-service';
```

### Step 3: Verify + Commit

```bash
npx tsc --noEmit 2>&1 | head -20
git add lib/services/ims/supply-transfer-service.ts lib/services/ims/index.ts
git commit -m "feat(ims): add ImsSupplyTransferService for shipment create/dispatch/receipt"
```

---

## Task 5: Extend Indent Hooks + Create Transfer Hooks

**Files:**
- Modify: `hooks/ims/use-ims-indents.ts`
- Create: `hooks/ims/use-ims-transfers.ts`
- Modify: `hooks/ims/index.ts`

### Step 1: Add `useLocalApproveImsIndent` to `use-ims-indents.ts`

Append to the end of `hooks/ims/use-ims-indents.ts`:

```typescript
export function useLocalApproveImsIndent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      ImsIndentService.localApproveIndent(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-indents'] });
      queryClient.invalidateQueries({ queryKey: ['ims-indent'] });
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
    },
  });
}
```

### Step 2: Create `hooks/ims/use-ims-transfers.ts`

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImsIndentService } from '@/lib/services/ims/indent-service';
import { ImsSupplyTransferService } from '@/lib/services/ims/supply-transfer-service';
import type { ImsIndentFilters, CreateImsIndentDto } from '@/types/ims';
import type {
  ImsShipmentFilters,
  CreateShipmentDto,
  DispatchShipmentDto,
  ConfirmReceiptLine,
} from '@/types/ims';

/**
 * Fetch inter-institution transfer requests (indents with request_scope='inter_institution').
 * Thin wrapper around useImsIndents — locks in the scope filter.
 */
export function useImsTransfers(filters: Omit<ImsIndentFilters, 'request_scope'>) {
  return useQuery({
    queryKey: ['ims-transfers', filters],
    queryFn: () =>
      ImsIndentService.getIndents({ ...filters, request_scope: 'inter_institution' }),
    enabled: !!(filters.store_id || filters.source_store_id || filters.destination_store_id || filters.institution_id),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch all shipments for a specific transfer request.
 */
export function useImsShipmentsForRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: ['ims-shipments-for-request', requestId],
    queryFn: () => ImsSupplyTransferService.getShipmentsForRequest(requestId!),
    enabled: !!requestId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch shipments with filters (for central store dispatch queue view).
 */
export function useImsShipments(filters: ImsShipmentFilters) {
  return useQuery({
    queryKey: ['ims-shipments', filters],
    queryFn: () => ImsSupplyTransferService.getShipments(filters),
    enabled: !!(filters.source_store_id || filters.destination_institution_id || filters.request_id),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Create a new transfer request (college store → central store).
 */
export function useCreateImsTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateImsIndentDto; userId: string }) =>
      ImsIndentService.createIndent(data, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
    },
  });
}

/**
 * Central store: create a shipment for an approved request.
 */
export function useCreateImsShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateShipmentDto) =>
      ImsSupplyTransferService.createShipment(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['ims-shipments-for-request'] });
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
    },
  });
}

/**
 * Central store: mark a shipment dispatched.
 * DB trigger fires to deduct stock and set request status = 'shipped'.
 */
export function useDispatchImsShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shipmentId, dto }: { shipmentId: string; dto: DispatchShipmentDto }) =>
      ImsSupplyTransferService.dispatchShipment(shipmentId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['ims-shipments-for-request'] });
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
    },
  });
}

/**
 * College store: confirm receipt of a dispatched shipment.
 * DB RPC fires to create stock batches at the destination institution.
 */
export function useConfirmImsShipmentReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      shipmentId,
      receivedBy,
      notes,
      lines,
    }: {
      shipmentId: string;
      receivedBy: string;
      notes: string;
      lines: ConfirmReceiptLine[];
    }) => ImsSupplyTransferService.confirmReceipt(shipmentId, receivedBy, notes, lines),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ims-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['ims-shipments-for-request'] });
      queryClient.invalidateQueries({ queryKey: ['ims-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['ims-stock-summary'] });
    },
  });
}
```

### Step 3: Add export to `hooks/ims/index.ts`

Append:

```typescript
export * from './use-ims-transfers';
```

### Step 4: Verify + Commit

```bash
npx tsc --noEmit 2>&1 | head -20
git add hooks/ims/use-ims-indents.ts hooks/ims/use-ims-transfers.ts hooks/ims/index.ts
git commit -m "feat(ims): add transfer hooks — useImsTransfers, useCreateImsShipment, useDispatchImsShipment, useConfirmImsShipmentReceipt"
```

---

## Task 6: Add Transfers to Sidebar Menu

**File:** `lib/sidebarMenuLink.ts`

### Step 1: Add permission route entries

Find the Indents permission block (around line 430) and add after `'/ims/indents/pending': 'ims.indent.approve',`:

```typescript
  '/ims/transfers': 'ims.indent.view',
  '/ims/transfers/[id]': 'ims.indent.view',
```

### Step 2: Insert Transfers menu block

After the closing `}` of the Indents menu block (after line 666 — the `},` closing Indents) and before the Sales menu block (line 667), insert:

```typescript
        {
          href: '/ims/transfers',
          label: 'Transfers',
          active: pathname.startsWith('/ims/transfers'),
          icon: ArrowLeftRight,
          submenus: [
            {
              href: '/ims/transfers',
              label: 'Overview',
              active: pathname === '/ims/transfers'
            }
          ]
        },
```

Note: `ArrowLeftRight` is already imported in the lucide-react import block.

### Step 3: Verify + Commit

```bash
npx tsc --noEmit 2>&1 | head -20
git add lib/sidebarMenuLink.ts
git commit -m "feat(ims): add Transfers menu entry to IMS sidebar"
```

---

## Task 7: Build the Transfers Page

**Files (all new):**
- `app/(routes)/ims/transfers/page.tsx`
- `app/(routes)/ims/transfers/_components/TransferModeBadge.tsx`
- `app/(routes)/ims/transfers/_components/TransferKpiCards.tsx`
- `app/(routes)/ims/transfers/_components/CollegeRequestView.tsx`
- `app/(routes)/ims/transfers/_components/CentralDispatchView.tsx`
- `app/(routes)/ims/transfers/_components/NewRequestSlideover.tsx`
- `app/(routes)/ims/transfers/_components/ReviewSlideover.tsx`

### Step 1: Create `TransferModeBadge.tsx`

```typescript
// app/(routes)/ims/transfers/_components/TransferModeBadge.tsx
'use client';

interface TransferModeBadgeProps {
  isCentralStore: boolean;
  centralStoreName?: string;
}

export function TransferModeBadge({ isCentralStore, centralStoreName }: TransferModeBadgeProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted border text-sm">
      <span>{isCentralStore ? '📥' : '📤'}</span>
      <span className="font-medium">
        {isCentralStore
          ? 'DISPATCH MODE — Managing incoming requests from department stores'
          : `REQUEST MODE — Requesting from: ${centralStoreName ?? 'Central Store'}`}
      </span>
    </div>
  );
}
```

### Step 2: Create `TransferKpiCards.tsx`

```typescript
// app/(routes)/ims/transfers/_components/TransferKpiCards.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface KpiCard {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}

interface TransferKpiCardsProps {
  cards: KpiCard[];
}

export function TransferKpiCards({ cards }: TransferKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <button key={card.label} onClick={card.onClick} className="text-left w-full">
          <Card className={card.active ? 'ring-2 ring-primary' : 'hover:shadow-md transition-shadow'}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}
```

### Step 3: Create `CollegeRequestView.tsx`

```typescript
// app/(routes)/ims/transfers/_components/CollegeRequestView.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { TransferKpiCards } from './TransferKpiCards';
import { NewRequestSlideover } from './NewRequestSlideover';
import { useImsTransfers } from '@/hooks/ims/use-ims-transfers';
import { INDENT_STATUS_CONFIG } from '@/types/ims';
import type { ImsIndentStatus } from '@/types/ims';

interface CollegeRequestViewProps {
  storeId: string;
  institutionId: string;
  centralStoreId: string;
  centralInstitutionId: string;
}

export function CollegeRequestView({
  storeId,
  institutionId,
  centralStoreId,
  centralInstitutionId,
}: CollegeRequestViewProps) {
  const [statusFilter, setStatusFilter] = useState<ImsIndentStatus | undefined>();
  const [slideoverOpen, setSlideoverOpen] = useState(false);

  const { data, isLoading } = useImsTransfers({
    source_store_id: storeId,
    status: statusFilter,
  });

  const transfers = data?.data ?? [];

  // KPI counts
  const pending = data?.data.filter(t => t.status === 'pending_approval' || t.status === 'pending_local_approval').length ?? 0;
  const approved = data?.data.filter(t => t.status === 'approved').length ?? 0;
  const inTransit = data?.data.filter(t => t.status === 'shipped').length ?? 0;
  const fulfilled = data?.data.filter(t => t.status === 'received' || t.status === 'received_with_variance').length ?? 0;

  const kpiCards = [
    { label: 'Pending', value: pending, active: statusFilter === 'pending_approval', onClick: () => setStatusFilter(s => s === 'pending_approval' ? undefined : 'pending_approval') },
    { label: 'Approved', value: approved, active: statusFilter === 'approved', onClick: () => setStatusFilter(s => s === 'approved' ? undefined : 'approved') },
    { label: 'In Transit', value: inTransit, active: statusFilter === 'shipped', onClick: () => setStatusFilter(s => s === 'shipped' ? undefined : 'shipped') },
    { label: 'Fulfilled', value: fulfilled, active: statusFilter === 'received', onClick: () => setStatusFilter(s => s === 'received' ? undefined : 'received') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <TransferKpiCards cards={kpiCards} />
        <Button onClick={() => setSlideoverOpen(true)} className="shrink-0 ml-4">
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
        </div>
      ) : transfers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No transfer requests found. Click &quot;New Request&quot; to get started.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {transfers.map((t) => {
            const cfg = INDENT_STATUS_CONFIG[t.status];
            return (
              <Link
                key={t.id}
                href={`/ims/transfers/${t.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm">{t.indent_number}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.purpose}</div>
                </div>
                <Badge variant={cfg.variant} className="shrink-0 ml-4">{cfg.label}</Badge>
              </Link>
            );
          })}
        </div>
      )}

      <NewRequestSlideover
        open={slideoverOpen}
        onClose={() => setSlideoverOpen(false)}
        storeId={storeId}
        institutionId={institutionId}
        centralStoreId={centralStoreId}
        centralInstitutionId={centralInstitutionId}
      />
    </div>
  );
}
```

### Step 4: Create `CentralDispatchView.tsx`

```typescript
// app/(routes)/ims/transfers/_components/CentralDispatchView.tsx
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { TransferKpiCards } from './TransferKpiCards';
import { ReviewSlideover } from './ReviewSlideover';
import { useImsTransfers } from '@/hooks/ims/use-ims-transfers';
import { useImsShipments } from '@/hooks/ims/use-ims-transfers';
import { INDENT_STATUS_CONFIG } from '@/types/ims';
import type { ImsIndentRequest, ImsIndentStatus } from '@/types/ims';

interface CentralDispatchViewProps {
  storeId: string;
  institutionId: string;
}

export function CentralDispatchView({ storeId, institutionId }: CentralDispatchViewProps) {
  const [statusFilter, setStatusFilter] = useState<ImsIndentStatus | undefined>('pending_approval');
  const [reviewing, setReviewing] = useState<ImsIndentRequest | null>(null);

  const { data: incomingData, isLoading: loadingIncoming } = useImsTransfers({
    destination_store_id: storeId,
    status: statusFilter,
  });

  const { data: dispatchData } = useImsShipments({
    source_store_id: storeId,
    status: 'preparing',
  });

  const incoming = incomingData?.data ?? [];
  const readyToDispatch = dispatchData?.data ?? [];

  const needsReview = incomingData?.data.filter(t => t.status === 'pending_approval').length ?? 0;
  const packing = dispatchData?.data.filter(s => s.status === 'preparing').length ?? 0;
  const inTransit = 0; // fetched separately if needed
  const fulfilled = incomingData?.data.filter(t => t.status === 'received').length ?? 0;

  const kpiCards = [
    { label: 'Needs Review', value: needsReview, active: statusFilter === 'pending_approval', onClick: () => setStatusFilter('pending_approval') },
    { label: 'Packing', value: packing, active: false, onClick: () => {} },
    { label: 'In Transit', value: inTransit, active: statusFilter === 'shipped', onClick: () => setStatusFilter('shipped') },
    { label: 'Fulfilled', value: fulfilled, active: statusFilter === 'received', onClick: () => setStatusFilter('received') },
  ];

  return (
    <div className="space-y-4">
      <TransferKpiCards cards={kpiCards} />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Incoming requests */}
        <div>
          <h3 className="font-semibold mb-3 text-sm">Incoming Requests</h3>
          {loadingIncoming ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
          ) : incoming.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center border rounded-lg">No incoming requests</div>
          ) : (
            <div className="border rounded-lg divide-y">
              {incoming.map((t) => {
                const cfg = INDENT_STATUS_CONFIG[t.status];
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{t.indent_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.destination_institution?.institution_name ?? '—'} · {t.purpose}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setReviewing(t)}>
                        Review →
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dispatch queue */}
        <div>
          <h3 className="font-semibold mb-3 text-sm">Dispatch Queue</h3>
          {readyToDispatch.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center border rounded-lg">No shipments pending dispatch</div>
          ) : (
            <div className="border rounded-lg divide-y">
              {readyToDispatch.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{s.shipment_no}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.destination_institution?.institution_name ?? '—'}
                    </div>
                  </div>
                  <Link href={`/ims/transfers/${s.request_id}`}>
                    <Button size="sm">Mark Dispatched</Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {reviewing && (
        <ReviewSlideover
          transfer={reviewing}
          centralStoreId={storeId}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}
```

### Step 5: Create `NewRequestSlideover.tsx`

```typescript
// app/(routes)/ims/transfers/_components/NewRequestSlideover.tsx
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateImsTransfer } from '@/hooks/ims/use-ims-transfers';
import { useImsItemsForSelect } from '@/hooks/ims';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';

interface NewRequestSlideoverProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  institutionId: string;
  centralStoreId: string;
  centralInstitutionId: string;
}

interface LineItem {
  item_id: string;
  item_name: string;
  quantity: number;
  unit_id: string;
  unit_name: string;
}

export function NewRequestSlideover({
  open,
  onClose,
  storeId,
  institutionId,
  centralStoreId,
  centralInstitutionId,
}: NewRequestSlideoverProps) {
  const { userProfile } = usePermissions();
  const createTransfer = useCreateImsTransfer();

  const [purpose, setPurpose] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'urgent' | 'emergency'>('normal');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [search, setSearch] = useState('');

  // Fetch distributable items from the central store (non-bundle, is_active)
  const { data: itemsData } = useImsItemsForSelect(centralStoreId);
  const items = (itemsData ?? []).filter(
    (i) => !i.is_bundle && i.name.toLowerCase().includes(search.toLowerCase())
  );

  const addLine = (item: { id: string; name: string; default_unit_id?: string; default_unit_name?: string }) => {
    if (lines.find((l) => l.item_id === item.id)) return;
    setLines((prev) => [
      ...prev,
      { item_id: item.id, item_name: item.name, quantity: 1, unit_id: item.default_unit_id ?? '', unit_name: item.default_unit_name ?? '' },
    ]);
  };

  const updateQty = (itemId: string, qty: number) => {
    setLines((prev) => prev.map((l) => (l.item_id === itemId ? { ...l, quantity: Math.max(1, qty) } : l)));
  };

  const removeLine = (itemId: string) => {
    setLines((prev) => prev.filter((l) => l.item_id !== itemId));
  };

  const handleSubmit = async () => {
    if (!purpose.trim() || lines.length === 0) {
      toast.error('Add a purpose and at least one item.');
      return;
    }
    await createTransfer.mutateAsync({
      data: {
        purpose,
        urgency,
        institution_id: institutionId,
        store_id: storeId,
        request_scope: 'inter_institution',
        source_store_id: storeId,
        destination_institution_id: centralInstitutionId,
        destination_store_id: centralStoreId,
        items: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity, unit_id: l.unit_id })),
      },
      userId: userProfile?.id ?? '',
    });
    toast.success('Supply request submitted.');
    setLines([]);
    setPurpose('');
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Transfer Request</SheetTitle>
          <p className="text-sm text-muted-foreground">Requesting from: Central Store</p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <Label>Purpose *</Label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Exam week stationery" />
          </div>

          <div>
            <Label>Priority</Label>
            <Select value={urgency} onValueChange={(v) => setUrgency(v as typeof urgency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Search Items</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search central store catalog..." />
          </div>

          {search && items.length > 0 && (
            <div className="border rounded-lg max-h-40 overflow-y-auto divide-y">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addLine(item)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between"
                >
                  <span>{item.name}</span>
                  <span className="text-xs text-primary">+ Add</span>
                </button>
              ))}
            </div>
          )}

          {lines.length > 0 && (
            <div>
              <Label>Request Summary</Label>
              <div className="border rounded-lg divide-y mt-1">
                {lines.map((l) => (
                  <div key={l.item_id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 text-sm">{l.item_name}</span>
                    <Input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) => updateQty(l.item_id, Number(e.target.value))}
                      className="w-16 h-7 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">{l.unit_name}</span>
                    <button onClick={() => removeLine(l.item_id)} className="text-destructive text-xs ml-1">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={createTransfer.isPending}>
              {createTransfer.isPending ? 'Submitting...' : 'Submit Request →'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

### Step 6: Create `ReviewSlideover.tsx`

```typescript
// app/(routes)/ims/transfers/_components/ReviewSlideover.tsx
'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useApproveImsIndent, useRejectImsIndent } from '@/hooks/ims/use-ims-indents';
import { usePermissions } from '@/hooks/use-permissions';
import { INDENT_URGENCY_CONFIG } from '@/types/ims';
import type { ImsIndentRequest } from '@/types/ims';
import { toast } from 'sonner';

interface ReviewSlideoverProps {
  transfer: ImsIndentRequest;
  centralStoreId: string;
  onClose: () => void;
}

export function ReviewSlideover({ transfer, onClose }: ReviewSlideoverProps) {
  const { userProfile } = usePermissions();
  const approve = useApproveImsIndent();
  const reject = useRejectImsIndent();
  const [note, setNote] = useState('');

  const urgencyCfg = INDENT_URGENCY_CONFIG[transfer.urgency];

  const handleApprove = async () => {
    await approve.mutateAsync({ id: transfer.id, userId: userProfile?.id ?? '' });
    toast.success(`Request ${transfer.indent_number} approved.`);
    onClose();
  };

  const handleDecline = async () => {
    if (!note.trim()) { toast.error('Add a reason to decline.'); return; }
    await reject.mutateAsync({ id: transfer.id, userId: userProfile?.id ?? '', reason: note });
    toast.success(`Request ${transfer.indent_number} declined.`);
    onClose();
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Review {transfer.indent_number}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            From: {transfer.destination_institution?.institution_name ?? '—'}
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Badge variant={urgencyCfg.variant}>{urgencyCfg.label}</Badge>
          </div>

          <div>
            <p className="text-sm font-medium">Purpose</p>
            <p className="text-sm text-muted-foreground">{transfer.purpose}</p>
          </div>

          {transfer.notes && (
            <div>
              <p className="text-sm font-medium">Notes from store</p>
              <p className="text-sm text-muted-foreground">{transfer.notes}</p>
            </div>
          )}

          <div>
            <Label>Response note (required to decline)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional for approval, required for decline" rows={3} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="destructive" className="flex-1" onClick={handleDecline} disabled={reject.isPending}>
              Decline
            </Button>
            <Button className="flex-1" onClick={handleApprove} disabled={approve.isPending}>
              Approve & Pack →
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

### Step 7: Create the main `transfers/page.tsx`

```typescript
// app/(routes)/ims/transfers/page.tsx
'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsStore, useImsStores } from '@/hooks/ims';
import { TransferModeBadge } from './_components/TransferModeBadge';
import { CollegeRequestView } from './_components/CollegeRequestView';
import { CentralDispatchView } from './_components/CentralDispatchView';

export default function TransfersPage() {
  const { storeId, institutionId, isStoreSelected, isResolving } = useImsStoreContext();

  // Get current store metadata to determine mode
  const { data: currentStore } = useImsStore(storeId ?? '');
  const isCentralStore = currentStore?.is_central_supply_store ?? false;

  // Resolve the central store (college view needs its ID and institution)
  const { data: centralStoreData } = useImsStores({ is_central_supply_store: true, is_active: true, limit: 1 });
  const centralStore = centralStoreData?.data[0];

  if (isResolving || !isStoreSelected) {
    return (
      <ContentLayout title="Transfers">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          {isResolving ? 'Resolving store...' : 'Select a store to view transfers.'}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Transfers">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Supply Transfers</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {isCentralStore
              ? 'Review and dispatch supply requests from department stores.'
              : 'Request supplies from the central store and track your shipments.'}
          </p>
        </div>

        <TransferModeBadge
          isCentralStore={isCentralStore}
          centralStoreName={centralStore?.name}
        />

        {isCentralStore ? (
          <CentralDispatchView storeId={storeId!} institutionId={institutionId} />
        ) : (
          <CollegeRequestView
            storeId={storeId!}
            institutionId={institutionId}
            centralStoreId={centralStore?.id ?? ''}
            centralInstitutionId={centralStore?.institution_id ?? ''}
          />
        )}
      </div>
    </ContentLayout>
  );
}
```

### Step 8: Verify TypeScript + Commit

```bash
npx tsc --noEmit 2>&1 | head -30
git add app/(routes)/ims/transfers/
git commit -m "feat(ims): add transfers page with college request and central dispatch views"
```

---

## Task 8: Transfer Detail Page

**File (new):** `app/(routes)/ims/transfers/[id]/page.tsx`

### Step 1: Create the detail page

```typescript
// app/(routes)/ims/transfers/[id]/page.tsx
'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useImsIndent } from '@/hooks/ims/use-ims-indents';
import { useImsShipmentsForRequest, useCreateImsShipment, useDispatchImsShipment, useConfirmImsShipmentReceipt } from '@/hooks/ims/use-ims-transfers';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsStore } from '@/hooks/ims';
import { usePermissions } from '@/hooks/use-permissions';
import { INDENT_STATUS_CONFIG, INDENT_URGENCY_CONFIG } from '@/types/ims';
import { toast } from 'sonner';

export default function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { storeId } = useImsStoreContext();
  const { data: currentStore } = useImsStore(storeId ?? '');
  const isCentralStore = currentStore?.is_central_supply_store ?? false;
  const { userProfile } = usePermissions();

  const { data: transfer, isLoading } = useImsIndent(id);
  const { data: shipments } = useImsShipmentsForRequest(id);

  const createShipment = useCreateImsShipment();
  const dispatch = useDispatchImsShipment();
  const confirmReceipt = useConfirmImsShipmentReceipt();

  if (isLoading) {
    return <ContentLayout title="Transfer"><div className="animate-pulse h-64 bg-muted rounded" /></ContentLayout>;
  }

  if (!transfer) {
    return <ContentLayout title="Transfer"><p className="text-muted-foreground">Transfer not found.</p></ContentLayout>;
  }

  const statusCfg = INDENT_STATUS_CONFIG[transfer.status];
  const urgencyCfg = INDENT_URGENCY_CONFIG[transfer.urgency];
  const preparingShipment = shipments?.find(s => s.status === 'preparing');
  const dispatchedShipment = shipments?.find(s => s.status === 'dispatched');

  const handleCreateShipment = async () => {
    if (!storeId) return;
    await createShipment.mutateAsync({
      request_id: id,
      source_store_id: storeId,
      destination_institution_id: transfer.destination_institution_id!,
      destination_store_id: transfer.destination_store_id ?? undefined,
      items: transfer.items?.map(i => ({
        item_id: i.item_id,
        dispatched_quantity: i.quantity,
        unit_id: i.unit_id,
      })) ?? [],
    });
    toast.success('Shipment created — ready to pack.');
  };

  const handleDispatch = async () => {
    if (!preparingShipment) return;
    await dispatch.mutateAsync({
      shipmentId: preparingShipment.id,
      dto: { dispatched_by: userProfile?.id ?? '' },
    });
    toast.success('Shipment marked as dispatched. Stock deducted from central store.');
  };

  const handleConfirmReceipt = async () => {
    if (!dispatchedShipment) return;
    await confirmReceipt.mutateAsync({
      shipmentId: dispatchedShipment.id,
      receivedBy: userProfile?.id ?? '',
      notes: '',
      lines: dispatchedShipment.items?.map(i => ({
        shipment_item_id: i.id,
        received_qty: i.dispatched_quantity,
      })) ?? [],
    });
    toast.success('Receipt confirmed. Stock added to your store.');
  };

  return (
    <ContentLayout title={`Transfer ${transfer.indent_number}`}>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{transfer.indent_number}</h2>
            <p className="text-muted-foreground text-sm">{transfer.purpose}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant={urgencyCfg.variant}>{urgencyCfg.label}</Badge>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
        </div>

        {/* Route */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Transfer Route</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">From: </span>{transfer.source_store?.name ?? 'Unknown'}</div>
            <div><span className="text-muted-foreground">To: </span>{transfer.destination_institution?.institution_name ?? '—'}{transfer.destination_store ? ` · ${transfer.destination_store.name}` : ''}</div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Requested Items</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {transfer.items?.map(item => (
                <div key={item.id} className="flex justify-between py-2 text-sm">
                  <span>{item.item?.name ?? item.item_id}</span>
                  <span className="text-muted-foreground">{item.quantity} {item.unit?.abbreviation}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          {isCentralStore && transfer.status === 'approved' && !preparingShipment && (
            <Button onClick={handleCreateShipment} disabled={createShipment.isPending}>
              Create Shipment
            </Button>
          )}
          {isCentralStore && preparingShipment && (
            <Button onClick={handleDispatch} disabled={dispatch.isPending}>
              Mark Dispatched
            </Button>
          )}
          {!isCentralStore && dispatchedShipment && (
            <Button onClick={handleConfirmReceipt} disabled={confirmReceipt.isPending}>
              Confirm Receipt
            </Button>
          )}
        </div>
      </div>
    </ContentLayout>
  );
}
```

### Step 2: Verify + Commit

```bash
npx tsc --noEmit 2>&1 | head -30
git add "app/(routes)/ims/transfers/[id]/page.tsx"
git commit -m "feat(ims): add transfer detail page with shipment create/dispatch/receipt actions"
```

---

## Task 9: Smoke Test End-to-End

### Step 1: Start dev server

```bash
npm run dev
```

### Step 2: Manual test — College store flow

1. Log in as a college store user (or super admin → switch to a college store)
2. Navigate to IMS → Transfers
3. Verify: Mode badge shows "📤 REQUEST MODE"
4. Verify: KPI cards are visible (all zero for new setup)
5. Click "+ New Request"
6. Search for an item in the slideover
7. Add item + set qty + set purpose → Submit
8. Verify: New request appears in the list with "Pending" status

### Step 3: Manual test — Central store flow

1. Switch active store to Central Store (via StoreSwitcher)
2. Navigate to IMS → Transfers
3. Verify: Mode badge shows "📥 DISPATCH MODE"
4. Verify: Incoming Requests list shows the request from Step 2
5. Click "Review →" on the request
6. Click "Approve & Pack →"
7. Verify: request status changes to "Approved"

### Step 4: Manual test — Dispatch + Receipt

1. On the same transfer detail page (`/ims/transfers/[id]`)
2. As central store: click "Create Shipment" → then "Mark Dispatched"
3. Verify: request status changes to "Shipped"
4. Switch back to college store → navigate to Transfers
5. Click the request → click "Confirm Receipt"
6. Verify: status changes to "Received"
7. Navigate to IMS → Stock → verify stock increased at college store

### Step 5: Super admin store-switching test

1. As super admin, switch stores rapidly (college → central → college)
2. Verify: Transfers page mode badge and content switch correctly each time
3. Verify: No stale data shown (React Query invalidation working)

---

## Verification Checklist

- [ ] TypeScript: `npx tsc --noEmit` passes with no new errors
- [ ] Sidebar: "Transfers" menu item appears between Indents and Sales
- [ ] College view: mode badge, KPI cards, request list, new request slideover
- [ ] Central view: mode badge, KPI cards, incoming queue, dispatch queue, review slideover
- [ ] College raises request → appears in central's incoming queue
- [ ] Central approves → college request status updates to "Approved"
- [ ] Central dispatches → stock deducted from central (check ims_stock_summary)
- [ ] College confirms receipt → stock batches created at destination (check ims_stock_batches)
- [ ] Super admin switching stores updates the page mode correctly
- [ ] No errors in browser console during normal flow
