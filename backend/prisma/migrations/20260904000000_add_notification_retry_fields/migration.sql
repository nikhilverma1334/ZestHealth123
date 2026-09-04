-- AlterTable: Add retryCount column to NotificationLog
-- This column was previously applied via `prisma db push` but never had a migration file.
-- This migration formalizes it so Codespaces and any fresh environment gets it correctly.
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;
