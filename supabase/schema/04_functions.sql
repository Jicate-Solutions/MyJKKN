-- =============================================
-- Database Functions
-- =============================================

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has access to institution
CREATE OR REPLACE FUNCTION user_has_institution_access(user_id uuid, institution_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles p
    LEFT JOIN user_institution_access uia ON p.id = uia.user_id
    WHERE p.id = user_id
    AND (
      p.is_super_admin = true
      OR p.institution_id = institution_id
      OR (uia.institution_id = institution_id AND uia.is_active = true)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's accessible institutions
CREATE OR REPLACE FUNCTION get_user_institutions(user_id uuid)
RETURNS SETOF institutions AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT i.*
  FROM institutions i
  WHERE EXISTS (
    SELECT 1
    FROM profiles p
    LEFT JOIN user_institution_access uia ON p.id = uia.user_id
    WHERE p.id = user_id
    AND (
      p.is_super_admin = true
      OR p.institution_id = i.id
      OR (uia.institution_id = i.id AND uia.is_active = true)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update billing receipt number sequence
CREATE OR REPLACE FUNCTION update_receipt_number_sequence()
RETURNS trigger AS $$
DECLARE
  last_number INTEGER;
  new_number VARCHAR(50);
  institution_code VARCHAR(10);
BEGIN
  -- Get institution code (first 3 letters)
  SELECT UPPER(LEFT(name, 3)) INTO institution_code
  FROM institutions
  WHERE id = NEW.institution_id;
  
  -- Get the last receipt number for this institution
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM '[0-9]+$') AS INTEGER)), 0) INTO last_number
  FROM billing_receipts
  WHERE institution_id = NEW.institution_id
  AND receipt_number LIKE institution_code || '-RCP-%';
  
  -- Generate new receipt number
  new_number := institution_code || '-RCP-' || LPAD((last_number + 1)::TEXT, 6, '0');
  
  NEW.receipt_number := new_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update billing invoice number sequence
CREATE OR REPLACE FUNCTION update_invoice_number_sequence()
RETURNS trigger AS $$
DECLARE
  last_number INTEGER;
  new_number VARCHAR(50);
  institution_code VARCHAR(10);
BEGIN
  -- Get institution code (first 3 letters)
  SELECT UPPER(LEFT(name, 3)) INTO institution_code
  FROM institutions
  WHERE id = NEW.institution_id;
  
  -- Get the last invoice number for this institution
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) INTO last_number
  FROM billing_invoices
  WHERE institution_id = NEW.institution_id
  AND invoice_number LIKE institution_code || '-INV-%';
  
  -- Generate new invoice number
  new_number := institution_code || '-INV-' || LPAD((last_number + 1)::TEXT, 6, '0');
  
  NEW.invoice_number := new_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update bill balance when payment is made
CREATE OR REPLACE FUNCTION update_bill_balance_on_payment()
RETURNS trigger AS $$
BEGIN
  -- Update the bill balance
  UPDATE billing_student_bills
  SET balance_amount = balance_amount - NEW.amount_paid,
      status = CASE 
        WHEN balance_amount - NEW.amount_paid <= 0 THEN 'paid'::billing_status
        WHEN balance_amount - NEW.amount_paid < final_amount THEN 'partially_paid'::billing_status
        ELSE status
      END,
      payment_date = CASE 
        WHEN balance_amount - NEW.amount_paid <= 0 THEN CURRENT_DATE
        ELSE payment_date
      END
  WHERE id = NEW.bill_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update bill balance when payment is deleted
CREATE OR REPLACE FUNCTION update_bill_balance_on_payment_delete()
RETURNS trigger AS $$
BEGIN
  -- Update the bill balance
  UPDATE billing_student_bills
  SET balance_amount = balance_amount + OLD.amount_paid,
      status = CASE 
        WHEN balance_amount + OLD.amount_paid >= final_amount THEN 'unpaid'::billing_status
        ELSE 'partially_paid'::billing_status
      END,
      payment_date = CASE 
        WHEN balance_amount + OLD.amount_paid >= final_amount THEN NULL
        ELSE payment_date
      END
  WHERE id = OLD.bill_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate student attendance percentage
CREATE OR REPLACE FUNCTION calculate_attendance_percentage(
  p_student_id uuid,
  p_course_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(
  total_classes integer,
  present_count integer,
  absent_count integer,
  percentage numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::integer AS total_classes,
    COUNT(CASE WHEN status = 'present' THEN 1 END)::integer AS present_count,
    COUNT(CASE WHEN status = 'absent' THEN 1 END)::integer AS absent_count,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(CASE WHEN status = 'present' THEN 1 END)::numeric / COUNT(*)::numeric) * 100, 2)
      ELSE 0
    END AS percentage
  FROM student_attendance
  WHERE student_id = p_student_id
    AND course_id = p_course_id
    AND (p_start_date IS NULL OR attendance_date >= p_start_date)
    AND (p_end_date IS NULL OR attendance_date <= p_end_date);
END;
$$ LANGUAGE plpgsql;

-- Function to get available time slots for resource booking
CREATE OR REPLACE FUNCTION get_available_slots(
  p_resource_id uuid,
  p_date date,
  p_duration_hours integer
)
RETURNS TABLE(
  start_time time,
  end_time time,
  is_available boolean
) AS $$
BEGIN
  RETURN QUERY
  WITH time_slots AS (
    SELECT 
      generate_series(
        '08:00:00'::time,
        '17:00:00'::time,
        interval '1 hour'
      ) AS slot_start
  ),
  existing_reservations AS (
    SELECT 
      start_datetime::time AS start_time,
      end_datetime::time AS end_time
    FROM reservations
    WHERE resource_id = p_resource_id
      AND start_datetime::date = p_date
      AND status IN ('pending', 'approved')
  )
  SELECT 
    ts.slot_start AS start_time,
    (ts.slot_start + (p_duration_hours || ' hours')::interval)::time AS end_time,
    NOT EXISTS (
      SELECT 1
      FROM existing_reservations er
      WHERE (ts.slot_start, (ts.slot_start + (p_duration_hours || ' hours')::interval)::time) 
        OVERLAPS (er.start_time, er.end_time)
    ) AS is_available
  FROM time_slots ts
  WHERE ts.slot_start + (p_duration_hours || ' hours')::interval <= '18:00:00'::time;
END;
$$ LANGUAGE plpgsql;

-- Function to generate day order for a date
CREATE OR REPLACE FUNCTION get_day_order_for_date(
  p_institution_id uuid,
  p_date date
)
RETURNS integer AS $$
DECLARE
  v_day_order integer;
  v_start_date date;
  v_working_days integer;
  v_max_day_order integer;
BEGIN
  -- Check if there's a manual shift for this date
  SELECT shifted_day_order INTO v_day_order
  FROM timetable_day_order_shifts
  WHERE institution_id = p_institution_id
    AND original_date = p_date;
  
  IF v_day_order IS NOT NULL THEN
    RETURN v_day_order;
  END IF;
  
  -- Get the academic year start date
  SELECT start_date INTO v_start_date
  FROM academic_years
  WHERE institution_id = p_institution_id
    AND is_active = true
  LIMIT 1;
  
  IF v_start_date IS NULL THEN
    RETURN 1; -- Default if no active academic year
  END IF;
  
  -- Count working days (excluding Sundays and holidays)
  SELECT COUNT(*)::integer INTO v_working_days
  FROM generate_series(v_start_date, p_date - interval '1 day', interval '1 day') AS d
  WHERE EXTRACT(dow FROM d) != 0 -- Not Sunday
    AND NOT EXISTS (
      SELECT 1
      FROM timetable_leaves
      WHERE institution_id = p_institution_id
        AND leave_date = d::date
        AND affects_classes = true
    );
  
  -- Get max day order (usually 5 or 6)
  v_max_day_order := 5; -- Default, should be configurable per institution
  
  -- Calculate day order
  v_day_order := (v_working_days % v_max_day_order) + 1;
  
  RETURN v_day_order;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically generate invoice after bill payment
CREATE OR REPLACE FUNCTION generate_invoice_for_paid_bills()
RETURNS trigger AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number varchar(50);
  v_institution_code varchar(10);
  v_last_number integer;
BEGIN
  -- Only proceed if the bill is being marked as paid and payment_date is being set
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.payment_date IS NOT NULL THEN
    
    -- Check if an auto-generated invoice already exists for this bill
    IF EXISTS (
      SELECT 1 
      FROM billing_invoices i
      JOIN billing_invoice_items ii ON i.id = ii.invoice_id
      JOIN billing_receipt_items ri ON ii.receipt_id = ri.receipt_id
      WHERE ri.bill_id = NEW.id
      AND i.invoice_type = 'individual'
      AND i.invoice_description LIKE 'Payment Invoice for:%'
    ) THEN
      RETURN NEW; -- Invoice already exists, skip
    END IF;
    
    -- Get institution code
    SELECT UPPER(LEFT(name, 3)) INTO v_institution_code
    FROM institutions
    WHERE id = NEW.institution_id;
    
    -- Get the last invoice number
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) INTO v_last_number
    FROM billing_invoices
    WHERE institution_id = NEW.institution_id
    AND invoice_number LIKE v_institution_code || '-INV-%';
    
    -- Generate new invoice number
    v_invoice_number := v_institution_code || '-INV-' || LPAD((v_last_number + 1)::TEXT, 6, '0');
    
    -- Create the invoice
    INSERT INTO billing_invoices (
      invoice_number,
      invoice_date,
      institution_id,
      student_id,
      invoice_type,
      invoice_description,
      sub_total,
      tax_amount,
      grand_total,
      payment_status,
      created_by
    ) VALUES (
      v_invoice_number,
      NEW.payment_date,
      NEW.institution_id,
      NEW.student_id,
      'individual',
      'Payment Invoice for: ' || NEW.bill_description,
      NEW.final_amount,
      0,
      NEW.final_amount,
      'paid',
      NEW.created_by
    ) RETURNING id INTO v_invoice_id;
    
    -- Create invoice items for each receipt item related to this bill
    INSERT INTO billing_invoice_items (
      invoice_id,
      receipt_id,
      item_description,
      quantity,
      unit_price,
      total_price
    )
    SELECT 
      v_invoice_id,
      ri.receipt_id,
      'Payment for: ' || NEW.bill_description,
      1,
      ri.amount_paid,
      ri.amount_paid
    FROM billing_receipt_items ri
    WHERE ri.bill_id = NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle discount approval
CREATE OR REPLACE FUNCTION handle_discount_approval()
RETURNS trigger AS $$
BEGIN
  -- When a discount is approved, update the bill amount
  IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
    UPDATE billing_student_bills
    SET final_amount = final_amount - NEW.discount_amount,
        balance_amount = CASE
          WHEN balance_amount > 0 THEN balance_amount - NEW.discount_amount
          ELSE balance_amount
        END
    WHERE id = NEW.bill_id;
    
    NEW.approved_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to initialize materialized view activity_stats
CREATE OR REPLACE FUNCTION refresh_activity_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW activity_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to initialize materialized view mv_student_billing_summary
CREATE OR REPLACE FUNCTION refresh_student_billing_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_student_billing_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 