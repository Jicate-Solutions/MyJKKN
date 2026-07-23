/**
 * IMS (Inventory Management System) Smart Guide — authored content.
 *
 * Five operational lanes in plain 12th-grade language, authored from the
 * module's REAL routes and the real route→permission guards in
 * lib/sidebarMenuLink.ts. Every step that happens on a page carries a
 * "Take me there" deep-link. Permission gating uses the shared REQUIRES keys
 * below (a rename becomes a compile error wherever these are imported, not a
 * silent fail-open lane).
 *
 * Role split (confirmed against the sidebar guards):
 *   requester    raises stock requests (indents)       → ims.indents.create
 *   approver     clears or rejects those requests       → ims.indents.approve
 *   storekeeper  inventory + stock + goods receipt      → ims.stock.view
 *   cashier      point-of-sale store counter            → ims.sales.create
 *   admin        suppliers, stores, units, audit        → ims.settings.view
 *
 * NO screenshots in this rollout — every step is text only (no `image` field).
 */
import type { GuideBook } from "./types";

/** Permission keys that gate each lane. ONE source of truth. */
export const REQUIRES = {
  admin: "ims.settings.view",
  approver: "ims.indents.approve",
  cashier: "ims.sales.create",
  requester: "ims.indents.create",
  storekeeper: "ims.stock.view",
} as const;

export const GUIDES: GuideBook = {
  lanes: {
    /* ── REQUESTER ─────────────────────────────────────────────────────── */
    requester: {
      persona: "requester",
      title: "Requester Guide",
      tagline:
        "You ask the store for the items your department needs — that request is called an indent.",
      whyItMatters:
        "An indent is the only way the store knows what to give you. A clear, well-filled request gets approved faster and keeps your department stocked.",
      startHere: { label: "Raise a new indent", href: "/ims/indents/new" },
      requires: REQUIRES.requester,
      journey: ["Open New Indent", "Add your items", "Set urgency", "Send for approval", "Track its status"],
      sections: [
        {
          id: "raise",
          title: "Raise a stock request (indent)",
          steps: [
            {
              action: "Open **Indents · New** to start a fresh request.",
              detail: "This is a form. Fill it top to bottom — your department, the items you need, and a short purpose.",
              platforms: {
                web: "left sidebar → IMS → Indents · New",
                mobile: "tap the menu → IMS → Indents · New",
              },
              link: { label: "Raise a new indent", href: "/ims/indents/new" },
            },
            {
              action: "**Add each item and its quantity**, then write a one-line **purpose**.",
              detail: "Pick items from the list and type how many you need. The purpose tells the approver why the department needs them.",
              tip: "Be specific with quantity. A vague request slows down the approver.",
            },
            {
              action: "Set the **urgency** — Normal, Urgent, or Emergency.",
              detail: "Use Emergency only for true emergencies — it jumps the queue, so over-using it makes it meaningless.",
            },
            {
              action: "**Submit** the indent to send it for approval.",
              detail: "Once submitted it goes to the approver. You can't edit a submitted indent — cancel and raise a new one if you made a mistake.",
            },
          ],
        },
        {
          id: "track",
          title: "Track and manage your requests",
          steps: [
            {
              action: "Open **Indents** to see all your requests and their status.",
              detail: "Each row shows who raised it, the required date, and whether it is pending, approved, or rejected.",
              platforms: {
                web: "left sidebar → IMS → Indents",
                mobile: "tap the menu → IMS → Indents",
              },
              link: { label: "View my indents", href: "/ims/indents" },
            },
            {
              action: "Click any indent to **open its details** and read approver notes.",
              detail: "If it was rejected, the note tells you why — fix it and raise a fresh request.",
            },
          ],
        },
      ],
    },

    /* ── APPROVER ──────────────────────────────────────────────────────── */
    approver: {
      persona: "approver",
      title: "Approver Guide",
      tagline:
        "You review the stock requests coming from departments and approve or reject each one.",
      whyItMatters:
        "Nothing leaves the store until you clear it. Your decision is the control that stops over-ordering and keeps spending in check.",
      startHere: { label: "Open Pending Approvals", href: "/ims/indents/pending" },
      requires: REQUIRES.approver,
      journey: ["Open Pending Approvals", "Read each request", "Approve or reject", "Leave a clear note"],
      sections: [
        {
          id: "approve",
          title: "Clear the approval queue",
          steps: [
            {
              action: "Open **Indents · Pending Approval** to see everything waiting on you.",
              detail: "The top of the page shows the total pending count so you know your workload at a glance.",
              platforms: {
                web: "left sidebar → IMS → Indents · Pending Approval",
                mobile: "tap the menu → IMS → Indents · Pending Approval",
              },
              link: { label: "Open Pending Approvals", href: "/ims/indents/pending" },
            },
            {
              action: "Click a request to **read its details** — items, quantity, purpose, and urgency.",
              detail: "Check that the quantity is reasonable and the purpose is genuine before you decide.",
              link: { label: "Open Indents", href: "/ims/indents" },
            },
            {
              action: "**Approve** good requests, or **Reject** with a short reason.",
              tip: "Always write a reason when rejecting — the requester sees it and can fix the request instead of guessing.",
            },
          ],
        },
      ],
    },

    /* ── STOREKEEPER ───────────────────────────────────────────────────── */
    storekeeper: {
      persona: "storekeeper",
      title: "Store-Keeper Guide",
      tagline:
        "You run the store room — receive goods, track stock, and keep every count honest.",
      whyItMatters:
        "Every number the whole module trusts comes from you. Accurate receiving and stock counts are what make reports and approvals mean anything.",
      startHere: { label: "Open Stock", href: "/ims/stock" },
      requires: REQUIRES.storekeeper,
      journey: ["Receive goods (GRN)", "Watch stock levels", "Track batches & expiry", "Adjust when needed", "Send transfers"],
      sections: [
        {
          id: "receive",
          title: "Receive goods into the store (GRN)",
          steps: [
            {
              action: "When a supplier delivers, open **Stock · GRN · New** to record it.",
              detail: "GRN means Goods Received Note. Pick the supplier, add each item, its quantity, batch number, and expiry date.",
              prerequisite:
                "The supplier must already exist in Settings before you can record their delivery. If they're missing, ask your IMS admin to add them.",
              platforms: {
                web: "left sidebar → IMS → Stock · GRN → New",
                mobile: "tap the menu → IMS → Stock · GRN · New",
              },
              link: { label: "Create a GRN", href: "/ims/stock/grn/new" },
            },
            {
              action: "**Receive (post)** the GRN once you've checked the delivery against the note.",
              detail: "Posting the GRN is what actually adds the goods to your stock count. Until you post it, the stock total does not move.",
              tip: "Count the physical delivery before you post. A wrong GRN throws off every report downstream.",
              link: { label: "Open all GRNs", href: "/ims/stock/grn" },
            },
          ],
        },
        {
          id: "track-stock",
          title: "Watch stock and batches",
          steps: [
            {
              action: "Open **Stock** to see what you have on hand and which items are running low.",
              detail: "Low-stock items are flagged against their reorder level so you know what to request next.",
              platforms: {
                web: "left sidebar → IMS → Stock",
                mobile: "tap the menu → IMS → Stock",
              },
              link: { label: "Open Stock", href: "/ims/stock" },
            },
            {
              action: "Open **Stock · Batches** to track expiry dates batch by batch.",
              detail: "Use the oldest batch first so nothing expires on the shelf.",
              link: { label: "Open Batches", href: "/ims/stock/batches" },
            },
            {
              action: "Check **Stock · Department** to see what each department has drawn.",
              link: { label: "Open Department stock", href: "/ims/stock/department" },
            },
          ],
        },
        {
          id: "adjust-transfer",
          title: "Correct counts and move stock",
          steps: [
            {
              action: "Open **Stock · Adjustments** to write off damaged goods or fix a wrong count.",
              detail: "Every adjustment is logged with a reason, so the store stays auditable. Only adjust when the physical count truly differs.",
              link: { label: "Open Adjustments", href: "/ims/stock/adjustments" },
            },
            {
              action: "Use **Transfers** to send stock to another store and to receive shipments coming in.",
              detail: "Dispatch a shipment when you send goods out; mark it received when goods arrive from another store.",
              platforms: {
                web: "left sidebar → IMS → Transfers",
                mobile: "tap the menu → IMS → Transfers",
              },
              link: { label: "Open Transfers", href: "/ims/transfers" },
            },
          ],
        },
        {
          id: "manage-items",
          title: "Keep the item list clean",
          steps: [
            {
              action: "Open **Items** to add new inventory items or update existing ones.",
              detail: "Set each item's reorder level here — that's what drives the low-stock alerts on your dashboard.",
              link: { label: "Open Items", href: "/ims/inventory/items" },
            },
            {
              action: "Open **Categories** to group items so they're easy to find.",
              link: { label: "Open Categories", href: "/ims/inventory/categories" },
            },
          ],
        },
      ],
    },

    /* ── CASHIER ───────────────────────────────────────────────────────── */
    cashier: {
      persona: "cashier",
      title: "Cashier Guide",
      tagline:
        "You run the store counter — ring up sales, take payment, and print receipts.",
      whyItMatters:
        "Every sale you record drops the item from stock and lands in the sales report. A clean checkout keeps both the till and the stock count correct.",
      startHere: { label: "Open the counter (POS)", href: "/ims/sales" },
      requires: REQUIRES.cashier,
      journey: ["Open the POS", "Add items to the cart", "Take payment", "Print the receipt", "Review history"],
      sections: [
        {
          id: "sell",
          title: "Make a sale",
          steps: [
            {
              action: "Open **Sales (POS)** to start a new sale at the counter.",
              detail: "POS means Point of Sale — the cash-counter screen.",
              platforms: {
                web: "left sidebar → IMS → Sales (POS)",
                mobile: "tap the menu → IMS → Sales (POS)",
              },
              link: { label: "Open the counter (POS)", href: "/ims/sales" },
            },
            {
              action: "**Add each item to the cart** and confirm the quantity.",
              detail: "The running total updates as you add items. Remove anything added by mistake before you take payment.",
            },
            {
              action: "**Take payment** — choose Cash or UPI — and complete the checkout.",
              detail: "Pick the payment type the customer used. The sale finishes only after checkout, and that's when stock drops.",
              tip: "For UPI, confirm the payment actually landed before you finish the sale.",
            },
          ],
        },
        {
          id: "after-sale",
          title: "Receipts and history",
          steps: [
            {
              action: "Open **Sales · History** to find a past sale.",
              detail: "Search by date to pull up any earlier bill.",
              link: { label: "Open Sales History", href: "/ims/sales/history" },
            },
            {
              action: "Open a sale and view its **receipt** to reprint it for the customer.",
              detail: "Refunds and voids need a separate permission — if a customer needs one and you can't do it, ask your IMS admin.",
            },
          ],
        },
      ],
    },

    /* ── ADMIN ─────────────────────────────────────────────────────────── */
    admin: {
      persona: "admin",
      title: "Admin Guide",
      tagline:
        "You set up the master lists the whole module runs on, and you keep the money side honest.",
      whyItMatters:
        "Stores, suppliers, and units are the foundation — nothing else works until these are right. The reports and audit are how you prove the store is run cleanly.",
      startHere: { label: "Open IMS Settings", href: "/ims/settings" },
      requires: REQUIRES.admin,
      journey: ["Set up stores", "Add suppliers", "Define units", "Read the reports", "Run the financial audit"],
      sections: [
        {
          id: "master-data",
          title: "Set up the master lists",
          steps: [
            {
              action: "Open **IMS Settings** — the home for every master list.",
              detail: "From here you reach Stores, Suppliers, Units, and Unit Conversions.",
              platforms: {
                web: "left sidebar → IMS → Settings",
                mobile: "tap the menu → IMS → Settings",
              },
              link: { label: "Open IMS Settings", href: "/ims/settings" },
            },
            {
              action: "Open **Settings · Stores** to create each physical store or store room.",
              detail: "Every item, sale, and transfer belongs to a store, so set these up first.",
              prerequisite:
                "Create at least one store before anyone tries to receive goods or sell — the rest of the module has nowhere to put stock until a store exists.",
              link: { label: "Manage Stores", href: "/ims/settings/stores" },
            },
            {
              action: "Open **Settings · Suppliers** to add the vendors you buy from.",
              detail: "Store-keepers can only record a delivery (GRN) against a supplier that exists here.",
              link: { label: "Manage Suppliers", href: "/ims/settings/suppliers" },
            },
            {
              action: "Open **Settings · Units** and **Unit Conversions** to define how items are measured.",
              detail: "Units are things like pieces, boxes, kilograms. Conversions tell the system how one unit relates to another (e.g. 1 box = 12 pieces).",
              link: { label: "Manage Units", href: "/ims/settings/units" },
            },
          ],
        },
        {
          id: "oversee",
          title: "Read reports and audit the money",
          steps: [
            {
              action: "Open the **Dashboard** for a daily snapshot of stock, low-stock alerts, and recent activity.",
              platforms: {
                web: "left sidebar → IMS → Dashboard",
                mobile: "tap the menu → IMS → Dashboard",
              },
              link: { label: "Open Dashboard", href: "/ims/dashboard" },
            },
            {
              action: "Open **Reports** to pull stock, sales, consumption, indent, and UPI reports.",
              detail: "Use these to see what's being bought, used, and spent across stores.",
              link: { label: "Open Reports", href: "/ims/reports" },
            },
            {
              action: "Open **Financial Audit** to cross-check the money trail.",
              detail: "This is where you verify that sales, payments, and stock movements all line up.",
              link: { label: "Open Financial Audit", href: "/ims/financial" },
            },
          ],
        },
      ],
    },
  },

  glossary: [
    { term: "Indent", def: "A request a department raises asking the store for items it needs. The approver clears it before anything is given out." },
    { term: "GRN", def: "Goods Received Note — the record a store-keeper makes when a supplier delivers goods. Posting it adds the goods to stock." },
    { term: "Stock", def: "How much of each item the store has on hand right now." },
    { term: "Reorder level", def: "The quantity at which an item is flagged as low and should be requested again." },
    { term: "Batch", def: "A group of the same item received together, tracked with its own expiry date so the oldest is used first." },
    { term: "Adjustment", def: "A logged correction to a stock count — for damage, loss, or a miscount — always with a reason." },
    { term: "Transfer", def: "Moving stock from one store to another: dispatched by the sender, received by the destination." },
    { term: "POS", def: "Point of Sale — the cash-counter screen where a cashier rings up a sale." },
    { term: "Supplier", def: "A vendor you buy goods from. Deliveries (GRNs) are recorded against a supplier." },
    { term: "Unit conversion", def: "A rule that links two units of measure, e.g. 1 box = 12 pieces, so quantities stay consistent." },
  ],

  plannedLocaleNote: "A Tamil version is planned — English only for now.",
};
