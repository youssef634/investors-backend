/*
  Warnings:

  - You are about to drop the column `email` on the `investors` table. All the data in the column will be lost.
  - You are about to drop the column `profit` on the `investors` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phone]` on the table `investors` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `phone` to the `investors` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."WithdrawSource" AS ENUM ('AMOUNT', 'ROLLOVER');

-- DropIndex
DROP INDEX "public"."investors_email_key";

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "financialYearId" INTEGER,
ADD COLUMN     "periodName" TEXT,
ADD COLUMN     "withdrawSource" "public"."WithdrawSource",
ADD COLUMN     "year" INTEGER;

-- AlterTable
ALTER TABLE "public"."investors" DROP COLUMN "email",
DROP COLUMN "profit",
ADD COLUMN     "phone" TEXT NOT NULL,
ADD COLUMN     "rollover_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- DropEnum
DROP TYPE "public"."RolloverStatus";

-- CreateIndex
CREATE UNIQUE INDEX "investors_phone_key" ON "public"."investors"("phone");

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "public"."FinancialYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
