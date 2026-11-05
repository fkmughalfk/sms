-- Rate lists (orders module, phase O1): dated market rates per product and crop year.
CREATE TYPE "RateBasis" AS ENUM ('PER_40KG', 'PER_UNIT');

CREATE TABLE "RateList" (
    "id" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateListItem" (
    "id" TEXT NOT NULL,
    "rateListId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "cropYear" TEXT NOT NULL DEFAULT '',
    "basis" "RateBasis" NOT NULL,
    "rate" DECIMAL(14,2),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "RateListItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateList_effectiveFrom_key" ON "RateList"("effectiveFrom");
CREATE UNIQUE INDEX "RateListItem_rateListId_productId_cropYear_key" ON "RateListItem"("rateListId", "productId", "cropYear");
CREATE INDEX "RateListItem_productId_idx" ON "RateListItem"("productId");

ALTER TABLE "RateListItem" ADD CONSTRAINT "RateListItem_rateListId_fkey" FOREIGN KEY ("rateListId") REFERENCES "RateList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RateListItem" ADD CONSTRAINT "RateListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
