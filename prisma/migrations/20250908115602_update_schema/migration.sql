/*
  Warnings:

  - The values [calculated,distributed] on the enum `FinancialYearStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."FinancialYearStatus_new" AS ENUM ('PENDING', 'DISTRIBUTED');
ALTER TABLE "public"."FinancialYear" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."FinancialYear" ALTER COLUMN "status" TYPE "public"."FinancialYearStatus_new" USING ("status"::text::"public"."FinancialYearStatus_new");
ALTER TYPE "public"."FinancialYearStatus" RENAME TO "FinancialYearStatus_old";
ALTER TYPE "public"."FinancialYearStatus_new" RENAME TO "FinancialYearStatus";
DROP TYPE "public"."FinancialYearStatus_old";
ALTER TABLE "public"."FinancialYear" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "public"."FinancialYear" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "public"."YearlyProfitDistribution" ADD COLUMN     "dailyProfit" DOUBLE PRECISION DEFAULT 0;
