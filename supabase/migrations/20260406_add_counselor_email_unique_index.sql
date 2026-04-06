-- Add unique index on email for admission_counselors to prevent duplicates
-- during sync from Exotel agent map
CREATE UNIQUE INDEX IF NOT EXISTS admission_counselors_email_unique
  ON admission_counselors (email);
