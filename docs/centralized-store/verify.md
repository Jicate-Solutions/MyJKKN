# Purchase & Inventory Workflow – For Review

**Purpose:**
To define the complete procurement process from purchase request to inventory update and Purchase Order (PO) closure.

---

# 1. Purchase Request

A Purchase Request can be created for either:

### A. Restocking Existing Items

* When stock reaches the minimum stock level, the Store Admin can generate a Purchase Request.

### B. Requesting a New Item

If the required item is not available in inventory, the requester can create a New Item Request by providing:

* Item Name
* Description / Specification
* Required Quantity
* Reason for the request (Mandatory)

---

# 2. Purchase Requisition (PR)

* Store Admin reviews and submits the Purchase Requisition.
* Super Admin reviews the request.
* If approved, the procurement process continues.
* If rejected, the PR is returned with remarks.

---

# 3. Purchase Requirement List

After PR approval:

* The system generates a **Purchase Requirement List** as a PDF.
* The document contains:

  * Required Items
  * Quantities
  * Specifications (if applicable)
* The PDF can be downloaded or emailed to multiple vendors.
* Vendors use this list to prepare their quotations.

---

# 4. Vendor Quotations

* Vendors review the Purchase Requirement List.
* Vendors submit their quotations.

---

# 5. Upload Vendor Quotations

Instead of manually entering quotation details:

* Store Admin uploads each vendor quotation into the system.
* Supported formats may include:

  * PDF
  * Excel
  * Image (optional)
* Each quotation is linked to the corresponding vendor.
* Uploaded quotations are stored for future reference and audit.

---

# 6. Quotation Comparison

The system compares quotations item by item.

Comparison may include:

* Unit Price
* Delivery Time
* Payment Terms
* Vendor Rating (Optional)
* Previous Purchase History (Optional)

After comparison:

* The Store Admin selects the preferred quotation.
* Different items may be awarded to different vendors.

---

# 7. Purchase Order (PO)

The system generates Purchase Orders based on the selected quotations.

* One Purchase Order is generated per selected vendor.
* Super Admin reviews and approves the Purchase Order.
* Approved Purchase Orders are generated as PDF documents.
* Purchase Orders can be downloaded or emailed to the respective vendors.

---

# 8. Goods Receipt Note (GRN)

When the vendor delivers materials:

* Store Admin selects the corresponding Purchase Order.
* A new Goods Receipt Note (GRN) is created against the Purchase Order.
* The supplier invoice for that delivery is uploaded.

A single Purchase Order can have:

* Multiple Deliveries
* Multiple Supplier Invoices
* Multiple GRNs

until the entire Purchase Order is completed.

---

# 9. GRN Verification

For every delivery, the Store Admin verifies the received materials.

The system performs a **Three-Way Match** by comparing:

* Purchase Order Quantity
* Supplier Invoice Quantity & Price
* Actual Received Quantity

During verification, the following checks are performed:

### Quantity Verification

If the received quantity differs from the invoice quantity:

Example:

Invoice Quantity = 20

Received Quantity = 18

The user can mark:

* **Quantity Mismatch**

The system records:

* Invoice Quantity
* Received Quantity
* Difference
* Remarks

---

### Partial Delivery

Example:

Purchase Order = 15 Qty

**First Delivery**

* Invoice #001
* Invoice Quantity = 10
* Received Quantity = 10

Result:

* GRN Verified
* PO Status = Partially Received
* Remaining Quantity = 5

**Second Delivery**

* Invoice #002
* Invoice Quantity = 5
* Received Quantity = 5

Result:

* New GRN Created
* GRN Verified
* Purchase Order Completed

The Purchase Order remains **Open** until all ordered quantities have been received.

---

### Quality Inspection

If any received item is damaged or does not meet quality requirements:

The user can mark:

* **Replacement Required**

The system records:

* Rejected Quantity
* Reason
* Remarks

Rejected quantities are **not added to inventory**.

Replacement items can be received later using another GRN against the same Purchase Order.

---

### Chemical Item Validation

For chemical items, the following fields are mandatory before verification:

* Batch Number
* Expiry Date

(Optional)

* Manufacturing Date

The Verify button remains disabled until mandatory information is entered.

---

# 10. Inventory Update

Once verification is completed:

The system will:

* Add accepted quantities to inventory.
* Update batch-wise inventory.
* Update stock summary.
* Update Purchase Order received quantities.
* Maintain complete transaction history.

The Purchase Order will automatically close only when:

* All ordered quantities have been received.
* Accepted quantities have been verified.
* No pending deliveries remain.
* No replacement requests remain.

---

# 11. GRN Status Tracking

Each Goods Receipt Note (GRN) will have one of the following statuses:

* **Draft** – GRN created but not submitted.
* **Pending Verification** – Awaiting verification.
* **Partially Accepted** – Some items accepted while others are pending.
* **Replacement Requested** – One or more items require replacement.
* **Accepted** – All received items have passed verification.
* **Completed** – Inventory updated and GRN fully processed.

These statuses provide clear visibility into the progress of each goods receipt.

---

# End-to-End Workflow

**Purchase Request (Restock / New Item Request)**

⬇

**Purchase Requisition (PR)**

⬇

**Super Admin Approval**

⬇

**Purchase Requirement List (PDF)**

⬇

**Sent to Multiple Vendors**

⬇

**Vendor Quotations**

⬇

**Upload Vendor Quotations**

⬇

**Quotation Comparison**

⬇

**Select Winning Vendor(s)**

⬇

**Generate Purchase Order (PO)**

⬇

**Super Admin Approval**

⬇

**PO Sent to Vendor**

⬇

**Vendor Delivers Goods**

⬇

**Create GRN Against PO**

⬇

**Upload Supplier Invoice**

⬇

**GRN Verification**

* Three-Way Matching (PO vs Invoice vs Received)
* Quantity Verification
* Partial Delivery Handling
* Quality Inspection
* Chemical Validation (Batch No. & Expiry Date)

⬇

**Inventory Update**

⬇

**GRN Status Updated**

⬇

**Purchase Order Closed (after all deliveries, invoices, and replacements are completed)**
