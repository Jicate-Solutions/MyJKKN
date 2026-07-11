// lib/services/procurement/domain-adapters/types.ts
//
// THE reusability seam of the centralized Procurement module.
//
// The procurement spine (Purchase Request -> RFQ -> Quotation -> PO -> GRN ->
// three-way-match) is domain-agnostic: it references items only by
// { domain, domain_item_id, snapshot } and never joins to any one catalog.
// Each consuming module ("domain") registers an adapter that teaches procurement
// two things:
//   1. how to look items up in that module's catalog (build a PR/PO), and
//   2. how to post accepted goods into that module's inventory (on GRN verify).
//
// IMS is the first registered domain. Resource Management (etc.) plug in later by
// implementing this same interface — with ZERO schema change to procurement_*.
//
// See docs/centralized-store/PLAN-procurement-v1.md §2 and §9 (contribution point 1).

/** Supported procurement domains. Extend this union as modules register adapters. */
export type ProcurementDomain = 'ims' | 'resource_mgmt';

/** Ambient context threaded into every adapter call. */
export interface DomainCtx {
  institutionId: string;
  /** Optional physical store (IMS uses ims_stores; other domains may ignore). */
  storeId?: string | null;
  /** Acting user (for audit / created_by on inventory writes). */
  userId: string;
}

/** Normalized item as procurement sees it — each adapter maps its own catalog to this. */
export interface CatalogItem {
  domainItemId: string;
  name: string;
  code?: string | null;
  spec?: string | null;
  unitId?: string | null;
  unitLabel?: string | null;
  hsnCode?: string | null;
  gstRate?: number | null;
  isChemical?: boolean;
  costPrice?: number | null;
  reorderLevel?: number | null;
  currentStock?: number | null;
}

/** Denormalized fields procurement persists so it never has to join back to the catalog. */
export interface ItemSnapshot {
  name: string;
  spec?: string | null;
  unitId?: string | null;
  unitLabel?: string | null;
  hsnCode?: string | null;
  gstRate?: number | null;
  isChemical?: boolean;
}

/** One accepted GRN line handed to the domain to post into its inventory. */
export interface AcceptedReceiptLine {
  domainItemId: string;
  acceptedQuantity: number;
  unitId?: string | null;
  costPrice: number;
  /** taxable + GST (actual paid value); falls back to costPrice*qty if omitted. */
  totalValue?: number | null;
  batchNumber?: string | null;
  expiryDate?: string | null;        // ISO date
  manufacturingDate?: string | null; // ISO date
  // Traceability back to the procurement documents:
  grnId: string;
  grnNumber: string;
  purchaseOrderId?: string | null;
  /**
   * The procurement_grn_items row driving this post. Domains that post via a
   * SECURITY DEFINER RPC (RM) hand it to the DB so the write is bound to a real
   * verified line and claimed exactly-once (domain_posted_at).
   */
  grnItemId: string;
}

/**
 * A domain adapter — one per consuming module. Registered in registry.ts.
 */
export interface ProcurementDomainAdapter {
  readonly domain: ProcurementDomain;

  /**
   * True when postReceipt is exactly-once at the DB (e.g. RM's SECURITY DEFINER
   * RPC claims the GRN line inside its own transaction). Only such domains get
   * the reopen-GRN-and-retry recovery on a mid-verify failure — replaying a
   * client-side, non-idempotent post (IMS) would double-count stock (review r2).
   */
  readonly idempotentPosts?: boolean;

  /** Search this domain's catalog to build a PR/PO line from an existing item. */
  searchItems(query: string, ctx: DomainCtx): Promise<CatalogItem[]>;

  /** Resolve a single catalog item (e.g. to refresh a snapshot). */
  getItem(domainItemId: string, ctx: DomainCtx): Promise<CatalogItem | null>;

  /**
   * Post an accepted GRN line into this domain's inventory.
   * Called on GRN verify, once per accepted line. Must be idempotent-safe at the
   * caller's discretion (procurement guards double-post via GRN status).
   */
  postReceipt(line: AcceptedReceiptLine, ctx: DomainCtx): Promise<void>;

  /**
   * Optional: materialize a "new item" Purchase Request (domain_item_id === null)
   * into the domain catalog after approval, returning the new domain_item_id.
   * Domains that don't support catalog creation may omit this.
   * `poItemId` lets the domain dedupe split deliveries against the PO line —
   * a second GRN for the same line reuses the already-materialized item.
   */
  reconcileNewItem?(snapshot: ItemSnapshot, ctx: DomainCtx, poItemId?: string | null): Promise<string>;
}
