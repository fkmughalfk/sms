-- Prompt-payment discount (orders module, phase O6).
ALTER TABLE "Invoice" ADD COLUMN "promptDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "creditDays" INTEGER;

CREATE TYPE "DiscountStatus" AS ENUM ('ACTIVE', 'REVERSED');

CREATE TABLE "DiscountCredit" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "creditDate" DATE NOT NULL,
    "status" "DiscountStatus" NOT NULL DEFAULT 'ACTIVE',
    "reversedReason" TEXT,
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountCredit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscountCredit_invoiceId_key" ON "DiscountCredit"("invoiceId");
CREATE INDEX "DiscountCredit_partyId_idx" ON "DiscountCredit"("partyId");

ALTER TABLE "DiscountCredit" ADD CONSTRAINT "DiscountCredit_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscountCredit" ADD CONSTRAINT "DiscountCredit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
