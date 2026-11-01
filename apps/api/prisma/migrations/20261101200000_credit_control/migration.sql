-- Credit control (Phase 2): company default credit days, per-party credit days and limit.
ALTER TABLE "Setting" ADD COLUMN "defaultCreditDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Party" ADD COLUMN "creditDays" INTEGER;
ALTER TABLE "Party" ADD COLUMN "creditLimit" DECIMAL(18,2);
