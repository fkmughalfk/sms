-- Payment slips (orders module, phase O5): the photo or screenshot behind a payment.
CREATE TYPE "SlipStatus" AS ENUM ('TO_CONFIRM', 'SAVED', 'REJECTED');

CREATE TABLE "PaymentSlip" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "status" "SlipStatus" NOT NULL,
    "partyId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "paymentId" TEXT,
    "rejectReason" TEXT,
    "uploadedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSlip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentSlip_paymentId_key" ON "PaymentSlip"("paymentId");
CREATE INDEX "PaymentSlip_status_idx" ON "PaymentSlip"("status");
CREATE INDEX "PaymentSlip_uploadedById_idx" ON "PaymentSlip"("uploadedById");

ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
