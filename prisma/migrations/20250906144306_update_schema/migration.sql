/*
  Warnings:

  - The values [draft,active,approved,closed] on the enum `FinancialYearStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `administrativeCosts` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `dailyProfitRate` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `operatingCosts` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `otherExpenses` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `periodType` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `profitPercentage` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `profitSource` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `taxes` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `totalRevenue` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `dailyProfit` on the `YearlyProfitDistribution` table. All the data in the column will be lost.
  - You are about to drop the column `distributedAt` on the `YearlyProfitDistribution` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `YearlyProfitDistribution` table. All the data in the column will be lost.
  - Added the required column `totalProfit` to the `YearlyProfitDistribution` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."FinancialYearStatus_new" AS ENUM ('calculated', 'distributed');
ALTER TABLE "public"."FinancialYear" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."FinancialYear" ALTER COLUMN "status" TYPE "public"."FinancialYearStatus_new" USING ("status"::text::"public"."FinancialYearStatus_new");
ALTER TYPE "public"."FinancialYearStatus" RENAME TO "FinancialYearStatus_old";
ALTER TYPE "public"."FinancialYearStatus_new" RENAME TO "FinancialYearStatus";
DROP TYPE "public"."FinancialYearStatus_old";
ALTER TABLE "public"."FinancialYear" ALTER COLUMN "status" SET DEFAULT 'calculated';
COMMIT;

-- AlterTable
ALTER TABLE "public"."FinancialYear" DROP COLUMN "administrativeCosts",
DROP COLUMN "dailyProfitRate",
DROP COLUMN "notes",
DROP COLUMN "operatingCosts",
DROP COLUMN "otherExpenses",
DROP COLUMN "periodType",
DROP COLUMN "profitPercentage",
DROP COLUMN "profitSource",
DROP COLUMN "taxes",
DROP COLUMN "totalRevenue",
DROP COLUMN "updatedAt",
ADD COLUMN     "dailyProfit" DOUBLE PRECISION,
ALTER COLUMN "status" SET DEFAULT 'calculated';

-- AlterTable
ALTER TABLE "public"."User" ALTER COLUMN "role" SET DEFAULT 'ADMIN';

-- AlterTable
ALTER TABLE "public"."YearlyProfitDistribution" DROP COLUMN "dailyProfit",
DROP COLUMN "distributedAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "totalProfit" DOUBLE PRECISION NOT NULL;

-- DropEnum
DROP TYPE "public"."PeriodType";

-- DropEnum
DROP TYPE "public"."ProfitSource";
