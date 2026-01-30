-- Create user_dashboard_preferences table
CREATE TABLE IF NOT EXISTS user_dashboard_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  widget_id TEXT NOT NULL,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, role, widget_id)
);

-- Create index for fast lookups
CREATE INDEX idx_dashboard_prefs_user_role ON user_dashboard_preferences(user_id, role);

-- Create dashboard_widgets registry table
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  default_visible BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  required_permission TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for filtering by role
CREATE INDEX idx_widgets_role ON dashboard_widgets(role);

-- Enable RLS
ALTER TABLE user_dashboard_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_dashboard_preferences
CREATE POLICY "Users can view own preferences"
  ON user_dashboard_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_dashboard_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_dashboard_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences"
  ON user_dashboard_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for dashboard_widgets (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view widgets"
  ON dashboard_widgets
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Add updated_at trigger
CREATE TRIGGER update_dashboard_preferences_updated_at
  BEFORE UPDATE ON user_dashboard_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
