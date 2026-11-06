-- Orders (orders module, phase O2): orders booked at rate-list rates, with lines and
-- the prompt-payment discount agreed per category. Settings gain the first order number.
ALTER TABLE "Setting" ADD COLUMN "firstOrderNo" INTEGER NOT NULL DEFAULT 1;

CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'PENDING', 'REJECTED', 'CANCELLED', 'CLOSED');

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "orderDate" DATE NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "partyId" TEXT NOT NULL,
    "subPartyId" TEXT,
    "cityId" TEXT,
    "salespersonId" TEXT,
    "rateListId" TEXT,
    "remarks" TEXT,
    "statusReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "totalPacks" INTEGER NOT NULL DEFAULT 0,
    "totalWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "cropYear" TEXT NOT NULL DEFAULT '',
    "basis" "RateBasis" NOT NULL,
    "listRate" DECIMAL(14,2),
    "rate" DECIMAL(14,2) NOT NULL,
    "packWeightKg" DECIMAL(10,3) NOT NULL,
    "packPcs" INTEGER NOT NULL,
    "qtyPacks" INTEGER NOT NULL,
    "ratePerPack" DECIMAL(14,4) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "weightKg" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderDiscount" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderDiscount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");
CREATE INDEX "Order_partyId_idx" ON "Order"("partyId");
CREATE INDEX "Order_salespersonId_idx" ON "Order"("salespersonId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE UNIQUE INDEX "OrderLine_orderId_lineNo_key" ON "OrderLine"("orderId", "lineNo");
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");
CREATE UNIQUE INDEX "OrderDiscount_orderId_categoryId_key" ON "OrderDiscount"("orderId", "categoryId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_subPartyId_fkey" FOREIGN KEY ("subPartyId") REFERENCES "SubParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Salesperson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_rateListId_fkey" FOREIGN KEY ("rateListId") REFERENCES "RateList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
