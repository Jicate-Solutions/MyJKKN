-- Migration: Add user_page_favorites table
-- Date: 2026-04-04
-- Purpose: Smart Navigation System — stores user's favorited/pinned pages

CREATE TABLE IF NOT EXISTS user_page_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  page_path TEXT NOT NULL,
  display_title TEXT NOT NULL,
  module_name TEXT,
  icon_name TEXT,
  sort_order INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, page_path)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_page_favorites_user
  ON user_page_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_page_favorites_pinned
  ON user_page_favorites(user_id, is_pinned) WHERE is_pinned = true;

-- RLS Policies: users can only manage their own favorites
ALTER TABLE user_page_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favorites"
  ON user_page_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
  ON user_page_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own favorites"
  ON user_page_favorites FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON user_page_favorites FOR DELETE
  USING (auth.uid() = user_id);
