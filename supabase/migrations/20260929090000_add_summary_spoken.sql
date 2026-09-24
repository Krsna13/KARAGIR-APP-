-- Migration: 20260929090000_add_summary_spoken.sql
-- Stage 6.6 Follow-up: Add summary_spoken column to products table for storing audio read-aloud script.

ALTER TABLE products ADD COLUMN IF NOT EXISTS summary_spoken TEXT;
