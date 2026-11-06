-- Pending orders (orders module, phase O3): opening orders loaded at go-live keep what was
-- already dispatched; names from other software are mapped once and remembered.
ALTER TABLE "Order" ADD COLUMN "isOpening" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderLine" ADD COLUMN "openingDispatched" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "AliasKind" AS ENUM ('PRODUCT', 'PARTY', 'SALESPERSON');

CREATE TABLE "NameAlias" (
    "id" TEXT NOT NULL,
    "kind" "AliasKind" NOT NULL,
    "text" TEXT NOT NULL,
    "packKg" TEXT NOT NULL DEFAULT '',
    "targetId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NameAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NameAlias_kind_text_packKg_key" ON "NameAlias"("kind", "text", "packKg");
