/*
  Warnings:

  - The `currency` column on the `FinancialYear` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."FinancialYear" DROP COLUMN "currency",
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'IQD';

-- DropEnum
DROP TYPE "public"."Currency";
