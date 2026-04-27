-- Migration: add email_inbound_token and gmail_verification_code to user_preferences
-- Run this in Supabase SQL Editor

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS email_inbound_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS gmail_verification_code TEXT;

-- Index for fast token lookup on each inbound webhook
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_email_inbound_token_idx
  ON user_preferences (email_inbound_token)
  WHERE email_inbound_token IS NOT NULL;
