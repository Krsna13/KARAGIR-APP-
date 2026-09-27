-- Migration: 20260929090000_add_summary_spoken.sql
-- Stage 6.6 follow-up: summary_spoken TEXT column was missing from the
-- listing preview migration but is used by PreviewStep and generated types.
-- Adding it here so saveDraft calls don't fail on the live database.
--
-- Not applied to a live database in this environment.

ALTER TABLE products ADD COLUMN IF NOT EXISTS summary_spoken TEXT;
