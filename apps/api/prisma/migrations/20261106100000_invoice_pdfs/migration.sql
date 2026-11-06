-- Invoice PDFs (orders module, phase O4): invoices read from the current software's PDFs
-- reduce pending orders. Invoices gain the PDF's delivery fields; lines can be priced per
-- pack (ghee, spices) and carry a crop year.
ALTER TABLE "Setting" ADD COLUMN "ordersGoLiveDate" DATE;

ALTER TABLE "Invoice" ADD COLUMN "doNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "vehicleNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "dcNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ogpNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "supplyNote" TEXT;

ALTER TABLE "InvoiceLine" ADD COLUMN "rateBasis" "RateBasis" NOT NULL DEFAULT 'PER_40KG';
ALTER TABLE "InvoiceLine" ADD COLUMN "cropYear" TEXT NOT NULL DEFAULT '';

CREATE TYPE "PdfImportStatus" AS ENUM ('POSTED', 'NEEDS_REVIEW', 'DUPLICATE', 'FAILED');

CREATE TABLE "OrderAllocation" (
    "id" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "qtyPacks" INTEGER NOT NULL,

    CONSTRAINT "OrderAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PdfImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "status" "PdfImportStatus" NOT NULL,
    "invoiceNo" INTEGER,
    "parsed" JSONB NOT NULL,
    "problems" JSONB NOT NULL,
    "resolution" JSONB NOT NULL DEFAULT '{}',
    "invoiceId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfImport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAllocation_invoiceLineId_orderLineId_key" ON "OrderAllocation"("invoiceLineId", "orderLineId");
CREATE INDEX "OrderAllocation_orderLineId_idx" ON "OrderAllocation"("orderLineId");
CREATE UNIQUE INDEX "PdfImport_invoiceId_key" ON "PdfImport"("invoiceId");
CREATE INDEX "PdfImport_status_idx" ON "PdfImport"("status");
CREATE INDEX "PdfImport_invoiceNo_idx" ON "PdfImport"("invoiceNo");

ALTER TABLE "OrderAllocation" ADD CONSTRAINT "OrderAllocation_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderAllocation" ADD CONSTRAINT "OrderAllocation_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PdfImport" ADD CONSTRAINT "PdfImport_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
