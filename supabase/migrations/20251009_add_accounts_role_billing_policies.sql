-- =====================================================
-- Migration: Add Accounts Role RLS Policies for Billing Tables
-- Date: 2025-10-09
-- Issue: Accounts role users cannot create/update/delete bills
-- Error: "new row violates row-level security policy for table billing_student_bills"
-- =====================================================

-- =====================================================
-- PART 1: Add Accounts Role Policies for billing_student_bills
-- =====================================================

-- Allow accounts role to INSERT bills for their accessible institutions
CREATE POLICY "Accounts users can insert institution billing student bills"
ON billing_student_bills
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_student_bills.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- Allow accounts role to UPDATE bills for their accessible institutions
CREATE POLICY "Accounts users can update institution billing student bills"
ON billing_student_bills
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_student_bills.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_student_bills.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- Allow accounts role to DELETE bills for their accessible institutions
CREATE POLICY "Accounts users can delete institution billing student bills"
ON billing_student_bills
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_student_bills.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- Allow accounts role to SELECT bills for their accessible institutions
CREATE POLICY "Accounts users can view institution billing student bills"
ON billing_student_bills
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_student_bills.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'read', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- =====================================================
-- PART 2: Add Accounts Role Policies for billing_receipts
-- =====================================================

-- Allow accounts role to INSERT receipts
CREATE POLICY "Accounts users can insert institution billing receipts"
ON billing_receipts
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_receipts.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- Allow accounts role to UPDATE receipts
CREATE POLICY "Accounts users can update institution billing receipts"
ON billing_receipts
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_receipts.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_receipts.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- Allow accounts role to DELETE receipts
CREATE POLICY "Accounts users can delete institution billing receipts"
ON billing_receipts
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_receipts.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- Allow accounts role to SELECT receipts
CREATE POLICY "Accounts users can view institution billing receipts"
ON billing_receipts
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_receipts.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'read', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- =====================================================
-- PART 3: Add Accounts Role Policies for billing_invoices
-- =====================================================

-- Allow accounts role to INSERT invoices
CREATE POLICY "Accounts users can insert institution billing invoices"
ON billing_invoices
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_invoices.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- Allow accounts role to UPDATE invoices
CREATE POLICY "Accounts users can update institution billing invoices"
ON billing_invoices
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_invoices.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_invoices.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- Allow accounts role to DELETE invoices
CREATE POLICY "Accounts users can delete institution billing invoices"
ON billing_invoices
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_invoices.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- Allow accounts role to SELECT invoices
CREATE POLICY "Accounts users can view institution billing invoices"
ON billing_invoices
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = billing_invoices.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'read', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- =====================================================
-- PART 4: Add Accounts Role Policies for billing_discounts
-- =====================================================

CREATE POLICY "Accounts users can insert billing discounts"
ON billing_discounts
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_student_bills b ON b.id = billing_discounts.bill_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = b.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

CREATE POLICY "Accounts users can update billing discounts"
ON billing_discounts
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_student_bills b ON b.id = billing_discounts.bill_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = b.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_student_bills b ON b.id = billing_discounts.bill_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = b.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

CREATE POLICY "Accounts users can delete billing discounts"
ON billing_discounts
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_student_bills b ON b.id = billing_discounts.bill_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = b.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

CREATE POLICY "Accounts users can view billing discounts"
ON billing_discounts
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_student_bills b ON b.id = billing_discounts.bill_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = b.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'read', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- =====================================================
-- PART 5: Add Accounts Role Policies for billing_refunds
-- =====================================================

CREATE POLICY "Accounts users can insert billing refunds"
ON billing_refunds
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_receipts r ON r.id = billing_refunds.receipt_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = r.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

CREATE POLICY "Accounts users can update billing refunds"
ON billing_refunds
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_receipts r ON r.id = billing_refunds.receipt_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = r.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_receipts r ON r.id = billing_refunds.receipt_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = r.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

CREATE POLICY "Accounts users can delete billing refunds"
ON billing_refunds
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_receipts r ON r.id = billing_refunds.receipt_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = r.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

CREATE POLICY "Accounts users can view billing refunds"
ON billing_refunds
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_institution_access uia ON p.id = uia.user_id
        JOIN billing_receipts r ON r.id = billing_refunds.receipt_id
        WHERE p.id = auth.uid()
        AND p.role = 'accounts'
        AND uia.institution_id = r.institution_id
        AND uia.access_type IN ('billing', 'admin', 'write', 'read', 'full', 'super_admin')
        AND uia.is_active = true
    )
);

-- =====================================================
-- PART 6: Verification
-- =====================================================

DO $$
DECLARE
    policies_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policies_count
    FROM pg_policies
    WHERE tablename IN ('billing_student_bills', 'billing_receipts', 'billing_invoices', 'billing_discounts', 'billing_refunds')
    AND policyname LIKE '%Accounts users%';

    RAISE NOTICE '=== Migration Verification ===';
    RAISE NOTICE 'Added % policies for accounts role', policies_count;

    IF policies_count >= 20 THEN
        RAISE NOTICE '✓ All accounts role policies created successfully';
    ELSE
        RAISE WARNING 'Expected 20 policies but found %', policies_count;
    END IF;
END $$;

-- =====================================================
-- End of Migration
-- =====================================================
