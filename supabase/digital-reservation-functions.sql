-- Function to check for digital resource reservation conflicts
CREATE OR REPLACE FUNCTION check_digital_reservation_conflict(
  p_digital_resource_id UUID,
  p_start_datetime TIMESTAMPTZ,
  p_end_datetime TIMESTAMPTZ,
  p_max_concurrent_users INTEGER,
  p_reservation_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  concurrent_count INTEGER;
BEGIN
  -- Count overlapping approved reservations for the same resource
  SELECT COUNT(*)
  INTO concurrent_count
  FROM digital_reservations
  WHERE 
    digital_resource_id = p_digital_resource_id
    AND status = 'approved'
    AND (
      -- Check for any overlap between the requested period and existing reservations
      (reservation_start <= p_end_datetime AND reservation_end >= p_start_datetime)
    )
    -- Exclude the current reservation when checking for updates
    AND (p_reservation_id IS NULL OR id != p_reservation_id);
  
  -- Return true if there's a conflict (concurrent count >= max allowed)
  RETURN concurrent_count >= p_max_concurrent_users;
END;
$$;

-- Ensure digital_resources table has proper foreign keys
DO $$
BEGIN
  -- Check if the digital_resources table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'digital_resources') THEN
    -- Add foreign key constraints if they don't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'digital_resources_category_id_fkey'
    ) THEN
      ALTER TABLE digital_resources 
      ADD CONSTRAINT digital_resources_category_id_fkey 
      FOREIGN KEY (category_id) REFERENCES digital_resource_categories(id) ON DELETE SET NULL;
    END IF;
    
    -- Add owner_id foreign key if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'digital_resources_owner_id_fkey'
    ) THEN
      ALTER TABLE digital_resources 
      ADD CONSTRAINT digital_resources_owner_id_fkey 
      FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Ensure digital_reservations table has proper foreign keys
DO $$
BEGIN
  -- Check if the digital_reservations table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'digital_reservations') THEN
    -- Add digital_resource_id foreign key if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'digital_reservations_digital_resource_id_fkey'
    ) THEN
      ALTER TABLE digital_reservations 
      ADD CONSTRAINT digital_reservations_digital_resource_id_fkey 
      FOREIGN KEY (digital_resource_id) REFERENCES digital_resources(id) ON DELETE CASCADE;
    END IF;
    
    -- Add user_id foreign key if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'digital_reservations_user_id_fkey'
    ) THEN
      ALTER TABLE digital_reservations 
      ADD CONSTRAINT digital_reservations_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
    
    -- Add approver_id foreign key if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'digital_reservations_approver_id_fkey'
    ) THEN
      ALTER TABLE digital_reservations 
      ADD CONSTRAINT digital_reservations_approver_id_fkey 
      FOREIGN KEY (approver_id) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Trigger function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_digital_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for digital_resources table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'set_digital_resources_updated_at'
  ) THEN
    CREATE TRIGGER set_digital_resources_updated_at
    BEFORE UPDATE ON digital_resources
    FOR EACH ROW
    EXECUTE FUNCTION update_digital_resources_updated_at();
  END IF;
END $$;

-- Create trigger for digital_reservations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'set_digital_reservations_updated_at'
  ) THEN
    CREATE TRIGGER set_digital_reservations_updated_at
    BEFORE UPDATE ON digital_reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_digital_resources_updated_at();
  END IF;
END $$;

-- Function to handle reservation completion
CREATE OR REPLACE FUNCTION handle_digital_reservation_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- If the reservation end time has passed, update status to 'completed'
  IF NEW.status = 'approved' AND NEW.reservation_end < NOW() THEN
    NEW.status = 'completed';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic completion of reservations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'check_digital_reservation_completion'
  ) THEN
    CREATE TRIGGER check_digital_reservation_completion
    BEFORE INSERT OR UPDATE ON digital_reservations
    FOR EACH ROW
    EXECUTE FUNCTION handle_digital_reservation_completion();
  END IF;
END $$;
