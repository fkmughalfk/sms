-- Invoices and payments are hard deleted from 2026-11-01 (CLAUDE.md rule 6).
-- Remove rows soft-deleted before that: they are hidden everywhere, but still
-- block master deletes and keep their invoice numbers reserved.
-- Invoice lines go with their invoice (ON DELETE CASCADE). The AuditLog is kept.
DELETE FROM "Invoice" WHERE "deletedAt" IS NOT NULL;
DELETE FROM "Payment" WHERE "deletedAt" IS NOT NULL;
