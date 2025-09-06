/*
  Warnings:

  - You are about to drop the column `autoRollover` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `autoRolloverDate` on the `FinancialYear` table. All the data in the column will be lost.
  - You are about to drop the column `autoRolloverStatus` on the `FinancialYear` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."FinancialYear" DROP COLUMN "autoRollover",
DROP COLUMN "autoRolloverDate",
DROP COLUMN "autoRolloverStatus";

-- AlterTable
ALTER TABLE "public"."YearlyProfitDistribution" ADD COLUMN     "isRollover" BOOLEAN NOT NULL DEFAULT false;
