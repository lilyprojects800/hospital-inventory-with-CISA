-- CreateEnum
CREATE TYPE "Exposure" AS ENUM ('NONE', 'POSSIBLY_AFFECTED', 'AFFECTED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('POSSIBLY_AFFECTED', 'AFFECTED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('AFFECTED', 'UNDER_INVESTIGATION', 'FIXED', 'NOT_AFFECTED', 'UNLISTED');

-- CreateEnum
CREATE TYPE "RemediationCategory" AS ENUM ('VENDOR_FIX', 'WORKAROUND', 'MITIGATION', 'NO_FIX_PLANNED', 'NONE_AVAILABLE', 'OPTIONAL_PATCH', 'FIX_PLANNED');

-- CreateEnum
CREATE TYPE "RemediationLevel" AS ENUM ('NO_REMEDIATION', 'MITIGATION_ONLY', 'VENDOR_FIX');

-- AlterTable
ALTER TABLE "asset" ADD COLUMN     "advisoryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "exposure" "Exposure" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "maxSeverity" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "remediation" "RemediationLevel";

-- CreateTable
CREATE TABLE "advisory" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "csafUrl" TEXT NOT NULL,
    "csafPath" TEXT NOT NULL,
    "severity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "summary" TEXT,
    "revision" TEXT NOT NULL,
    "revisionSummary" TEXT,
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "revisedAt" TIMESTAMP(3) NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisory_product" (
    "id" TEXT NOT NULL,
    "advisoryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "versionSpec" TEXT,
    "status" "ProductStatus" NOT NULL,

    CONSTRAINT "advisory_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability" (
    "id" TEXT NOT NULL,
    "advisoryId" TEXT NOT NULL,
    "cve" TEXT,
    "title" TEXT,
    "cwe" TEXT,
    "summary" TEXT,
    "cvssScore" DOUBLE PRECISION,
    "cvssSeverity" TEXT,
    "cvssVector" TEXT,
    "productIds" TEXT[],

    CONSTRAINT "vulnerability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remediation" (
    "id" TEXT NOT NULL,
    "advisoryId" TEXT NOT NULL,
    "category" "RemediationCategory" NOT NULL,
    "details" TEXT NOT NULL,
    "url" TEXT,
    "productIds" TEXT[],

    CONSTRAINT "remediation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_advisory_match" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "advisoryId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "matchedProductIds" TEXT[],
    "severity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remediation" "RemediationLevel" NOT NULL,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_advisory_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastChanged" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "advisory_csafPath_key" ON "advisory"("csafPath");

-- CreateIndex
CREATE INDEX "advisory_revisedAt_idx" ON "advisory"("revisedAt");

-- CreateIndex
CREATE INDEX "advisory_product_status_idx" ON "advisory_product"("status");

-- CreateIndex
CREATE UNIQUE INDEX "advisory_product_advisoryId_productId_key" ON "advisory_product"("advisoryId", "productId");

-- CreateIndex
CREATE INDEX "vulnerability_advisoryId_idx" ON "vulnerability"("advisoryId");

-- CreateIndex
CREATE INDEX "remediation_advisoryId_idx" ON "remediation"("advisoryId");

-- CreateIndex
CREATE INDEX "asset_advisory_match_advisoryId_idx" ON "asset_advisory_match"("advisoryId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_advisory_match_assetId_advisoryId_key" ON "asset_advisory_match"("assetId", "advisoryId");

-- CreateIndex
CREATE INDEX "asset_exposure_maxSeverity_idx" ON "asset"("exposure", "maxSeverity");

-- AddForeignKey
ALTER TABLE "advisory_product" ADD CONSTRAINT "advisory_product_advisoryId_fkey" FOREIGN KEY ("advisoryId") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability" ADD CONSTRAINT "vulnerability_advisoryId_fkey" FOREIGN KEY ("advisoryId") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remediation" ADD CONSTRAINT "remediation_advisoryId_fkey" FOREIGN KEY ("advisoryId") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_advisory_match" ADD CONSTRAINT "asset_advisory_match_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_advisory_match" ADD CONSTRAINT "asset_advisory_match_advisoryId_fkey" FOREIGN KEY ("advisoryId") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
