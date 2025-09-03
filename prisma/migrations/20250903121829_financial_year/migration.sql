-- CreateEnum
CREATE TYPE "public"."PeriodType" AS ENUM ('annual', 'quarterly', 'monthly', 'project', 'custom');

-- CreateEnum
CREATE TYPE "public"."ProfitSource" AS ENUM ('financial_statements', 'accounting_records', 'manual_calculation', 'other');

-- CreateEnum
CREATE TYPE "public"."Currency" AS ENUM ('IQD', 'USD');

-- CreateEnum
CREATE TYPE "public"."FinancialYearStatus" AS ENUM ('draft', 'active', 'calculated', 'approved', 'distributed', 'closed');

-- CreateEnum
CREATE TYPE "public"."RolloverStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateTable
CREATE TABLE "public"."FinancialYear" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "periodName" TEXT,
    "periodType" "public"."PeriodType" NOT NULL DEFAULT 'custom',
    "totalProfit" DOUBLE PRECISION NOT NULL,
    "profitPercentage" DOUBLE PRECISION,
    "totalRevenue" DOUBLE PRECISION,
    "operatingCosts" DOUBLE PRECISION,
    "administrativeCosts" DOUBLE PRECISION,
    "taxes" DOUBLE PRECISION,
    "otherExpenses" DOUBLE PRECISION,
    "profitSource" "public"."ProfitSource" NOT NULL DEFAULT 'manual_calculation',
    "currency" "public"."Currency" NOT NULL DEFAULT 'USD',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER,
    "dailyProfitRate" DOUBLE PRECISION,
    "status" "public"."FinancialYearStatus" NOT NULL DEFAULT 'draft',
    "rolloverEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloverPercentage" DOUBLE PRECISION DEFAULT 100,
    "autoRollover" BOOLEAN NOT NULL DEFAULT false,
    "autoRolloverDate" TIMESTAMP(3),
    "autoRolloverStatus" "public"."RolloverStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "distributedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "distributedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YearlyProfitDistribution" (
    "id" SERIAL NOT NULL,
    "financialYearId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "distributedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YearlyProfitDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialYear_periodName_key" ON "public"."FinancialYear"("periodName");

-- AddForeignKey
ALTER TABLE "public"."FinancialYear" ADD CONSTRAINT "FinancialYear_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancialYear" ADD CONSTRAINT "FinancialYear_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancialYear" ADD CONSTRAINT "FinancialYear_distributedById_fkey" FOREIGN KEY ("distributedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."YearlyProfitDistribution" ADD CONSTRAINT "YearlyProfitDistribution_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "public"."FinancialYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."YearlyProfitDistribution" ADD CONSTRAINT "YearlyProfitDistribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
