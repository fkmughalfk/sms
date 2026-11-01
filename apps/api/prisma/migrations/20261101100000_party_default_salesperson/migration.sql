-- A party's default ASM pre-fills new invoices (Phase 1 quick wins).
ALTER TABLE "Party" ADD COLUMN "salespersonId" TEXT;

ALTER TABLE "Party" ADD CONSTRAINT "Party_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Salesperson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
