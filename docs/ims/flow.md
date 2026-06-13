# Payment Flow - Complete Implementation Guide

## Overview

The JKKN-POS payment flow handles the entire lifecycle from store setup through adding items to cart, payment processing, receipt generation, and post-sale actions. The system supports multi-store businesses where each store is a row in the `businesses` table.

```
Store Setup/Selection → Cart Management → Checkout → Payment Selection → Sale Creation → Receipt → Post-Sale Actions
```

---

## 1. Multi-Store Architecture Overview

JKKN-POS uses a multi-tenant model where each "store" is a row in the `businesses` table. A single authenticated user can access multiple stores depending on their profile and RLS policies. Two complementary systems manage business context at different layers:

```
┌──────────────────────────────────────────────────────────────┐
│  app/(dashboard)/layout.tsx                                  │
│                                                              │
│  ┌─ RBACProvider ──────────────────────────────────────────┐ │
│  │  Source: profile.business_id (from auth / profiles DB)  │ │
│  │  Scope:  sale records, RLS enforcement, permissions     │ │
│  │                                                         │ │
│  │  ┌─ StoreProvider ───────────────────────────────────┐  │ │
│  │  │  Source: currentStore (from localStorage + query) │  │ │
│  │  │  Scope:  UI data fetching, receipt display,       │  │ │
│  │  │          store switching dropdown                  │  │ │
│  │  │                                                   │  │ │
│  │  │  [Dashboard pages render here]                    │  │ │
│  │  └───────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Source:** `app/(dashboard)/layout.tsx` — `RBACProvider` wraps at line 70, `StoreProvider` wraps at line 38.

| Concern | Source System | Key Value |
|---------|--------------|-----------|
| Sale `business_id` | RBACProvider | `profile.business_id` |
| Receipt store data | StoreContext | `currentStore.name`, `.address`, `.phone`, `.gstin` |
| Items / customers fetch | StoreContext | `currentStore.id` |
| RLS row-level scoping | RBACProvider | `profiles.business_id` via `auth.uid()` |

---

## 2. Store Registration

### Path 1 — Signup (First Store)

**File:** `components/auth/signup-form.tsx`

The signup form collects four fields: `fullName`, `businessName`, `email`, `password`.

```typescript
const { data: authData, error } = await supabase.auth.signUp({
  email: data.email,
  password: data.password,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
    data: {
      full_name: data.fullName,
      business_name: data.businessName,
    },
  },
})
```

**What happens on the server:**

1. Supabase Auth creates the user
2. Database trigger `handle_new_user` fires automatically:
   - Creates a `businesses` row using the `business_name` from auth metadata
   - Creates a `profiles` row linking the user to that business with `role = 'OWNER'`
3. User arrives at the dashboard with one store already available

### Path 2 — Add Store (Additional Locations)

**File:** `app/(dashboard)/stores/add/page.tsx`

Authenticated users can add stores via the Stores management page. The page performs a direct Supabase insert:

```typescript
await supabase.from('businesses').insert({
  name: form.name,
  email: form.email || null,
  phone: form.phone || null,
  address: form.address || null,
  gstin: form.gstin || null,
  gst_type: form.gst_type.toLowerCase(),
  currency: form.currency,
  tax_rate: parseFloat(form.tax_rate) || 18,
  is_active: true,
})
```

**Fields:** name (required), email, phone, address, gstin, gst_type (`regular` | `composition`), currency, tax_rate.

> **Gap:** The Add Store page inserts a `businesses` row but does **not** create or update a `profiles` row linking the current user to the new business. See [Section 16](#16-architectural-considerations--known-gaps) for implications.

### Edit Store

**File:** `app/(dashboard)/stores/[id]/page.tsx`

Fetches the store by ID, renders an edit form, and updates the `businesses` row on submit. Same fields as Add Store.

### Soft Delete

**File:** `app/(dashboard)/stores/page.tsx`

Delete sets `is_active = false` on the `businesses` row. If the deleted store is the currently selected store, `localStorage('current_store_id')` is cleared so `StoreProvider` falls back to the first available store on next load.

```typescript
await supabase.from("businesses").update({ is_active: false }).eq("id", deleteId)

// Clear localStorage if deleting currently selected store
const storedStoreId = localStorage.getItem('current_store_id')
if (storedStoreId === deleteId) {
  localStorage.removeItem('current_store_id')
}
```

---

## 3. Store Context & Switching

**File:** `store/store-context.tsx`

### StoreContextType Interface

```typescript
interface StoreContextType {
  currentStore: Business | null
  stores: Business[]
  switchStore: (storeId: string) => void
  refreshStores: () => void
  loading: boolean
}
```

### Initialization Flow

1. `StoreProvider` mounts → calls `refreshStores()`
2. Fetches `businesses WHERE is_active = true ORDER BY name` (scoped by RLS)
3. Reads `localStorage.getItem('current_store_id')`
4. If stored ID matches a fetched business → sets that as `currentStore`
5. Otherwise → falls back to `businesses[0]` and writes its ID to localStorage

### switchStore()

```typescript
const switchStore = (storeId: string) => {
  const store = stores.find(s => s.id === storeId)
  if (store) {
    setCurrentStore(store)
    localStorage.setItem('current_store_id', storeId)
  }
}
```

- **Client-side only** — no server call, no page reload
- Updates React state + localStorage immediately

### StoreSelector Component

**File:** `components/store-selector.tsx`

A dropdown rendered in the dashboard header. Uses a `MapPin` icon, displays the current store name, and lists all active stores with a checkmark on the selected one. Selecting a store calls `switchStore()` and shows a toast notification.

### How Pages React to Store Changes

Dashboard pages re-fetch data when `currentStore` changes:

```typescript
// Pattern used in app/(dashboard)/sales/page.tsx
const { currentStore } = useStoreContext()

useEffect(() => {
  if (!currentStore?.id) return
  const [items, categories, customers] = await Promise.all([
    inventoryService.getBusinessItems(currentStore.id, { ... }),
    inventoryService.getCategories(currentStore.id),
    customerService.getBusinessCustomers(currentStore.id),
  ])
}, [currentStore])
```

---

## 4. Cart Management

**File:** `store/cart-store.ts`

### Data Model

```typescript
interface CartItem {
  id: string           // Unique cart entry ID
  item_id: string      // Product reference in DB
  name: string
  price: number        // Unit sell price
  quantity: number
  discount: number     // Per-item discount amount
  tax: number          // Calculated tax per item
  total: number        // (price * qty) - discount + tax
  image_url?: string
}

interface CartState {
  items: CartItem[]
  customer: Customer | null
  discount: number
  discountType: 'percentage' | 'fixed'
  notes: string
}
```

### Cart Actions

| Action | Description |
|--------|-------------|
| `addItem(item)` | Add product or increment qty if exists |
| `removeItem(itemId)` | Remove item from cart |
| `updateQuantity(itemId, qty)` | Change quantity (remove if <=0) |
| `updateItemDiscount(itemId, discount)` | Apply per-item discount |
| `setCustomer(customer)` | Attach customer to sale |
| `setDiscount(value, type)` | Apply cart-level discount |
| `setNotes(notes)` | Add sale notes |
| `clearCart()` | Reset entire cart state |

### Cart Calculations

```
TAX_RATE     = 0 (GST included in item prices)
Subtotal     = SUM(item.price * item.quantity)
DiscountAmt  = (discountType == 'percentage') ? subtotal * discount / 100 : discount
TaxAmount    = (subtotal - discountAmt) * TAX_RATE
Total        = subtotal - discountAmt + taxAmount
```

### Persistence

- **Zustand** with `persist` middleware using `localStorage`
- Storage key: `jkkn-cart-storage`
- Persists: `items`, `customer`, `discount`, `discountType`, `notes`
- Cart survives page refresh
- Cleared only after successful sale completion

### Cart & Multi-Store Scope

> **Important:** The cart uses a single localStorage key (`jkkn-cart-storage`) that is **not scoped per store**. Switching stores via `StoreSelector` does **not** clear the cart. Items added while Store A is selected remain in the cart when the user switches to Store B. This means the cart can contain items from a different store than the currently active one. See [Section 16](#16-architectural-considerations--known-gaps) for implications.

---

## 5. Sales Page

**File:** `app/(dashboard)/sales/page.tsx`

### Layout

- **Desktop:** Two-column — items grid (left) + cart sidebar (right, 380px)
- **Mobile:** Full-width items grid + floating cart button (bottom-right) → opens bottom sheet (85vh)

### Store-Scoped Data Fetching

Items, categories, and customers are fetched using `currentStore.id` from `StoreContext`, **not** `profile.business_id` from RBAC:

```typescript
const { currentStore } = useStoreContext()

// In useEffect:
inventoryService.getBusinessItems(currentStore.id, { ... })
inventoryService.getCategories(currentStore.id)
customerService.getBusinessCustomers(currentStore.id)
```

### Item Selection

- Search by name, barcode, or SKU
- Filter by category tabs
- Only shows items with `stock > 0`
- Click item → `addItem()` → auto-opens mobile cart sheet

### Stock Validation

```typescript
if (existingItem && existingItem.quantity >= currentStock) {
  toast.error("Not enough stock available")
  return
}
```

### Customer Selection

- Dialog with search by name/phone
- Shows loyalty points badge
- "Walk-in Customer" option sets customer to `null`

### Checkout Trigger

```typescript
const handleCheckout = () => {
  if (cart.items.length === 0) {
    toast.error("Cart is empty")
    return
  }
  setPaymentOpen(true) // Opens PaymentModal
}
```

---

## 6. Payment Modal

**File:** `components/sales/payment-modal.tsx`

### Payment Methods

| Method | Enum Value | UI Input | Notes |
|--------|-----------|----------|-------|
| Cash | `CASH` | Amount received + quick buttons | Calculates change |
| Card | `CARD` | Optional transaction reference | Assumes exact amount |
| UPI | `UPI` | Optional transaction reference | Assumes exact amount |
| UPI QR | `UPI_QR` | QR generation component | 15-min expiry, manual confirm |

### Cash Payment

```
Quick amount buttons: [exact total, round to 100, round to 500, round to 1000]
Validation: amountPaid >= total (else "Insufficient payment amount")
Change = amountPaid - total
```

### Card/UPI Payment

- Optional transaction reference text field
- Amount is automatically set to the total

### UPI QR Payment (Special Flow)

When UPI QR is selected, the modal switches to the `UPIQRPayment` component.

---

## 7. UPI QR Payment

**File:** `components/sales/upi-qr-payment.tsx`

### States

```
loading → waiting → success
                  → failed/expired (with retry)
```

### Step 1: Generate QR

**API:** `POST /api/payment/upi-qr/generate`

```typescript
// Request
{ businessId, amount, customerName?, customerMobile?, items[] }

// Response
{ success, qrCode (base64), upiString, transactionRef, expiresAt, merchantName, upiId }
```

**Server logic** (`app/api/payment/upi-qr/generate/route.ts`):
1. Read UPI config from env vars (`NEXT_PUBLIC_UPI_VPA`, `NEXT_PUBLIC_UPI_MERCHANT_NAME`)
2. Generate unique transaction ref: `JKKN{timestamp}{nanoid(6)}`
3. Build UPI deep link: `upi://pay?pa={VPA}&pn={NAME}&am={AMOUNT}&cu=INR&tn={DESC}&tr={REF}`
4. Convert to QR code image (base64 PNG) using `qrcode` library
5. Store in `upi_qr_payments` table with `status='PENDING'`, `expires_at=NOW+15min`

### Step 2: Display QR & Wait

- QR code image in white bordered box
- 15-minute countdown timer (red text when < 1 min)
- Speaker notification reminder
- UPI app icons (Google Pay, PhonePe, Paytm, BHIM)
- Optional UTR/Transaction ID input field
- "Payment Received" button for manual confirmation
- "Refresh QR" button to regenerate

### Step 3: Confirm Payment

**API:** `POST /api/payment/upi-qr/confirm`

```typescript
// Request
{ transactionRef, upiTransactionId?, confirmedBy }

// Validations
1. Payment record exists
2. Not already PAID
3. Not expired (expires_at > NOW)

// Updates
status='PAID', paid_at=NOW, confirmed_by=userId
```

After confirmation, the component calls `onSuccess(transactionRef, upiTransactionId)` which triggers sale creation in the parent PaymentModal.

### Environment Variables

```
NEXT_PUBLIC_UPI_VPA=merchant@bank
NEXT_PUBLIC_UPI_MERCHANT_NAME=Store Name
NEXT_PUBLIC_UPI_MERCHANT_CODE=optional123  (optional)
```

---

## 8. Sale Creation

**File:** `components/sales/payment-modal.tsx` (in `handlePayment` and `handleUPIQRSuccess`)

After payment is confirmed, the sale is created in sequential order using direct Supabase inserts:

### Step 1: Generate Sale Number

```
Format: INV-{YYMMDD}-{4-digit random}
Example: INV-260218-0042
```

### Step 2: Insert Sale Record

```typescript
await supabase.from("sales").insert({
  business_id, sale_number, customer_id, user_id,
  subtotal, discount, discount_type, tax, total,
  status: "COMPLETED", notes
})
```

### Business ID Resolution

> **Important:** The `business_id` written to the sale record comes from **`profile.business_id`** (RBAC), **not** `currentStore.id` (StoreContext).
>
> ```typescript
> // payment-modal.tsx — handlePayment and handleUPIQRSuccess:
> business_id: profile.business_id  // Source: RBAC profile
> ```
>
> Meanwhile, receipt display data (store name, address, phone, GST) comes from `currentStore` (StoreContext). If these reference different businesses, the receipt header may not match the sale's owning business.

### Step 3: Insert Sale Items

```typescript
const saleItems = cart.items.map(item => ({
  sale_id, item_id: item.item_id, name: item.name,
  quantity: item.quantity, price: item.price,
  discount: item.discount, tax: item.tax, total: item.total
}))
await supabase.from("sale_items").insert(saleItems)
```

**Database trigger fires:** `update_stock_after_sale()` → decrements `items.stock` for each item.

### Step 4: Insert Payment Record

```typescript
await supabase.from("payments").insert({
  sale_id, method: selectedMethod,
  amount: (method === "CASH") ? amountPaid : total,
  reference: reference || null
})
```

### Step 5: Loyalty Points (Automatic via Trigger)

**Database trigger:** `add_loyalty_points()` fires on sales INSERT when `status='COMPLETED'` and `customer_id IS NOT NULL`:

```sql
UPDATE customers SET
  loyalty_points = loyalty_points + FLOOR(NEW.total),
  total_purchases = total_purchases + NEW.total,
  last_visit = NOW()
WHERE id = NEW.customer_id;
```

### Step 6: Link UPI QR (if UPI QR method)

```typescript
await supabase.from("upi_qr_payments")
  .update({ sale_id })
  .eq("transaction_ref", transactionRef)
```

---

## 9. Receipt Generation

### Receipt Data Structure

**File:** `lib/utils/receipt.ts`

```typescript
interface ReceiptData {
  saleId?: string
  receiptNo: string        // INV-YYMMDD-XXXX
  date: Date
  storeName: string
  storeAddress: string
  storePhone: string
  storeGST?: string
  customerName?: string
  customerPhone?: string
  items: { name, quantity, price, total }[]
  subtotal: number
  taxRate: number
  taxAmount: number
  discount: number
  total: number
  paymentMethod: string
  amountPaid?: number      // For cash
  change?: number          // For cash
  cashierName?: string
}
```

### Store Data on Receipts

All store-level receipt fields are sourced from `currentStore` (StoreContext), **not** from the RBAC business:

```typescript
// payment-modal.tsx — receipt data construction:
storeName: currentStore?.name || "JKKN POS",
storeAddress: currentStore?.address || "",
storePhone: currentStore?.phone || "",
storeGST: currentStore?.gstin || "",
```

### Receipt Modal

**File:** `components/receipt/receipt-modal.tsx`

### Output Channels

| Channel | Implementation | Details |
|---------|---------------|---------|
| **Print** | `window.open()` + `printWindow.print()` | 80mm thermal receipt, Courier New font |
| **PDF** | `jsPDF` (dynamic import) | 80mm x 200mm, Courier font, auto-page |
| **WhatsApp** | `wa.me` URL with encoded message | Emoji-formatted text message |
| **Email** | Email input + mock send | (Needs API integration for production) |

### Receipt Preview Component

**File:** `components/receipt/receipt-preview.tsx`

- Monospace font rendering
- Dashed separators
- Compact mode for modal display

---

## 10. Post-Sale Actions

### Change Payment Method

**Available from:** Receipt Modal, Sales History page

**Database RPC:** `change_payment_method(p_sale_id, p_new_method, p_reason, p_user_id)`

**Rules:**
- Sale must be `COMPLETED`
- Same-day only (`created_at::DATE = CURRENT_DATE`)
- New method must differ from current
- Creates audit record in `payment_changes` table

**UI:** Select new method → provide reason → confirm

### Cancel Sale (Direct)

**Available to:** Users with `deleteSales` permission (MANAGER, OWNER)

**Database RPC:** `cancel_sale_with_restore(p_sale_id, p_reason, p_user_id)`

**Actions:**
1. Sets sale `status = 'CANCELLED'`
2. Appends reason to `notes`
3. Restores stock for each sale item (`items.stock += quantity`)
4. Reverses loyalty points if customer was attached

### Request Cancellation (Approval Workflow)

**Available to:** Users without `deleteSales` permission (STAFF, HELPER)

**Flow:**
1. Staff submits request with reason → `create_cancellation_request` RPC
2. Request stored with `status='PENDING'`, assigned number `CR-XXXX`
3. Admin sees pending requests in Approvals page
4. Admin approves → `approve_cancellation_request` RPC (calls `cancel_sale_with_restore`)
5. Admin rejects → `reject_cancellation_request` RPC with reason

---

## 11. Database Schema

### Tables

```
businesses         → Store/business records (name, address, gstin, tax_rate, is_active)
sales              → Sale header (business_id, totals, status)
sale_items         → Line items per sale (item_id, qty, price, total)
payments           → Payment records per sale (method, amount, reference)
payment_changes    → Audit trail for payment method changes
upi_qr_payments    → UPI QR payment tracking (status, expiry, transaction ref)
cancellation_requests → Cancellation approval workflow
```

### `businesses` Table Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `name` | text | Store display name |
| `email` | text | Store contact email |
| `phone` | text | Store phone number |
| `address` | text | Store physical address |
| `gstin` | text | GST Identification Number |
| `gst_type` | text | `regular` or `composition` |
| `currency` | text | Currency code (default `INR`) |
| `tax_rate` | numeric | Tax rate percentage (default `18`) |
| `is_active` | boolean | Soft-delete flag (default `true`) |
| `created_at` | timestamptz | Auto-set on insert |
| `updated_at` | timestamptz | Auto-updated |

### Enums

```sql
payment_method: CASH, CARD, UPI, WALLET
sale_status: COMPLETED, PARKED, CANCELLED
cancellation_request_status: PENDING, APPROVED, REJECTED
```

### Database Triggers

| Trigger | Fires On | Action |
|---------|----------|--------|
| `handle_new_user` | Auth user creation | Creates `businesses` + `profiles` row |
| `update_stock_on_sale_item` | `sale_items` INSERT/DELETE | Decrement/restore `items.stock` |
| `add_loyalty_points_on_sale` | `sales` INSERT/UPDATE | Add loyalty points to customer |
| `update_sales_updated_at` | `sales` UPDATE | Set `updated_at = NOW()` |

### RPC Functions

| Function | Purpose |
|----------|---------|
| `generate_sale_number(business_id)` | Generate `INV-YYMMDD-XXXX` |
| `change_payment_method(sale_id, method, reason, user_id)` | Change payment + audit trail |
| `cancel_sale_with_restore(sale_id, reason, user_id)` | Cancel sale + restore stock + reverse loyalty |
| `create_cancellation_request(business_id, sale_id, reason, user_id)` | Submit cancellation request |
| `approve_cancellation_request(request_id, business_id, approver_id)` | Approve + execute cancellation |
| `reject_cancellation_request(request_id, business_id, reviewer_id, reason)` | Reject with reason |

### RLS Policies

All tables enforce business-level scoping:
```sql
-- Pattern used across sales, sale_items, payments, payment_changes
business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid())
```

### Key Indexes

```sql
idx_sales_business_date    → sales(business_id, created_at)
idx_sale_items_sale        → sale_items(sale_id)
idx_payments_sale          → payments(sale_id)
idx_payment_changes_sale   → payment_changes(sale_id)
idx_upi_qr_transaction_ref → upi_qr_payments(transaction_ref)
idx_upi_qr_status          → upi_qr_payments(status)
```

---

## 12. RBAC Permissions

| Permission | Roles | Action |
|------------|-------|--------|
| `giveDiscount` | Manager, Owner | Apply discounts |
| `maxDiscountPercent` | Per role | Max discount % allowed |
| `deleteSales` | Manager, Owner | Direct sale cancellation |
| _(no permission)_ | Staff, Helper | Request cancellation (needs approval) |

**File:** `lib/rbac/rbac-context.tsx`

```typescript
const { hasPermission } = useRBAC()
if (hasPermission('deleteSales')) { /* show cancel button */ }
```

---

## 13. Split Payments

The `payments` table supports multiple records per sale:

```json
[
  { "method": "CASH",  "amount": 200, "reference": null },
  { "method": "CARD",  "amount": 200, "reference": "TXN123" },
  { "method": "UPI",   "amount": 100, "reference": "UPI456" }
]
```

> **Note:** The current UI processes single payments. Split payment UI can be added by allowing multiple payment entries that sum to the total.

---

## 14. File Map

| Component | File Path |
|-----------|-----------|
| Cart Store | `store/cart-store.ts` |
| Store Context | `store/store-context.tsx` |
| Store Selector | `components/store-selector.tsx` |
| Sales Page | `app/(dashboard)/sales/page.tsx` |
| Payment Modal | `components/sales/payment-modal.tsx` |
| UPI QR Component | `components/sales/upi-qr-payment.tsx` |
| Receipt Modal | `components/receipt/receipt-modal.tsx` |
| Receipt Preview | `components/receipt/receipt-preview.tsx` |
| Receipt Utils | `lib/utils/receipt.ts` |
| Sales Service | `lib/services/sales.service.ts` |
| Sales History | `app/(dashboard)/sales/history/page.tsx` |
| UPI Generate API | `app/api/payment/upi-qr/generate/route.ts` |
| UPI Confirm API | `app/api/payment/upi-qr/confirm/route.ts` |
| RBAC Context | `lib/rbac/rbac-context.tsx` |
| Cancellation Hooks | `lib/hooks/use-cancellation-requests.ts` |
| Dashboard Layout | `app/(dashboard)/layout.tsx` |
| Signup Form | `components/auth/signup-form.tsx` |
| Stores List Page | `app/(dashboard)/stores/page.tsx` |
| Add Store Page | `app/(dashboard)/stores/add/page.tsx` |
| Edit Store Page | `app/(dashboard)/stores/[id]/page.tsx` |
| Types | `types/index.ts` |

### Migrations

| Migration | Contents |
|-----------|----------|
| `001_initial_schema.sql` | sales, sale_items, payments tables + triggers |
| `016_cancellation_requests_module.sql` | Cancellation workflow tables + RPCs |
| `019_upi_qr_payments_table.sql` | UPI QR payment tracking table |
| `020_payment_changes_and_sale_rpcs.sql` | payment_changes table + change/cancel RPCs |

---

## 15. Multi-Store RLS & Data Scoping

### Core RLS Pattern

All business-scoped tables use the same RLS predicate to restrict access:

```sql
business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid())
```

This means a user can only read/write rows belonging to businesses where they have a `profiles` entry.

### Per-Table RLS Method

| Table | RLS Scope Method |
|-------|-----------------|
| `businesses` | Direct — user must have a profile linking to the business |
| `sales` | Direct — `sales.business_id` matches profile |
| `sale_items` | Indirect — via `sale_id` → `sales.business_id` |
| `payments` | Indirect — via `sale_id` → `sales.business_id` |
| `payment_changes` | Indirect — via `sale_id` → `sales.business_id` |
| `items` | Direct — `items.business_id` matches profile |
| `customers` | Direct — `customers.business_id` matches profile |
| `categories` | Direct — `categories.business_id` matches profile |
| `upi_qr_payments` | Direct — `business_id` matches profile |
| `cancellation_requests` | Direct — `business_id` matches profile |

### Service Layer Pattern

All service functions accept an explicit `businessId` parameter. Call sites pass `currentStore.id` from StoreContext:

```typescript
// Example from sales page:
inventoryService.getBusinessItems(currentStore.id, { ... })
customerService.getBusinessCustomers(currentStore.id)
```

This means the **UI fetches data for whichever store the user selected**, while **RLS ensures the query only returns rows the user is authorized to see** based on their profile links.

---

## 16. Architectural Considerations & Known Gaps

1. **Cart is not store-scoped.** The cart persists under a single localStorage key (`jkkn-cart-storage`). Switching stores does not clear the cart. Items added from Store A's inventory remain when the user switches to Store B. A cart-per-store or cart-clear-on-switch mechanism would prevent cross-store item mixing.

2. **Split business context.** Sale creation uses `profile.business_id` (from RBACProvider) for the `business_id` column, while the receipt header and data fetching use `currentStore` (from StoreContext). In single-store setups these are always the same. In multi-store setups, if the user's profile links to Business A but they've switched the UI to Business B, the sale record's `business_id` and the receipt's displayed store info may reference different businesses.

3. **No profile link for added stores.** The Add Store page (`stores/add/page.tsx`) inserts a `businesses` row but does not create a corresponding `profiles` entry. The `handle_new_user` trigger only fires during initial signup. Without a profile link, the new store may not be accessible via RLS policies, and `profile.business_id` will still point to the original store.

4. **StoreContext fetch relies on RLS.** `StoreProvider.refreshStores()` queries `businesses WHERE is_active = true`. Since RLS restricts results to businesses linked via the `profiles` table, a newly added store (without a profile link — see gap #3) may not appear in the store dropdown.

5. **UPI QR `businessId` comes from `profile.business_id`.** The UPI QR generate endpoint receives `businessId` from the client, which is sourced from `profile.business_id` — consistent with sale creation but potentially inconsistent with `currentStore`.

6. **Sale number uniqueness.** Sale numbers follow the format `INV-{YYMMDD}-{4-digit random}` and are generated client-side. Uniqueness depends on the randomness of the 4-digit suffix. There is no database unique constraint scoped to `business_id` + `sale_number`, so collisions (though unlikely) are theoretically possible.

---

## 17. Complete Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│              STORE SETUP / SELECTION                 │
│                                                      │
│  Signup → handle_new_user trigger → first store     │
│  OR Add Store page → businesses.insert()            │
│                                                      │
│  StoreSelector dropdown → switchStore(id)           │
│  localStorage('current_store_id') + React state     │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│              USER ADDS ITEMS                         │
│  Items fetched via currentStore.id (StoreContext)    │
│  Product click → addItem() → Cart state             │
│  localStorage persistence (Zustand)                  │
│  ⚠ Cart NOT scoped per store                        │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│           OPTIONAL: SELECT CUSTOMER                  │
│  Customers fetched via currentStore.id              │
│  Search by name/phone → setCustomer()               │
│  Walk-in = no customer (null)                       │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│            CLICK "CHECKOUT"                          │
│  Validate: items > 0, total > 0                     │
│  Opens Payment Modal                                │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│         SELECT PAYMENT METHOD                        │
│                                                      │
│  ┌──────┐ ┌──────┐ ┌─────┐ ┌──────────┐            │
│  │ CASH │ │ CARD │ │ UPI │ │  UPI QR  │            │
│  └──┬───┘ └──┬───┘ └──┬──┘ └────┬─────┘            │
│     │        │        │         │                    │
│  Amount   Opt.Ref  Opt.Ref   Generate QR            │
│  Received                    15-min expiry           │
│  + Change                    Manual confirm          │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│         CREATE SALE IN DATABASE                      │
│                                                      │
│  business_id ← profile.business_id (RBAC)           │
│                                                      │
│  1. INSERT sales (header)                           │
│  2. INSERT sale_items (line items)                   │
│     → TRIGGER: decrement stock                      │
│     → TRIGGER: add loyalty points                   │
│  3. INSERT payments (method + amount)                │
│  4. UPDATE upi_qr_payments (if QR method)           │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│          SHOW RECEIPT                                │
│  Store info ← currentStore (StoreContext)           │
│  Print | PDF | WhatsApp | Email                     │
│  Change Payment | Cancel Sale (if allowed)          │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│          CLEAR CART & RETURN                         │
│  clearCart() → Reset state                          │
│  Return to sales page                               │
└─────────────────────────────────────────────────────┘
```
