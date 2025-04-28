-- Create the student-photos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', false);

-- Revoke default public access
REVOKE ALL ON storage.objects FROM public;
REVOKE ALL ON storage.buckets FROM public;

-- Allow authenticated users to view photos (only the student-photos bucket)
CREATE POLICY "Authenticated users can view student photos" ON storage.objects
FOR SELECT USING (
  auth.role() = 'authenticated' AND 
  bucket_id = 'student-photos'
);

-- Allow authenticated users to upload photos (only the student-photos bucket)
CREATE POLICY "Authenticated users can upload student photos" ON storage.objects
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND 
  bucket_id = 'student-photos'
);

-- Allow authenticated users to update their uploaded photos
CREATE POLICY "Authenticated users can update student photos" ON storage.objects
FOR UPDATE USING (
  auth.role() = 'authenticated' AND 
  bucket_id = 'student-photos'
);

-- Allow authenticated users to delete photos
CREATE POLICY "Authenticated users can delete student photos" ON storage.objects
FOR DELETE USING (
  auth.role() = 'authenticated' AND 
  bucket_id = 'student-photos'
);

-- Create a function to delete student photos from storage when student is updated
CREATE OR REPLACE FUNCTION delete_student_photo() 
RETURNS TRIGGER AS $$
DECLARE
  student_id TEXT;
  old_photo_url TEXT;
  new_photo_url TEXT;
BEGIN
  student_id := OLD.id::text;
  old_photo_url := OLD.student_photo_url;
  new_photo_url := NEW.student_photo_url;
  
  -- If photo URL has changed or been removed, delete the old photo from storage
  IF (old_photo_url IS NOT NULL AND (new_photo_url IS NULL OR new_photo_url <> old_photo_url)) THEN
    -- Delete all files in the student's folder
    -- This will delete all the files for that student ID
    PERFORM
      storage.delete_path('student-photos', student_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to run the function when a student is updated
DROP TRIGGER IF EXISTS student_photo_cleanup ON students;
CREATE TRIGGER student_photo_cleanup
AFTER UPDATE ON students
FOR EACH ROW
WHEN (OLD.student_photo_url IS DISTINCT FROM NEW.student_photo_url)
EXECUTE FUNCTION delete_student_photo();

-- Create a function and trigger for when a student is deleted
CREATE OR REPLACE FUNCTION delete_student_photos_on_delete() 
RETURNS TRIGGER AS $$
BEGIN
  -- Delete all files in the student's folder
  PERFORM
    storage.delete_path('student-photos', OLD.id::text);
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to run the function when a student is deleted
DROP TRIGGER IF EXISTS student_delete_cleanup ON students;
CREATE TRIGGER student_delete_cleanup
BEFORE DELETE ON students
FOR EACH ROW
EXECUTE FUNCTION delete_student_photos_on_delete();





