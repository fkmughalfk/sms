-- Salesman commission (docs/COMMISSION_SPEC.md): per-salesman category rates, the salesman
-- who earns on all sales, share rules, and who earns what on each invoice line.
ALTER TABLE "Salesperson" ADD COLUMN "earnsOnAllSales" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "CommissionBasis" AS ENUM ('OVERRIDE', 'SHARE', 'SALESMAN');

CREATE TABLE "SalespersonCommissionRate" (
    "id" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "rate" DECIMAL(8,6) NOT NULL,

    CONSTRAINT "SalespersonCommissionRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionShare" (
    "id" TEXT NOT NULL,
    "earnerId" TEXT NOT NULL,
    "matchPartySalespersonId" TEXT,
    "matchSubPartyId" TEXT,
    "rate" DECIMAL(8,6) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CommissionShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLineCommission" (
    "id" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "basis" "CommissionBasis" NOT NULL,
    "rate" DECIMAL(8,6) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "InvoiceLineCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalespersonCommissionRate_salespersonId_categoryId_key" ON "SalespersonCommissionRate"("salespersonId", "categoryId");
CREATE UNIQUE INDEX "InvoiceLineCommission_invoiceLineId_salespersonId_key" ON "InvoiceLineCommission"("invoiceLineId", "salespersonId");
CREATE INDEX "InvoiceLineCommission_salespersonId_idx" ON "InvoiceLineCommission"("salespersonId");

ALTER TABLE "SalespersonCommissionRate" ADD CONSTRAINT "SalespersonCommissionRate_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Salesperson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalespersonCommissionRate" ADD CONSTRAINT "SalespersonCommissionRate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionShare" ADD CONSTRAINT "CommissionShare_earnerId_fkey" FOREIGN KEY ("earnerId") REFERENCES "Salesperson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionShare" ADD CONSTRAINT "CommissionShare_matchPartySalespersonId_fkey" FOREIGN KEY ("matchPartySalespersonId") REFERENCES "Salesperson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionShare" ADD CONSTRAINT "CommissionShare_matchSubPartyId_fkey" FOREIGN KEY ("matchSubPartyId") REFERENCES "SubParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineCommission" ADD CONSTRAINT "InvoiceLineCommission_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineCommission" ADD CONSTRAINT "InvoiceLineCommission_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Salesperson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
