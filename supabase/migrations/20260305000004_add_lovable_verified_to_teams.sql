-- ============================================================
-- Add lovable_verified flag to ss_teams
-- Migration: 20260305000004_add_lovable_verified_to_teams.sql
-- Description: Tracks whether a team has verified their Lovable account
-- ============================================================

ALTER TABLE ss_teams ADD COLUMN IF NOT EXISTS lovable_verified boolean DEFAULT false;
